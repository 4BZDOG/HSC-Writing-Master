import { describe, it, expect } from 'vitest';
import {
  gridMinimumHeight,
  measureGrid,
  splitGridLayout,
  heatBand,
} from '../../pdf/reportGeometry';
import { computeGeometry, planLayout, measureBlocks } from '../../pdf/layout';
import { TABLE } from '../../pdf/types';
import type { ContentBlock, MeasuredBlock } from '../../pdf/types';
import type {
  CellDrawing,
  TableCell,
  TableColumn,
  TableLayout,
  TableRow,
} from '../../pdf/reportBlocks';
import { reportMeasurer, allFinite } from './pdfReportHelpers';

/**
 * Tables and the tier heatmap: what they measure to, what they draw, and how they
 * split. The splitting rules are the ones a reader depends on — a header repeats on
 * every fragment, no page carries a heading over fewer than two rows, a page never
 * begins with a lone row, and no row is lost or doubled across a break.
 */

const columns: TableColumn[] = [
  { key: 'name', header: 'Student', align: 'left', widthWeight: 4, kind: 'text' },
  { key: 'answers', header: 'Answers', align: 'right', widthWeight: 1.5, kind: 'number' },
  { key: 'marks', header: 'Marks earned', align: 'left', widthWeight: 3.4, kind: 'bar' },
  { key: 'band', header: 'Avg band', align: 'center', widthWeight: 1.9, kind: 'band' },
  { key: 'trend', header: 'Trend, 12 weeks', align: 'center', widthWeight: 2.6, kind: 'sparkline' },
  { key: 'change', header: 'Change', align: 'right', widthWeight: 1.9, kind: 'change' },
];

const body = (name: string, i: number): TableRow => ({
  type: 'body',
  cells: [
    { type: 'text', text: name },
    { type: 'number', value: i + 1 },
    { type: 'bar', value: (i % 5) / 5 },
    { type: 'band', value: 3 + (i % 3) },
    { type: 'sparkline', points: [3, 4, null, 4, 5] },
    { type: 'change', value: i % 2 === 0 ? 1 : -0.5 },
  ],
});

const rowsOf = (n: number): TableRow[] =>
  Array.from({ length: n }, (_, i) => body(`Student ${i + 1}`, i));

const measure = (rows: TableRow[], width = 190, s = 1) =>
  measureGrid('table', { columns, rows }, reportMeasurer, width, s).layout;

const bodyCount = (layout: TableLayout) => layout.rows.filter((r) => r.type === 'body').length;

/** The text a drawn cell shows, in order: for checking what a reader sees. */
const textsOf = (d: CellDrawing): string[] => {
  switch (d.kind) {
    case 'lines':
      return d.lines.map((l) => l.text);
    case 'empty':
      return [d.line.text];
    case 'bar':
    case 'chip':
    case 'heat':
      return [d.line.text];
    case 'spark':
      return [];
  }
};

describe('measureGrid: what a table is measured to', () => {
  it('measures a header and a row per body row, every row at least the minimum height', () => {
    const layout = measure(rowsOf(4));
    expect(bodyCount(layout)).toBe(4);
    expect(layout.rows).toHaveLength(4);
    layout.rows.forEach((r) => expect(r.height).toBeGreaterThanOrEqual(TABLE.minRowBaseMm - 1e-9));
    expect(layout.height).toBeCloseTo(
      layout.header.height + layout.rows.reduce((sum, r) => sum + r.height, 0),
      6
    );
  });

  it('lays out every number it returns as a finite value', () => {
    expect(allFinite(measure(rowsOf(12), 190, 0.8))).toBe(true);
  });

  it('gives an empty table a header and no rows, and no NaN', () => {
    const layout = measure([]);
    expect(layout.bodyRows).toBe(0);
    expect(layout.rows).toEqual([]);
    expect(allFinite(layout)).toBe(true);
    expect(layout.height).toBeCloseTo(layout.header.height, 6);
  });

  it('wraps a long name to two lines and ellipsises the second, never a third', () => {
    const long = 'Bartholomew Maximilian Ferdinand-Alexander Montgomery III '.repeat(3).trim();
    const layout = measure([body(long, 0)], 120);
    const name = layout.rows[0].type === 'body' ? layout.rows[0].cells[0].drawing : null;
    expect(name?.kind).toBe('lines');
    if (name?.kind === 'lines') {
      expect(name.lines.length).toBeLessThanOrEqual(TABLE.maxNameLines);
      expect(name.lines[name.lines.length - 1].text.endsWith('…')).toBe(true);
    }
  });

  it('gives a sublabel its own quieter line under the name, in the muted tone', () => {
    const cols: TableColumn[] = [
      { key: 'v', header: 'Verb', align: 'left', widthWeight: 1, kind: 'text' },
    ];
    const layout = measureGrid(
      'table',
      {
        columns: cols,
        rows: [{ type: 'body', cells: [{ type: 'text', text: 'Explain', sublabel: 'Tier 3' }] }],
      },
      reportMeasurer,
      90,
      1
    ).layout;
    const row = layout.rows[0];
    if (row.type !== 'body') throw new Error('expected a body row');
    const d = row.cells[0].drawing;
    expect(d.kind).toBe('lines');
    if (d.kind === 'lines') {
      expect(d.lines.map((l) => l.text)).toEqual(['Explain', 'Tier 3']);
      expect(d.lines[1].tone).toBe('muted');
    }
  });
});

