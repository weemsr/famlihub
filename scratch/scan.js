const cheerio = require('cheerio');
const fs = require('fs');

function scan(file) {
  console.log(`\n\nScanning ${file}...`);
  const html = fs.readFileSync(file, 'utf-8');
  const $ = cheerio.load(html);
  $('ul, ol').each((_, el) => {
    const lis = $(el).find('> li');
    if (lis.length > 3) {
      console.log('Class:', $(el).attr('class') || 'NO_CLASS', '| Parent Class:', $(el).parent().attr('class') || 'NO_PARENT');
      console.log('Sample item:', lis.first().text().trim().substring(0, 80));
      console.log('---');
    }
  });
}

scan('/tmp/inspired.html');
scan('/tmp/foodie.html');
