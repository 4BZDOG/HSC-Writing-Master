import React, { useRef, useMemo } from 'react';
import { Prompt, EvaluationResult, UserRole, HierarchyContext } from '../types';
import Editor from './Editor';
import WritingMetricsDashboard from './WritingMetricsDashboard';
import SampleAnswersAccordion from './SampleAnswersAccordion';
import EvaluationResultModal from './EvaluationResultModal';
import EvaluationProgressBar from './EvaluationProgressBar';
import { Loader2, Settings, AlertTriangle, Sparkles } from 'lucide-react';
import { getCommandTermInfo, BAND_METRICS, TIER_GROUPS } from '../data/commandTerms';
import { getBandConfig, getKeywordVariants, escapeRegExp } from '../utils/renderUtils';

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
  syllabusHandlers: any;
  statePath: any;
  userRole: UserRole;
  breadcrumbItems: { label: string }[];
  handleRunQualityCheck: (content: string, type: 'question' | 'code') => void;
  onToggleFocusMode: () => void;
  handleDevMockEvaluation: () => void;
  handleDevMockImprovement: () => void;
  promptFontSize: number;
  onHeaderResize?: (height: number) => void;
  minHeaderHeight?: number;
  minEditorHeight?: number;
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
  handleDevMockEvaluation,
  handleDevMockImprovement,
  promptFontSize,
  onHeaderResize,
  minHeaderHeight,
  minEditorHeight,
}) => {
  const editorRef = useRef<{
    getText: () => string;
    setText: (text: string) => void;
    insertText: (text: string) => void;
  }>(null);

  const commandTermInfo = useMemo(
    () => getCommandTermInfo(currentPrompt.verb),
    [currentPrompt.verb]
  );

  // Calculate Max Band for this specific prompt based on its Tier
  const maxBand = useMemo(() => {
    const tierGroup = TIER_GROUPS.find((g) => g.tier === commandTermInfo.tier);
    return tierGroup ? tierGroup.maxBand : 6;
  }, [commandTermInfo.tier]);

  // Unified progression score for the entire workspace
  const progressScore = useMemo(() => {
    if (!currentPrompt) return 0;

    const wordCount = debouncedUserAnswer.trim().split(/\s+/).filter(Boolean).length;
    // Use metrics target for the Max Band of this prompt
    const targetMetric = BAND_METRICS.find((b) => b.band === maxBand) || BAND_METRICS[0];
    const targetCount = Math.ceil(currentPrompt.totalMarks * targetMetric.wordCountMultiplier.min);

    // Allow progression to go slightly over 1.0 for "Exemplar" feel
    const wordProg = Math.min(1.1, wordCount / targetCount);

    const keywords = currentPrompt.keywords || [];
    let keyProg = 0;
    if (keywords.length > 0) {
      const used = keywords.filter((kw) => {
        const variants = getKeywordVariants(kw);
        return variants.some((v) =>
          new RegExp(`\\b${escapeRegExp(v)}\\b`, 'i').test(debouncedUserAnswer.toLowerCase())
        );
      });
      keyProg = used.length / keywords.length;
    } else {
      keyProg = Math.min(1, wordProg);
    }

    // Weighted score: 60% volume, 40% keywords
    return wordProg * 0.6 + keyProg * 0.4;
  }, [debouncedUserAnswer, currentPrompt, commandTermInfo, maxBand]);

  // Dynamic Action Button Theme - Using shared getBandConfig for perfect consistency
  const buttonConfig = useMemo(() => {
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
  }, [progressScore, maxBand]);

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

  return (
    <div
      className={`${isFocusMode ? 'col-span-1 max-w-5xl mx-auto w-full' : 'lg:col-span-7'} flex flex-col gap-6 h-full pt-0 pb-20`}
    >
      <div className="relative group">
        <div className="flex flex-col relative transition-all duration-700 shadow-2xl rounded-[32px]">
          <div className="absolute inset-0 z-[30] pointer-events-none rounded-[32px] overflow-hidden">
            {isEvaluating && <EvaluationProgressBar />}
          </div>

          <Editor
            ref={editorRef}
            value={userAnswer}
            onChange={setUserAnswer}
            onEvaluate={onEvaluate}
            onSave={onSaveDraft}
            disabled={isEvaluating}
            placeholder="Draft your response. Remember to use causal connectors (e.g., 'Consequently') for higher-band marks..."
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
          />

          {/* The "Haptic" Action Bar */}
          <div className="absolute bottom-12 right-12 z-20">
            <button
              onClick={onEvaluate}
              disabled={isEvaluating || !userAnswer.trim()}
              className={`
                            group px-10 py-5 rounded-[24px] font-black text-xl tracking-tight
                            transition-all duration-500 flex items-center gap-4
                            ${
                              isEvaluating || !userAnswer.trim()
                                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5 opacity-50 shadow-none'
                                : `bg-gradient-to-r ${buttonConfig.gradient} ${buttonConfig.shadow} hover:shadow-2xl active:scale-95 border ${buttonConfig.border}`
                            }
                        `}
            >
              {isEvaluating ? (
                <Loader2 className="w-6 h-6 animate-spin text-white/50" />
              ) : (
                <>
                  <Sparkles
                    className={`w-6 h-6 ${progressScore > 0.85 ? 'text-white/90 animate-pulse' : 'text-white/70'}`}
                  />
                  <span className={`${buttonConfig.text} drop-shadow-sm`}>Evaluate</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <WritingMetricsDashboard
        userAnswer={debouncedUserAnswer}
        prompt={currentPrompt}
        onAddWord={(word) => {
          const event = new CustomEvent('insert-text', { detail: word });
          window.dispatchEvent(event);
        }}
      />

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
        userRole={userRole}
        onRecalibrate={() => geminiHandlers.recalibrateSamples(currentPrompt)}
      />

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

        {userRole === 'admin' && !evaluationResult && (
          <div className="mt-12 p-6 rounded-[32px] bg-[rgb(var(--color-bg-surface-inset))]/30 border border-dashed border-[rgb(var(--color-border-secondary))] flex items-center justify-between opacity-40 hover:opacity-100 transition-all duration-500">
            <div className="flex items-center gap-4">
              <div className="p-2.5 rounded-xl bg-black/40">
                <Settings className="w-5 h-5 text-slate-500" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
                Simulation Environment
              </span>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleDevMockEvaluation}
                className="px-5 py-2.5 rounded-xl bg-blue-500/10 text-blue-400 text-[10px] font-black border border-blue-500/20 hover:bg-blue-500 hover:text-white transition-all shadow-xl"
              >
                Mock Analytics
              </button>
              <button
                onClick={handleDevMockImprovement}
                className="px-5 py-2.5 rounded-xl bg-purple-500/10 text-purple-400 text-[10px] font-black border border-blue-500/20 hover:bg-purple-500 hover:text-white transition-all shadow-xl"
              >
                Mock Upgrade
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkspaceRightPanel;