describe('measureGrid: what each cell draws', () => {
  const cellOf = (cell: TableCell, column: TableColumn) => {
    const layout = measureGrid(
      'table',
      { columns: [column], rows: [{ type: 'body', cells: [cell] }] },
      reportMeasurer,
      120,
      1
    ).layout;
    const row = layout.rows[0];
    if (row.type !== 'body') throw new Error('expected a body row');
    return row.cells[0].drawing;
  };
  const numeric: TableColumn = {
    key: 'n',
    header: 'N',
    align: 'right',
    widthWeight: 1,
    kind: 'number',
  };

  it('prints a share as a percentage beside its bar, never the bar alone', () => {
    const d = cellOf(
      { type: 'bar', value: 0.8 },
      { key: 'b', header: 'B', align: 'left', widthWeight: 1, kind: 'bar' }
    );
    expect(d.kind).toBe('bar');
    if (d.kind === 'bar') {
      expect(d.line.text).toBe('80%');
      expect(d.fillWidth).toBeCloseTo(0.8 * d.track.width, 6);
    }
  });

  it('draws a bar with no share as a dash and an empty track', () => {
    const d = cellOf(
      { type: 'bar', value: null },
      { key: 'b', header: 'B', align: 'left', widthWeight: 1, kind: 'bar' }
    );
    if (d.kind !== 'bar') throw new Error('expected a bar');
    expect(d.line.text).toBe('—');
    expect(d.fillWidth).toBe(0);
  });

  it('prints a band chip as "Band n", so the colour is never the only measure', () => {
    const d = cellOf(
      { type: 'band', value: 4.4 },
      { key: 'b', header: 'B', align: 'center', widthWeight: 1, kind: 'band' }
    );
    expect(d.kind).toBe('chip');
    if (d.kind === 'chip') {
      expect(d.line.text).toBe('Band 4');
      expect(d.band).toBe(4);
    }
  });

  it('prints a change with an arrow and its number, and draws only a fall in rose', () => {
    const up = cellOf(
      { type: 'change', value: 1.5 },
      { key: 'c', header: 'C', align: 'right', widthWeight: 1, kind: 'change' }
    );
    const down = cellOf(
      { type: 'change', value: -0.5 },
      { key: 'c', header: 'C', align: 'right', widthWeight: 1, kind: 'change' }
    );
    const level = cellOf(
      { type: 'change', value: 0 },
      { key: 'c', header: 'C', align: 'right', widthWeight: 1, kind: 'change' }
    );
    const tone = (d: CellDrawing) => (d.kind === 'lines' ? d.lines[0].tone : null);
    expect(textsOf(up)).toEqual(['▲ 1.5']);
    expect(tone(up)).toBe('body');
    expect(textsOf(down)).toEqual(['▼ 0.5']);
    expect(tone(down)).toBe('rose');
    expect(textsOf(level)).toEqual(['0.0']);
    expect(tone(level)).toBe('muted');
  });

  it('draws a null change as a dash', () => {
    expect(
      textsOf(
        cellOf(
          { type: 'change', value: null },
          { key: 'c', header: 'C', align: 'right', widthWeight: 1, kind: 'change' }
        )
      )
    ).toEqual(['—']);
  });

  it('breaks a sparkline at a gap, and draws one point as a single dot', () => {
    const spark = {
      key: 's',
      header: 'S',
      align: 'center' as const,
      widthWeight: 1,
      kind: 'sparkline' as const,
    };
    const gapped = cellOf({ type: 'sparkline', points: [3, 4, null, 5] }, spark);
    if (gapped.kind !== 'spark') throw new Error('expected a sparkline');
    expect(gapped.polylines.map((p) => p.length)).toEqual([2, 1]);
    expect(gapped.points).toHaveLength(3);

    const single = cellOf({ type: 'sparkline', points: [null, 4, null] }, spark);
    if (single.kind !== 'spark') throw new Error('expected a sparkline');
    expect(single.points).toHaveLength(1);
    expect(single.polylines).toHaveLength(1);
    expect(single.polylines[0]).toHaveLength(1);
  });

  it('draws a sparkline with no points as a dash, not an empty trace', () => {
    expect(
      textsOf(
        cellOf(
          { type: 'sparkline', points: [null, null] },
          { key: 's', header: 'S', align: 'center', widthWeight: 1, kind: 'sparkline' }
        )
      )
    ).toEqual(['—']);
  });

  it('shades a heat cell by the band its share falls in, and prints the percentage', () => {
    const d = cellOf(
      { type: 'heat', value: 0.72 },
      { key: 'h', header: 'H', align: 'center', widthWeight: 1, kind: 'heat' }
    );
    expect(d.kind).toBe('heat');
    if (d.kind === 'heat') {
      expect(d.band).toBe(heatBand(0.72));
      expect(d.line.text).toBe('72%');
    }
  });

  it('maps a heat share across the six bands, and holds a share outside 0–1 to the ends', () => {
    expect(heatBand(0)).toBe(1);
    expect(heatBand(1)).toBe(6);
    expect(heatBand(-3)).toBe(1);
    expect(heatBand(9)).toBe(6);
  });

  it('draws a heat cell with no share as a dash, unshaded', () => {
    const d = cellOf(
      { type: 'heat', value: null },
      { key: 'h', header: 'H', align: 'center', widthWeight: 1, kind: 'heat' }
    );
    expect(textsOf(d)).toEqual(['—']);
  });

  it('draws a cell whose type does not match its column as a dash, not a guess', () => {
    expect(textsOf(cellOf({ type: 'band', value: 4 }, numeric))).toEqual(['—']);
  });

  it('prints an integer with a thousands separator', () => {
    expect(textsOf(cellOf({ type: 'number', value: 1234 }, numeric))).toEqual(['1,234']);
  });
});

