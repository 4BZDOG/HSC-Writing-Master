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
  /** Sample Answers card — supplied only in Focus Mode (see below). */
  sampleAnswersSlot?: React.ReactNode;
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
  sampleAnswersSlot,
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
  const buttonConfig = useMemo(
    () => ({
      gradient: 'from-indigo-600 to-indigo-500',
      shadow: 'shadow-indigo-900/40',
      border: 'border-white/20',
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

  const evalCounterDisplay = useMemo(() => {
    const remaining = freeEvalsRemaining();
    return remaining < Infinity ? (
      <p className="text-[10px] font-medium text-[rgb(var(--color-text-muted))] light:text-slate-400 mt-1.5 text-center">
        {remaining > 0
          ? `${remaining} free evaluation${remaining === 1 ? '' : 's'} remaining today`
          : 'Daily free limit reached'}
      </p>
    ) : null;
  }, [evaluationResult]);

  const evaluateAction = (
    <div className="flex flex-col items-end">
      <button
        onClick={onEvaluate}
        disabled={isEvaluating || !userAnswer.trim()}
        title={
          isEvaluating
            ? 'Evaluating your response…'
            : !userAnswer.trim()
              ? 'Write a response first, then evaluate'
              : 'Evaluate your response (Ctrl / ⌘ + Enter)'
        }
        className={`
          group px-6 py-3.5 sm:px-10 sm:py-5 rounded-[24px] font-black text-base sm:text-xl tracking-tight
          transition-all duration-500 flex items-center gap-3 sm:gap-4
          ${
            isEvaluating
              ? 'bg-slate-800 light:bg-slate-200 text-slate-400 cursor-wait border border-white/5 light:border-slate-300 shadow-lg'
              : !userAnswer.trim()
                ? 'bg-slate-800/60 light:bg-slate-200/80 text-slate-500 cursor-not-allowed border border-white/5 light:border-slate-300 opacity-30 shadow-none'
                : `bg-gradient-to-r ${buttonConfig.gradient} shadow-xl ${buttonConfig.shadow} hover:shadow-2xl hover:scale-105 active:scale-[0.97] border ${buttonConfig.border} ring-1 ring-white/10 hover:ring-white/25`
          }
        `}
      >
        {isEvaluating ? (
          <>
            <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin text-white/60" />
            <span className="text-slate-400 drop-shadow-sm">Evaluating</span>
          </>
        ) : (
          <>
            {/* No pulse at "high progress" — a length-and-keyword score
                must not be dressed up as a quality signal. */}
            <Sparkles
              className={`w-5 h-5 sm:w-6 sm:h-6 transition-all duration-300 ${
                userAnswer.trim()
                  ? 'text-white/80 group-hover:text-white group-hover:rotate-12 group-hover:scale-110'
                  : 'text-white/30'
              }`}
            />
            <span className={`${buttonConfig.text} drop-shadow-sm`}>Evaluate</span>
            {userAnswer.trim() && !isEvaluating && (
              <kbd className="hidden sm:inline text-[9px] font-bold bg-white/15 border border-white/10 rounded-md px-1.5 py-0.5 tracking-normal ml-1 opacity-60 group-hover:opacity-100 transition-opacity">
                ⌘↵
              </kbd>
            )}
          </>
        )}
      </button>
      {evalCounterDisplay}
    </div>
  );

  return (
    <div
      className={`${
        isFocusMode
          ? 'col-span-1 max-w-5xl mx-auto w-full'
          : isExamMode
            ? // Exam Mode hides the whole left reference rail, so the writing
              // column takes the width the rail is no longer using.
              'lg:col-span-8 lg:col-start-5 lg:row-start-1 lg:row-span-2'
            : 'lg:col-span-7 lg:col-start-6 lg:row-start-1 lg:row-span-2'
      } flex flex-col gap-6 pt-0 self-start`}
    >
      {/* `self-start` on the column and no flex-1 here: this panel shares a
          grid row-span with the reference rail, and stretching to match a rail
          that is now much taller opened a void between the writing card and
          everything below it. */}
      <div className="relative group flex flex-col">
        <div className="flex flex-col relative transition-all duration-700 shadow-2xl rounded-[32px]">
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
          />
        </div>
      </div>

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

      {/* Outside Focus Mode the exemplars live in the left rail under the
          Marking Guide; in Focus Mode there is no left rail, so they are
          injected here — folded shut — to stay within reach. */}
      {sampleAnswersSlot && <div className={isExamMode ? 'hidden' : ''}>{sampleAnswersSlot}</div>}

      <div id="evaluation-results" className="scroll-mt-24">
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
    </div>
  );
};

export default WorkspaceRightPanel;
