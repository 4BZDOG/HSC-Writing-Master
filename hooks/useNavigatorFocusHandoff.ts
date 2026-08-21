import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * What a screen reader hears on the collapse/expand edge. Focus alone tells a
 * sighted user something happened; a reader who cannot see the picker vanish
 * or the breadcrumb appear needs the sentence as well as the landmark.
 */
export const NAVIGATOR_COLLAPSED_MESSAGE =
  'Question selected. The syllabus navigator has collapsed to a breadcrumb; your writing space is below.';

export const NAVIGATOR_EXPANDED_MESSAGE = 'Syllabus navigator open.';

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
  const [foldAnnouncement, setFoldAnnouncement] = useState('');
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
      // Spoken regardless of `navigatorEverFocused`: a screen-reader user
      // browsing by virtual cursor rather than Tab still benefits from being
      // told the region collapsed, even though the focus MOVE stays gated —
      // stealing focus on a fold nobody engaged with the keyboard would be its
      // own new surprise.
      if (collapseEdge) setFoldAnnouncement(NAVIGATOR_COLLAPSED_MESSAGE);
      if (navigatorEverFocused.current) expandButtonRef.current?.focus({ preventScroll: true });
      return;
    }

    // A crumb clicked on the still-open navigator moves nothing to announce —
    // it only re-focuses the picker — so the message is tied to the collapse
    // edge specifically, not to every reason this branch runs.
    if (collapseEdge) setFoldAnnouncement(NAVIGATOR_EXPANDED_MESSAGE);

    const el = navigatorRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    // `scrollIntoView`'s options bag is imperative, so `index.css`'s global
    // `scroll-behavior: auto !important` cannot reach it — the media query has
    // to be asked directly.
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [isNavCollapsed, crumbJumps]);

  return { navigatorRef, expandButtonRef, noteNavigatorFocused, foldAnnouncement };
};

export default useNavigatorFocusHandoff;
