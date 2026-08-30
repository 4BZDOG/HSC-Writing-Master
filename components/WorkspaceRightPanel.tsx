import React, { useRef, useMemo, useSyncExternalStore } from 'react';
import { Prompt, EvaluationResult, HierarchyContext, WritingMode, StatePath } from '../types';
import Editor from './Editor';
import LiveInsights from './LiveInsights';
import WritingMetricsDashboard from './WritingMetricsDashboard';
import EvaluationResultModal from './EvaluationResultModal';
import ImprovementReviewModal from './ImprovementReviewModal';
import EvaluationProgressBar from './EvaluationProgressBar';
import { Loader2, AlertTriangle, Sparkles } from 'lucide-react';
import {
  getCommandTermInfo,
  getTargetBand,
  getNextLevelTarget,
  getBandForMark,
} from '../data/commandTerms';
import { useWritingMetrics } from '../hooks/useWritingMetrics';
import { getReadinessChroma } from '../utils/draftReadiness';
import ReadinessMeter from './ReadinessMeter';
import { freeEvalsRemaining, isFeatureLocked, subscribeEvalCount } from '../services/entitlements';
import FreeEvalCounter from './FreeEvalCounter';
import type { WorkspaceSyllabusHandlers } from '../hooks/useSyllabusData';
import type { AppGeminiHandlers } from '../hooks/appHandlerTypes';

interface WorkspaceRightPanelProps {
  isFocusMode: boolean;
  editorHeight?: string; // Kept for interface compatibility but ignored
  userAnswer: string;
  setUserAnswer: (val: string) => void;
  debouncedUserAnswer: string;
  currentPrompt: Prompt;
  isEvaluating: boolean;
  evaluationResult: EvaluationResult | null;
  evaluationError: string | null;
  onEvaluate: () => void;
  onSaveDraft: () => void;
  isImproving: boolean;
  improveAnswerError: string | null;
  evaluatedAnswer: string;
  geminiHandlers: AppGeminiHandlers;
  syllabusHandlers: WorkspaceSyllabusHandlers;
  statePath: StatePath;
  breadcrumbItems: { label: string }[];
  handleRunQualityCheck: (content: string, type: 'question' | 'code') => void;
  onToggleFocusMode: () => void;
  promptFontSize: number;
  onPromptFontSizeChange: (size: number) => void;
  onHeaderResize?: (height: number) => void;
  minHeaderHeight?: number;
  minEditorHeight?: number;
  onFooterResize?: (height: number) => void;
  minFooterHeight?: number;
  writingMode: WritingMode;
  onWritingModeChange: (mode: WritingMode) => void;
  /** Marking Guide + Sample Answers — see the Workspace for where they land. */
  referenceSlot?: React.ReactNode;
  /** Students type their own answers; paste is refused. See Editor. */
  blockPaste?: boolean;
  /** Whether everything typed has reached storage. */
  draftSaved?: boolean;
}

