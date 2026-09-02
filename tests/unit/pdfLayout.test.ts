import { describe, it, expect } from 'vitest';
import {
  computeGeometry,
  flowBlocks,
  chooseScale,
  measureBlocks,
  planLayout,
  splitOversized,
  columnLeft,
  fullContentWidth,
} from '../../pdf/layout';
import { ContentBlock, MeasuredBlock, TextMeasurer } from '../../pdf/types';
import { buildEvaluationBlocks, COLORS, EvaluationExportData } from '../../pdf/buildBlocks';

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

  it('evens two ragged columns, not just an empty one', () => {
    // A band whose columns end at very different depths wastes the space under
    // the shallower one, because the full-width band after it has to start
    // below the deeper. The balancer used to act only when column two was
    // entirely empty.
    // Eight equal blocks: unbalanced they all sit in column one, 200mm deep
    // against an empty column two. There is an exact even split available.
    const blocks = Array.from({ length: 8 }, () => block(25));
    const { placements, deepestPerPage } = flowBlocks(blocks, geo);
    const depth = (column: number) =>
      placements
        .filter((p) => p.column === column)
        .reduce((deepest, p) => Math.max(deepest, p.top + p.block.height), 0);

    expect(depth(0)).toBeCloseTo(100, 5);
    expect(depth(1)).toBeCloseTo(100, 5);
    expect(deepestPerPage[0]).toBeCloseTo(100, 5);
  });

  it('keeps a page depth recorded when a later band lands nothing on it', () => {
    // The recomputation after balancing used to REPLACE the page's depth with a
    // reduce seeded at 0. A band that ends on a page it put nothing on reduced
    // to that 0, wiped every earlier band's extent, and the next band printed
    // straight over content that was already there.
    const spanning = { ...block(40), fullWidth: true, id: 'span' };
    const { placements } = flowBlocks([block(60), block(60), spanning], geo);
    const columnFeet = placements
      .filter((p) => !p.block.fullWidth)
      .reduce((deepest, p) => Math.max(deepest, p.top + p.block.height), 0);
    const span = placements.find((p) => p.block.id === 'span')!;

    expect(span.top).toBeGreaterThanOrEqual(columnFeet - 1e-6);
  });

  it('never breaks a bound pair across a column', () => {
    // A diff pair is one thought in two blocks. Split across the boundary, the
    // reader holds the first half in their head while their eye travels to the
    // top of the next column — the one thing the pairing exists to spare them.
    const before = { ...block(30), keepWithNext: true, id: 'minus' };
    const after = { ...block(30), id: 'plus' };
    const { placements } = flowBlocks([block(200), before, after], geo);
    const minus = placements.find((p) => p.block.id === 'minus')!;
    const plus = placements.find((p) => p.block.id === 'plus')!;

    expect(plus.page).toBe(minus.page);
    expect(plus.column).toBe(minus.column);
    expect(plus.top).toBeCloseTo(minus.top + 30, 5);
  });

  it('moves a whole section rather than strand most of its items', () => {
    // Four checkboxes under a heading, with room for the heading and one. The
    // section fits a column of its own, so all five travel together — a heading
    // with one item, and three orphans at the head of the next column above an
    // unrelated card, reads as a rendering fault.
    const heading = { ...block(10, 'heading'), id: 'h' };
    const items = [1, 2, 3, 4].map((n) => ({ ...block(12), id: `i${n}` }));
    const { placements } = flowBlocks([block(200), heading, ...items], geo);
    const placed = placements.filter((p) => p.block.id === 'h' || p.block.id.startsWith('i'));

    expect(new Set(placed.map((p) => `${p.page}/${p.column}`)).size).toBe(1);
  });

  it('splits a section that could never fit a column, rather than loop', () => {
    // The rule is "move it if a fresh column would hold it". One that would not
    // has to break somewhere, and here is as good as anywhere.
    const heading = { ...block(10, 'heading'), id: 'h' };
    const items = Array.from({ length: 30 }, (_, n) => ({ ...block(12), id: `i${n}` }));
    const { placements } = flowBlocks([block(200), heading, ...items], geo);

    expect(placements).toHaveLength(32);
  });

  it('does not gratuitously break a heading from its content', () => {
    // Where the pair LANDS is the balancer's business (a band that ends part-way
    // down column one is evened across both). What must never change is that the
    // heading and the block it introduces stay together.
    const heading = block(10, 'heading');
    const { placements } = flowBlocks([block(50), heading, block(50)], geo);
    expect(placements[2].column).toBe(placements[1].column);
    expect(placements[2].top).toBeCloseTo(placements[1].top + 10, 5);
  });

  it('moves a heading whose whole body cannot follow it', () => {
    /**
     * Reserving one LINE of the next block was not enough. Everything reaching
     * the flow has already been through `splitOversized`, so no block splits
     * further — each moves as a unit. A heading that fit alongside one reserved
     * line stayed put while its entire body jumped to the next column, which is
     * the orphan the rule exists to prevent.
     */
    const geoLocal = computeGeometry({
      size: 'a4',
      columnsPerPage: 2,
      columnGap: 8,
      headerHeight: 30,
      footerHeight: 8,
      margin: 10,
    }); // 239mm columns
    const heading = block(10, 'heading');
    // 200 used, 39 left: the heading (10) plus one line would have fit, but its
    // 60mm body could not — so both belong in the next column.
    const { placements } = flowBlocks([block(200), heading, block(60)], geoLocal);

    expect(placements[1]).toMatchObject({ column: 1, top: 0 });
    expect(placements[2]).toMatchObject({ column: 1 });
  });

  it('records deepest extent per page', () => {
    // Both blocks stack in column 0: 120 + 90 = 210mm deep.
    const { deepestPerPage } = flowBlocks([block(120), block(90)], geo);
    expect(deepestPerPage[0]).toBeCloseTo(210, 5);
  });
});

