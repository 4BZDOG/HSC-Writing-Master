import { useEffect } from 'react';

/**
 * Freezes the page behind an overlay.
 *
 * The app scrolls the document itself, and every modal is a `fixed inset-0`
 * layer painted over it. Without this, a wheel gesture over any part of a
 * modal that is not itself scrollable — the header, the padding, a settled
 * form — went straight through to the page underneath, so the background
 * crept up and down while the student was reading the dialog. On a trackpad
 * this happens constantly: the pointer only has to drift off the scrollable
 * body of the dialog for one frame.
 *
 * The lock goes on <html> as well as <body>. <html> is the element that
 * actually scrolls the viewport, so locking <body> alone changed nothing —
 * the page kept moving under the wheel.
 *
 * Refcounted, so a dialog layered over another dialog (confirmations, upgrade
 * prompts) doesn't release the lock when the topmost one closes; the
 * compensating padding stops the page jumping sideways as the scrollbar is
 * removed, and the scroll offset is restored on release in case the browser
 * clamps it while the document is unscrollable.
 *
 * Deliberately NOT folded into `useEscapeKey`: several modals detach their
 * Escape handler while an AI request is in flight, which is exactly when the
 * page must stay put.
 */

let locks = 0;
/** Inline styles as they were before the first lock, restored after the last. */
let restore: {
  htmlOverflow: string;
  position: string;
  top: string;
  width: string;
  paddingRight: string;
  scrollY: number;
} = { htmlOverflow: '', position: '', top: '', width: '', paddingRight: '', scrollY: 0 };

export const useScrollLock = (active: boolean): void => {
  useEffect(() => {
    if (!active || typeof document === 'undefined' || !document.body) return;
    const html = document.documentElement;
    const body = document.body;

    if (locks === 0) {
      const scrollY = window.scrollY;
      restore = {
        htmlOverflow: html.style.overflow,
        position: body.style.position,
        top: body.style.top,
        width: body.style.width,
        paddingRight: body.style.paddingRight,
        scrollY,
      };
      // The classic scrollbar-width gap. Zero on overlay-scrollbar platforms
      // (macOS, touch), so nothing is added where nothing is taken away.
      const gutter = window.innerWidth - html.clientWidth;
      if (gutter > 0) body.style.paddingRight = `${gutter}px`;
      // Pinning <body> and offsetting it by the current scroll position keeps
      // the page looking exactly as it did behind the blur. Locking overflow
      // alone made an unscrollable document, and the browser clamped the
      // offset to zero — so opening a modal snapped the background to the top
      // of the page and closing it dropped the student back there.
      body.style.position = 'fixed';
      body.style.top = `-${scrollY}px`;
      body.style.width = '100%';
      html.style.overflow = 'hidden';
    }
    locks += 1;

    return () => {
      locks = Math.max(0, locks - 1);
      if (locks === 0) {
        html.style.overflow = restore.htmlOverflow;
        body.style.position = restore.position;
        body.style.top = restore.top;
        body.style.width = restore.width;
        body.style.paddingRight = restore.paddingRight;
        // `position: fixed` took the page out of flow, so the viewport is back
        // at zero — put the student where they were reading. The reflow read
        // is load-bearing: without it the document is still one viewport tall
        // when the scroll is requested, the offset is clamped to zero, and
        // React 19's double-invoked effects then re-lock from the top of the
        // page — which is exactly how a modal used to jump the background.
        if (restore.scrollY > 0) {
          void body.offsetHeight;
          window.scrollTo(0, restore.scrollY);
        }
      }
    };
  }, [active]);
};

export default useScrollLock;
