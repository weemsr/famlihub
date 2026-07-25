import { describe, it, expect } from 'vitest';
import { mergeScanItems, normalizeItemKey } from '../pantry-merge';

describe('normalizeItemKey', () => {
  it('ignores case, punctuation, and spacing', () => {
    expect(normalizeItemKey('Olive Oil')).toBe(normalizeItemKey('olive  oil'));
    expect(normalizeItemKey('Beans, black')).toBe(normalizeItemKey('beans black'));
  });

  it('treats simple plurals as the same item', () => {
    expect(normalizeItemKey('eggs')).toBe(normalizeItemKey('egg'));
  });

  it('keeps genuinely different items apart', () => {
    expect(normalizeItemKey('olive oil')).not.toBe(normalizeItemKey('sesame oil'));
  });
});

describe('mergeScanItems', () => {
  it('collapses the same item seen in several photos', () => {
    const merged = mergeScanItems([
      [{ name: 'Olive oil' }],
      [{ name: 'olive oil' }],
      [{ name: 'Olive Oil' }],
    ]);
    expect(merged).toHaveLength(1);
  });

  it('keeps the entry carrying more detail', () => {
    const merged = mergeScanItems([
      [{ name: 'Black beans' }],
      [{ name: 'Black beans', quantity: '2', weight: '15 oz' }],
    ]);
    expect(merged).toEqual([{ name: 'Black beans', quantity: '2', weight: '15 oz' }]);
  });

  it('backfills fields spread across different photos', () => {
    // One photo read the label's weight, another could count the cans.
    const merged = mergeScanItems([
      [{ name: 'Chickpeas', weight: '15 oz' }],
      [{ name: 'chickpeas', quantity: '3' }],
    ]);
    expect(merged[0]).toMatchObject({ quantity: '3', weight: '15 oz' });
  });

  it('preserves distinct items and their order of first appearance', () => {
    const merged = mergeScanItems([
      [{ name: 'Rice' }, { name: 'Beans' }],
      [{ name: 'Pasta' }],
    ]);
    expect(merged.map(i => i.name)).toEqual(['Rice', 'Beans', 'Pasta']);
  });

  it('handles empty batches and blank names', () => {
    expect(mergeScanItems([])).toEqual([]);
    expect(mergeScanItems([[], []])).toEqual([]);
    expect(mergeScanItems([[{ name: '   ' }]])).toEqual([]);
  });

  it('does not merge different items that merely share a word', () => {
    const merged = mergeScanItems([[{ name: 'olive oil' }, { name: 'sesame oil' }]]);
    expect(merged).toHaveLength(2);
  });
});
