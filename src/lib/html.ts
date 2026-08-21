/**
 * Tag stripping for scraped recipe text.
 *
 * Recipe wording legitimately contains a bare `<` — "cook until the centre is
 * <165 F", "butter, <1 tbsp". The previous pattern (`/<[^>]*>?/gm`) made the
 * closing `>` optional, so a lone `<` swallowed everything after it to the end
 * of the line, and saving an edited recipe persisted the truncation.
 *
 * Only well-formed tags with a known HTML name (and HTML comments) are removed,
 * so `<165 F` and `<medium>` survive while `<p>`, `<br/>`, and `<a href="…">`
 * do not.
 */
const HTML_TAG =
  /<!--[\s\S]*?-->|<\/?(?:a|abbr|b|blockquote|br|code|del|div|em|figure|figcaption|h[1-6]|hr|i|img|li|ol|p|pre|q|s|small|span|strong|sub|sup|table|tbody|td|tfoot|th|thead|tr|u|ul)\b[^>]*>/gi;

export function stripHtml(input: string): string {
  return input.replace(HTML_TAG, '');
}

/**
 * Named entities worth decoding in recipe text. Recipe sites emit these inside
 * JSON-LD strings, where nothing decodes them: JSON is not HTML, so `&#32;`
 * survives `JSON.parse` and renders literally. (DOM-scraped text is fine —
 * cheerio's `.text()` already decodes.)
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', bull: '•', middot: '·',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  deg: '°', times: '×', divide: '÷', minus: '−',
  frac12: '½', frac14: '¼', frac34: '¾', sup2: '²', sup3: '³',
  trade: '™', reg: '®', copy: '©',
  eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', ntilde: 'ñ',
  auml: 'ä', ouml: 'ö', uuml: 'ü', szlig: 'ß',
};

const ENTITY = /&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]{1,31});/gi;

/** Decode HTML entities — numeric (decimal and hex) and the common named set. */
export function decodeEntities(input: string): string {
  if (!input.includes('&')) return input;
  return input.replace(ENTITY, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      // Reject non-characters and anything outside the Unicode range rather
      // than emitting a replacement glyph over the site's original text.
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
      if (code >= 0xd800 && code <= 0xdfff) return match;
      try { return String.fromCodePoint(code); } catch { return match; }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? match;
  });
}

/**
 * Normalize one scraped line for storage: decode entities, drop tags, tidy the
 * artefacts recipe plugins leave behind, and collapse whitespace.
 *
 * The doubled parens and double spaces are WP Recipe Maker's own output — it
 * emits "2  onions ((large; 567 g))" when a quantity has no unit and the note
 * already carries brackets. Deterministic, so worth cleaning rather than
 * showing to the user.
 */
export function cleanRecipeLine(input: string): string {
  return decodeEntities(stripHtml(input))
    .replace(/\(\(([^()]*)\)\)/g, '($1)')
    .replace(/\s+/g, ' ')
    .trim();
}
