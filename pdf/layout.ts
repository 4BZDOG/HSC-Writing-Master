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
  LAYOUT,
  BAND_SCALE,
  METER,
  RULE_LINES,
  SCORE_SUMMARY,
  TextMeasurer,
  TextRun,
  InlineSpan,
  MM_PER_PT,
} from './types';
import { wrapRich } from './wrapRich';
import { spansToText } from './inline';

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
 * Height (mm) of the extras a block can carry — the proportion meter, the band
 * ladder, the ruled notes. Exported because the drawer needs the identical
 * numbers: measuring one thing and drawing another is how a two-column flow
 * ends up with text over its own footer.
 */
export const meterHeight = (block: ContentBlock, pScale: number): number =>
  block.meter ? (METER.gapAboveBaseMm + METER.heightBaseMm + METER.gapBelowBaseMm) * pScale : 0;

export const bandScaleHeight = (block: ContentBlock, pScale: number): number =>
  block.bandScale
    ? (BAND_SCALE.gapBaseMm + BAND_SCALE.heightBaseMm + BAND_SCALE.labelPt * MM_PER_PT * 1.4) *
      pScale
    : 0;

export const ruleLinesHeight = (block: ContentBlock, pScale: number): number =>
  block.ruleLines ? block.ruleLines * RULE_LINES.gapBaseMm * pScale : 0;

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

  // Bullets, criterion text, and accented paragraphs share one indent so they
  // align and (crucially) wrap to the same width they're drawn at.
  const indented =
    block.kind === 'listItem' ||
    block.kind === 'criterion' ||
    (block.kind === 'paragraph' && !!block.accent);
  const textIndentMm = indented ? LAYOUT.contentIndentBaseMm * pScale : 0;

  if (block.kind === 'divider') {
    return {
      ...block,
      wrapped: [],
      padTopMm: padTop,
      padBottomMm: padBottom,
      lineHeightMm: 0,
      textIndentMm: 0,
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
      textIndentMm: 0,
      height: padTop + padBottom,
    };
  }

  // The score-summary box must be tall enough for its chip + label + metrics.
  if (block.kind === 'scoreSummary') {
    const pad = SCORE_SUMMARY.innerPadBaseMm * pScale;
    const bar = SCORE_SUMMARY.accentBarBaseMm * pScale;
    const chipH = SCORE_SUMMARY.chipPt * pScale * MM_PER_PT;
    const labelH = SCORE_SUMMARY.labelPt * pScale * SCORE_SUMMARY.labelLineFactor * MM_PER_PT;
    const metricsRun = block.runs[0];
    const metricsPt = (metricsRun?.baseFontPt ?? 9) * pScale;
    const chipReserve = SCORE_SUMMARY.chipReserveBaseMm * pScale;
    const metricsLines = metricsRun
      ? measurer.wrap(
          metricsRun.text,
          columnWidth - pad * 2 - bar - chipReserve,
          metricsPt,
          metricsRun.style ?? 'bold'
        )
      : [];
    const metricsH =
      metricsLines.length * measurer.lineHeight(metricsPt, SCORE_SUMMARY.metricsLineFactor);
    const inner = Math.max(chipH, labelH + metricsH) + bandScaleHeight(block, pScale);
    return {
      ...block,
      wrapped: [metricsLines],
      padTopMm: padTop,
      padBottomMm: padBottom,
      lineHeightMm,
      textIndentMm: 0,
      height: padTop + pad * 2 + inner + padBottom,
    };
  }

  // A criterion reserves wrapped label/chip lines above its feedback runs.
  let labelWrapped: string[] | undefined;
  let labelHeightMm = 0;
  if (block.kind === 'criterion' && block.label) {
    const labelPt = (block.runs[0]?.baseFontPt ?? 9) * pScale;
    const chipReserve = block.chip ? LAYOUT.criterionChipReserveBaseMm * pScale : 0;
    labelWrapped = measurer.wrap(
      block.label,
      columnWidth - textIndentMm - chipReserve,
      labelPt,
      'bold'
    );
    labelHeightMm = labelWrapped.length * measurer.lineHeight(labelPt, 1.3);
  }
  const labelExtraMm = meterHeight(block, pScale);

  const wrapped: string[][] = [];
  const wrappedRich: (InlineSpan[][] | null)[] = [];
  let body = 0;
  for (const run of block.runs) {
    const fontPt = run.baseFontPt * pScale;
    if (run.spans?.length) {
      // Wrapped in the styles it will be DRAWN in, and the plain lines derived
      // from that wrap rather than measured separately — two wraps of the same
      // paragraph would disagree the moment a bold term sat near a line end.
      const richLines = wrapRich(run.spans, columnWidth - textIndentMm, fontPt, measurer);
      wrappedRich.push(richLines);
      wrapped.push(richLines.map(spansToText));
      body += richLines.length * runLineHeight(measurer, run, pScale);
      continue;
    }
    const lines = measurer.wrap(
      run.text,
      columnWidth - textIndentMm,
      fontPt,
      run.style ?? 'normal'
    );
    wrappedRich.push(null);
    wrapped.push(lines);
    body += lines.length * runLineHeight(measurer, run, pScale);
  }

  return {
    ...block,
    wrapped,
    wrappedRich,
    labelWrapped,
    padTopMm: padTop,
    padBottomMm: padBottom,
    lineHeightMm,
    textIndentMm,
    labelExtraMm,
    height:
      padTop + labelHeightMm + labelExtraMm + body + ruleLinesHeight(block, pScale) + padBottom,
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
 * The styled lines of a block's first run, when it has them. Every fragment a
 * splitter produces has to carry the matching slice of these, or the drawer
 * silently falls back to the plain path and a paragraph loses its emphasis
 * halfway down the page — at whichever line the column happened to break.
 */
const richOf = (b: MeasuredBlock): InlineSpan[][] | null => b.wrappedRich?.[0] ?? null;

/** Split a single-run paragraph's lines into column-sized fragments. */
const splitParagraph = (b: MeasuredBlock, columnHeight: number): MeasuredBlock[] => {
  const out: MeasuredBlock[] = [];
  const lines = b.wrapped[0];
  const rich = richOf(b);
  let index = 0;
  let firstFragment = true;
  while (index < lines.length) {
    const padTop = firstFragment ? b.padTopMm : 0;
    const linesThatFit = Math.max(1, Math.floor((columnHeight - padTop) / b.lineHeightMm));
    const start = index;
    const chunk = lines.slice(start, start + linesThatFit);
    index += chunk.length;
    const isLast = index >= lines.length;
    const padBottom = isLast ? b.padBottomMm : 0;
    out.push({
      ...b,
      id: firstFragment ? b.id : `${b.id}-cont${index}`,
      wrapped: [chunk],
      wrappedRich: rich ? [rich.slice(start, start + chunk.length)] : b.wrappedRich,
      padTopMm: padTop,
      padBottomMm: padBottom,
      height: padTop + chunk.length * b.lineHeightMm + padBottom,
    });
    firstFragment = false;
  }

  // Widow control: never strand a single line as the final fragment. Pull one
  // line down from the previous fragment so the tail has at least two — as long
  // as two lines still fit a column.
  if (out.length >= 2) {
    const last = out[out.length - 1];
    const prev = out[out.length - 2];
    const twoLinesFit = 2 * b.lineHeightMm + last.padBottomMm <= columnHeight + 1e-6;
    if (last.wrapped[0].length === 1 && prev.wrapped[0].length >= 2 && twoLinesFit) {
      const moved = prev.wrapped[0][prev.wrapped[0].length - 1];
      prev.wrapped[0] = prev.wrapped[0].slice(0, -1);
      last.wrapped[0] = [moved, ...last.wrapped[0]];
      // The styled copy moves with it — otherwise the line that was pulled down
      // is the one line on the page drawn in the wrong voice.
      const prevRich = prev.wrappedRich?.[0];
      const lastRich = last.wrappedRich?.[0];
      if (prevRich && lastRich) {
        const movedRich = prevRich[prevRich.length - 1];
        prev.wrappedRich = [prevRich.slice(0, -1)];
        last.wrappedRich = [[movedRich, ...lastRich]];
      }
      prev.height = prev.padTopMm + prev.wrapped[0].length * b.lineHeightMm + prev.padBottomMm;
      last.height = last.padTopMm + last.wrapped[0].length * b.lineHeightMm + last.padBottomMm;
    }
  }
  return out;
};

/**
 * Split an oversized criterion: the first fragment keeps the label + chip and
 * as many feedback lines as fit; remaining feedback continues as paragraph
 * fragments (label/chip dropped) that still carry the accent bar. Label and
 * feedback share the same line height, so one metric drives both.
 */
const splitCriterion = (b: MeasuredBlock, columnHeight: number): MeasuredBlock[] => {
  const lh = b.lineHeightMm;
  const labelLines = b.labelWrapped?.length ?? 1;
  const head = b.padTopMm + labelLines * lh + (b.labelExtraMm ?? 0);
  const feedback = b.wrapped[0];
  const rich = richOf(b);
  const firstFit = Math.max(1, Math.floor((columnHeight - head) / lh));
  const kept = feedback.slice(0, firstFit);
  const rest = feedback.slice(firstFit);
  const out: MeasuredBlock[] = [];

  const headIsLast = rest.length === 0;
  out.push({
    ...b,
    wrapped: [kept],
    wrappedRich: rich ? [rich.slice(0, kept.length)] : b.wrappedRich,
    padBottomMm: headIsLast ? b.padBottomMm : 0,
    height: head + kept.length * lh + (headIsLast ? b.padBottomMm : 0),
  });

  // Continuation lines render as plain paragraphs (no label) with the bar.
  if (rest.length) {
    const cont: MeasuredBlock = {
      ...b,
      kind: 'paragraph',
      label: undefined,
      chip: undefined,
      labelWrapped: undefined,
      // The head furniture belongs to the first fragment only — a meter
      // repeated above every continuation would state the same mark twice.
      meter: undefined,
      labelExtraMm: 0,
      id: `${b.id}-feedcont`,
      wrapped: [rest],
      wrappedRich: rich ? [rich.slice(kept.length)] : b.wrappedRich,
      padTopMm: 0,
      height: rest.length * lh + b.padBottomMm,
    };
    out.push(...splitParagraph(cont, columnHeight));
  }
  return out;
};

/**
 * Split breakable blocks that are taller than a full column into column-sized
 * fragments so prose never overflows the footer / page edge. Non-breakable or
 * already-fitting blocks pass through untouched.
 */
export const splitOversized = (blocks: MeasuredBlock[], columnHeight: number): MeasuredBlock[] => {
  const out: MeasuredBlock[] = [];
  for (const b of blocks) {
    const fits = b.height <= columnHeight + 1e-6;
    const canSplit = b.breakable && b.lineHeightMm > 0 && b.wrapped.length === 1;

    if (fits || !canSplit) {
      out.push(b);
    } else if (b.kind === 'paragraph' && b.wrapped[0].length > 1) {
      out.push(...splitParagraph(b, columnHeight));
    } else if (b.kind === 'criterion' && b.wrapped[0].length >= 1) {
      out.push(...splitCriterion(b, columnHeight));
    } else {
      out.push(b);
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

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const atColumnTop = cursor === 0;
    // Never start a column with whitespace.
    if (atColumnTop && block.kind === 'spacer') continue;

    // Keep-with-next: a heading must not be orphaned at the foot of a column.
    //
    // Reserving one LINE of what follows was not enough. Every block reaching
    // the flow has already been through `splitOversized`, so nothing here is
    // taller than a column and nothing splits further — each one moves as a
    // unit. A heading that fit alongside a single reserved line therefore
    // stayed put while its whole body jumped to the next column, which is
    // exactly the orphan the rule exists to prevent ("IMPROVED RESPONSE" at the
    // foot of one column, the response itself at the head of the next).
    //
    // Reserving the body's full height can leave more white space at a column
    // foot, which is the trade every typesetter makes: a heading with nothing
    // under it is a worse page than a short column.
    let required = block.height;
    if (block.kind === 'heading') {
      const next = blocks[i + 1];
      if (next && next.kind !== 'spacer') required += next.height;
    }

    const fits = cursor + required <= geo.columnHeight + 1e-6;
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
