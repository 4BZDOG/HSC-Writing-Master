import { describe, it, expect } from 'vitest';
import {
  computeGeometry,
  flowBlocks,
  measureBlocks,
  MIN_HEAD_LINES,
  MIN_TAIL_LINES,
  splitOversized,
  splitToFit,
} from '../../pdf/layout';
import type { ContentBlock, MeasuredBlock, PlacedBlock } from '../../pdf/types';
import type { TableRow } from '../../pdf/reportBlocks';
import { TABLE } from '../../pdf/types';
import { reportMeasurer } from './pdfReportHelpers';

/**
 * Keep-with-next: a heading (or a block bound to the next) never ends a column.
 * It moves on whenever the block after it cannot make a start beneath it — fit
 * whole, or split as the splitter itself would split it.
 *
 * The blocks here are the engine's own measurements, so the reservation is
 * checked against real paddings and line heights. Only the content above them
 * is synthetic: a filler of exactly the height that leaves the room a case needs.
 */

const geo = computeGeometry({
  size: 'a4',
  columnsPerPage: 2,
  columnGap: 8,
  headerHeight: 30,
  footerHeight: 8,
  margin: 10,
}); // 239mm columns

const measure = (blocks: ContentBlock[]): MeasuredBlock[] =>
  measureBlocks(blocks, reportMeasurer, geo, 1);

/** An unbreakable block that leaves exactly `room` mm of the column below it. */
const fillerLeaving = (room: number, fullWidth = true): MeasuredBlock => ({
  kind: 'paragraph',
  id: 'filler',
  fullWidth,
  runs: [],
  wrapped: [],
  padTopMm: 0,
  padBottomMm: 0,
  lineHeightMm: 0,
  textIndentMm: 0,
  height: geo.columnHeight - room,
});

const heading = (id: string, fullWidth = true): ContentBlock => ({
  kind: 'heading',
  id,
  fullWidth,
  runs: [{ text: id, baseFontPt: 9, style: 'bold' }],
  icon: 'info',
  display: true,
  basePadTop: 4.6,
  basePadBottom: 2,
});

/** A framed note of `lines` lines, set as "About this report" is. */
const panelNote = (id: string, lines: number): ContentBlock => ({
  kind: 'paragraph',
  id,
  fullWidth: true,
  panel: true,
  breakable: true,
  // Each 'note' and its space is 7.5mm at 8.5pt; 22 to a line in the panel.
  runs: [{ text: 'note '.repeat(lines * 22 - 2).trim(), baseFontPt: 8.5, lineHeightFactor: 1.4 }],
  basePadBottom: 2,
});

/** An unbreakable two-column item: a tick box with its text. */
const columnItem = (id: string): ContentBlock => ({
  kind: 'listItem',
  id,
  checkbox: true,
  runs: [{ text: 'word '.repeat(40).trim(), baseFontPt: 8.5 }],
  basePadBottom: 1.5,
});

/** A plain synthetic block: the balancer reads heights, not text. */
const plain = (
  id: string,
  height: number,
  kind: MeasuredBlock['kind'] = 'paragraph'
): MeasuredBlock => ({
  kind,
  id,
  runs: [],
  wrapped: [],
  padTopMm: kind === 'spacer' ? height : 0,
  padBottomMm: 0,
  lineHeightMm: 0,
  textIndentMm: 0,
  height,
});

const placementOf = (placements: PlacedBlock[], id: string): PlacedBlock => {
  const found = placements.find((p) => p.block.id === id);
  if (!found) throw new Error(`${id} was not placed`);
  return found;
};

/** The heading sits on the same page and column as its follower, directly above it. */
const expectKeptTogether = (placements: PlacedBlock[], headingId: string, nextId: string) => {
  const h = placementOf(placements, headingId);
  const next = placementOf(placements, nextId);
  expect(next.page).toBe(h.page);
  expect(next.column).toBe(h.column);
  expect(next.top).toBeCloseTo(h.top + h.block.height, 6);
};

