import { useCallback, useEffect, useRef } from 'react';

/**
 * Focus handoff for the navigator's self-destroying controls.
 *
 * Three controls, and they are the same bug wearing different clothes:
 * "Change" lives on the collapsed bar, which unmounts the moment it re-opens
 * the picker; "Collapse to breadcrumb" sits inside the wrapper that gains
 * `inert` on the very click; and a breadcrumb crumb clears the chosen question,
 * which unmounts whichever surface was drawing that crumb. Left alone, focus
 * falls to `<body>` and the next Tab restarts at the top of the document. Each
 * control hands focus to whatever replaced it — the same symmetry
 * `useFocusTrap` gives a modal.
 *
 * Two triggers, one effect, deliberately.
 *
 * The collapse/expand seam is an edge on `isNavCollapsed`. A crumb pressed
 * while the navigator is ALREADY open moves no such edge — it only clears the
 * question, and the picker it should return focus to was open the whole time —
 * so those presses are COUNTED instead, and the count is the second trigger.
 * A crumb on the collapsed bar moves both at once; folding the two into a
 * single effect run is what stops that case focusing (and smooth-scrolling to)
 * the navigator twice.
 *
 * Expanding also scrolls: with the page scrolled down to the writing area,
 * "Change" unfolds a ~700px picker entirely above the fold, and nothing
 * visible moves.
 *
 * @param isNavCollapsed Is the navigator currently folded into the breadcrumb bar?
 * @param crumbJumps     A monotonically increasing count of breadcrumb presses.
 */
export const useNavigatorFocusHandoff = (isNavCollapsed: boolean, crumbJumps: number) => {
  const navigatorRef = useRef<HTMLDivElement>(null);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  /**
   * Only a navigator the user has actually stood in can have cost them their
   * place. A question restored from storage collapses the navigator on load
   * too, and moving focus to "Change" then would be a jump nobody asked for.
   */
  const navigatorEverFocused = useRef(false);
  const noteNavigatorFocused = useCallback(() => {
    navigatorEverFocused.current = true;
  }, []);

  const wasNavCollapsed = useRef(isNavCollapsed);
  const handledCrumbJumps = useRef(crumbJumps);

  useEffect(() => {
    const collapseEdge = wasNavCollapsed.current !== isNavCollapsed;
    const crumbEdge = handledCrumbJumps.current !== crumbJumps;
    wasNavCollapsed.current = isNavCollapsed;
    handledCrumbJumps.current = crumbJumps;
    if (!collapseEdge && !crumbEdge) return;

    if (isNavCollapsed) {
      if (navigatorEverFocused.current) expandButtonRef.current?.focus({ preventScroll: true });
      return;
    }

    const el = navigatorRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    // `scrollIntoView`'s options bag is imperative, so `index.css`'s global
    // `scroll-behavior: auto !important` cannot reach it — the media query has
    // to be asked directly.
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [isNavCollapsed, crumbJumps]);

  return { navigatorRef, expandButtonRef, noteNavigatorFocused };
};

export default useNavigatorFocusHandoff;
