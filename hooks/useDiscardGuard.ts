import { useCallback, useEffect, useState } from 'react';

/**
 * Don't let a stray click throw away work that took real effort to produce.
 *
 * The import modals are where a whole NESA syllabus gets pasted, split across
 * tabs, analysed and pruned — twenty minutes of an admin's attention sitting in
 * component state with nowhere else to live. Every one of them closed on a
 * click anywhere outside the panel, and closing wipes that state. The dark area
 * around a modal is large, it is exactly where the pointer travels between the
 * page and the dialog, and one miss cost the lot with no warning and no undo.
 *
 * So: while there is work in progress, the backdrop stops being a close button
 * at all — a stray click should be inert, not merely survivable — and the
 * deliberate ways out (Escape, ✕, Cancel) ask once before discarding. With
 * nothing entered, everything closes immediately as it always did; a
 * confirmation over an empty form is just an obstacle.
 */
export interface DiscardGuard {
  /** Deliberate close: asks first when there is something to lose. */
  requestClose: () => void;
  /** Backdrop close: does nothing at all when there is something to lose. */
  requestCloseFromBackdrop: () => void;
  /** True while the confirmation is on screen. */
  isConfirming: boolean;
  /** Keep the work and put the confirmation away. */
  cancelDiscard: () => void;
  /** Throw the work away and close. */
  confirmDiscard: () => void;
}

export const useDiscardGuard = (
  isOpen: boolean,
  hasWork: boolean,
  close: () => void
): DiscardGuard => {
  const [isConfirming, setIsConfirming] = useState(false);

  // A modal that reopens must never come back mid-question.
  useEffect(() => {
    if (!isOpen) setIsConfirming(false);
  }, [isOpen]);

  // Work can also disappear while the question is up — the user deletes the
  // last tab, or a save empties the form. Asking about nothing is worse than
  // not asking.
  useEffect(() => {
    if (!hasWork) setIsConfirming(false);
  }, [hasWork]);

  const requestClose = useCallback(() => {
    if (hasWork) setIsConfirming(true);
    else close();
  }, [hasWork, close]);

  const requestCloseFromBackdrop = useCallback(() => {
    if (!hasWork) close();
  }, [hasWork, close]);

  const cancelDiscard = useCallback(() => setIsConfirming(false), []);

  const confirmDiscard = useCallback(() => {
    setIsConfirming(false);
    close();
  }, [close]);

  return {
    requestClose,
    requestCloseFromBackdrop,
    isConfirming,
    cancelDiscard,
    confirmDiscard,
  };
};
