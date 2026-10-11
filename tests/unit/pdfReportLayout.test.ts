import { describe, it, expect } from 'vitest';
import {
  chooseScale,
  computeGeometry,
  flowBlocks,
  fullContentWidth,
  measureBlock,
  measureBlocks,
  planLayout,
} from '../../pdf/layout';
import type { ColumnGeometry, ContentBlock, MeasuredBlock } from '../../pdf/types';
import { buildReportBlocks } from '../../pdf/buildReportBlocks';
import { reportMeasurer, makeReport, trendOf } from './pdfReportHelpers';

/**
 * The progress report's blocks flow as full-width bands, and these tests hold the
 * engine to the behaviour the report depends on: a heading never separates from
 * the chart it introduces, a block is never torn across a page, measure and place
 * agree, and the page count responds to scale the way the feedback report's does.
 */

const geo = (pScale = 1): ColumnGeometry =>
  computeGeometry({
    size: 'a4',
    columnsPerPage: 2,
    columnGap: 7 * pScale,
    headerHeight: 10 * pScale,
    footerHeight: 8 * pScale,
    margin: 10,
  });

const filler = (lines: number): ContentBlock => ({
  kind: 'paragraph',
  id: `filler-${lines}`,
  fullWidth: true,
  runs: [{ text: 'word '.repeat(lines * 30).trim(), baseFontPt: 9, lineHeightFactor: 1.4 }],
  basePadBottom: 2,
});

const heading = (id: string): ContentBlock => ({
  kind: 'heading',
  id,
  fullWidth: true,
  runs: [{ text: id, baseFontPt: 9, style: 'bold' }],
  icon: 'trend',
  display: true,
  basePadTop: 4.6,
  basePadBottom: 2,
});

const chart = (id: string): ContentBlock => ({
  kind: 'lineChart',
  id,
  fullWidth: true,
  runs: [],
  report: {
    type: 'lineChart',
    points: trendOf([3, 4, 4, 5, 5, 4, 6]),
    averageBand: 4.3,
    caption: 'Each point is one marked answer',
  },
});

const bars = (id: string, rows: number): ContentBlock => ({
  kind: 'barList',
  id,
  fullWidth: true,
  runs: [],
  report: {
    type: 'barList',
    rows: Array.from({ length: rows }, (_, i) => ({
      label: `Row ${i + 1}`,
      share: (i % 5) / 5,
      attempts: i % 3,
    })),
  },
});

const strip = (): ContentBlock => ({
  kind: 'statStrip',
  id: 'stat',
  fullWidth: true,
  runs: [],
  report: {
    type: 'statStrip',
    cells: [
      { label: 'Marked answers', value: '25', hint: 'across 2 courses' },
      { label: 'Average band', value: 'Band 4', band: 4 },
      { label: 'Marks earned', value: '58%' },
    ],
  },
});

