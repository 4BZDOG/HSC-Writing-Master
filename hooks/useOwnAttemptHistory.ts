import { useEffect, useState } from 'react';
import { fetchMyAttemptHistory } from '../services/responseService';
import type { OwnHistory } from '../utils/profileHistory';

/**
 * The signed-in student's own attempt history, read while the profile is open.
 *
 * Reads once per opening, so a student who has just marked an answer sees it on
 * the next visit to the profile rather than from a stale copy. Where there is no
 * online account to read from, the service resolves to `null` and the hook says
 * so with `local` rather than presenting an empty history.
 */
export const useOwnAttemptHistory = (enabled: boolean): OwnHistory => {
  const [history, setHistory] = useState<OwnHistory>({ status: 'loading' });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setHistory({ status: 'loading' });
    fetchMyAttemptHistory().then(
      (attempts) => {
        if (cancelled) return;
        setHistory(attempts === null ? { status: 'local' } : { status: 'ready', attempts });
      },
      () => {
        if (!cancelled) setHistory({ status: 'error' });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return history;
};
