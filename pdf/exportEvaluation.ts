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
  ToastFn,
} from './types';
import { buildEvaluationBlocks, COLORS, EvaluationExportData } from './buildBlocks';
import { AI_MARKING_DISCLAIMER } from '../data/legalContent';
import { chooseScale, columnLeft, computeGeometry, planLayout } from './layout';
import {
  createMeasurer,
  drawFooter,
  drawHeader,
  drawLines,
  drawWatermark,
  headerReserve,
  HELVETICA,
  TextStyleCtx,
} from './helpers';
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
 * Colour carries the same judgement the numbers do (earned nearly everything /
 * most of it / not much), but the FILL LENGTH carries it too, so the meaning
 * survives a greyscale printer and a colour-blind reader. Nothing here is the
 * only way to read the fact: the chip beside it states it in numerals.
 */
const drawMeter = (
  doc: JsPdfLike,
  meter: { value: number; max: number },
  x: number,
  y: number,
  width: number,
  pScale: number
): void => {
  const h = METER.heightBaseMm * pScale;
  const ratio = meter.max > 0 ? Math.max(0, Math.min(1, meter.value / meter.max)) : 0;
  const fill =
    ratio >= METER.strongRatio
      ? COLORS.emerald
      : ratio >= METER.fairRatio
        ? COLORS.accent
        : COLORS.rose;

  doc.setFillColor(COLORS.rule[0], COLORS.rule[1], COLORS.rule[2]);
  doc.roundedRect(x, y, width, h, h / 2, h / 2, 'F');
  if (ratio > 0) {
    doc.setFillColor(fill[0], fill[1], fill[2]);
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
  pScale: number
): void => {
  const h = BAND_SCALE.heightBaseMm * pScale;
  const gap = BAND_SCALE.segmentGapBaseMm * pScale;
  const segW = (width - gap * (BAND_SCALE.segments - 1)) / BAND_SCALE.segments;
  if (segW <= 0) return;

  for (let i = 0; i < BAND_SCALE.segments; i++) {
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
  drawLines(doc, ['BAND 6'], {
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

const drawBlock = (
  doc: JsPdfLike,
  ctx: TextStyleCtx,
  block: MeasuredBlock,
  xLeft: number,
  yTop: number,
  geo: ColumnGeometry,
  pScale: number
): void => {
  const colW = geo.columnWidth;
  const padTop = block.padTopMm;
  const y = yTop + padTop;

  if (block.kind === 'spacer') return;

  if (block.kind === 'divider') {
    const c = block.accent ?? COLORS.rule;
    doc.setDrawColor(c[0], c[1], c[2]);
    doc.setLineWidth(0.4 * pScale);
    doc.setLineDashPattern([1.2 * pScale, 1.2 * pScale], 0);
    doc.line(xLeft, y, xLeft + colW, y);
    doc.setLineDashPattern([], 0);
    return;
  }

  if (block.kind === 'scoreSummary') {
    drawScoreSummary(doc, ctx, block, xLeft, yTop, geo, pScale);
    return;
  }

  if (block.kind === 'heading') {
    const r = block.runs[0];
    const pt = r.baseFontPt * pScale;
    drawLines(doc, block.wrapped[0] ?? [r.text], {
      ...ctx,
      x: xLeft,
      y: y + ascentMm(pt),
      fontPt: pt,
      style: r.style ?? 'bold',
      color: r.color ?? COLORS.muted,
      lineHeightFactor: r.lineHeightFactor ?? 1.15,
      maxWidthMm: colW,
    });
    return;
  }

  if (block.kind === 'listItem') {
    const r = block.runs[0];
    const pt = r.baseFontPt * pScale;
    const indent = block.textIndentMm;
    const c = block.accent ?? COLORS.accent;
    const baseline = y + ascentMm(pt);
    if (block.checkbox) {
      // An empty box, not a bullet: this is a thing to do, and the report is
      // printed and worked through.
      const boxSize = 2.4 * pScale;
      doc.setDrawColor(c[0], c[1], c[2]);
      doc.setLineWidth(0.3 * pScale);
      doc.rect(xLeft, baseline - pt * MM_PER_PT * 0.72, boxSize, boxSize, 'S');
    } else {
      doc.setFillColor(c[0], c[1], c[2]);
      doc.rect(xLeft, baseline - pt * MM_PER_PT * 0.42, 1.3 * pScale, 1.3 * pScale, 'F');
    }
    drawLines(doc, block.wrapped[0] ?? [r.text], {
      ...ctx,
      x: xLeft + indent,
      y: baseline,
      fontPt: pt,
      style: r.style ?? 'normal',
      color: r.color ?? COLORS.body,
      lineHeightFactor: r.lineHeightFactor ?? 1.3,
      maxWidthMm: colW - indent,
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
  if (block.accent) {
    // Left accent bar spanning the paragraph body (tip / exemplar / criterion
    // continuation). Bar geometry matches criterion feedback for consistency.
    const c = block.accent;
    const barH = block.height - padTop - block.padBottomMm;
    doc.setFillColor(c[0], c[1], c[2]);
    doc.rect(xLeft, y, LAYOUT.accentBarBaseMm * pScale, Math.max(barH, pt * MM_PER_PT), 'F');
  }
  const textHeight = drawLines(doc, block.wrapped[0] ?? [r.text], {
    ...ctx,
    x: textX,
    y: y + ascentMm(pt),
    fontPt: pt,
    style: r.style ?? 'normal',
    color: r.color ?? COLORS.body,
    lineHeightFactor: r.lineHeightFactor ?? 1.3,
    maxWidthMm: colW - block.textIndentMm,
  });

  if (block.ruleLines) {
    drawRuleLines(doc, block.ruleLines, textX, y + textHeight, colW - block.textIndentMm, pScale);
  }
};

const drawScoreSummary = (
  doc: JsPdfLike,
  ctx: TextStyleCtx,
  block: MeasuredBlock,
  xLeft: number,
  yTop: number,
  geo: ColumnGeometry,
  pScale: number
): void => {
  const padTop = block.padTopMm;
  const padBottom = block.padBottomMm;
  const top = yTop + padTop;
  const boxH = block.height - padTop - padBottom;
  const colW = geo.columnWidth;
  const accent = block.accent ?? COLORS.accent;
  const pad = SCORE_SUMMARY.innerPadBaseMm * pScale;
  const bar = SCORE_SUMMARY.accentBarBaseMm * pScale;

  doc.setDrawColor(accent[0], accent[1], accent[2]);
  doc.setLineWidth(0.4 * pScale);
  doc.roundedRect(xLeft, top, colW, boxH, 2 * pScale, 2 * pScale, 'S');
  doc.setFillColor(accent[0], accent[1], accent[2]);
  doc.rect(xLeft, top, bar, boxH, 'F');

  // Big score chip, right-aligned.
  const chipPt = SCORE_SUMMARY.chipPt * pScale;
  drawLines(doc, [block.chip ?? ''], {
    ...ctx,
    x: xLeft + colW - pad,
    y: top + pad + ascentMm(chipPt),
    fontPt: chipPt,
    style: 'bold',
    color: accent,
    align: 'right',
  });

  // Label + metrics, left.
  const labelPt = SCORE_SUMMARY.labelPt * pScale;
  const textX = xLeft + pad + bar;
  drawLines(doc, [(block.label ?? '').toUpperCase()], {
    ...ctx,
    x: textX,
    y: top + pad + ascentMm(labelPt),
    fontPt: labelPt,
    style: 'bold',
    color: COLORS.muted,
  });
  const r = block.runs[0];
  let metricsBottom = top + pad + labelPt * SCORE_SUMMARY.labelLineFactor * MM_PER_PT;
  if (r) {
    const pt = r.baseFontPt * pScale;
    metricsBottom += drawLines(doc, block.wrapped[0] ?? [r.text], {
      ...ctx,
      x: textX,
      y: metricsBottom + ascentMm(pt),
      fontPt: pt,
      style: r.style ?? 'bold',
      color: r.color ?? COLORS.body,
      lineHeightFactor: SCORE_SUMMARY.metricsLineFactor,
      maxWidthMm: colW - pad * 2 - bar - SCORE_SUMMARY.chipReserveBaseMm * pScale,
    });
  }

  if (block.bandScale) {
    drawBandScale(
      doc,
      ctx,
      block.bandScale,
      accent,
      textX,
      metricsBottom + BAND_SCALE.gapBaseMm * pScale,
      xLeft + colW - pad - textX,
      pScale
    );
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
  const accent = block.accent ?? COLORS.accent;
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
    const blocks = buildEvaluationBlocks(opts.data);
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
  const title = opts.title ?? 'Band 6 — HSC Writing Coach';
  const subtitle = opts.subtitle ?? 'Marking Feedback Report';
  const instruction =
    opts.instruction ??
    `${opts.data.verb} · ${opts.data.totalMarks} marks · Band ${opts.data.overallBand}`;
  const watermarkText = opts.watermarkText ?? 'HSC WRITING MASTER';

  // Document metadata (shown in the viewer title bar / file properties).
  try {
    doc.setProperties({
      title: `${title} — ${subtitle}`,
      subject: instruction,
      author: title,
      creator: 'Band 6 PDF Exporter',
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

  try {
    for (let copy = 0; copy < copies; copy++) {
      for (let page = 0; page < pageCount; page++) {
        if (!first) doc.addPage();
        first = false;
        pageNo++;
        progress(0.3 + (0.65 * pageNo) / totalPages, `Rendering page ${pageNo} of ${totalPages}…`);

        drawWatermark(doc, {
          ...ctx,
          text: watermarkText,
          pageWidth: dims.width,
          pageHeight: dims.height,
        });

        drawHeader(doc, {
          ...ctx,
          title,
          subtitle,
          instruction,
          accent: COLORS.accent,
          pScale,
          margin: PAGE_MARGIN_MM,
          pageWidth: dims.width,
          // Name/Class/Date fill-in fields belong on the first page only.
          showFields: (opts.showFields ?? true) && page === 0,
        });

        for (const { block, column, top } of byPage[page]) {
          const xLeft = columnLeft(geo, column);
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
