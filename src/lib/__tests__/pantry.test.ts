import { describe, it, expect } from 'vitest';
import { parseBulkLines, nextLevel } from '@/app/inventory/_components/constants';

describe('parseBulkLines', () => {
  it('splits one item per line', () => {
    expect(parseBulkLines('Rice\nBeans\nOlive oil')).toEqual(['Rice', 'Beans', 'Olive oil']);
  });

  it('drops blank lines and trims whitespace', () => {
    expect(parseBulkLines('  Rice  \n\n\n   \nBeans\n')).toEqual(['Rice', 'Beans']);
  });

  it('strips leading bullets from pasted lists', () => {
    expect(parseBulkLines('- Rice\n* Beans\n• Flour')).toEqual(['Rice', 'Beans', 'Flour']);
  });

  it('strips leading numbering', () => {
    expect(parseBulkLines('1. Rice\n2) Beans\n10. Flour')).toEqual(['Rice', 'Beans', 'Flour']);
  });

  it('keeps numbers that are part of the item name', () => {
    // Only a leading "N." / "N)" marker is stripped — quantities stay put,
    // since quantity parsing is deliberately a separate, manual step.
    expect(parseBulkLines('2 bags rice\n12 eggs')).toEqual(['2 bags rice', '12 eggs']);
  });

  it('returns an empty list for empty or whitespace-only input', () => {
    expect(parseBulkLines('')).toEqual([]);
    expect(parseBulkLines('   \n\n  ')).toEqual([]);
  });
});

describe('nextLevel', () => {
  it('cycles low -> medium -> high -> unset -> low', () => {
    expect(nextLevel(undefined)).toBe('low');
    expect(nextLevel('low')).toBe('medium');
    expect(nextLevel('medium')).toBe('high');
    expect(nextLevel('high')).toBeUndefined();
  });
});
