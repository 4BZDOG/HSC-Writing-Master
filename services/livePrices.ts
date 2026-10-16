/**
 * The plan prices as Stripe charges them, for every screen that shows a price.
 *
 * `/api/prices` answers with the live amount, the interval and whether GST is
 * included. This module asks once per session and keeps the answer in memory.
 * It never throws: a slow, failed or malformed answer leaves the screens on the
 * env text in PLAN_PRICING, which is what they showed before live prices existed.
 */
import { PLAN_PRICING } from './entitlements';

export type TaxBehavior = 'inclusive' | 'exclusive' | 'unspecified';

export interface LivePrice {
  amount: number;
  currency: 'aud';
  interval: 'month' | 'year';
  /** Ready to show, e.g. 'A$59'. */
  display: string;
  taxBehavior: TaxBehavior;
}

export interface LivePrices {
  plusMonthly?: LivePrice;
  plusYearly?: LivePrice;
  schoolSeat?: LivePrice;
}

/**
 * What the screens render. Each price is a display string; each GST field is the
 * words to put beside it, or null when nothing is known and so nothing is said.
 */
export interface PlanPriceText {
  monthly: string;
  yearly: string;
  yearlyNote: string;
  schoolSeat: string;
  monthlyGst: string | null;
  yearlyGst: string | null;
  schoolSeatGst: string | null;
}

/** Stripe's tax_behavior, in the words the app shows. Unspecified says nothing. */
const GST_NOTE: Record<TaxBehavior, string | null> = {
  inclusive: 'incl. GST',
  exclusive: '+ GST',
  unspecified: null,
};

export const gstNoteFor = (taxBehavior: TaxBehavior | undefined): string | null =>
  taxBehavior ? GST_NOTE[taxBehavior] : null;

/** The env-backed text, with no GST claim. This is what the screens showed before. */
export const fallbackPlanPrices = (): PlanPriceText => ({
  monthly: PLAN_PRICING.monthly,
  yearly: PLAN_PRICING.yearly,
  yearlyNote: PLAN_PRICING.yearlyNote,
  schoolSeat: PLAN_PRICING.schoolSeat,
  monthlyGst: null,
  yearlyGst: null,
  schoolSeatGst: null,
});

/**
 * Live where a live price exists, otherwise the fallback. Pure. A live price that
 * says `unspecified` shows no GST wording, rather than the fallback's.
 */
export const mergePlanPrices = (
  live: LivePrices | null,
  fallback: PlanPriceText = fallbackPlanPrices()
): PlanPriceText => {
  const gst = (price: LivePrice | undefined, fallbackNote: string | null): string | null =>
    price ? gstNoteFor(price.taxBehavior) : fallbackNote;
  return {
    monthly: live?.plusMonthly?.display ?? fallback.monthly,
    yearly: live?.plusYearly?.display ?? fallback.yearly,
    yearlyNote: fallback.yearlyNote,
    schoolSeat: live?.schoolSeat?.display ?? fallback.schoolSeat,
    monthlyGst: gst(live?.plusMonthly, fallback.monthlyGst),
    yearlyGst: gst(live?.plusYearly, fallback.yearlyGst),
    schoolSeatGst: gst(live?.schoolSeat, fallback.schoolSeatGst),
  };
};

const isTaxBehavior = (value: unknown): value is TaxBehavior =>
  value === 'inclusive' || value === 'exclusive' || value === 'unspecified';

const parseLivePrice = (raw: unknown): LivePrice | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.amount !== 'number' || r.currency !== 'aud') return undefined;
  if (r.interval !== 'month' && r.interval !== 'year') return undefined;
  if (typeof r.display !== 'string' || r.display.length === 0) return undefined;
  if (!isTaxBehavior(r.taxBehavior)) return undefined;
  return {
    amount: r.amount,
    currency: 'aud',
    interval: r.interval,
    display: r.display,
    taxBehavior: r.taxBehavior,
  };
};

/** Reads the endpoint's body. Anything that is not the expected shape is null. */
export const parseLivePrices = (body: unknown): LivePrices | null => {
  if (!body || typeof body !== 'object' || !('prices' in body)) return null;
  const prices = (body as { prices: unknown }).prices;
  if (!prices || typeof prices !== 'object') return null;
  const p = prices as Record<string, unknown>;
  return {
    plusMonthly: parseLivePrice(p.plusMonthly),
    plusYearly: parseLivePrice(p.plusYearly),
    schoolSeat: parseLivePrice(p.schoolSeat),
  };
};

/** How long the screens wait for prices before showing the env text. */
export const LIVE_PRICES_TIMEOUT_MS = 4000;

const apiBase = import.meta.env.VITE_API_BASE_URL ?? '';

let settled: LivePrices | null = null;
let request: Promise<LivePrices | null> | null = null;

/** Resolves to the live prices, or null on any failure. Never rejects. */
const fetchLivePrices = async (): Promise<LivePrices | null> => {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // The race means a fetch that ignores the abort still gives up on time.
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, LIVE_PRICES_TIMEOUT_MS);
  });
  const answer = (async (): Promise<LivePrices | null> => {
    const res = await fetch(`${apiBase}/api/prices`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return parseLivePrices(await res.json());
  })().catch(() => null);
  try {
    return await Promise.race([answer, timeout]);
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Asks for the live prices once per session. Every caller shares the same
 * request, and a failure is remembered too, so the screens never ask again.
 */
export const loadLivePrices = (): Promise<LivePrices | null> => {
  if (!request) {
    request = fetchLivePrices().then(
      (prices) => {
        settled = prices;
        return prices;
      },
      () => null
    );
  }
  return request;
};

/** The answer already in memory, or null when it has not arrived or failed. */
export const peekLivePrices = (): LivePrices | null => settled;

/** Tests start each case from nothing. */
export const resetLivePricesForTests = (): void => {
  settled = null;
  request = null;
};
