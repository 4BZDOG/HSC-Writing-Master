import { useEffect } from 'react';

/**
 * Close-on-Escape for modal surfaces. `active` should be false while the
 * modal is mid-operation (saving, batch-processing) so Escape can't abandon
 * an in-flight action; the handler simply isn't attached in that state.
 */
export const useEscapeKey = (active: boolean, onEscape: () => void): void => {
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onEscape();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [active, onEscape]);
};
