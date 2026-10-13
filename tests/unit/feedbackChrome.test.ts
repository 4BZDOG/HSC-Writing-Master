import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { BAND_HEX } from '../../utils/renderUtils';
import {
  FEEDBACK_CARD,
  INK_BUTTON,
  INK_CHIP,
  PRIMARY_ACTION,
  SECONDARY_ACTION,
} from '../../components/feedback/feedbackChrome';
import { LADDER_SOLID } from '../../utils/ladderChrome';

/**
 * The marking report's contrast, measured on the tokens it is drawn from.
 *
 * Bands 2–4 measure 1.9–2.8:1 under white text, which is why the placard, its
 * actions and the rewrite's CTA are ink on `band-solid`. This reads `index.css`
 * for the band's solid colour, its gradient's white and black stops, the ink it
 * sets, and the band-fill alphas, then measures every text pair the report puts
 * on a band in BOTH themes, at the worst point of the gradient it sits on.
 */

const css = readFileSync('index.css', 'utf8');

type RGB = [number, number, number];

const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** `alpha` of `fg` over `bg`. */
const over = (fg: RGB, bg: RGB, alpha: number): RGB =>
  [0, 1, 2].map((i) => fg[i] * alpha + bg[i] * (1 - alpha)) as RGB;

const luminance = (rgb: RGB): number => {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: RGB, b: RGB): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** The body of a plain CSS rule, by its selector. */
const ruleBody = (selector: string): string => {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no rule for ${selector} in index.css`);
  return css.slice(start, css.indexOf('}', start));
};

const solid = ruleBody('.band-solid');
const SOLID_INK = (() => {
  const m = solid.match(/color:\s*rgb\((\d+) (\d+) (\d+)\)/);
  if (!m) throw new Error('.band-solid no longer sets its ink');
  return [Number(m[1]), Number(m[2]), Number(m[3])] as RGB;
})();
const WHITE_STOP = Number(solid.match(/rgb\(255 255 255 \/ ([\d.]+)\) 0%/)![1]);
const BLACK_STOP = Number(solid.match(/rgb\(0 0 0 \/ ([\d.]+)\) 100%/)![1]);

const alphaOf = (selector: string): number => {
  const m = ruleBody(selector).match(/--band-fill-alpha:\s*([\d.]+)/);
  if (!m) throw new Error(`${selector} sets no --band-fill-alpha`);
  return Number(m[1]);
};
const BAND_FILL_DARK = alphaOf('.band-fill');
const BAND_FILL_LIGHT = alphaOf("[data-theme='light'] .band-fill");

/** Tailwind's slate, at the steps the report's text uses. */
const SLATE: Record<string, RGB> = {
  '300': [203, 213, 225],
  '600': [71, 85, 105],
  '700': [51, 65, 85],
  '800': [30, 41, 59],
  '950': [2, 6, 23],
};

/** The two themes' surfaces, read from the same tokens the report's cards use. */
const SURFACE = {
  light: [255, 255, 255] as RGB,
  dark: hex('#121826') as RGB, // 18 24 38, `--color-bg-surface` in the root theme
};

const bands = [1, 2, 3, 4, 5, 6];
const themes = ['light', 'dark'] as const;

/**
 * The band as the report draws a text ground: flat, at the band's own colour
 * (`BAND_GROUND`). `band-solid`'s bottom-right shade is measured too, to show why it is not used.
 */
const flatGround = (band: number): RGB[] => [hex(BAND_HEX[band])];

/** The shade `band-solid` adds: the black stop at its bottom-right corner. */
const shadeEnd = (band: number): RGB[] => [over([0, 0, 0], hex(BAND_HEX[band]), BLACK_STOP)];

describe('the report on a band solid: dark ink, never white', () => {
  it('reads the ink and gradient stops that band-solid sets, and no white text is in the report', () => {
    expect(SOLID_INK).toEqual([2, 6, 23]);
    expect(WHITE_STOP).toBeGreaterThan(0);
    for (const cls of [LADDER_SOLID, PRIMARY_ACTION, INK_BUTTON, INK_CHIP]) {
      expect(cls).not.toMatch(/\btext-white\b/);
    }
  });

  for (const band of bands) {
    for (const theme of themes) {
      it(`the placard's ink clears AA on band ${band}, ${theme} theme`, () => {
        // The placard's ground is the flat band in both themes; the theme does not
        // reach under its ink.
        for (const end of flatGround(band)) {
          expect(contrast(SOLID_INK, end), `band ${band} ${theme}`).toBeGreaterThanOrEqual(4.5);
        }
      });

      it(`the ink chips and actions on band ${band} clear AA at rest and on hover, ${theme} theme`, () => {
        // A white wash over the band at 25% (rest) and 35% (hover) raises the ground
        // the ink sits on, so it can only help the contrast.
        for (const end of flatGround(band)) {
          for (const a of [0.25, 0.35]) {
            const ground = over([255, 255, 255], end, a);
            expect(contrast(SOLID_INK, ground), `band ${band} at ${a}`).toBeGreaterThanOrEqual(4.5);
          }
        }
      });
    }
  }

  it('the shade band-solid adds takes band 6 under AA, which is why the report does not use it for text', () => {
    // Recorded, not asserted as a rule for the rest of the app: this is the number
    // that moved the report to a flat ground.
    const shade = shadeEnd(6)[0];
    expect(contrast(SOLID_INK, shade)).toBeLessThan(4.5);
  });
});

