// pdf/exportProgressReport.ts
//
// Orchestrator for the progress report: a student's, a teacher's or a school's
// marked answers over a period, as a vector PDF. It is the same pipeline as the
// marking-feedback export — engine, fonts, layout, pages, outline, properties,
// staged errors, toasts — with the report's own blocks, footer and filename.
//
// Everything is drawn with the same primitives, the same Inter and the same
// running head and footer as the feedback report, so the two read as one product.

import { AI_MARKING_DISCLAIMER } from '../data/legalContent';
import type { ProgressReport } from './reportModel';
import { buildReportBlocks, reportAccent, studentsTableDrawn } from './buildReportBlocks';
import { COLORS } from './buildBlocks';
import { chooseScale, columnLeft, planLayout } from './layout';
import {
  createMeasurer,
  drawFooter,
  drawRunningHead,
  drawText,
  HELVETICA,
  TextStyleCtx,
} from './helpers';
import { isReportKind } from './reportGeometry';
import { drawReportBlock } from './reportDraw';
import { FONT_FAMILY, FontSource, loadInterFont, loadJsPdf } from './fontLoader';
import { domToast } from './toast';
import { filenamePart, reportDateStamp } from './reportFormat';
import {
  drawBlock,
  formatDate,
  geometryFor,
  makeExportId,
  PdfExportError,
  repaint,
  sanitizeFilename,
  STAGE_MESSAGE,
} from './exportEvaluation';
import {
  ColumnGeometry,
  JsPdfLike,
  MeasuredBlock,
  PAGE_DIMENSIONS,
  PAGE_MARGIN_MM,
  PageSizeName,
  ProgressFn,
  ToastFn,
} from './types';

export interface ExportProgressReportOptions {
  report: ProgressReport;
  filename?: string;
  pageSize?: PageSizeName;
  fontSources?: FontSource[];
  onToast?: ToastFn;
  onProgress?: ProgressFn;
}

const SCALE_CANDIDATES = [1, 0.95, 0.9, 0.85, 0.8, 0.75];
/** A report may run past this; it is the budget a scale is judged against, not a cap. */
const TARGET_PAGES = 3;

/** The footer's grey, as the feedback report sets it: legible on a school laser. */
const FOOTER_GREY: [number, number, number] = [75, 85, 99];

/**
 * The filename, `HSC-Progress-Report-<subject>-<course>-<yyyy-mm-dd>`, with every
 * part made safe for a filesystem (see `filenamePart`). The `.pdf` is added by the
 * exporter, as it is for the feedback report.
 */
export const progressReportFilename = (report: ProgressReport): string =>
  [
    'HSC-Progress-Report',
    report.subject.name,
    report.scope.courseName ?? 'All-courses',
    reportDateStamp(report.generatedAt),
  ]
    .map((part) => filenamePart(part))
    .filter(Boolean)
    .join('-');

/**
 * Whether this report prints student names. Single source with the builder: the
 * students table is drawn, and its names are not replaced by numbers.
 */
export const printsStudentNames = (report: ProgressReport): boolean =>
  studentsTableDrawn(report) && !report.anonymised;

/**
 * The footer's notices. The AI line is on every page of every report, because the
 * marks are AI-assisted estimates and not NESA results. A report that draws the
 * students table says what became of their names, on its own line above the first,
 * so neither has to be squeezed to fit the other: a named report warns, and an
 * anonymised one says the names have been removed.
 */
export const progressReportNotices = (
  report: ProgressReport
): { disclaimer: string; privacy: string | null } => {
  let privacy: string | null = null;
  if (studentsTableDrawn(report)) {
    privacy = report.anonymised
      ? 'Student names have been removed. Students are shown by number.'
      : "Contains student names — handle in line with your school's privacy policy.";
  }
  return { disclaimer: AI_MARKING_DISCLAIMER, privacy };
};

const STAGE_TEXT = {
  layout:
    'This progress report could not be laid out. Try again, or narrow the period or the course.',
  render: 'The progress report could not be drawn. Try again, or switch off some sections.',
};

/**
 * Generate and save a vector PDF of a progress report. Resolves with the page
 * count; rejects with a PdfExportError naming the stage that failed. Every
 * rejection has already been surfaced as a toast, so a caller may ignore it.
 */
