/**
 * URL sanitization helpers. Recipe data can come from untrusted scraped
 * sources, so image and link URLs are validated before being rendered.
 */

/**
 * Returns the URL if it is safe to use as an <img src>, otherwise null.
 *
 * Allowed: http(s) URLs, and `data:image/*` URIs.
 * Blocked: javascript:, vbscript:, file:, non-image data: URIs, and
 *          anything that fails to parse.
 */
export function safeImageUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const url = input.trim();
  if (!url) return null;

  // Allow data: URIs, but only for images.
  if (url.toLowerCase().startsWith('data:')) {
    return /^data:image\/[a-z0-9.+-]+;/i.test(url) ? url : null;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Returns the URL if it is safe to use as an <a href> for navigation,
 * otherwise null. Only http(s) is accepted.
 */
export function safeHttpUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const url = input.trim();
  if (!url) return null;

  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}
