import React, { useRef, useMemo } from 'react';
import { Prompt, EvaluationResult, UserRole, HierarchyContext, WritingMode } from '../types';
import Editor from './Editor';
import WritingMetricsDashboard from './WritingMetricsDashboard';
import SampleAnswersAccordion from './SampleAnswersAccordion';
import EvaluationResultModal from './EvaluationResultModal';
import EvaluationProgressBar from './EvaluationProgressBar';
import { Loader2, AlertTriangle, Sparkles } from 'lucide-react';
import { getCommandTermInfo, getTargetBand, BAND_METRICS } from '../data/commandTerms';
import { getBandConfig, textContainsKeyword } from '../utils/renderUtils';
import { isCurriculumRemote } from '../services/curriculumService';
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
  userRole: UserRole;
  breadcrumbItems: { label: string }[];
  handleRunQualityCheck: (content: string, type: 'question' | 'code') => void;
  onToggleFocusMode: () => void;
  promptFontSize: number;
  onHeaderResize?: (height: number) => void;
  minHeaderHeight?: number;
  minEditorHeight?: number;
  writingMode: WritingMode;
  onWritingModeChange: (mode: WritingMode) => void;
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
  userRole,
  breadcrumbItems,
  onToggleFocusMode,
  promptFontSize,
  onHeaderResize,
  minHeaderHeight,
  minEditorHeight,
  writingMode,
  onWritingModeChange,
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

  // The band this prompt actually works toward — constrained by BOTH its
  // verb's tier and its mark value (getTargetBand applies the marks cap), so
  // an off-scheme question like a 3-mark Tier-4 targets Band 4, not Band 5,
  // and the editor copy/word targets agree with the placard and marking guide.
  const maxBand = useMemo(
    () => getTargetBand(currentPrompt.totalMarks, commandTermInfo.tier),
    [currentPrompt.totalMarks, commandTermInfo.tier]
  );

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

  // Dynamic Action Button Theme - Using shared getBandConfig for perfect consistency
  const buttonConfig = useMemo(() => {
    // Exam Mode: a neutral submit button — its colour must not hint at the
    // predicted band while the student is still writing under exam conditions.
    if (isExamMode) {
      return {
        gradient: 'from-slate-700 to-slate-600',
        shadow: 'shadow-slate-900/40',
        border: 'border-white/10',
        text: 'text-white',
      };
    }

    // Base state (below Band 1 threshold)
    if (progressScore < 0.15) {
      return {
        gradient: 'from-slate-600 to-slate-500',
        shadow: 'shadow-slate-900/40',
        border: 'border-white/5',
        text: 'text-slate-200',
      };
    }

    // Determine target band color based on progression relative to maxBand
    // 0.15 - 0.35: Band 1/2
    // 0.35 - 0.55: Band 3
    // 0.55 - 0.75: Band 4
    // 0.75 - 0.90: Band 5
    // 0.90+: Band 6 (if allowed by maxBand)

    let predictedBand = 1;
    if (progressScore >= 0.9) predictedBand = 6;
    else if (progressScore >= 0.75) predictedBand = 5;
    else if (progressScore >= 0.55) predictedBand = 4;
    else if (progressScore >= 0.35) predictedBand = 3;
    else if (progressScore >= 0.15) predictedBand = 2;

    // Cap at maxBand possible for this question type
    predictedBand = Math.min(predictedBand, maxBand);

    const config = getBandConfig(predictedBand);

    return {
      gradient: config.gradient,
      shadow: config.glow,
      border: config.border.replace('border-', 'border-').replace('/50', '/30'), // Slight adjustment for button context
      text: 'text-white',
    };
  }, [progressScore, maxBand, isExamMode]);

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

  return (
    <div
      className={`${isFocusMode ? 'col-span-1 max-w-5xl mx-auto w-full' : 'lg:col-span-7 lg:col-start-6 lg:row-start-1 lg:row-span-2'} flex flex-col gap-6 h-full pt-0`}
    >
      <div className="relative group">
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
            maxBand={maxBand}
            onHeaderResize={onHeaderResize}
            minHeaderHeight={minHeaderHeight}
            minTotalHeight={minEditorHeight}
            writingMode={writingMode}
            onWritingModeChange={onWritingModeChange}
          />

          {/* The "Haptic" Action Bar — on phones it sits higher (inside the
              textarea's reserved bottom padding) and smaller so it never
              covers the chars/words footer, which wraps taller there. */}
          <div className="absolute bottom-24 right-4 sm:bottom-12 sm:right-12 z-20">
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
                              isEvaluating || !userAnswer.trim()
                                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5 opacity-50 shadow-none'
                                : `bg-gradient-to-r ${buttonConfig.gradient} shadow-xl ${buttonConfig.shadow} hover:shadow-2xl active:scale-95 border ${buttonConfig.border}`
                            }
                        `}
            >
              {isEvaluating ? (
                <Loader2 className="w-6 h-6 animate-spin text-white/50" />
              ) : (
                <>
                  <Sparkles
                    className={`w-6 h-6 ${!isExamMode && progressScore > 0.85 ? 'text-white/90 animate-pulse' : 'text-white/70'}`}
                  />
                  <span className={`${buttonConfig.text} drop-shadow-sm`}>Evaluate</span>
                </>
              )}
            </button>
            {evalCounterDisplay}
          </div>
        </div>
      </div>

      <WritingMetricsDashboard
        userAnswer={debouncedUserAnswer}
        prompt={currentPrompt}
        writingMode={writingMode}
        onAddWord={(word) => {
          const event = new CustomEvent('insert-text', { detail: word });
          window.dispatchEvent(event);
        }}
      />

      <div className={isExamMode ? 'hidden' : ''}>
        <SampleAnswersAccordion
          prompt={currentPrompt}
          onSampleAnswerGenerated={(answer) =>
            syllabusHandlers.handleSampleAnswerGenerated(statePath, answer)
          }
          onUseSampleAnswer={(text) => setUserAnswer(text)}
          onDeleteSampleAnswer={(id) => syllabusHandlers.handleDeleteSampleAnswer(statePath, id)}
          onUpdateSampleAnswer={(answer) =>
            syllabusHandlers.handleUpdateSampleAnswer(statePath, answer)
          }
          onContributeSampleAnswer={
            isCurriculumRemote() && userRole !== 'guest'
              ? (answer) => syllabusHandlers.handleContributeSampleAnswer(statePath, answer)
              : undefined
          }
          userRole={userRole}
          onRecalibrate={() => geminiHandlers.recalibrateSamples(currentPrompt)}
        />
      </div>

      <div id="evaluation-results" className="scroll-mt-24">
        {evaluationError && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-8 rounded-[40px] animate-fade-in flex items-start gap-5 shadow-2xl shadow-red-900/10 backdrop-blur-xl">
            <div className="p-3 rounded-2xl bg-red-500/20">
              <AlertTriangle className="w-6 h-6 shrink-0" />
            </div>
            <div>
              <h4 className="font-black uppercase tracking-[0.2em] text-xs mb-2">
                System Interruption
              </h4>
              <p className="text-sm font-bold leading-relaxed">{evaluationError}</p>
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
