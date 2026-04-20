const cheerio = require('cheerio');

const urls = [
  'https://foodiefiber.com/spicy-garlic-shrimp-pasta-with-burst-tomatoes/?utm_source=Pinterest&utm_medium=organic#google_vignette',
  'https://www.inspiredtaste.net/7179/sweet-and-spicy-oven-baked-ribs/'
];

async function fetchRecipeFromUrl(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
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
            recipeData = item;
            break;
          }
        }
      } catch (e) {}
    });

    let title = recipeData?.name || $('h1').first().text().trim() || 'Unknown Recipe';
    let image = '';
    
    if (recipeData?.image) {
      if (typeof recipeData.image === 'string') image = recipeData.image;
      else if (Array.isArray(recipeData.image)) image = recipeData.image[0];
      else if (recipeData.image.url) image = recipeData.image.url;
    } else {
      image = $('meta[property="og:image"]').attr('content') || '';
    }

    let ingredients = recipeData?.recipeIngredient || [];
    let instructions = [];

    if (Array.isArray(recipeData?.recipeInstructions)) {
      instructions = recipeData.recipeInstructions.map(step => step.text || step).filter(Boolean);
    } else if (typeof recipeData?.recipeInstructions === 'string') {
      instructions = [recipeData.recipeInstructions];
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

    if (ingredients.length === 0 && instructions.length === 0) {
       throw new Error("Could not extract ingredients. DOM Fallback missed as well.");
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
