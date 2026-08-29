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

// Generate ID with fallback for environments without crypto.randomUUID
const generateId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

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
  type: 'success' | 'error' | 'warning' | 'info';
  action?: ToastAction;
  durationMs: number;
}

export const useToast = () => {
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = useCallback(
    (
      message: string,
      type: 'success' | 'error' | 'warning' | 'info' = 'info',
      action?: ToastAction
    ) => {
      const toastId = generateId();
      const durationMs = action ? ACTIONABLE_TOAST_DURATION : TOAST_DURATION;
      setToast({ id: toastId, message, type, action, durationMs });

      setTimeout(() => {
        setToast((prev) => (prev?.id === toastId ? null : prev));
      }, durationMs);
    },
    []
  );

  const hideToast = useCallback(() => {
    setToast(null);
  }, []);

  return { toast, showToast, hideToast };
};
