// pdf/layout.ts
//
// Pure, DOM-free layout engine. Everything here is deterministic given a
// TextMeasurer, so page-count and column-placement logic is unit-testable
// under Node without jsPDF or a browser.
//
// Strategy:
//   1. measureBlocks() — measure-then-place: compute each block's full
//      rendered height at a given page scale (pScale).
//   2. flowBlocks()    — column-major distribution: fill the current column
//      top-to-bottom; when the next block won't fit, move to the next column;
//      when columns run out, start a new page. Sequential ids are preserved by
//      keeping input order.
//   3. chooseScale()   — pick the largest scale whose flow fits `maxPages`,
//      otherwise fall back to the smallest scale (graceful overflow).

import {
  ColumnGeometry,
  ContentBlock,
  MeasuredBlock,
  PageDimensions,
  PAGE_DIMENSIONS,
  PAGE_MARGIN_MM,
  PageSizeName,
  PlacedBlock,
  TextMeasurer,
  TextRun,
  MM_PER_PT,
} from './types';

export const getPageDimensions = (size: PageSizeName): PageDimensions => PAGE_DIMENSIONS[size];

export interface GeometryOptions {
  size: PageSizeName;
  columnsPerPage: number;
  columnGap: number; // base mm (pre-scale)
  /** Height reserved at the top of every page for the header (mm). */
  headerHeight: number;
  /** Height reserved at the bottom of every page for the footer (mm). */
  footerHeight: number;
  margin?: number;
}

/** Compute column geometry in millimetres. Margins are fixed (not scaled). */
export const computeGeometry = (opts: GeometryOptions): ColumnGeometry => {
  const dims = getPageDimensions(opts.size);
  const margin = opts.margin ?? PAGE_MARGIN_MM;
  const usableWidth = dims.width - margin * 2;
  const gap = opts.columnGap;
  const cols = Math.max(1, opts.columnsPerPage);
  const columnWidth = (usableWidth - gap * (cols - 1)) / cols;
  const contentTop = margin + opts.headerHeight;
  const columnHeight = dims.height - margin - opts.footerHeight - contentTop;
  return {
    columnsPerPage: cols,
    columnHeight,
    columnWidth,
    columnGap: gap,
    contentLeft: margin,
    contentTop,
  };
};

/** Left edge (mm) of a given column index. */
export const columnLeft = (geo: ColumnGeometry, column: number): number =>
  geo.contentLeft + column * (geo.columnWidth + geo.columnGap);

const runLineHeight = (m: TextMeasurer, run: TextRun, pScale: number): number =>
  m.lineHeight(run.baseFontPt * pScale, run.lineHeightFactor ?? 1.15);

/**
 * Measure one block's rendered height (mm) at `pScale`, pre-wrapping each run
 * to the column width. Padding scales with the document.
 */
export const measureBlock = (
  block: ContentBlock,
  measurer: TextMeasurer,
  columnWidth: number,
  pScale: number
): MeasuredBlock => {
  const padTop = (block.basePadTop ?? 0) * pScale;
  const padBottom = (block.basePadBottom ?? 0) * pScale;

  if (block.kind === 'divider') {
    return { ...block, wrapped: [], height: padTop + padBottom + 0.4 * pScale };
  }
  if (block.kind === 'spacer') {
    return { ...block, wrapped: [], height: padTop + padBottom };
  }

  // A criterion reserves a label/chip line above its feedback runs.
  const labelLineMm =
    block.kind === 'criterion' && (block.label || block.chip)
      ? measurer.lineHeight(Math.max(...block.runs.map((r) => r.baseFontPt)) * pScale, 1.3)
      : 0;

  const wrapped: string[][] = [];
  let body = 0;
  for (const run of block.runs) {
    const fontPt = run.baseFontPt * pScale;
    // Indent list/criterion text slightly to leave room for the marker/bar.
    const indent = block.kind === 'listItem' || block.kind === 'criterion' ? 4 * pScale : 0;
    const lines = measurer.wrap(run.text, columnWidth - indent, fontPt, run.style ?? 'normal');
    wrapped.push(lines);
    body += lines.length * runLineHeight(measurer, run, pScale);
  }

  return {
    ...block,
    wrapped,
    height: padTop + labelLineMm + body + padBottom,
  };
};

/** Measure every block at the given scale. */
export const measureBlocks = (
  blocks: ContentBlock[],
  measurer: TextMeasurer,
  geo: ColumnGeometry,
  pScale: number
): MeasuredBlock[] => blocks.map((b) => measureBlock(b, measurer, geo.columnWidth, pScale));

export interface FlowResult {
  placements: PlacedBlock[];
  pageCount: number;
  /** Deepest content extent (mm from column top) reached on each page. */
  deepestPerPage: number[];
}

/**
 * Column-major flow. A block taller than a full column is still placed at the
 * top of a fresh column (it may overflow into the footer region rather than
 * vanish — measure-then-place guarantees we never silently clip earlier
 * blocks). Leading spacers at the top of a column are suppressed.
 */
export const flowBlocks = (blocks: MeasuredBlock[], geo: ColumnGeometry): FlowResult => {
  const placements: PlacedBlock[] = [];
  const deepestPerPage: number[] = [];
  let page = 0;
  let column = 0;
  let cursor = 0; // mm from column top

  const recordDepth = () => {
    deepestPerPage[page] = Math.max(deepestPerPage[page] ?? 0, cursor);
  };

  const advanceColumn = () => {
    recordDepth();
    column += 1;
    cursor = 0;
    if (column >= geo.columnsPerPage) {
      column = 0;
      page += 1;
    }
  };

  for (const block of blocks) {
    const atColumnTop = cursor === 0;
    // Never start a column with whitespace.
    if (atColumnTop && block.kind === 'spacer') continue;

    const fits = cursor + block.height <= geo.columnHeight + 1e-6;
    if (!fits && !atColumnTop) {
      advanceColumn();
      // A spacer that triggers a break is redundant — the break separates.
      if (block.kind === 'spacer') continue;
    }
    placements.push({ block, page, column, top: cursor });
    cursor += block.height;
  }
  recordDepth();

  return {
    placements,
    pageCount: Math.max(1, page + 1),
    deepestPerPage,
  };
};

export interface ScaleChoice {
  pScale: number;
  pageCount: number;
  fitsTarget: boolean;
}

/**
 * Pick the largest scale (best legibility) whose column-major flow fits within
 * `maxPages`. If none fit — content is genuinely large — fall back to the
 * smallest candidate scale and allow graceful overflow. `scales` should be in
 * descending order.
 */
export const chooseScale = (
  blocks: ContentBlock[],
  measurer: TextMeasurer,
  geoFor: (pScale: number) => ColumnGeometry,
  scales: number[],
  maxPages: number
): ScaleChoice => {
  let smallest: ScaleChoice | null = null;
  for (const pScale of scales) {
    const geo = geoFor(pScale);
    const measured = measureBlocks(blocks, measurer, geo, pScale);
    const { pageCount } = flowBlocks(measured, geo);
    const choice: ScaleChoice = { pScale, pageCount, fitsTarget: pageCount <= maxPages };
    if (choice.fitsTarget) return choice;
    smallest = choice; // keep last (smallest, since descending)
  }
  return smallest ?? { pScale: scales[scales.length - 1] ?? 1, pageCount: 1, fitsTarget: false };
};

/** Convenience: mm height of `n` lines at `fontPt`/leading (engine-independent). */
export const linesToMm = (n: number, fontPt: number, lineHeightFactor: number): number =>
  n * fontPt * lineHeightFactor * MM_PER_PT;
