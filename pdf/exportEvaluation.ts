// pdf/exportEvaluation.ts
//
// Orchestrator: builds the document and loops pages/copies. Loading, layout and
// drawing are delegated to the focused modules so this file stays a readable
// pipeline. Page-count logic lives in ./layout (pure, unit-tested).

import {
  ColumnGeometry,
  JsPdfLike,
  MeasuredBlock,
  MM_PER_PT,
  PageSizeName,
  PAGE_DIMENSIONS,
  PAGE_MARGIN_MM,
  ProgressFn,
  LAYOUT,
  BAND_SCALE,
  METER,
  RULE_LINES,
  SCORE_SUMMARY,
  PANEL,
  HEADING,
  ToastFn,
} from './types';
import {
  bandColor,
  buildEvaluationBlocks,
  COLORS,
  DEFAULT_TITLE,
  EvaluationExportData,
} from './buildBlocks';
import { AI_MARKING_DISCLAIMER } from '../data/legalContent';
import {
  chooseScale,
  columnLeft,
  computeGeometry,
  fullContentWidth,
  MASTHEAD_FIELD_PT,
  MASTHEAD_FIELD_WIDTH_MM,
  MASTHEAD_SUB_GAP_MM,
  MASTHEAD_SUB_PT,
  MASTHEAD_TITLE_PT,
  planLayout,
  QUESTION_EYEBROW_PT,
  QUESTION_SUB_GAP_MM,
  QUESTION_SUB_PT,
} from './layout';
import {
  createMeasurer,
  drawDisplayLine,
  drawFields,
  drawFooter,
  drawLines,
  drawRunningHead,
  drawText,
  drawWatermark,
  headerReserve,
  HELVETICA,
  measureDisplayLine,
  tint,
  TextStyleCtx,
} from './helpers';
import { drawIcon } from './icons';
import { FontSource, loadInterFont, loadJsPdf, FONT_FAMILY } from './fontLoader';
import { domToast } from './toast';

export interface ExportEvaluationOptions {
  data: EvaluationExportData;
  filename?: string;
  pageSize?: PageSizeName;
  copies?: number;
  title?: string;
  subtitle?: string;
  instruction?: string;
  showFields?: boolean;
  watermarkText?: string;
  fontSources?: FontSource[];
  onToast?: ToastFn;
  onProgress?: ProgressFn;
}

const COLUMNS_PER_PAGE = 2;
const BASE_COLUMN_GAP = 7;
const SCALE_CANDIDATES = [1, 0.95, 0.9, 0.85, 0.8, 0.75];
const TARGET_PAGES = 2;
// When the student's own answer rides along, the content roughly doubles —
// allow a third page rather than shrinking everything towards the 0.75 floor.
const TARGET_PAGES_WITH_ANSWER = 3;

const ASCENT = 0.82; // approximate baseline offset as a fraction of em
const ascentMm = (fontPt: number) => fontPt * MM_PER_PT * ASCENT;

