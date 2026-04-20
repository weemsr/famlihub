const cheerio = require('cheerio');

async function testUrl() {
  const url = 'https://foodiefiber.com/spicy-garlic-shrimp-pasta-with-burst-tomatoes/?utm_source=Pinterest&utm_medium=organic#google_vignette';
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });

  const html = await res.text();
  const $ = cheerio.load(html);

  let ingredients = [];
  let instructions = [];

  // Deep NLP
  $('ul, ol').each((_, el) => {
    const lis = $(el).find('> li');
    if (lis.length > 2 && ingredients.length === 0) {
      const sampleMatch = $(el).text().toLowerCase();
      if (/\b(cup|tablespoon|teaspoon|tbsp|tsp|oz|ounce|pound|lb|clove|pinch|gram|ml|kg)s?\b/.test(sampleMatch)) {
        lis.each((_, li) => { ingredients.push($(li).text().replace(/\s+/g, ' ').trim()); });
      }
    }
  });

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
                // ONLY push if it's not totally empty!
                if (t.length > 20) { instructions.push(t); }
                next = next.next();
             }
           }
        });
     }
  }

  console.log("INGREDIENTS:");
  console.log(ingredients);
  console.log("\nINSTRUCTIONS:");
  console.log(instructions);
}
testUrl();
