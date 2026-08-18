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
 *   2. Keep Tab and Shift+Tab inside it while it is open.
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
 */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

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
    if (container && !startedInside) {
      const focusable = focusableWithin(container);
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
      if (focusable.length === 0) {
        // Nothing to land on — keep focus on the dialog rather than letting
        // Tab wander off into the page underneath.
        e.preventDefault();
        el.focus?.();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeEl = document.activeElement;

      // Focus outside the dialog entirely (a click on the page behind, a
      // programmatic focus from a toast) — pull it back rather than letting
      // the wrap-around logic silently no-op.
      if (!el.contains(activeEl)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }

      if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
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
       * Re-checked at that point rather than trusting the earlier check: a
       * dialog that deletes the row which opened it leaves a detached node
       * behind, and focusing that puts focus nowhere at all.
       *
       * `preventScroll` is load-bearing, not decoration. `useScrollLock` has
       * just unpinned <body> and put the viewport back at the exact offset it
       * captured when the modal opened; a plain `.focus()` here immediately
       * scrolls the opener into view and undoes that, so closing any dialog
       * nudged the page by however far the opener sat from the scroll anchor.
       * Nothing is stranded offscreen by suppressing it: the position being
       * restored is the one the opener was clicked at.
       */
      const restore = () => {
        if (previouslyFocused && document.contains(previouslyFocused)) {
          previouslyFocused.focus?.({ preventScroll: true });
        }
      };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(restore);
      else restore();
    };
  }, [active]);

  return containerRef;
};
