import React, { useEffect, useRef } from 'react';
import type { ToastType } from '../hooks/useToast';
import { EvaluationResult, Prompt, UserFeedback, HierarchyContext } from '../types';
import {
  getBandConfig,
  getBandName,
  renderFormattedText,
  VERB_HIGHLIGHT_CLASS,
} from '../utils/renderUtils';
import {
  Award,
  Trophy,
  FileDown,
  Settings2,
  Loader2,
  Save,
  AlertCircle,
  ChevronRight,
  FileText,
  PenLine,
  Quote,
  Target,
  Lightbulb,
  Hash,
} from 'lucide-react';
import { tierShortLabel } from '../data/commandTerms';
import LoadingIndicator from './LoadingIndicator';
import AiBusyOverlay from './AiBusyOverlay';
import ResponseFeedback from './ResponseFeedback';
import SupportUsageSummary from './SupportUsageSummary';
import PdfExportOptions from './PdfExportOptions';
import {
  isFeatureLocked,
  isFeedbackLocked,
  planLabelForFeature,
  requestUpgrade,
} from '../services/entitlements';
import { PlusLockChip } from './UpgradeModal';
import { AI_MARKING_DISCLAIMER } from '../data/legalContent';
import { useFeedbackView } from '../hooks/useFeedbackView';
import { useFeedbackExport } from '../hooks/useFeedbackExport';
import {
  BandGoalCard,
  CARD,
  HighlightKey,
  MetricCard,
  SectionHeading,
} from './feedback/FeedbackPieces';
import CriteriaSection from './feedback/CriteriaSection';
import StrengthsAndGrowth from './feedback/StrengthsAndGrowth';
import ImprovedResponseSection from './feedback/ImprovedResponseSection';

const MeshOverlay = ({ opacity = 'opacity-[0.05]' }: { opacity?: string }) => (
  <div
    className={`absolute inset-0 ${opacity} pointer-events-none mix-blend-overlay z-0 transition-opacity duration-500 no-print`}
    style={{
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 12 12' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v10M0 1h10' stroke='%23ffffff' stroke-width='0.5' fill='none'/%3E%3C/svg%3E")`,
    }}
  />
);

