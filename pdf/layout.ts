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
  const primaryPt = (block.runs[0]?.baseFontPt ?? 9) * pScale;
  const lineHeightMm = measurer.lineHeight(primaryPt, block.runs[0]?.lineHeightFactor ?? 1.15);

  if (block.kind === 'divider') {
    return {
      ...block,
      wrapped: [],
      padTopMm: padTop,
      padBottomMm: padBottom,
      lineHeightMm: 0,
      height: padTop + padBottom + 0.4 * pScale,
    };
  }
  if (block.kind === 'spacer') {
    return {
      ...block,
      wrapped: [],
      padTopMm: padTop,
      padBottomMm: padBottom,
      lineHeightMm: 0,
      height: padTop + padBottom,
    };
  }

  // A criterion reserves wrapped label/chip lines above its feedback runs.
  let labelWrapped: string[] | undefined;
  let labelHeightMm = 0;
  if (block.kind === 'criterion' && block.label) {
    const labelPt = (block.runs[0]?.baseFontPt ?? 9) * pScale;
    const indent = 4 * pScale;
    const chipReserve = block.chip ? 18 * pScale : 0;
    labelWrapped = measurer.wrap(block.label, columnWidth - indent - chipReserve, labelPt, 'bold');
    labelHeightMm = labelWrapped.length * measurer.lineHeight(labelPt, 1.3);
  }

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
    labelWrapped,
    padTopMm: padTop,
    padBottomMm: padBottom,
    lineHeightMm,
    height: padTop + labelHeightMm + body + padBottom,
  };
};

/** Measure every block at the given scale. */
export const measureBlocks = (
  blocks: ContentBlock[],
  measurer: TextMeasurer,
  geo: ColumnGeometry,
  pScale: number
): MeasuredBlock[] => blocks.map((b) => measureBlock(b, measurer, geo.columnWidth, pScale));

/**
 * Split single-run breakable blocks that are taller than a full column into
 * column-sized fragments so prose never overflows the footer / page edge.
 * Non-breakable or already-fitting blocks pass through untouched.
 */
export const splitOversized = (blocks: MeasuredBlock[], columnHeight: number): MeasuredBlock[] => {
  const out: MeasuredBlock[] = [];
  for (const b of blocks) {
    const splittable =
      b.breakable &&
      b.kind === 'paragraph' &&
      b.wrapped.length === 1 &&
      b.wrapped[0].length > 1 &&
      b.lineHeightMm > 0;

    if (!splittable || b.height <= columnHeight + 1e-6) {
      out.push(b);
      continue;
    }

    const lines = b.wrapped[0];
    let index = 0;
    let firstFragment = true;
    while (index < lines.length) {
      const padTop = firstFragment ? b.padTopMm : 0;
      // Reserve bottom padding only if the remainder will fit in this fragment.
      const linesThatFit = Math.max(1, Math.floor((columnHeight - padTop) / b.lineHeightMm));
      const chunk = lines.slice(index, index + linesThatFit);
      index += chunk.length;
      const isLast = index >= lines.length;
      const padBottom = isLast ? b.padBottomMm : 0;
      out.push({
        ...b,
        id: firstFragment ? b.id : `${b.id}-cont${index}`,
        wrapped: [chunk],
        padTopMm: padTop,
        padBottomMm: padBottom,
        height: padTop + chunk.length * b.lineHeightMm + padBottom,
      });
      firstFragment = false;
    }
  }
  return out;
};

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

export interface LayoutPlan {
  /** Measured + oversize-split blocks in draw order. */
  blocks: MeasuredBlock[];
  flow: FlowResult;
}

/** Measure → split oversized prose → flow. The single source of layout truth. */
export const planLayout = (
  blocks: ContentBlock[],
  measurer: TextMeasurer,
  geo: ColumnGeometry,
  pScale: number
): LayoutPlan => {
  const measured = splitOversized(measureBlocks(blocks, measurer, geo, pScale), geo.columnHeight);
  return { blocks: measured, flow: flowBlocks(measured, geo) };
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
    const { pageCount } = planLayout(blocks, measurer, geo, pScale).flow;
    const choice: ScaleChoice = { pScale, pageCount, fitsTarget: pageCount <= maxPages };
    if (choice.fitsTarget) return choice;
    smallest = choice; // keep last (smallest, since descending)
  }
  return smallest ?? { pScale: scales[scales.length - 1] ?? 1, pageCount: 1, fitsTarget: false };
};

/** Convenience: mm height of `n` lines at `fontPt`/leading (engine-independent). */
export const linesToMm = (n: number, fontPt: number, lineHeightFactor: number): number =>
  n * fontPt * lineHeightFactor * MM_PER_PT;