describe('flowBlocks (full-width bands)', () => {
  const geo = computeGeometry({
    size: 'a4',
    columnsPerPage: 2,
    columnGap: 8,
    headerHeight: 30,
    footerHeight: 8,
    margin: 10,
  }); // columnHeight ≈ 239, columnWidth 91, fullContentWidth 190
  const span = (height: number, kind: MeasuredBlock['kind'] = 'paragraph'): MeasuredBlock => ({
    ...block(height, kind),
    fullWidth: true,
  });

  it('exposes the full content width (both columns + gap)', () => {
    expect(fullContentWidth(geo)).toBeCloseTo(190, 5);
  });

  it('stacks a full-width band beneath the deepest of both columns', () => {
    // col0 fills with 200mm; the 100mm block spills to col1; the full-width
    // block then spans, starting below the deeper column (200), not at 0.
    const blocks = [block(200), block(100), span(30)];
    const { placements } = flowBlocks(blocks, geo);
    expect(placements[0]).toMatchObject({ page: 0, column: 0, top: 0 });
    expect(placements[1]).toMatchObject({ page: 0, column: 1, top: 0 });
    expect(placements[2]).toMatchObject({ page: 0, top: 200 }); // spans full width
  });

  it('resumes two columns beneath a leading full-width band', () => {
    // A 40mm full-width band at the top; the two-column band then begins at y=40.
    const blocks = [span(40), block(100), block(100)];
    const { placements } = flowBlocks(blocks, geo);
    expect(placements[0]).toMatchObject({ page: 0, top: 0 }); // the span
    expect(placements[1]).toMatchObject({ page: 0, column: 0, top: 40 });
    // col0 now holds 40+100=140; another 100 overflows (240>239) -> col1 at y=40.
    expect(placements[2]).toMatchObject({ page: 0, column: 1, top: 40 });
  });

  it('pushes a full-width band to a new page when it will not fit', () => {
    // 220mm of column content leaves ~19mm; a 30mm full-width band cannot fit,
    // so it starts a fresh page at the top.
    const blocks = [block(220), span(30)];
    const { placements, pageCount } = flowBlocks(blocks, geo);
    expect(placements[0]).toMatchObject({ page: 0, column: 0, top: 0 });
    expect(placements[1]).toMatchObject({ page: 1, top: 0 });
    expect(pageCount).toBe(2);
  });

  it('measures a full-width block at the full content width', () => {
    // A paragraph whose text is wider than one column but fits the full width
    // wraps to ONE line when full-width, and to more when column-bound.
    const measurer: TextMeasurer = {
      wrap: (text, maxWidthMm) => {
        // ~2mm per character; split into as many lines as needed.
        const perLine = Math.max(1, Math.floor(maxWidthMm / 2));
        const words = text.split(' ');
        const lines: string[] = [];
        let cur = '';
        for (const w of words) {
          const trial = cur ? `${cur} ${w}` : w;
          if (trial.length > perLine && cur) {
            lines.push(cur);
            cur = w;
          } else cur = trial;
        }
        if (cur) lines.push(cur);
        return lines;
      },
      lineHeight: (fontPt, factor = 1.15) => fontPt * factor * 0.3528,
      measure: (text) => text.length * 2, // ~2mm per character, matching wrap
    };
    const text = 'w '.repeat(60).trim(); // 120 chars
    const cb: ContentBlock = {
      kind: 'paragraph',
      id: 'p',
      runs: [{ text, baseFontPt: 10 }],
    };
    const narrow = measureBlocks([cb], measurer, geo, 1);
    const wide = measureBlocks([{ ...cb, fullWidth: true }], measurer, geo, 1);
    // The full-width version fits on fewer lines, so it is shorter.
    expect(wide[0].wrapped[0].length).toBeLessThan(narrow[0].wrapped[0].length);
    expect(wide[0].height).toBeLessThan(narrow[0].height);
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

  it('avoids a lone widow line as the final fragment', () => {
    // 5mm lines, 200mm column, 2mm top pad => 39 lines fit the first fragment;
    // 40 lines would naively leave a single widow line in the second fragment.
    const frags = splitOversized([oversized(40, 5)], 200);
    expect(frags).toHaveLength(2);
    expect(frags[frags.length - 1].wrapped[0].length).toBeGreaterThanOrEqual(2);
    // No lines are lost when the widow is pulled down.
    const total = frags.reduce((n, f) => n + f.wrapped[0].length, 0);
    expect(total).toBe(40);
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
  // Inverse of `wrap`'s char budget, so a rich wrap of the same text breaks
  // where the plain wrap would — bold costs nothing extra here, which keeps
  // the layout assertions above about layout rather than about font metrics.
  measure(text, fontPt) {
    return (text.length * (fontPt / 10)) / charsPerMm;
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

  it('flags overflow, and keeps the largest scale when shrinking saves nothing', () => {
    // Every scale needs the same number of pages here, so there is nothing to
    // buy by shrinking — and a smaller type size that saves no paper is a
    // straight loss.
    const huge: ContentBlock[] = Array.from({ length: 60 }, (_, i) => ({
      kind: 'paragraph' as const,
      id: `p${i}`,
      runs: [{ text: 'x'.repeat(4000), baseFontPt: 12 }],
    }));
    const choice = chooseScale(huge, fakeMeasurer(), geoFor, [1, 0.9, 0.8], 2);
    expect(choice.pScale).toBe(1);
    expect(choice.fitsTarget).toBe(false);
    expect(choice.pageCount).toBeGreaterThan(2);
  });

  it('shrinks to save a page rather than print a nearly empty one', () => {
    // It used to take the largest scale that merely fit the page BUDGET, so a
    // report needing 1.05 pages printed as two — a full sheet and a second one
    // at 5% ink. A couple of points of type is the right price for that sheet.
    const measurer = fakeMeasurer();
    // Wraps into many lines, so a smaller scale genuinely fits more per column.
    const long: ContentBlock[] = Array.from({ length: 40 }, (_, i) => ({
      kind: 'paragraph' as const,
      id: `p${i}`,
      runs: [{ text: Array.from({ length: 120 }, (_, w) => `word${w}`).join(' '), baseFontPt: 12 }],
    }));

    const atFullSize = planLayout(long, measurer, geoFor(1), 1).flow.pageCount;
    const choice = chooseScale(long, measurer, geoFor, [1, 0.9, 0.8], 99);

    expect(choice.pageCount).toBeLessThan(atFullSize);
    expect(choice.pScale).toBeLessThan(1);
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
    measured.filter((b) => b.kind !== 'spacer').forEach((b) => expect(b.height).toBeGreaterThan(0));
  });
});

describe('the improved response prints what changed', () => {
  /**
   * The improvement is an EDIT of the student's own answer, so a printed report
   * that shows only the finished text leaves the student to work out which
   * words earned the mark by eye. Inline marking is not available on the page —
   * the text engine draws whole wrapped lines in one style — so the changes go
   * in as a list, prefixed − / + as well as coloured so the page survives a
   * greyscale printer.
   */
  const base: EvaluationExportData = {
    question: 'Analyse the impact of caching.',
    verb: 'ANALYSE',
    totalMarks: 8,
    overallMark: 5,
    overallBand: 4,
    overallFeedback: 'Sound.',
    strengths: [],
    improvements: [],
    criteria: [],
    exemplarBand: 5,
    exemplarMark: 6,
  };

  const withDiff = (over: Partial<EvaluationExportData> = {}) =>
    buildEvaluationBlocks({
      ...base,
      studentAnswer: 'Caching stores data. It makes the system faster.',
      revisedAnswer: 'Caching stores frequently requested data. It reduces latency.',
      ...over,
    });

  const changeBlocks = (blocks: ReturnType<typeof buildEvaluationBlocks>) =>
    blocks.filter((b) => b.id.startsWith('chgold-') || b.id.startsWith('chgnew-'));

  const changeText = (blocks: ReturnType<typeof buildEvaluationBlocks>) =>
    changeBlocks(blocks)
      .map((b) => `${b.diffMarker ?? ''} ${b.runs.map((r) => r.text).join(' ')}`)
      .join('\n');

  it('pairs each rewritten sentence with what the student wrote', () => {
    // Whole sentences, not word runs: a word-level row on paper is a fragment
    // with its sense removed, and a student cannot revise from one.
    const text = changeText(withDiff());

    expect(changeBlocks(withDiff()).length).toBeGreaterThan(0);
    expect(text).toContain('Caching stores frequently requested data');
    expect(text).toContain('It makes the system faster');
    expect(text).toContain('It reduces latency');
  });

  it('marks additions and cuts by symbol as well as by colour', () => {
    // Colour alone would vanish on a school photocopier, and the symbol lives in
    // the gutter rather than in the text so a row that wraps stays marked.
    const blocks = changeBlocks(withDiff());

    expect(blocks.every((b) => b.diffMarker === '+' || b.diffMarker === '\u2212')).toBe(true);
    const added = blocks.filter((b) => b.diffMarker === '+');
    const cut = blocks.filter((b) => b.diffMarker === '\u2212');
    expect(added.length).toBeGreaterThan(0);
    expect(cut.every((b) => b.runs.every((r) => r.color === COLORS.rose))).toBe(true);
    // Green for what came, red for what went — the convention a reader arrives
    // with. Additions used to take the exemplar's band colour, which made them
    // amber on one report and purple on another.
    expect(added.every((b) => b.runs.every((r) => r.color === COLORS.added))).toBe(true);
  });

  it('summarises the scale of the revision without grading the student on it', () => {
    const summary = withDiff().find((b) => b.id.startsWith('diffsum-'));

    expect(summary?.runs[0].text).toMatch(/\d+ words added · \d+ cut/);
    // "23% of your own writing kept" is accurate, demoralising, and always low
    // for a rewrite a band up.
    expect(summary?.runs[0].text).not.toMatch(/kept/);
  });

  it('says nothing when there is no rewrite to compare', () => {
    expect(changeBlocks(withDiff({ revisedAnswer: '' }))).toHaveLength(0);
  });

  it('says nothing when the rewrite changed nothing', () => {
    const same = 'Caching stores data. It makes the system faster.';
    expect(changeBlocks(withDiff({ revisedAnswer: same }))).toHaveLength(0);
  });

  it('says nothing without the student answer to diff against', () => {
    expect(changeBlocks(withDiff({ studentAnswer: undefined }))).toHaveLength(0);
  });

  it('caps a very long change list and says how many are left', () => {
    // Twenty separate rewritten sentences, comfortably past the printed cap.
    const original = Array.from({ length: 20 }, (_, i) => `Anchor${i} is old phrase${i}.`).join(
      ' '
    );
    const revised = Array.from({ length: 20 }, (_, i) => `Anchor${i} is new wording${i}.`).join(
      ' '
    );

    const blocks = withDiff({ studentAnswer: original, revisedAnswer: revised });

    // One block per side of each printed pair.
    const pairs = blocks.filter((b) => b.id.startsWith('chgnew-')).length;
    expect(pairs).toBeGreaterThan(0);
    expect(pairs).toBeLessThanOrEqual(5);
    const more = blocks.find((b) => b.id.startsWith('chgmore-'));
    expect(more?.runs[0].text).toMatch(/more rewritten sentence/);
  });

  it('keeps instructive edits but drops stray short cuts from the printed list', () => {
    // "cat" → "dog" is a genuine content-word swap and "right there" is a
    // two-word insertion — both teach a revision, so both survive and widen to
    // the sentence they fell in. "extra" is a lone one-word cut that teaches
    // nothing, so it raises no row of its own.
    const blocks = withDiff({
      studentAnswer: 'The cat sat on the extra mat by the door.',
      revisedAnswer: 'The dog sat on the mat right there by the door.',
    });
    const text = changeText(blocks);

    expect(text).toContain('The dog sat on the mat right there by the door.');
    expect(text).toContain('The cat sat on the extra mat by the door.');
  });
});
