import React, { useRef } from 'react';

/**
 * Close-on-backdrop that a text selection cannot trigger.
 *
 * A click is fired on the nearest element that contains BOTH the mousedown and
 * the mouseup. A student who starts a selection inside a dialog and releases it
 * over the scrim therefore produces a click whose target is the scrim, and an
 * `onClick` that only checks the target closes the dialog in the middle of their
 * copying. So a dismissal needs the press to begin on the backdrop and to end
 * there as well.
 *
 * Spread the returned handlers onto the backdrop element. The dialog itself must
 * stop click propagation, or a click on its content reaches the backdrop anyway.
 */
export const useBackdropDismiss = (onDismiss: () => void) => {
  const pressedOnBackdrop = useRef(false);
  const releasedOnBackdrop = useRef(false);

  return {
    onMouseDown: (e: React.MouseEvent<HTMLElement>) => {
      pressedOnBackdrop.current = e.target === e.currentTarget;
      releasedOnBackdrop.current = false;
    },
    onMouseUp: (e: React.MouseEvent<HTMLElement>) => {
      releasedOnBackdrop.current = e.target === e.currentTarget;
    },
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      const dismiss =
        pressedOnBackdrop.current && releasedOnBackdrop.current && e.target === e.currentTarget;
      pressedOnBackdrop.current = false;
      releasedOnBackdrop.current = false;
      if (dismiss) onDismiss();
    },
  };
};
