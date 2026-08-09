import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * `.clip-stable` is on ~50 cards, and it carries a `-webkit-mask-image` whose
 * only job is to force the browser onto a masked compositing path so a rounded
 * clip is honoured from the first frame. The mask itself must be visually
 * inert.
 *
 * The usual spelling of that hack — `-webkit-radial-gradient(white, black)` —
 * is not inert. With the default ellipse at `farthest-corner`, alpha runs from
 * 1 at the centre to 0 at the corners, so it is a vignette: every card faded
 * towards its edges and faded WORST at the corners, exactly where the gradient
 * reaches black. What that looks like is a 1px border that is crisp along the
 * straight runs and thins out around each arc — in both themes, since the mask
 * has nothing to do with colour.
 *
 * jsdom parses no stylesheets and would not evaluate a mask if it did, so this
 * reads the source. Crude, but it is the only place the invariant can live.
 */
const raw = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');

/**
 * Comments stripped, because this file DISCUSSES the broken form in prose and
 * a naive search finds the explanation rather than a declaration.
 */
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * The mask on `.clip-stable` specifically. Other rules legitimately use a
 * vignette mask — the auth backdrop is meant to fade at its edges — so the
 * assertion has to name this rule rather than the first mask in the file.
 */
const clipStableMask = (): string => {
  const rule = css.match(/\.clip-stable\s*\{[^}]*-webkit-mask-image:\s*([^;]+);[^}]*\}/);
  expect(rule, '.clip-stable no longer declares a -webkit-mask-image').toBeTruthy();
  return rule![1].trim();
};

describe('rounded corners keep their stroke', () => {
  it('masks .clip-stable with a flat opaque gradient, not a vignette', () => {
    const mask = clipStableMask();

    // Both stops pinned at the same position is what makes it flat: there is
    // no run of the gradient over which alpha can fall.
    expect(mask).toMatch(/white\s+100%/);
    expect(mask).toMatch(/black\s+100%/);
  });

  it('never reverts to the bare two-colour form that fades the corners', () => {
    // `-webkit-radial-gradient(white, black)` with no stops is the regression.
    expect(clipStableMask()).not.toMatch(
      /-webkit-radial-gradient\(\s*(?:circle\s*,\s*)?white\s*,\s*black\s*\)/
    );
  });

  it('keeps the mask scoped so it cannot become a global paint cost', () => {
    expect(css).toMatch(/@supports \(-webkit-hyphens: none\)/);
  });
});
