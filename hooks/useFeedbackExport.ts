import { useRef, useState } from 'react';
import type { ToastType } from './useToast';
import { EvaluationResult, HierarchyContext, Prompt } from '../types';
import { exportEvaluationPdf } from '../pdf';
import {
  PdfExportPreferences,
  readPdfPreferences,
  writePdfPreferences,
} from '../utils/pdfExportPreferences';
import type { FeedbackView } from './useFeedbackView';

interface UseFeedbackExportArgs {
  prompt: Prompt;
  result: EvaluationResult;
  userAnswer: string;
  hierarchy?: HierarchyContext;
  /** The derived figures from `useFeedbackView`, so the PDF and the screen agree. */
  view: FeedbackView;
  showToast?: (message: string, type?: ToastType) => void;
}

/**
 * The PDF export of a marking report: its progress state, the options menu
 * behind the export button, and the export itself.
 */
export function useFeedbackExport({
  prompt,
  result,
  userAnswer,
  hierarchy,
  view,
  showToast,
}: UseFeedbackExportArgs) {
  const { revisedText, maxBand, exemplarBand, exemplarMark, wordCount, keywordsUsedCount } = view;
  const { mustUseKeywords, syllabusTrail } = view;

  // Vector-PDF export state (guards double-clicks, drives the button spinner).
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState('');
  // Paper, copies and what goes in the report. Read once from the device's
  // stored preferences so a teacher printing a class set sets them once.
  const [pdfPrefs, setPdfPrefs] = useState<PdfExportPreferences>(() => readPdfPreferences());
  const [showPdfOptions, setShowPdfOptions] = useState(false);
  const pdfMenuRef = useRef<HTMLDivElement>(null);

  const updatePdfPrefs = (next: PdfExportPreferences) => {
    setPdfPrefs(next);
    writePdfPreferences(next);
  };

  const handleExportPdf = async () => {
    if (isExporting) return; // guard double-clicks
    setIsExporting(true);
    setExportStatus('Starting…');
    try {
      // Pass raw content through; the pdf module normalises HTML/markup safely
      // (a whitelist strip that preserves bare `<`/`>` in code and maths).
      await exportEvaluationPdf({
        data: {
          question: prompt.question,
          verb: prompt.verb,
          totalMarks: prompt.totalMarks,
          syllabusPath: syllabusTrail.join('  ›  ') || undefined,
          studentAnswer: pdfPrefs.includeResponse ? userAnswer.trim() || undefined : undefined,
          overallMark: result.overallMark,
          overallBand: result.overallBand,
          // Caps the PDF band ladder at the question's tier ceiling so a
          // lower-tier question does not draw empty rungs up to Band 6.
          targetBand: maxBand,
          overallFeedback: result.overallFeedback || '',
          quickTip: result.quickTip,
          strengths: result.strengths || [],
          improvements: result.improvements || [],
          criteria: (result.criteria || []).map((c) => ({
            criterion: c.criterion,
            mark: c.mark,
            maxMark: c.maxMark,
            feedback: c.feedback,
          })),
          // Empty while locked (see `revisedText`), which takes the improved
          // response AND the change list built from it out of the file.
          revisedAnswer: revisedText || undefined,
          exemplarBand,
          exemplarMark,
          wordCount,
          keywordsUsed: keywordsUsedCount,
          keywordsTotal: prompt.keywords?.length || 0,
          markerNotes: pdfPrefs.markerNotes,
          // Colours the syllabus terms on the page the way `renderFormattedText`
          // colours them on screen — the exporter shares the app's matcher, so
          // the two cannot disagree about what counts as a key term.
          keywords: prompt.keywords || [],
          mustUseKeywords,
        },
        pageSize: pdfPrefs.pageSize,
        copies: pdfPrefs.copies,
        showFields: pdfPrefs.showFields,
        filename: `HSC-${prompt.verb}-Band${result.overallBand}-Feedback`,
        // The COURSE, not the topic and sub-topic — those are the middle two
        // segments of the syllabus trail printed a centimetre below, so the
        // masthead was repeating the trail verbatim while the one thing the
        // trail does not reliably carry went unnamed. The trail is fitted to a
        // single line from its END (`fitTrailToLine`), so on a long path the
        // course is the first segment dropped; said here it cannot be lost, and
        // the two lines divide the job between them — what course this is, and
        // where in it the question sits.
        subtitle: hierarchy?.course?.trim() || 'Marking Feedback Report',
        onToast: showToast,
        onProgress: (_fraction, label) => setExportStatus(label),
      });
    } catch {
      // Every rejection is a PdfExportError the exporter has already toasted,
      // naming the stage that failed.
    } finally {
      setIsExporting(false);
      setExportStatus('');
    }
  };

  return {
    isExporting,
    exportStatus,
    pdfPrefs,
    updatePdfPrefs,
    showPdfOptions,
    setShowPdfOptions,
    pdfMenuRef,
    handleExportPdf,
  };
}