describe('measureGrid: group headings', () => {
  it('measures a group heading as a row of its own, with the continued form ready', () => {
    const rows: TableRow[] = [{ type: 'group', label: 'Enterprise Computing' }, ...rowsOf(2)];
    const layout = measure(rows);
    const group = layout.rows[0];
    expect(group.type).toBe('group');
    expect(group.label).toBe('Enterprise Computing');
    expect(group.height).toBeGreaterThan(0);
    expect(bodyCount(layout)).toBe(2);
    expect(
      layout.rows.filter((r) => r.type === 'body').every((r) => r.group === 'Enterprise Computing')
    ).toBe(true);
  });
});

describe('splitGridLayout: splitting between whole rows', () => {
  it('returns null when the table is too short to split into two orphan-proof pieces', () => {
    const layout = measure(rowsOf(3));
    expect(splitGridLayout(layout, 1000)).toBeNull();
  });

  it('moves the whole table when not even the head fits', () => {
    const layout = measure(rowsOf(20));
    expect(splitGridLayout(layout, layout.header.height + 1)).toBeNull();
  });

  it('keeps at least two body rows in the head and two in the tail', () => {
    const layout = measure(rowsOf(20));
    const parts = splitGridLayout(layout, layout.height / 2);
    expect(parts).not.toBeNull();
    const [head, tail] = parts!;
    expect(bodyCount(head)).toBeGreaterThanOrEqual(TABLE.MIN_HEAD_ROWS);
    expect(bodyCount(tail)).toBeGreaterThanOrEqual(TABLE.MIN_TAIL_ROWS);
  });

  it('gives back head rows so a tail is never left with fewer than two', () => {
    // A head that could take all but one row must give one back.
    const layout = measure(rowsOf(6));
    const roomForFive =
      layout.header.height + layout.rows.slice(0, 5).reduce((s, r) => s + r.height, 0);
    const parts = splitGridLayout(layout, roomForFive);
    expect(parts).not.toBeNull();
    const [head, tail] = parts!;
    expect(bodyCount(tail)).toBeGreaterThanOrEqual(TABLE.MIN_TAIL_ROWS);
    expect(bodyCount(head) + bodyCount(tail)).toBe(6);
  });

  it('fits the head in the room it was given', () => {
    const layout = measure(rowsOf(40));
    const available = layout.height * 0.37;
    const parts = splitGridLayout(layout, available);
    expect(parts).not.toBeNull();
    expect(parts![0].height).toBeLessThanOrEqual(available + 1e-6);
  });

  it('repeats the same header on the tail, and marks the tail as a continuation', () => {
    const layout = measure(rowsOf(20));
    const [head, tail] = splitGridLayout(layout, layout.height / 2)!;
    expect(tail.header).toEqual(layout.header);
    expect(head.header).toEqual(layout.header);
    expect(head.continued).toBe(false);
    expect(tail.continued).toBe(true);
    expect(tail.height).toBeCloseTo(
      layout.header.height + tail.rows.reduce((s, r) => s + r.height, 0),
      6
    );
  });

  it('never ends the head on a group heading, and restates a carried group as "(continued)"', () => {
    const rows: TableRow[] = [
      { type: 'group', label: 'Enterprise Computing' },
      ...rowsOf(12),
      { type: 'group', label: 'Software Engineering' },
      ...rowsOf(3),
    ];
    const layout = measure(rows);
    // Room for the first group heading and some of its rows, but not all of them.
    const parts = splitGridLayout(layout, layout.height * 0.3);
    expect(parts).not.toBeNull();
    const [head, tail] = parts!;
    expect(head.rows[head.rows.length - 1].type).toBe('body');
    const restated = tail.rows[0];
    expect(restated.type).toBe('group');
    expect(restated.label).toBe('Enterprise Computing (continued)');
  });

  it('starts the tail at a new group without restating the one the head closed', () => {
    const rows: TableRow[] = [
      { type: 'group', label: 'Enterprise Computing' },
      ...rowsOf(6),
      { type: 'group', label: 'Software Engineering' },
      ...rowsOf(6),
    ];
    const layout = measure(rows);
    // Just enough room to close the first group exactly.
    const firstGroupRows = layout.rows.slice(0, 7).reduce((s, r) => s + r.height, 0);
    const parts = splitGridLayout(layout, layout.header.height + firstGroupRows + 0.01);
    expect(parts).not.toBeNull();
    const [, tail] = parts!;
    expect(tail.rows[0].type).toBe('group');
    expect(tail.rows[0].label).toBe('Software Engineering');
  });

  it('conserves every body row across the split, for every room over a long sweep', () => {
    const layout = measure(rowsOf(37));
    const total = bodyCount(layout);
    for (let k = 1; k <= 60; k++) {
      const available = layout.header.height + (layout.height - layout.header.height) * (k / 60);
      const parts = splitGridLayout(layout, available);
      if (!parts) continue;
      const [head, tail] = parts;
      expect(bodyCount(head) + bodyCount(tail)).toBe(total);
      expect(head.height).toBeLessThanOrEqual(available + 1e-6);
      expect(bodyCount(head)).toBeGreaterThanOrEqual(TABLE.MIN_HEAD_ROWS);
      expect(bodyCount(tail)).toBeGreaterThanOrEqual(TABLE.MIN_TAIL_ROWS);
      // The rows themselves, in order, with no duplicate.
      const names = [...head.rows, ...tail.rows]
        .filter((r) => r.type === 'body')
        .map((r) => (r.type === 'body' ? r.cells[0].drawing : null))
        .map((d) => (d && d.kind === 'lines' ? d.lines[0].text : ''));
      expect(new Set(names).size).toBe(total);
    }
  });

  it('gives a minimum that keeps a heading with the header and two rows', () => {
    const layout = measure(rowsOf(9));
    const min = gridMinimumHeight(layout);
    const two = layout.header.height + layout.rows[0].height + layout.rows[1].height;
    expect(min).toBeCloseTo(two, 6);
    expect(gridMinimumHeight(measure(rowsOf(1)))).toBeCloseTo(measure(rowsOf(1)).height, 6);
  });
});

