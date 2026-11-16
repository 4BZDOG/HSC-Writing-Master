import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Lock, X } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import { useCourseUnlockPrice } from '../hooks/useLivePrices';
import type { ToastType } from '../hooks/useToast';
import type { User } from '../types';
import {
  COURSE_UNLOCK_CODE,
  loadOwnedCourseUnlocks,
  startCourseUnlockCheckout,
} from '../services/courseAccess';
import { gstNoteFor } from '../services/livePrices';

/** Said in place of a price when the server has not sent one. */
export const COURSE_UNLOCK_PRICE_FALLBACK = 'a small one-off fee';

interface CourseUnlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseId: string | null;
  courseName: string;
  user: User | null;
  showToast: (message: string, type: ToastType) => void;
  /**
   * The server says the course is already open by plan (409 course_included). The
   * dialog closes and the marking that asked for it carries on.
   */
  onIncluded?: () => void;
}

/**
 * The one-off unlock for a locked course. Opened when a student marks a locked
 * course, or when the server refuses one with 402 course_locked. The dialog is
 * lazy-loaded from AppModals, so it is not part of the first load.
 *
 * It follows UpgradeModal's dialog: a portal, aria-modal, a labelled title, a focus
 * trap, Escape to close, the backdrop to close, and the scroll locked behind it.
 */
const CourseUnlockModal: React.FC<CourseUnlockModalProps> = ({
  isOpen,
  onClose,
  courseId,
  courseName,
  user,
  showToast,
  onIncluded,
}) => {
  const [busy, setBusy] = useState(false);
  const price = useCourseUnlockPrice();
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);
  useEscapeKey(isOpen, onClose);
  useScrollLock(isOpen);

  if (!isOpen || !courseId) return null;

  const isGuest = user?.role === 'guest';
  const priceText = price?.display ?? COURSE_UNLOCK_PRICE_FALLBACK;
  const gst = price ? gstNoteFor(price.taxBehavior) : null;

  const handleUnlock = async () => {
    if (busy) return;
    setBusy(true);
    const result = await startCourseUnlockCheckout(courseId);
    if (result.url) {
      // Leaving for Stripe: the button stays busy until the page goes.
      window.location.href = result.url;
      return;
    }
    setBusy(false);
    switch (result.code) {
      case COURSE_UNLOCK_CODE.courseIncluded:
        // Already open on the viewer's plan: nothing to buy, so carry on.
        onClose();
        onIncluded?.();
        return;
      case COURSE_UNLOCK_CODE.alreadyUnlocked:
        // Held already, so the picker is stale. Refresh it and say so.
        void loadOwnedCourseUnlocks();
        showToast(`You already have ${courseName} unlocked.`, 'info');
        onClose();
        return;
      case COURSE_UNLOCK_CODE.unlocksDisabled:
        showToast('Course unlocks are not available right now.', 'info');
        onClose();
        return;
      default:
        showToast(result.error ?? 'Could not start checkout. Please try again.', 'error');
    }
  };

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-upgrade bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="course-unlock-title"
    >
      <div className="clip-stable w-full max-w-md rounded-surface bg-[rgb(var(--color-bg-surface))] border-2 border-amber-400/40 shadow-[0_32px_96px_-16px_rgba(0,0,0,0.7)] overflow-hidden animate-fade-in-up flex flex-col max-h-[90vh]">
        <div className="relative px-6 py-6 bg-amber-400 text-slate-900 overflow-hidden shrink-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 w-11 h-11 flex items-center justify-center rounded-xl bg-black/10 hover:bg-black/20 text-slate-900 transition-colors z-20"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-4 relative z-10">
            <div className="w-14 h-14 shrink-0 rounded-2xl bg-white/25 border border-white/40 flex items-center justify-center shadow-lg">
              <Lock className="w-7 h-7" aria-hidden="true" />
            </div>
            <div className="min-w-0 pr-10">
              <span className="t-label text-slate-900/80 block">One-off unlock</span>
              <h2
                id="course-unlock-title"
                className="text-xl font-black tracking-tight leading-tight"
              >
                Unlock {courseName}
              </h2>
            </div>
          </div>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar">
          <p className="text-sm text-[rgb(var(--color-text-secondary))] leading-relaxed">
            Marking and feedback for every question in {courseName}.
          </p>
          {isGuest ? (
            <p className="text-sm text-[rgb(var(--color-text-secondary))] leading-relaxed mt-3">
              Create a free account first. An unlock is attached to an account.
            </p>
          ) : (
            <>
              <p className="text-sm text-[rgb(var(--color-text-primary))] leading-relaxed mt-3">
                {price
                  ? `One-off payment of ${price.display}${gst ? ` ${gst}` : ''}.`
                  : 'A small one-off fee, paid once.'}
              </p>
              <p className="text-xs text-[rgb(var(--color-text-muted))] leading-relaxed mt-3">
                Your plan still sets your daily limits on marking.
              </p>
            </>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="t-label min-h-11 px-4 py-2 rounded-xl border border-[rgb(var(--color-border-secondary))] text-[rgb(var(--color-text-secondary))] hover:bg-white/5 transition-colors"
            >
              Not now
            </button>
            {!isGuest && (
              <button
                type="button"
                onClick={handleUnlock}
                disabled={busy}
                className="t-label min-h-11 flex-1 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-900 hover:scale-105 active:scale-[0.98] transition-transform shadow-lg disabled:opacity-60 disabled:hover:scale-100"
              >
                {busy ? 'Opening checkout…' : `Unlock for ${priceText}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CourseUnlockModal;
