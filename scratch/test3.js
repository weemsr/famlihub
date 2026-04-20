const cheerio = require('cheerio');

const urls = [
  'https://foodiefiber.com/spicy-garlic-shrimp-pasta-with-burst-tomatoes/?utm_source=Pinterest&utm_medium=organic#google_vignette',
  'https://www.inspiredtaste.net/7179/sweet-and-spicy-oven-baked-ribs/'
];

async function fetchRecipeFromUrl(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    
    if (!res.ok) throw new Error('Failed to load recipe page.');
    const html = await res.text();
    const $ = cheerio.load(html);

    let recipeData = null;

    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const text = $(el).html() || '';
        const json = JSON.parse(text);
        const items = Array.isArray(json) ? json : (json['@graph'] ? json['@graph'] : [json]);
        for (const item of items) {
          if (item['@type'] === 'Recipe' || (Array.isArray(item['@type']) && item['@type'].includes('Recipe'))) {
            recipeData = item; break;
          }
        }
      } catch (e) {} 
    });

    let title = recipeData?.name || $('h1').first().text().trim() || 'Unknown Recipe';
    let ingredients = recipeData?.recipeIngredient || [];
    let instructions = [];

    if (Array.isArray(recipeData?.recipeInstructions)) {
      instructions = recipeData.recipeInstructions.map(step => step.text || step).filter(Boolean);
    } else if (typeof recipeData?.recipeInstructions === 'string') {
      instructions = [recipeData.recipeInstructions];
    }

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
           instructions = parsed.map(p => p.text || p).filter(Boolean);
         } catch(e) {}
      }
    }

    if (ingredients.length === 0) {
      $('.wprm-recipe-ingredient, .tasty-recipes-ingredient, .rc-ingredients li, .mv-create-ingredients li').each((_, el) => {
         const t = $(el).text().replace(/\s+/g, ' ').trim();
         if (t) ingredients.push(t);
      });
    }

    if (instructions.length === 0) {
      $('.wprm-recipe-instruction, .tasty-recipes-instruction, .rc-instructions li, .mv-create-instructions li').each((_, el) => {
         const t = $(el).text().replace(/\s+/g, ' ').trim();
         if (t) instructions.push(t);
      });
    }

    if (ingredients.length === 0) {
      $('ul, ol').each((_, el) => {
        const lis = $(el).find('> li');
        if (lis.length > 2 && ingredients.length === 0) {
          const sampleMatch = $(el).text().toLowerCase();
          if (/(cup|tablespoon|teaspoon|tbsp|tsp|oz|ounce|pound|lb|clove|pinch|g|ml)s?\b/.test(sampleMatch)) {
            lis.each((_, li) => ingredients.push($(li).text().replace(/\s+/g, ' ').trim()));
          }
        }
      });
    }

    if (instructions.length === 0 && ingredients.length > 0) {
       $('ol').each((_, el) => {
          const lis = $(el).find('> li');
          if (lis.length > 2 && instructions.length === 0) {
             lis.each((_, li) => instructions.push($(li).text().replace(/\s+/g, ' ').trim()));
          }
       });
       if (instructions.length === 0) {
          $('h2, h3').each((_, el) => {
             if ($(el).text().toLowerCase().includes('instruction') || $(el).text().toLowerCase().includes('direction')) {
               let next = $(el).next();
               while (next.length && !next.is('h2, h3')) {
                  const t = next.text().replace(/\s+/g, ' ').trim();
                  if (t.length > 20) instructions.push(t);
                  next = next.next();
               }
             }
          });
       }
    }

    if (ingredients.length === 0 && instructions.length === 0) {
       throw new Error("Could not extract ingredients.");
    }

    return { success: true, recipe: { title, ingredientsCount: ingredients.length, instructionsCount: instructions.length } };

  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function start() {
  for (const url of urls) {
    console.log(`Testing: ${url}`);
    console.log(await fetchRecipeFromUrl(url));
    console.log('---');
  }
}
start();
