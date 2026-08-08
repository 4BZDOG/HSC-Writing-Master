import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HEAT_OPACITY } from '../../components/admin/CohortBreakdown';

/**
 * The cohort heatmap writes the percentage inside every cell — the number is the
 * primary encoding and the colour reinforces it — so a step of the ramp is only
 * usable if its label is legible on its own fill.
 *
 * That is easy to get wrong, and it was: the ramp originally ran to full accent
 * with white ink on the top two steps, which measures 2.77:1 in dark mode. The
 * cells a teacher most wants to read (the darkest ones — the students doing
 * best) were the least readable.
 *
 * These tests recompute WCAG contrast from the ramp itself and the LIVE theme
 * tokens in `index.css`, rather than from numbers copied into the test. Retuning
 * the accent, the surface or the ramp therefore fails here instead of quietly
 * making the figures unreadable.
 */

const CSS = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');

type RGB = [number, number, number];

/**
 * Pull an `--color-*: r g b;` token out of a CSS block. `:root` carries the dark
 * theme (it is the default) and `[data-theme='light']` overrides it.
 */
const token = (selector: string, name: string): RGB => {
  const block = new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(CSS);
  if (!block) throw new Error(`index.css: no ${selector} block`);
  const decl = new RegExp(`--${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)`).exec(block[1]);
  if (!decl) throw new Error(`index.css: ${selector} does not define --${name}`);
  return [Number(decl[1]), Number(decl[2]), Number(decl[3])];
};

/** WCAG 2.x relative luminance. */
const luminance = ([r, g, b]: RGB): number => {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const contrast = (a: RGB, b: RGB): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** A translucent fill composited over its opaque backdrop. */
const over = (fill: RGB, alpha: number, backdrop: RGB): RGB =>
  fill.map((c, i) => c * alpha + backdrop[i] * (1 - alpha)) as RGB;

const WHITE: RGB = [255, 255, 255];
/** Tailwind `slate-900`, the `light:` ink on the cells. */
const SLATE_900: RGB = [15, 23, 42];

/**
 * The cell's backdrop. In dark mode that is the modal surface; in light mode the
 * modal is `light:bg-white`. Both are very slightly conservative — the table sits
 * on a faintly tinted wrapper that pushes each theme a touch further from its
 * ink — so passing here means passing on screen.
 */
const THEMES = [
  {
    name: 'dark',
    accent: token(':root', 'color-accent'),
    backdrop: token(':root', 'color-bg-surface'),
    ink: WHITE,
    inkName: 'white',
  },
  {
    name: 'light',
    accent: token("\\[data-theme='light'\\]", 'color-accent'),
    backdrop: WHITE,
    ink: SLATE_900,
    inkName: 'slate-900',
  },
] as const;

/** WCAG AA for body text. The labels are 10px bold — normal text, not large. */
const AA = 4.5;

describe('cohort heatmap ramp', () => {
  it('reads the accent tokens straight out of index.css', () => {
    // Guards the parser itself: a silent regex miss would make every contrast
    // assertion below meaningless.
    expect(token(':root', 'color-accent')).toEqual([14, 165, 233]);
    expect(token("\\[data-theme='light'\\]", 'color-accent')).toEqual([2, 132, 199]);
    expect(token(':root', 'color-bg-surface')).toEqual([18, 24, 38]);
  });

  it('matches the literal Tailwind classes in the component', () => {
    // HEAT_OPACITY exists only so this file can compute contrast; Tailwind needs
    // the classes spelled out. If they drift apart the test measures a ramp the
    // app does not render.
    const source = readFileSync(
      resolve(__dirname, '../../components/admin/CohortBreakdown.tsx'),
      'utf8'
    );
    const emitted = [...source.matchAll(/bg-\[rgb\(var\(--color-accent\)\)\]\/(\d+)/g)].map((m) =>
      Number(m[1])
    );
    expect(emitted).toEqual([...HEAT_OPACITY]);
  });

  it('is a strictly increasing ramp', () => {
    // Sequential encoding: a non-monotonic ramp would misrepresent magnitude.
    for (let i = 1; i < HEAT_OPACITY.length; i++) {
      expect(HEAT_OPACITY[i]).toBeGreaterThan(HEAT_OPACITY[i - 1]);
    }
  });

  for (const theme of THEMES) {
    it(`keeps every step legible in ${theme.name} mode (${theme.inkName} ink)`, () => {
      const failures = HEAT_OPACITY.filter(
        (o) => contrast(theme.ink, over(theme.accent, o / 100, theme.backdrop)) < AA
      ).map(
        (o) =>
          `${o}%: ${contrast(theme.ink, over(theme.accent, o / 100, theme.backdrop)).toFixed(2)}:1`
      );

      expect(failures, `steps below ${AA}:1 — ${failures.join(', ')}`).toEqual([]);
    });
  }

  it('would catch a ramp that ran to full accent', () => {
    // The original bug, pinned so the regression is described rather than merely
    // absent: full accent fails in both themes, whichever ink you choose.
    const dark = THEMES[0];
    const light = THEMES[1];
    expect(contrast(WHITE, dark.accent)).toBeLessThan(AA);
    expect(contrast(SLATE_900, dark.accent)).toBeGreaterThan(AA); // dark mode would need an ink flip…
    expect(contrast(WHITE, light.accent)).toBeLessThan(AA);
    expect(contrast(SLATE_900, light.accent)).toBeLessThan(AA); // …and light mode has no working ink at all
  });
});