/** Strip filesystem-hostile characters and force a .pdf extension. */
export const sanitizeFilename = (name: string): string => {
  const base = (name || 'export')
    .replace(/\.pdf$/i, '')
    .replace(/[^a-z0-9 _.-]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return (base || 'export') + '.pdf';
};

const makeExportId = (): string => `HSC-${Date.now().toString(36).toUpperCase()}`;

const formatDate = (d = new Date()): string =>
  d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

/** Small async yield so the export overlay/progress UI can repaint. */
const repaint = () => new Promise<void>((r) => setTimeout(r, 0));

const footerReserve = (pScale: number) => 8 * pScale;

const geometryFor = (pageSize: PageSizeName, pScale: number): ColumnGeometry =>
  computeGeometry({
    size: pageSize,
    columnsPerPage: COLUMNS_PER_PAGE,
    columnGap: BASE_COLUMN_GAP * pScale,
    headerHeight: headerReserve(pScale),
    footerHeight: footerReserve(pScale),
  });

// ---------------------------------------------------------------------------
// Block drawing
// ---------------------------------------------------------------------------

/**
 * A filled proportion track — marks earned against marks available.
 *
 * One colour, the band's, because attainment is what the band colour means in
 * this report; the FILL LENGTH carries the judgement, so it survives a
 * greyscale printer and a colour-blind reader alike. It used to switch between
 * emerald, indigo and rose by ratio, which put three more meanings on three
 * colours that already meant other things elsewhere on the page.
 */
const drawMeter = (
  doc: JsPdfLike,
  meter: { value: number; max: number },
  accent: [number, number, number],
  x: number,
  y: number,
  width: number,
  pScale: number
): void => {
  const h = METER.heightBaseMm * pScale;
  const ratio = meter.max > 0 ? Math.max(0, Math.min(1, meter.value / meter.max)) : 0;

  doc.setFillColor(COLORS.rule[0], COLORS.rule[1], COLORS.rule[2]);
  doc.roundedRect(x, y, width, h, h / 2, h / 2, 'F');
  if (ratio > 0) {
    doc.setFillColor(accent[0], accent[1], accent[2]);
    doc.roundedRect(x, y, Math.max(width * ratio, h), h, h / 2, h / 2, 'F');
  }
};

/**
 * The band ladder: six segments, filled up to the band reached.
 *
 * A mark out of 8 is meaningless without the scale it sits on, and "Band 4" is
 * a number a student has to already know how to read. Drawn as a ladder, both
 * questions answer themselves — where this response landed, and how far the
 * next rung is.
 */
const drawBandScale = (
  doc: JsPdfLike,
  ctx: TextStyleCtx,
  band: number,
  accent: [number, number, number],
  x: number,
  y: number,
  width: number,
  pScale: number,
  segments: number = BAND_SCALE.segments
): void => {
  const h = BAND_SCALE.heightBaseMm * pScale;
  const gap = BAND_SCALE.segmentGapBaseMm * pScale;
  const segW = (width - gap * (segments - 1)) / segments;
  if (segW <= 0) return;

  for (let i = 0; i < segments; i++) {
    const segX = x + i * (segW + gap);
    const reached = i + 1 <= band;
    if (reached) {
      doc.setFillColor(accent[0], accent[1], accent[2]);
      doc.rect(segX, y, segW, h, 'F');
    } else {
      doc.setDrawColor(COLORS.rule[0], COLORS.rule[1], COLORS.rule[2]);
      doc.setLineWidth(0.2 * pScale);
      doc.rect(segX, y, segW, h, 'S');
    }
  }

  // End labels only: six numbered segments would crowd a 40mm column, and the
  // filled run says which rung this is without counting.
  const labelPt = BAND_SCALE.labelPt * pScale;
  drawLines(doc, ['BAND 1'], {
    ...ctx,
    x,
    y: y + h + labelPt * MM_PER_PT * 1.25,
    fontPt: labelPt,
    style: 'bold',
    color: COLORS.muted,
  });
  drawLines(doc, [`BAND ${segments}`], {
    ...ctx,
    x: x + width,
    y: y + h + labelPt * MM_PER_PT * 1.25,
    fontPt: labelPt,
    style: 'bold',
    color: COLORS.muted,
    align: 'right',
  });
};

/** Blank ruled lines for handwriting. */
const drawRuleLines = (
  doc: JsPdfLike,
  count: number,
  x: number,
  y: number,
  width: number,
  pScale: number
): void => {
  doc.setDrawColor(COLORS.rule[0], COLORS.rule[1], COLORS.rule[2]);
  doc.setLineWidth(0.2 * pScale);
  const gap = RULE_LINES.gapBaseMm * pScale;
  for (let i = 1; i <= count; i++) {
    const ly = y + i * gap - RULE_LINES.inset * pScale;
    doc.line(x, ly, x + width, ly);
  }
};

/** The frame behind a panelled block: hairline border over a paper-tinted fill. */
const drawPanel = (
  doc: JsPdfLike,
  block: MeasuredBlock,
  xLeft: number,
  yTop: number,
  width: number,
  pScale: number
): void => {
  const c = block.panelAccent ?? block.accent ?? COLORS.slate;
  const r = PANEL.radiusBaseMm * pScale;
  // A borderless panel is a tint alone: on a diff row, a frame round every row
  // would out-weigh the sentence inside it.
  const fill = tint(c, block.panelBorderless ? PANEL.tintMix : PANEL.fillMix);
  doc.setFillColor(fill[0], fill[1], fill[2]);
  if (block.panelBorderless) {
    doc.roundedRect(xLeft, yTop, width, Math.max(block.height, r * 2), r, r, 'F');
    return;
  }
  doc.setDrawColor(c[0], c[1], c[2]);
  doc.setLineWidth(PANEL.borderBaseMm * pScale);
  doc.roundedRect(xLeft, yTop, width, Math.max(block.height, r * 2), r, r, 'FD');
};

const drawBlock = (
  doc: JsPdfLike,
  ctx: TextStyleCtx,
  block: MeasuredBlock,
  xLeft: number,
  yTop: number,
  geo: ColumnGeometry,
  pScale: number
): void => {
  // A full-width block was measured (wrapped) at the full content width, so it
  // must be drawn at that width too — otherwise its text overruns the column.
  const colW = block.fullWidth ? fullContentWidth(geo) : geo.columnWidth;
  const padTop = block.padTopMm;
  const y = yTop + padTop;

  if (block.kind === 'spacer') return;

  if (block.panel) drawPanel(doc, block, xLeft, yTop, colW, pScale);

  if (block.kind === 'divider') {
    const c = block.accent ?? COLORS.rule;
    doc.setDrawColor(c[0], c[1], c[2]);
    doc.setLineWidth(0.4 * pScale);
    doc.line(xLeft, y, xLeft + colW, y);
    return;
  }

  if (block.kind === 'masthead') {
    drawMasthead(doc, ctx, block, xLeft, yTop, colW, pScale);
    return;
  }

  if (block.kind === 'questionCard') {
    drawQuestionCard(doc, ctx, block, xLeft, yTop, colW, pScale);
    return;
  }

  if (block.kind === 'scoreSummary') {
    drawScoreSummary(doc, ctx, block, xLeft, yTop, colW, pScale);
    return;
  }

  if (block.kind === 'heading') {
    drawHeading(doc, ctx, block, xLeft, yTop, colW, pScale);
    return;
  }

  if (block.kind === 'listItem') {
    const indent = block.textIndentMm;
    const c = block.accent ?? COLORS.slate;
    const firstPt = block.runs[0].baseFontPt * pScale;
    const baseline = y + ascentMm(firstPt);
    if (block.checkbox) {
      // An empty box, not a bullet: this is a thing to do, and the report is
      // printed and worked through.
      const boxSize = 2.4 * pScale;
      doc.setDrawColor(c[0], c[1], c[2]);
      doc.setLineWidth(0.3 * pScale);
      doc.rect(xLeft, baseline - firstPt * MM_PER_PT * 0.72, boxSize, boxSize, 'S');
    } else if (block.tick) {
      // The same gesture in the other state: what the response already does.
      // Centred on the cap height of the line beside it, not hung off its
      // baseline — a tick sized to the text sits low when it is baseline-hung.
      const size = 2.9 * pScale;
      const capHeight = firstPt * MM_PER_PT * 0.72;
      drawIcon(doc, 'check', xLeft - 0.2 * pScale, baseline - capHeight / 2 - size / 2, size, c);
    } else if (!block.diffMarker) {
      doc.setFillColor(c[0], c[1], c[2]);
      doc.rect(xLeft, baseline - firstPt * MM_PER_PT * 0.42, 1.3 * pScale, 1.3 * pScale, 'F');
    }

    // EVERY run, not just the first. `measureBlock` has always reserved height
    // for all of them, so a multi-run item (the diff's "− was / + now" pair)
    // used to be measured at full height and drawn missing everything after the
    // first line — a gap on the page where the content should be.
    let cursor = baseline;
    block.runs.forEach((r, index) => {
      const pt = r.baseFontPt * pScale;
      // The diff marker is drawn in the gutter beside the run, not prefixed to
      // its text: as text it landed on the first wrapped line only, and the tail
      // of a wrapped change printed as an unmarked line that read like a heading.
      if (block.diffMarker && index === 0) {
        drawLines(doc, [block.diffMarker], {
          ...ctx,
          x: xLeft,
          y: cursor,
          fontPt: pt,
          style: 'bold',
          color: r.color ?? COLORS.body,
        });
      }
      cursor += drawLines(doc, block.wrapped[index] ?? [r.text], {
        ...ctx,
        richLines: block.wrappedRich?.[index],
        x: xLeft + indent,
        y: cursor,
        fontPt: pt,
        style: r.style ?? 'normal',
        color: r.color ?? COLORS.body,
        lineHeightFactor: r.lineHeightFactor ?? 1.3,
        // Clamps a rasterised emoji line to the column; without it the image
        // is drawn at its natural width and can overrun into the next column.
        maxWidthMm: colW - indent,
      });
    });
    return;
  }

  if (block.kind === 'criterion') {
    drawCriterion(doc, ctx, block, xLeft, yTop, geo, pScale);
    return;
  }

  // paragraph
  const r = block.runs[0];
  const pt = r.baseFontPt * pScale;
  const textX = xLeft + block.textIndentMm;
  if (block.accent && !block.panel) {
    // Left accent bar spanning the paragraph body (tip / criterion
    // continuation). Bar geometry matches criterion feedback for consistency.
    const c = block.accent;
    const barH = block.height - padTop - block.padBottomMm;
    doc.setFillColor(c[0], c[1], c[2]);
    doc.rect(xLeft, y, LAYOUT.accentBarBaseMm * pScale, Math.max(barH, pt * MM_PER_PT), 'F');
  }
  const textHeight = drawLines(doc, block.wrapped[0] ?? [r.text], {
    ...ctx,
    richLines: block.wrappedRich?.[0],
    x: textX,
    y: y + ascentMm(pt),
    fontPt: pt,
    style: r.style ?? 'normal',
    color: r.color ?? COLORS.body,
    lineHeightFactor: r.lineHeightFactor ?? 1.3,
    maxWidthMm: colW - block.textIndentMm * (block.panel ? 2 : 1),
  });

  if (block.ruleLines) {
    drawRuleLines(doc, block.ruleLines, textX, y + textHeight, colW - block.textIndentMm, pScale);
  }
};

/** The report's name, its subtitle, and the name/class/date rules. Page 1 only. */
const drawMasthead = (
  doc: JsPdfLike,
  ctx: TextStyleCtx,
  block: MeasuredBlock,
  xLeft: number,
  yTop: number,
  colW: number,
  pScale: number
): void => {
  const y = yTop + block.padTopMm;
  const titlePt = MASTHEAD_TITLE_PT * pScale;
  const baseline = y + ascentMm(titlePt);
  drawDisplayLine(doc, block.label ?? DEFAULT_TITLE, {
    ...ctx,
    x: xLeft,
    y: baseline,
    fontPt: titlePt,
    color: COLORS.ink,
  });

  if (block.subWrapped?.length) {
    const subPt = MASTHEAD_SUB_PT * pScale;
    drawLines(doc, block.subWrapped, {
      ...ctx,
      x: xLeft,
      y: baseline + MASTHEAD_SUB_GAP_MM * pScale + ascentMm(subPt),
      fontPt: subPt,
      style: 'normal',
      color: COLORS.muted,
      lineHeightFactor: 1.35,
    });
  }

  if (block.fields) {
    const width = MASTHEAD_FIELD_WIDTH_MM * pScale;
    drawFields(
      doc,
      ctx,
      xLeft + colW - width,
      y + ascentMm(MASTHEAD_FIELD_PT * pScale),
      width,
      pScale,
      COLORS.muted
    );
  }
};

/** A section heading: icon, display label, and the hairline under the row. */
const drawHeading = (
  doc: JsPdfLike,
  ctx: TextStyleCtx,
  block: MeasuredBlock,
  xLeft: number,
  yTop: number,
  colW: number,
  pScale: number
): void => {
  const accent = block.accent ?? COLORS.slate;
  const r = block.runs[0];
  const pt = r.baseFontPt * pScale;
  const rowH = block.lineHeightMm;
  const y = yTop + block.padTopMm;
  const baseline = y + rowH * 0.78;
  let x = xLeft;

  if (block.icon) {
    // Centred on the CAP HEIGHT of the heading, not on its line box. Uppercase
    // type has no descenders and its optical centre sits well above the middle
    // of the line, so a box-centred icon reads as sitting low beside it.
    const size = HEADING.iconBaseMm * pScale;
    const capHeight = pt * MM_PER_PT * 0.72;
    drawIcon(doc, block.icon, x, baseline - capHeight / 2 - size / 2, size, accent);
    x += size + HEADING.iconGapBaseMm * pScale;
  }
  drawDisplayLine(doc, r.text, {
    ...ctx,
    x,
    y: baseline,
    fontPt: pt,
    color: r.color ?? COLORS.ink,
  });

  const ruleY = y + rowH + HEADING.ruleGapBaseMm * pScale;
  doc.setDrawColor(accent[0], accent[1], accent[2]);
  doc.setLineWidth(HEADING.ruleWeightBaseMm * pScale);
  doc.line(xLeft, ruleY, xLeft + colW, ruleY);
};

/**
 * The question, in a box.
 *
 * An eyebrow row naming the section and the command term, the question itself
 * in bold at the largest size in the document, and the syllabus trail beneath
 * it — beneath, because the trail says where the question came from, which is
 * context a reader wants after the question rather than in front of it.
 */
const drawQuestionCard = (
  doc: JsPdfLike,
  ctx: TextStyleCtx,
  block: MeasuredBlock,
  xLeft: number,
  yTop: number,
  colW: number,
  pScale: number
): void => {
  const accent = block.accent ?? COLORS.slate;
  const inset = block.textIndentMm;
  const x = xLeft + inset;
  const innerW = colW - inset * 2;
  const y = yTop + block.padTopMm;

  // Eyebrow: icon + "QUESTION" left, verb + marks right.
  const eyePt = QUESTION_EYEBROW_PT * pScale;
  const eyeBase = y + ascentMm(eyePt);
  let ex = x;
  if (block.icon) {
    const size = eyePt * MM_PER_PT * 1.15;
    const capHeight = eyePt * MM_PER_PT * 0.72;
    drawIcon(doc, block.icon, ex, eyeBase - capHeight / 2 - size / 2, size, accent);
    ex += size + 1.6 * pScale;
  }
  drawDisplayLine(doc, block.label ?? 'Question', {
    ...ctx,
    x: ex,
    y: eyeBase,
    fontPt: eyePt,
    color: accent,
  });

  const right = [block.eyebrow, block.eyebrowChip].filter(Boolean).join('  ·  ');
  if (right) {
    drawText(doc, right.toUpperCase(), {
      ...ctx,
      x: x + innerW,
      y: eyeBase,
      fontPt: 7.5 * pScale,
      style: 'bold',
      color: COLORS.muted,
      align: 'right',
    });
  }

  // The question.
  const q = block.runs[0];
  const qPt = q.baseFontPt * pScale;
  const qTop = y + eyePt * MM_PER_PT * 1.5;
  const qHeight = drawLines(doc, block.wrapped[0] ?? [q.text], {
    ...ctx,
    richLines: block.wrappedRich?.[0],
    x,
    y: qTop + ascentMm(qPt),
    fontPt: qPt,
    style: q.style ?? 'bold',
    color: q.color ?? COLORS.ink,
    lineHeightFactor: q.lineHeightFactor ?? 1.3,
    maxWidthMm: innerW,
  });

  // The syllabus trail, under the question it qualifies.
  if (block.subWrapped?.length) {
    const subPt = QUESTION_SUB_PT * pScale;
    drawLines(doc, block.subWrapped, {
      ...ctx,
      x,
      y: qTop + qHeight + QUESTION_SUB_GAP_MM * pScale + ascentMm(subPt),
      fontPt: subPt,
      style: 'normal',
      color: COLORS.muted,
      lineHeightFactor: 1.3,
      maxWidthMm: innerW,
    });
  }
};

/**
 * The result strip: the mark, the band it sits on, and the metrics — three
 * cells across the full content width.
 *
 * Full width because as a single-column box it guaranteed an empty column
 * beside it: nothing else could flow there, since the full-width band under it
 * began below the box. And it says RESULT, not "Assessment Score" — this is
 * practice marking, and "assessment" is a word with weight in an HSC year.
 */
const drawScoreSummary = (
  doc: JsPdfLike,
  ctx: TextStyleCtx,
  block: MeasuredBlock,
  xLeft: number,
  yTop: number,
  colW: number,
  pScale: number
): void => {
  const top = yTop + block.padTopMm;
  const boxH = block.height - block.padTopMm - block.padBottomMm;
  const accent = block.accent ?? COLORS.slate;
  const pad = SCORE_SUMMARY.innerPadBaseMm * pScale;
  const bar = SCORE_SUMMARY.accentBarBaseMm * pScale;
  const gap = SCORE_SUMMARY.cellGapBaseMm * pScale;

  const fill = tint(accent, PANEL.fillMix);
  doc.setFillColor(fill[0], fill[1], fill[2]);
  doc.setDrawColor(accent[0], accent[1], accent[2]);
  doc.setLineWidth(0.4 * pScale);
  doc.roundedRect(xLeft, top, colW, boxH, 2 * pScale, 2 * pScale, 'FD');
  doc.setFillColor(accent[0], accent[1], accent[2]);
  doc.rect(xLeft, top, bar, boxH, 'F');

  const markW = SCORE_SUMMARY.markCellBaseMm * pScale;
  const metricW = SCORE_SUMMARY.metricCellBaseMm * pScale;
  const markX = xLeft + bar + pad;
  const bandX = markX + markW + gap;
  const metricX = xLeft + colW - pad - metricW;
  const bandW = metricX - gap - bandX;
  const labelPt = SCORE_SUMMARY.labelPt * pScale;
  const labelBase = top + pad + ascentMm(labelPt);
  const bodyTop = top + pad + labelPt * SCORE_SUMMARY.labelLineFactor * MM_PER_PT;

  // Hairlines between the cells, so the three read as one instrument.
  doc.setDrawColor(accent[0], accent[1], accent[2]);
  doc.setLineWidth(SCORE_SUMMARY.cellRuleBaseMm * pScale);
  for (const rx of [bandX - gap / 2, metricX - gap / 2]) {
    doc.line(rx, top + pad, rx, top + boxH - pad);
  }

  // Cell 1 — the mark.
  drawDisplayLine(doc, block.label ?? 'Result', {
    ...ctx,
    x: markX,
    y: labelBase,
    fontPt: labelPt,
    color: COLORS.muted,
  });
  const markPt = SCORE_SUMMARY.chipPt * pScale;
  drawLines(doc, [block.chip ?? ''], {
    ...ctx,
    x: markX,
    y: bodyTop + ascentMm(markPt),
    fontPt: markPt,
    style: 'bold',
    color: accent,
  });

  // Cell 2 — the band, named, over its ladder.
  drawDisplayLine(doc, 'Band', {
    ...ctx,
    x: bandX,
    y: labelBase,
    fontPt: labelPt,
    color: COLORS.muted,
  });
  const bandPt = SCORE_SUMMARY.bandPt * pScale;
  drawText(doc, block.subText ?? '', {
    ...ctx,
    x: bandX,
    y: bodyTop + ascentMm(bandPt),
    fontPt: bandPt,
    style: 'bold',
    color: COLORS.ink,
    maxWidthMm: bandW,
  });
  if (block.bandScale) {
    drawBandScale(
      doc,
      ctx,
      block.bandScale,
      accent,
      bandX,
      bodyTop + bandPt * MM_PER_PT * 1.4 + BAND_SCALE.gapBaseMm * pScale,
      bandW,
      pScale,
      block.bandScaleMax ?? BAND_SCALE.segments
    );
  }

  // Cell 3 — the metrics, one fact per line.
  drawDisplayLine(doc, 'Response', {
    ...ctx,
    x: metricX,
    y: labelBase,
    fontPt: labelPt,
    color: COLORS.muted,
  });
  const metricsRun = block.runs[0];
  if (metricsRun && block.wrapped[0]?.length) {
    const pt = metricsRun.baseFontPt * pScale;
    drawLines(doc, block.wrapped[0], {
      ...ctx,
      x: metricX,
      y: bodyTop + ascentMm(pt),
      fontPt: pt,
      style: metricsRun.style ?? 'bold',
      color: metricsRun.color ?? COLORS.body,
      lineHeightFactor: SCORE_SUMMARY.metricsLineFactor,
      maxWidthMm: metricW,
    });
  }
};

const drawCriterion = (
  doc: JsPdfLike,
  ctx: TextStyleCtx,
  block: MeasuredBlock,
  xLeft: number,
  yTop: number,
  geo: ColumnGeometry,
  pScale: number
): void => {
  const padTop = block.padTopMm;
  const colW = geo.columnWidth;
  const accent = block.accent ?? COLORS.slate;
  const indent = block.textIndentMm;
  const y = yTop + padTop;

  // Label lines (bold, wrapped) + chip on the right of the first line.
  const r = block.runs[0];
  const labelPt = r.baseFontPt * pScale;
  const labelLineMm = labelPt * 1.3 * MM_PER_PT;
  const labelLines = block.labelWrapped ?? [block.label ?? ''];
  const labelBaseline = y + ascentMm(labelPt);
  drawLines(doc, labelLines, {
    ...ctx,
    richLines: block.labelWrappedRich,
    x: xLeft + indent,
    y: labelBaseline,
    fontPt: labelPt,
    style: 'bold',
    color: COLORS.ink,
    lineHeightFactor: 1.3,
    maxWidthMm: colW - indent - (block.chip ? LAYOUT.criterionChipReserveBaseMm * pScale : 0),
  });
  if (block.chip) {
    drawLines(doc, [block.chip], {
      ...ctx,
      x: xLeft + colW,
      y: labelBaseline,
      fontPt: labelPt,
      style: 'bold',
      color: accent,
      align: 'right',
    });
  }

  // The proportion meter sits between the title and the feedback, spanning the
  // text column. `labelExtraMm` is the height measurement already reserved for
  // it — read, never recomputed, so the drawing cannot disagree with the flow.
  const meterBlockHeight = block.labelExtraMm ?? 0;
  if (block.meter && meterBlockHeight > 0) {
    drawMeter(
      doc,
      block.meter,
      accent,
      xLeft + indent,
      y + labelLines.length * labelLineMm + METER.gapAboveBaseMm * pScale,
      colW - indent,
      pScale
    );
  }

  // Left accent bar beside the feedback.
  const feedbackTop = y + labelLines.length * labelLineMm + meterBlockHeight;
  const feedbackPt = r.baseFontPt * pScale;
  const feedbackHeight =
    (block.wrapped[0]?.length ?? 1) * feedbackPt * (r.lineHeightFactor ?? 1.3) * MM_PER_PT;
  doc.setFillColor(accent[0], accent[1], accent[2]);
  doc.rect(xLeft, feedbackTop, LAYOUT.accentBarBaseMm * pScale, feedbackHeight, 'F');
  drawLines(doc, block.wrapped[0] ?? [r.text], {
    ...ctx,
    richLines: block.wrappedRich?.[0],
    x: xLeft + indent,
    y: feedbackTop + ascentMm(feedbackPt),
    fontPt: feedbackPt,
    style: r.style ?? 'normal',
    color: r.color ?? COLORS.body,
    lineHeightFactor: r.lineHeightFactor ?? 1.3,
    maxWidthMm: colW - indent,
  });
};

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * A failure the user can be told something useful about.
 *
 * The export runs through four stages that fail for genuinely different
 * reasons — the engine chunk not loading (offline, blocked CDN-less network),
 * the layout throwing on pathological content, the draw loop, and the browser
 * refusing the download. A bare "Export failed" sends a teacher to support with
 * nothing; naming the stage is the difference between a shrug and a fix.
 */
export class PdfExportError extends Error {
  constructor(
    readonly stage: 'engine' | 'layout' | 'render' | 'save',
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = 'PdfExportError';
  }
}

const STAGE_MESSAGE: Record<PdfExportError['stage'], string> = {
  engine: 'The PDF engine could not be loaded. Check your connection and try again.',
  layout: 'This report could not be laid out. Try again, or export without the student response.',
  render: 'The PDF could not be drawn. Try again, or export without the improved response.',
  // Overwhelmingly the common cause, and the one the user can act on.
  save: 'The browser blocked the download. Allow downloads for this site and try again.',
};

/**
 * Generate and save a vector PDF of the marking-feedback report. Resolves with
 * a summary {pages, copies}; rejects with a PdfExportError naming the stage
 * that failed — every rejection has already been surfaced to the user as a
 * toast, so a caller may safely ignore it.
 */
export const exportEvaluationPdf = async (
  opts: ExportEvaluationOptions
): Promise<{ pages: number; copies: number }> => {
  const toast: ToastFn = opts.onToast ?? domToast;
  const progress: ProgressFn = opts.onProgress ?? (() => {});
  const pageSize: PageSizeName = opts.pageSize ?? 'a4';
  const copies = Math.max(1, Math.floor(opts.copies ?? 1));

  progress(0.05, 'Loading PDF engine…');
  let JsPDF;
  try {
    JsPDF = await loadJsPdf();
  } catch (err) {
    const message = err instanceof Error ? err.message : STAGE_MESSAGE.engine;
    toast(message, 'error');
    throw new PdfExportError('engine', message, err);
  }

  const dims = PAGE_DIMENSIONS[pageSize];
  const doc = new JsPDF({
    unit: 'mm',
    format: [dims.width, dims.height],
    orientation: 'portrait',
    compress: true,
  }) as unknown as JsPdfLike;

  // Custom font (non-fatal).
  progress(0.15, 'Preparing fonts…');
  const customFontAvailable = await loadInterFont(doc, opts.fontSources);
  if (!customFontAvailable) {
    toast('Custom font unavailable — exporting with the built-in font.', 'info');
  }
  const ctx: TextStyleCtx = {
    family: customFontAvailable ? FONT_FAMILY : HELVETICA,
    customFontAvailable,
  };

  // Build + measure + choose a scale that fits the target page budget.
  progress(0.25, 'Laying out content…');
  let pScale: number;
  let geo: ColumnGeometry;
  let pageCount: number;
  let byPage: MeasuredBlockPlacement[][];
  try {
    const blocks = buildEvaluationBlocks(opts.data, {
      title: opts.title,
      subtitle: opts.subtitle,
      showFields: opts.showFields,
    });
    const measurer = createMeasurer(doc, ctx);
    const targetPages = opts.data.studentAnswer?.trim() ? TARGET_PAGES_WITH_ANSWER : TARGET_PAGES;
    const choice = chooseScale(
      blocks,
      measurer,
      (s) => geometryFor(pageSize, s),
      SCALE_CANDIDATES,
      targetPages
    );
    pScale = choice.pScale;
    geo = geometryFor(pageSize, pScale);
    const plan = planLayout(blocks, measurer, geo, pScale);
    pageCount = plan.flow.pageCount;

    // Group placements by page for drawing.
    byPage = Array.from({ length: pageCount }, () => []);
    for (const p of plan.flow.placements) {
      byPage[p.page].push({ block: p.block, column: p.column, top: p.top });
    }
  } catch (err) {
    toast(STAGE_MESSAGE.layout, 'error');
    throw new PdfExportError('layout', STAGE_MESSAGE.layout, err);
  }

  const exportId = makeExportId();
  const dateStr = formatDate();
  const title = opts.title ?? DEFAULT_TITLE;
  const subtitle = opts.subtitle ?? 'Marking Feedback Report';
  const runningContext =
    opts.instruction ??
    `${opts.data.verb} · ${opts.data.totalMarks} marks · Band ${opts.data.overallBand}`;
  const accent = bandColor(opts.data.overallBand);

  // Document metadata (shown in the viewer title bar / file properties).
  try {
    doc.setProperties({
      title: `${title} — ${subtitle}`,
      subject: runningContext,
      author: title,
      creator: 'HSC Writing Coach PDF exporter',
      keywords: ['HSC', 'marking feedback', opts.data.verb, `Band ${opts.data.overallBand}`].join(
        ', '
      ),
    });
  } catch {
    // setProperties is non-essential; ignore engines that lack it.
  }

  const totalPages = pageCount * copies;
  let pageNo = 0;
  let first = true;
  const bookmarked = new Set<string>();

  try {
    for (let copy = 0; copy < copies; copy++) {
      for (let page = 0; page < pageCount; page++) {
        if (!first) doc.addPage();
        first = false;
        pageNo++;
        progress(0.3 + (0.65 * pageNo) / totalPages, `Rendering page ${pageNo} of ${totalPages}…`);

        // Opt-in now, and off by default. It sat behind the student's own
        // response and the rewrite on every page — legible enough to interfere
        // with the two things the file exists to be read against each other,
        // and redundant beside a footer that already carries the disclaimer and
        // the export id.
        if (opts.watermarkText) {
          drawWatermark(doc, {
            ...ctx,
            text: opts.watermarkText,
            pageWidth: dims.width,
            pageHeight: dims.height,
          });
        }

        drawRunningHead(doc, {
          ...ctx,
          title,
          context: runningContext,
          accent,
          muted: COLORS.muted,
          pScale,
          margin: PAGE_MARGIN_MM,
          pageWidth: dims.width,
          showTitle: page > 0,
        });

        for (const { block, column, top } of byPage[page]) {
          // A full-width block spans from the content-left edge; a column block
          // sits at its column's left edge.
          const xLeft = block.fullWidth ? geo.contentLeft : columnLeft(geo, column);
          drawBlock(doc, ctx, block, xLeft, geo.contentTop + top, geo, pScale);
        }

        drawFooter(doc, {
          ...ctx,
          exportId,
          dateStr,
          pageWidth: dims.width,
          pageHeight: dims.height,
          margin: PAGE_MARGIN_MM,
          pScale,
          pageNumber: page + 1,
          pageTotal: pageCount,
          disclaimer: AI_MARKING_DISCLAIMER,
        });

        // Bookmarks, so a three-page report can be jumped through rather than
        // scrolled. Best-effort: the outline is an optional part of the engine's
        // surface, and a viewer without a sidebar loses nothing by its absence.
        if (copy === 0) {
          try {
            for (const { block } of byPage[page]) {
              if (block.kind !== 'heading' && block.kind !== 'questionCard') continue;
              const name = block.kind === 'questionCard' ? 'Question' : block.runs[0]?.text;
              if (name && !bookmarked.has(name)) {
                bookmarked.add(name);
                doc.outline?.add(null, name, { pageNumber: pageNo });
              }
            }
          } catch {
            // An outline is navigation, not content.
          }
        }

        // Let the progress UI repaint between pages.
        await repaint();
      }
    }
  } catch (err) {
    toast(STAGE_MESSAGE.render, 'error');
    throw new PdfExportError('render', STAGE_MESSAGE.render, err);
  }

  // The download itself. It fails rarely but silently — a blocked download, a
  // full disk, a locked-down managed browser — and until now the rejection went
  // into the caller's empty catch and the user watched a spinner stop with no
  // file and no explanation.
  progress(0.98, 'Saving…');
  try {
    doc.save(sanitizeFilename(opts.filename ?? 'HSC-Marking-Feedback'));
  } catch (err) {
    toast(STAGE_MESSAGE.save, 'error');
    throw new PdfExportError('save', STAGE_MESSAGE.save, err);
  }
  progress(1, 'Done');

  const copySuffix = copies > 1 ? ` × ${copies} copies` : '';
  toast(`PDF exported — ${pageCount} page${pageCount === 1 ? '' : 's'}${copySuffix}.`, 'success');

  return { pages: pageCount, copies };
};

interface MeasuredBlockPlacement {
  block: MeasuredBlock;
  column: number;
  top: number;
}
