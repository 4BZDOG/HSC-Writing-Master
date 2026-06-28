import { describe, it, expect } from 'vitest';
import {
  computeGeometry,
  flowBlocks,
  chooseScale,
  measureBlocks,
  splitOversized,
  columnLeft,
} from '../../pdf/layout';
import { ContentBlock, MeasuredBlock, TextMeasurer } from '../../pdf/types';
import { buildEvaluationBlocks, EvaluationExportData } from '../../pdf/buildBlocks';

const block = (height: number, kind: MeasuredBlock['kind'] = 'paragraph'): MeasuredBlock => ({
  kind,
  id: `b-${Math.random()}`,
  runs: [],
  wrapped: [],
  padTopMm: 0,
  padBottomMm: 0,
  lineHeightMm: 0,
  textIndentMm: 0,
  height,
});

describe('computeGeometry', () => {
  it('splits A4 width into N columns minus gaps and margins', () => {
    const geo = computeGeometry({
      size: 'a4',
      columnsPerPage: 2,
      columnGap: 8,
      headerHeight: 30,
      footerHeight: 8,
      margin: 10,
    });
    // usable width = 210 - 20 = 190; two cols, one 8mm gap => (190-8)/2 = 91
    expect(geo.columnWidth).toBeCloseTo(91, 5);
    expect(geo.columnsPerPage).toBe(2);
    expect(geo.contentTop).toBe(40); // margin + header
    // column height = 297 - 10 - 8 - 40 = 239
    expect(geo.columnHeight).toBeCloseTo(239, 5);
  });

  it('places the second column to the right of the first', () => {
    const geo = computeGeometry({
      size: 'a4',
      columnsPerPage: 2,
      columnGap: 8,
      headerHeight: 30,
      footerHeight: 8,
      margin: 10,
    });
    expect(columnLeft(geo, 0)).toBe(10);
    expect(columnLeft(geo, 1)).toBeCloseTo(10 + 91 + 8, 5);
  });
});

describe('flowBlocks (column-major)', () => {
  const geo = computeGeometry({
    size: 'a4',
    columnsPerPage: 2,
    columnGap: 8,
    headerHeight: 30,
    footerHeight: 8,
    margin: 10,
  }); // columnHeight ≈ 239

  it('fills the first column, then the second, then a new page', () => {
    // Each block 100mm tall: 2 per column (200 <= 239), so 4 per page.
    const blocks = Array.from({ length: 5 }, () => block(100));
    const { placements, pageCount } = flowBlocks(blocks, geo);
    expect(placements[0]).toMatchObject({ page: 0, column: 0, top: 0 });
    expect(placements[1]).toMatchObject({ page: 0, column: 0, top: 100 });
    expect(placements[2]).toMatchObject({ page: 0, column: 1, top: 0 });
    expect(placements[3]).toMatchObject({ page: 0, column: 1, top: 100 });
    expect(placements[4]).toMatchObject({ page: 1, column: 0, top: 0 });
    expect(pageCount).toBe(2);
  });

  it('keeps a single page when everything fits', () => {
    const { pageCount } = flowBlocks([block(50), block(50), block(50)], geo);
    expect(pageCount).toBe(1);
  });

  it('drops a spacer that would force a column break (no leading whitespace)', () => {
    // block(239) fills col0 exactly; the spacer would overflow -> break, so it
    // is dropped and the next block starts clean at the top of column 1.
    const blocks = [block(239), block(5, 'spacer'), block(50)];
    const { placements } = flowBlocks(blocks, geo);
    expect(placements).toHaveLength(2);
    expect(placements[1]).toMatchObject({ column: 1, top: 0 });
  });

  it('keeps a heading with its following block (no orphan at column foot)', () => {
    // 200mm block leaves ~39mm; a heading whose next block needs 50mm cannot
    // stay here, so the heading moves to the top of column 1 with its content.
    const heading = block(10, 'heading');
    const blocks = [block(200), heading, block(50)];
    const { placements } = flowBlocks(blocks, geo);
    expect(placements[0]).toMatchObject({ column: 0, top: 0 });
    expect(placements[1]).toMatchObject({ column: 1, top: 0 }); // the heading
    expect(placements[2]).toMatchObject({ column: 1 }); // its content follows
  });

  it('does not gratuitously break a heading that fits with its content', () => {
    const heading = block(10, 'heading');
    const { placements } = flowBlocks([block(50), heading, block(50)], geo);
    expect(placements[1]).toMatchObject({ column: 0, top: 50 });
  });

  it('records deepest extent per page', () => {
    // Both blocks stack in column 0: 120 + 90 = 210mm deep.
    const { deepestPerPage } = flowBlocks([block(120), block(90)], geo);
    expect(deepestPerPage[0]).toBeCloseTo(210, 5);
  });
});

