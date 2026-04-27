"use server";
import * as cheerio from 'cheerio';
import { promises as dns } from 'node:dns';
import { safeImageUrl, safeHttpUrl } from '@/lib/url';
import { parseRecipeYield } from '@/lib/recipe-scale';

// Narrow types for the shapes we read out of scraped JSON. The scraper
// traverses untyped JSON-LD / Next.js data, so we keep these loose but
// documented rather than pretending the input is typed.
type SanityChild = { text?: string };
type SanityBlock = { children?: SanityChild[] };
type HowToStep = { '@type'?: string; text?: string; itemListElement?: HowToStep[] } | string;

// Extract text from Sanity portable text blocks (used by madewithlau, etc.)
function extractSanityText(blocks: unknown): string {
  if (!Array.isArray(blocks)) return '';
  return (blocks as SanityBlock[])
    .filter(b => Array.isArray(b?.children))
    .map(b => (b.children as SanityChild[]).map(c => c.text || '').join(''))
    .join(' ')
    .trim();
}

// Flatten HowToSection / HowToStep instructions into a flat string array
function flattenInstructions(steps: HowToStep[]): string[] {
  const result: string[] = [];
  for (const step of steps) {
    if (typeof step === 'string') {
      const text = step.trim();
      if (text) result.push(text);
      continue;
    }
    if (step['@type'] === 'HowToSection' && Array.isArray(step.itemListElement)) {
      for (const sub of step.itemListElement) {
        const text = (typeof sub === 'string' ? sub : sub.text || '').trim();
        if (text) result.push(text);
      }
    } else {
      const text = (step.text || '').trim();
      if (text) result.push(text);
    }
  }
  return result;
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => isNaN(n) || n < 0 || n > 255)) return true; // malformed → reject
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local + AWS metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA
  if (lower.startsWith('fe80:')) return true; // link-local
  if (lower.startsWith('ff')) return true; // multicast
  // IPv4-mapped (::ffff:a.b.c.d)
  const mapped = lower.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

function isPrivateAddress(ip: string): boolean {
  return ip.includes(':') ? isPrivateIPv6(ip) : isPrivateIPv4(ip);
}

function isHostnameBlocked(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '[::1]') return true;
  if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) return true;
  if (h === 'metadata.google.internal') return true;
  return false;
}

/**
 * SSRF guard. Rejects the URL if:
 *   - protocol is not http/https
 *   - hostname matches a known-local suffix
 *   - the hostname resolves to any private/loopback/link-local address
 *
 * DNS is resolved here so a hostile domain that points at 127.0.0.1 (DNS
 * rebinding) is blocked *before* we fetch. Even if the TTL is 0 and the
 * name re-resolves during fetch, that's a narrow race on a Node fetch that
 * has a 15s abort timeout.
 */
