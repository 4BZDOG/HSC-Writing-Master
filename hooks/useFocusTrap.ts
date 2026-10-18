import { useEffect, useRef } from 'react';

/**
 * Keyboard containment for modal surfaces.
 *
 * Every dialog in the app already says `aria-modal="true"`, which tells a
 * screen reader that everything behind it is inert. Nothing made that true:
 * Tab walked straight out of the dialog and through the page underneath —
 * controls the user cannot see, over a scrim, in a document their screen
 * reader has been told to ignore. The attribute was a promise the DOM did not
 * keep, which is worse than not making it, because a sighted keyboard user at
 * least gets a visible focus ring on something they can find again.
 *
 * Three jobs, and the second and third are the ones a hand-rolled trap usually
 * misses:
 *
 *   1. Move focus INTO the dialog when it opens.
 *   2. Keep Tab and Shift+Tab inside it while it is open — and inside the
 *      layers deliberately painted above it (see `focusTrapCompanion`).
 *   3. Put focus BACK where it came from when it closes. Without this a
 *      keyboard user is returned to `<body>` and has to tab from the top of
 *      the page to reach the control they just used.
 *
 * Modelled on `useEscapeKey`, deliberately: overlays stack (the improvement
 * diff opens over the marking feedback), so the same arbitration applies —
 * only the TOPMOST trap acts, and it listens on the document rather than on
 * the dialog element, so it still holds if focus has already escaped.
 */

interface TrapEntry {
  container: () => HTMLElement | null;
}

/** Open traps, in registration order. The last entry is the topmost dialog. */
const trapStack: TrapEntry[] = [];

/**
 * What counts as reachable by Tab.
 *
 * `textarea` and `select` are in this list and were missing from the one
 * hand-rolled trap that existed — which is exactly the sort of omission that
 * makes a trap worse than none, since it lets focus escape from the one
 * dialog (the manual question editor) whose whole content is a textarea.
 *
 * `tabindex="-1"` is excluded from EVERY entry, not just from the bare
 * `[tabindex]` one. An element is reachable by Tab if it is a control AND its
 * tabindex is not -1, and the old list read the two halves as alternatives —
 * so a `<button tabindex="-1">`, which the browser will never Tab to, counted
 * as a tab stop here. That is not academic: the audit studio's tree is a
 * single-tab-stop widget in the ARIA sense, with roving focus on its rows and
 * every button inside them at -1, so under the old selector the trap's idea of
 * "the last focusable" was a control Tab could not reach, its wrap-around
 * never fired, and Tab walked out of the dialog.
 */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]',
]
  .map((sel) => `${sel}:not([tabindex="-1"])`)
  .join(', ');

/**
 * Is this control actually reachable, as opposed to merely present?
 *
 * Deliberately NOT measured with `offsetWidth`/`offsetHeight`. Those are the
 * obvious test and they are wrong twice over: they force layout on every Tab,
 * and they report 0 in any environment without a layout engine — which turns
 * the whole trap into a no-op rather than failing loudly. `checkVisibility()`
 * answers the question properly where it exists, and where it does not the
 * safe answer is "assume reachable": a trap that occasionally offers a hidden
 * control still keeps focus in the dialog, whereas one that finds nothing
 * lets focus escape entirely.
 */
const isReachable = (el: HTMLElement): boolean => {
  if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return false;
  if (el.closest('[hidden], [aria-hidden="true"]')) return false;
  const check = (el as HTMLElement & { checkVisibility?: () => boolean }).checkVisibility;
  return typeof check === 'function' ? check.call(el) : true;
};

/** Focusable, reachable descendants in document order. */
const focusableWithin = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isReachable);

