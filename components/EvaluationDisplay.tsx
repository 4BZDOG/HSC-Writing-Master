import React, { useEffect, useRef } from 'react';
import type { ToastType } from '../hooks/useToast';
import { EvaluationResult, Prompt, UserFeedback, HierarchyContext } from '../types';
import { getBandConfig, renderFormattedText, VERB_HIGHLIGHT_CLASS } from '../utils/renderUtils';
import {
  Settings2,
  Loader2,
  Save,
  AlertCircle,
  ChevronRight,
  FileDown,
  FileText,
  Hash,
  PenLine,
  Quote,
} from 'lucide-react';
import { tierShortLabel } from '../data/commandTerms';
import ResponseFeedback from './ResponseFeedback';
import SupportUsageSummary from './SupportUsageSummary';
import PdfExportOptions from './PdfExportOptions';
import {
  describeAccess,
  isFeatureLocked,
  isFeedbackLocked,
  planLabelForFeature,
  requestUpgrade,
} from '../services/entitlements';
import { PlusLockChip } from './UpgradeModal';
import { AI_MARKING_DISCLAIMER } from '../data/legalContent';
import { useFeedbackView } from '../hooks/useFeedbackView';
import { useFeedbackExport } from '../hooks/useFeedbackExport';
import { BandGoalCard, HighlightKey, MetricCard, SectionHeading } from './feedback/FeedbackPieces';
import CriteriaSection from './feedback/CriteriaSection';
import StrengthsAndGrowth from './feedback/StrengthsAndGrowth';
import ImprovedResponseSection from './feedback/ImprovedResponseSection';
import NextStepNote from './feedback/NextStepNote';
import ScorePlacard from './feedback/ScorePlacard';
import {
  FEEDBACK_CARD,
  FEEDBACK_HEADING,
  FEEDBACK_TILE,
  FOOTNOTE,
  INK_BUTTON,
} from './feedback/feedbackChrome';

interface EvaluationDisplayProps {
  result: EvaluationResult;
  prompt: Prompt;
  onImproveAnswer: () => void;
  /** Open the side-by-side diff of the student's answer against the rewrite. */
  onCompareImprovement?: () => void;
  isImproving: boolean;
  improveAnswerError: string | null;
  userAnswer?: string;
  onSaveToSamples?: () => void;
  onFeedbackSubmit?: (feedback: UserFeedback) => void;
  hierarchy?: HierarchyContext;
  userName?: string;
  showToast?: (message: string, type?: ToastType) => void;
}

/**
 * The marking report. Its footer, which holds "Use this version", belongs to the
 * modal around it (EvaluationResultModal), since leaving the feedback is the modal's
 * act and not the report's.
 *
 * The layout is the reading order a student needs, not the order the marker wrote
 * the sections in: the mark first, then the one thing to do next and the rewrite
 * that acts on it, then the marker's words, the evidence, the criteria, and the
 * student's own response. From `xl` the mark, the goal and the figures sit in a
 * column beside the next step and the rewrite, so the top of the report is one
 * screen with no empty margin beside it.
 */
