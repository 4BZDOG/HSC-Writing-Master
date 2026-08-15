import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { EvaluationResult, Prompt, UserFeedback, HierarchyContext } from '../types';
import EvaluationDisplay from './EvaluationDisplay';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useScrollLock } from '../hooks/useScrollLock';
import { X, Save, AlertTriangle, FileCheck, ArrowLeft, Check } from 'lucide-react';

interface EvaluationResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: EvaluationResult;
  prompt: Prompt;
  userAnswer: string;
  onUseRevisedAnswer: (answer: string) => void;
  onImproveAnswer: () => void;
  /** Open the side-by-side diff. Absent until an improvement has been made. */
  onCompareImprovement?: () => void;
  isImproving: boolean;
  improveAnswerError: string | null;
  onSaveToSamples: () => void;
  onFeedbackSubmit: (feedback: UserFeedback) => void;
  hierarchy?: HierarchyContext;
}

const MeshOverlay = ({ opacity = 'opacity-[0.05]' }: { opacity?: string }) => (
  <div
    className={`absolute inset-0 ${opacity} pointer-events-none mix-blend-overlay z-0 transition-opacity duration-500`}
    style={{
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 12 12' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v12M0 1h12' stroke='%23ffffff' stroke-width='0.5' fill='none'/%3E%3C/svg%3E")`,
    }}
  />
);

const EvaluationResultModal: React.FC<EvaluationResultModalProps> = ({
  isOpen,
  onClose,
  result,
  prompt,
  userAnswer,
  onUseRevisedAnswer,
  onImproveAnswer,
  onCompareImprovement,
  isImproving,
  improveAnswerError,
  onSaveToSamples,
  onFeedbackSubmit,
  hierarchy,
}) => {
  const [mounted, setMounted] = useState(false);

  // Escape closes the feedback like every other modal surface — but never
  // mid-improvement, so the regeneration can't be abandoned half-rendered.
  useEscapeKey(isOpen && !isImproving, onClose);
  useScrollLock(isOpen);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (isOpen && mounted) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = 'hidden';

      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [isOpen, result, mounted]);
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);

  if (!isOpen || !mounted || typeof document === 'undefined' || !document.body) return null;

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Marking result"
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="clip-stable w-full max-w-6xl min-h-[80vh] max-h-[95vh] bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-[32px] shadow-2xl border border-white/10 light:border-slate-300 flex flex-col relative animate-fade-in-up overflow-hidden">
        <div className="px-4 sm:px-8 py-4 sm:py-5 border-b border-white/10 light:border-slate-200 bg-[rgb(var(--color-bg-surface-elevated))] light:bg-slate-50 flex justify-between items-center gap-3 shrink-0 z-20 relative overflow-hidden">
          <MeshOverlay opacity="opacity-[0.03]" />

          <div className="flex items-center gap-3 sm:gap-4 relative z-10 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-2xl bg-indigo-500/10 light:bg-indigo-100 flex items-center justify-center border border-indigo-500/20 light:border-indigo-200 text-indigo-400 light:text-indigo-600 shadow-inner">
              <FileCheck className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-black text-[rgb(var(--color-text-primary))] light:text-slate-900 tracking-tight uppercase italic leading-none whitespace-nowrap">
                Marking Feedback
              </h2>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[rgb(var(--color-text-muted))] light:text-slate-500 whitespace-nowrap">
                  {prompt.verb}
                </span>
                <span className="w-1 h-1 rounded-full bg-white/20 light:bg-slate-300"></span>
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[rgb(var(--color-text-muted))] light:text-slate-500 whitespace-nowrap">
                  {prompt.totalMarks} Marks
                </span>
              </div>
            </div>
          </div>

          {/* The auto-save note collapses to its tick icon on phones so the
              close button always stays on screen. */}
          <div className="flex items-center gap-2 sm:gap-3 relative z-10 shrink-0">
            <div
              className="flex items-center gap-2 p-2.5 sm:px-5 sm:py-2.5 rounded-xl bg-emerald-500/10 light:bg-emerald-50 text-emerald-500 light:text-emerald-700 text-xs font-bold uppercase tracking-wider border border-emerald-500/20 light:border-emerald-200"
              title="This marked response has been auto-saved to your library"
            >
              <Check className="w-4 h-4" />
              <span className="hidden md:inline whitespace-nowrap">Auto-Saved to Library</span>
            </div>

            <div className="w-px h-8 bg-white/10 light:bg-slate-300 sm:mx-2"></div>

            <button
              onClick={onClose}
              aria-label="Close feedback"
              className="p-2.5 rounded-xl hover:bg-[rgb(var(--color-bg-surface-inset))] light:hover:bg-slate-200 text-[rgb(var(--color-text-muted))] light:text-slate-500 hover:text-[rgb(var(--color-text-primary))] light:hover:text-slate-900 transition-colors"
              title="Close Feedback"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 sm:p-10 custom-scrollbar bg-[rgb(var(--color-bg-base))]/50 light:bg-slate-50">
          <EvaluationDisplay
            result={result}
            prompt={prompt}
            userAnswer={userAnswer}
            onUseRevisedAnswer={onUseRevisedAnswer}
            onImproveAnswer={onImproveAnswer}
            onCompareImprovement={onCompareImprovement}
            isImproving={isImproving}
            improveAnswerError={improveAnswerError}
            onSaveToSamples={undefined}
            onFeedbackSubmit={onFeedbackSubmit}
            hierarchy={hierarchy}
          />
        </div>
      </div>
    </div>,
    document.body
  );
};

export default EvaluationResultModal;
