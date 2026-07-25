import { Package, Snowflake, Refrigerator, type LucideIcon } from 'lucide-react';
import type { PantryLocation, PantryLevel } from '@/lib/types';

export interface LocationMeta {
  id: PantryLocation;
  label: string;
  icon: LucideIcon;
  color: string;
}

export const LOCATIONS: LocationMeta[] = [
  { id: 'pantry', label: 'Pantry', icon: Package, color: '#2D6A4F' },
  { id: 'fridge', label: 'Fridge', icon: Refrigerator, color: '#1E5AC9' },
  { id: 'freezer', label: 'Freezer', icon: Snowflake, color: '#0EA5E9' },
];

export const LEVELS: { id: PantryLevel; label: string; color: string }[] = [
  { id: 'low', label: 'Low', color: 'var(--danger-color)' },
  { id: 'medium', label: 'Med', color: 'var(--warning-fg)' },
  { id: 'high', label: 'High', color: 'var(--success-color)' },
];

/** Tapping a level chip cycles Low → Med → High → none. */
export function nextLevel(current?: PantryLevel): PantryLevel | undefined {
  if (current === 'low') return 'medium';
  if (current === 'medium') return 'high';
  if (current === 'high') return undefined;
  return 'low';
}

/**
 * Split a pasted/typed block into item names, one per line. Cleanup is
 * deliberately conservative and predictable — trim, drop blanks, and strip
 * leading bullets/numbering so pasted lists work. No quantity parsing: guessing
 * "2 bags rice" into fields is ambiguous, and quantity is a second pass.
 */
export function parseBulkLines(text: string): string[] {
  return text
    .split('\n')
    .map(line => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
}