describe('keep-with-next in the block flow', () => {
  it('moves a heading whose panel cannot split beneath it ("About this report")', () => {
    // The fixture-R2 case. A four-line panel cannot split (three lines must stay
    // and two must travel), but the old reservation counted three lines of it
    // without the frame's foot — so the heading fitted, and the panel did not.
    const [h, note] = measure([heading('h-about'), panelNote('about-notes', 4)]);
    expect(note.wrapped[0]).toHaveLength(4);
    const threeLines = note.padTopMm + MIN_HEAD_LINES * note.lineHeightMm;
    const room = h.height + (threeLines + note.height) / 2;
    expect(room).toBeLessThan(h.height + note.height);

    const { placements, pageCount } = flowBlocks([fillerLeaving(room), h, note], geo);

    expect(placementOf(placements, 'h-about').page).toBe(1);
    expectKeptTogether(placements, 'h-about', 'about-notes');
    expect(pageCount).toBe(2);
  });

  it('leaves the heading where it is when the whole block fits beneath it', () => {
    const [h, note] = measure([heading('h-about'), panelNote('about-notes', 4)]);
    const { placements, pageCount } = flowBlocks(
      [fillerLeaving(h.height + note.height + 0.2), h, note],
      geo
    );

    expect(placementOf(placements, 'h-about').page).toBe(0);
    expectKeptTogether(placements, 'h-about', 'about-notes');
    expect(pageCount).toBe(1);
  });

  it('keeps the heading over the first fragment when its block can split there', () => {
    // A long panel CAN split: its first lines stay under the heading at the foot
    // of the page, and the rest continues overleaf. Moving the heading would
    // waste the room for nothing.
    const [h, note] = measure([heading('h-long'), panelNote('long-notes', 12)]);
    const room = h.height + note.padTopMm + note.padBottomMm + 5 * note.lineHeightMm + 0.1;
    const { placements } = flowBlocks([fillerLeaving(room), h, note], geo);

    expect(placementOf(placements, 'h-long').page).toBe(0);
    expectKeptTogether(placements, 'h-long', 'long-notes');
    expect(placementOf(placements, 'long-notes').block.wrapped[0]).toHaveLength(5);
  });

  it('moves a heading whose short table cannot split beneath it', () => {
    // The fixture-R8 case: "By topic" over a three-row table. The old reservation
    // was the header and two rows, but a table that short never splits.
    const rows: TableRow[] = ['Requirements', 'Software design', 'Testing'].map((name, i) => ({
      type: 'body',
      cells: [
        { type: 'text', text: name },
        { type: 'number', value: i + 1 },
      ],
    }));
    expect(rows.length).toBeLessThan(TABLE.MIN_HEAD_ROWS + TABLE.MIN_TAIL_ROWS);
    const [h, table] = measure([
      heading('h-topics'),
      {
        kind: 'table',
        id: 'topics',
        fullWidth: true,
        breakable: true,
        runs: [],
        report: {
          type: 'table',
          columns: [
            { key: 'topic', header: 'Topic', align: 'left', widthWeight: 4, kind: 'text' },
            { key: 'answers', header: 'Answers', align: 'right', widthWeight: 1, kind: 'number' },
          ],
          rows,
        },
      },
    ]);
    const { placements } = flowBlocks([fillerLeaving(h.height + table.height - 1), h, table], geo);

    expect(placementOf(placements, 'h-topics').page).toBe(1);
    expectKeptTogether(placements, 'h-topics', 'topics');
  });

  it('moves a column heading to the next column with its unbreakable item', () => {
    const [h, item] = measure([
      heading('h-growth', false),
      {
        kind: 'listItem',
        id: 'growth-1',
        checkbox: true,
        runs: [{ text: 'word '.repeat(40).trim(), baseFontPt: 8.5 }],
        basePadBottom: 1.5,
      },
    ]);
    const { placements } = flowBlocks(
      [fillerLeaving(h.height + item.height / 2, false), h, item],
      geo
    );

    expect(placementOf(placements, 'h-growth')).toMatchObject({ page: 0, column: 1, top: 0 });
    expectKeptTogether(placements, 'h-growth', 'growth-1');
  });

  it('looks past a spacer to the content it introduces', () => {
    // The spacer would fit; the block after it would not. Placing the heading
    // and spacer and then breaking would strand the heading just the same.
    const [h, gap, note] = measure([
      heading('h-gap'),
      { kind: 'spacer', id: 'gap', fullWidth: true, runs: [], basePadTop: 2 },
      panelNote('gap-notes', 4),
    ]);
    const { placements } = flowBlocks(
      [fillerLeaving(h.height + gap.height + note.height / 2), h, gap, note],
      geo
    );

    const head = placementOf(placements, 'h-gap');
    const body = placementOf(placements, 'gap-notes');
    expect(head.page).toBe(1);
    expect(body.page).toBe(1);
  });

  it('treats a block flagged keepWithNext as a heading', () => {
    // A sub-heading set as a paragraph ("Why these edits earn the mark") is
    // bound to the list under it by the flag rather than by its kind.
    const [sub, item] = measure([
      {
        kind: 'paragraph',
        id: 'sub',
        fullWidth: true,
        keepWithNext: true,
        runs: [{ text: 'Why these edits earn the mark', baseFontPt: 8.5, style: 'bold' }],
        basePadTop: 1,
        basePadBottom: 1.5,
      },
      panelNote('sub-notes', 4),
    ]);
    const { placements } = flowBlocks(
      [fillerLeaving(sub.height + item.height - 1), sub, item],
      geo
    );

    expect(placementOf(placements, 'sub').page).toBe(1);
    expectKeptTogether(placements, 'sub', 'sub-notes');
  });
});

