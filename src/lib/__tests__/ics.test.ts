import { describe, it, expect } from 'vitest';
import { mealsToIcs } from '../ics';

const meal = (over: Partial<{ id: string; body: Record<string, unknown> }> = {}) => ({
  id: over.id ?? 'abc123',
  body: { day: '2026-07-20', mealId: 'Dinner', customName: 'Tacos', ...(over.body || {}) },
});

describe('mealsToIcs', () => {
  it('emits a valid calendar wrapper', () => {
    const ics = mealsToIcs([], []);
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).toContain('PRODID');
  });

  it('creates an all-day event with exclusive DTEND (next day)', () => {
    const ics = mealsToIcs([meal()], []);
    expect(ics).toContain('DTSTART;VALUE=DATE:20260720');
    expect(ics).toContain('DTEND;VALUE=DATE:20260721');
    expect(ics).toContain('UID:meal-abc123@famlihub.vercel.app');
    expect(ics).toContain('TRANSP:TRANSPARENT');
  });

  it('rolls DTEND across month boundaries', () => {
    const ics = mealsToIcs([meal({ body: { day: '2026-07-31', mealId: 'Lunch', customName: 'Soup' } })], []);
    expect(ics).toContain('DTSTART;VALUE=DATE:20260731');
    expect(ics).toContain('DTEND;VALUE=DATE:20260801');
  });

  it('skips meals with unparseable days instead of crashing', () => {
    const ics = mealsToIcs([meal({ body: { day: 'Monday', mealId: 'Dinner', customName: 'X' } })], []);
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('escapes commas, semicolons, and newlines per RFC 5545', () => {
    const ics = mealsToIcs(
      [meal({ body: { day: '2026-07-20', mealId: 'Dinner', customName: 'Mac; and, cheese', note: 'line1\nline2' } })],
      []
    );
    expect(ics).toContain('Mac\\; and\\, cheese');
    expect(ics).toContain('line1\\nline2');
  });

  it('prefers the linked recipe title over customName', () => {
    const m = meal({ body: { day: '2026-07-20', mealId: 'Dinner', recipeId: 'r1', customName: 'fallback' } });
    const ics = mealsToIcs([m], [{ id: 'r1', title: 'Beef and Broccoli' }]);
    expect(ics).toContain('Beef and Broccoli');
    expect(ics).not.toContain('fallback');
  });

  it('folds long content lines to spec-compliant continuation lines', () => {
    const longName = 'A'.repeat(120);
    const ics = mealsToIcs([meal({ body: { day: '2026-07-20', mealId: 'Dinner', customName: longName } })], []);
    const summaryChunk = ics.split('\r\n').find(l => l.startsWith('SUMMARY:'));
    expect(summaryChunk).toBeDefined();
    expect(summaryChunk!.length).toBeLessThanOrEqual(75);
    expect(ics).toContain('\r\n '); // folded continuation
  });

  it('folds by octets, not JS string length', () => {
    // Regression: every SUMMARY leads with an emoji, so a 75-character line
    // could be 80+ octets — over the RFC 5545 limit.
    const name = 'Bœuf bourguignon aux légumes rôtis 🍲🥘🍛 with a very long trailing description';
    const ics = mealsToIcs([meal({ body: { day: '2026-07-20', mealId: 'Dinner', customName: name } })], []);
    const lines = ics.split('\r\n');
    for (const line of lines) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
  });

  it('never splits a surrogate pair or an escape sequence', () => {
    const name = '🍲'.repeat(40) + ', and ; more';
    const ics = mealsToIcs([meal({ body: { day: '2026-07-20', mealId: 'Dinner', customName: name } })], []);
    // A lone surrogate would mean a multi-byte character was cut in half.
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(ics)).toBe(false);
    // Unfolding must restore the escaped punctuation intact.
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain('\\, and \\; more');
  });
});
