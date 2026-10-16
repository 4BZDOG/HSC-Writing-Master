import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Flag, CheckCircle2, X } from 'lucide-react';
import { ContentFlag } from '../types';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useBackdropDismiss } from '../hooks/useBackdropDismiss';

interface FlagContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** What is being flagged — used in copy ("question", "sample answer"). */
  itemLabel: string;
  /** Existing flag on the item, if any (drives the review/resolve view). */
  existingFlag?: ContentFlag;
  /** Raise a new flag with the given reason. */
  onFlag: (reason: string) => void;
  /** Clear the existing flag (mark the report resolved). */
  onResolve: () => void;
}

/** The longest report the box takes. A reason is a sentence or two; the cap is
 *  there so a pasted page cannot ride along on the question into every export. */
const MAX_REASON_LENGTH = 500;

/**
 * Starting points for the report. Each one is what a curator has actually had to
 * fix on a question, and pressing one only types its opening words into the box,
 * so what is stored is still the reporter's own sentence.
 */
const REASON_STARTERS = [
  'The marks don’t add up',
  'A fact looks wrong',
  'The wording is unclear',
  'The command verb doesn’t fit',
] as const;

const FIELD_ID = 'flag-reason';

/**
 * Lightweight "this content looks off" report dialog. Anyone can raise a
 * flag; the reason is stored on the item itself (see ContentFlag in types.ts)
 * so it travels with exports/sync and surfaces in the admin Content Audit
 * Studio's Flagged filter for later human or AI review.
 */
