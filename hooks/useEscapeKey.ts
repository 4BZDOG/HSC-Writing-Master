import { useEffect } from 'react';

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
let openOverlays = 0;

/** True while any Escape-dismissible overlay is open. */
export const isOverlayOpen = (): boolean => openOverlays > 0;

/**
 * Close-on-Escape for modal surfaces. `active` should be false while the
 * modal is mid-operation (saving, batch-processing) so Escape can't abandon
 * an in-flight action; the handler simply isn't attached in that state.
 */
export const useEscapeKey = (active: boolean, onEscape: () => void): void => {
  useEffect(() => {
    if (!active) return;
    openOverlays += 1;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onEscape();
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      openOverlays = Math.max(0, openOverlays - 1);
      window.removeEventListener('keydown', handler);
    };
  }, [active, onEscape]);
};
