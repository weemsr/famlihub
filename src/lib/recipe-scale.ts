/**
 * Parse leading numeric quantities out of an ingredient line and scale them
 * by a factor. Handles integers, decimals, vulgar fractions (1/2, 1 1/2),
 * unicode vulgar fractions (½, ¼, 1 ½), and simple ranges (1-2, 1 to 2).
 * Anything after the quantity — units, parentheticals, item name — is left
 * untouched. Lines with no parseable leading number pass through unchanged
 * ("Salt to taste").
 */

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 1 / 2,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 1 / 4,
  '¾': 3 / 4,
  '⅕': 1 / 5,
  '⅖': 2 / 5,
  '⅗': 3 / 5,
  '⅘': 4 / 5,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅛': 1 / 8,
  '⅜': 3 / 8,
  '⅝': 5 / 8,
  '⅞': 7 / 8,
};

const FR_CHARS = Object.keys(UNICODE_FRACTIONS).join('');
const FR_CLASS = `[${FR_CHARS}]`;

interface Parsed {
  value: number;
  matched: string; // the literal substring that was parsed
}

function parseLeadingNumber(input: string): Parsed | null {
  // Order: most-specific first. Each pattern anchored to the (leading-ws-trimmed) start.
  // "1 1/2", "1  1/2"
  let m = input.match(new RegExp(`^(\\d+)\\s+(\\d+)\\/(\\d+)`));
  if (m) return { value: parseInt(m[1], 10) + parseInt(m[2], 10) / parseInt(m[3], 10), matched: m[0] };
  // "1 ½" or "1½"
  m = input.match(new RegExp(`^(\\d+)\\s*(${FR_CLASS})`));
  if (m) return { value: parseInt(m[1], 10) + UNICODE_FRACTIONS[m[2]], matched: m[0] };
  // "1/2"
  m = input.match(/^(\d+)\/(\d+)/);
  if (m) return { value: parseInt(m[1], 10) / parseInt(m[2], 10), matched: m[0] };
  // "1.5" or "1"
  m = input.match(/^(\d+(?:\.\d+)?)/);
  if (m) return { value: parseFloat(m[1]), matched: m[0] };
  // "½"
  m = input.match(new RegExp(`^(${FR_CLASS})`));
  if (m) return { value: UNICODE_FRACTIONS[m[1]], matched: m[0] };
  return null;
}

const EIGHTH_TO_FRACTION: Record<number, string> = {
  1: '⅛',
  2: '¼',
  3: '⅜',
  4: '½',
  5: '⅝',
  6: '¾',
  7: '⅞',
};

/**
 * Format a positive number as a human-friendly quantity: prefers common
 * fractions rounded to the nearest eighth when `value` is within ~0.02 of
 * an eighth, otherwise renders a decimal trimmed to at most 2 dp.
 */
export function formatQuantity(value: number): string {
  if (!isFinite(value) || value <= 0) return '0';

  const eighths = Math.round(value * 8);
  const nearest = eighths / 8;
  if (Math.abs(value - nearest) < 0.02) {
    const whole = Math.floor(eighths / 8);
    const rem = eighths - whole * 8;
    if (rem === 0) return String(whole);
    const frac = EIGHTH_TO_FRACTION[rem];
    return whole === 0 ? frac : `${whole} ${frac}`;
  }

  return value.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * Scale an ingredient line by `factor`. Handles the common range shapes
 * ("1-2 cups", "1 to 2 tsp") as well as a single leading quantity. If no
 * quantity is found, returns the line unchanged.
 */
export function scaleIngredient(line: string, factor: number): string {
  if (factor === 1 || !isFinite(factor) || factor <= 0) return line;

  const leading = line.match(/^(\s*)/);
  const indent = leading ? leading[1] : '';
  const rest = line.slice(indent.length);

  // Range: "<num>(-| to )<num>". Leave separator characters/whitespace alone.
  const rangeRe = new RegExp(
    `^(\\d+(?:\\.\\d+)?|\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+\\s*${FR_CLASS}|${FR_CLASS})(\\s*(?:-|to)\\s*)(\\d+(?:\\.\\d+)?|\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+\\s*${FR_CLASS}|${FR_CLASS})`
  );
  const rm = rest.match(rangeRe);
  if (rm) {
    const lo = parseLeadingNumber(rm[1]);
    const hi = parseLeadingNumber(rm[3]);
    if (lo && hi) {
      return `${indent}${formatQuantity(lo.value * factor)}${rm[2]}${formatQuantity(hi.value * factor)}${rest.slice(rm[0].length)}`;
    }
  }

  const parsed = parseLeadingNumber(rest);
  if (!parsed) return line;

  return `${indent}${formatQuantity(parsed.value * factor)}${rest.slice(parsed.matched.length)}`;
}

/**
 * Extract a servings count from a JSON-LD Recipe.recipeYield value.
 * `recipeYield` is often "4", "4 servings", "Serves 4", "4-6", or a number.
 * Returns the first integer >= 1 found, or undefined.
 */
export function parseRecipeYield(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 1) return Math.floor(raw);
  const str = Array.isArray(raw)
    ? raw.find(v => typeof v === 'string' || typeof v === 'number')
    : raw;
  if (typeof str === 'number' && Number.isFinite(str) && str >= 1) return Math.floor(str);
  if (typeof str !== 'string') return undefined;
  const m = str.match(/\d+/);
  if (!m) return undefined;
  const n = parseInt(m[0], 10);
  return Number.isFinite(n) && n >= 1 ? n : undefined;
}
