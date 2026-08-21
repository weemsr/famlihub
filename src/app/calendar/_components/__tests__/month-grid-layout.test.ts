import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the fix for the month grid overflowing every phone screen.
 *
 * A plain `1fr` track floors at min-content, and because the day cells are
 * square that floor comes from their *height* (~55px). Seven of those plus gaps
 * measured 479px against a 393px iPhone viewport, so the whole page scrolled
 * sideways and Saturday was clipped off the screen.
 *
 * This asserts on the source rather than a rendered layout so it runs in CI
 * without a browser. A real render check lives outside the repo; if this ever
 * needs to catch subtler regressions, promote it to a Playwright test.
 */
const source = readFileSync(join(__dirname, '..', 'MonthGrid.tsx'), 'utf8');

describe('MonthGrid layout invariants', () => {
  it('uses minmax(0, 1fr) so tracks can shrink below min-content', () => {
    expect(source).toContain('repeat(7, minmax(0, 1fr))');
    expect(source).not.toMatch(/gridTemplateColumns:\s*'repeat\(7,\s*1fr\)'/);
  });

  it('sets minWidth: 0 on the square day cells', () => {
    expect(source).toMatch(/minWidth:\s*0/);
  });

  it('keeps the day number at a viewport-responsive size', () => {
    // A fixed 1rem no longer fits once the cell is ~40px wide.
    expect(source).toMatch(/fontSize:\s*'clamp\(/);
  });
});