export const exportProgressReportPdf = async (
  opts: ExportProgressReportOptions
): Promise<{ pages: number }> => {
  const toast: ToastFn = opts.onToast ?? domToast;
  const progress: ProgressFn = opts.onProgress ?? (() => {});
  const pageSize: PageSizeName = opts.pageSize ?? 'a4';
  const report = opts.report;

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

  progress(0.15, 'Preparing fonts…');
  const customFontAvailable = await loadInterFont(doc, opts.fontSources);
  if (!customFontAvailable) {
    toast('Custom font unavailable — exporting with the built-in font.', 'info');
  }
  const ctx: TextStyleCtx = {
    family: customFontAvailable ? FONT_FAMILY : HELVETICA,
    customFontAvailable,
  };

  progress(0.25, 'Laying out content…');
  let pScale: number;
  let geo: ColumnGeometry;
  let pageCount: number;
  let byPage: { block: MeasuredBlock; column: number; top: number }[][];
  try {
    const blocks = buildReportBlocks(report);
    const measurer = createMeasurer(doc, ctx);
    const choice = chooseScale(
      blocks,
      measurer,
      (s) => geometryFor(pageSize, s),
      SCALE_CANDIDATES,
      TARGET_PAGES
    );
    pScale = choice.pScale;
    geo = geometryFor(pageSize, pScale);
    const plan = planLayout(blocks, measurer, geo, pScale);
    pageCount = plan.flow.pageCount;

    byPage = Array.from({ length: pageCount }, () => []);
    for (const p of plan.flow.placements) {
      byPage[p.page].push({ block: p.block, column: p.column, top: p.top });
    }
  } catch (err) {
    toast(STAGE_TEXT.layout, 'error');
    throw new PdfExportError('layout', STAGE_TEXT.layout, err);
  }

  const exportId = makeExportId();
  const dateStr = formatDate();
  const accent = reportAccent(report);
  const runningContext = `${report.subject.name} · ${report.scope.windowLabel}`;
  const notices = progressReportNotices(report);

  try {
    doc.setProperties({
      title: `${report.title} — ${report.subject.name}`,
      subject: [report.scope.windowLabel, report.scope.courseName].filter(Boolean).join(' · '),
      author: 'HSC Writing Coach',
      creator: 'HSC Writing Coach PDF exporter',
      keywords: [
        'HSC',
        'progress report',
        report.audience,
        report.scope.courseName ?? 'all courses',
      ]
        .filter(Boolean)
        .join(', '),
    });
  } catch {
    // setProperties is non-essential; ignore engines that lack it.
  }

  const bookmarked = new Set<string>();
  const footerBaseline = dims.height - PAGE_MARGIN_MM + 4 * pScale;

  try {
    for (let page = 0; page < pageCount; page++) {
      if (page > 0) doc.addPage();
      progress(
        0.3 + (0.65 * (page + 1)) / pageCount,
        `Rendering page ${page + 1} of ${pageCount}…`
      );

      drawRunningHead(doc, {
        ...ctx,
        title: report.title,
        context: runningContext,
        accent,
        muted: COLORS.muted,
        pScale,
        margin: PAGE_MARGIN_MM,
        pageWidth: dims.width,
        showTitle: page > 0,
      });

      for (const { block, column, top } of byPage[page]) {
        const xLeft = block.fullWidth ? geo.contentLeft : columnLeft(geo, column);
        if (isReportKind(block.kind)) {
          drawReportBlock(doc, ctx, block, xLeft, geo.contentTop + top, pScale);
        } else {
          drawBlock(doc, ctx, block, xLeft, geo.contentTop + top, geo, pScale);
        }
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
        disclaimer: notices.disclaimer,
      });
      if (notices.privacy) {
        drawText(doc, notices.privacy, {
          ...ctx,
          x: dims.width / 2,
          y: footerBaseline - 7.2 * pScale,
          fontPt: 7 * pScale,
          style: 'normal',
          color: FOOTER_GREY,
          align: 'center',
        });
      }

      // Outline: one bookmark per section, on the page where the section starts.
      try {
        for (const { block } of byPage[page]) {
          if (block.kind !== 'heading') continue;
          const name = block.runs[0]?.text;
          if (name && !bookmarked.has(name)) {
            bookmarked.add(name);
            doc.outline?.add(null, name, { pageNumber: page + 1 });
          }
        }
      } catch {
        // An outline is navigation, not content.
      }

      await repaint();
    }
  } catch (err) {
    toast(STAGE_TEXT.render, 'error');
    throw new PdfExportError('render', STAGE_TEXT.render, err);
  }

  progress(0.98, 'Saving…');
  try {
    doc.save(sanitizeFilename(opts.filename ?? progressReportFilename(report)));
  } catch (err) {
    toast(STAGE_MESSAGE.save, 'error');
    throw new PdfExportError('save', STAGE_MESSAGE.save, err);
  }
  progress(1, 'Done');

  toast(`Progress report exported — ${pageCount} page${pageCount === 1 ? '' : 's'}.`, 'success');
  return { pages: pageCount };
};
