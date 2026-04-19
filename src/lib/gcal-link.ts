/**
 * Build a Google Calendar event-template URL. Opening this in a new tab lands
 * the user on Google Calendar's "create event" page with fields pre-filled —
 * they only need to hit Save. No OAuth or API keys required.
 *
 * Docs: https://support.google.com/calendar/thread/81344786 (undocumented but
 * stable URL scheme used by countless share-to-calendar tools).
 */

function toBasicDate(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[1]}${m[2]}${m[3]}` : null;
}

function nextDayBasic(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + 1);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

export interface QuickAddMeal {
  day: string; // YYYY-MM-DD
  slot: string; // Breakfast | Lunch | Dinner
  title: string;
  note?: string;
}

/**
 * Returns null if the date can't be parsed (so the caller can hide the button).
 */
export function buildAddToGoogleLink(meal: QuickAddMeal): string | null {
  const dt = toBasicDate(meal.day);
  const dtEnd = nextDayBasic(meal.day);
  if (!dt || !dtEnd) return null;

  const params = new URLSearchParams();
  params.set('action', 'TEMPLATE');
  params.set('text', `${meal.slot}: ${meal.title}`);
  params.set('dates', `${dt}/${dtEnd}`);
  if (meal.note) params.set('details', meal.note);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
