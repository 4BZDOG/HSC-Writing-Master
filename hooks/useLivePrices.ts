import { useEffect, useMemo, useState } from 'react';
import {
  loadLivePrices,
  mergePlanPrices,
  peekLivePrices,
  type LivePrices,
  type OneOffPrice,
  type PlanPriceText,
} from '../services/livePrices';
import { courseUnlocksEnabled } from '../services/courseAccess';

/**
 * The price text for the screens: the live Stripe price where one has arrived,
 * otherwise the env text.
 *
 * The first render uses whatever is already in memory, so a second screen opened
 * in the same session shows live prices at once. A screen that mounts first shows
 * the env text until the single request answers, then re-renders with the live
 * values. A failed request leaves the env text in place for the session.
 *
 * The yearly saving line is worked out from the live prices once they arrive
 * (mergePlanPrices), so it always matches the two figures on screen.
 */
export const useLivePrices = (): PlanPriceText => {
  const [live, setLive] = useState<LivePrices | null>(() => peekLivePrices());

  useEffect(() => {
    let active = true;
    void loadLivePrices().then((prices) => {
      if (active) setLive(prices);
    });
    return () => {
      active = false;
    };
  }, []);

  return useMemo(() => mergePlanPrices(live), [live]);
};

/**
 * The one-off course unlock price, or null when there is none to show. With unlocks
 * off this asks for nothing: the price request is only made where a price is shown.
 */
export const useCourseUnlockPrice = (): OneOffPrice | null => {
  const enabled = courseUnlocksEnabled();
  const [live, setLive] = useState<LivePrices | null>(() => (enabled ? peekLivePrices() : null));

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void loadLivePrices().then((prices) => {
      if (active) setLive(prices);
    });
    return () => {
      active = false;
    };
  }, [enabled]);

  return enabled ? (live?.courseUnlock ?? null) : null;
};
