import { useEffect, useRef } from 'react';

/**
 * How many dismissible overlays are currently listening for Escape.
 *
 * Escape is a stack: it should dismiss the topmost layer and nothing else.
 * Both a modal and the workspace's "exit Focus Mode" handler listen on
 * `window`, so a single press used to fire both — closing the outcome brief
 * AND dropping the student out of Focus Mode in one keystroke.
 * `stopPropagation` cannot help: the listeners share a target, so nothing is
 * propagating between them.
 *
 * A counter is the reliable signal. Every dismissible surface in the app goes
 * through this hook, so a background handler can ask whether anything is
 * layered above it before acting.
 */
type EscapeHandler = { onEscape: () => void };

/**
 * The open overlays, in the order they registered. The LAST entry is the
 * topmost surface, and it is the only one a press of Escape reaches.
 *
 * A plain counter was not enough once dialogs began stacking on each other —
 * the improvement diff opens over the feedback modal, and both listen on
 * `window`, so one press closed the diff AND the feedback behind it. Since the
 * listeners share a target there is nothing to stop propagating between; the
 * stack has to do the arbitration itself.
 */
const overlayStack: EscapeHandler[] = [];

/** True while any Escape-dismissible overlay is open. */
export const isOverlayOpen = (): boolean => overlayStack.length > 0;

/**
 * Close-on-Escape for modal surfaces. `active` should be false while the
 * modal is mid-operation (saving, batch-processing) so Escape can't abandon
 * an in-flight action; the handler simply isn't registered in that state — and
 * because it is not registered, Escape falls through to the surface beneath,
 * which is the right behaviour for a dialog that is refusing to be dismissed.
 */
export const useEscapeKey = (active: boolean, onEscape: () => void): void => {
  // Read through a ref so a re-rendered callback does not re-register the
  // entry and shuffle a dialog to the top of the stack it was already in.
  const handlerRef = useRef(onEscape);
  handlerRef.current = onEscape;

  useEffect(() => {
    if (!active) return;
    const entry: EscapeHandler = { onEscape: () => handlerRef.current() };
    overlayStack.push(entry);

    const listener = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Only the topmost surface responds. Every listener sees the event, so
      // each checks whether it is the one on top rather than acting blindly.
      if (overlayStack[overlayStack.length - 1] !== entry) return;
      e.stopPropagation();
      entry.onEscape();
    };
    window.addEventListener('keydown', listener);

    return () => {
      const index = overlayStack.indexOf(entry);
      if (index !== -1) overlayStack.splice(index, 1);
      window.removeEventListener('keydown', listener);
    };
  }, [active]);
};