describe('the rows and notes painted on the band fill, in both themes', () => {
  // Text on LADDER_FILL is painted over the band at its strongest (the gutter's edge)
  // and at its faintest (the far end of the row). Both ends must clear AA.
  const textPairs: Array<{ name: string; ink: RGB; theme: 'light' | 'dark' }> = [
    { name: 'note label (slate-600)', ink: SLATE['600'], theme: 'light' },
    { name: 'note tip (slate-800)', ink: SLATE['800'], theme: 'light' },
    { name: 'criterion body (slate-700)', ink: SLATE['700'], theme: 'light' },
    { name: 'note label (slate-300)', ink: SLATE['300'], theme: 'dark' },
    { name: 'note tip (slate-100)', ink: hex('#f1f5f9'), theme: 'dark' },
    { name: 'criterion body (slate-300)', ink: SLATE['300'], theme: 'dark' },
  ];

  for (const band of bands) {
    for (const pair of textPairs) {
      it(`${pair.name} on band ${band}, ${pair.theme} theme`, () => {
        const surface = SURFACE[pair.theme];
        const alpha = pair.theme === 'light' ? BAND_FILL_LIGHT : BAND_FILL_DARK;
        const base = hex(BAND_HEX[band]);
        // The gutter edge (full band-fill alpha) and the far end (the 0.07 stop).
        for (const a of [alpha, 0.07]) {
          const ground = over(base, surface, a);
          expect(contrast(pair.ink, ground), `${pair.name} at ${a}`).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  }
});

describe('the report surfaces are the ladder, not white slabs', () => {
  it('a report card is paper with an edge, not a bare white box', () => {
    expect(FEEDBACK_CARD).toContain('bg-surface');
    expect(FEEDBACK_CARD).toContain('border-slate-300');
    expect(FEEDBACK_CARD).not.toMatch(/\bbg-white\b/);
  });

  it('secondary actions sit on the ladder, not on a white button', () => {
    expect(SECONDARY_ACTION).toContain('bg-surface-elevated');
    expect(SECONDARY_ACTION).not.toMatch(/\bbg-white\b(?!\/)/);
  });

  it('every control is at least 44px on a phone', () => {
    for (const cls of [SECONDARY_ACTION, PRIMARY_ACTION, INK_BUTTON]) {
      expect(cls).toMatch(/min-h-11/);
      expect(cls).toMatch(/sm:min-h-0/);
    }
  });
});