describe('splitOversized', () => {
  const oversized = (lines: number, lineHeightMm: number): MeasuredBlock => ({
    kind: 'paragraph',
    id: 'big',
    runs: [{ text: 'x', baseFontPt: 10 }],
    wrapped: [Array.from({ length: lines }, (_, i) => `line ${i}`)],
    breakable: true,
    padTopMm: 2,
    padBottomMm: 3,
    lineHeightMm,
    textIndentMm: 0,
    height: 2 + lines * lineHeightMm + 3,
  });

  it('splits a breakable paragraph taller than a column into fragments that fit', () => {
    // 100 lines * 5mm = 500mm body; column height 200mm.
    const fragments = splitOversized([oversized(100, 5)], 200);
    expect(fragments.length).toBeGreaterThan(1);
    fragments.forEach((f) => expect(f.height).toBeLessThanOrEqual(200 + 1e-6));
    // No lines lost across the split.
    const total = fragments.reduce((n, f) => n + f.wrapped[0].length, 0);
    expect(total).toBe(100);
    // Top padding only on the first fragment, bottom only on the last.
    expect(fragments[0].padTopMm).toBe(2);
    expect(fragments[fragments.length - 1].padBottomMm).toBe(3);
    expect(fragments[1].padTopMm).toBe(0);
  });

  it('leaves blocks that already fit untouched', () => {
    const fit = oversized(5, 5);
    expect(splitOversized([fit], 200)).toEqual([fit]);
  });

  it('does not split non-breakable blocks', () => {
    const fixed = { ...oversized(100, 5), breakable: false };
    expect(splitOversized([fixed], 200)).toHaveLength(1);
  });

  it('splits an oversized criterion, keeping the label on the first fragment only', () => {
    const crit: MeasuredBlock = {
      kind: 'criterion',
      id: 'crit',
      label: '1. A long criterion title',
      labelWrapped: ['1. A long criterion', 'title'],
      chip: '2 / 3',
      runs: [{ text: 'x', baseFontPt: 9 }],
      wrapped: [Array.from({ length: 100 }, (_, i) => `fb ${i}`)],
      breakable: true,
      accent: [0, 0, 0],
      padTopMm: 1,
      padBottomMm: 2,
      lineHeightMm: 5,
      textIndentMm: 4,
      height: 1 + 2 * 5 + 100 * 5 + 2, // label(2 lines) + 100 feedback lines
    };
    const frags = splitOversized([crit], 200);
    expect(frags.length).toBeGreaterThan(1);
    // First fragment is still a criterion and keeps the label + chip.
    expect(frags[0].kind).toBe('criterion');
    expect(frags[0].label).toBe('1. A long criterion title');
    // Continuations are label-less paragraphs that keep the accent bar.
    frags.slice(1).forEach((f) => {
      expect(f.kind).toBe('paragraph');
      expect(f.label).toBeUndefined();
      expect(f.accent).toEqual([0, 0, 0]);
    });
    // Every fragment fits a column, and no feedback lines are lost.
    frags.forEach((f) => expect(f.height).toBeLessThanOrEqual(200 + 1e-6));
    const totalFeedback = frags.reduce((n, f) => n + f.wrapped[0].length, 0);
    expect(totalFeedback).toBe(100);
  });
});

// A deterministic measurer: wrap by char-budget, line height proportional to size.
const fakeMeasurer = (charsPerMm = 1): TextMeasurer => ({
  wrap(text, maxWidthMm, fontPt) {
    const perLine = Math.max(1, Math.floor((maxWidthMm * charsPerMm) / (fontPt / 10)));
    const lines: string[] = [];
    for (let i = 0; i < text.length; i += perLine) lines.push(text.slice(i, i + perLine));
    return lines.length ? lines : [''];
  },
  lineHeight(fontPt, factor) {
    return fontPt * factor * 0.3528;
  },
});