describe('keep-with-next across a band boundary', () => {
  // A heading that ends its band cannot see what it introduces: the next band
  // lays that out, beneath it. These pin the flow's look across the boundary.

  it('moves a full-width heading whose two-column content cannot start beneath it', () => {
    const [h, item] = measure([heading('h-span'), columnItem('item')]);
    expect(h.fullWidth).toBe(true);
    expect(item.fullWidth).toBeFalsy();
    const { placements, pageCount } = flowBlocks(
      [fillerLeaving(h.height + item.height / 2), h, item],
      geo
    );

    expect(placementOf(placements, 'h-span')).toMatchObject({ page: 1, top: 0 });
    expectKeptTogether(placements, 'h-span', 'item');
    expect(pageCount).toBe(2);
  });

  it('moves a column heading whose full-width content cannot start beneath it', () => {
    const [h, note] = measure([heading('h-col', false), panelNote('span-notes', 4)]);
    const { placements } = flowBlocks(
      [fillerLeaving(h.height + note.height / 2, false), h, note],
      geo
    );

    expect(placementOf(placements, 'h-col')).toMatchObject({ page: 1, column: 0, top: 0 });
    expectKeptTogether(placements, 'h-col', 'span-notes');
  });

  it('carries a spacer between the heading and its content over with them', () => {
    const [h, gap, item] = measure([
      heading('h-gap'),
      { kind: 'spacer', id: 'gap', fullWidth: true, runs: [], basePadTop: 2 },
      columnItem('gap-item'),
    ]);
    const { placements } = flowBlocks(
      [fillerLeaving(h.height + gap.height + item.height / 2), h, gap, item],
      geo
    );

    expect(placementOf(placements, 'h-gap').page).toBe(1);
    expect(placementOf(placements, 'gap-item')).toMatchObject({
      page: 1,
      column: 0,
      top: h.height + gap.height,
    });
  });

  it('leaves the heading where it is when the content can start beneath it', () => {
    // A long panel splits at the page foot, so its heading stays over the first
    // fragment rather than leave the room blank.
    const [h, note] = measure([heading('h-col', false), panelNote('long-notes', 12)]);
    const room = h.height + note.padTopMm + note.padBottomMm + 5 * note.lineHeightMm + 0.1;
    const { placements } = flowBlocks([fillerLeaving(room, false), h, note], geo);

    expect(placementOf(placements, 'h-col').page).toBe(0);
    expectKeptTogether(placements, 'h-col', 'long-notes');
  });

  it('keeps the earlier content of the band where it was', () => {
    // Only the heading is taken over; the band above it is flowed as before.
    const [h, item] = measure([heading('h-span'), columnItem('item')]);
    const filler = fillerLeaving(h.height + item.height / 2);
    const { placements } = flowBlocks([filler, h, item], geo);

    expect(placementOf(placements, 'filler')).toMatchObject({ page: 0, column: 0, top: 0 });
    expect(placements).toHaveLength(3);
  });
});

describe('keep-with-next past a spacer', () => {
  it('never evens the columns by cutting between a heading’s spacer and its content', () => {
    // 40 + 10 + 5 | 50 is the most even cut on this page, and it would leave the
    // heading and its spacer at the foot of column one over nothing.
    const blocks = [
      plain('a', 40),
      plain('h', 10, 'heading'),
      plain('gap', 5, 'spacer'),
      plain('item', 50),
    ];
    const { placements } = flowBlocks(blocks, geo);
    const h = placementOf(placements, 'h');
    const item = placementOf(placements, 'item');

    expect(item.column).toBe(h.column);
    expect(item.page).toBe(h.page);
  });

  it('does not count a spacer the next band drops at its top', () => {
    // A two-column band never starts with whitespace, so the spacer that opens
    // it takes no room — and the heading above it has no reason to move.
    const [h, item] = measure([heading('h-span'), columnItem('item')]);
    const gap = plain('gap', 3, 'spacer');
    const room = h.height + item.height + 1; // less than the spacer would need
    const { placements } = flowBlocks([fillerLeaving(room), h, gap, item], geo);

    expect(placementOf(placements, 'h-span').page).toBe(0);
    expect(placementOf(placements, 'item')).toMatchObject({
      page: 0,
      top: geo.columnHeight - room + h.height,
    });
  });
});

