import { useEffect, useMemo, useState } from 'react';
import {
  loadLivePrices,
  mergePlanPrices,
  peekLivePrices,
  type LivePrices,
  type PlanPriceText,
} from '../services/livePrices';

/**
 * The price text for the screens: the live Stripe price where one has arrived,
 * otherwise the env text.
 *
 * The first render uses whatever is already in memory, so a second screen opened
 * in the same session shows live prices at once. A screen that mounts first shows
 * the env text until the single request answers, then re-renders with the live
 * values. A failed request leaves the env text in place for the session.
 *
 * The yearly saving line is still the env text. It is not recomputed from the
 * live prices, so it can go stale if the yearly price changes on its own.
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
