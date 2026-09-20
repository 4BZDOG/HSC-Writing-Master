import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

/**
 * Both themes must have a depth ladder, not just the dark one.
 *
 * This guards the defect the light theme shipped with, which no existing check
 * could see. `index.css` declares the same five surface tokens twice, once per
 * theme, and the dark set spaces them out — 10,15,26 for the page, 18,24,38 for
 * a card, 30,41,59 for something lifted above it. Translated token-for-token to
 * light, those three became 248,250,252 / 255,255,255 / 255,255,255: a 1.05:1
 * step between the page and every card on it, and then no step at all, because
 * `surface` and `elevated` were the same white.
 *
 * Nothing caught it. The unit suites read class strings, so a token whose value
 * is wrong reads the same as one whose value is right. `light-theme.spec.ts`
 * measures TEXT against its background, and text was never the problem — black
 * on white is 21:1 whichever white it is. What went missing was every boundary
 * BETWEEN surfaces, which is not a property of any one element and so is not
 * something a per-element sweep can be asked about. It is a property of the
 * token table, and the token table is a file, so it is checkable here.
 *
 * Measured in ΔL*, not in a WCAG contrast ratio, and the difference matters
 * enough to be the reason this file has its own arithmetic. WCAG contrast is
 * built for text on a background and has a `+0.05` in both terms, which near
 * black swamps the luminances themselves — so the SAME perceptual step scores
 * wildly differently depending on where on the ramp it sits. The dark theme's
 * page-to-card step and the light theme's fixed one are within a quarter of a
 * step of each other perceptually, and WCAG rates them 1.08:1 and 1.23:1. Held
 * to a ratio, this test would either wave the light defect through or fail the
 * dark theme for a step that has always been fine. L* is perceptually uniform,
 * so one floor is honest about both.
 *
 * Two invariants:
 *
 *   1. **The page and a card on it are a visible step apart.** ΔL* ≥ 3. For
 *      scale: the dark theme has always sat at 3.98 and looks right, the light
 *      theme's fixed page is at 8.24, and the value that shipped — the whole
 *      reason for this file — was 1.82.
 *
 *   2. **No two rungs of the ladder are the same colour.** A token that
 *      duplicates another is not a rung, and the component that reaches for it
 *      believes it is asking for a step it will not get — which is exactly how
 *      `surface-elevated` came to be used on strips and menus that then painted
 *      white on white.
 *
 * Only the first pair is held to a distance. The rungs below a card — inset, a
 * raised chip, a strip lying on it — are allowed to be faint, because those
 * surfaces have a border and a shadow of their own to lean on. The page behind
 * a card is the one boundary with nothing else holding it up, which is why it
 * is the one with a number.
 *
 * Deliberately NOT asserted: which direction the ladder runs. In dark,
 * `elevated` is lighter than `surface`; in light it is darker, because white
 * has no headroom above it and elevation in a light interface reads as
 * separation rather than as brightness. Pinning a direction here would pin the
 * dark theme's idiom onto the light one, which is the mistake this whole file
 * exists because of.
 */

const css = readFileSync('index.css', 'utf8');

/** The five tokens that carry depth, page-most first. */
const LADDER = [
  '--color-bg-base',
  '--color-bg-surface',
  '--color-bg-surface-elevated',
  '--color-bg-surface-inset',
  '--color-bg-surface-light',
] as const;

/** The rule body for a selector, so the two themes are read separately. */
const block = (selector: string): string => {
  const at = css.indexOf(selector);
  if (at === -1) throw new Error(`no \`${selector}\` rule in index.css`);
  const open = css.indexOf('{', at);
  return css.slice(open + 1, css.indexOf('}', open));
};

const tokens = (selector: string): Record<string, [number, number, number]> => {
  const body = block(selector);
  const out: Record<string, [number, number, number]> = {};
  for (const name of LADDER) {
    const match = body.match(new RegExp(`${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)\\s*;`));
    if (!match) throw new Error(`\`${name}\` is not declared under \`${selector}\``);
    out[name] = [Number(match[1]), Number(match[2]), Number(match[3])];
  }
  return out;
};

const luminance = ([r, g, b]: [number, number, number]): number => {
  const channel = (v: number): number => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

/** CIE L*: 0 is black, 100 is white, and a step of 1 is about the same amount
 *  of "lighter" wherever on the ramp it is taken. */
const lightness = (rgb: [number, number, number]): number => {
  const y = luminance(rgb);
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
};

const step = (a: [number, number, number], b: [number, number, number]): number =>
  Math.abs(lightness(a) - lightness(b));

/** Where a card stops needing its border to be a card. */
const PAGE_TO_CARD_FLOOR = 3;

describe('every theme has a surface ladder', () => {
  for (const [theme, selector] of [
    ['dark', ':root'],
    ['light', "[data-theme='light']"],
  ] as const) {
    describe(theme, () => {
      it('sets a card a visible step off the page it sits on', () => {
        const t = tokens(selector);
        const delta = step(t['--color-bg-base'], t['--color-bg-surface']);
        expect(
          delta,
          `${theme}: a card is ΔL* ${delta.toFixed(2)} off the page — every card in the app ` +
            `would be relying on its 1px border to exist`
        ).toBeGreaterThanOrEqual(PAGE_TO_CARD_FLOOR);
      });

      it('gives each rung of the ladder its own colour', () => {
        const t = tokens(selector);
        const seen = new Map<string, string>();
        for (const name of LADDER) {
          const key = t[name].join(',');
          const twin = seen.get(key);
          expect(
            twin,
            `${theme}: \`${name}\` is the same colour as \`${twin}\` (rgb(${key})), so a ` +
              `component asking for one of them gets no step`
          ).toBeUndefined();
          seen.set(key, name);
        }
      });
    });
  }
});
