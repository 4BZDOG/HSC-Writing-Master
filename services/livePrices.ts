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
 * Each amount is the same price as a number of dollars, or null when the display
 * text is not a plain dollar figure, so a screen that does sums with it (a seat
 * total, the yearly saving) says nothing rather than guessing.
 */
export interface PlanPriceText {
  monthly: string;
  yearly: string;
  /** The yearly saving over paying monthly, or '' when it cannot be stated truthfully. */
  yearlyNote: string;
  schoolSeat: string;
  /** How often a School seat is charged. The live price says; the env text is yearly. */
  schoolSeatInterval: 'month' | 'year';
  monthlyGst: string | null;
  yearlyGst: string | null;
  schoolSeatGst: string | null;
  monthlyAmount: number | null;
  yearlyAmount: number | null;
  schoolSeatAmount: number | null;
}

/** Stripe's tax_behavior, in the words the app shows. Unspecified says nothing. */
const GST_NOTE: Record<TaxBehavior, string | null> = {
  inclusive: 'incl. GST',
  exclusive: '+ GST',
  unspecified: null,
};

export const gstNoteFor = (taxBehavior: TaxBehavior | undefined): string | null =>
  taxBehavior ? GST_NOTE[taxBehavior] : null;

/**
 * The dollars in a display string such as 'A$7.99' or '$59', or null for anything
 * else ('Contact us', 'A$4–6'). The env text is typed by hand, so only a plain
 * figure is trusted for arithmetic.
 */
export const parseAudDisplay = (text: string | undefined): number | null => {
  const match = /^\s*(?:A\$|AU\$|\$)\s?(\d+(?:\.\d{1,2})?)\s*$/.exec(text ?? '');
  if (!match) return null;
  const amount = Number(match[1]);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
};

/**
 * Dollars as this app writes them: 'A$59' for whole dollars, 'A$4.92' otherwise.
 * The same rule as api/prices.ts formatAud, which the client cannot import.
 */
export const formatAudAmount = (amount: number): string => {
  const cents = Math.round(amount * 100);
  return cents % 100 === 0 ? `A$${cents / 100}` : `A$${(cents / 100).toFixed(2)}`;
};

/**
 * "Save 38% — A$4.92 a month", worked out from the two prices on screen, or null
 * when the yearly price saves nothing. The percentage is rounded down, so the
 * saving is never overstated.
 */
export const yearlySavingNote = (monthly: number, yearly: number): string | null => {
  if (!(monthly > 0) || !(yearly > 0)) return null;
  const percent = Math.floor((1 - yearly / (monthly * 12)) * 100);
  if (percent < 1) return null;
  return `Save ${percent}% — ${formatAudAmount(yearly / 12)} a month`;
};

/**
 * The env-backed text, with no GST claim. This is what the screens showed before.
 *
 * The yearly saving is VITE_PLUS_YEARLY_NOTE when a deployment sets it. Otherwise it
 * is worked out from the two env prices, so a deployment that changes a price
 * without the note is not left advertising the shipped "Save 38%".
 */
export const fallbackPlanPrices = (
  explicitYearlyNote: string | undefined = import.meta.env?.VITE_PLUS_YEARLY_NOTE
): PlanPriceText => {
  const monthlyAmount = parseAudDisplay(PLAN_PRICING.monthly);
  const yearlyAmount = parseAudDisplay(PLAN_PRICING.yearly);
  const worked =
    monthlyAmount !== null && yearlyAmount !== null
      ? yearlySavingNote(monthlyAmount, yearlyAmount)
      : null;
  return {
    monthly: PLAN_PRICING.monthly,
    yearly: PLAN_PRICING.yearly,
    yearlyNote: explicitYearlyNote ?? worked ?? '',
    schoolSeat: PLAN_PRICING.schoolSeat,
    schoolSeatInterval: 'year',
    monthlyGst: null,
    yearlyGst: null,
    schoolSeatGst: null,
    monthlyAmount,
    yearlyAmount,
    schoolSeatAmount: parseAudDisplay(PLAN_PRICING.schoolSeat),
  };
};

/**
 * Live where a live price exists, otherwise the fallback. Pure. A live price that
 * says `unspecified` shows no GST wording, rather than the fallback's.
 *
 * The yearly saving is the env text (VITE_PLUS_YEARLY_NOTE) only while both Plus
 * prices are the env text it was written for. Once either price is live, the note
 * is worked out from the two figures on screen, so it cannot go on claiming a
 * saving the live prices do not give. Two prices that disagree about GST are not
 * compared at all.
 */
export const mergePlanPrices = (
  live: LivePrices | null,
  fallback: PlanPriceText = fallbackPlanPrices()
): PlanPriceText => {
  const gst = (price: LivePrice | undefined, fallbackNote: string | null): string | null =>
    price ? gstNoteFor(price.taxBehavior) : fallbackNote;
  const monthlyAmount = live?.plusMonthly?.amount ?? fallback.monthlyAmount;
  const yearlyAmount = live?.plusYearly?.amount ?? fallback.yearlyAmount;
  const monthlyGst = gst(live?.plusMonthly, fallback.monthlyGst);
  const yearlyGst = gst(live?.plusYearly, fallback.yearlyGst);

  // One price including GST and the other excluding it would compare unlike figures.
  // A price that says nothing about GST is not a disagreement.
  const gstDisagrees = !!monthlyGst && !!yearlyGst && monthlyGst !== yearlyGst;
  let yearlyNote = fallback.yearlyNote;
  if (live?.plusMonthly || live?.plusYearly) {
    yearlyNote =
      monthlyAmount !== null && yearlyAmount !== null && !gstDisagrees
        ? (yearlySavingNote(monthlyAmount, yearlyAmount) ?? '')
        : '';
  }

  return {
    monthly: live?.plusMonthly?.display ?? fallback.monthly,
    yearly: live?.plusYearly?.display ?? fallback.yearly,
    yearlyNote,
    schoolSeat: live?.schoolSeat?.display ?? fallback.schoolSeat,
    schoolSeatInterval: live?.schoolSeat?.interval ?? fallback.schoolSeatInterval,
    monthlyGst,
    yearlyGst,
    schoolSeatGst: gst(live?.schoolSeat, fallback.schoolSeatGst),
    monthlyAmount,
    yearlyAmount,
    schoolSeatAmount: live?.schoolSeat?.amount ?? fallback.schoolSeatAmount,
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
