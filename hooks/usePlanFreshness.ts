import { useEffect, useRef } from 'react';
import type { User } from '../types';
import { authService } from '../services/authService';
import {
  createPlanFreshness,
  type PlanNotice,
  type PlanFreshnessDeps,
} from '../utils/planFreshness';

interface UsePlanFreshnessOptions {
  /** The signed-in user, or null. Guests and signed-out users are never refreshed. */
  user: User | null;
  /** Receives the refreshed user when a plan field moved. Should merge, not replace. */
  onChange: (refreshed: User) => void;
  /** Shows a toast, normally `showToast`. Called once per change. */
  notify: (message: string, type: PlanNotice['type']) => void;
  /** Test seams. The defaults are the real session refresh and the real clock. */
  refresh?: PlanFreshnessDeps['refresh'];
  now?: PlanFreshnessDeps['now'];
  intervalMs?: number;
}

/**
 * Re-reads the signed-in person's plan when they come back to the tab, or when
 * the connection returns, so a licence bought (or lapsed) elsewhere reaches
 * them without a reload. The decisions live in `utils/planFreshness.ts`; this
 * hook only attaches the two listeners and removes them again on unmount.
 *
 * Mount it once, from the component that owns the user state.
 */
export const usePlanFreshness = ({
  user,
  onChange,
  notify,
  refresh = (u) => authService.refreshSession(u),
  now = () => Date.now(),
  intervalMs,
}: UsePlanFreshnessOptions): void => {
  // The listeners are attached once, so they read the latest values through refs
  // rather than closing over the first render's.
  const userRef = useRef(user);
  const handlersRef = useRef({ onChange, notify });
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  useEffect(() => {
    handlersRef.current = { onChange, notify };
  });

  // The test seams are read once, when the listeners are attached.
  const seams = useRef({ refresh, now, intervalMs });

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const freshness = createPlanFreshness(
      {
        getUser: () => userRef.current,
        refresh: seams.current.refresh,
        now: seams.current.now,
        onChange: (refreshed) => handlersRef.current.onChange(refreshed),
        notify: (notice) => handlersRef.current.notify(notice.message, notice.type),
      },
      seams.current.intervalMs
    );

    const onVisible = () => {
      if (document.visibilityState === 'visible') void freshness.check();
    };
    const onOnline = () => {
      void freshness.check();
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, []);
};
