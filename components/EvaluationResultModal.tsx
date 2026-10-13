import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { EvaluationResult, Prompt, UserFeedback, HierarchyContext } from '../types';
import EvaluationDisplay from './EvaluationDisplay';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useScrollLock } from '../hooks/useScrollLock';
import { X, FileCheck, ArrowUpCircle, Check } from 'lucide-react';
import { isFeatureLocked } from '../services/entitlements';
import { stripHtmlTags } from '../utils/renderUtils';
import { ladderBandVars } from './LadderRow';
import { presentableRewrite } from './feedback/rewriteText';
import { BAND_GROUND, PRIMARY_ACTION, SECONDARY_ACTION } from './feedback/feedbackChrome';

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

  // The rewrite the footer would put in the draft, read the same way the report reads it,
  // so the button is offered exactly when the report shows a rewrite to use.
  const rewrite = presentableRewrite(result.revisedAnswer, isFeatureLocked('answerUpgrades'));
  const canUse = !!rewrite.text && result.overallMark < prompt.totalMarks;

  // Taking the rewrite is leaving the feedback, not a toast on top of it: the draft is
  // replaced and the report closes, so the student is back at their own response.
  const handleUse = () => {
    onUseRevisedAnswer(stripHtmlTags(rewrite.text));
    onClose();
  };

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Marking result"
      className="fixed inset-0 z-modal bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="clip-stable w-full max-w-6xl min-h-[80vh] max-h-[95vh] bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-surface shadow-lg border border-white/10 light:border-slate-300 flex flex-col relative animate-fade-in-up overflow-hidden">
        <div className="px-4 sm:px-8 py-4 sm:py-5 border-b border-white/10 light:border-slate-300 bg-[rgb(var(--color-bg-surface-elevated))] flex justify-between items-center gap-3 shrink-0 z-20 relative overflow-hidden">
          <MeshOverlay opacity="opacity-[0.03]" />

          <div className="flex items-center gap-3 sm:gap-4 relative z-10 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-2xl bg-indigo-500/10 light:bg-indigo-100 flex items-center justify-center border border-indigo-500/20 light:border-indigo-200 text-indigo-400 light:text-indigo-600 shadow-inner">
              <FileCheck className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-black text-[rgb(var(--color-text-primary))] light:text-slate-900 tracking-normal italic leading-none whitespace-nowrap">
                Marking Feedback
              </h2>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="t-label text-[rgb(var(--color-text-muted))] light:text-slate-500 whitespace-nowrap">
                  {prompt.verb}
                </span>
                <span className="w-1 h-1 rounded-full bg-white/20 light:bg-slate-300"></span>
                <span className="t-label text-[rgb(var(--color-text-muted))] light:text-slate-500 whitespace-nowrap">
                  {prompt.totalMarks} Marks
                </span>
              </div>
            </div>
          </div>

          {/* The auto-save note collapses to its tick icon on phones so the
              close button always stays on screen. */}
          <div className="flex items-center gap-2 sm:gap-3 relative z-10 shrink-0">
            <div
              className="t-label flex items-center gap-2 p-2.5 sm:px-5 sm:py-2.5 rounded-xl bg-emerald-500/10 light:bg-emerald-50 text-emerald-500 light:text-emerald-700 border border-emerald-500/20 light:border-emerald-200"
              title="This marked response has been auto-saved to your library"
            >
              <Check className="w-4 h-4" />
              <span className="hidden md:inline whitespace-nowrap">Auto-Saved to Library</span>
              {/* A `title` on a div is not an accessible name — the element has
                  no role to carry one — so below `md` this note collapsed to a
                  tick that said nothing at all to a screen reader. The text
                  stays readable there; only its pixels are given up. */}
              <span className="md:hidden sr-only">Auto-saved to your library</span>
            </div>

            <div className="w-px h-8 bg-white/10 light:bg-slate-300 sm:mx-2"></div>

            <button
              onClick={onClose}
              aria-label="Close feedback"
              className="min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 flex items-center justify-center p-2.5 rounded-xl hover:bg-[rgb(var(--color-bg-surface-inset))] light:hover:bg-slate-200 text-[rgb(var(--color-text-muted))] light:text-slate-500 hover:text-[rgb(var(--color-text-primary))] light:hover:text-slate-900 transition-colors"
              title="Close Feedback"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* The desk this modal's cards sit on. The report's cards are paper
            (`bg-surface`) with an edge, so the ground under them is the page's own
            base token: in light it is the cool grey the paper lifts off, and in
            dark the `/50` lets the surface beneath warm it. */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6 sm:p-10 custom-scrollbar bg-[rgb(var(--color-bg-base))]/50 light:bg-[rgb(var(--color-bg-base))]">
          <EvaluationDisplay
            result={result}
            prompt={prompt}
            userAnswer={userAnswer}
            onImproveAnswer={onImproveAnswer}
            onCompareImprovement={onCompareImprovement}
            isImproving={isImproving}
            improveAnswerError={improveAnswerError}
            onSaveToSamples={undefined}
            onFeedbackSubmit={onFeedbackSubmit}
            hierarchy={hierarchy}
          />
        </div>

        {/* The way out. It sits outside the scrolling desk, so it is there at every
            point in the report and not only at its end. "Use this version" is the
            primary action when there is a rewrite to use; without one, going back is. */}
        <div className="shrink-0 relative z-20 px-4 sm:px-8 py-3 sm:py-4 border-t border-slate-300 dark:border-white/10 bg-[rgb(var(--color-bg-surface-elevated))] flex flex-wrap items-center justify-end gap-3">
          {canUse && (
            <p className="t-label w-full sm:w-auto sm:mr-auto text-slate-600 dark:text-slate-400">
              Replaces your draft.
            </p>
          )}
          {/* On a phone the two actions share the row, so both are one thumb's reach. */}
          <button
            onClick={onClose}
            disabled={isImproving}
            className={`${canUse ? SECONDARY_ACTION : `${PRIMARY_ACTION} ${BAND_GROUND}`} flex-1 sm:flex-none`}
            style={canUse ? undefined : ladderBandVars(result.overallBand)}
          >
            Back to my response
          </button>
          {canUse && (
            <button
              onClick={handleUse}
              disabled={isImproving}
              className={`${PRIMARY_ACTION} ${BAND_GROUND} flex-1 sm:flex-none`}
              style={ladderBandVars(result.overallBand)}
            >
              <ArrowUpCircle className="w-4 h-4" aria-hidden="true" />
              Use this version
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default EvaluationResultModal;
