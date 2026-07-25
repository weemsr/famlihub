import { describe, it, expect } from 'vitest';
import { parseCsv, toCsvRow } from '../csv';
import { parsePantryCsv, buildTemplateCsv, MAX_IMPORT_ROWS } from '../pantry-import';

describe('parseCsv', () => {
  it('parses a simple grid', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('handles quoted fields containing commas', () => {
    expect(parseCsv('Item\n"Beans, black"')).toEqual([['Item'], ['Beans, black']]);
  });

  it('handles doubled quotes as an escape', () => {
    expect(parseCsv('Item\n"He said ""hi"""')).toEqual([['Item'], ['He said "hi"']]);
  });

  it('handles newlines inside quoted fields', () => {
    expect(parseCsv('Item\n"line1\nline2"')).toEqual([['Item'], ['line1\nline2']]);
  });

  it('handles CRLF endings from Excel', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('strips the UTF-8 BOM Excel prepends', () => {
    expect(parseCsv('﻿Item\nRice')).toEqual([['Item'], ['Rice']]);
  });

  it('drops fully blank rows', () => {
    expect(parseCsv('a\n\n\nb\n')).toEqual([['a'], ['b']]);
  });

  it('round-trips through toCsvRow', () => {
    const cells = ['plain', 'has, comma', 'has "quote"', 'has\nnewline'];
    expect(parseCsv(toCsvRow(cells))[0]).toEqual(cells);
  });
});

describe('parsePantryCsv — structure enforcement', () => {
  it('imports the documented shape', () => {
    const res = parsePantryCsv('Item,Quantity,Weight,Location,Level\nRice,2 bags,5 lb,Pantry,High');
    expect(res.fatal).toBeUndefined();
    expect(res.items).toEqual([{ name: 'Rice', quantity: '2 bags', weight: '5 lb', location: 'pantry', level: 'high' }]);
    expect(res.issues).toHaveLength(0);
  });

  it('keeps weight as free text and accepts its aliases', () => {
    expect(parsePantryCsv('Item,Weight\nBeans,15 oz').items[0].weight).toBe('15 oz');
    expect(parsePantryCsv('Item,Size\nOil,500 ml').items[0].weight).toBe('500 ml');
    expect(parsePantryCsv('Item,Net Weight\nRice,2.5 kg').items[0].weight).toBe('2.5 kg');
  });

  it('omits weight when the cell is blank', () => {
    expect(parsePantryCsv('Item,Weight\nButter,').items[0]).toEqual({ name: 'Butter' });
  });

  it('accepts the generated template unchanged', () => {
    const res = parsePantryCsv(buildTemplateCsv());
    expect(res.fatal).toBeUndefined();
    expect(res.issues).toHaveLength(0);
    expect(res.items).toHaveLength(5);
    expect(res.items.map(i => i.location)).toEqual(['pantry', 'pantry', 'pantry', 'fridge', 'freezer']);
    expect(res.items[0].weight).toBe('15 oz');
  });

  it('rejects a file with no Item column instead of guessing', () => {
    const res = parsePantryCsv('Thing,Amount\nRice,2');
    expect(res.fatal).toContain('No "Item" column');
    expect(res.items).toHaveLength(0);
  });

  it('rejects an empty file and a header-only file', () => {
    expect(parsePantryCsv('').fatal).toBeTruthy();
    expect(parsePantryCsv('Item,Quantity').fatal).toContain('no items');
  });

  it('accepts header aliases and is case-insensitive', () => {
    const res = parsePantryCsv('NAME,qty,where,stock\nRice,3,fridge,full');
    expect(res.items).toEqual([{ name: 'Rice', quantity: '3', location: 'fridge', level: 'high' }]);
  });

  it('works with only the required column', () => {
    const res = parsePantryCsv('Item\nRice\nBeans');
    expect(res.items).toEqual([{ name: 'Rice' }, { name: 'Beans' }]);
  });

  it('reports an unrecognized location and imports as unsorted', () => {
    const res = parsePantryCsv('Item,Location\nRice,Garage');
    expect(res.items).toEqual([{ name: 'Rice' }]);
    expect(res.issues[0]).toMatchObject({ row: 2 });
    expect(res.issues[0].message).toContain('Garage');
  });

  it('reports an unrecognized level and leaves it blank', () => {
    const res = parsePantryCsv('Item,Level\nRice,enormous');
    expect(res.items).toEqual([{ name: 'Rice' }]);
    expect(res.issues[0].message).toContain('enormous');
  });

  it('skips nameless rows and reports the line number', () => {
    const res = parsePantryCsv('Item,Quantity\nRice,2\n,5\nBeans,1');
    expect(res.items.map(i => i.name)).toEqual(['Rice', 'Beans']);
    expect(res.issues).toEqual([{ row: 3, message: 'No item name — row skipped.' }]);
  });

  it('de-duplicates case-insensitively and reports it', () => {
    const res = parsePantryCsv('Item\nRice\nrice\nRICE');
    expect(res.items).toHaveLength(1);
    expect(res.issues).toHaveLength(2);
    expect(res.issues[0].message).toContain('Duplicate');
  });

  it('caps the number of rows and says so', () => {
    const many = ['Item', ...Array.from({ length: MAX_IMPORT_ROWS + 20 }, (_, i) => `item ${i}`)].join('\n');
    const res = parsePantryCsv(many);
    expect(res.items).toHaveLength(MAX_IMPORT_ROWS);
    expect(res.issues.some(i => i.message.includes('first 500'))).toBe(true);
  });

  it('caps overly long names', () => {
    const res = parsePantryCsv(`Item\n${'x'.repeat(400)}`);
    expect(res.items[0].name.length).toBe(200);
  });

  it('reports which header matched each field', () => {
    const res = parsePantryCsv('NAME,qty\nRice,2');
    expect(res.matched.item).toBe('NAME');
    expect(res.matched.quantity).toBe('qty');
    expect(res.matched.location).toBeUndefined();
  });
});
