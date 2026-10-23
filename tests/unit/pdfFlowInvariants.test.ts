import { describe, it, expect } from 'vitest';
import { computeGeometry, flowBlocks, splitOversized } from '../../pdf/layout';
import type { MeasuredBlock } from '../../pdf/types';

/**
 * The block flow's invariants, over thousands of seeded random layouts.
 *
 * The samples only reach the arrangements real reports happen to make, and every
 * keep-with-next defect so far sat in one they did not: two headings in a row, a
 * heading at the end of its band, a band that opens on a long paragraph. Random
 * runs of headings, bound pairs, spacers and prose in both widths reach those, and
 * the seeds keep any failure reproducible: `check(make(seed))` replays it.
 */

const geo = computeGeometry({
  size: 'a4',
  columnsPerPage: 2,
  columnGap: 8,
  headerHeight: 30,
  footerHeight: 8,
  margin: 10,
});

/** mulberry32: a small seeded generator, so a failing seed replays exactly. */
const random = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/**
 * A random document: runs of each width, of headings, bound list items, spacers
 * and prose. `longProse` lets breakable paragraphs run past a page, as a long
 * response does; an unbreakable block never does, since nothing could follow it.
 */
const make = (seed: number, longProse = false): MeasuredBlock[] => {
  const r = random(seed);
  const out: MeasuredBlock[] = [];
  let fullWidth = r() < 0.5;
  const count = 5 + Math.floor(r() * 40);
  for (let k = 0; k < count; k++) {
    if (r() < 0.15) fullWidth = !fullWidth;
    const base = {
      id: `b${k}`,
      runs: [{ text: 'x', baseFontPt: 9 }],
      fullWidth,
      textIndentMm: 0,
    };
    const roll = r();
    if (roll < 0.2) {
      out.push({
        ...base,
        kind: 'heading',
        wrapped: [['h']],
        padTopMm: 3,
        padBottomMm: 2,
        lineHeightMm: 5,
        height: 10 + 5 * r(),
      });
    } else if (roll < 0.3) {
      const height = 2 + 2 * r();
      out.push({
        ...base,
        kind: 'spacer',
        runs: [],
        wrapped: [],
        padTopMm: height,
        padBottomMm: 0,
        lineHeightMm: 0,
        height,
      });
    } else if (roll < 0.4) {
      out.push({
        ...base,
        kind: 'listItem',
        wrapped: [['i']],
        padTopMm: 0,
        padBottomMm: 1,
        lineHeightMm: 4,
        height: 6 + 30 * r(),
        keepWithNext: r() < 0.4,
      });
    } else {
      const breakable = r() < 0.8;
      const lines = 1 + Math.floor(r() * (longProse && breakable ? 70 : 25));
      const lineHeightMm = 3.5 + 2 * r();
      const padTopMm = 4 * r();
      const padBottomMm = 4 * r();
      out.push({
        ...base,
        kind: 'paragraph',
        breakable,
        panel: r() < 0.3,
        wrapped: [Array.from({ length: lines }, (_, l) => `line ${l}`)],
        padTopMm,
        padBottomMm,
        lineHeightMm,
        height: padTopMm + lines * lineHeightMm + padBottomMm,
      });
    }
  }
  return out;
};

/** Every way the flow of `input` breaks an invariant, as readable lines. */
const check = (input: MeasuredBlock[]): string[] => {
  const problems: string[] = [];
  // As `planLayout` does: nothing reaching the flow is taller than a column.
  const { placements } = flowBlocks(splitOversized(input, geo.columnHeight), geo);
  const where = (k: number) => {
    const p = placements[k];
    return `${p.block.id} p${p.page}c${p.column}@${p.top.toFixed(1)}`;
  };

  // Every block is placed (a split block under its own id, at least once).
  const placed = new Set(placements.map((p) => p.block.id.replace(/-(feed)?cont.*$/, '')));
  for (const b of input) {
    if (b.kind !== 'spacer' && !placed.has(b.id)) problems.push(`missing ${b.id}`);
  }

  placements.forEach((p, k) => {
    // Nothing runs past the foot of its column.
    if (p.top + p.block.height > geo.columnHeight + 1e-6) problems.push(`overflow ${where(k)}`);

    // Nothing is drawn over anything else.
    for (let m = k + 1; m < placements.length; m++) {
      const q = placements[m];
      const sameStrip = p.block.fullWidth || q.block.fullWidth || p.column === q.column;
      const overlaps =
        p.page === q.page &&
        sameStrip &&
        p.top < q.top + q.block.height - 1e-6 &&
        q.top < p.top + p.block.height - 1e-6;
      if (overlaps) problems.push(`overlap ${where(k)} ${where(m)}`);
    }

    // A heading or bound block is directly above the next thing placed (past any
    // spacers): same page, same column unless one of them spans the page.
    const b = p.block;
    if (b.kind !== 'heading' && !b.keepWithNext) return;
    let n = k + 1;
    while (placements[n]?.block.kind === 'spacer') n += 1;
    const q = placements[n];
    if (!q) return;
    const together =
      q.page === p.page &&
      (q.column === p.column || !!b.fullWidth || !!q.block.fullWidth) &&
      q.top >= p.top + b.height - 1e-6;
    if (!together) problems.push(`stranded ${where(k)} -> ${where(n)}`);
  });
  return problems;
};

/**
 * The first few failures across `seeds` whose kind is one of `kinds`, each with
 * the seed that replays it.
 */
const failures = (seeds: number, longProse: boolean, kinds: string[]): string[] => {
  const found: string[] = [];
  for (let seed = 1; seed <= seeds && found.length < 5; seed++) {
    for (const problem of check(make(seed, longProse))) {
      if (kinds.includes(problem.split(' ')[0])) found.push(`seed ${seed}: ${problem}`);
    }
  }
  return found;
};

const PLACEMENT = ['missing', 'overflow', 'overlap'];
const KEEP = ['stranded'];

describe('the block flow over random documents', () => {
  it('places everything, once, inside its column, and nothing over anything', () => {
    expect(failures(3000, false, PLACEMENT)).toEqual([]);
  });

  it('never parts a heading or bound block from what follows it', () => {
    expect(failures(3000, false, KEEP)).toEqual([]);
  });

  it('holds with prose long enough to run across pages', () => {
    expect(failures(1500, true, [...PLACEMENT, ...KEEP])).toEqual([]);
  });
});
