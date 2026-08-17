import type * as cheerio from 'cheerio';

/**
 * Last-resort ingredient extraction for recipe pages that publish no structured
 * data at all — no JSON-LD Recipe, no recipe-plugin markup, just prose and
 * lists. Lives here rather than in the server action so it can be unit tested
 * ("use server" modules may only export async functions).
 */

const UNIT_WORD =
  /\b(cup|tablespoon|teaspoon|tbsp|tsp|oz|ounce|pound|lb|clove|pinch|gram|kg|ml|litre|liter|can|jar|package|packet|stick|bunch|slice|sprig|dash|handful)s?\b/i;
const LEADING_QUANTITY = /^\s*(\d|[¼½¾⅓⅔⅛⅜⅝⅞])/;

/** Does this line read like an ingredient rather than prose or a nav label? */
export function looksLikeIngredient(line: string): boolean {
  return LEADING_QUANTITY.test(line) || UNIT_WORD.test(line);
}

interface Candidate {
  parent: unknown;
  lines: string[];
  label: string;
}

/**
 * Recipes routinely split ingredients across several lists — "For the pasta",
 * "For the sauce" — and those sub-lists are often a single item.
 *
 * The previous implementation took the *first* list with more than two items,
 * which on such a page silently dropped every short section: a shrimp pasta
 * imported with neither shrimp nor pasta, and nothing to signal the loss.
 *
 * Instead, score every list, then merge the sibling lists sharing a parent —
 * that is how one recipe's sections are marked up. The heading before each list
 * becomes a section label, matching how the Sanity path formats groups.
 */
export function harvestIngredientLists($: cheerio.CheerioAPI): string[] {
  const candidates: Candidate[] = [];

  $('ul, ol').each((_, el) => {
    const lines = $(el)
      .find('> li')
      .toArray()
      .map(li => $(li).text().replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    // A majority of lines must look like ingredients. This is what rejects nav
    // menus ("Home", "About") and prose tip lists — distinctions the old
    // unit-word test on the list's combined text could not make.
    const hits = lines.filter(looksLikeIngredient).length;
    if (hits === 0 || hits / lines.length < 0.6) return;

    const prev = $(el).prev();
    const heading = prev.is('h2, h3, h4, h5, h6, p, strong, b')
      ? prev.text().replace(/\s+/g, ' ').trim()
      : '';

    candidates.push({
      parent: $(el).parent().get(0),
      lines,
      label: heading.length > 0 && heading.length <= 60 ? heading : '',
    });
  });

  const groups = new Map<unknown, Candidate[]>();
  for (const candidate of candidates) {
    const group = groups.get(candidate.parent) ?? [];
    group.push(candidate);
    groups.set(candidate.parent, group);
  }

  let best: Candidate[] = [];
  let bestCount = 0;
  for (const group of groups.values()) {
    const count = group.reduce((total, c) => total + c.lines.length, 0);
    if (count > bestCount) {
      bestCount = count;
      best = group;
    }
  }
  // Keeps the old guard against latching onto an incidental two-item list.
  if (bestCount <= 2) return [];

  const out: string[] = [];
  for (const candidate of best) {
    if (candidate.label && best.length > 1) out.push(candidate.label.replace(/:?\s*$/, ':'));
    out.push(...candidate.lines);
  }
  return out;
}
