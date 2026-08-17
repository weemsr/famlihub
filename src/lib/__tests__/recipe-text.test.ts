import { describe, it, expect } from 'vitest';
import { stripHtml } from '../html';
import { asStringArray, hadStoredContent } from '../types';

describe('stripHtml', () => {
  it('removes real tags', () => {
    expect(stripHtml('Rest <p>10 min</p>')).toBe('Rest 10 min');
    expect(stripHtml('Line<br/>break')).toBe('Linebreak');
    expect(stripHtml('<a href="https://x.test">Source</a>')).toBe('Source');
    expect(stripHtml('<!-- hidden -->Salt')).toBe('Salt');
  });

  it('leaves a bare < alone — recipe wording uses it as "less than"', () => {
    // Regression: the old /<[^>]*>?/gm ate everything to end of line.
    expect(stripHtml('Cook until internal temp is <165 F')).toBe('Cook until internal temp is <165 F');
    expect(stripHtml('Butter, <1 tbsp, softened')).toBe('Butter, <1 tbsp, softened');
    expect(stripHtml('Reduce heat to <medium>')).toBe('Reduce heat to <medium>');
  });

  it('leaves ordinary text untouched', () => {
    expect(stripHtml('2 cups flour')).toBe('2 cups flour');
  });
});

describe('asStringArray', () => {
  it('passes through string arrays', () => {
    expect(asStringArray(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('recovers text from the object shapes scrapers emit', () => {
    // Regression: these used to be dropped, which blanked the editor and let a
    // save replace the stored ingredients with [].
    expect(asStringArray([{ text: 'Brown the beef' }])).toEqual(['Brown the beef']);
    expect(asStringArray([{ name: '1 lb beef' }, { item: '2 carrots' }])).toEqual(['1 lb beef', '2 carrots']);
  });

  it('handles mixed and junk entries', () => {
    expect(asStringArray(['a', { text: 'b' }, null, 42, {}, ''])).toEqual(['a', 'b', '42']);
  });

  it('wraps a single string and rejects everything else', () => {
    expect(asStringArray('just one')).toEqual(['just one']);
    expect(asStringArray('   ')).toEqual([]);
    expect(asStringArray(undefined)).toEqual([]);
    expect(asStringArray({ text: 'not an array' })).toEqual([]);
  });
});

describe('hadStoredContent', () => {
  it('distinguishes "never had content" from "we could not read it"', () => {
    expect(hadStoredContent(['a'])).toBe(true);
    expect(hadStoredContent([{ weird: 'shape' }])).toBe(true); // unreadable, but present
    expect(hadStoredContent('text')).toBe(true);
    expect(hadStoredContent([])).toBe(false);
    expect(hadStoredContent(undefined)).toBe(false);
    expect(hadStoredContent('')).toBe(false);
  });
});