const EvaluationDisplay: React.FC<EvaluationDisplayProps> = ({
  result,
  prompt,
  onImproveAnswer,
  onCompareImprovement,
  isImproving,
  improveAnswerError,
  userAnswer = '',
  onSaveToSamples,
  onFeedbackSubmit,
  hierarchy,
  userName,
  showToast,
}) => {
  const bandConfig = getBandConfig(result.overallBand);
  const reportRef = useRef<HTMLDivElement>(null);

  // Plus-gated controls stay visible in a locked (amber) state; a click opens
  // the upgrade prompt instead of running the action. See services/entitlements.
  const pdfLocked = isFeatureLocked('pdfExport');
  const feedbackLocked = isFeedbackLocked();

  const view = useFeedbackView({ result, prompt, userAnswer, hierarchy });
  const {
    termInfo,
    upgradesLocked,
    revisedText,
    keyChanges,
    maxBand,
    nextLevel,
    exemplarMark,
    exemplarBand,
    exemplarConfig,
    wordCount,
    keywordsUsedCount,
    syllabusTrail,
  } = view;

  const {
    isExporting,
    exportStatus,
    pdfPrefs,
    updatePdfPrefs,
    showPdfOptions,
    setShowPdfOptions,
    pdfMenuRef,
    handleExportPdf,
  } = useFeedbackExport({ prompt, result, userAnswer, hierarchy, view, showToast });

  const atCeiling = result.overallMark >= prompt.totalMarks;
  const marksToFull = prompt.totalMarks - result.overallMark;

  // The question's tier caps how high an exemplar can realistically sit.
  // The Verb Gate binds only below Band 6: a tier-6 verb (Evaluate, Synthesise…)
  // leaves the full range open, so there is nothing to explain there. Below that
  // the ceiling is real, and the report should say why it is where it is.
  const capIsBinding = maxBand < 6;
  // Band N's canonical colour equals Tier N's, so the cap note wears the same
  // hue as the "Band N goal" card beside it (see getBandConfig / BandGoalCard).
  const capConfig = getBandConfig(maxBand);

  // Auto-scroll the trail rail to its leaf on overflow, matching Breadcrumb.tsx:
  // the deepest segment (the exact dot point marked) is the most useful, but a
  // left-pinned overflow rail hides it on a narrow viewport. Keyed on the
  // trail's CONTENT so it only re-scrolls when the location actually changes.
  const trailRailRef = useRef<HTMLElement>(null);
  const trailKey = syllabusTrail.join('›');
  useEffect(() => {
    const el = trailRailRef.current;
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left: el.scrollWidth, behavior: reduce ? 'auto' : 'smooth' });
  }, [trailKey]);

  // The export controls live in the placard, so they are drawn in its ink: the band's
  // solid fill takes dark ink, and a white button on it would be white on the band.
  const exportActions = (
    <>
      <div className="relative flex" ref={pdfMenuRef}>
        <button
          onClick={pdfLocked ? () => requestUpgrade('pdfExport') : handleExportPdf}
          disabled={isExporting}
          aria-busy={isExporting}
          title={pdfLocked ? describeAccess('pdfExport').explanation : undefined}
          className="min-h-11 sm:min-h-0 px-5 py-3 rounded-l-2xl text-xs font-bold shadow-sm transition-all border border-r-0 border-white/40 bg-white/25 hover:bg-white/35 text-slate-950 flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isExporting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              {/* The stage text updates several times during a multi-second
                  export (engine → fonts → page N of M). aria-busy on the
                  button says "working", but without a live region none of
                  the progress is announced. */}
              <span role="status" aria-live="polite">
                {exportStatus || 'Exporting…'}
              </span>
            </>
          ) : (
            <>
              <FileDown className="w-4 h-4" aria-hidden="true" /> Export PDF
              {pdfLocked && (
                // The chip's own amber is drawn on a dark pill, so it reads on the
                // band fill as well as on the white page it was designed for.
                <span className="inline-flex rounded-lg bg-slate-950/85">
                  <PlusLockChip feature="pdfExport" />
                </span>
              )}
            </>
          )}
        </button>
        <button
          onClick={() => setShowPdfOptions((v) => !v)}
          disabled={isExporting}
          aria-label="PDF export options"
          aria-expanded={showPdfOptions}
          title="Paper size, copies and what to include"
          className={`min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 px-3 rounded-r-2xl text-slate-950 border border-white/40 transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
            showPdfOptions ? 'bg-white/35' : 'bg-white/25 hover:bg-white/35'
          }`}
        >
          <Settings2 className="w-4 h-4" aria-hidden="true" />
        </button>
        <PdfExportOptions
          open={showPdfOptions}
          onClose={() => setShowPdfOptions(false)}
          value={pdfPrefs}
          onChange={updatePdfPrefs}
          anchorRef={pdfMenuRef}
        />
      </div>
      {onSaveToSamples && (
        <button onClick={onSaveToSamples} className={INK_BUTTON}>
          <Save className="w-4 h-4" aria-hidden="true" /> Save result
        </button>
      )}
    </>
  );

  return (
    <div
      ref={reportRef}
      /* The report is a document, so its column is bounded by what prose can be
         read at rather than by the modal it sits in. `max-w-3xl` below `xl` keeps the
         reading column at about 104 characters a line; `xl` widens the report to the
         two columns it now has, and the reading column inside them stays at a measure
         that reads. See DesignSpec §4, "Measure". */
      className="relative flex flex-col gap-6 max-w-3xl xl:max-w-5xl mx-auto pb-20 EvaluationDisplay"
    >
      {/* Question. Left edge aligns with the cards below it. */}
      <header className="flex flex-col gap-3">
        {/* Breadcrumb as one scrollable rail rather than a wrapping block: a
            deep syllabus trail wrapped to four stacked lines on a phone,
            shoving the question down the screen. It scrolls only when it
            overflows, so on a desktop that already fits it looks and behaves
            exactly as before — matching the workspace breadcrumb's own
            scrollbar-hide rail. */}
        {syllabusTrail.length > 0 && (
          <nav
            ref={trailRailRef}
            aria-label="Syllabus location"
            // tabIndex makes the hidden-scrollbar rail reachable by keyboard so a
            // clipped deep trail can still be scrolled without a pointer.
            tabIndex={0}
            className="flex items-center gap-x-1.5 flex-nowrap overflow-x-auto scrollbar-hide text-slate-600 dark:text-slate-400"
          >
            {syllabusTrail.map((segment, i) => (
              <React.Fragment key={i}>
                {i > 0 && <ChevronRight className="w-3 h-3 shrink-0 opacity-50" />}
                <span className="t-label whitespace-nowrap" title={segment}>
                  {segment}
                </span>
              </React.Fragment>
            ))}
          </nav>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="t-label px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300">
            {prompt.verb}
          </span>
          <span className="t-label px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300">
            {prompt.totalMarks} Marks
          </span>
        </div>
        <h2 className="text-xl md:text-2xl font-serif font-medium text-slate-900 dark:text-white leading-snug max-w-3xl">
          {renderFormattedText(prompt.question, prompt.keywords, prompt.verb)}
        </h2>
        <HighlightKey hasVerb={!!prompt.verb} hasTerms={(prompt.keywords?.length ?? 0) > 0} />
      </header>

      {/* The top of the report is two columns from `xl`, and one column below it. The
          DOM order is the phone order, so a keyboard or a screen reader meets the mark
          before the words, the same as a student on a phone does. */}
      <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start xl:gap-x-8">
        {/* The mark. Stated here and only here: every other surface says what it means
            in words and points back to this. */}
        <div
          className="flex flex-col gap-3 min-w-0 xl:col-start-2 xl:row-start-1"
          data-report="placard"
        >
          <ScorePlacard
            band={result.overallBand}
            mark={result.overallMark}
            total={prompt.totalMarks}
            atCeiling={atCeiling || result.overallBand >= maxBand}
            actions={exportActions}
          />
          <p className={`${FOOTNOTE} px-1`}>{AI_MARKING_DISCLAIMER}</p>
        </div>

        {/* The one thing to do next, and the rewrite that acts on it. */}
        <div
          className="flex flex-col gap-6 min-w-0 xl:col-start-1 xl:row-start-1 xl:row-span-2"
          data-report="reading"
        >
          {result.quickTip && (
            <NextStepNote band={result.overallBand} tip={result.quickTip} prompt={prompt} />
          )}
          <ImprovedResponseSection
            revisedText={revisedText}
            keyChanges={keyChanges}
            prompt={prompt}
            overallMark={result.overallMark}
            exemplarMark={exemplarMark}
            exemplarBand={exemplarBand}
            exemplarConfig={exemplarConfig}
            upgradesLocked={upgradesLocked}
            isImproving={isImproving}
            onCompareImprovement={onCompareImprovement}
            onImproveAnswer={onImproveAnswer}
          />
          {/* Failed answer upgrades were silently swallowed before — surface them. */}
          {improveAnswerError && !isImproving && (
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 no-print">
              <AlertCircle
                className="w-5 h-5 shrink-0 mt-0.5 text-red-700 dark:text-red-400"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm text-red-800 dark:text-red-400">
                  The improved response could not be generated.
                </p>
                <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">
                  {improveAnswerError}
                </p>
              </div>
            </div>
          )}

          {/* Marker's commentary: the one passage written TO the student. It sits under
              the rewrite, so the left column carries the reading and the right carries the
              mark, and neither leaves the other short at the top of the report. */}
          <section>
            <SectionHeading icon={Quote} label="Marker's commentary" />
            <div className={`relative overflow-hidden ${FEEDBACK_CARD} p-6 sm:p-8`}>
              <div
                className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${bandConfig.gradient}`}
                aria-hidden="true"
              />
              {/* Serif, because this is the one passage on the page written TO the
                  student — but at reading size. */}
              <div className="font-serif text-base sm:text-[17px] leading-relaxed text-slate-700 dark:text-slate-300 pl-3">
                {renderFormattedText(result.overallFeedback, prompt.keywords, prompt.verb)}
              </div>
            </div>
          </section>
        </div>

        {/* The goal and the figures beside the rewrite on a desktop, and after it on a phone. */}
        <div className="flex flex-col gap-4 min-w-0 xl:col-start-2 xl:row-start-2">
          <BandGoalCard
            currentBand={result.overallBand}
            maxBand={maxBand}
            marksToFull={marksToFull}
            capNote={
              capIsBinding ? (
                <>
                  <span className={VERB_HIGHLIGHT_CLASS}>{prompt.verb}</span> is a Tier{' '}
                  {termInfo.tier} ({tierShortLabel(termInfo.tier)}) command, so{' '}
                  <span className={`font-semibold ${capConfig.text}`}>Band {maxBand}</span> is the
                  top of the scale for this question — even a flawless response tops out here.
                </>
              ) : undefined
            }
          />
          <div className="grid grid-cols-2 gap-4">
            <MetricCard
              label="Volume"
              value={wordCount}
              subtext="Words"
              icon={FileText}
              theme={bandConfig}
            />
            <MetricCard
              label="Key terms"
              value={keywordsUsedCount}
              subtext={`of ${prompt.keywords?.length || 0}`}
              icon={Hash}
              theme={bandConfig}
            />
          </div>
        </div>

        <StrengthsAndGrowth
          className="xl:col-span-2"
          strengths={result.strengths}
          improvements={result.improvements}
          prompt={prompt}
          feedbackLocked={feedbackLocked}
        />

        <CriteriaSection
          className="xl:col-span-2"
          criteria={result.criteria}
          band={result.overallBand}
          prompt={prompt}
          feedbackLocked={feedbackLocked}
        />

        {/* Student response — included so the report can be shared with a teacher as a
            self-contained record of what was actually submitted. */}
        {userAnswer.trim() && (
          <section className={`${FEEDBACK_CARD} overflow-hidden xl:col-span-2`}>
            <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-300 dark:border-white/10 bg-surface-elevated">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`${FEEDBACK_TILE} bg-slate-200/70 dark:bg-white/10 text-slate-700 dark:text-slate-300`}
                >
                  <PenLine className="w-4 h-4" aria-hidden="true" />
                </div>
                <h3 className={FEEDBACK_HEADING}>
                  {userName ? `${userName}'s response` : 'Your response'}
                </h3>
              </div>
              <span className="t-label text-slate-600 dark:text-slate-400">
                {wordCount} words · as submitted
              </span>
            </div>
            <div className="p-6 sm:p-8">
              <div className="max-w-[40rem] font-serif leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-line">
                {renderFormattedText(userAnswer, prompt.keywords, prompt.verb)}
              </div>
            </div>
          </section>
        )}

        <SupportUsageSummary promptId={prompt.id} className="xl:col-span-2" />

        {/* Feedback on the marking itself. */}
        <div className="no-print xl:col-span-2">
          <ResponseFeedback
            onFeedbackSubmit={onFeedbackSubmit}
            existingFeedback={result.userFeedback}
          />
        </div>
      </div>
    </div>
  );
};

export default EvaluationDisplay;
