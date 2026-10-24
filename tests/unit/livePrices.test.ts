import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The client's live prices. The service asks `/api/prices` once per session and
 * never throws: a timeout, a refusal, a dropped network or a malformed body all
 * leave the screens on the env text. These tests pin each of those paths, plus
 * the pure merge that decides which text and which GST note each price shows.
 */

import {
  LIVE_PRICES_TIMEOUT_MS,
  fallbackPlanPrices,
  formatAudAmount,
  gstNoteFor,
  loadLivePrices,
  mergePlanPrices,
  parseAudDisplay,
  parseLivePrices,
  peekLivePrices,
  resetLivePricesForTests,
  yearlySavingNote,
  type LivePrices,
} from '../../services/livePrices';
import { planPriceLine } from '../../utils/planComparison';

const LIVE_BODY = {
  prices: {
    plusMonthly: {
      amount: 9,
      currency: 'aud',
      interval: 'month',
      display: 'A$9',
      taxBehavior: 'inclusive',
    },
    plusYearly: {
      amount: 65,
      currency: 'aud',
      interval: 'year',
      display: 'A$65',
      taxBehavior: 'inclusive',
    },
    schoolSeat: {
      amount: 5,
      currency: 'aud',
      interval: 'year',
      display: 'A$5',
      taxBehavior: 'exclusive',
    },
  },
};

const okResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

const fetchMock = vi.fn();

