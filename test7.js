const cheerio = require('cheerio');

async function testFetch(url) {
  console.log("\n=====================");
  console.log("Fetching: " + url);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
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

    console.log("Found Recipe Schema:", !!recipeData);
    
    let title = recipeData?.name || $('h1').first().text().trim() || 'Unknown';
    let ingredients = recipeData?.recipeIngredient || [];
    let instructions = [];

    if (Array.isArray(recipeData?.recipeInstructions)) {
      instructions = recipeData.recipeInstructions.map(step => step.text || step).filter(Boolean);
    } else if (typeof recipeData?.recipeInstructions === 'string') {
      instructions = [recipeData.recipeInstructions];
    }
    
    // Fallbacks from recipe.ts
    // 1.5 regex fallback
    if (ingredients.length === 0) {
      const ingMatch = html.match(/"recipeIngredient"\s*:\s*\[([\s\S]*?)\]/i);
      if (ingMatch) { try { ingredients = JSON.parse(`[${ingMatch[1]}]`); } catch(e) {} }
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
    
    // 2. HTML Class fallback
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
    
    // 3. NLP fallback
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

    console.log("Title: " + title);
    console.log("Ingredients: " + ingredients.length);
    console.log("Instructions: " + instructions.length);

    if (ingredients.length === 0 && instructions.length === 0) {
        console.log("-> EXTRACTION FAILED");
    } else {
        console.log("-> EXTRACTION SUCCESS");
    }

  } catch (e) {
    console.log("Error:", e.message);
  }
}

async function run() {
  await testFetch('https://www.foodnetwork.com/recipes/food-network-kitchen/the-best-chicken-noodle-soup-7194859');
  await testFetch('https://www.madewithlau.com/recipes/cantonese-scrambled-eggs');
}

run();