/**
 * Marks a region OUTSIDE the dialog that its Tab cycle should include.
 *
 * Spread it onto the mount of anything that is painted above the dialog and
 * holds controls a keyboard user needs: today, the toast. The toast is portalled
 * to <body> at z-toast, above the improvement review, so a mouse user can press
 * its "Undo" — but it is not inside the dialog, and a trap that only knows its
 * own subtree wraps Tab straight past it. The control was on screen, on top, and
 * unreachable.
 *
 * It is an attribute and not a registration so that the mount stays a plain
 * element, and so no dialog has to know a toast exists: the dialogs are
 * untouched, and the cycle they get is "my controls, then the companion's".
 */
export const FOCUS_TRAP_COMPANION_ATTRIBUTE = 'data-focus-trap-companion';
export const focusTrapCompanion = { [FOCUS_TRAP_COMPANION_ATTRIBUTE]: '' } as const;

/**
 * Is this control painted on top, as opposed to sitting under a scrim?
 *
 * The toast ranks below the confirm and rename dialogs (z 2200 against 1350),
 * so a toast raised over one of those is hidden by it. Offering its
 * buttons to Tab there would put focus on a control nobody can see, and Enter
 * would press "Undo" blind. Asking the browser what is actually painted at the
 * control's centre answers that without this hook needing to know the z-index
 * ladder, or which modal is open.
 *
 * Where there is no layout engine (jsdom reports an empty rectangle, and has no
 * `elementFromPoint`) the safe answer is "assume it is on top", for the reason
 * `isReachable` gives: a cycle that occasionally offers one control too many
 * still keeps the dialog's own controls trapped.
 */
const isPaintedOnTop = (control: HTMLElement, region: HTMLElement): boolean => {
  if (typeof document.elementFromPoint !== 'function') return true;
  const box = control.getBoundingClientRect();
  if (box.width === 0 && box.height === 0) return true;
  const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
  return !!hit && region.contains(hit);
};

/**
 * The companion regions, and the controls in them that Tab can land on.
 *
 * Read afresh on every Tab rather than cached: a toast appears and expires
 * while the dialog stays open, and the cycle must follow it. A region inside
 * the dialog is skipped — its controls are already the dialog's own — and so is
 * one that contains it, which would otherwise swallow the dialog's controls.
 */
const companionsOutside = (
  container: HTMLElement
): { regions: HTMLElement[]; stops: HTMLElement[] } => {
  const regions = Array.from(
    document.querySelectorAll<HTMLElement>(`[${FOCUS_TRAP_COMPANION_ATTRIBUTE}]`)
  ).filter((region) => !container.contains(region) && !region.contains(container));
  const stops = regions.flatMap((region) =>
    focusableWithin(region).filter((control) => isPaintedOnTop(control, region))
  );
  return { regions, stops };
};

/**
 * The element that had focus before the first dialog of the current run opened.
 *
 * A dialog can hand off to another from one of its own controls: the profile's
 * Terms link closes the profile and opens the legal reader in the same click. The
 * second dialog then captures that control as its opener, and the first dialog's
 * unmount removes it, so the restore finds a detached node and leaves focus on
 * <body>. This page element is where focus belongs once the run ends. It is set
 * by the first dialog to open, kept while any dialog is open, and cleared by the
 * restore that runs with no dialog left.
 */
let runOpener: HTMLElement | null = null;

/** The surface of the topmost dialog that is still mounted, if any dialog is open. */
const topmostContainer = (): HTMLElement | null => {
  for (let i = trapStack.length - 1; i >= 0; i--) {
    const el = trapStack[i].container();
    if (el) return el;
  }
  return null;
};

