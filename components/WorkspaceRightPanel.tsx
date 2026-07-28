import React, { useRef, useMemo } from 'react';
import { Prompt, EvaluationResult, HierarchyContext, WritingMode } from '../types';
import Editor from './Editor';
import LiveInsights from './LiveInsights';
import WritingMetricsDashboard from './WritingMetricsDashboard';
import EvaluationResultModal from './EvaluationResultModal';
import EvaluationProgressBar from './EvaluationProgressBar';
import { Loader2, AlertTriangle, Sparkles } from 'lucide-react';
import { getCommandTermInfo, getTargetBand, BAND_METRICS } from '../data/commandTerms';
import { textContainsKeyword } from '../utils/renderUtils';
import { useWritingMetrics } from '../hooks/useWritingMetrics';
import { freeEvalsRemaining } from '../services/entitlements';
import type { WorkspaceSyllabusHandlers } from '../hooks/useSyllabusData';

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
  geminiHandlers: any;
  syllabusHandlers: WorkspaceSyllabusHandlers;
  statePath: any;
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
}) => {
  const isExamMode = writingMode === 'exam';
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
  // two panels can never describe the same text differently.
  const { insights } = useWritingMetrics(debouncedUserAnswer, currentPrompt);

  // Unified progression score for the entire workspace
  const progressScore = useMemo(() => {
    if (!currentPrompt) return 0;

    const wordCount = debouncedUserAnswer.trim().split(/\s+/).filter(Boolean).length;
    // Use metrics target for the Max Band of this prompt
    const targetMetric = BAND_METRICS.find((b) => b.band === maxBand) || BAND_METRICS[0];
    // Guard against a malformed/zero-mark prompt producing a 0 target, which
    // would turn the progress ratio into NaN/Infinity and render "NaN%".
    const targetCount = Math.max(
      1,
      Math.ceil(currentPrompt.totalMarks * targetMetric.wordCountMultiplier.min)
    );

    // Allow progression to go slightly over 1.0 for "Exemplar" feel
    const wordProg = Math.min(1.1, wordCount / targetCount);

    const keywords = currentPrompt.keywords || [];
    let keyProg = 0;
    if (keywords.length > 0) {
      // Shares the highlighter's matcher, so this meter can never say a term
      // is missing while the editor overlay shows it lit up (or vice versa).
      const used = keywords.filter((kw) => textContainsKeyword(debouncedUserAnswer, kw));
      keyProg = used.length / keywords.length;
    } else {
      keyProg = Math.min(1, wordProg);
    }

    // Weighted score: 60% volume, 40% keywords
    return wordProg * 0.6 + keyProg * 0.4;
  }, [debouncedUserAnswer, currentPrompt, commandTermInfo, maxBand]);

  // The Evaluate button is deliberately NOT band-coloured. It used to predict a
  // band from word count and keyword hits and paint itself accordingly, which
  // told a student who had padded their response with syllabus terms that they
  // were on a Band 6 before the AI had read a word. Length and coverage are
  // honest signals of progress, not of quality, so they stay in the editor's
  // progress meter; the button is one steady accent colour once there is
  // something to evaluate.
  //
  // It does need to read as the one thing on the bar you press, though. It sits
  // in a footer of muted grey metrics, so its edge is drawn explicitly: a solid
  // indigo border, an inset highlight along the top of the fill, and a coloured
  // drop shadow that lifts it off the bar rather than the flat `shadow-lg` that
  // vanished against a dark footer.
  const buttonConfig = useMemo(
    () => ({
      gradient: 'from-indigo-600 to-indigo-500',
      shadow:
        'shadow-[0_4px_16px_-4px_rgba(79,70,229,0.65),inset_0_1px_0_0_rgba(255,255,255,0.25)] hover:shadow-[0_8px_24px_-4px_rgba(79,70,229,0.85),inset_0_1px_0_0_rgba(255,255,255,0.3)]',
      border: 'border-indigo-400/70 light:border-indigo-500',
      text: 'text-white',
    }),
    []
  );

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

  const hierarchyContext: HierarchyContext = useMemo(
    () => ({
      course: breadcrumbItems[0]?.label || 'Course',
      topic: breadcrumbItems[1]?.label || 'Topic',
      subTopic: breadcrumbItems[2]?.label || 'Sub-Topic',
      dotPoint: breadcrumbItems[3]?.label || 'Syllabus Dot Point',
    }),
    [breadcrumbItems]
  );

  // Folded into the button's tooltip now that it has no caption slot.
  const evalCounterTitle = useMemo(() => {
    const remaining = freeEvalsRemaining();
    if (remaining === Infinity) return '';
    return remaining > 0
      ? ` — ${remaining} free evaluation${remaining === 1 ? '' : 's'} remaining today`
      : ' — daily free limit reached';
  }, [evaluationResult]);

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
      <button
        onClick={onEvaluate}
        disabled={isEvaluating || !userAnswer.trim()}
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
            isFocusMode={isFocusMode}
            onToggleFocusMode={onToggleFocusMode}
            progress={progressScore}
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
                Tip: Try switching to Gemini Flash in the AI Engine selector — it responds faster
                than Pro.
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

      {/* Whatever the Workspace decided belongs under the writing card in this
          layout — the exemplars beside a two-column workspace, and in Focus
          Mode the marking guide too, since there is no left rail to hold it. */}
      {referenceSlot && (
        <div className={`flex flex-col ${isExamMode ? 'hidden' : ''}`}>{referenceSlot}</div>
      )}

      {/* Portalled and fixed, so where it sits in this tree is immaterial. */}
      {evaluationResult && (
        <EvaluationResultModal
          isOpen={!!evaluationResult}
          onClose={geminiHandlers.resetEvaluation}
          result={evaluationResult}
          prompt={currentPrompt}
          userAnswer={evaluatedAnswer}
          onUseRevisedAnswer={setUserAnswer}
          onImproveAnswer={() =>
            geminiHandlers.improveAnswer(evaluatedAnswer, currentPrompt, evaluationResult)
          }
          isImproving={isImproving}
          improveAnswerError={improveAnswerError}
          onSaveToSamples={handleSaveUserResponse}
          onFeedbackSubmit={geminiHandlers.handleFeedbackSubmit}
          hierarchy={hierarchyContext}
        />
      )}
    </div>
  );
};

export default WorkspaceRightPanel;
