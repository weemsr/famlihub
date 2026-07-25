import type { PantryLocation } from '@/lib/types';

/**
 * Common staples most kitchens share. Tapping these covers the predictable
 * bulk of a first inventory in seconds, with no spreadsheet and no LLM, so the
 * user only has to capture what's actually specific to their kitchen.
 */
export interface StapleSeed {
  title: string;
  location: PantryLocation;
}

export const PANTRY_STAPLES: StapleSeed[] = [
  // Pantry
  { title: 'Salt', location: 'pantry' },
  { title: 'Black pepper', location: 'pantry' },
  { title: 'Olive oil', location: 'pantry' },
  { title: 'Cooking oil', location: 'pantry' },
  { title: 'Sugar', location: 'pantry' },
  { title: 'All-purpose flour', location: 'pantry' },
  { title: 'Rice', location: 'pantry' },
  { title: 'Pasta', location: 'pantry' },
  { title: 'Canned tomatoes', location: 'pantry' },
  { title: 'Chicken broth', location: 'pantry' },
  { title: 'Soy sauce', location: 'pantry' },
  { title: 'Garlic', location: 'pantry' },
  { title: 'Onions', location: 'pantry' },
  { title: 'Honey', location: 'pantry' },
  { title: 'Peanut butter', location: 'pantry' },
  { title: 'Cereal', location: 'pantry' },
  { title: 'Coffee', location: 'pantry' },
  { title: 'Baking soda', location: 'pantry' },
  { title: 'Vinegar', location: 'pantry' },
  { title: 'Paprika', location: 'pantry' },
  // Fridge
  { title: 'Milk', location: 'fridge' },
  { title: 'Butter', location: 'fridge' },
  { title: 'Eggs', location: 'fridge' },
  { title: 'Cheese', location: 'fridge' },
  { title: 'Yogurt', location: 'fridge' },
  { title: 'Ketchup', location: 'fridge' },
  { title: 'Mayonnaise', location: 'fridge' },
  { title: 'Mustard', location: 'fridge' },
  // Freezer
  { title: 'Frozen vegetables', location: 'freezer' },
  { title: 'Ice', location: 'freezer' },
  { title: 'Frozen chicken', location: 'freezer' },
  { title: 'Frozen berries', location: 'freezer' },
];