describe('chooseScale', () => {
  const geoFor = (pScale: number) =>
    computeGeometry({
      size: 'a4',
      columnsPerPage: 2,
      columnGap: 7 * pScale,
      headerHeight: 30 * pScale,
      footerHeight: 8 * pScale,
      margin: 10,
    });

  it('returns the largest scale that fits the page budget', () => {
    const small: ContentBlock[] = [
      { kind: 'paragraph', id: 'p', runs: [{ text: 'short', baseFontPt: 10 }] },
    ];
    const choice = chooseScale(small, fakeMeasurer(), geoFor, [1, 0.9, 0.8], 2);
    expect(choice.pScale).toBe(1);
    expect(choice.fitsTarget).toBe(true);
  });

  it('falls back to the smallest scale when nothing fits, flagging overflow', () => {
    const huge: ContentBlock[] = Array.from({ length: 60 }, (_, i) => ({
      kind: 'paragraph' as const,
      id: `p${i}`,
      runs: [{ text: 'x'.repeat(4000), baseFontPt: 12 }],
    }));
    const choice = chooseScale(huge, fakeMeasurer(), geoFor, [1, 0.9, 0.8], 2);
    expect(choice.pScale).toBe(0.8);
    expect(choice.fitsTarget).toBe(false);
    expect(choice.pageCount).toBeGreaterThan(2);
  });
});

describe('buildEvaluationBlocks + measureBlocks integration', () => {
  const data: EvaluationExportData = {
    question: 'Explain the role of x^2 in \\frac{a}{b}.',
    verb: 'EXPLAIN',
    totalMarks: 6,
    overallMark: 4,
    overallBand: 4,
    overallFeedback: 'Solid response with **clear** structure.',
    quickTip: 'Add a worked example.',
    strengths: ['Good terminology', 'Logical flow'],
    improvements: ['Needs more depth'],
    criteria: [
      { criterion: 'Understanding', mark: 2, maxMark: 3, feedback: 'Mostly correct.' },
      { criterion: 'Communication', mark: 2, maxMark: 3, feedback: 'Clear enough.' },
    ],
    revisedAnswer: 'A stronger answer would...',
    exemplarBand: 5,
    wordCount: 180,
    keywordsUsed: 3,
    keywordsTotal: 5,
  };

  it('produces continuously numbered criteria blocks', () => {
    const blocks = buildEvaluationBlocks(data);
    const crit = blocks.filter((b) => b.kind === 'criterion');
    expect(crit).toHaveLength(2);
    expect(crit[0].label?.startsWith('1.')).toBe(true);
    expect(crit[1].label?.startsWith('2.')).toBe(true);
  });

  it('normalises markup in the question to Unicode', () => {
    const blocks = buildEvaluationBlocks(data);
    const q = blocks.find((b) => b.id.startsWith('q'));
    expect(q?.runs[0].text).toContain('x²');
    expect(q?.runs[0].text).toContain('a/b');
  });

  it('measures the score-summary box tall enough for its chip + label + metrics', () => {
    const blocks = buildEvaluationBlocks(data);
    const geo = computeGeometry({
      size: 'a4',
      columnsPerPage: 2,
      columnGap: 7,
      headerHeight: 30,
      footerHeight: 8,
      margin: 10,
    });
    const measured = measureBlocks(blocks, fakeMeasurer(), geo, 1);
    const score = measured.find((b) => b.kind === 'scoreSummary');
    // The 17pt chip alone is ~6mm tall; the box (minus padding) must exceed it.
    const chipMm = 17 * 0.3528;
    const innerH = (score?.height ?? 0) - (score?.padTopMm ?? 0) - (score?.padBottomMm ?? 0);
    expect(innerH).toBeGreaterThan(chipMm);
  });

  it('indents accented paragraphs and bullets so they wrap at the drawn width', () => {
    const blocks = buildEvaluationBlocks(data);
    const geo = computeGeometry({
      size: 'a4',
      columnsPerPage: 2,
      columnGap: 7,
      headerHeight: 30,
      footerHeight: 8,
      margin: 10,
    });
    const measured = measureBlocks(blocks, fakeMeasurer(), geo, 1);
    // The Coach's Tip paragraph carries an accent, so it must be indented.
    const tip = measured.find((b) => b.id.startsWith('tip'));
    expect(tip?.textIndentMm).toBeGreaterThan(0);
    // The plain commentary paragraph has no accent and is flush-left.
    const comm = measured.find((b) => b.id.startsWith('comm'));
    expect(comm?.textIndentMm).toBe(0);
    // List items (strengths) are indented for their bullet.
    const str = measured.find((b) => b.id.startsWith('str'));
    expect(str?.textIndentMm).toBeGreaterThan(0);
  });

  it('measures every block to a positive height', () => {
    const blocks = buildEvaluationBlocks(data);
    const geo = computeGeometry({
      size: 'a4',
      columnsPerPage: 2,
      columnGap: 7,
      headerHeight: 30,
      footerHeight: 8,
      margin: 10,
    });
    const measured = measureBlocks(blocks, fakeMeasurer(), geo, 1);
    measured
      .filter((b) => b.kind !== 'spacer')
      .forEach((b) => expect(b.height).toBeGreaterThan(0));
  });
});