describe('report blocks in the flow', () => {
  it('measure to the height their payload needs, and place whole', () => {
    const measured = measureBlocks([chart('c'), bars('b', 6), strip()], reportMeasurer, geo(), 1);
    const { placements } = flowBlocks(measured, geo());
    expect(placements).toHaveLength(3);
    placements.forEach((p) => {
      expect(p.block.height).toBeGreaterThan(0);
      expect(p.block.fullWidth).toBe(true);
      expect(p.column).toBe(0);
    });
  });

  it('keeps a heading on the page of the chart it introduces, at every fill level', () => {
    // The property the report depends on: wherever the filler leaves the page, the
    // heading and its chart land together — the heading never stranded at a foot.
    let pushedToNextPage = 0;
    for (let lines = 1; lines <= 60; lines++) {
      const blocks = [filler(lines), heading('h'), chart('c')];
      const { placements } = flowBlocks(measureBlocks(blocks, reportMeasurer, geo(), 1), geo());
      const h = placements.find((p) => p.block.id === 'h')!;
      const c = placements.find((p) => p.block.id === 'c')!;
      expect(c.page).toBe(h.page);
      expect(c.top).toBeCloseTo(h.top + h.block.height, 6);
      if (h.page > 0) pushedToNextPage += 1;
    }
    // The sweep must actually reach the case it is about: a heading pushed over.
    expect(pushedToNextPage).toBeGreaterThan(0);
  });

  it('keeps a heading with a long bar list rather than stranding it', () => {
    // A 30-row list is taller than most of a page's remainder. It moves whole with
    // its heading, and is never split across a page.
    let pushedToNextPage = 0;
    for (let lines = 1; lines <= 60; lines++) {
      const blocks = [filler(lines), heading('h'), bars('b', 30)];
      const { placements } = flowBlocks(measureBlocks(blocks, reportMeasurer, geo(), 1), geo());
      const h = placements.find((p) => p.block.id === 'h')!;
      const b = placements.filter((p) => p.block.id.startsWith('b'));
      expect(b).toHaveLength(1);
      expect(b[0].page).toBe(h.page);
      if (h.page > 0) pushedToNextPage += 1;
    }
    expect(pushedToNextPage).toBeGreaterThan(0);
  });

  it('never tears a report block across a page', () => {
    const blocks = [filler(40), chart('c'), bars('b', 25), strip()];
    const measured = planLayout(blocks, reportMeasurer, geo(), 1).blocks;
    const ids = measured.map((b) => b.id);
    expect(ids).toEqual(['filler-40', 'c', 'b', 'stat']);
    expect(measured.every((b) => !b.id.includes('-cont'))).toBe(true);
  });

  it('measures the same height the layout places, so nothing overlaps', () => {
    const blocks = [strip(), heading('h1'), chart('c'), heading('h2'), bars('b', 12)];
    const { placements } = planLayout(blocks, reportMeasurer, geo(), 1).flow;
    // Sorted down the page, each block starts where the previous one ends.
    const sorted = [...placements].sort((a, b) => a.page - b.page || a.top - b.top);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      if (prev.page !== sorted[i].page) continue;
      expect(sorted[i].top).toBeGreaterThanOrEqual(prev.top + prev.block.height - 1e-6);
    }
  });

  it('keeps every placement inside the column height', () => {
    const blocks = buildReportBlocks(
      makeReport({
        trend: trendOf(Array.from({ length: 40 }, (_, i) => 3 + (i % 3))),
        notes: Array.from({ length: 10 }, (_, i) => `Note number ${i + 1} that runs on a while.`),
      })
    );
    const g = geo();
    const { placements } = planLayout(blocks, reportMeasurer, g, 1).flow;
    placements.forEach((p) => {
      expect(p.top + p.block.height).toBeLessThanOrEqual(g.columnHeight + 1e-6);
    });
  });

  it('gives a report block the full content width, the same as the feedback report', () => {
    const g = geo();
    expect(fullContentWidth(g)).toBeCloseTo(190, 6);
    const [measured] = measureBlocks([strip()], reportMeasurer, g, 1);
    expect(measured.reportLayout?.kind).toBe('statStrip');
    expect(
      measured.reportLayout && 'width' in measured.reportLayout && measured.reportLayout.width
    ).toBeCloseTo(190, 6);
  });
});

describe('measureBlock agrees with the block layout it stores', () => {
  it('adds its own padding around the layout height', () => {
    const block: ContentBlock = { ...strip(), basePadTop: 2, basePadBottom: 3 };
    const measured: MeasuredBlock = measureBlock(block, reportMeasurer, 190, 1);
    expect(measured.reportLayout?.height).toBeGreaterThan(0);
    expect(measured.height).toBeCloseTo(
      measured.padTopMm + (measured.reportLayout?.height ?? 0) + measured.padBottomMm,
      6
    );
  });

  it('scales the whole block with the page, not just its text', () => {
    const at1 = measureBlock(chart('c'), reportMeasurer, 190, 1).height;
    const at75 = measureBlock(chart('c'), reportMeasurer, 190, 0.75).height;
    expect(at75 / at1).toBeGreaterThan(0.7);
    expect(at75 / at1).toBeLessThan(0.8);
  });
});

describe('chooseScale with report blocks', () => {
  it('returns the candidate that reaches the fewest pages, and no other', () => {
    const blocks = buildReportBlocks(
      makeReport({
        trend: trendOf(Array.from({ length: 30 }, (_, i) => 2 + (i % 4))),
        notes: Array.from({ length: 8 }, (_, i) => `A caveat number ${i + 1}, set out in full.`),
      })
    );
    const scales = [1, 0.9, 0.8, 0.75];
    const choice = chooseScale(blocks, reportMeasurer, geo, scales, 2);
    const counts = scales.map((s) => planLayout(blocks, reportMeasurer, geo(s), s).flow.pageCount);
    expect(choice.pageCount).toBe(Math.min(...counts));
    expect(scales).toContain(choice.pScale);
  });

  it('does not shrink a one-page report to save nothing', () => {
    // The breakdown sections, switched off, leave the phase-one shape: a report that
    // is one page at full size keeps full size. (With them on, the empty-section
    // lines make the page taller, and shrinking to save a page is the right call.)
    const blocks = buildReportBlocks(
      makeReport({
        sections: {
          ...makeReport().sections,
          courses: false,
          topics: false,
          verbs: false,
        },
      })
    );
    const choice = chooseScale(blocks, reportMeasurer, geo, [1, 0.9, 0.8], 2);
    expect(choice.pageCount).toBe(1);
    expect(choice.pScale).toBe(1);
  });
});
