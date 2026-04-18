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
}

export interface RecipeBody {
  ingredients?: unknown; // scraped content — validate at render
  instructions?: unknown; // scraped content — validate at render
  image?: string;
  sourceUrl?: string;
}

export interface MealBody {
  day: string;
  dayLabel?: string;
  mealId: string;
  recipeId?: string;
  customName?: string;
  note?: string;
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
export type InventoryItem = Item<unknown> & { title: string };

/**
 * Coerce an unknown value to a string[]. Handles the common scraped shapes:
 * array of strings, single string, or anything else → [].
 */
export function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string') return [value];
  return [];
}
