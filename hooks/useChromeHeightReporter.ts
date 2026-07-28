import { useEffect, RefObject } from 'react';
import { naturalChromeHeight } from '../utils/layoutConstants';

/**
 * Reports the natural height of a card's header or footer to the workspace,
 * which floors the matching chrome on the other card with it.
 *
 * Both workspace cards did this with their own copy of the same effect — four
 * copies of "measure the content, add the box's padding, hand it up" — and the
 * two cards MUST measure identically or the sync oscillates, so the duplication
 * was the bug waiting to happen rather than incidental repetition.
 *
 * The measurement is deferred to an animation frame rather than taken inside
 * the observer callback. Reading layout there is what produces Chrome's
 * "ResizeObserver loop completed with undelivered notifications", and it is
 * also what made resizing (or zooming) flicker: each card measured, wrote a
 * height, resized the other card, which measured and wrote back, all within
 * one frame. Batched to a frame, a burst of resizes produces one measurement.
 */
export const useChromeHeightReporter = (
  boxRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
  report?: (height: number) => void
): void => {
  useEffect(() => {
    const content = contentRef.current;
    if (!content || !report || typeof ResizeObserver === 'undefined') return;

    let frame = 0;
    const measure = () => {
      const height = naturalChromeHeight(boxRef.current, contentRef.current);
      if (height > 0) report(height);
    };

    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    observer.observe(content);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [boxRef, contentRef, report]);
};
