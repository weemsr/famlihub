const cheerio = require('cheerio');

async function testFetch(url) {
  try {
    const res = await fetch(url);
    const html = await res.text();
    const $ = cheerio.load(html);

    console.log(`\n=== JSON-LD Objects in ${url} ===`);
    $('script[type="application/ld+json"]').each((_, el) => {
      const text = $(el).html();
      try {
        const json = JSON.parse(text);
        console.log("Found JSON-LD block with keys:", Object.keys(json));
        if (json['@type']) console.log(" Type:", json['@type']);
        if (json['@graph']) {
            console.log(" Graph Types:");
            json['@graph'].forEach(g => console.log("   - " + g['@type']));
        }
      } catch(e) {
          console.log("Failed to parse JSON block");
      }
    });
  } catch(e) {
    console.error(e);
  }
}

testFetch('https://www.madewithlau.com/recipes/cantonese-scrambled-eggs');
