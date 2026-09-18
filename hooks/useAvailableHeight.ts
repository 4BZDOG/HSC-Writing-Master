import { useEffect, useState, RefObject } from 'react';

/**
 * The live inner height of an element, for content that has to decide how much
 * of itself to show.
 *
 * The writing card's height is not its own: it is floored by the question card
 * beside it and by the viewport, so the body a blank-page brief is drawn on is
 * about 200px on a laptop and nearer 100px on a phone. A brief sized for one
 * is cut off on the other, and a brief cut off mid-sentence is worse than a
 * shorter one that finishes.
 *
 * A breakpoint would be the cheap answer and the wrong one: what varies is the
 * card's height, which depends on the length of the question beside it as much
 * as on the viewport. Measuring is the only thing that stays true.
 *
 * Deferred to an animation frame for the same reason `useChromeHeightReporter`
 * defers: reading layout inside the observer callback is what produces
 * Chrome's "ResizeObserver loop completed with undelivered notifications".
 * Returns 0 until the first measurement, and where there is no ResizeObserver
 * at all (jsdom), so a caller can treat 0 as "not measured yet".
 */
export const useAvailableHeight = (ref: RefObject<HTMLElement | null>): number => {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;

    let frame = 0;
    const measure = () => {
      const next = ref.current?.clientHeight ?? 0;
      setHeight((current) => (current === next ? current : next));
    };

    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    observer.observe(element);
    measure();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [ref]);

  return height;
};