describe('the cases the random-layout check found', () => {
  it('keeps two headings in a row together when the second would move for its section', () => {
    // The section move judged the third heading alone and took it to the next
    // column for its section's sake, leaving the two above it at the foot of
    // this one. The content after it runs on to later pages, so the column
    // balancing of the last page cannot tidy it up afterwards.
    const body: MeasuredBlock = {
      ...plain('body', 100),
      breakable: true,
      runs: [{ text: 'x', baseFontPt: 9 }],
      wrapped: [Array.from({ length: 20 }, (_, l) => `l${l}`)],
      lineHeightMm: 5,
    };
    const blocks = [
      plain('a', 160),
      plain('h1', 13, 'heading'),
      plain('h2', 15, 'heading'),
      plain('h3', 10, 'heading'),
      body,
      plain('h4', 10, 'heading'),
      plain('x1', 120),
      plain('x2', 120),
      plain('x3', 120),
    ];
    const { placements } = flowBlocks(blocks, geo);

    expectKeptTogether(placements, 'h1', 'h2');
    expectKeptTogether(placements, 'h2', 'h3');
    expectKeptTogether(placements, 'h3', 'body');
  });

  it('puts a column heading that ends its band directly above the content after it', () => {
    // Balanced with its band, the heading went to the top of the right-hand
    // column while what it introduces began beneath the left.
    const blocks = [
      plain('a', 30),
      plain('b', 30),
      plain('h', 12, 'heading'),
      { ...plain('gap', 3, 'spacer'), fullWidth: true },
      plain('content', 20),
    ];
    const { placements } = flowBlocks(blocks, geo);
    const h = placementOf(placements, 'h');
    const content = placementOf(placements, 'content');

    expect(content).toMatchObject({ page: h.page, column: h.column });
    expect(content.top).toBeGreaterThanOrEqual(h.top + h.block.height - 1e-6);
  });

  it('splits a long paragraph that opens a band part-way down the page', () => {
    // It used to take the whole band overleaf and leave the rest of the page blank.
    const lines = Array.from({ length: 60 }, (_, l) => `l${l}`);
    const para: MeasuredBlock = {
      ...plain('long', 60 * 4),
      breakable: true,
      runs: [{ text: 'x', baseFontPt: 9 }],
      wrapped: [lines],
      lineHeightMm: 4,
    };
    const { placements } = flowBlocks([fillerLeaving(100), para], geo);

    expect(placementOf(placements, 'long')).toMatchObject({ page: 0 });
  });
});

describe('the prose splitter', () => {
  const paragraph = (lines: number, panel = false, padBottomMm = 3): MeasuredBlock => ({
    ...plain('p', 2 + lines * 4 + padBottomMm),
    breakable: true,
    panel,
    runs: [{ text: 'x', baseFontPt: 9 }],
    wrapped: [Array.from({ length: lines }, (_, l) => `l${l}`)],
    padTopMm: 2,
    padBottomMm,
    lineHeightMm: 4,
  });

  it('gives the tail its minimum rather than refuse a split one line short', () => {
    // Room for all but one line: keep back one more, and move two.
    const split = splitToFit(paragraph(20), 2 + 19 * 4 + 0.5);

    expect(split).not.toBeNull();
    expect(split![1].wrapped[0]).toHaveLength(MIN_TAIL_LINES);
  });

  it('cuts every fragment of a long panel to fit a column, frame and all', () => {
    const fragments = splitOversized([paragraph(140, true)], geo.columnHeight);

    expect(fragments.length).toBeGreaterThan(1);
    for (const f of fragments) expect(f.height).toBeLessThanOrEqual(geo.columnHeight + 1e-6);
  });

  it('cuts the last fragment of long prose to fit with its bottom padding', () => {
    // A continuation fragment has no top pad: 59 lines take 236 of the column's
    // 239mm, and a 4mm bottom pad does not fit beneath them.
    const fragments = splitOversized([paragraph(59 + 59, false, 4)], geo.columnHeight);

    for (const f of fragments) expect(f.height).toBeLessThanOrEqual(geo.columnHeight + 1e-6);
  });
});
