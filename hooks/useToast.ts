import { useState, useCallback } from 'react';

const TOAST_DURATION = 5000;

/**
 * A toast carrying something to do stays until it is answered — or near enough.
 *
 * Five seconds is fine for "Saved."; it is not enough time to read an offer,
 * decide, and reach for the button. Hovering already pauses the countdown, but
 * that only helps someone who noticed in time.
 */
const ACTIONABLE_TOAST_DURATION = 14000;

/**
 * The most toasts we hold at once. A short FIFO queue means a burst — a quota
 * warning, an AI fallback notice and a "marking complete" landing together — is
 * shown one after another instead of the last one silently winning. The cap
 * stops a runaway loop of failures from growing the backlog without bound.
 */
const MAX_QUEUE = 4;

// Generate ID with fallback for environments without crypto.randomUUID
const generateId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

/** The severity levels a toast can carry — the single source of truth. */
export type ToastType = 'success' | 'error' | 'warning' | 'info';

/** A function that raises a toast. Shared so prop types stay in step with the hook. */
export type ShowToast = (message: string, type?: ToastType, action?: ToastAction) => void;

/**
 * Something to do about what the toast just said.
 *
 * Several flows ended in a message describing exactly what the person would
 * want to act on next — "Merged into HSC Physics", "84 syllabus points have no
 * question yet" — with no way to get there, which is what pushed one of them
 * into opening a modal at the user instead of asking.
 */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
  action?: ToastAction;
  durationMs: number;
}

/**
 * A single-slot toast used to overwrite an unseen one whenever a second message
 * arrived — so a "marking complete" could wipe a quota warning the person had
 * not read yet. Toasts are now held in a short FIFO queue: `toast` is the one on
 * screen, `showToast` appends, and `hideToast` retires the current one and lets
 * the next take its place. The visible `Toast` component owns the countdown (and
 * pauses it on hover), calling `hideToast` when a toast's time is up, so there is
 * exactly one timer per shown toast and no risk of two firing at once.
 */
export const useToast = () => {
  const [queue, setQueue] = useState<ToastMessage[]>([]);

  const showToast = useCallback<ShowToast>((message, type = 'info', action) => {
    const durationMs = action ? ACTIONABLE_TOAST_DURATION : TOAST_DURATION;
    const next: ToastMessage = { id: generateId(), message, type, action, durationMs };

    setQueue((prev) => {
      let held = prev;
      if (held.length >= MAX_QUEUE) {
        // Never discard the toast currently on screen (the head). Among those
        // still waiting, drop the oldest that carries no action so a flood of
        // routine notices cannot bury an offer to act. Only if every waiting
        // toast is actionable do we fall back to dropping the oldest waiting
        // one — a burst of that many simultaneous offers isn't a real flow, and
        // the cap has to give somewhere.
        const [head, ...waiting] = held;
        const dropAt = waiting.findIndex((t) => !t.action);
        const removeAt = dropAt === -1 ? 0 : dropAt;
        held = [head, ...waiting.filter((_, i) => i !== removeAt)];
      }
      return [...held, next];
    });
  }, []);

  const hideToast = useCallback(() => {
    setQueue((prev) => prev.slice(1));
  }, []);

  return { toast: queue[0] ?? null, showToast, hideToast };
};
