/**
 * Shared types for items stored in the `items` table. The `body` column is
 * JSONB, so its shape depends on `type`. These interfaces narrow that shape
 * at the component boundary to remove scattered `as any` casts.
 */

export type TodoCategory = string;

export interface TodoBody {
  category?: TodoCategory;
  completedAt?: string | null;
}

export type GroceryStore = 'regular' | 'costco' | 'asian';

export interface GroceryBody {
  store?: GroceryStore;
  /** Manual sort position within the store. Items without `order` fall back
   *  to `created_at` ordering, so legacy rows stay in place until reordered. */
  order?: number;
}

export interface RecipeBody {
  ingredients?: unknown; // scraped content — validate at render
  instructions?: unknown; // scraped content — validate at render
  image?: string;
  sourceUrl?: string;
  servings?: number; // original yield, used as the base for ingredient scaling
}

export interface MealBody {
  day: string;
  dayLabel?: string;
  mealId: string;
  recipeId?: string;
  customName?: string;
  note?: string;
}

/**
 * Recurring home/car maintenance item (Upkeep tab). Stored in `items` with
 * type='maintenance'. `lastDone` is absent when the user has never marked
 * the task complete yet.
 */
export interface MaintenanceBody {
  intervalDays: number;
  lastDone?: string; // ISO yyyy-mm-dd
  note?: string;
}

/**
 * Pantry / fridge / freezer stock item (Pantry tab). Stored in `items` with
 * type='inventory'. Every field is optional: legacy rows predate this shape and
 * must keep rendering. `quantity` is deliberately free text ("2 bags", "half a
 * box") because real pantries don't have tidy units; `level` covers uncountables
 * like spices and oils.
 */
export type PantryLocation = 'pantry' | 'fridge' | 'freezer';
export type PantryLevel = 'low' | 'medium' | 'high';

export interface InventoryBody {
  quantity?: string;
  /** Package size as printed, free text: "15 oz", "1 lb", "500g", "2 L".
   *  Kept unparsed for the same reason as quantity — pantry units are mixed
   *  and normalizing them loses the label's own wording. */
  weight?: string;
  location?: PantryLocation;
  level?: PantryLevel;
}

/**
 * Credit card the user wants to keep an eye on for annual-fee renewal.
 * `cancelBy` is the deadline to decide whether to cancel before the next
 * annual fee posts (typically a few weeks after the prior year's fee).
 * Annual fee is stored in whole dollars.
 */
export interface CreditCardBody {
  bank?: string;
  last4?: string; // last 4 digits, for identifying the physical card
  annualFee?: number;
  cancelBy?: string; // ISO yyyy-mm-dd
  notes?: string;
}

/**
 * One Google Calendar the user has connected (via its secret iCal URL).
 * Multiple calendars are supported; each is tinted with its own color on
 * the Calendar tab. Stored as a list in a single "setting" items row with
 * title="google_ical_url".
 */
export interface GoogleCalendarEntry {
  id: string;       // client-generated stable id (used as React key + event.calendarId)
  name: string;     // user-editable label shown in the UI
  url: string;      // Google secret iCal URL
  color: string;    // hex, typically from CALENDAR_COLOR_PALETTE
}

/**
 * Curated 8-color palette for tinting calendars. First color is the legacy
 * default (matches the single-calendar era), so migrated users see no change.
 */
export const CALENDAR_COLOR_PALETTE: readonly string[] = [
  '#4285F4', // blue
  '#0F9D58', // green
  '#F4B400', // yellow
  '#DB4437', // red
  '#AA47BC', // purple
  '#FF7043', // orange
  '#26A69A', // teal
  '#EC407A', // pink
] as const;

export const CALENDAR_DEFAULT_COLOR = CALENDAR_COLOR_PALETTE[0];

/**
 * Stable fallback id for a stored calendar entry that has no `id` of its own.
 *
 * Derived from the URL so the browser and the events route agree. They used to
 * mint independent random ids, so the per-calendar status the server returned
 * could never be matched back to a row — the UI silently showed "0 events" and
 * swallowed any error for that calendar.
 */
export function calendarEntryFallbackId(url: string): string {
  let hash = 2166136261; // FNV-1a
  for (let i = 0; i < url.length; i++) {
    hash ^= url.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `cal_${(hash >>> 0).toString(36)}`;
}

export interface Item<TBody = unknown> {
  id: string;
  type: string;
  title: string;
  body?: TBody;
  is_completed?: boolean;
  created_at?: string;
  user_id?: string;
}

export type TodoItem = Item<TodoBody> & { title: string; is_completed: boolean };
export type GroceryItem = Item<GroceryBody> & { title: string; is_completed: boolean };
export type RecipeItem = Item<RecipeBody> & { title: string };
export type MealItem = Item<MealBody>;
export type NoteItem = Item<string> & { title: string };
export type InventoryItem = Item<InventoryBody> & { title: string };
export type MaintenanceItem = Item<MaintenanceBody> & { title: string };
export type CreditCardItem = Item<CreditCardBody> & { title: string };

/**
 * Sort stamp for a newly added grocery row. Epoch ms sits on the same number
 * line as the created_at fallback in the groceries sort, so a fresh item
 * always lands at the bottom of its list.
 */
export const groceryOrderStamp = () => Date.now();

/** Keys that carry the display text on the object-shaped entries scrapers emit
 *  (schema.org HowToStep `{text}`, Sanity `{item}`, assorted `{name}`). */
const TEXT_KEYS = ['text', 'name', 'item', 'ingredient', 'description'] as const;

/**
 * Coerce an unknown value to a string[]. Handles the shapes that actually come
 * back from scraped pages: array of strings, array of objects carrying the text
 * under a known key, a single string, or anything else → [].
 *
 * Object entries are recovered rather than dropped. Silently discarding them
 * made an imported recipe render as "No ingredients listed" *and* open the
 * editor with empty boxes — so saving replaced the real ingredients with [].
 */
export function asStringArray(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value] : [];
  if (!Array.isArray(value)) return [];

  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string') {
      if (entry.trim()) out.push(entry);
      continue;
    }
    if (typeof entry === 'number' && Number.isFinite(entry)) {
      out.push(String(entry));
      continue;
    }
    if (entry && typeof entry === 'object') {
      const obj = entry as Record<string, unknown>;
      for (const key of TEXT_KEYS) {
        const candidate = obj[key];
        if (typeof candidate === 'string' && candidate.trim()) {
          out.push(candidate);
          break;
        }
      }
    }
  }
  return out;
}

/**
 * Did this stored value ever hold content? Used by the recipe editor to tell
 * "the user cleared this on purpose" apart from "we failed to read the stored
 * shape", so a save can never blank out a recipe that still has data.
 */
export function hadStoredContent(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  return Array.isArray(value) && value.length > 0;
}
