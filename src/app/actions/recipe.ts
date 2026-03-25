"use server";
import * as cheerio from 'cheerio';

// Extract text from Sanity portable text blocks (used by madewithlau, etc.)
function extractSanityText(blocks: any[]): string {
  if (!Array.isArray(blocks)) return '';
  return blocks
    .filter((b: any) => b.children)
    .map((b: any) => b.children.map((c: any) => c.text || '').join(''))
    .join(' ')
    .trim();
}

// Flatten HowToSection / HowToStep instructions into a flat string array
function flattenInstructions(steps: any[]): string[] {
  const result: string[] = [];
  for (const step of steps) {
    if (step['@type'] === 'HowToSection' && Array.isArray(step.itemListElement)) {
      for (const sub of step.itemListElement) {
        const text = (sub.text || '').trim();
        if (text) result.push(text);
      }
    } else {
      const text = (step.text || (typeof step === 'string' ? step : '')).trim();
      if (text) result.push(text);
    }
  }
  return result;
}

function isUrlSafe(input: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const hostname = parsed.hostname.toLowerCase();
  // Block private/internal ranges and metadata endpoints
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') return false;
  if (hostname.endsWith('.local') || hostname.endsWith('.internal')) return false;
  if (hostname === '169.254.169.254') return false; // Cloud metadata
  if (hostname === 'metadata.google.internal') return false;
  // Block private IP ranges
  const parts = hostname.split('.').map(Number);
  if (parts.length === 4 && parts.every(n => !isNaN(n))) {
    if (parts[0] === 10) return false;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
    if (parts[0] === 192 && parts[1] === 168) return false;
    if (parts[0] === 0) return false;
  }
  return true;
}

export async function fetchRecipeFromUrl(url: string) {
  try {
    if (!isUrlSafe(url)) {
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

    let recipeData: any = null;

    let titleRaw = $('meta[property="og:title"]').attr('content') || $('h1').first().text().trim() || 'Unknown Recipe';
    let title = titleRaw.split(' - ')[0].split(' | ')[0].trim();

    let image = '';
    let ingredients: string[] = [];
    let instructions: string[] = [];

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

    return { success: true, recipe: { title, ingredients, instructions, image, sourceUrl: url } };

  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
