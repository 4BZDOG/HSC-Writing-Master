import React, { useState, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { EvaluationResult, Prompt, UserFeedback, HierarchyContext } from '../types';
import EvaluationDisplay from './EvaluationDisplay';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useScrollLock } from '../hooks/useScrollLock';
import { X, FileCheck, ArrowUpCircle, Check } from 'lucide-react';
import { isFeatureLocked } from '../services/entitlements';
import { stripHtmlTags, getBandConfig } from '../utils/renderUtils';
import {
  CARD_HEADER_ICON,
  CARD_HEADER_META,
  CARD_HEADER_TITLE,
  cardHeaderWash,
} from '../utils/cardChrome';
import { presentableRewrite } from './feedback/rewriteText';
import {
  NEUTRAL_PRIMARY,
  NEXT_GROUND,
  POST_MARKING_HEADER,
  PRIMARY_ACTION,
  SECONDARY_ACTION,
} from './feedback/feedbackChrome';
import LevelKey from './feedback/LevelKey';
import { levelFrameVars, resultLevels } from '../utils/reportLevels';

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
  // The footer's note on what "Use this version" does, named by the button it
  // describes. It must be called before the early return below.
  const replacesNoteId = useId();

  // The three levels of this result (utils/reportLevels.ts). The window is the student's
  // You band: its frame, glow and header. The Improved band is the rewrite's, and the Top
  // band is only the key's indicator.
  const upgradesLocked = isFeatureLocked('answerUpgrades');
  const levels = resultLevels(prompt, result, upgradesLocked);
  const frameBand = getBandConfig(levels.you.band);
  const frameVars = levelFrameVars(levels.you.band, (levels.next ?? levels.top).band);

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
  const rewrite = presentableRewrite(result.revisedAnswer, upgradesLocked);
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
      <div
        className={`clip-stable w-full max-w-6xl min-h-[80vh] max-h-[95vh] bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-surface band-frame border-2 ${frameBand.border} flex flex-col relative animate-fade-in-up overflow-hidden`}
        style={frameVars as React.CSSProperties}
      >
        {/* The card header, in the student's own band: the same strip as the workspace
            cards, and the level key on it. The strip's ground is the You band's ink, and
            the white on it is the one pairing the cards already hold to AA. */}
        <div
          className={`${POST_MARKING_HEADER} z-20`}
          style={{ background: cardHeaderWash(levels.you.band) }}
        >
          <MeshOverlay opacity="opacity-[0.03]" />

          <div className="flex items-center gap-3 sm:gap-4 relative z-10 min-w-0 flex-1 sm:flex-none">
            <div className={`${CARD_HEADER_ICON} max-sm:hidden`} aria-hidden="true">
              <FileCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className={CARD_HEADER_TITLE}>Marking Feedback</h2>
              <div className="flex items-center gap-2 mt-1.5">
                <span className={`${CARD_HEADER_META} whitespace-nowrap`}>{prompt.verb}</span>
                <span className="w-1 h-1 rounded-full bg-white/70" aria-hidden="true"></span>
                <span className={`${CARD_HEADER_META} whitespace-nowrap`}>
                  {prompt.totalMarks} Marks
                </span>
              </div>
            </div>
          </div>

          {/* The level key sits right of the title on a desktop, and on its own line below
              `sm`: `max-sm:order-last` moves it beneath the title and the close button. */}
          <LevelKey
            you={levels.you}
            next={levels.next}
            top={levels.top}
            total={prompt.totalMarks}
            className="relative z-10 sm:ml-auto sm:mr-4 max-sm:order-last"
          />

          {/* The auto-save note collapses to its tick icon on phones so the
              close button always stays on screen. */}
          <div className="flex items-center gap-2 sm:gap-3 relative z-10 shrink-0">
            <div
              className="t-label flex items-center gap-2 p-2.5 sm:px-5 sm:py-2.5 rounded-xl bg-black/25 text-white border border-white/60"
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

            <div className="w-px h-8 bg-white/30 sm:mx-2"></div>

            <button
              onClick={onClose}
              aria-label="Close feedback"
              className="min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 flex items-center justify-center p-2.5 rounded-xl text-white hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 transition-colors"
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
        {/* One row at every width. The two actions share it, so both are one thumb's
            reach and the footer never stacks into a second band of controls.
            On a phone the note on what "Use this version" does has no row of its
            own: it is the second line of that button, and the button names it too. */}
        <div className="shrink-0 relative z-20 px-4 sm:px-8 py-3 sm:py-4 border-t border-slate-500 dark:border-white/40 bg-[rgb(var(--color-bg-surface-elevated))] flex flex-nowrap items-center justify-end gap-2 sm:gap-3">
          {canUse && (
            <p
              id={replacesNoteId}
              className="hidden sm:block t-label sm:mr-auto text-slate-600 dark:text-slate-400"
            >
              Replaces your draft.
            </p>
          )}
          <button
            onClick={onClose}
            disabled={isImproving}
            className={`${canUse ? SECONDARY_ACTION : `${PRIMARY_ACTION} ${NEUTRAL_PRIMARY}`} min-w-0 flex-1 sm:flex-none`}
          >
            Back to my response
          </button>
          {canUse && (
            <button
              onClick={handleUse}
              disabled={isImproving}
              aria-describedby={replacesNoteId}
              className={`${PRIMARY_ACTION} ${NEXT_GROUND} min-w-0 flex-1 sm:flex-none`}
            >
              <ArrowUpCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="flex flex-col items-start text-left leading-tight">
                Use this version
                <span aria-hidden="true" className="sm:hidden font-normal">
                  Replaces your draft.
                </span>
              </span>
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default EvaluationResultModal;
