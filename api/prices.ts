/**
 * GET /api/prices
 *
 * The plan prices as Stripe charges them, for the upgrade prompt, the plan
 * comparison and the School licence panel, so the screens cannot drift from the
 * amount on the Stripe Price. Public: a price is not a secret, and the page asks
 * before anyone has signed in. Price IDs are never returned.
 *
 * Quiet by design. An unconfigured Stripe, a price that cannot be read, or a
 * price that is not a plain AUD subscription price is simply left out, and the
 * client shows its env text for it. The response is 200 whatever happens here.
 */
import type Stripe from 'stripe';
import { getStripe } from './_lib/stripe';
import { corsHeadersFor } from './_lib/cors';

export interface PublicPrice {
  /** Whole dollars, or dollars and cents, e.g. 59 or 7.99. */
  amount: number;
  currency: 'aud';
  interval: 'month' | 'year';
  /** Ready to show: 'A$59', 'A$7.99'. */
  display: string;
  taxBehavior: 'inclusive' | 'exclusive' | 'unspecified';
}

export interface PublicPrices {
  plusMonthly?: PublicPrice;
  plusYearly?: PublicPrice;
  schoolSeat?: PublicPrice;
}

type PriceKey = keyof PublicPrices;

interface RequestLike {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
}
interface ResponseLike {
  status: (code: number) => ResponseLike;
  json: (data: unknown) => void;
  setHeader?: (name: string, value: string) => void;
  end?: () => void;
}

const headerValue = (raw: string | string[] | undefined): string | undefined =>
  Array.isArray(raw) ? raw[0] : raw;

/** Ten minutes in memory per instance; the CDN holds the answer for five. */
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=600';

let clock: () => number = () => Date.now();
let cached: { prices: PublicPrices; at: number } | null = null;

/** Tests inject a clock so expiry can be exercised without waiting. */
export const setPriceClock = (now: () => number): void => {
  clock = now;
};

/** Tests start from an empty cache. */
export const resetPriceCache = (): void => {
  cached = null;
};

/**
 * Whole dollars print without cents, anything else with two. ICU's en-AU prints
 * AUD with a bare "$" on some builds, so the prefix is normalised to "A$", which
 * is how this app writes Australian dollars everywhere else.
 */
export const formatAud = (amount: number): string => {
  const whole = Number.isInteger(amount);
  const text = new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: whole ? 0 : 2,
  }).format(amount);
  return text.replace(/^(AU)?\$/, () => 'A$');
};

/** The configured price IDs, each with the slot it fills. Unset slots are left out. */
const configuredIds = (): Array<[PriceKey, string]> => {
  const slots: Array<[PriceKey, string | undefined]> = [
    ['plusMonthly', process.env.STRIPE_PLUS_MONTHLY_PRICE_ID],
    ['plusYearly', process.env.STRIPE_PLUS_YEARLY_PRICE_ID],
    ['schoolSeat', process.env.STRIPE_SCHOOL_PRICE_ID],
  ];
  return slots.filter((slot): slot is [PriceKey, string] => !!slot[1]);
};

/**
 * The public shape of one Stripe Price, or null when it cannot be shown as a
 * plain price: inactive, not AUD, one-time, tiered, metered, or no flat amount.
 */
export const toPublicPrice = (price: Stripe.Price): PublicPrice | null => {
  if (!price.active) return null;
  if (price.currency?.toLowerCase() !== 'aud') return null;
  if (price.unit_amount == null || price.billing_scheme === 'tiered') return null;
  const interval = price.recurring?.interval;
  if (interval !== 'month' && interval !== 'year') return null;
  if (price.recurring?.usage_type === 'metered') return null;
  const amount = price.unit_amount / 100;
  return {
    amount,
    currency: 'aud',
    interval,
    display: formatAud(amount),
    taxBehavior: price.tax_behavior ?? 'unspecified',
  };
};

/**
 * The current prices: the cache while it is fresh, otherwise a read from Stripe.
 *
 * If every configured price fails to read, Stripe itself is the problem, so the
 * last good answer is served (or nothing, with no earlier answer). That answer is
 * not cached, so the next request tries Stripe again. A single failing price is
 * left out and the others are cached as read.
 */
const currentPrices = async (): Promise<PublicPrices> => {
  const at = clock();
  if (cached && at - cached.at < CACHE_TTL_MS) return cached.prices;

  const stripe = getStripe();
  const ids = configuredIds();
  if (!stripe || ids.length === 0) return {};

  const settled = await Promise.allSettled(ids.map(([, id]) => stripe.prices.retrieve(id)));

  if (settled.every((result) => result.status === 'rejected')) {
    console.error('[prices] Stripe price lookup failed; serving the last good answer.');
    return cached?.prices ?? {};
  }

  const prices: PublicPrices = {};
  settled.forEach((result, i) => {
    const key = ids[i][0];
    if (result.status === 'rejected') {
      console.error(
        '[prices] one price could not be read:',
        result.reason instanceof Error ? result.reason.message : 'unknown error'
      );
      return;
    }
    const price = toPublicPrice(result.value);
    if (price) prices[key] = price;
  });

  cached = { prices, at };
  return prices;
};

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
  // Same CORS preamble as api/customer-portal.ts. The one difference is the
  // methods the preflight advertises: this endpoint is a GET.
  const cors = corsHeadersFor(headerValue(req.headers?.origin), process.env.ALLOWED_ORIGIN);
  if (cors && res.setHeader) {
    for (const [name, value] of Object.entries({
      ...cors,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    })) {
      res.setHeader(name, value);
    }
  }
  if (req.method === 'OPTIONS') {
    if (cors && res.end) {
      res.status(204);
      res.end();
    } else {
      res.status(403).json({ error: 'Cross-origin access is not enabled for this origin.' });
    }
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed. Use GET.' });
    return;
  }

  const prices = await currentPrices();
  res.setHeader?.('Cache-Control', CACHE_CONTROL);
  res.status(200).json({ prices });
}