interface EvaluationDisplayProps {
  result: EvaluationResult;
  prompt: Prompt;
  onUseRevisedAnswer: (answer: string) => void;
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

const EvaluationDisplay: React.FC<EvaluationDisplayProps> = ({
  result,
  prompt,
  onUseRevisedAnswer,
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

  // The question's tier caps how high an exemplar can realistically sit.
  // The Verb Gate binds only below Band 6: a tier-6 verb (Evaluate, Synthesise…)
  // leaves the full range open, so there is nothing to explain there. Below that
  // the ceiling is real, and the report should say why it is where it is.
  const capIsBinding = maxBand < 6;
  // Band N's canonical colour equals Tier N's, so the cap note wears the same
  // hue as the "Band N Goal" card beside it (see getBandConfig / BandGoalCard).
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

  return (
    <div
      ref={reportRef}
      /* gap-6, not gap-8: each section now carries its own heading with its own
         margin, so the old gap stacked two separations on top of each other and
         pushed the criteria a scroll further down than they needed to be. */
      /* The report is a document, so its column is bounded by what prose can be
         read at rather than by the modal it sits in. At `max-w-5xl` the reading
         cards ran 142 characters a line on a laptop and wider; `3xl` brings that
         to 104. Measured across viewports: phone (306px panel, 38 chars) and
         tablet (652px, 87) are untouched, because their column is already
         narrower than this — the cap only engages from about 1024px up, which is
         exactly where the lines were too long.

         Not tighter than `3xl`: 44rem reaches 95 characters but starts clipping
         "Key Terms" to "Key…" in the stat grid, and 40rem takes "Volume" with
         it. 104 characters is the tightest line this layout buys without
         spending a label to get it. Narrowing the text inside these cards
         instead was tried and reverted — it left the prose stranded halfway
         across a card nobody had narrowed. See DesignSpec §4, "Measure". */
      className="relative flex flex-col gap-6 max-w-3xl xl:max-w-5xl mx-auto pb-20 EvaluationDisplay"
    >
      <AiBusyOverlay show={isImproving} rounded="rounded-panel">
        <LoadingIndicator
          task="generation"
          message={`Lifting your answer to ${nextLevel.targetMark}/${prompt.totalMarks}`}
          messages={[
            'Keeping your wording and structure...',
            'Adding what the marker asked for...',
            'Sharpening the syllabus terminology...',
          ]}
          duration={12}
          band={exemplarBand}
        />
      </AiBusyOverlay>

      {/* Hero Question Context — left edge aligns with the cards below it, and
          the trail/meta/question sit on a tightening rhythm so the question
          reads as the heading of the whole report. */}
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

      {/* From `xl` up the report is a document with a margin, not one column in
          a wide empty card. Bounding the column at `3xl` fixed the 142-character
          line but left about 400px of nothing beside it on a desktop, which is
          the half of the problem the cap could not reach: the container was the
          thing that was too wide. So the score placard and the metrics move into
          that space and the prose narrows behind them, which uses the width and
          shortens the line in one move rather than trading one against the
          other.

          Below `xl` nothing changes. The wrapper is a flex column there and the
          aside is its first child, so the reading order is the order it has
          always been — question, score, then the report. The `order` swap only
          applies once there are two columns to swap between. */}
      <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start xl:gap-8">
        {/* NOT sticky, though it was built that way first and it worked: pinned
            at `top-6` the mark stayed in view through the whole report. It came
            out because it fails on a short window. The aside measures 687px and
            the modal's scroll container is 572px at 1440x700 and 496px at
            1280x620 — a laptop with a browser bar. Pinned, the top holds and the
            bottom of the column, which is where the Volume and Key Terms figures
            are, can never be scrolled to. A capped height with its own scrollbar
            inside a 352px margin is worse than scrolling with the page, and a
            `min-height` media query guessing where the sidebar stops fitting is
            a rule that breaks the first time the goal card gains a line.

            `self-start` stays: without it the aside stretches to the reading
            column's full height and the gradient placard grows a void. */}
        <aside className="flex flex-col gap-4 xl:order-2 xl:self-start">
          {/* Score & Metrics Dashboard */}
          <div className="grid grid-cols-1 lg:grid-cols-12 xl:grid-cols-1 gap-4 items-stretch">
            {/* Main Vibrant Placard */}
            <div
              className={`clip-stable lg:col-span-7 xl:col-span-full relative rounded-panel overflow-hidden p-7 sm:p-8 shadow-lg transition-all duration-500 bg-gradient-to-br ${bandConfig.gradient}`}
            >
              <MeshOverlay opacity="opacity-[0.15]" />

              <div className="relative z-10 flex flex-col justify-between h-full gap-6 text-white">
                <div className="flex flex-col gap-5">
                  <div className="flex justify-between items-start gap-4">
                    <div className="min-w-0">
                      <div
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/20 mb-4 shadow-sm backdrop-blur-md bg-white/20`}
                      >
                        <Award className="w-3.5 h-3.5" />
                        <span className="t-label">
                          Band {result.overallBand} · {getBandName(result.overallBand)}
                        </span>
                      </div>
                      {/* A `<p>`, not the `<h1>` it was. A number is not a heading:
                          it made the mark the page's second level-one heading,
                          under this panel's own `<h2>`, and a screen reader read
                          it as "15 slash 20". The slash is drawn for the eye and
                          "out of" is spoken for the ear. */}
                      <p className="text-6xl sm:text-7xl font-black tracking-tight italic leading-none">
                        {result.overallMark}
                        <span
                          className="text-3xl font-medium align-top opacity-60"
                          aria-hidden="true"
                        >
                          /{prompt.totalMarks}
                        </span>
                        <span className="sr-only"> out of {prompt.totalMarks}</span>
                      </p>
                      {/* "Result", not "Assessment Score". The word carries weight in the HSC
                      that practice marking has not earned, which is why it was taken out
                      of the exported report; the screen it was exported from still said
                      it. See pdf/buildBlocks.ts, where the same cell is labelled. */}
                      <p className="t-label opacity-80 mt-2">Result</p>
                    </div>
                    <div
                      className={`w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center bg-white/20 backdrop-blur-md border border-white/20 shadow-lg no-print`}
                    >
                      {/* Measured against the question's own ceiling, not
                          against Band 6. A 3/4 on a DESCRIBE is the top band
                          that question can award, and it wore a warning
                          triangle because Band 2 is low on a six-band scale. */}
                      {result.overallBand >= maxBand || result.overallMark >= prompt.totalMarks ? (
                        <Trophy className="w-7 h-7 text-white" />
                      ) : (
                        <Target className="w-7 h-7 text-white" />
                      )}
                    </div>
                  </div>

                  {/* Marks awarded as a share of the total — gives the placard's
                middle a purpose instead of leaving a gradient void when the
                column stretches to match the metrics beside it. */}
                  <div
                    className="h-1.5 w-full rounded-full bg-white/25 overflow-hidden"
                    role="img"
                    aria-label={`${result.overallMark} of ${prompt.totalMarks} marks awarded`}
                  >
                    <div
                      className="h-full rounded-full bg-white/90 transition-all duration-700"
                      style={{
                        width: `${prompt.totalMarks > 0 ? Math.min(100, (result.overallMark / prompt.totalMarks) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 no-print">
                  {/* Export, and the options behind a chevron. Splitting them keeps
                  the common case one click while making paper size, copies and
                  what goes in the report reachable at all — every one of them
                  was already supported by the exporter and unreachable. */}
                  <div className="relative flex" ref={pdfMenuRef}>
                    <button
                      onClick={pdfLocked ? () => requestUpgrade('pdfExport') : handleExportPdf}
                      disabled={isExporting}
                      aria-busy={isExporting}
                      title={
                        pdfLocked
                          ? `PDF export is part of ${planLabelForFeature('pdfExport')} — tap to learn more`
                          : undefined
                      }
                      className={`px-5 py-3 rounded-l-2xl text-white text-xs font-bold shadow-sm transition-all border border-r-0 backdrop-blur-sm flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed ${
                        pdfLocked
                          ? 'bg-amber-400/15 hover:bg-amber-400/25 border-amber-300/50'
                          : 'bg-white/20 hover:bg-white/30 border-white/20'
                      }`}
                    >
                      {isExporting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
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
                          <FileDown className="w-4 h-4" /> Export PDF
                          {pdfLocked && (
                            <PlusLockChip className="bg-white/15 border-white/40 text-white" />
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
                      className={`px-2.5 rounded-r-2xl text-white border backdrop-blur-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                        showPdfOptions ? 'bg-white/30' : 'bg-white/20 hover:bg-white/30'
                      } border-white/20`}
                    >
                      <Settings2 className="w-4 h-4" />
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
                    <button
                      onClick={onSaveToSamples}
                      className="px-5 py-3 rounded-2xl bg-white text-indigo-900 hover:bg-indigo-50 text-xs font-bold shadow-lg transition-all hover:scale-105 flex items-center gap-2 border-2 border-transparent"
                    >
                      <Save className="w-4 h-4" /> Save Result
                    </button>
                  )}
                </div>

                {/* The agreement makes this point once, at sign-up. This is where
                it actually matters: next to a mark and a band that look
                exactly like a real result. Deliberately quiet, and always
                present — including on the printed page. */}
                <p className="text-[10px] leading-relaxed text-white/60 max-w-md">
                  {AI_MARKING_DISCLAIMER}
                </p>
              </div>
            </div>

            {/* Goal + Metrics */}
            <div className="lg:col-span-5 xl:col-span-full flex flex-col gap-4">
              {/* Why the goal is capped where it is, told on the goal itself.
                  The "Band N Goal" states the ceiling; without the reason a
                  student or teacher reads it as a harsh marker rather than the
                  verb's own limit. It used to be a card of its own at the head
                  of the report, the first thing read — above the student's own
                  answer — and a paragraph away from the goal it explained.
                  Only when the cap binds (below Band 6), and carried by the
                  text alone, so it stands on greyscale and to a screen reader. */}
              <BandGoalCard
                currentBand={result.overallBand}
                maxBand={maxBand}
                capNote={
                  capIsBinding ? (
                    <>
                      <span className={VERB_HIGHLIGHT_CLASS}>{prompt.verb}</span> is a Tier{' '}
                      {termInfo.tier} ({tierShortLabel(termInfo.tier)}) command, so{' '}
                      <span className={`font-semibold ${capConfig.text}`}>Band {maxBand}</span> is
                      the top of the scale for this question — even a flawless response tops out
                      here.
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
                  label="Key Terms"
                  value={keywordsUsedCount}
                  subtext={`of ${prompt.keywords?.length || 0}`}
                  icon={Hash}
                  theme={bandConfig}
                />
              </div>
            </div>
          </div>
        </aside>

        <div className="flex flex-col gap-6 min-w-0 xl:order-1">
          {/* Student Response — included so the report can be shared with a
          teacher as a self-contained record of what was actually submitted. */}
          {userAnswer.trim() && (
            <section className={`${CARD} overflow-hidden`}>
              <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-300 dark:border-white/5 bg-slate-100 dark:bg-white/[0.03]">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-slate-200/70 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                    <PenLine className="w-4 h-4" />
                  </div>
                  <h3 className="t-section text-slate-600 dark:text-slate-400">
                    {userName ? `${userName}'s response` : 'Your response'}
                  </h3>
                </div>
                <span className="t-label text-slate-600 dark:text-slate-400">
                  {wordCount} words · as submitted
                </span>
              </div>
              <div className="p-6 sm:p-8">
                <div className="font-serif leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-line">
                  {renderFormattedText(userAnswer, prompt.keywords, prompt.verb)}
                </div>
              </div>
            </section>
          )}

          {/* Coach's Tip — the one sentence to act on first. A solid card with a
          band-coloured rail rather than the dashed callout it used to be: the
          dashes read as a placeholder, and the tip is the opposite of one. */}
          {result.quickTip && (
            <div
              className={`relative overflow-hidden ${CARD} flex items-start gap-4 p-5 animate-fade-in`}
            >
              <div
                className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${bandConfig.gradient}`}
                aria-hidden="true"
              />
              <div
                className={`ml-1 p-2.5 rounded-xl ${bandConfig.iconBg} ${bandConfig.text} shrink-0`}
              >
                <Lightbulb className="w-5 h-5" />
              </div>
              <div className="min-w-0 pt-0.5">
                <span className={`t-section block mb-1 ${bandConfig.text}`}>Coach&apos;s Tip</span>
                {/* Run through the formatter like every other piece of marker prose
                — it used to be the one place a syllabus term printed plain. */}
                <p className="text-sm font-semibold leading-relaxed text-slate-700 dark:text-slate-200">
                  {renderFormattedText(result.quickTip, prompt.keywords, prompt.verb)}
                </p>
              </div>
            </div>
          )}

          {/* Marker's Commentary */}
          <section>
            <SectionHeading icon={Quote} label="Marker's Commentary" />
            <div className={`relative overflow-hidden ${CARD} p-6 sm:p-8`}>
              <div
                className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${bandConfig.gradient}`}
                aria-hidden="true"
              />
              {/* Serif, because this is the one passage on the page written TO the
              student — but at reading size. It used to be text-xl italic, which
              set the marker's aside larger than the question it was about. */}
              <div className="font-serif text-base sm:text-[17px] leading-relaxed text-slate-700 dark:text-slate-300 pl-3">
                {renderFormattedText(result.overallFeedback, prompt.keywords, prompt.verb)}
              </div>
            </div>
          </section>

          {/* Strengths & Growth */}
          <StrengthsAndGrowth
            strengths={result.strengths}
            improvements={result.improvements}
            prompt={prompt}
            feedbackLocked={feedbackLocked}
          />

          {/* What the student had open before writing. Placed directly under the
          improvement path, where "you did not open the Marking Guide" reads as
          a route to the advice above rather than a reprimand of its own. */}
          <SupportUsageSummary promptId={prompt.id} />

          {/* Criteria Breakdown */}
          <CriteriaSection
            criteria={result.criteria}
            prompt={prompt}
            feedbackLocked={feedbackLocked}
          />

          {/* Failed answer upgrades were silently swallowed before — surface them. */}
          {improveAnswerError && !isImproving && (
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 no-print">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
              <div>
                <p className="text-sm text-red-700 dark:text-red-400">
                  The improved response could not be generated.
                </p>
                <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-0.5">
                  {improveAnswerError}
                </p>
              </div>
            </div>
          )}

          {/* Improved Response (Exemplar). See ImprovedResponseSection for the
          locked state a free plan sees in place of the rewrite. */}
          <ImprovedResponseSection
            revisedText={revisedText}
            prompt={prompt}
            overallMark={result.overallMark}
            exemplarMark={exemplarMark}
            exemplarBand={exemplarBand}
            exemplarConfig={exemplarConfig}
            upgradesLocked={upgradesLocked}
            isImproving={isImproving}
            onCompareImprovement={onCompareImprovement}
            onUseRevisedAnswer={onUseRevisedAnswer}
            onImproveAnswer={onImproveAnswer}
          />

          {/* Feedback on the marking itself. One card: it used to sit in a
              bordered wrapper of its own, whose padding and the card's own
              top margin left an empty band above "Rate this evaluation". */}
          <div className="no-print">
            <ResponseFeedback
              onFeedbackSubmit={onFeedbackSubmit}
              existingFeedback={result.userFeedback}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default EvaluationDisplay;
