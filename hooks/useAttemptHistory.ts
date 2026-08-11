import { useEffect, useState } from 'react';
import { fetchMyAttempts, AttemptSummary } from '../services/responseService';

/**
 * The caller's own marks for a set of questions, for the picker's personal
 * ordering.
 *
 * Deliberately quiet. Every failure mode — local mode with no backend, a guest
 * with no session, a lookup that errors — resolves to an empty map, and the
 * picker then shows exactly what it showed before this feature existed. There
 * is no loading state and no error surface, because nothing here is worth
 * interrupting a student's navigation for.
 *
 * One fetch per set of ids: the key is the sorted id list, so re-rendering the
 * picker (which happens on every keystroke in its search box) does not re-ask
 * the server, while moving to another dot point does.
 */
export const useAttemptHistory = (promptIds: string[]): Map<string, AttemptSummary> => {
  const [attempts, setAttempts] = useState<Map<string, AttemptSummary>>(new Map());
  const key = [...promptIds].sort().join('|');

  useEffect(() => {
    if (!key) {
      setAttempts(new Map());
      return;
    }

    let live = true;
    void fetchMyAttempts(key.split('|')).then((result) => {
      // A slower earlier request must not overwrite a later dot point's marks.
      if (live) setAttempts(result);
    });
    return () => {
      live = false;
    };
  }, [key]);

  return attempts;
};
