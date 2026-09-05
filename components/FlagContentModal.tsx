import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Flag, CheckCircle2 } from 'lucide-react';
import { ContentFlag } from '../types';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import { useFocusTrap } from '../hooks/useFocusTrap';

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

  useEscapeKey(isOpen, onClose);
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);
  useScrollLock(isOpen);
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

  // Portalled for the same reason as ConfirmationModal: this is opened from
  // inside `clip-stable` cards (the question card, the exemplars panel), whose
  // transform would otherwise make the "fixed" backdrop a child-of-card.
  if (typeof document === 'undefined' || !document.body) return null;

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Report a problem with this content"
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-critical p-4"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-2xl shadow-lg w-full max-w-md border border-[rgb(var(--color-border-secondary))] light:border-slate-200 clip-stable animate-fade-in-up overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-1 bg-amber-500/15 border border-amber-500/30">
              <Flag className="w-5 h-5 text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900 mb-2">
                {hasOpenFlag ? `This ${itemLabel} is flagged` : `Flag this ${itemLabel}`}
              </h2>
              {hasOpenFlag ? (
                <div className="space-y-3">
                  <p className="text-[rgb(var(--color-text-secondary))] light:text-slate-600 text-sm leading-relaxed">
                    It is waiting for review by an admin or a future AI audit pass.
                  </p>
                  <blockquote className="text-sm text-[rgb(var(--color-text-primary))] light:text-slate-800 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 italic break-words">
                    “{existingFlag?.reason}”
                  </blockquote>
                  {existingFlag?.flaggedAt ? (
                    <p className="t-label text-[rgb(var(--color-text-muted))] light:text-slate-500">
                      Flagged {new Date(existingFlag.flaggedAt).toLocaleDateString()}
                      {existingFlag.flaggedBy ? ` · ${existingFlag.flaggedBy}` : ''}
                    </p>
                  ) : null}
                </div>
              ) : (
                <>
                  <p className="text-[rgb(var(--color-text-secondary))] light:text-slate-600 text-sm leading-relaxed mb-3">
                    Something look off — wrong facts, odd wording, marks that don't add up? Say
                    what, and it goes on the review list for an admin or AI audit.
                  </p>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={`e.g. "The marking guide adds to 7 but the ${itemLabel} is worth 6."`}
                    rows={3}
                    autoFocus
                    className="w-full rounded-xl border border-[rgb(var(--color-border-secondary))] light:border-slate-300 bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-white p-3 text-sm text-[rgb(var(--color-text-primary))] light:text-slate-900 placeholder:text-[rgb(var(--color-text-dim))] light:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
                  />
                </>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-50 border-t border-[rgb(var(--color-border-secondary))] light:border-slate-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="py-2.5 px-5 rounded-lg text-sm font-semibold text-[rgb(var(--color-text-muted))] light:text-slate-600 bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-transparent light:border-slate-300 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-100 transition"
          >
            {hasOpenFlag ? 'Close' : 'Cancel'}
          </button>
          {hasOpenFlag ? (
            <button
              onClick={() => {
                onResolve();
                onClose();
              }}
              className="py-2.5 px-5 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition hover:shadow-lg active:scale-[0.98] flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" /> Mark Resolved
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!reason.trim()}
              className="py-2.5 px-5 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-amber-950 transition hover:shadow-lg active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Flag className="w-4 h-4" /> Flag for Review
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default FlagContentModal;
