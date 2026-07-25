import type { ScanItem } from './pantry-scan';

/**
 * Merge scan results from several photos of the same area into one list.
 *
 * Shelf photos overlap — the same olive oil often appears in three shots — so
 * without merging a batch scan produces a list that's mostly duplicates. Names
 * are matched on a normalized key (case, punctuation, and plural "s" ignored)
 * and the richest version of each item wins: an entry that carries a quantity
 * or weight beats a bare name, so detail found in one photo isn't lost because
 * another photo saw the same item less clearly.
 */
export function normalizeItemKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')   // punctuation → space
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/s$/, '');             // crude singularization: eggs → egg
}

/** How much detail an entry carries, used to pick a winner between duplicates. */
function richness(item: ScanItem): number {
  return (item.quantity ? 2 : 0) + (item.weight ? 2 : 0) + (item.level ? 1 : 0);
}

export function mergeScanItems(batches: ScanItem[][]): ScanItem[] {
  const best = new Map<string, ScanItem>();

  for (const batch of batches) {
    for (const item of batch) {
      const key = normalizeItemKey(item.name);
      if (!key) continue;

      const existing = best.get(key);
      if (!existing) {
        best.set(key, { ...item });
        continue;
      }

      // Keep the richer entry, then backfill any field the winner lacks so
      // details spread across photos end up on one row.
      const winner = richness(item) > richness(existing) ? { ...item } : { ...existing };
      const other = richness(item) > richness(existing) ? existing : item;
      if (!winner.quantity && other.quantity) winner.quantity = other.quantity;
      if (!winner.weight && other.weight) winner.weight = other.weight;
      if (!winner.level && other.level) winner.level = other.level;
      best.set(key, winner);
    }
  }

  return [...best.values()];
}
