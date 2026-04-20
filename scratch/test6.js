const cheerio = require('cheerio');

async function testFetch() {
  const url = 'https://www.foodnetwork.com/recipes/food-network-kitchen/the-best-chicken-noodle-soup-7194859';
  console.log("Fetching: " + url);
  
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

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

    let title = recipeData?.name || $('meta[property="og:title"]').attr('content') || $('h1').first().text().trim() || 'Unknown Recipe';
    
    let image = '';
    if (recipeData?.image) {
      if (typeof recipeData.image === 'string') image = recipeData.image;
      else if (Array.isArray(recipeData.image)) image = recipeData.image[0] || '';
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

    console.log({ title, ingredients, instructions, image });
  } catch(e) { console.error(e); }
}
testFetch();
