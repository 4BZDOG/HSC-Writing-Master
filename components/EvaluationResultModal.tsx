
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { EvaluationResult, Prompt, UserFeedback, HierarchyContext } from '../types';
import EvaluationDisplay from './EvaluationDisplay';
import { X, Save, AlertTriangle, FileText } from 'lucide-react';

interface EvaluationResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: EvaluationResult;
  prompt: Prompt;
  userAnswer: string;
  onUseRevisedAnswer: (answer: string) => void;
  onImproveAnswer: () => void;
  isImproving: boolean;
  improveAnswerError: string | null;
  onSaveToSamples: () => void;
  onFeedbackSubmit: (feedback: UserFeedback) => void;
  hierarchy?: HierarchyContext;
}

const EvaluationResultModal: React.FC<EvaluationResultModalProps> = ({
  isOpen,
  onClose,
  result,
  prompt,
  userAnswer,
  onUseRevisedAnswer,
  onImproveAnswer,
  isImproving,
  improveAnswerError,
  onSaveToSamples,
  onFeedbackSubmit,
  hierarchy
}) => {
  const [hasSaved, setHasSaved] = useState(false);
  const [showUnsavedAlert, setShowUnsavedAlert] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Ensure we are on the client to avoid hydration/SSR errors with portals
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Body scroll locking
  useEffect(() => {
    if (isOpen && mounted) {
      setHasSaved(false);
      setShowUnsavedAlert(false);
      // Save current style to restore later (in case it wasn't 'unset')
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = 'hidden';
      
      return () => {
          document.body.style.overflow = originalStyle;
      };
    }
  }, [isOpen, result, mounted]);

  const handleSaveWrapper = () => {
      onSaveToSamples();
      setHasSaved(true);
  };

  const handleCloseRequest = () => {
    if (!hasSaved) {
        setShowUnsavedAlert(true);
    } else {
        onClose();
    }
  };

  const confirmDiscard = () => {
      setShowUnsavedAlert(false);
      onClose();
  };

  // Safe guard: ensure document exists and component is mounted to prevent React Error #299
  if (!isOpen || !mounted || typeof document === 'undefined' || !document.body) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
       <div className="w-full max-w-6xl min-h-[80vh] max-h-[95vh] bg-[rgb(var(--color-bg-surface))] rounded-3xl shadow-2xl border border-[rgb(var(--color-border-secondary))] flex flex-col relative animate-fade-in-up overflow-hidden">
           
           <div className="px-6 py-4 border-b border-[rgb(var(--color-border-secondary))] bg-[rgb(var(--color-bg-surface-elevated))] flex justify-between items-center shrink-0 z-20">
               <div className="flex items-center gap-3">
                   <div className="p-2 rounded-lg bg-[rgb(var(--color-primary))]/10 text-[rgb(var(--color-primary))]">
                       <FileText className="w-5 h-5" />
                   </div>
                   <div>
                       <h2 className="font-bold text-[rgb(var(--color-text-primary))]">Evaluation Report</h2>
                       <p className="text-xs text-[rgb(var(--color-text-muted))]">{prompt.verb} • {prompt.totalMarks} Marks</p>
                   </div>
               </div>

               <div className="flex items-center gap-3">
                   {!hasSaved ? (
                        <button 
                            onClick={handleSaveWrapper}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all font-bold text-xs hover:scale-105"
                        >
                            <Save className="w-4 h-4" /> Save Result
                        </button>
                   ) : (
                       <span className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[rgb(var(--color-bg-surface-inset))] text-emerald-500 text-xs font-bold border border-emerald-500/20">
                           <Save className="w-4 h-4" /> Saved
                       </span>
                   )}

                   <div className="w-px h-6 bg-[rgb(var(--color-border-secondary))] mx-1"></div>

                   <button 
                        onClick={handleCloseRequest}
                        className="p-2 rounded-xl hover:bg-[rgb(var(--color-bg-surface-inset))] text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-primary))] transition-colors"
                        title="Close"
                   >
                       <X className="w-5 h-5" />
                   </button>
               </div>
           </div>

           <div className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar bg-[rgb(var(--color-bg-base))]/50">
                <EvaluationDisplay 
                    result={result} 
                    prompt={prompt}
                    userAnswer={userAnswer}
                    onUseRevisedAnswer={onUseRevisedAnswer}
                    onImproveAnswer={onImproveAnswer}
                    isImproving={isImproving}
                    improveAnswerError={improveAnswerError}
                    onSaveToSamples={!hasSaved ? handleSaveWrapper : undefined}
                    onFeedbackSubmit={onFeedbackSubmit}
                    hierarchy={hierarchy}
                />
           </div>

           {showUnsavedAlert && (
               <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center animate-fade-in">
                   <div className="bg-[rgb(var(--color-bg-surface-elevated))] p-8 rounded-2xl border border-amber-500/30 shadow-2xl max-w-md w-full mx-4 text-center transform scale-100 transition-all">
                       <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-6 text-amber-400 border border-amber-500/20">
                           <AlertTriangle className="w-8 h-8" />
                       </div>
                       <h3 className="text-xl font-bold text-white mb-2">Unsaved Evaluation</h3>
                       <p className="text-sm text-[rgb(var(--color-text-secondary))] mb-8 leading-relaxed">
                           You haven't saved this result to your Sample Answers. If you close now, this feedback and the generated exemplar will be discarded.
                       </p>
                       <div className="flex flex-col sm:flex-row gap-3 justify-center">
                           <button 
                            onClick={() => setShowUnsavedAlert(false)}
                            className="px-6 py-3 rounded-xl bg-[rgb(var(--color-bg-surface-light))] hover:bg-[rgb(var(--color-border-secondary))] text-sm font-bold text-[rgb(var(--color-text-secondary))] transition-colors"
                           >
                               Go Back
                           </button>
                            <button 
                            onClick={handleSaveWrapper}
                            className="px-6 py-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 text-sm font-bold transition-colors"
                           >
                               Save & Close
                           </button>
                           <button 
                            onClick={confirmDiscard}
                            className="px-6 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-sm font-bold transition-colors"
                           >
                               Discard
                           </button>
                       </div>
                   </div>
               </div>
           )}

       </div>
    </div>,
    document.body
  );
};

export default EvaluationResultModal;
