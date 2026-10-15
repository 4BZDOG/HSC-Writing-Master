import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * GET /api/prices publishes the plan prices as Stripe charges them, so the
 * upgrade prompt, the plan comparison and the School panel can stop typing them
 * by hand. These tests pin what the screens rely on: the AUD text, the skips
 * (inactive, tiered, metered, not AUD), the per-price omission, the cache and its
 * expiry, the stale answer when Stripe is down, the fail-closed empty answer, and
 * the rule that no price ID ever leaves the server.
 *
 * Stripe is mocked. Nothing here reaches the network.
 */

const retrieve = vi.fn();
let stripeOn = true;

vi.mock('../../api/_lib/stripe', () => ({
  getStripe: () => (stripeOn ? { prices: { retrieve } } : null),
}));

import handler, {
  formatAud,
  resetPriceCache,
  setPriceClock,
  toPublicPrice,
} from '../../api/prices';

const ENV_KEYS = [
  'STRIPE_PLUS_MONTHLY_PRICE_ID',
  'STRIPE_PLUS_YEARLY_PRICE_ID',
  'STRIPE_SCHOOL_PRICE_ID',
  'ALLOWED_ORIGIN',
] as const;

const ALLOWED = 'https://app.example.com';
const TEN_MINUTES = 10 * 60 * 1000;

type Body = { prices?: Record<string, unknown>; error?: string };

const makeRes = () => ({
  statusCode: 0,
  ended: false,
  body: undefined as Body | undefined,
  headers: {} as Record<string, string>,
  status(code: number) {
    this.statusCode = code;
    return this;
  },
  json(data: unknown) {
    this.body = data as Body;
  },
  setHeader(name: string, value: string) {
    this.headers[name] = value;
  },
  end() {
    this.ended = true;
  },
});

/** A Stripe Price as the SDK returns it, with the fields the endpoint reads. */
const price = (overrides: Record<string, unknown> = {}) => ({
  id: 'price_x',
  active: true,
  currency: 'aud',
  unit_amount: 799,
  billing_scheme: 'per_unit',
  tax_behavior: 'inclusive',
  recurring: { interval: 'month', usage_type: 'licensed' },
  ...overrides,
});

const defaultPrices = (): Record<string, unknown> => ({
  price_m: price({ id: 'price_m', unit_amount: 799, tax_behavior: 'inclusive' }),
  price_y: price({
    id: 'price_y',
    unit_amount: 5900,
    tax_behavior: 'exclusive',
    recurring: { interval: 'year', usage_type: 'licensed' },
  }),
  price_s: price({
    id: 'price_s',
    unit_amount: 400,
    tax_behavior: 'unspecified',
    recurring: { interval: 'year', usage_type: 'licensed' },
  }),
});

/** What Stripe holds for each price ID. Reset before every test. */
let PRICES = defaultPrices();

/** Stripe answers each retrieve from PRICES, or rejects for an unknown id. */
const answerFromPrices = () =>
  retrieve.mockImplementation(async (id: string) => {
    if (id in PRICES) return PRICES[id];
    throw new Error(`No such price: ${id}`);
  });

const call = async () => {
  const res = makeRes();
  await handler({ method: 'GET', headers: {} }, res);
  return res;
};

let saved: Record<string, string | undefined> = {};
let now = 1_000_000;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  process.env.STRIPE_PLUS_MONTHLY_PRICE_ID = 'price_m';
  process.env.STRIPE_PLUS_YEARLY_PRICE_ID = 'price_y';
  process.env.STRIPE_SCHOOL_PRICE_ID = 'price_s';
  delete process.env.ALLOWED_ORIGIN;
  stripeOn = true;
  PRICES = defaultPrices();
  now = 1_000_000;
  setPriceClock(() => now);
  resetPriceCache();
  retrieve.mockReset();
  answerFromPrices();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  setPriceClock(() => Date.now());
  resetPriceCache();
  vi.restoreAllMocks();
});

describe('GET /api/prices: the happy path', () => {
  it('returns each configured price as Stripe charges it, in AUD, with its GST status', async () => {
    const res = await call();

    expect(res.statusCode).toBe(200);
    expect(res.body?.prices).toEqual({
      plusMonthly: {
        amount: 7.99,
        currency: 'aud',
        interval: 'month',
        display: 'A$7.99',
        taxBehavior: 'inclusive',
      },
      plusYearly: {
        amount: 59,
        currency: 'aud',
        interval: 'year',
        display: 'A$59',
        taxBehavior: 'exclusive',
      },
      schoolSeat: {
        amount: 4,
        currency: 'aud',
        interval: 'year',
        display: 'A$4',
        taxBehavior: 'unspecified',
      },
    });
  });

  it('sets the cache headers the CDN and the browser are meant to use', async () => {
    const res = await call();

    expect(res.headers['Cache-Control']).toBe('public, s-maxage=300, stale-while-revalidate=600');
  });

  it('never returns a price ID', async () => {
    const res = await call();

    expect(JSON.stringify(res.body)).not.toContain('price_');
  });
});

describe('AUD formatting', () => {
  it('prints whole dollars without cents and keeps the A$ prefix', () => {
    expect(formatAud(59)).toBe('A$59');
    expect(formatAud(4)).toBe('A$4');
  });

  it('prints fractional dollars with two places', () => {
    expect(formatAud(7.99)).toBe('A$7.99');
    expect(formatAud(7.5)).toBe('A$7.50');
  });

  it('uses A$ and not a bare $, whatever the runtime ICU prints', () => {
    expect(formatAud(1234)).toMatch(/^A\$1,?234$/);
  });
});