beforeEach(() => {
  resetLivePricesForTests();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('loadLivePrices: the answer arrives', () => {
  it('asks the price endpoint and keeps what it returns', async () => {
    fetchMock.mockResolvedValue(okResponse(LIVE_BODY));

    const prices = await loadLivePrices();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/prices$/);
    expect(prices?.plusMonthly?.display).toBe('A$9');
    expect(peekLivePrices()).toEqual(prices);
  });

  it('shares one request between every caller in the session', async () => {
    fetchMock.mockResolvedValue(okResponse(LIVE_BODY));

    const [a, b] = await Promise.all([loadLivePrices(), loadLivePrices()]);
    await loadLivePrices();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  it('drops a single price whose shape is wrong and keeps the rest', () => {
    const parsed = parseLivePrices({
      prices: {
        plusMonthly: { amount: 9, currency: 'aud', interval: 'month', display: 'A$9' },
        plusYearly: LIVE_BODY.prices.plusYearly,
      },
    });

    expect(parsed?.plusMonthly).toBeUndefined();
    expect(parsed?.plusYearly?.display).toBe('A$65');
  });
});

describe('loadLivePrices: every failure falls back and never throws', () => {
  it('a timeout after four seconds resolves to null', async () => {
    vi.useFakeTimers();
    // A request that never answers, and ignores the abort it is sent.
    fetchMock.mockReturnValue(new Promise(() => {}));

    const pending = loadLivePrices();
    await vi.advanceTimersByTimeAsync(LIVE_PRICES_TIMEOUT_MS);

    await expect(pending).resolves.toBeNull();
    expect(LIVE_PRICES_TIMEOUT_MS).toBe(4000);
  });

  it('a non-200 answer resolves to null', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });

    await expect(loadLivePrices()).resolves.toBeNull();
    expect(peekLivePrices()).toBeNull();
  });

  it('a network error resolves to null rather than rejecting', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(loadLivePrices()).resolves.toBeNull();
  });

  it('a body that is not JSON resolves to null', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    });

    await expect(loadLivePrices()).resolves.toBeNull();
  });

  it('a body without a prices object resolves to null', async () => {
    fetchMock.mockResolvedValue(okResponse({ error: 'nope' }));

    await expect(loadLivePrices()).resolves.toBeNull();
  });

  it('remembers a failure, so the session does not ask again', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await loadLivePrices();
    await loadLivePrices();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('the text the screens show', () => {
  it('falls back to the env text, with no GST claim, when there are no live prices', () => {
    const text = mergePlanPrices(null);

    expect(text.monthly).toBe('A$7.99');
    expect(text.yearly).toBe('A$59');
    expect(text.schoolSeat).toBe('A$4');
    expect(text.monthlyGst).toBeNull();
    expect(text.yearlyGst).toBeNull();
    expect(text.schoolSeatGst).toBeNull();
  });

  it('shows the live amount in place of the env text, with its GST status', () => {
    const live = parseLivePrices(LIVE_BODY) as LivePrices;
    const text = mergePlanPrices(live);

    expect(text.monthly).toBe('A$9');
    expect(text.yearly).toBe('A$65');
    expect(text.schoolSeat).toBe('A$5');
    expect(text.monthlyGst).toBe('incl. GST');
    expect(text.schoolSeatGst).toBe('+ GST');
  });

  it('keeps the env text for a price the live answer did not include', () => {
    const text = mergePlanPrices({ plusMonthly: LIVE_BODY.prices.plusMonthly as never });

    expect(text.monthly).toBe('A$9');
    expect(text.yearly).toBe(fallbackPlanPrices().yearly);
    expect(text.yearlyGst).toBeNull();
  });

  it('says nothing about GST for a price whose tax behaviour is unspecified', () => {
    const text = mergePlanPrices({
      schoolSeat: { ...LIVE_BODY.prices.schoolSeat, taxBehavior: 'unspecified' } as never,
    });

    expect(text.schoolSeat).toBe('A$5');
    expect(text.schoolSeatGst).toBeNull();
  });

  it('maps only inclusive and exclusive to wording', () => {
    expect(gstNoteFor('inclusive')).toBe('incl. GST');
    expect(gstNoteFor('exclusive')).toBe('+ GST');
    expect(gstNoteFor('unspecified')).toBeNull();
    expect(gstNoteFor(undefined)).toBeNull();
  });

  it('the env fallback keeps its existing values', () => {
    expect(fallbackPlanPrices()).toMatchObject({
      monthly: 'A$7.99',
      yearly: 'A$59',
      schoolSeat: 'A$4',
    });
  });
});

describe('planPriceLine', () => {
  it('reads the env text when no prices are passed, as the cards did before', () => {
    expect(planPriceLine('plus')).toBe('A$59/year or A$7.99/month');
    expect(planPriceLine('school')).toBe('A$4 per student, per year');
    expect(planPriceLine('free')).toBe('Free, always');
  });

  it('shows live prices and the GST note when both plus prices agree on it', () => {
    const prices = mergePlanPrices(parseLivePrices(LIVE_BODY));

    expect(planPriceLine('plus', prices)).toBe('A$65/year or A$9/month incl. GST');
    expect(planPriceLine('school', prices)).toBe('A$5 per student, per year + GST');
  });

  it('says no GST for the plus line when its two prices disagree', () => {
    const prices = mergePlanPrices({
      plusMonthly: LIVE_BODY.prices.plusMonthly as never,
      plusYearly: { ...LIVE_BODY.prices.plusYearly, taxBehavior: 'exclusive' } as never,
    });

    expect(planPriceLine('plus', prices)).toBe('A$65/year or A$9/month');
  });
});

describe('the yearly saving line', () => {
  it('is worked out from the two prices, rounded down so it never overstates the saving', () => {
    // 59 / (7.99 × 12) is 61.5% of paying monthly: a 38.5% saving, said as 38%.
    expect(yearlySavingNote(7.99, 59)).toBe('Save 38% — A$4.92 a month');
    expect(yearlySavingNote(10, 120)).toBeNull();
    expect(yearlySavingNote(10, 130)).toBeNull();
    expect(yearlySavingNote(0, 59)).toBeNull();
  });

  it('follows the live prices once they arrive, rather than the env text', () => {
    const text = mergePlanPrices(parseLivePrices(LIVE_BODY));
    // 65 / (9 × 12) = 60.2%: a 39.8% saving, said as 39%.
    expect(text.yearlyNote).toBe('Save 39% — A$5.42 a month');
  });

  it('works it out from one live price and the other env price, which are both on screen', () => {
    const text = mergePlanPrices({ plusYearly: LIVE_BODY.prices.plusYearly as never });
    // A$65 a year against the env A$7.99 a month.
    expect(text.yearly).toBe('A$65');
    expect(text.yearlyNote).toBe('Save 32% — A$5.42 a month');
  });

  it('says nothing when the two prices disagree about GST, which would compare unlike figures', () => {
    const text = mergePlanPrices({
      plusMonthly: LIVE_BODY.prices.plusMonthly as never,
      plusYearly: { ...LIVE_BODY.prices.plusYearly, taxBehavior: 'exclusive' } as never,
    });
    expect(text.yearlyNote).toBe('');
  });

  it('says nothing when the yearly price saves nothing', () => {
    const text = mergePlanPrices({
      plusMonthly: LIVE_BODY.prices.plusMonthly as never,
      plusYearly: { ...LIVE_BODY.prices.plusYearly, amount: 120, display: 'A$120' } as never,
    });
    expect(text.yearlyNote).toBe('');
  });

  it('keeps an operator’s own note while the env prices it was written for are shown', () => {
    expect(fallbackPlanPrices('Two months free').yearlyNote).toBe('Two months free');
    expect(mergePlanPrices(null, fallbackPlanPrices('Two months free')).yearlyNote).toBe(
      'Two months free'
    );
  });

  it('works the env note out from the env prices when no note is set', () => {
    expect(fallbackPlanPrices(undefined).yearlyNote).toBe('Save 38% — A$4.92 a month');
  });
});

describe('amounts for the screens that do sums', () => {
  it('reads only a plain dollar figure from the env text', () => {
    expect(parseAudDisplay('A$7.99')).toBe(7.99);
    expect(parseAudDisplay('$59')).toBe(59);
    expect(parseAudDisplay('AU$4')).toBe(4);
    expect(parseAudDisplay('A$4–6')).toBeNull();
    expect(parseAudDisplay('Contact us')).toBeNull();
    expect(parseAudDisplay('A$0')).toBeNull();
  });

  it('prints whole dollars without cents and anything else with two', () => {
    expect(formatAudAmount(120)).toBe('A$120');
    expect(formatAudAmount(4.9166)).toBe('A$4.92');
    expect(formatAudAmount(0.1 + 0.2)).toBe('A$0.30');
  });

  it('carries the live amount and the seat interval through the merge', () => {
    const text = mergePlanPrices(parseLivePrices(LIVE_BODY));
    expect(text.schoolSeatAmount).toBe(5);
    expect(text.schoolSeatInterval).toBe('year');
    expect(fallbackPlanPrices().schoolSeatAmount).toBe(4);
  });

  it('prices a School seat by the interval Stripe charges it on', () => {
    const prices = mergePlanPrices({
      schoolSeat: { ...LIVE_BODY.prices.schoolSeat, interval: 'month' } as never,
    });
    expect(planPriceLine('school', prices)).toBe('A$5 per student, per month + GST');
  });
});
