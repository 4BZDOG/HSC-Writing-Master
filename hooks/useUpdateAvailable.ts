import { useCallback, useEffect, useState } from 'react';
import {
  CURRENT_BUILD_ID,
  fetchDeployedBuildId,
  isNewerBuild,
  isUpdateCheckEnabled,
} from '../utils/buildVersion';

/** Often enough to catch a deploy within a lesson, rare enough to be free. */
export const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Whether a newer deploy exists than the one this tab loaded. Checks on a
 * timer and whenever the tab becomes visible again (the usual way a stale tab
 * is noticed: someone comes back to a laptop that slept overnight).
 *
 * `dismiss` hides the notice for that one deploy only; a still-newer deploy
 * brings it back.
 */
export const useUpdateAvailable = (
  currentBuild: string = CURRENT_BUILD_ID,
  intervalMs: number = UPDATE_CHECK_INTERVAL_MS
): { updateAvailable: boolean; dismiss: () => void } => {
  const [deployed, setDeployed] = useState<string | null>(null);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!isUpdateCheckEnabled(currentBuild)) return;
    let cancelled = false;

    const check = async () => {
      const id = await fetchDeployedBuildId();
      if (!cancelled && id) setDeployed(id);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void check();
    }, intervalMs);
    document.addEventListener('visibilitychange', onVisible);
    void check();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [currentBuild, intervalMs]);

  const dismiss = useCallback(() => setDismissedFor(deployed), [deployed]);

  return {
    updateAvailable: isNewerBuild(currentBuild, deployed) && deployed !== dismissedFor,
    dismiss,
  };
};