describe('prices that cannot be shown as a plain price are skipped', () => {
  it('skips an inactive price', () => {
    expect(toPublicPrice(price({ active: false }) as never)).toBeNull();
  });

  it('skips a tiered price, which has no single unit amount', () => {
    expect(
      toPublicPrice(price({ billing_scheme: 'tiered', unit_amount: null }) as never)
    ).toBeNull();
  });

  it('skips a metered price, whose charge depends on usage', () => {
    expect(
      toPublicPrice(price({ recurring: { interval: 'month', usage_type: 'metered' } }) as never)
    ).toBeNull();
  });

  it('skips a price in another currency rather than label it A$', () => {
    expect(toPublicPrice(price({ currency: 'usd' }) as never)).toBeNull();
  });

  it('skips a one-time price, which has no recurring interval', () => {
    expect(toPublicPrice(price({ recurring: null }) as never)).toBeNull();
  });

  it('leaves an inactive price out of the response and keeps the others', async () => {
    PRICES.price_m = price({ id: 'price_m', active: false });

    const res = await call();

    expect(res.body?.prices).not.toHaveProperty('plusMonthly');
    expect(res.body?.prices).toHaveProperty('plusYearly');
    expect(res.body?.prices).toHaveProperty('schoolSeat');
  });

  it('leaves a tiered price out of the response', async () => {
    PRICES.price_y = price({
      id: 'price_y',
      billing_scheme: 'tiered',
      unit_amount: null,
      recurring: { interval: 'year', usage_type: 'licensed' },
    });

    const res = await call();

    expect(res.body?.prices).not.toHaveProperty('plusYearly');
    expect(res.body?.prices).toHaveProperty('plusMonthly');
  });
});

describe('a price that cannot be read is omitted, not fatal', () => {
  it('returns the other prices when one retrieve fails', async () => {
    retrieve.mockImplementation(async (id: string) => {
      if (id === 'price_m') throw new Error('Stripe is slow for this one');
      return PRICES[id];
    });

    const res = await call();

    expect(res.statusCode).toBe(200);
    expect(res.body?.prices).not.toHaveProperty('plusMonthly');
    expect(res.body?.prices).toHaveProperty('plusYearly');
    expect(res.body?.prices).toHaveProperty('schoolSeat');
  });
});

describe('Stripe not configured', () => {
  it('answers 200 with no prices and never calls Stripe when there is no secret key', async () => {
    stripeOn = false;

    const res = await call();

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ prices: {} });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('answers 200 with no prices when no price ID is configured', async () => {
    for (const k of ENV_KEYS) delete process.env[k];

    const res = await call();

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ prices: {} });
    expect(retrieve).not.toHaveBeenCalled();
  });
});

describe('the cache', () => {
  it('does not call Stripe again while the answer is fresh', async () => {
    await call();
    now += TEN_MINUTES - 1;
    const res = await call();

    expect(res.statusCode).toBe(200);
    // One retrieve per configured price, once, for the first request only.
    expect(retrieve).toHaveBeenCalledTimes(3);
  });

  it('reads Stripe again once the answer is older than ten minutes', async () => {
    await call();
    now += TEN_MINUTES + 1;
    await call();

    expect(retrieve).toHaveBeenCalledTimes(6);
  });
});

describe('when Stripe is down', () => {
  it('serves the last good answer when every read fails after the cache expires', async () => {
    const first = await call();
    now += TEN_MINUTES + 1;
    retrieve.mockRejectedValue(new Error('Stripe is unreachable'));

    const res = await call();

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(first.body);
  });

  it('answers 200 with no prices, not an error, when there is no earlier answer', async () => {
    retrieve.mockRejectedValue(new Error('Stripe is unreachable'));

    const res = await call();

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ prices: {} });
  });

  it('does not cache the empty answer, so the next request tries Stripe again', async () => {
    retrieve.mockRejectedValue(new Error('Stripe is unreachable'));
    await call();

    answerFromPrices();
    const res = await call();

    expect(res.body?.prices).toHaveProperty('plusMonthly');
  });
});

describe('methods', () => {
  it('refuses a POST with 405', async () => {
    const res = makeRes();
    await handler({ method: 'POST', headers: {} }, res);

    expect(res.statusCode).toBe(405);
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('answers a preflight with 204 and advertises GET, not POST, when the origin is allowed', async () => {
    process.env.ALLOWED_ORIGIN = ALLOWED;
    const res = makeRes();
    await handler({ method: 'OPTIONS', headers: { origin: ALLOWED } }, res);

    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
    expect(res.headers['Access-Control-Allow-Origin']).toBe(ALLOWED);
    expect(res.headers['Access-Control-Allow-Methods']).toBe('GET, OPTIONS');
  });

  it('answers a preflight from an unlisted origin with 403 and no allow-origin header', async () => {
    process.env.ALLOWED_ORIGIN = ALLOWED;
    const res = makeRes();
    await handler({ method: 'OPTIONS', headers: { origin: 'https://evil.example.com' } }, res);

    expect(res.statusCode).toBe(403);
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
  });
});
