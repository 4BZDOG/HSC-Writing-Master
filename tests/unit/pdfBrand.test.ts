import { describe, it, expect, vi } from 'vitest';
import type { JsPdfLike } from '../../pdf/types';
import { BAND_HEX } from '../../utils/renderUtils';
import { bandRgb, brandMarkHeightMm, drawBrandMark, drawBrandStrip } from '../../pdf/brand';
import { BAND_SCALE, LETTERHEAD } from '../../pdf/types';
import { COLORS, DEFAULT_TITLE, EvaluationExportData } from '../../pdf/buildBlocks';
import type { TextStyleCtx } from '../../pdf/helpers';

/**
 * The brand mark, the band strip, the band scale and the letterhead, drawn against
 * a recording jsPDF stand-in. Each draw call is recorded with the fill and stroke
 * colour in force at the time, so a test can say which colour a rung was painted,
 * not only that it was painted.
 */

type Rgb = [number, number, number];

interface Draw {
  name: string;
  args: unknown[];
  fill: Rgb;
  stroke: Rgb;
  size: number;
}

const makeDoc = () => {
  const draws: Draw[] = [];
  const properties: unknown[] = [];
  let fill: Rgb = [0, 0, 0];
  let stroke: Rgb = [0, 0, 0];
  let size = 0;
  const self: Record<string, unknown> = {};
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      draws.push({ name, args, fill, stroke, size });
      return self;
    };
  const noop = () => self;

  Object.assign(self, {
    internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
    addPage: noop,
    setPage: noop,
    setFont: noop,
    setFontSize: (pt: number) => {
      size = pt;
      return self;
    },
    setTextColor: noop,
    setDrawColor: (r: number, g: number, b: number) => {
      stroke = [r, g, b];
      return self;
    },
    setFillColor: (r: number, g: number, b: number) => {
      fill = [r, g, b];
      return self;
    },
    setLineWidth: noop,
    setLineDashPattern: noop,
    text: record('text'),
    line: record('line'),
    rect: record('rect'),
    roundedRect: record('roundedRect'),
    circle: record('circle'),
    triangle: record('triangle'),
    addImage: noop,
    addFileToVFS: noop,
    addFont: noop,
    getFontList: () => ({}),
    setGState: noop,
    GState: function GState() {},
    saveGraphicsState: noop,
    restoreGraphicsState: noop,
    setCurrentTransformationMatrix: noop,
    Matrix: function Matrix() {},
    splitTextToSize: (text: string) => [String(text)],
    getTextWidth: (t: string) => String(t).length * 0.5,
    outline: { add: () => ({}) },
    setProperties: (p: unknown) => {
      properties.push(p);
      return self;
    },
    save: () => {},
  });

  return { doc: self as unknown as JsPdfLike, draws, properties };
};

/** The most recent document the exporter opened, so a test can read what it drew. */
const current: { draws: Draw[]; properties: unknown[] } = { draws: [], properties: [] };

vi.mock('../../pdf/fontLoader', () => ({
  FONT_FAMILY: 'Inter',
  loadJsPdf: vi.fn(async () => {
    return function JsPDF() {
      const made = makeDoc();
      current.draws = made.draws;
      current.properties = made.properties;
      return made.doc;
    } as unknown as new () => JsPdfLike;
  }),
  // Font loading is exercised in pdfFont.test; here it always falls back.
  loadInterFont: vi.fn(async () => false),
}));

const rgb = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const BAND_ORDER = [1, 2, 3, 4, 5, 6].map((b) => rgb(BAND_HEX[b]));

const sameColour = (a: Rgb, b: Rgb): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

describe('the band colours', () => {
  it('are the BAND_HEX palette, band for band, and nothing else', () => {
    for (let band = 1; band <= 6; band++) {
      expect(bandRgb(band)).toEqual(rgb(BAND_HEX[band]));
    }
  });

  it('clamp to Band 1..6 rather than drawing a colour that is not in the palette', () => {
    expect(bandRgb(0)).toEqual(bandRgb(1));
    expect(bandRgb(9)).toEqual(bandRgb(6));
  });
});

describe('the band strip', () => {
  it('is six segments across the full width, one per band, in band order', () => {
    const { doc, draws } = makeDoc();
    drawBrandStrip(doc, 10, 20, 180, 0.9);

    const rects = draws.filter((d) => d.name === 'rect');
    expect(rects).toHaveLength(6);
    rects.forEach((r, i) => {
      expect(r.fill).toEqual(BAND_ORDER[i]);
      expect(r.args[1]).toBe(20);
      expect(r.args[3]).toBe(0.9);
    });
    // The last segment ends at the right edge of the strip.
    const last = rects[5];
    expect(Number(last.args[0]) + Number(last.args[2])).toBeCloseTo(190, 6);
  });
});

