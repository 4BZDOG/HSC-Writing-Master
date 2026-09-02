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
  PANEL,
  HEADING,
  TextMeasurer,
  TextRun,
  InlineSpan,
  MM_PER_PT,
} from './types';
import { wrapRich } from './wrapRich';
import { spansToText } from './inline';

export const getPageDimensions = (size: PageSizeName): PageDimensions => PAGE_DIMENSIONS[size];

/** Masthead type sizes, shared by the measurer and the drawer. */
export const MASTHEAD_TITLE_PT = 17;
export const MASTHEAD_SUB_PT = 9;
export const MASTHEAD_FIELD_PT = 7.5;
export const MASTHEAD_FIELD_WIDTH_MM = 58;
export const MASTHEAD_SUB_GAP_MM = 1.4;

/** Question-card type sizes, shared by the measurer and the drawer. */
export const QUESTION_EYEBROW_PT = 8;
export const QUESTION_SUB_PT = 7.5;
export const QUESTION_SUB_GAP_MM = 2;

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

/**
 * Width (mm) of the full content area — both columns plus the gap between them.
 * A `fullWidth` block is measured and drawn at this width so it spans the page.
 */
export const fullContentWidth = (geo: ColumnGeometry): number =>
  geo.columnWidth * geo.columnsPerPage + geo.columnGap * (geo.columnsPerPage - 1);

