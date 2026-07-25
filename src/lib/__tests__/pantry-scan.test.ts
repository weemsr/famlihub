import { describe, it, expect } from 'vitest';
import { parseScanResponse } from '../pantry-scan';

// parseScanResponse is the trust boundary between an LLM's free-form reply and
// the database, so these cases lean on hostile/sloppy output.
describe('parseScanResponse', () => {
  it('parses the documented {items:[...]} shape', () => {
    const out = parseScanResponse('{"items":[{"name":"black beans","quantity":"2"},{"name":"paprika","level":"low"}]}');
    expect(out).toEqual([
      { name: 'black beans', quantity: '2' },
      { name: 'paprika', level: 'low' },
    ]);
  });

  it('keeps a legible package weight', () => {
    expect(parseScanResponse('{"items":[{"name":"beans","quantity":"2","weight":"15 oz"}]}'))
      .toEqual([{ name: 'beans', quantity: '2', weight: '15 oz' }]);
  });

  it('ignores a non-string weight', () => {
    expect(parseScanResponse('{"items":[{"name":"beans","weight":{"oz":15}}]}')).toEqual([{ name: 'beans' }]);
  });

  it('accepts a bare array', () => {
    expect(parseScanResponse('[{"name":"rice"}]')).toEqual([{ name: 'rice' }]);
  });

  it('tolerates markdown code fences', () => {
    expect(parseScanResponse('```json\n{"items":[{"name":"rice"}]}\n```')).toEqual([{ name: 'rice' }]);
  });

  it('coerces a numeric quantity to a string', () => {
    expect(parseScanResponse('{"items":[{"name":"eggs","quantity":12}]}')).toEqual([{ name: 'eggs', quantity: '12' }]);
  });

  it('drops entries with a missing or non-string name', () => {
    const out = parseScanResponse('{"items":[{"name":"rice"},{"quantity":"2"},{"name":123},{"name":"   "},null,"nope"]}');
    expect(out).toEqual([{ name: 'rice' }]);
  });

  it('ignores an invalid level but keeps the item', () => {
    expect(parseScanResponse('{"items":[{"name":"oil","level":"enormous"}]}')).toEqual([{ name: 'oil' }]);
  });

  it('normalizes level casing and whitespace', () => {
    expect(parseScanResponse('{"items":[{"name":"oil","level":" HIGH "}]}')).toEqual([{ name: 'oil', level: 'high' }]);
  });

  it('caps overly long names', () => {
    const out = parseScanResponse(JSON.stringify({ items: [{ name: 'x'.repeat(500) }] }));
    expect(out[0].name.length).toBe(200);
  });

  it('truncates to at most 50 items', () => {
    const many = { items: Array.from({ length: 80 }, (_, i) => ({ name: `item ${i}` })) };
    expect(parseScanResponse(JSON.stringify(many))).toHaveLength(50);
  });

  it('returns an empty list for junk, prose, or empty input', () => {
    expect(parseScanResponse('')).toEqual([]);
    expect(parseScanResponse('   ')).toEqual([]);
    expect(parseScanResponse("I'm sorry, I can't see any items.")).toEqual([]);
    expect(parseScanResponse('{"items":"not-an-array"}')).toEqual([]);
    expect(parseScanResponse('{broken json')).toEqual([]);
  });
});
