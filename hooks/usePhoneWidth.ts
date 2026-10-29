import { useSyncExternalStore } from 'react';

/** Below Tailwind's `sm` breakpoint (640px). */
const PHONE_QUERY = '(max-width: 639.98px)';

const query = (): MediaQueryList | null =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(PHONE_QUERY)
    : null;

const subscribe = (onChange: () => void): (() => void) => {
  const list = query();
  list?.addEventListener?.('change', onChange);
  return () => list?.removeEventListener?.('change', onChange);
};

const isPhone = (): boolean => query()?.matches ?? false;

/**
 * Whether the window is narrower than `sm`, for the few places that draw a
 * control in a different spot on a phone rather than only restyling it.
 *
 * Two copies of a control, one hidden with `sm:hidden`, are both mounted: the
 * screen reader is spared (`display: none` leaves the tree), but anything that
 * finds the control by its name (a test, a focus hand-off) meets two. A
 * component that moves a control renders it once, where this says it goes.
 * Without `matchMedia` (jsdom, a server render) it answers false: the
 * `sm`-and-up layout.
 */
export const usePhoneWidth = (): boolean => useSyncExternalStore(subscribe, isPhone, () => false);
