import { describe, it, expect } from 'vitest';
import { cardHeaderWash } from '../../utils/cardChrome';
import { getBandInkRgb } from '../../utils/renderUtils';

/**
 * The card header's title is white on the band wash (`cardHeaderWash`), and the
 * chips in the header are white on a black wash over it. These pin the contrast
 * of both, for every band, in both themes, at every progress level the writing
 * card can show.
 *
 * The wash is drawn from `BAND_HEX_INK` through `getBandInkRgb`, so this reads
 * the same table the app does. The veil is the one thing that differs by theme:
 * the writing card lays `.progress-veil` over the wash, dark in the dark theme
 * and slate at 45% in the light, with strength `(1 - progress) * 0.6`. The bare
 * wash is the worst case (progress 1, no veil), and the veil only darkens it.
 */

type Rgb = [number, number, number];

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

const THEMES: Record<string, { veil: Rgb; veilOpacity: number }> = {
  light: { veil: [15, 23, 42], veilOpacity: 0.45 },
  dark: { veil: [2, 6, 23], veilOpacity: 1 },
};

const PROGRESS = [0, 0.5, 1];

const parseTriplet = (triplet: string): Rgb => {
  const [r, g, b] = triplet.split(' ').map(Number);
  return [r, g, b];
};

const linear = (channel: number): number => {
  const v = channel / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

const luminance = ([r, g, b]: Rgb): number =>
  0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

const contrast = (a: Rgb, b: Rgb): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** `top` at `alpha` laid over `bottom`. */
const over = (top: Rgb, alpha: number, bottom: Rgb): Rgb =>
  [0, 1, 2].map((i) => top[i] * alpha + bottom[i] * (1 - alpha)) as Rgb;

/** The ground a title sits on at a given progress, in a given theme. */
const groundAt = (band: number, theme: string, progress: number): Rgb => {
  const base = parseTriplet(getBandInkRgb(band));
  const { veil, veilOpacity } = THEMES[theme];
  const alpha = (1 - progress) * 0.6 * veilOpacity;
  return alpha > 0 ? over(veil, alpha, base) : base;
};

describe('the card header wash', () => {
  it.each([1, 2, 3, 4, 5, 6])('band %i is painted from the band ink step, not the fill', (band) => {
    expect(cardHeaderWash(band)).toContain(`rgb(${getBandInkRgb(band)})`);
  });
});

describe.each(Object.keys(THEMES))('card header contrast (%s theme)', (theme) => {
  it.each([1, 2, 3, 4, 5, 6])(
    'band %i: white title clears 4.5:1 at every progress level',
    (band) => {
      for (const progress of PROGRESS) {
        expect(contrast(WHITE, groundAt(band, theme, progress))).toBeGreaterThanOrEqual(4.5);
      }
    }
  );

  it.each([1, 2, 3, 4, 5, 6])(
    'band %i: white header chips on a black/20 wash clear 4.5:1',
    (band) => {
      for (const progress of PROGRESS) {
        const chip = over(BLACK, 0.2, groundAt(band, theme, progress));
        expect(contrast(WHITE, chip)).toBeGreaterThanOrEqual(4.5);
      }
    }
  );
});
