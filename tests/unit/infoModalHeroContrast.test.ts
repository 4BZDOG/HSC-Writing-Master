import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import colors from 'tailwindcss/colors';
import { BAND_HEX, getBandConfig } from '../../utils/renderUtils';

/**
 * The info modals' hero head is a band wash over the paper, with a solid tile and
 * the verb or outcome set in the text inks. This holds every ink on that head to
 * AA for all six bands, in both themes, by reading the tokens from `index.css` and
 * the band palette from `renderUtils`, so a change to either is what the test sees.
 */

type RGB = [number, number, number];

const css = readFileSync('index.css', 'utf8');

/** The `--color-*` triplets declared in one theme block. */
const tokens = (selector: string): Record<string, RGB> => {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`theme block ${selector} not found in index.css`);
  const block = css.slice(start, css.indexOf('}', start));
  const out: Record<string, RGB> = {};
  for (const [, name, r, g, b] of block.matchAll(/--color-([\w-]+):\s*(\d+)\s+(\d+)\s+(\d+);/g)) {
    out[name] = [Number(r), Number(g), Number(b)];
  }
  return out;
};

const THEMES: Record<string, { tokens: Record<string, RGB>; labelClass: 'text' | 'light:text' }> = {
  dark: { tokens: tokens(':root {'), labelClass: 'text' },
  light: { tokens: tokens("[data-theme='light'] {"), labelClass: 'light:text' },
};

const hexToRgb = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Source-over of a colour at an alpha onto an opaque ground. */
const over = (fg: RGB, alpha: number, bg: RGB): RGB =>
  fg.map((c, i) => c * alpha + bg[i] * (1 - alpha)) as RGB;

const luminance = (rgb: RGB): number => {
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: RGB, b: RGB): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * The Tailwind colour a `text-<family>-<step>` class names, taken from the
 * `tailwindcss/colors` package the palette itself is drawn from.
 */
const classColour = (classes: string, prefix: 'text' | 'light:text'): RGB => {
  const escaped = prefix.replace(':', '\\:');
  const match = classes.match(new RegExp(`(?:^|\\s)${escaped}-([a-z]+)-(\\d{2,3})(?=\\s|$)`));
  if (!match) throw new Error(`no ${prefix}-<colour> class in "${classes}"`);
  const family = (colors as unknown as Record<string, Record<string, string>>)[match[1]];
  return hexToRgb(family[match[2]]);
};

/** Opacity of the hero wash at the point its text sits: the wash is strongest at its left edge. */
const WASH_ALPHA = 0.16;
/** The quiet ladder row's wash (`band-wash`). */
const QUIET_ALPHA = 0.1;
/** Ink on a band-solid fill, as `band-solid` sets it. */
const SOLID_INK: RGB = [2, 6, 23];

describe('info-modal hero head contrast', () => {
  for (const [themeName, theme] of Object.entries(THEMES)) {
    describe(`${themeName} theme`, () => {
      const surface = theme.tokens['bg-surface'];
      const primary = theme.tokens['text-primary'];
      const secondary = theme.tokens['text-secondary'];
      const muted = theme.tokens['text-muted'];

      it('reads the tokens it needs from the theme block', () => {
        expect(surface).toBeDefined();
        expect(primary).toBeDefined();
        expect(secondary).toBeDefined();
        expect(muted).toBeDefined();
      });

      for (const band of [1, 2, 3, 4, 5, 6]) {
        it(`holds the head's text to AA on band ${band}`, () => {
          const bandRgb = hexToRgb(BAND_HEX[band]);
          const wash = over(bandRgb, WASH_ALPHA, surface);
          const checks: Array<[string, RGB, RGB, number]> = [
            ['eyebrow (text-muted)', muted, wash, 4.5],
            ['verb or outcome (text-primary)', primary, wash, 4.5],
            ['definition (text-primary)', primary, wash, 4.5],
            ['close icon (text-secondary, a 3:1 icon)', secondary, wash, 3],
            ['solid tile ink on band-solid', SOLID_INK, bandRgb, 4.5],
          ];
          for (const [label, fg, bg, min] of checks) {
            const ratio = contrast(fg, bg);
            expect(
              ratio,
              `${label} on band ${band} is ${ratio.toFixed(2)}:1`
            ).toBeGreaterThanOrEqual(min);
          }
        });

        it(`holds a quiet mark figure to AA on band ${band}`, () => {
          // The verb sheet's ladder rows are quiet: the figure is the band's text step
          // on the wash, and it has to read there.
          const bandRgb = hexToRgb(BAND_HEX[band]);
          const quiet = over(bandRgb, QUIET_ALPHA, surface);
          const ink = classColour(getBandConfig(band).text, theme.labelClass);
          const ratio = contrast(ink, quiet);
          expect(
            ratio,
            `quiet figure on band ${band} is ${ratio.toFixed(2)}:1`
          ).toBeGreaterThanOrEqual(4.5);
        });
      }
    });
  }
});
