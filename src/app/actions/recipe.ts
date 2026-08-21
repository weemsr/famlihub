"use server";
import * as cheerio from 'cheerio';
import { promises as dns } from 'node:dns';
import { safeImageUrl, safeHttpUrl } from '@/lib/url';
import { parseRecipeYield } from '@/lib/recipe-scale';
import { asStringArray } from '@/lib/types';
import { LIMITS, capLen } from '@/lib/limits';
import { harvestIngredientLists } from '@/lib/recipe-extract';
import { cleanRecipeLine } from '@/lib/html';

/**
 * Normalize a scraped list into bounded string lines. The extraction paths
 * below hand back whatever the page had — objects, nested arrays, thousands of
 * swept-up <li> nodes — so this is the boundary where it becomes storable.
 */
function toSafeLines(value: unknown): string[] {
  return asStringArray(value)
    .slice(0, LIMITS.list)
    .map(line => capLen(cleanRecipeLine(line), LIMITS.line))
    .filter(Boolean);
}

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

// Sanity CMS recipe shapes (madewithlau). Used by both the legacy
// __NEXT_DATA__ path and the App-Router RSC flight-payload path below.
interface SanityIngredient {
  _type?: string;
  section?: string;
  title?: string;
  amount?: number | string;
  unit?: string;
  item?: string;
  purpose?: string;
}
interface SanityInstruction { freeformDescription?: unknown; headline?: string }

/**
 * Format a Sanity ingredientsArray into display lines. Section headers become
 * "Name:" lines so grouped lists (marinade vs. sauce) stay readable instead of
 * collapsing into an unlabeled run of near-duplicate ingredients.
 */
function mapSanityIngredients(arr: unknown[]): string[] {
  const out: string[] = [];
  for (const raw of arr) {
    const i = raw as SanityIngredient;
    if (!i || typeof i !== 'object') continue;
    if (i._type === 'ingredientSection') {
      const label = (i.section || i.title || '').trim();
      if (label) out.push(`${label}:`);
      continue;
    }
    if (!i.item) continue;
    const parts = [i.amount, i.unit, i.item].filter(Boolean);
    if (i.purpose) parts.push(`(${i.purpose})`);
    const line = parts.join(' ').trim();
    if (line) out.push(line);
  }
  return out;
}

function mapSanityInstructions(arr: unknown[]): string[] {
  return arr
    .map(raw => {
      const i = raw as SanityInstruction;
      const desc = i?.freeformDescription ? extractSanityText(i.freeformDescription) : '';
      return desc || i?.headline || '';
    })
    .filter(Boolean);
}

/**
 * Extract a balanced JSON array value for `"key":[...]` out of a larger text
 * blob, respecting strings and escapes. Used to mine recipe data out of the
 * Next.js App Router RSC flight payload, which is not one parseable JSON doc.
 */
