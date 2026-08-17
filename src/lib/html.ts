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