/** The width a block is laid out at: full content width when it spans, else one column. */
const layoutWidth = (block: ContentBlock, geo: ColumnGeometry): number =>
  block.fullWidth ? fullContentWidth(geo) : geo.columnWidth;

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
  let padTop = (block.basePadTop ?? 0) * pScale;
  let padBottom = (block.basePadBottom ?? 0) * pScale;
  const primaryPt = (block.runs[0]?.baseFontPt ?? 9) * pScale;
  const lineHeightMm = measurer.lineHeight(primaryPt, block.runs[0]?.lineHeightFactor ?? 1.15);

  // Bullets, criterion text, and accented paragraphs share one indent so they
  // align and (crucially) wrap to the same width they're drawn at.
  const indented =
    block.kind === 'listItem' ||
    block.kind === 'criterion' ||
    (block.kind === 'paragraph' && !!block.accent);
  // A panelled block's text is inset by the frame; a diff row's by its gutter
  // marker. Both have to be in the wrap width, or the text is drawn narrower
  // than it was measured and the frame closes over the last word.
  const panelPadX = block.panel ? PANEL.padXBaseMm * pScale : 0;
  const textIndentMm = block.panel ? panelPadX : indented ? LAYOUT.contentIndentBaseMm * pScale : 0;
  const panelPadY = block.panel ? PANEL.padYBaseMm * pScale : 0;
  padTop += panelPadY;
  padBottom += panelPadY;

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

  // The masthead: the report's name over its subtitle, with the name/class/date
  // rules in the right-hand half.
  if (block.kind === 'masthead') {
    const titleH = MASTHEAD_TITLE_PT * pScale * MM_PER_PT * 1.25;
    const subPt = MASTHEAD_SUB_PT * pScale;
    // Wrapped, not assumed to be one line: a topic-and-subtopic subtitle runs to
    // two lines at a narrow scale, and the second used to be drawn into the top
    // of the question card below it.
    const subWidth = columnWidth - (block.fields ? MASTHEAD_FIELD_WIDTH_MM * pScale + 8 : 0);
    const subWrapped = block.subText ? measurer.wrap(block.subText, subWidth, subPt, 'normal') : [];
    const subH = subWrapped.length
      ? MASTHEAD_SUB_GAP_MM * pScale + subWrapped.length * measurer.lineHeight(subPt, 1.35)
      : 0;
    const fieldsH = block.fields ? 3 * MASTHEAD_FIELD_PT * pScale * MM_PER_PT * 1.9 : 0;
    return {
      ...block,
      wrapped: [],
      subWrapped,
      padTopMm: padTop,
      padBottomMm: padBottom,
      lineHeightMm: titleH,
      textIndentMm: 0,
      height: padTop + Math.max(titleH + subH, fieldsH) + padBottom,
    };
  }

  // A heading is an icon, a line of display type, and the rule under them.
  if (block.kind === 'heading') {
    const pt = (block.runs[0]?.baseFontPt ?? 9) * pScale;
    const rowH = Math.max(pt * MM_PER_PT * 1.2, HEADING.iconBaseMm * pScale);
    const ruleH = (HEADING.ruleGapBaseMm + HEADING.ruleWeightBaseMm) * pScale;
    return {
      ...block,
      wrapped: [[block.runs[0]?.text ?? '']],
      padTopMm: padTop,
      padBottomMm: padBottom,
      lineHeightMm: rowH,
      textIndentMm: 0,
      height: padTop + rowH + ruleH + padBottom,
    };
  }

  // The question card: an eyebrow row, the question, and the syllabus trail.
  if (block.kind === 'questionCard') {
    const eyebrowH = QUESTION_EYEBROW_PT * pScale * MM_PER_PT * 1.5;
    const inner = columnWidth - textIndentMm * 2;
    const q = block.runs[0];
    const qPt = (q?.baseFontPt ?? 14) * pScale;
    const qLines = q?.spans?.length
      ? wrapRich(q.spans, inner, qPt, measurer).map(spansToText)
      : measurer.wrap(q?.text ?? '', inner, qPt, q?.style ?? 'bold');
    const qRich = q?.spans?.length ? wrapRich(q.spans, inner, qPt, measurer) : null;
    const qH = qLines.length * runLineHeight(measurer, q, pScale);
    const subPt = QUESTION_SUB_PT * pScale;
    const subWrapped = block.subText ? measurer.wrap(block.subText, inner, subPt, 'normal') : [];
    const subH = subWrapped.length
      ? QUESTION_SUB_GAP_MM * pScale + subWrapped.length * measurer.lineHeight(subPt, 1.3)
      : 0;
    return {
      ...block,
      wrapped: [qLines],
      wrappedRich: [qRich],
      subWrapped,
      padTopMm: padTop,
      padBottomMm: padBottom,
      lineHeightMm: runLineHeight(measurer, q, pScale),
      textIndentMm,
      height: padTop + eyebrowH + qH + subH + padBottom,
    };
  }

  // The result strip: three cells across the full content width. Its height is
  // whichever cell is tallest, and the mark is by far the tallest thing in it.
  if (block.kind === 'scoreSummary') {
    const pad = SCORE_SUMMARY.innerPadBaseMm * pScale;
    const markH = SCORE_SUMMARY.chipPt * pScale * MM_PER_PT;
    const labelH = SCORE_SUMMARY.labelPt * pScale * SCORE_SUMMARY.labelLineFactor * MM_PER_PT;
    const bandH = SCORE_SUMMARY.bandPt * pScale * MM_PER_PT * 1.4;
    const metricsRun = block.runs[0];
    const metricsPt = (metricsRun?.baseFontPt ?? 8.5) * pScale;
    // Metrics arrive newline-separated — one fact per line, so the cell reads
    // as a list rather than a sentence with dots in it.
    const metricLines = (metricsRun?.text ?? '').split('\n').filter(Boolean);
    const metricsH =
      metricLines.length * measurer.lineHeight(metricsPt, SCORE_SUMMARY.metricsLineFactor);
    const bandCell = labelH + bandH + bandScaleHeight(block, pScale);
    const inner = Math.max(markH, bandCell, labelH + metricsH);
    return {
      ...block,
      wrapped: [metricLines],
      padTopMm: padTop,
      padBottomMm: padBottom,
      lineHeightMm,
      textIndentMm: 0,
      height: padTop + pad * 2 + inner + padBottom,
    };
  }

  // A criterion reserves wrapped label/chip lines above its feedback runs.
  let labelWrapped: string[] | undefined;
  let labelWrappedRich: InlineSpan[][] | null = null;
  let labelHeightMm = 0;
  if (block.kind === 'criterion' && block.label) {
    const labelPt = (block.runs[0]?.baseFontPt ?? 9) * pScale;
    const chipReserve = block.chip ? LAYOUT.criterionChipReserveBaseMm * pScale : 0;
    const labelWidth = columnWidth - textIndentMm - chipReserve;
    const labelRun = block.labelRuns?.[0];
    if (labelRun?.spans?.length) {
      labelWrappedRich = wrapRich(labelRun.spans, labelWidth, labelPt, measurer);
      labelWrapped = labelWrappedRich.map(spansToText);
    } else {
      labelWrapped = measurer.wrap(block.label, labelWidth, labelPt, 'bold');
    }
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
    labelWrappedRich,
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
): MeasuredBlock[] => blocks.map((b) => measureBlock(b, measurer, layoutWidth(b, geo), pScale));

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
    // A panelled block's frame closes and reopens across the break, so every
    // fragment keeps its inner padding; an unpanelled one only pads its ends.
    const padTop = firstFragment || b.panel ? b.padTopMm : 0;
    const linesThatFit = Math.max(1, Math.floor((columnHeight - padTop) / b.lineHeightMm));
    const start = index;
    const chunk = lines.slice(start, start + linesThatFit);
    index += chunk.length;
    const isLast = index >= lines.length;
    const padBottom = isLast || b.panel ? b.padBottomMm : 0;
    out.push({
      ...b,
      id: firstFragment ? b.id : `${b.id}-cont${index}`,
      checkbox: firstFragment ? b.checkbox : undefined,
      diffMarker: firstFragment ? b.diffMarker : undefined,
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

/**
 * How much of a breakable block must stay behind, and how much must travel.
 *
 * Without a floor on both, the split trades one bad page for another: a lone
 * line stranded at the foot of a column, or a lone line arriving at the head of
 * the next. Three and two are the printer's usual orphan/widow minimums.
 */
export const MIN_HEAD_LINES = 3;
export const MIN_TAIL_LINES = 2;

/** Slice a measured paragraph so its head fits `available` mm. */
const splitParagraphAt = (
  b: MeasuredBlock,
  available: number
): [MeasuredBlock, MeasuredBlock] | null => {
  const lines = b.wrapped[0] ?? [];
  const rich = richOf(b);
  const headPadBottom = b.panel ? b.padBottomMm : 0;
  const room = available - b.padTopMm - headPadBottom;
  const headLines = Math.floor(room / b.lineHeightMm);
  if (headLines < MIN_HEAD_LINES) return null;
  if (lines.length - headLines < MIN_TAIL_LINES) return null;

  const head: MeasuredBlock = {
    ...b,
    wrapped: [lines.slice(0, headLines)],
    wrappedRich: rich ? [rich.slice(0, headLines)] : b.wrappedRich,
    padBottomMm: headPadBottom,
    height: b.padTopMm + headLines * b.lineHeightMm + headPadBottom,
  };
  const tailPadTop = b.panel ? b.padTopMm : 0;
  const tail: MeasuredBlock = {
    ...b,
    id: `${b.id}-cont`,
    // The bullet, tick box or diff marker belongs to the item's first line, and
    // the first line stayed behind.
    checkbox: undefined,
    diffMarker: undefined,
    wrapped: [lines.slice(headLines)],
    wrappedRich: rich ? [rich.slice(headLines)] : b.wrappedRich,
    padTopMm: tailPadTop,
    height: tailPadTop + (lines.length - headLines) * b.lineHeightMm + b.padBottomMm,
    // The ruled notes belong to the block's foot, and the foot is in the tail.
    ruleLines: b.ruleLines,
  };
  return [{ ...head, ruleLines: undefined }, tail];
};

/**
 * Slice a measured criterion: the head keeps the title, chip and meter plus as
 * many feedback lines as fit; the tail continues as a plain accented paragraph.
 */
const splitCriterionAt = (
  b: MeasuredBlock,
  available: number
): [MeasuredBlock, MeasuredBlock] | null => {
  const lines = b.wrapped[0] ?? [];
  const rich = richOf(b);
  const labelLines = b.labelWrapped?.length ?? 1;
  const head = b.padTopMm + labelLines * b.lineHeightMm + (b.labelExtraMm ?? 0);
  const headLines = Math.floor((available - head) / b.lineHeightMm);
  if (headLines < MIN_HEAD_LINES) return null;
  if (lines.length - headLines < MIN_TAIL_LINES) return null;

  return [
    {
      ...b,
      wrapped: [lines.slice(0, headLines)],
      wrappedRich: rich ? [rich.slice(0, headLines)] : b.wrappedRich,
      padBottomMm: 0,
      height: head + headLines * b.lineHeightMm,
    },
    {
      ...b,
      kind: 'paragraph',
      id: `${b.id}-cont`,
      label: undefined,
      labelRuns: undefined,
      chip: undefined,
      labelWrapped: undefined,
      labelWrappedRich: null,
      // The head furniture belongs to the first fragment only — a meter
      // repeated above the continuation would state the same mark twice.
      meter: undefined,
      labelExtraMm: 0,
      icon: undefined,
      wrapped: [lines.slice(headLines)],
      wrappedRich: rich ? [rich.slice(headLines)] : b.wrappedRich,
      padTopMm: 0,
      height: (lines.length - headLines) * b.lineHeightMm + b.padBottomMm,
    },
  ];
};

/**
 * Split `b` so its head fits `available` mm, or return null to move it whole.
 *
 * This is the fix for the single largest defect the exported report had. The
 * flow used to place a block only where it fit ENTIRELY: a 70mm paragraph
 * arriving with 40mm of column left moved to the next column and left the 40mm
 * blank. Across a report that is most of a page — one sample's second page was
 * 86% white — and the content that was pushed out is the content the reader
 * came for.
 *
 * Only prose splits. A list item, a heading, the question card and the result
 * strip are single objects; breaking one across a column boundary would cost
 * more sense than the space it recovered.
 */
/**
 * Grow a flexible ruled block into the space it landed in.
 *
 * Ruled space is the one block whose height is not content: it is however much
 * room is going. Fixed, the marker's notes either overflowed the page they
 * landed on or started a fresh one and left it 90% white.
 */
export const growToFit = (
  b: MeasuredBlock,
  available: number,
  columnHeight: number,
  pScale: number
): MeasuredBlock => {
  if (!b.flexibleRules || !b.ruleLines) return b;
  const gap = RULE_LINES.gapBaseMm * pScale;
  const fixed = b.height - b.ruleLines * gap;
  // Sharing a page, the notes take a decent block and leave the rest to the
  // content around them. Landing on a page of their own, that restraint has
  // nothing to protect — the space below would simply be blank — so they take
  // the whole page and hand it to the teacher.
  const ownsThePage = available >= columnHeight * 0.75;
  const cap = ownsThePage ? Number.POSITIVE_INFINITY : RULE_LINES.maxFlexible;
  const room = Math.min(cap, Math.floor((available - fixed) / gap));
  if (room <= b.ruleLines) return b;
  return { ...b, ruleLines: room, height: fixed + room * gap };
};

export const splitToFit = (
  b: MeasuredBlock,
  available: number
): [MeasuredBlock, MeasuredBlock] | null => {
  if (!b.breakable || b.lineHeightMm <= 0 || b.runs.length !== 1) return null;
  if (available <= 0) return null;
  if (b.kind === 'paragraph' || b.kind === 'listItem') return splitParagraphAt(b, available);
  if (b.kind === 'criterion') return splitCriterionAt(b, available);
  return null;
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
/**
 * Reserve height for a heading's body so it is never orphaned at a column/page
 * foot. Every block reaching the flow has been through `splitOversized`, so
 * nothing splits further — a heading moves as a unit with the block beneath it.
 */
const requiredHeight = (blocks: MeasuredBlock[], i: number): number => {
  const block = blocks[i];
  let required = block.height;
  if (block.kind === 'heading') {
    const next = blocks[i + 1];
    // A breakable body only has to bring its minimum head along; demanding the
    // whole paragraph sends the heading to the next column over prose that
    // would have split happily beneath it.
    if (next && next.kind !== 'spacer') required += minimumHeight(next);
  }
  return required;
};

/** The least room a block can be placed in: its full height unless it splits. */
const minimumHeight = (b: MeasuredBlock): number =>
  b.breakable && b.runs.length === 1 && (b.kind === 'paragraph' || b.kind === 'criterion')
    ? Math.min(b.height, b.padTopMm + MIN_HEAD_LINES * b.lineHeightMm + (b.labelExtraMm ?? 0))
    : b.height;

/**
 * Flow a run of non-`fullWidth` blocks column-major, confined to the region that
 * begins at `startY` on `startPage`. On the band's first page both columns start
 * at `startY`; pages the band spills onto are used in full. Returns where the
 * band ended so the next band stacks beneath it.
 *
 * With `startPage=0` and `startY=0` this reproduces the classic
 * whole-document column-major flow exactly — the case the layout tests pin.
 */
const flowColumnBand = (
  blocks: MeasuredBlock[],
  geo: ColumnGeometry,
  startPage: number,
  startY: number,
  placements: PlacedBlock[],
  deepestPerPage: number[],
  pScale: number
): { endPage: number; endY: number } => {
  let page = startPage;
  let column = 0;
  // A column's top: the band top on the band's first page, the page top after.
  const colTop = (p: number): number => (p === startPage ? startY : 0);
  let cursor = colTop(page);

  const recordDepth = () => {
    deepestPerPage[page] = Math.max(deepestPerPage[page] ?? 0, cursor);
  };
  const advanceColumn = () => {
    recordDepth();
    column += 1;
    if (column >= geo.columnsPerPage) {
      column = 0;
      page += 1;
    }
    cursor = colTop(page);
  };

  for (let i = 0; i < blocks.length; i++) {
    let block = blocks[i];
    // A block can be split at the boundary and continue in the next column, so
    // one input block may need several placements.
    for (;;) {
      const atColumnTop = cursor === colTop(page);
      // Never start a column with whitespace.
      if (atColumnTop && block.kind === 'spacer') break;

      if (block.flexibleRules) {
        block = growToFit(block, geo.columnHeight - cursor, geo.columnHeight, pScale);
      }
      const required = block === blocks[i] ? requiredHeight(blocks, i) : block.height;
      if (cursor + required <= geo.columnHeight + 1e-6) {
        placements.push({ block, page, column, top: cursor });
        cursor += block.height;
        break;
      }
      if (atColumnTop) {
        if (colTop(page) === 0) {
          // Taller than a whole empty column: place it and let it overflow
          // rather than loop. `splitOversized` has already sliced what it could.
          placements.push({ block, page, column, top: cursor });
          cursor += block.height;
          break;
        }
        // The band began part-way down this page, so both of its columns are
        // equally short — moving across gains nothing, and placing here would
        // strand a heading from the block it introduces. Take the whole band
        // over to a full page instead.
        recordDepth();
        page += 1;
        column = 0;
        cursor = colTop(page);
        continue;
      }
      const split = splitToFit(block, geo.columnHeight - cursor);
      if (split) {
        placements.push({ block: split[0], page, column, top: cursor });
        cursor += split[0].height;
        advanceColumn();
        block = split[1];
        continue;
      }
      advanceColumn();
      // A spacer that triggers a break is redundant — the break separates.
      if (block.kind === 'spacer') break;
    }
  }
  recordDepth();
  return { endPage: page, endY: deepestPerPage[page] ?? cursor };
};

/**
 * Flow a run of `fullWidth` blocks as a single spanning column down the page,
 * starting at `startY` on `startPage`. Each block is DRAWN across the full
 * content width (the drawer keys off `block.fullWidth`), so its recorded column
 * is 0 and the drawer positions it from the content-left edge.
 */
const flowSpanBand = (
  blocks: MeasuredBlock[],
  geo: ColumnGeometry,
  startPage: number,
  startY: number,
  placements: PlacedBlock[],
  deepestPerPage: number[],
  pScale: number
): { endPage: number; endY: number } => {
  let page = startPage;
  let cursor = startY;
  const recordDepth = () => {
    deepestPerPage[page] = Math.max(deepestPerPage[page] ?? 0, cursor);
  };

  for (let i = 0; i < blocks.length; i++) {
    let block = blocks[i];
    for (;;) {
      const atTop = cursor === 0;
      if (atTop && block.kind === 'spacer') break;

      if (block.flexibleRules) {
        block = growToFit(block, geo.columnHeight - cursor, geo.columnHeight, pScale);
      }
      const required = block === blocks[i] ? requiredHeight(blocks, i) : block.height;
      if (cursor + required <= geo.columnHeight + 1e-6 || atTop) {
        placements.push({ block, page, column: 0, top: cursor });
        cursor += block.height;
        break;
      }
      const split = splitToFit(block, geo.columnHeight - cursor);
      if (split) {
        placements.push({ block: split[0], page, column: 0, top: cursor });
        cursor += split[0].height;
        recordDepth();
        page += 1;
        cursor = 0;
        block = split[1];
        continue;
      }
      recordDepth();
      page += 1;
      cursor = 0;
      if (block.kind === 'spacer') break;
    }
  }
  recordDepth();
  return { endPage: page, endY: deepestPerPage[page] ?? cursor };
};

/**
 * Even out the last page of a two-column band.
 *
 * A band that runs out of content part-way down its first column leaves the
 * second column empty — and it stays empty, because the full-width band that
 * follows has to start below the deepest point on the page. That is a whole
 * column of paper lost to nothing, and on a short report it was the entire
 * right-hand side of the only page.
 *
 * Reading order is column-major, so moving a run of blocks from the foot of
 * column one to the head of column two preserves it exactly. The split is
 * chosen to make the two columns as near equal as possible, and never falls
 * between a heading and the block it introduces.
 */
const balanceLastColumn = (placements: PlacedBlock[], geo: ColumnGeometry, page: number): void => {
  if (geo.columnsPerPage < 2) return;
  const onPage = placements.filter((p) => p.page === page);
  if (!onPage.length || onPage.some((p) => p.column !== 0)) return;
  const column = onPage.sort((a, b) => a.top - b.top);
  if (column.length < 3) return;

  const startY = column[0].top;
  const heights = column.map((p) => p.block.height);
  const total = heights.reduce((sum, h) => sum + h, 0);

  let best = -1;
  let bestScore = Infinity;
  let head = 0;
  for (let k = 0; k < column.length - 1; k++) {
    head += heights[k];
    // Never strand a heading at the foot of a column without its body.
    if (column[k].block.kind === 'heading') continue;
    // A spacer at the head of the new column would print as a gap.
    if (column[k + 1].block.kind === 'spacer') continue;
    const tail = total - head;
    if (startY + tail > geo.columnHeight) continue;
    const score = Math.abs(head - tail);
    if (score < bestScore) {
      bestScore = score;
      best = k;
    }
  }
  // Only worth doing when it actually evens things out.
  if (best < 0 || bestScore >= total) return;

  let cursor = startY;
  for (let i = best + 1; i < column.length; i++) {
    column[i].column = 1;
    column[i].top = cursor;
    cursor += column[i].block.height;
  }
};

/**
 * Banded flow. The block list is split into maximal runs of same-width blocks:
 * `fullWidth` runs render as page-spanning bands, the rest as two-column bands.
 * Bands stack vertically — each starts beneath the deepest extent of the last —
 * so a full-width question / response / improved-response interrupts the compact
 * two-column flow of the analytical sections without disturbing their order.
 *
 * When no block is `fullWidth` the whole document is a single two-column band
 * and this collapses to the classic column-major flow, unchanged.
 */
export const flowBlocks = (
  blocks: MeasuredBlock[],
  geo: ColumnGeometry,
  pScale = 1
): FlowResult => {
  const placements: PlacedBlock[] = [];
  const deepestPerPage: number[] = [];
  let page = 0;
  let y = 0;

  let i = 0;
  while (i < blocks.length) {
    const spanning = !!blocks[i].fullWidth;
    let j = i;
    while (j < blocks.length && !!blocks[j].fullWidth === spanning) j += 1;
    const band = blocks.slice(i, j);
    const before = placements.length;
    const res = spanning
      ? flowSpanBand(band, geo, page, y, placements, deepestPerPage, pScale)
      : flowColumnBand(band, geo, page, y, placements, deepestPerPage, pScale);
    if (!spanning) {
      balanceLastColumn(placements.slice(before), geo, res.endPage);
      // Balancing moves blocks between columns, so the page's deepest extent —
      // which is where the next band starts — has to be measured again.
      deepestPerPage[res.endPage] = placements
        .slice(before)
        .filter((p) => p.page === res.endPage)
        .reduce((deepest, p) => Math.max(deepest, p.top + p.block.height), 0);
    }
    page = res.endPage;
    y = deepestPerPage[res.endPage] ?? res.endY;
    i = j;
  }
  if (deepestPerPage.length === 0) deepestPerPage[0] = 0;

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
  return { blocks: measured, flow: flowBlocks(measured, geo, pScale) };
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