describe('a table in the page flow', () => {
  const geo = computeGeometry({
    size: 'a4',
    columnsPerPage: 2,
    columnGap: 7,
    headerHeight: 10,
    footerHeight: 8,
    margin: 10,
  });

  const table = (id: string, rows: number): ContentBlock => ({
    kind: 'table',
    id,
    fullWidth: true,
    runs: [],
    report: { type: 'table', columns, rows: rowsOf(rows) },
    breakable: true,
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
    icon: 'people',
    display: true,
    basePadTop: 4.6,
    basePadBottom: 2,
  });

  it('places every row of a long table exactly once, across however many pages', () => {
    const plan = planLayout([table('t', 120)], reportMeasurer, geo, 1);
    const fragments = plan.flow.placements.map((p) => p.block);
    const bodies = fragments.reduce(
      (sum, b) => sum + (b.reportLayout?.kind === 'table' ? bodyCount(b.reportLayout) : 0),
      0
    );
    expect(bodies).toBe(120);
    expect(plan.flow.pageCount).toBeGreaterThan(1);
  });

  it('never puts two fragments of one table on a page (no header in the middle of a page)', () => {
    // The regression: cutting a table into column-sized pieces up front put a header
    // in the middle of a page. A table splits where the page ends, and only there.
    for (const n of [60, 120, 200]) {
      for (const lead of [0, 1, 3, 9, 22]) {
        const blocks: ContentBlock[] = [filler(lead), table('t', n)];
        const { placements } = planLayout(blocks, reportMeasurer, geo, 1).flow;
        const perPage = new Map<number, number>();
        for (const p of placements) {
          if (p.block.reportLayout?.kind !== 'table') continue;
          perPage.set(p.page, (perPage.get(p.page) ?? 0) + 1);
        }
        // The table really does split here, so the check above is not vacuous.
        if (n === 120 && lead === 9) expect(perPage.size).toBeGreaterThan(1);
        for (const count of perPage.values()) expect(count).toBe(1);
      }
    }
  });

  it('keeps a heading on the page of its table and two rows of the table with it', () => {
    // Heading + header + at least two rows, or the heading moves: at every fill level.
    let pushed = 0;
    for (let lines = 1; lines <= 60; lines++) {
      const blocks: ContentBlock[] = [filler(lines), heading('h'), table('t', 30)];
      const { placements } = planLayout(blocks, reportMeasurer, geo, 1).flow;
      const h = placements.find((p) => p.block.id === 'h')!;
      const firstFragment = placements.find((p) => p.block.id.startsWith('t'))!;
      expect(firstFragment.page).toBe(h.page);
      if (firstFragment.block.reportLayout?.kind === 'table') {
        expect(bodyCount(firstFragment.block.reportLayout)).toBeGreaterThanOrEqual(
          Math.min(TABLE.MIN_HEAD_ROWS, 30)
        );
      }
      if (h.page > 0) pushed += 1;
    }
    expect(pushed).toBeGreaterThan(0);
  });

  it('keeps a heading with a table that fits its page, moving them as one', () => {
    let pushed = 0;
    for (let lines = 1; lines <= 60; lines++) {
      const blocks: ContentBlock[] = [filler(lines), heading('h'), table('t', 5)];
      const { placements } = planLayout(blocks, reportMeasurer, geo, 1).flow;
      const h = placements.find((p) => p.block.id === 'h')!;
      const t = placements.find((p) => p.block.id === 't')!;
      expect(t.page).toBe(h.page);
      expect(t.top).toBeCloseTo(h.top + h.block.height, 6);
      if (h.page > 0) pushed += 1;
    }
    expect(pushed).toBeGreaterThan(0);
  });

  it('measures a table block through measureBlocks at the full content width, with no NaN', () => {
    const measured: MeasuredBlock[] = measureBlocks([table('t', 4)], reportMeasurer, geo, 1);
    expect(measured[0].reportLayout?.kind).toBe('table');
    expect(allFinite(measured[0].reportLayout)).toBe(true);
    expect(Number.isFinite(measured[0].height)).toBe(true);
  });
});