const WorkspaceRightPanel: React.FC<WorkspaceRightPanelProps> = ({
  isFocusMode,
  userAnswer,
  setUserAnswer,
  debouncedUserAnswer,
  currentPrompt,
  isEvaluating,
  evaluationResult,
  evaluationError,
  onEvaluate,
  onSaveDraft,
  isImproving,
  improveAnswerError,
  evaluatedAnswer,
  geminiHandlers,
  syllabusHandlers,
  statePath,
  breadcrumbItems,
  onToggleFocusMode,
  promptFontSize,
  onPromptFontSizeChange,
  onHeaderResize,
  minHeaderHeight,
  minEditorHeight,
  onFooterResize,
  minFooterHeight,
  writingMode,
  onWritingModeChange,
  referenceSlot,
  blockPaste,
  draftSaved,
}) => {
  const isExamMode = writingMode === 'exam';
  // The rewrite, the diff review and the PDF's change list are one feature.
  const upgradesLocked = isFeatureLocked('answerUpgrades');
  const editorRef = useRef<{
    getText: () => string;
    setText: (text: string) => void;
    insertText: (text: string) => void;
  }>(null);

  const commandTermInfo = useMemo(
    () => getCommandTermInfo(currentPrompt.verb),
    [currentPrompt.verb]
  );

  // The band this prompt actually works toward — the verb's tier is the sole
  // ceiling (NESA-aligned), so a 3-mark Evaluate still targets Band 6.
  const maxBand = useMemo(
    () => getTargetBand(currentPrompt.totalMarks, commandTermInfo.tier),
    [currentPrompt.totalMarks, commandTermInfo.tier]
  );

  // Live analysis of the draft, shared with the metrics dashboard below so the
  // two panels can never describe the same text differently. `readiness` is the
  // single provisional completeness signal (see utils/draftReadiness.ts) — it
  // feeds both the editor's progress meter and the Evaluate button's accent, so
  // the two can never tell a student two different stories about the same draft.
  const { insights, readiness } = useWritingMetrics(debouncedUserAnswer, currentPrompt);

  // The Evaluate button's accent tracks draft READINESS, never a predicted band.
  //
  // It once predicted a band from word count and keyword hits and painted itself
  // accordingly, which told a student who had padded their response with syllabus
  // terms that they were on a Band 6 before the AI had read a word. That
  // anti-pattern must never return: the colour here comes from
  // `getReadinessChroma(readiness.level)` — the same canonical palette the
  // readiness meter beside it uses — and it is honest because it is never colour
  // alone. It only ever signals mechanical completeness (length, structure,
  // keyword coverage, sentence variety — see utils/draftReadiness.ts), and it is
  // always reinforced at the point of submission by the adjacent ReadinessMeter's
  // number + completeness word AND by the button's own aria-label, which speaks
  // the same readiness label and percentage. No surface reads out a band.
  //
  // The accent stays NEUTRAL — the calm indigo below — while there is nothing
  // real to evaluate (`readiness.isNeutral`, i.e. an empty or barely-started
  // draft) and IN EXAM MODE, where nothing may ever hint at scoring. The
  // disabled and evaluating states are painted by the button's own JSX branches
  // and never consume this config, so they stay neutral too. Palette colour is
  // earned only once there is substance to mark.
  //
  // Whatever the accent, the button has to read as the one thing on the bar you
  // press. It sits in a footer of muted grey metrics, so its edge is drawn
  // explicitly: a solid border in the accent hue, and a coloured drop shadow (the
  // band's own `glow`, or indigo's inset-highlighted shadow) that lifts it off
  // the bar rather than the flat `shadow-lg` that vanished against a dark footer.
  const buttonConfig = useMemo(() => {
    // The calm indigo default — the button's resting accent, and what it keeps
    // in every neutral/exam/disabled case so colour is never mistaken for a mark.
    const neutralConfig = {
      gradient: 'from-indigo-600 to-indigo-500',
      shadow:
        'shadow-[0_4px_16px_-4px_rgba(79,70,229,0.65),inset_0_1px_0_0_rgba(255,255,255,0.25)] hover:shadow-[0_8px_24px_-4px_rgba(79,70,229,0.85),inset_0_1px_0_0_rgba(255,255,255,0.3)]',
      border: 'border-indigo-400/70 light:border-indigo-500',
      text: 'text-white',
    };

    // Neutral while empty/barely-started, and always neutral in Exam Mode.
    if (readiness.isNeutral || isExamMode) return neutralConfig;

    // Substance to evaluate, coach mode: borrow the readiness palette. The band
    // config drives the gradient, border and text; its `glow` becomes the raised
    // coloured drop shadow so the button keeps the same pressable lift.
    const { config } = getReadinessChroma(readiness.level);
    return {
      gradient: config.gradient,
      shadow: `shadow-lg ${config.glow} hover:shadow-xl motion-reduce:transition-none`,
      border: config.border,
      text: config.solidText,
    };
  }, [readiness.isNeutral, readiness.level, isExamMode]);

  const handleSaveUserResponse = () => {
    if (!currentPrompt || !evaluationResult || !userAnswer) return;
    const newSample = {
      id: `sa-${Date.now()}`,
      answer: userAnswer,
      band: evaluationResult.overallBand,
      mark: evaluationResult.overallMark,
      source: 'USER' as const,
      feedback: evaluationResult.overallFeedback,
      quickTip: evaluationResult.quickTip,
    };
    syllabusHandlers.handleSampleAnswerGenerated(statePath, newSample);
  };

  /**
   * What the diff review compares, from whichever source produced a rewrite.
   *
   * Two paths produce one: pressing "Improve my answer" (which returns its own
   * target mark and band), and ordinary marking — `evaluateAnswer` is briefed
   * to return the student's answer lifted one mark, and that arrives inside the
   * evaluation result. Only the first used to be reviewable, which meant the
   * comparison was missing from the path almost every student actually takes.
   * The marking rewrite carries no target of its own, so it is derived the same
   * way the model was briefed: one mark up, via the Verb Gate.
   */
  const reviewSubject = useMemo(() => {
    // The server withholds the rewrite for a plan that does not include answer
    // upgrades, so this is defence in depth rather than the gate itself — but
    // it keeps the intent legible at the call site, and stops a stale cached
    // result from re-opening the review after a downgrade.
    if (upgradesLocked) return null;
    if (geminiHandlers.improvement) return geminiHandlers.improvement;
    if (!evaluationResult?.revisedAnswer) return null;

    const raw = evaluationResult.revisedAnswer;
    const text = typeof raw === 'string' ? raw : (raw.text ?? '');
    if (!text.trim()) return null;

    const next = getNextLevelTarget(
      evaluationResult.overallMark,
      currentPrompt.totalMarks,
      commandTermInfo.tier
    );
    const mark = typeof raw === 'object' && raw.mark ? raw.mark : next.targetMark;
    return {
      text,
      mark,
      band:
        typeof raw === 'object' && raw.band
          ? raw.band
          : getBandForMark(mark, currentPrompt.totalMarks, commandTermInfo.tier),
      originalAnswer: evaluatedAnswer,
      originalMark: evaluationResult.overallMark,
    };
  }, [
    upgradesLocked,
    geminiHandlers.improvement,
    evaluationResult,
    evaluatedAnswer,
    currentPrompt.totalMarks,
    commandTermInfo.tier,
  ]);

  /**
   * Whether the comparison is actually on screen.
   *
   * `showImprovementReview` alone is not enough to hide the feedback behind:
   * marking sets it as soon as the result carries a rewrite, but there is no
   * modal to show when the plan withheld that rewrite (`reviewSubject` is
   * null). Reading both means a student on the free tier goes straight to their
   * marks instead of watching a blank overlay that never arrives.
   */
  const reviewOpen = !!reviewSubject && !!geminiHandlers.showImprovementReview;

  const hierarchyContext: HierarchyContext = useMemo(
    () => ({
      course: breadcrumbItems[0]?.label || 'Course',
      topic: breadcrumbItems[1]?.label || 'Topic',
      subTopic: breadcrumbItems[2]?.label || 'Sub-Topic',
      dotPoint: breadcrumbItems[3]?.label || 'Syllabus Dot Point',
    }),
    [breadcrumbItems]
  );

  /**
   * The same figure the counter chip shows, folded into the button's tooltip
   * for a pointer user who is already hovering it. `useSyncExternalStore`
   * rather than a `useMemo` over a render-triggering prop: the count lives in
   * localStorage and moves for reasons this component cannot see — the sign-in
   * reconciliation, and the server correcting us on a refusal. Keyed on
   * `evaluationResult`, it went stale exactly when it had just been corrected.
   */
  const remainingEvals = useSyncExternalStore(subscribeEvalCount, freeEvalsRemaining, () =>
    freeEvalsRemaining()
  );

  const evalCounterTitle =
    remainingEvals === Infinity
      ? ''
      : remainingEvals > 0
        ? ` — ${remainingEvals} free evaluation${remainingEvals === 1 ? '' : 's'} remaining today`
        : ' — daily free limit reached';

  // Footer-sized, not hero-sized. At 20px of padding and text-xl it was a
  // slab that pushed the writing surface down; the keyboard shortcut and the
  // remaining-evaluations count move into the title so the control itself
  // stays the height of the footer it sits in.
  const evaluateAction = (
    <>
      {/* Separates the action from the read-only metrics it is docked beside,
        so the footer reads as "status … | do this" rather than one run-on row. */}
      <span
        aria-hidden="true"
        className="hidden sm:block w-px h-6 bg-white/10 light:bg-slate-300 flex-shrink-0"
      />
      {/* The free tier's remaining markings, VISIBLE rather than in a tooltip
          — see the note in FreeEvalCounter. Renders nothing for anyone who
          isn't metered. */}
      <FreeEvalCounter />
      {/* The draft-readiness meter, docked immediately left of the button so
          the accent hue, its number and its completeness word sit together at
          the point of submission — colour never travels alone. Hidden in Exam
          Mode exactly as Live Insights is, so nothing hints at scoring there. */}
      {!isExamMode && <ReadinessMeter readiness={readiness} />}
      <button
        onClick={onEvaluate}
        disabled={isEvaluating || !userAnswer.trim()}
        // The accent hue is honest only when the readiness label + percentage
        // ride with it. When the button is coloured (substance to mark, coach
        // mode), the accessible name speaks that same readiness; otherwise it
        // falls back to the visible "Evaluate"/"Evaluating" text.
        aria-label={
          !isEvaluating && userAnswer.trim() && !readiness.isNeutral && !isExamMode
            ? `Evaluate — draft readiness: ${readiness.label}, ${readiness.score}%`
            : undefined
        }
        title={
          isEvaluating
            ? 'Evaluating your response…'
            : !userAnswer.trim()
              ? 'Write a response first, then evaluate'
              : `Evaluate your response (Ctrl / ⌘ + Enter)${evalCounterTitle}`
        }
        className={`
          group px-4 py-2 sm:px-5 sm:py-2.5 rounded-xl font-black text-xs sm:text-sm tracking-tight
          transition-all duration-300 flex items-center gap-2 flex-shrink-0 border
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400
          focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--color-bg-surface))]
          ${
            isEvaluating
              ? 'bg-slate-800 light:bg-slate-200 text-slate-400 cursor-wait border-white/15 light:border-slate-300 shadow-inner'
              : !userAnswer.trim()
                ? 'bg-slate-800/60 light:bg-slate-200/80 text-slate-500 cursor-not-allowed border-white/10 light:border-slate-400 opacity-50'
                : `bg-gradient-to-r ${buttonConfig.gradient} ${buttonConfig.shadow} hover:scale-[1.03] active:scale-[0.97] ${buttonConfig.border}`
          }
        `}
      >
        {isEvaluating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin text-white/60" />
            <span className="text-slate-400">Evaluating</span>
          </>
        ) : (
          <>
            <Sparkles
              className={`w-4 h-4 transition-transform duration-300 ${
                userAnswer.trim() ? 'group-hover:rotate-12 group-hover:scale-110' : 'opacity-40'
              }`}
            />
            {/* The white only belongs on the indigo fill. Applied
              unconditionally it painted the DISABLED label white too — legible
              against the dark footer, invisible against the light theme's pale
              grey one. Unset, the label inherits the button's own colour. */}
            <span className={userAnswer.trim() ? buttonConfig.text : undefined}>Evaluate</span>
            <kbd
              className={`hidden md:inline text-[9px] font-bold border rounded px-1 py-0.5 tracking-normal transition-opacity ${
                userAnswer.trim()
                  ? 'bg-white/15 border-white/10 opacity-60 group-hover:opacity-100'
                  : 'bg-black/5 border-current/20 opacity-50'
              }`}
            >
              ⌘↵
            </kbd>
          </>
        )}
      </button>
    </>
  );

  return (
    <div
      className={`${
        isFocusMode
          ? 'col-span-1 max-w-5xl mx-auto w-full'
          : isExamMode
            ? // Exam Mode hides the whole left reference rail, so the writing
              // column takes the width the rail is no longer using.
              'xl:col-span-8 xl:col-start-5 xl:row-start-1 xl:row-span-2'
            : 'xl:col-span-7 xl:col-start-6 xl:row-start-1 xl:row-span-2'
      } flex flex-col gap-6 pt-0 self-start`}
    >
      {/* `self-start` on the column and no flex-1 here: this panel shares a
          grid row-span with the reference rail, and stretching to match a rail
          that is now much taller opened a void between the writing card and
          everything below it. */}
      <div className="relative group flex flex-col">
        <div className="flex flex-col relative shadow-2xl rounded-[32px]">
          <div className="clip-stable absolute inset-0 z-[30] pointer-events-none rounded-[32px] overflow-hidden">
            {isEvaluating && <EvaluationProgressBar />}
          </div>

          <Editor
            ref={editorRef}
            value={userAnswer}
            onChange={setUserAnswer}
            onEvaluate={onEvaluate}
            onSave={onSaveDraft}
            disabled={isEvaluating}
            placeholder={`Draft your ${commandTermInfo.term} response here...`}
            className="flex-grow"
            keywords={currentPrompt.keywords}
            verb={currentPrompt.verb}
            promptId={currentPrompt.id}
            isFocusMode={isFocusMode}
            onToggleFocusMode={onToggleFocusMode}
            // The editor's progress prop is a 0..1 completeness ratio; readiness
            // is 0..100, so it is scaled down. Same signal the Evaluate button
            // and the ReadinessMeter read, so the three never disagree.
            progress={readiness.score / 100}
            syncedFontSize={promptFontSize}
            onFontSizeChange={onPromptFontSizeChange}
            maxBand={maxBand}
            onHeaderResize={onHeaderResize}
            minHeaderHeight={minHeaderHeight}
            minTotalHeight={minEditorHeight}
            onFooterResize={onFooterResize}
            minFooterHeight={minFooterHeight}
            writingMode={writingMode}
            onWritingModeChange={onWritingModeChange}
            footerAction={evaluateAction}
            blockPaste={blockPaste}
            draftSaved={draftSaved}
          />
        </div>
      </div>

      {/* Evaluation failure belongs beside the button that caused it. Rendered
          at the foot of the column it landed ~1000px below the Evaluate
          control — a student waited fifteen seconds and saw nothing happen. */}
      {evaluationError && (
        <div className="bg-red-500/10 light:bg-red-50 border border-red-500/20 light:border-red-200 text-red-400 light:text-red-700 p-8 rounded-[40px] animate-fade-in flex items-start gap-5 shadow-2xl shadow-red-900/10 backdrop-blur-xl">
          <div className="p-3 rounded-2xl bg-red-500/20">
            <AlertTriangle className="w-6 h-6 shrink-0" />
          </div>
          <div>
            <h4 className="font-black uppercase tracking-[0.2em] text-xs mb-2">
              {/timed? ?out/i.test(evaluationError)
                ? 'Evaluation Timed Out'
                : /quota|limit|429/i.test(evaluationError)
                  ? 'AI Quota Reached'
                  : /key|denied|permission/i.test(evaluationError)
                    ? 'API Key Issue'
                    : 'Evaluation Failed'}
            </h4>
            <p className="text-sm font-bold leading-relaxed">{evaluationError}</p>
            {/timed? ?out/i.test(evaluationError) && (
              <p className="text-xs mt-2 opacity-70">
                Tip: long answers on a busy connection can time out. Try again in a moment, or
                shorten your response and re-submit.
              </p>
            )}
            <button
              onClick={onEvaluate}
              className="mt-3 text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* Live Insights, the metrics strip and whatever the Workspace slots in
          below (exemplars, and in Focus Mode the marking guide) read as one
          set of reference panels, so they share the reference rail's own
          16px rhythm (`gap-1` + each panel's `mb-3`) rather than the 24px
          the outer column uses to hold the writing card apart from the set —
          the two gaps looked close enough alike to read as a mistake rather
          than two different relationships. */}
      <div className="flex flex-col gap-4">
        {!isExamMode && <LiveInsights insights={insights} />}

        <WritingMetricsDashboard
          userAnswer={debouncedUserAnswer}
          prompt={currentPrompt}
          writingMode={writingMode}
          onAddWord={(word) => {
            const event = new CustomEvent('insert-text', { detail: word });
            window.dispatchEvent(event);
          }}
        />

        {/* Whatever the Workspace decided belongs under the writing card in
            this layout — the exemplars beside a two-column workspace, and in
            Focus Mode the marking guide too, since there is no left rail to
            hold it. */}
        {referenceSlot && (
          <div className={`flex flex-col ${isExamMode ? 'hidden' : ''}`}>{referenceSlot}</div>
        )}
      </div>

      {/*
        Portalled and fixed, so where it sits in this tree is immaterial.

        The marking feedback waits behind the comparison. Marking returns the
        student's own answer lifted one mark, and the diff is the one screen
        that names what the extra mark was for — behind a "Compare with mine"
        button on the summary, most students never opened it. So when there is
        a rewrite to show, the comparison goes first and this opens as the
        student continues out of it. `evaluationResult` is untouched throughout,
        so closing the comparison reveals the feedback rather than costing a
        re-mark.
      */}
      {evaluationResult && (
        <EvaluationResultModal
          isOpen={!!evaluationResult && !reviewOpen}
          onClose={geminiHandlers.resetEvaluation}
          result={evaluationResult}
          prompt={currentPrompt}
          userAnswer={evaluatedAnswer}
          onUseRevisedAnswer={setUserAnswer}
          onImproveAnswer={() =>
            geminiHandlers.improveAnswer(evaluatedAnswer, currentPrompt, evaluationResult)
          }
          onCompareImprovement={
            reviewSubject ? () => geminiHandlers.setShowImprovementReview(true) : undefined
          }
          isImproving={isImproving}
          improveAnswerError={improveAnswerError}
          onSaveToSamples={handleSaveUserResponse}
          onFeedbackSubmit={geminiHandlers.handleFeedbackSubmit}
          hierarchy={hierarchyContext}
        />
      )}

      {/* The diff review. Either the first thing a student sees after marking,
          or a detour off the feedback summary when they regenerate the upgrade
          — `continueLabel` is how the footer says which. */}
      {reviewSubject && (
        <ImprovementReviewModal
          isOpen={reviewOpen}
          onClose={() => geminiHandlers.setShowImprovementReview(false)}
          continueLabel={
            geminiHandlers.improvementReviewLeadsToFeedback ? 'See my full feedback' : undefined
          }
          improvedAnswer={reviewSubject.text}
          originalAnswer={reviewSubject.originalAnswer}
          originalPrompt={currentPrompt}
          targetBand={reviewSubject.band}
          targetMark={reviewSubject.mark}
          originalMark={reviewSubject.originalMark}
          onApply={setUserAnswer}
        />
      )}
    </div>
  );
};

export default WorkspaceRightPanel;