const FlagContentModal: React.FC<FlagContentModalProps> = ({
  isOpen,
  onClose,
  itemLabel,
  existingFlag,
  onFlag,
  onResolve,
}) => {
  const [reason, setReason] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEscapeKey(isOpen, onClose);
  // Tab stays inside the dialog while it is open, and focus returns to the
  // button that opened it on close.
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);
  useScrollLock(isOpen);
  const backdrop = useBackdropDismiss(onClose);
  useEffect(() => {
    if (isOpen) setReason('');
  }, [isOpen]);

  if (!isOpen) return null;

  const hasOpenFlag = existingFlag?.status === 'open';

  const submit = () => {
    const trimmed = reason.trim();
    if (!trimmed) return;
    onFlag(trimmed);
    onClose();
  };

  // A starter goes at the end of what is already typed, on its own line, and the
  // caret lands after it so the reporter finishes the sentence.
  const addStarter = (starter: string) => {
    setReason((current) => {
      const next = current.trim() ? `${current.trimEnd()}\n${starter}: ` : `${starter}: `;
      return next.slice(0, MAX_REASON_LENGTH);
    });
    // Focus after the state lands, so the caret is at the end of the new text.
    requestAnimationFrame(() => {
      const box = textareaRef.current;
      if (!box) return;
      box.focus();
      box.setSelectionRange(box.value.length, box.value.length);
    });
  };

  // Portalled for the same reason as ConfirmationModal: this is opened from
  // inside `clip-stable` cards (the question card, the exemplars panel), whose
  // transform would otherwise make the "fixed" backdrop a child-of-card.
  if (typeof document === 'undefined' || !document.body) return null;

  const title = hasOpenFlag ? `This ${itemLabel} is flagged` : `Flag this ${itemLabel}`;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-critical p-4"
      {...backdrop}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="flag-modal-title"
        className="clip-stable w-full max-w-md max-h-[90vh] flex flex-col rounded-surface border-2 border-amber-500/40 bg-surface shadow-lg animate-fade-in-up overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* The head stays put while a long report scrolls beneath it. Amber is the
            app's colour for "needs a look", the same as the Flagged chip. */}
        <header className="flex-shrink-0 flex items-start gap-4 px-5 sm:px-6 pt-5 pb-4 border-b border-[rgb(var(--color-border-secondary))] bg-amber-100 dark:bg-amber-500/10">
          <div
            aria-hidden="true"
            className="w-10 h-10 rounded-tile flex items-center justify-center shrink-0 bg-amber-200 border border-amber-500/50 text-amber-800 dark:bg-amber-500/20 dark:border-amber-500/40 dark:text-amber-400"
          >
            <Flag className={`w-5 h-5 ${hasOpenFlag ? 'fill-current' : ''}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="t-label text-[rgb(var(--color-text-muted))]">
              {hasOpenFlag ? 'Waiting for review' : 'Report a problem'}
            </p>
            <h2
              id="flag-modal-title"
              className="t-display mt-1 text-2xl uppercase italic leading-none tracking-tight text-[rgb(var(--color-text-primary))]"
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex-shrink-0 flex items-center justify-center min-h-11 min-w-11 rounded-lg text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text-primary))] hover:bg-[rgb(var(--color-bg-surface-inset))] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5">
          {hasOpenFlag ? (
            <div className="space-y-4">
              <p className="t-body text-[rgb(var(--color-text-secondary))]">
                An admin will look at this {itemLabel}. Marking it resolved closes the report and
                keeps the record.
              </p>
              <blockquote className="t-body text-[rgb(var(--color-text-primary))] bg-amber-100 dark:bg-amber-500/10 border-l-2 border-amber-500/60 rounded-r-xl px-4 py-3 italic whitespace-pre-line break-words">
                “{existingFlag?.reason}”
              </blockquote>
              {existingFlag?.flaggedAt ? (
                <p className="t-label text-[rgb(var(--color-text-muted))]">
                  Flagged {new Date(existingFlag.flaggedAt).toLocaleDateString('en-AU')}
                  {existingFlag.flaggedBy ? ` · ${existingFlag.flaggedBy}` : ''}
                </p>
              ) : null}
            </div>
          ) : (
            <div>
              <p className="t-body text-[rgb(var(--color-text-secondary))]">
                Say what looks wrong with this {itemLabel}. It goes on the review list that admins
                check, and you can carry on writing.
              </p>

              <label
                htmlFor={FIELD_ID}
                className="mt-5 block text-sm font-semibold text-[rgb(var(--color-text-primary))]"
              >
                What looks wrong?
              </label>
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Start with">
                {REASON_STARTERS.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => addStarter(starter)}
                    className="t-label min-h-11 sm:min-h-0 px-3 py-1.5 rounded-lg border border-[rgb(var(--color-border-secondary))]/40 bg-[rgb(var(--color-bg-surface-inset))] text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text-primary))] hover:border-amber-500/60 active:scale-[0.98] transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {starter}
                  </button>
                ))}
              </div>
              <textarea
                id={FIELD_ID}
                ref={textareaRef}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={`e.g. "The marking guide adds to 7 but the ${itemLabel} is worth 6."`}
                rows={4}
                maxLength={MAX_REASON_LENGTH}
                autoFocus
                aria-describedby="flag-reason-count"
                // 16px on a phone, where a smaller field makes iOS Safari zoom on focus.
                className="mt-3 w-full rounded-xl border border-[rgb(var(--color-border-secondary))]/40 bg-[rgb(var(--color-bg-surface-inset))]/50 p-3 text-base sm:text-sm text-[rgb(var(--color-text-primary))] placeholder:text-[rgb(var(--color-text-dim))] focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
              />
              <p
                id="flag-reason-count"
                className="mt-1.5 text-right t-label tabular-nums text-[rgb(var(--color-text-muted))]"
              >
                {reason.length} / {MAX_REASON_LENGTH}
              </p>
            </div>
          )}
        </div>

        <div className="flex-shrink-0 px-5 sm:px-6 py-3 sm:py-4 bg-[rgb(var(--color-bg-surface-elevated))] border-t border-[rgb(var(--color-border-secondary))] flex justify-end gap-3 rounded-b-surface-inner">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 sm:min-h-0 py-2.5 px-5 rounded-lg text-sm font-semibold text-[rgb(var(--color-text-secondary))] bg-[rgb(var(--color-bg-surface-light))] hover:bg-[rgb(var(--color-border-secondary))] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {hasOpenFlag ? 'Close' : 'Cancel'}
          </button>
          {hasOpenFlag ? (
            <button
              type="button"
              onClick={() => {
                onResolve();
                onClose();
              }}
              className="min-h-11 sm:min-h-0 py-2.5 px-5 rounded-lg text-sm font-semibold bg-emerald-700 hover:bg-emerald-800 text-white transition hover:shadow-lg active:scale-[0.98] flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Mark resolved
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!reason.trim()}
              className="min-h-11 sm:min-h-0 py-2.5 px-5 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-amber-950 transition hover:shadow-lg active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Flag className="w-4 h-4" aria-hidden="true" /> Flag for review
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default FlagContentModal;