describe('the brand mark', () => {
  it('on a tile: a rounded slate square, the caret in white and the dot in Band 6', () => {
    const { doc, draws } = makeDoc();
    drawBrandMark(doc, 10, 10, 9, { onTile: true });

    const tile = draws.find((d) => d.name === 'roundedRect');
    expect(tile).toBeDefined();
    expect(tile?.fill).toEqual([15, 23, 42]); // slate-900, the app icon's ink
    expect(tile?.args.slice(2, 4)).toEqual([9, 9]);

    const caret = draws.find((d) => d.name === 'triangle');
    expect(caret?.fill).toEqual([255, 255, 255]);
    const circles = draws.filter((d) => d.name === 'circle');
    expect(circles[circles.length - 1].fill).toEqual(bandRgb(6));
  });

  it('bare: six rungs in band order on one baseline, the sixth taller, and an ink caret', () => {
    const { doc, draws } = makeDoc();
    drawBrandMark(doc, 0, 0, 28, { onTile: false });

    const rungs = draws.filter((d) => d.name === 'rect');
    expect(rungs).toHaveLength(6);
    rungs.forEach((r, i) => expect(r.fill).toEqual(BAND_ORDER[i]));

    // At 28mm wide the mark's units are 1mm: a rung is 4 high, and the top one 7.
    const bottoms = rungs.map((r) => Number(r.args[1]) + Number(r.args[3]));
    bottoms.forEach((b) => expect(b).toBeCloseTo(bottoms[0], 6));
    expect(Number(rungs[5].args[3])).toBeCloseTo(7, 6);
    expect(Number(rungs[0].args[3])).toBeCloseTo(4, 6);

    const caret = draws.find((d) => d.name === 'triangle');
    expect(caret?.fill).toEqual(COLORS.ink);
  });

  it('is as tall as its proportions say, at each size', () => {
    // The caret is 5 units wide in a 14 by 16 box, with a unit between it and the
    // top rung, and the top rung 7 units: 28 units wide in all.
    const units = (5 * 16) / 14 + 1 + 7;
    expect(brandMarkHeightMm(28, false)).toBeCloseTo(units, 6);
    expect(brandMarkHeightMm(10, true)).toBeCloseTo((10 * 0.7 * units) / 28, 6);
  });
});

describe('the band scale', () => {
  const ctx: TextStyleCtx = { family: 'helvetica', customFontAvailable: false };

  it('fills each reached rung in its own band colour and outlines the rest', async () => {
    const { drawBandScale } = await import('../../pdf/exportEvaluation');
    const { doc, draws } = makeDoc();
    drawBandScale(doc, ctx, 4, 10, 50, 60, 1, 6);

    const rects = draws.filter((d) => d.name === 'rect');
    expect(rects).toHaveLength(6);
    for (let i = 0; i < 4; i++) {
      expect(rects[i].args[4]).toBe('F');
      expect(rects[i].fill).toEqual(BAND_ORDER[i]);
    }
    for (let i = 4; i < 6; i++) {
      expect(rects[i].args[4]).toBe('S');
      expect(rects[i].stroke).toEqual(COLORS.rule);
    }
  });

  it('draws the band reached taller, growing upward from the shared baseline', async () => {
    const { drawBandScale } = await import('../../pdf/exportEvaluation');
    const { doc, draws } = makeDoc();
    const y = 50;
    const h = BAND_SCALE.heightBaseMm;
    drawBandScale(doc, ctx, 4, 10, y, 60, 1, 6);

    const rects = draws.filter((d) => d.name === 'rect');
    const rung4 = rects[3];
    expect(Number(rung4.args[3])).toBeCloseTo(h * BAND_SCALE.tallRatio, 6);
    expect(Number(rung4.args[1]) + Number(rung4.args[3])).toBeCloseTo(y + h, 6);
    expect(rects[2].args[3]).toBeCloseTo(h, 6);
  });

  it('stands the ink caret over the band reached, with a dot in that band colour', async () => {
    const { drawBandScale } = await import('../../pdf/exportEvaluation');
    const { doc, draws } = makeDoc();
    drawBandScale(doc, ctx, 4, 10, 50, 60, 1, 6);

    const caret = draws.find((d) => d.name === 'triangle');
    expect(caret).toBeDefined();
    expect(caret?.fill).toEqual(COLORS.ink);
    // Centred on the fourth segment: three segments and three gaps to its left,
    // then half of it.
    const segW = (60 - BAND_SCALE.segmentGapBaseMm * 5) / 6;
    const cx = 10 + 3 * (segW + BAND_SCALE.segmentGapBaseMm) + segW / 2;
    expect(Number(caret?.args[0])).toBeCloseTo(cx, 6);
    // The point sits a gap above the tall rung.
    const tallTop = 50 + BAND_SCALE.heightBaseMm - BAND_SCALE.heightBaseMm * BAND_SCALE.tallRatio;
    expect(Number(caret?.args[1])).toBeCloseTo(tallTop - BAND_SCALE.caretGapBaseMm, 6);

    const circles = draws.filter((d) => d.name === 'circle');
    expect(circles[circles.length - 1].fill).toEqual(bandRgb(4));
  });

  it('stops at its own ceiling: a Band 1 question draws one rung and its caret on it', async () => {
    const { drawBandScale } = await import('../../pdf/exportEvaluation');
    const { doc, draws } = makeDoc();
    drawBandScale(doc, ctx, 1, 10, 50, 60, 1, 1);

    const rects = draws.filter((d) => d.name === 'rect');
    expect(rects).toHaveLength(1);
    expect(rects[0].fill).toEqual(bandRgb(1));
    expect(draws.filter((d) => d.name === 'triangle')).toHaveLength(1);
  });
});

