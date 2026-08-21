import { describe, it, expect } from 'vitest';
import { stripHtml, decodeEntities, cleanRecipeLine } from '../html';
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

describe('decodeEntities', () => {
  it('decodes the numeric entities recipe sites bury in JSON-LD', () => {
    // Regression: justonecookbook ships literal &#32; / &#39; inside its
    // JSON-LD. JSON is not HTML, so JSON.parse leaves them as visible text.
    expect(decodeEntities('Cut 2&#32;onions into thin slices.')).toBe('Cut 2 onions into thin slices.');
    expect(decodeEntities('When it&#39;s hot')).toBe("When it's hot");
    expect(decodeEntities('&#x2153; cup')).toBe('⅓ cup');
  });

  it('decodes common named entities', () => {
    expect(decodeEntities('salt &amp; pepper')).toBe('salt & pepper');
    expect(decodeEntities('180&deg;C &ndash; 200&deg;C')).toBe('180°C – 200°C');
    expect(decodeEntities('caf&eacute;')).toBe('café');
  });

  it('leaves unknown or malformed entities alone rather than mangling text', () => {
    expect(decodeEntities('5 &fakeentity; cups')).toBe('5 &fakeentity; cups');
    expect(decodeEntities('a & b')).toBe('a & b');
    expect(decodeEntities('&#0;')).toBe('&#0;');
    expect(decodeEntities('&#1114112;')).toBe('&#1114112;'); // past the Unicode range
  });

  it('is a no-op on text with no ampersand', () => {
    expect(decodeEntities('2 cups flour')).toBe('2 cups flour');
  });
});

describe('cleanRecipeLine', () => {
  it('fixes the WP Recipe Maker artefacts', () => {
    // Verbatim from justonecookbook's JSON-LD: doubled parens, double space.
    expect(cleanRecipeLine('2  onions ((large; 1¼ lb, 567 g))')).toBe('2 onions (large; 1¼ lb, 567 g)');
    expect(cleanRecipeLine('2 Tbsp unsalted butter ((divided))')).toBe('2 Tbsp unsalted butter (divided)');
  });

  it('combines tag stripping, decoding and whitespace collapse', () => {
    expect(cleanRecipeLine('  Add <strong>1 Tbsp&#32;miso</strong>  paste  ')).toBe('Add 1 Tbsp miso paste');
  });

  it('still leaves a bare < alone', () => {
    expect(cleanRecipeLine('Cook until temp is <165 F')).toBe('Cook until temp is <165 F');
  });

  it('leaves genuinely nested parentheses intact', () => {
    expect(cleanRecipeLine('1 cup stock (or broth (low sodium))')).toBe('1 cup stock (or broth (low sodium))');
  });
});
