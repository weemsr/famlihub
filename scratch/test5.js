const cheerio = require('cheerio');

async function testFetch() {
  const url = 'https://www.foodnetwork.com/recipes/food-network-kitchen/the-best-chicken-noodle-soup-7194859';
  console.log("Fetching: " + url);
  
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });

    console.log("Status: " + res.status);
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

    console.log("JSON-LD Recipe Data Found: " + !!recipeData);
    if (recipeData) {
      console.log("Title: " + recipeData.name);
      console.log("Ingredients Count: " + (recipeData.recipeIngredient?.length || 0));
    }
    
    // Test regex parser
    let ingredients = recipeData?.recipeIngredient || [];
    if (ingredients.length === 0) {
      const ingMatch = html.match(/"recipeIngredient"\s*:\s*\[([\s\S]*?)\]/i);
      console.log("Ing Match length: " + !!ingMatch);
    }
    
    // Raw regex
    if (ingredients.length === 0) {
      $('.o-Ingredients__a-Ingredient, .recipe-ingredients li').each((_, el) => {
         const t = $(el).text().replace(/\s+/g, ' ').trim();
         if (t) { ingredients.push(t); }
      });
    }

    console.log("Fallback Class Match Count: " + ingredients.length);

  } catch (e) {
    console.log("Error:", e);
  }
}

testFetch();