describe('the letterhead and the title', () => {
  const data = (): EvaluationExportData => ({
    question: 'Describe the key steps involved in DNA replication.',
    verb: 'DESCRIBE',
    totalMarks: 6,
    overallMark: 4,
    overallBand: 4,
    overallFeedback: 'A sound response.',
    quickTip: 'Name the enzymes.',
    strengths: [],
    improvements: [],
    criteria: [{ criterion: 'Accuracy', mark: 3, maxMark: 3, feedback: 'Correct.' }],
  });

  const printed = () =>
    current.draws.filter((d) => d.name === 'text').map((d) => String(d.args[0]));

  it('states the product in the letterhead, and the report by its own name beneath it', async () => {
    const { exportEvaluationPdf } = await import('../../pdf/exportEvaluation');
    await exportEvaluationPdf({ data: data(), onToast: () => {}, onProgress: () => {} });

    expect(printed()).toContain('BAND 6');
    expect(printed()).toContain('HSC Writing Coach');
    expect(printed()).toContain(DEFAULT_TITLE.toUpperCase());
    expect(DEFAULT_TITLE).toBe('Marking feedback');
  });

  it('sets the wordmark smaller than the report title, so the report keeps its name largest', async () => {
    const { exportEvaluationPdf } = await import('../../pdf/exportEvaluation');
    await exportEvaluationPdf({ data: data(), onToast: () => {}, onProgress: () => {} });

    const sizeOf = (text: string) =>
      current.draws.find((d) => d.name === 'text' && d.args[0] === text)?.size ?? 0;
    expect(sizeOf('BAND 6')).toBeGreaterThan(0);
    expect(sizeOf('BAND 6')).toBeLessThan(sizeOf('MARKING FEEDBACK'));
    expect(LETTERHEAD.wordPt).toBeLessThan(17);
  });

  it('gives the document the product as its author, and the report as its title', async () => {
    const { exportEvaluationPdf } = await import('../../pdf/exportEvaluation');
    await exportEvaluationPdf({ data: data(), onToast: () => {}, onProgress: () => {} });

    const props = current.properties[0] as { author: string; title: string };
    expect(props.author).toBe('HSC Writing Coach');
    expect(props.title).toMatch(/^Marking feedback/);
  });

  it('draws the footer mark before the page number, so the mark leads the footer', async () => {
    const { exportEvaluationPdf } = await import('../../pdf/exportEvaluation');
    await exportEvaluationPdf({ data: data(), onToast: () => {}, onProgress: () => {} });

    const idx = current.draws.findIndex(
      (d) => d.name === 'text' && String(d.args[0]).startsWith('Page 1 of')
    );
    expect(idx).toBeGreaterThan(-1);
    // The footer's mark is the last band-1 rung drawn before the page number: it
    // stands on the left margin, and the number sits to its right.
    const rungs = current.draws
      .slice(0, idx)
      .filter((d) => d.name === 'rect' && sameColour(d.fill, bandRgb(1)));
    const footerRung = rungs[rungs.length - 1];
    expect(Number(footerRung.args[0])).toBeCloseTo(10, 6);
    expect(Number(current.draws[idx].args[1])).toBeGreaterThan(
      Number(footerRung.args[0]) + Number(footerRung.args[2])
    );
  });
});
