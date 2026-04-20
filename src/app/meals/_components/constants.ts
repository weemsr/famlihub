import { Coffee, Sun, Moon, type LucideIcon } from 'lucide-react';
import type { MealBody, RecipeBody } from '@/lib/types';

export interface MealSlot {
  id: string;
  icon: LucideIcon;
  color: string;
}

export const MEAL_SLOTS: MealSlot[] = [
  { id: 'Breakfast', icon: Coffee, color: '#f59e0b' },
  { id: 'Lunch', icon: Sun, color: '#3b82f6' },
  { id: 'Dinner', icon: Moon, color: '#8b5cf6' },
];

export interface MealItem {
  id: string;
  body: MealBody;
  created_at?: string;
}

export interface RecipeItem {
  id: string;
  title: string;
  body: RecipeBody;
}

export interface WeekDay {
  label: string;
  dbKey: string;
  dayName: string;
  isToday: boolean;
}