/**
 * Hands focus back to the opener one frame after a dialog closes, unless a
 * dialog that is still open has taken focus.
 *
 * The check is made when the frame lands, against the stack as it is then, and
 * not when the close happened. That matters for the close-then-open case: a
 * dialog closes and another opens in the same tick, so the new one is a separate
 * hook instance, and no cancel kept on the closing one can see it. By the time
 * the frame runs, the new dialog is on top and holds focus, and restoring to the
 * page behind would take focus straight back out of it.
 *
 * So while a dialog is open whose surface does not hold the opener, that dialog
 * keeps focus; if focus has nonetheless fallen out of it, it goes to its first
 * control. A dialog opened from inside a still-open one holds its opener, so
 * closing it returns focus to its parent exactly as before. StrictMode's double
 * effect run is the same case: the dialog is open when the frame lands, and it
 * holds focus.
 *
 * `preventScroll` is load-bearing, not decoration. `useScrollLock` has just
 * unpinned <body> and put the viewport back at the exact offset it captured when
 * the modal opened; a plain `.focus()` here immediately scrolls the opener into
 * view and undoes that, so closing any dialog nudged the page by however far the
 * opener sat from the scroll anchor. Nothing is stranded offscreen by
 * suppressing it: the position being restored is the one the opener was clicked
 * at.
 *
 * Re-checked as well that the opener is still in the document: a dialog that
 * deletes the row which opened it leaves a detached node behind, and focusing
 * that puts focus nowhere at all.
 */
const restoreFocus = (opener: HTMLElement | null) => {
  const top = topmostContainer();
  if (top && !top.contains(opener)) {
    if (!top.contains(document.activeElement)) {
      (focusableWithin(top)[0] ?? top).focus?.({ preventScroll: true });
    }
    return;
  }
  // A detached opener falls back to the page element that began the run, if it is
  // still there (see runOpener).
  const target = opener && document.contains(opener) ? opener : runOpener;
  if (target && document.contains(target)) {
    target.focus?.({ preventScroll: true });
  }
  if (trapStack.length === 0) runOpener = null;
};

/**
 * Trap focus inside the returned element while `active`.
 *
 * Put the ref on the dialog surface itself (the element carrying
 * `role="dialog"`), and give that element `tabIndex={-1}` so there is
 * somewhere to put focus in the rare case that it holds no focusable controls
 * at all — a read-only dialog whose only control is the close button in a
 * portal, say.
 */
