// pdf/brand.ts
//
// The app's mark, drawn with jsPDF primitives so the PDFs carry the same product
// as the screen. It is the same mark as `components/BandLadderMark.tsx` (the
// header tile and the sign-in lockup) and as `public/favicon.svg` (the app icon):
// the band scale, landed on 6. Six equal square rungs in a row, each in its own
// band's colour (`BAND_HEX`), the sixth taller than the rest, and a caret — the
// map-pin marker from the marking wait — standing over it. The caret is where the
// student landed.
//
// The proportions follow BandLadderMark's `mark` size, which is the header tile's
// and the favicon's: in a 40px tile, the mark is 32px across, the rungs 8px high,
// the top rung 14px, the caret 8px wide with 1px between it and the top rung. The
// units below are those pixels, so a fraction of the tile is a fraction of the
// mark. The caret is the 14x16 box of the SVG path
// `M7 16 L1 5 A6 6 0 1 1 13 5 Z`, drawn as the triangle plus the circle that path
// describes, with the Band 6 dot in its head. Keep these in step with the screen:
// a student who has seen the header should see the same mark on the page.
//
// The one colour this module adds is the tile's slate-900 (the app icon's ink);
// every band colour comes from `BAND_HEX`, and nothing here is set in a band
// colour as TEXT. Band text on paper is the ink step (see `bandInkColor`).

import { JsPdfLike, LETTERHEAD } from './types';
import { BAND_HEX } from '../utils/renderUtils';
import { COLORS } from './buildBlocks';

export type Rgb = [number, number, number];

/** #rrggbb -> the RGB triple the exporter draws in. The one hex conversion for brand colours. */
const hexToRgb = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/**
 * A band's fill colour, from `BAND_HEX`: the rungs, the strip and the dots.
 * Fills only. Text in a band colour takes the ink step instead.
 */
export const bandRgb = (band: number): Rgb =>
  hexToRgb(BAND_HEX[Math.max(1, Math.min(6, Math.round(band)))]);

/** Slate-900, the ink of the app icon's tile (#0f172a). */
const TILE: Rgb = [15, 23, 42];
const WHITE: Rgb = [255, 255, 255];
const TOP_BAND = 6;

/**
 * The mark in its own units, the header tile's pixels: 32 across, rungs 8 high,
 * the top rung 14, the caret 8 wide, one unit between the caret and the top rung.
 */
const UNITS = { width: 32, gap: 2, rung: 8, tall: 14, caretW: 8, caretGap: 1 };
const RUNG_W = (UNITS.width - 5 * UNITS.gap) / 6;
/** The caret's SVG box: 14 wide, 16 tall, with the point at the bottom. */
const CARET_BOX = { w: 14, h: 16 };
const CARET_H_U = (UNITS.caretW * CARET_BOX.h) / CARET_BOX.w;
/** The whole mark, caret included, in units: the caret, its gap, and the top rung. */
const MARK_HEIGHT_U = CARET_H_U + UNITS.caretGap + UNITS.tall;

/** The footer's bare mark: its width in base mm, and the gap before the page number. */
export const FOOTER_MARK = { widthBaseMm: 5, gapBaseMm: 1.6 };

/**
 * Height (mm) of the mark. `sizeMm` is the tile's side when `onTile`, and the
 * mark's own width when bare, matching `drawBrandMark`.
 */
export const brandMarkHeightMm = (sizeMm: number, onTile: boolean): number => {
  const markW = onTile ? sizeMm * LETTERHEAD.markFraction : sizeMm;
  return (markW / UNITS.width) * MARK_HEIGHT_U;
};

/**
 * The caret, the map-pin marker: a point down, a round head, and a dot in the head
 * in `dot`. `tipX`/`tipY` is the point, and `widthMm` the full width of the head.
 * The head's centre is 11 units above the point, the dot's centre 10.5, which are
 * the SVG path's (7,5) and (7,5.5) measured up from its tip at (7,16).
 */
export const drawCaret = (
  doc: JsPdfLike,
  tipX: number,
  tipY: number,
  widthMm: number,
  ink: Rgb,
  dot: Rgb
): void => {
  const k = widthMm / CARET_BOX.w;
  const headY = tipY - 11 * k;
  const r = 6 * k;
  doc.setFillColor(ink[0], ink[1], ink[2]);
  // The triangle's base runs across the head's diameter, so its sides meet the
  // circle where the path's do; the circle then rounds the top.
  doc.triangle(tipX, tipY, tipX - r, headY, tipX + r, headY, 'F');
  doc.circle(tipX, headY, r, 'F');
  doc.setFillColor(dot[0], dot[1], dot[2]);
  doc.circle(tipX, tipY - 10.5 * k, 2.2 * k, 'F');
};

/** The six rungs and the caret, with the mark's top-left at (x, y). Rungs stand on one baseline. */
const drawMarkCore = (doc: JsPdfLike, x: number, y: number, widthMm: number, ink: Rgb): void => {
  const u = widthMm / UNITS.width;
  const baseline = y + MARK_HEIGHT_U * u;
  for (let band = 1; band <= 6; band++) {
    const left = x + (band - 1) * (RUNG_W + UNITS.gap) * u;
    const h = (band === TOP_BAND ? UNITS.tall : UNITS.rung) * u;
    const c = bandRgb(band);
    doc.setFillColor(c[0], c[1], c[2]);
    doc.rect(left, baseline - h, RUNG_W * u, h, 'F');
  }
  const topCentre = x + (5 * (RUNG_W + UNITS.gap) + RUNG_W / 2) * u;
  drawCaret(doc, topCentre, y + CARET_H_U * u, UNITS.caretW * u, ink, bandRgb(TOP_BAND));
};

/**
 * The mark at (x, y), its top-left corner.
 *
 * On a tile the tile is a rounded slate-900 square of side `sizeMm`, with the mark
 * at the app's proportion (70% of the tile) and a white caret. Bare, `sizeMm` is
 * the mark's width and its caret is the page's ink.
 */
export const drawBrandMark = (
  doc: JsPdfLike,
  x: number,
  y: number,
  sizeMm: number,
  opts: { onTile: boolean }
): void => {
  if (!opts.onTile) {
    drawMarkCore(doc, x, y, sizeMm, COLORS.ink);
    return;
  }
  const r = sizeMm * 0.25;
  doc.setFillColor(TILE[0], TILE[1], TILE[2]);
  doc.roundedRect(x, y, sizeMm, sizeMm, r, r, 'F');
  const markW = sizeMm * LETTERHEAD.markFraction;
  const markH = brandMarkHeightMm(sizeMm, true);
  drawMarkCore(doc, x + (sizeMm - markW) / 2, y + (sizeMm - markH) / 2, markW, WHITE);
};

/**
 * The band strip: the six band colours in a row, edge to edge, as a hairline along
 * the foot of the letterhead. Each segment overlaps the next by a hair, so a
 * viewer's anti-aliasing does not draw a seam between two colours.
 */
export const drawBrandStrip = (
  doc: JsPdfLike,
  x: number,
  y: number,
  width: number,
  heightMm: number
): void => {
  const seg = width / 6;
  for (let band = 1; band <= 6; band++) {
    const c = bandRgb(band);
    doc.setFillColor(c[0], c[1], c[2]);
    const w = band === 6 ? seg : seg + 0.05;
    doc.rect(x + (band - 1) * seg, y, w, heightMm, 'F');
  }
};
