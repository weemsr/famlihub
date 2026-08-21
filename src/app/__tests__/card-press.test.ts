import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the fix for the recipe scaler being hard to tap.
 *
 * `.card:active { transform: scale(0.98) }` applied to every card, including
 * the ~1600px recipe container. Displacement grows with distance from the
 * card's centre, so pressing a scale button near the top moved it ~13px — half
 * its own height — out from under the user's finger, animated over 0.2s.
 *
 * Press feedback must stay scoped to cards that are actually pressable.
 */
const css = readFileSync(join(__dirname, '..', 'globals.css'), 'utf8');

describe('card press feedback', () => {
  it('never applies the scale transform to a bare .card', () => {
    expect(css).not.toMatch(/^\.card:active\s*\{/m);
  });

  it('keeps it for cards that are links or buttons', () => {
    expect(css).toMatch(/a\.card:active,\s*\n\s*button\.card:active\s*\{/);
    expect(css).toMatch(/a\.card:active[\s\S]{0,80}transform:\s*scale\(0\.98\)/);
  });

  it('does not animate transform on non-interactive cards', () => {
    const cardBlock = css.slice(css.indexOf('\n.card {'), css.indexOf('\n.card {') + 400);
    expect(cardBlock).not.toContain('transition: transform');
  });
});