export const useFocusTrap = <T extends HTMLElement>(active: boolean) => {
  const containerRef = useRef<T | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const wasActive = useRef(false);

  /**
   * The opener, captured during RENDER rather than in the effect.
   *
   * React applies `autoFocus` while committing, which is before any effect
   * runs — so by the time the effect looks, focus may already be inside the
   * dialog and the control that opened it is unrecoverable. This render runs
   * before that commit, so `document.activeElement` is still the button the
   * user pressed. It is a read, not a mutation, and it happens once per open.
   */
  if (active && !wasActive.current) {
    openerRef.current = document.activeElement as HTMLElement | null;
  }
  wasActive.current = active;

  useEffect(() => {
    if (!active) return;

    const container = containerRef.current;
    // Not named `active` — that is the hook's own parameter, and shadowing it
    // here puts the guard above into the temporal dead zone.
    const focusedOnOpen = document.activeElement as HTMLElement | null;
    // React applies `autoFocus` during the commit, which runs BEFORE this
    // effect — so focus can already be inside the dialog when we arrive.
    const startedInside = !!container && !!focusedOnOpen && container.contains(focusedOnOpen);

    /**
     * Where focus came from, so it can be handed back.
     *
     * From the render-time capture, and never something inside the dialog: a
     * field with `autoFocus` has already taken focus by now, and remembering
     * THAT would mean restoring, on close, to a node that no longer exists —
     * dropping focus to `<body>`, the exact failure this hook exists to
     * prevent, in precisely the dialogs most careful about focus.
     */
    const opener = openerRef.current;
    const previouslyFocused = opener && !container?.contains(opener) ? opener : null;

    // Kept while the run lasts. Replaced when it is missing, detached (a run that
    // ended without its restore), or the body, which is never a place to return to.
    const reusable = !runOpener || runOpener === document.body || !runOpener.isConnected;
    if (reusable) runOpener = previouslyFocused;

    const entry: TrapEntry = { container: () => containerRef.current };
    trapStack.push(entry);

    /**
     * Into the dialog — unless it is already there.
     *
     * The first focusable is the right target far more often than the
     * container itself; it is usually the primary action or the close button.
     * But a dialog that asked for a specific field with `autoFocus` has said
     * where it wants focus, and stealing it back to the ✕ in the corner turns
     * every form dialog into one that needs a click before it can be typed in.
     */
    //
    // Not into an AI wait card, though. A dialog that opens straight into a
    // wait (the quality check) has its close disabled while it works, and the
    // first control left was then the source link in the card's results chart:
    // focus landed on a footnote and scrolled the body past the dialog's own
    // title on a phone. The container takes it instead, so the title is what
    // is announced, and Tab still reaches the link.
    if (container && !startedInside) {
      const focusable = focusableWithin(container).filter((el) => !el.closest('.ai-wait-card'));
      (focusable[0] ?? container).focus?.();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      // Only the topmost dialog contains focus; the ones beneath it are as
      // inert as the page behind them.
      if (trapStack[trapStack.length - 1] !== entry) return;

      const el = containerRef.current;
      if (!el) return;
      const focusable = focusableWithin(el);
      const { regions, stops } = companionsOutside(el);

      // The dialog's own stops. With no controls at all the dialog itself is
      // the only place to stand, so keep focus on it rather than letting Tab
      // wander off into the page underneath.
      const own = focusable.length > 0 ? focusable : [el];
      const first = own[0];
      const last = own[own.length - 1];
      const companionFirst = stops[0];
      const companionLast = stops[stops.length - 1];
      const activeEl = document.activeElement;
      const forward = !e.shiftKey;

      const inDialog = el.contains(activeEl);
      const inCompanion = regions.some((region) => region.contains(activeEl));

      // Focus outside the dialog and outside any companion (a click on the
      // page behind, a stray programmatic focus) — pull it back rather than
      // letting the wrap-around logic silently no-op. Only a region the app
      // has marked as a companion is exempt: that is a deliberate hand-off to a
      // layer painted above the dialog, not an escape.
      if (!inDialog && !inCompanion) {
        e.preventDefault();
        (forward ? first : last).focus?.();
        return;
      }

      /**
       * The cycle is the dialog's controls, then each companion's, then round
       * to the start. Only the edges are intercepted; between two controls in
       * the same region the browser's own Tab order is left to do its work
       * (radio groups, a control that moves focus itself).
       */
      let target: HTMLElement | null = null;
      if (inDialog) {
        if (focusable.length === 0) {
          target = (forward ? companionFirst : companionLast) ?? el;
        } else if (forward && activeEl === last) {
          target = companionFirst ?? first;
        } else if (!forward && activeEl === first) {
          target = companionLast ?? last;
        }
      } else if (forward && (!companionLast || activeEl === companionLast)) {
        target = first;
      } else if (!forward && (!companionFirst || activeEl === companionFirst)) {
        target = last;
      }

      if (target) {
        e.preventDefault();
        target.focus?.();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      const index = trapStack.indexOf(entry);
      if (index !== -1) trapStack.splice(index, 1);
      document.removeEventListener('keydown', onKeyDown);

      /**
       * Hand focus back — after React has finished closing the dialog.
       *
       * Synchronously here is too early. Closing a dialog updates state in the
       * surface that owns it, so the re-render that follows can replace the
       * opener's DOM node: focus lands on the old element and is silently
       * dropped when React swaps it, leaving the user on `<body>` — the very
       * thing this restore exists to prevent, and invisible in a unit test
       * where nothing else re-renders. One frame later the tree has settled.
       *
       * Whether the frame still hands focus back is decided when it lands, by
       * `restoreFocus`, not here: see there for the close-then-open case.
       */
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => restoreFocus(previouslyFocused));
      } else restoreFocus(previouslyFocused);
    };
  }, [active]);

  return containerRef;
};