async function isUrlSafe(input: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const hostname = parsed.hostname.toLowerCase();
  if (isHostnameBlocked(hostname)) return false;

  // Literal IP → check directly, skip DNS.
  const isLiteralIP = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':');
  if (isLiteralIP) {
    return !isPrivateAddress(hostname);
  }

  // Hostname → resolve and reject if any resolved address is private.
  try {
    const addrs = await dns.lookup(hostname, { all: true, verbatim: true });
    if (addrs.length === 0) return false;
    for (const { address } of addrs) {
      if (isPrivateAddress(address)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function fetchRecipeFromUrl(url: string) {
  try {
    if (!(await isUrlSafe(url))) {
      return { success: false, error: 'Invalid or blocked URL. Only public http/https URLs are allowed.' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      },
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error('Failed to load recipe page.');
    const html = await res.text();
    const $ = cheerio.load(html);

    // Scraper internals traverse deeply untyped JSON from arbitrary sites;
    // keep this `any` and validate at the module boundary (sanitized return).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let recipeData: any = null;

    let titleRaw = $('meta[property="og:title"]').attr('content') || $('h1').first().text().trim() || 'Unknown Recipe';
    let title = titleRaw.split(' - ')[0].split(' | ')[0].trim();

    let image = '';
    let ingredients: string[] = [];
    let instructions: string[] = [];
    let servings: number | undefined;

    // 0. Try Next.js __NEXT_DATA__ SSR JSON interception (madewithlau, etc.)
    const nextDataStr = $('#__NEXT_DATA__').html();
    if (nextDataStr) {
      try {
        const nextData = JSON.parse(nextDataStr);
        let found = false;
        const searchDeep = (obj: any) => {
           if (found) return;
           if (!obj || typeof obj !== 'object') return;
           if (obj.ingredientsArray && obj.instructionsArray) {
              servings = servings ?? parseRecipeYield(obj.servings ?? obj.yields ?? obj.yield);
              // Handle ingredient sections (madewithlau format: mix of section headers and ingredients)
              ingredients = obj.ingredientsArray
                .filter((i: any) => i._type !== 'ingredientSection' && i.item)
                .map((i: any) => {
                  const parts = [i.amount, i.unit, i.item].filter(Boolean);
                  if (i.purpose) parts.push(`(${i.purpose})`);
                  return parts.join(' ').trim();
                })
                .filter(Boolean);

              // Extract instructions from Sanity portable text blocks
              instructions = obj.instructionsArray.map((i: any) => {
                 const desc = i.freeformDescription ? extractSanityText(i.freeformDescription) : '';
                 if (desc) return desc;
                 if (i.headline) return i.headline;
                 return "";
              }).filter(Boolean);

              titleRaw = obj.englishTitle || obj.title || titleRaw;
              title = titleRaw.split(' - ')[0].split(' | ')[0].trim();
              if (obj.mainImage1x1?.asset?.url) image = obj.mainImage1x1.asset.url;
              else if (obj.mainImage?.asset?.url) image = obj.mainImage.asset.url;
              found = true;
              return;
           }
           // Also look for recipeIngredient / recipeInstructions in NEXT_DATA (some sites embed JSON-LD-like data)
           if (obj.recipeIngredient && Array.isArray(obj.recipeIngredient) && obj.recipeIngredient.length > 0) {
              servings = servings ?? parseRecipeYield(obj.recipeYield ?? obj.yield);
              ingredients = obj.recipeIngredient;
              if (Array.isArray(obj.recipeInstructions)) {
                instructions = flattenInstructions(obj.recipeInstructions);
              }
              titleRaw = obj.name || obj.title || titleRaw;
              title = titleRaw.split(' - ')[0].split(' | ')[0].trim();
              if (obj.image) {
                image = typeof obj.image === 'string' ? obj.image : (Array.isArray(obj.image) ? obj.image[0] : obj.image?.url || '');
              }
              found = true;
              return;
           }
           Object.values(obj).forEach(searchDeep);
        };
        searchDeep(nextData);
      } catch(e) {}
    }

    // 1. Try standard JSON-LD Schema.org parsing
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const text = $(el).html() || '';
        // Handle HTML entities in JSON-LD (some sites encode &amp; etc.)
        const cleaned = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        const json = JSON.parse(cleaned);
        const items = Array.isArray(json) ? json : (json['@graph'] ? json['@graph'] : [json]);
        for (const item of items) {
          if (item['@type'] === 'Recipe' || (Array.isArray(item['@type']) && item['@type'].includes('Recipe'))) {
            recipeData = item; break;
          }
        }
      } catch (e) {}
    });

    // Only override from JSON-LD if we didn't already get data from __NEXT_DATA__
    if (recipeData) {
      titleRaw = recipeData.name || titleRaw;
      title = titleRaw.split(' - ')[0].split(' | ')[0].trim();
      servings = servings ?? parseRecipeYield(recipeData.recipeYield ?? recipeData.yield);
    }

    if (recipeData?.image && !image) {
      if (typeof recipeData.image === 'string') {
        image = recipeData.image;
      } else if (Array.isArray(recipeData.image)) {
        const firstImg = recipeData.image[0];
        image = typeof firstImg === 'string' ? firstImg : (firstImg?.url || '');
      } else if (recipeData.image.url) {
        image = recipeData.image.url;
      }
    }
    if (!image) {
      image = $('meta[property="og:image"]').attr('content') || '';
    }

    if (ingredients.length === 0) {
      ingredients = recipeData?.recipeIngredient || [];
    }
    if (instructions.length === 0) {
      if (Array.isArray(recipeData?.recipeInstructions)) {
        instructions = flattenInstructions(recipeData.recipeInstructions);
      } else if (typeof recipeData?.recipeInstructions === 'string') {
        instructions = [recipeData.recipeInstructions];
      }
    }

    // 1.5 Try dirty regex extraction to bypass JSON.parse crashing on corrupt JSON-LD (e.g. inspiredtaste)
    if (ingredients.length === 0) {
      const ingMatch = html.match(/"recipeIngredient"\s*:\s*\[([\s\S]*?)\]/i);
      if (ingMatch) {
         try { ingredients = JSON.parse(`[${ingMatch[1]}]`); } catch(e) {}
      }
    }
    if (instructions.length === 0) {
      const instMatch = html.match(/"recipeInstructions"\s*:\s*\[([\s\S]*?)\]/i);
      if (instMatch) {
         try {
           const parsed = JSON.parse(`[${instMatch[1]}]`);
           instructions = parsed.map((p: any) => p.text || p).filter(Boolean);
         } catch(e) {}
      }
    }

    // 2. Fallback HTML DOM parsing for WP blogs missing standard Schema.org Recipe arrays
    if (ingredients.length === 0) {
      $('.wprm-recipe-ingredient, .tasty-recipes-ingredient, .rc-ingredients li, .mv-create-ingredients li').each((_, el) => {
         const t = $(el).text().replace(/\s+/g, ' ').trim();
         if (t) { ingredients.push(t); }
      });
    }

    if (instructions.length === 0) {
      $('.wprm-recipe-instruction, .tasty-recipes-instruction, .rc-instructions li, .mv-create-instructions li').each((_, el) => {
         const t = $(el).text().replace(/\s+/g, ' ').trim();
         if (t) { instructions.push(t); }
      });
    }

    // 3. DEEP NLP Heuristic Fallback (e.g. foodiefiber using generic dynamic blocks)
    if (ingredients.length === 0) {
      $('ul, ol').each((_, el) => {
        const lis = $(el).find('> li');
        if (lis.length > 2 && ingredients.length === 0) {
          const sampleMatch = $(el).text().toLowerCase();
          if (/\b(cup|tablespoon|teaspoon|tbsp|tsp|oz|ounce|pound|lb|clove|pinch|gram|ml)s?\b/.test(sampleMatch)) {
            lis.each((_, li) => { ingredients.push($(li).text().replace(/\s+/g, ' ').trim()); });
          }
        }
      });
    }

    if (instructions.length === 0 && ingredients.length > 0) {
       $('ol').each((_, el) => {
          const lis = $(el).find('> li');
          if (lis.length > 2 && instructions.length === 0) {
             lis.each((_, li) => { instructions.push($(li).text().replace(/\s+/g, ' ').trim()); });
          }
       });
       if (instructions.length === 0) {
          $('h2, h3').each((_, el) => {
             if ($(el).text().toLowerCase().includes('instruction') || $(el).text().toLowerCase().includes('direction')) {
               let next = $(el).next();
               while (next.length && !next.is('h2, h3')) {
                  const t = next.text().replace(/\s+/g, ' ').trim();
                  if (t.length > 20) { instructions.push(t); }
                  next = next.next();
               }
             }
          });
       }
    }

    if (ingredients.length === 0 && instructions.length === 0) {
       throw new Error("Could not extract ingredients. The site might be using an unconventional layout or blocking automated analysis.");
    }

    // Sanitize URLs before they enter client state. `image` comes from
    // scraped pages and could be javascript:/data:/file:; `url` was
    // already validated by isUrlSafe above but we still normalize.
    const safeImage = safeImageUrl(image) || '';
    const safeSource = safeHttpUrl(url) || '';

    return { success: true, recipe: { title, ingredients, instructions, image: safeImage, sourceUrl: safeSource, servings } };

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to import recipe.';
    return { success: false, error: message };
  }
}