function extractJsonArray(source: string, key: string): unknown[] | null {
  const start = source.indexOf(`"${key}":[`);
  if (start < 0) return null;
  const open = source.indexOf('[', start);
  let depth = 0, inStr = false, esc = false;
  for (let j = open; j < source.length; j++) {
    const ch = source[j];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { if (inStr) esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(source.slice(open, j + 1));
          return Array.isArray(parsed) ? parsed : null;
        } catch { return null; }
      }
    }
  }
  return null;
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

    // Follow redirects manually so every hop is re-validated by isUrlSafe —
    // with redirect:'follow' a hostile page could 302 to a private/metadata
    // address after the initial URL passed the guard.
    const FETCH_HEADERS = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
    };
    let currentUrl = url;
    let res: Response | null = null;
    for (let hop = 0; hop <= 3; hop++) {
      const attempt = await fetch(currentUrl, {
        headers: FETCH_HEADERS,
        cache: 'no-store',
        redirect: 'manual',
        signal: controller.signal,
      });
      if (![301, 302, 303, 307, 308].includes(attempt.status)) {
        res = attempt;
        break;
      }
      const location = attempt.headers.get('location');
      if (!location) throw new Error('The site sent a redirect with no destination.');
      if (hop === 3) throw new Error('Too many redirects on this link.');
      const nextUrl = new URL(location, currentUrl).toString();
      if (!(await isUrlSafe(nextUrl))) {
        throw new Error('This link redirects to a blocked address.');
      }
      currentUrl = nextUrl;
    }
    if (!res) throw new Error('Failed to load recipe page.');

    if (!res.ok) {
      clearTimeout(timeout);
      throw new Error(
        `The site returned an error for this page (HTTP ${res.status}). ` +
        'The recipe may have moved — open the link in your browser to check it still works, then re-copy the URL.'
      );
    }

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      clearTimeout(timeout);
      throw new Error("That link isn't a web page, so there's no recipe to read from it.");
    }

    // Cap the body read so a hostile/misconfigured site can't stream an
    // arbitrarily large response into memory.
    const MAX_BYTES = 5 * 1024 * 1024;
    let html = '';
    if (res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > MAX_BYTES) {
          controller.abort();
          clearTimeout(timeout);
          throw new Error('This page is too large to import (over 5 MB).');
        }
        html += decoder.decode(value, { stream: true });
      }
      html += decoder.decode();
    } else {
      html = await res.text();
    }
    clearTimeout(timeout);
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
        const searchDeep = (raw: unknown) => {
           if (found) return;
           if (!raw || typeof raw !== 'object') return;
           const obj = raw as Record<string, unknown>;
           if (Array.isArray(obj.ingredientsArray) && Array.isArray(obj.instructionsArray)) {
              servings = servings ?? parseRecipeYield(obj.servings ?? obj.yields ?? obj.yield);
              ingredients = mapSanityIngredients(obj.ingredientsArray);
              instructions = mapSanityInstructions(obj.instructionsArray);

              if (typeof obj.englishTitle === 'string' && obj.englishTitle) titleRaw = obj.englishTitle;
              else if (typeof obj.title === 'string' && obj.title) titleRaw = obj.title;
              title = titleRaw.split(' - ')[0].split(' | ')[0].trim();
              const img1x1 = (obj.mainImage1x1 as { asset?: { url?: string } } | undefined)?.asset?.url;
              const imgMain = (obj.mainImage as { asset?: { url?: string } } | undefined)?.asset?.url;
              if (img1x1) image = img1x1;
              else if (imgMain) image = imgMain;
              found = true;
              return;
           }
           // Also look for recipeIngredient / recipeInstructions in NEXT_DATA (some sites embed JSON-LD-like data)
           if (Array.isArray(obj.recipeIngredient) && obj.recipeIngredient.length > 0) {
              servings = servings ?? parseRecipeYield(obj.recipeYield ?? obj.yield);
              ingredients = obj.recipeIngredient.filter((x): x is string => typeof x === 'string');
              if (Array.isArray(obj.recipeInstructions)) {
                instructions = flattenInstructions(obj.recipeInstructions as HowToStep[]);
              }
              if (typeof obj.name === 'string' && obj.name) titleRaw = obj.name;
              else if (typeof obj.title === 'string' && obj.title) titleRaw = obj.title;
              title = titleRaw.split(' - ')[0].split(' | ')[0].trim();
              if (obj.image) {
                if (typeof obj.image === 'string') image = obj.image;
                else if (Array.isArray(obj.image) && typeof obj.image[0] === 'string') image = obj.image[0];
                else if (typeof (obj.image as { url?: unknown }).url === 'string') image = (obj.image as { url: string }).url;
              }
              found = true;
              return;
           }
           Object.values(obj).forEach(searchDeep);
        };
        searchDeep(nextData);
      } catch {}
    }

    // 0.5 Next.js App Router RSC flight payload (madewithlau after their
    // app-router migration removed __NEXT_DATA__). The Sanity recipe object is
    // still embedded in self.__next_f.push chunks; reassemble them and mine
    // ingredientsArray/instructionsArray out. Preferred over JSON-LD for these
    // sites because it carries the clean englishTitle and section labels.
    if (ingredients.length === 0) {
      const flightChunks: string[] = [];
      $('script').each((_, el) => {
        const t = $(el).html() || '';
        const rx = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
        let fm: RegExpExecArray | null;
        while ((fm = rx.exec(t))) {
          try { flightChunks.push(JSON.parse(`"${fm[1]}"`)); } catch {}
        }
      });
      if (flightChunks.length > 0) {
        const flight = flightChunks.join('');
        const ingArr = extractJsonArray(flight, 'ingredientsArray');
        if (ingArr && ingArr.length > 0) {
          const mapped = mapSanityIngredients(ingArr);
          if (mapped.length > 0) {
            ingredients = mapped;
            const instArr = extractJsonArray(flight, 'instructionsArray');
            if (instArr) instructions = mapSanityInstructions(instArr);
            const tm = flight.match(/"englishTitle":"((?:[^"\\]|\\.)*)"/);
            if (tm) {
              try {
                titleRaw = JSON.parse(`"${tm[1]}"`);
                title = titleRaw.split(' - ')[0].split(' | ')[0].trim();
              } catch {}
            }
            const sv = flight.match(/"servings":(\d+)/);
            if (sv) servings = servings ?? parseInt(sv[1], 10);
          }
        }
      }
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
      } catch {}
    });

    // Only take the JSON-LD title when no earlier path (NEXT_DATA / RSC)
    // already extracted the recipe — those carry cleaner titles (englishTitle)
    // that the JSON-LD marketing name would otherwise clobber.
    if (recipeData) {
      if (ingredients.length === 0) {
        titleRaw = recipeData.name || titleRaw;
        title = titleRaw.split(' - ')[0].split(' | ')[0].trim();
      }
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
         try { ingredients = JSON.parse(`[${ingMatch[1]}]`); } catch {}
      }
    }
    if (instructions.length === 0) {
      const instMatch = html.match(/"recipeInstructions"\s*:\s*\[([\s\S]*?)\]/i);
      if (instMatch) {
         try {
           const parsed = JSON.parse(`[${instMatch[1]}]`) as Array<string | { text?: string }>;
           instructions = parsed
             .map(p => (typeof p === 'string' ? p : p?.text || ''))
             .filter(Boolean);
         } catch {}
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

    // 3. Heuristic fallback for pages with no structured recipe data at all
    //    (e.g. foodiefiber, which publishes only schema.org Article).
    if (ingredients.length === 0) {
      ingredients = harvestIngredientLists($);
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

    // Bound everything before it leaves the server. `ingredients` and
    // `instructions` are assigned from untyped scraped JSON above, so they can
    // hold objects or unbounded runs of swept-up DOM text.
    const safeTitle = capLen(cleanRecipeLine(title), LIMITS.title) || 'Untitled Recipe';
    const safeIngredients = toSafeLines(ingredients);
    const safeInstructions = toSafeLines(instructions);

    if (safeIngredients.length === 0 && safeInstructions.length === 0) {
      throw new Error("Could not extract ingredients. The site might be using an unconventional layout or blocking automated analysis.");
    }

    return {
      success: true,
      recipe: {
        title: safeTitle,
        ingredients: safeIngredients,
        instructions: safeInstructions,
        image: safeImage,
        sourceUrl: safeSource,
        servings,
      },
    };

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to import recipe.';
    return { success: false, error: message };
  }
}
