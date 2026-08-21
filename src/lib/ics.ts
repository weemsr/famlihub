/**
 * Minimal RFC 5545 iCalendar generator for FamLi meal plans. Each scheduled
 * meal becomes a single all-day VEVENT, keyed by the meal row id so Google
 * recognizes updates rather than duplicating.
 */

const MEAL_EMOJI: Record<string, string> = {
  Breakfast: '🍳',
  Lunch: '🥗',
  Dinner: '🍽️',
};

interface MealRow {
  id: string;
  title?: string;
  body: {
    day: string;
    mealId: string;
    recipeId?: string;
    customName?: string;
    note?: string;
  };
  created_at?: string;
}

interface RecipeRow {
  id: string;
  title: string;
}

/** Escape a text value per RFC 5545 §3.3.11 */
function escapeIcs(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

const utf8 = new TextEncoder();

/**
 * Fold a content line to <=75 octets per RFC 5545 §3.1.
 *
 * Counted in UTF-8 octets, not JS string length. Every meal SUMMARY leads with
 * an emoji, so a 75-character line is routinely well over 75 octets — the old
 * `slice(0, 75)` both broke the limit and could cut a surrogate pair in half,
 * emitting invalid UTF-8. Splitting happens between "atoms": an escaped pair
 * (`\,`, `\n`) or a single code point, so neither is ever severed.
 */
function fold(line: string): string {
  if (utf8.encode(line).length <= 75) return line;

  const atoms: string[] = [];
  const chars = Array.from(line); // code points, not UTF-16 units
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === '\\' && i + 1 < chars.length) {
      atoms.push(chars[i] + chars[i + 1]);
      i++;
    } else {
      atoms.push(chars[i]);
    }
  }

  const segments: string[] = [];
  let current = '';
  let octets = 0;
  let budget = 75; // continuation lines give up one octet to the leading space

  for (const atom of atoms) {
    const size = utf8.encode(atom).length;
    if (octets > 0 && octets + size > budget) {
      segments.push(current);
      current = '';
      octets = 0;
      budget = 74;
    }
    current += atom;
    octets += size;
  }
  if (current) segments.push(current);

  return segments.map((seg, i) => (i === 0 ? seg : ' ' + seg)).join('\r\n');
}

/** Build YYYYMMDD from a 'YYYY-MM-DD' day string. */
function toBasicDate(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[1]}${m[2]}${m[3]}` : null;
}

/** Next calendar day, used for DTEND on all-day events (half-open). */
function nextDay(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + 1);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${mo}${da}`;
}

function nowStamp(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  const s = String(d.getUTCSeconds()).padStart(2, '0');
  return `${y}${mo}${da}T${h}${mi}${s}Z`;
}

export function mealsToIcs(meals: MealRow[], recipes: RecipeRow[]): string {
  const recipeById = new Map(recipes.map(r => [r.id, r]));
  const dtstamp = nowStamp();

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FamLi Hub//Meal Plan//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:FamLi Hub — Meal Plan',
    'X-WR-CALDESC:Your planned meals from FamLi Hub',
  ];

  for (const meal of meals) {
    if (!meal.body) continue;
    const dt = toBasicDate(meal.body.day);
    const dtEnd = nextDay(meal.body.day);
    if (!dt || !dtEnd) continue;

    const slot = meal.body.mealId || '';
    const emoji = MEAL_EMOJI[slot] || '🍴';
    const recipe = meal.body.recipeId ? recipeById.get(meal.body.recipeId) : null;
    const name = recipe?.title || meal.body.customName || 'Meal';
    const summary = `${emoji} ${slot}: ${name}`.trim();

    lines.push('BEGIN:VEVENT');
    lines.push(fold(`UID:meal-${meal.id}@famlihub.vercel.app`));
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART;VALUE=DATE:${dt}`);
    lines.push(`DTEND;VALUE=DATE:${dtEnd}`);
    lines.push(fold(`SUMMARY:${escapeIcs(summary)}`));
    if (meal.body.note) {
      lines.push(fold(`DESCRIPTION:${escapeIcs(meal.body.note)}`));
    }
    lines.push('TRANSP:TRANSPARENT'); // doesn't block the day
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
