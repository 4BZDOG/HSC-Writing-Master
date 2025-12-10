
import React, { useRef, useMemo } from 'react';
import { Prompt, EvaluationResult, UserRole, HierarchyContext } from '../types';
import Editor from './Editor';
import WritingMetricsDashboard from './WritingMetricsDashboard';
import SampleAnswersAccordion from './SampleAnswersAccordion';
import EvaluationResultModal from './EvaluationResultModal';
import EvaluationProgressBar from './EvaluationProgressBar';
import { Loader2, ArrowRight, Settings, Zap } from 'lucide-react';
import { getCommandTermInfo } from '../data/commandTerms';
import { getBandConfig } from '../utils/renderUtils';

interface WorkspaceRightPanelProps {
  isFocusMode: boolean;
  editorHeight?: string;
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
}

const WorkspaceRightPanel: React.FC<WorkspaceRightPanelProps> = ({
  isFocusMode,
  editorHeight,
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
  handleDevMockImprovement
}) => {
  const editorRef = useRef<{ getText: () => string; setText: (text: string) => void; insertText: (text: string) => void }>(null);
  const evaluateButtonRef = useRef<HTMLButtonElement>(null);
  const [showTip, setShowTip] = React.useState(true);

  // Determine Tier Configuration to style the Editor border matching the Question
  const commandTermInfo = useMemo(() => getCommandTermInfo(currentPrompt.verb), [currentPrompt.verb]);
  const bandConfig = useMemo(() => getBandConfig(commandTermInfo.tier), [commandTermInfo.tier]);

  const handleAddWord = (word: string) => {
    if (editorRef.current) {
        editorRef.current.insertText(`${word} `);
    }
  };

  const handleSaveUserResponse = () => {
    if (!currentPrompt || !evaluationResult || !userAnswer) return;
    
    const newSample = {
        id: `sa-${Date.now()}`, 
        answer: userAnswer,
        band: evaluationResult.overallBand,
        mark: evaluationResult.overallMark,
        source: 'USER' as const,
        feedback: evaluationResult.overallFeedback
    };

    syllabusHandlers.handleSampleAnswerGenerated(statePath, newSample);
  };

  // Extract hierarchy for the report
  const hierarchyContext: HierarchyContext = useMemo(() => ({
      course: breadcrumbItems[0]?.label || 'Course',
      topic: breadcrumbItems[1]?.label || 'Topic',
      subTopic: breadcrumbItems[2]?.label || 'Sub-Topic',
      dotPoint: breadcrumbItems[3]?.label || 'Syllabus Dot Point'
  }), [breadcrumbItems]);

  return (
    <div className={`${isFocusMode ? 'col-span-1 max-w-5xl mx-auto w-full' : 'lg:col-span-7'} flex flex-col gap-6 h-full pt-0`}>
        
        {/* Editor Container with Tier-Specific Border */}
        <div 
            style={{ height: isFocusMode ? '70vh' : editorHeight }}
            className={`
            ${isFocusMode ? '' : 'min-h-[600px]'} resize-y
            flex flex-col bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-2xl 
            border-2 transition-all duration-500 ease-out shadow-xl overflow-hidden relative
            ${isFocusMode 
                ? `${bandConfig.border} shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] scale-[1.005] z-20` 
                : `${bandConfig.border} border-opacity-40 light:border-opacity-60 hover:border-opacity-60 light:hover:border-opacity-80`
            } 
        `}>
            {isEvaluating && <EvaluationProgressBar />}

            <Editor 
                ref={editorRef}
                value={userAnswer}
                onChange={setUserAnswer}
                onEvaluate={onEvaluate}
                onSave={onSaveDraft}
                disabled={isEvaluating}
                placeholder="Type your answer here..."
                className="flex-grow"
                keywords={currentPrompt.keywords}
                verb={currentPrompt.verb}
                isFocusMode={isFocusMode}
                onToggleFocusMode={onToggleFocusMode}
                tip={showTip && !evaluationResult && !isEvaluating ? (
                    <div className="flex items-start gap-2">
                        <span className={`${bandConfig.text}`}>💡</span>
                        <span>Focus on the verb <strong>'{currentPrompt.verb}'</strong> ({commandTermInfo.definition}).</span>
                    </div>
                ) : null}
                onCloseTip={() => setShowTip(false)}
            />
            
            <div className={`p-4 pr-8 border-t border-[rgb(var(--color-border-secondary))]/50 light:border-slate-200 bg-[rgb(var(--color-bg-surface-elevated))]/30 flex justify-end items-center gap-4`}>
                <button
                    ref={evaluateButtonRef}
                    onClick={onEvaluate}
                    disabled={isEvaluating || !userAnswer.trim()}
                    className={`
                        group relative px-8 py-3.5 rounded-xl font-bold text-base tracking-wide
                        transition-all duration-300 ease-out flex items-center gap-3
                        ${isEvaluating || !userAnswer.trim() 
                            ? 'bg-[rgb(var(--color-bg-surface-inset))] text-[rgb(var(--color-text-muted))] cursor-not-allowed border border-[rgb(var(--color-border-secondary))]' 
                            : `bg-gradient-to-r ${bandConfig.gradient} text-white shadow-lg ${bandConfig.glow} hover:-translate-y-0.5 active:translate-y-0 border border-white/10`
                        }
                    `}
                >
                    {isEvaluating ? (
                        <>
                            <Loader2 className="w-5 h-5 animate-spin opacity-80" />
                            <span>Evaluating...</span>
                        </>
                    ) : (
                        <>
                            <span className="relative z-10">Evaluate Response</span>
                            <div className={`p-1 rounded-lg bg-white/20 transition-transform group-hover:translate-x-1`}>
                                <ArrowRight className="w-4 h-4" />
                            </div>
                        </>
                    )}
                </button>
            </div>
        </div>

        <div className={`transition-all duration-500 ${isFocusMode ? 'opacity-90 hover:opacity-100' : ''}`}>
             <WritingMetricsDashboard 
                userAnswer={debouncedUserAnswer} 
                prompt={currentPrompt} 
                onAddWord={handleAddWord}
            />
        </div>

        <div className={`transition-all duration-500 ${isFocusMode ? 'opacity-90 hover:opacity-100' : ''}`}>
            <SampleAnswersAccordion 
                prompt={currentPrompt}
                onSampleAnswerGenerated={(answer) => syllabusHandlers.handleSampleAnswerGenerated(statePath, answer)}
                onUseSampleAnswer={(text) => setUserAnswer(text)}
                onDeleteSampleAnswer={(id) => syllabusHandlers.handleDeleteSampleAnswer(statePath, id)}
                onUpdateSampleAnswer={(answer) => syllabusHandlers.handleUpdateSampleAnswer(statePath, answer)}
                userRole={userRole}
            />
        </div>

        {/* Evaluation Results Area */}
        <div id="evaluation-results" className="scroll-mt-20">
            {evaluationError && (
                <div className="bg-red-900/20 border border-red-500/50 text-red-200 p-4 rounded-xl animate-fade-in">
                    <h4 className="font-bold mb-1 flex items-center gap-2">Evaluation Error</h4>
                    <p>{evaluationError}</p>
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
                    onImproveAnswer={() => geminiHandlers.improveAnswer(evaluatedAnswer, currentPrompt, evaluationResult)}
                    isImproving={isImproving}
                    improveAnswerError={improveAnswerError}
                    onSaveToSamples={handleSaveUserResponse}
                    onFeedbackSubmit={geminiHandlers.handleFeedbackSubmit}
                    hierarchy={hierarchyContext}
                />
            )}

            {/* Admin Dev Tools */}
            {userRole === 'admin' && !evaluationResult && (
                 <div className="mt-12 pt-6 border-t border-dashed border-[rgb(var(--color-border-secondary))]">
                     <div className="p-4 rounded-xl bg-[rgb(var(--color-bg-surface-inset))]/30 border border-[rgb(var(--color-border-secondary))] flex items-center justify-between">
                         <div className="flex items-center gap-2">
                            <Settings className="w-4 h-4 text-[rgb(var(--color-text-muted))]" />
                            <span className="text-xs font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-wider">Admin Dev Tools</span>
                         </div>
                         <div className="flex gap-3">
                             <button
                                onClick={handleDevMockEvaluation}
                                className="px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-bold transition-colors border border-blue-500/20"
                             >
                                 <Zap className="w-3 h-3 inline mr-1" /> Mock Eval
                             </button>
                             <button
                                onClick={handleDevMockImprovement}
                                className="px-3 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 text-xs font-bold transition-colors border border-purple-500/20"
                             >
                                 <Zap className="w-3 h-3 inline mr-1" /> Mock Improve
                             </button>
                         </div>
                     </div>
                 </div>
            )}
        </div>
    </div>
  );
};

export default WorkspaceRightPanel;
