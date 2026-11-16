import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * GET /api/prices carries `courseUnlock` only when STRIPE_COURSE_UNLOCK_PRICE_ID is set, and
 * only for a one-time AUD price. It has no interval, because it is not a subscription.
 */

const retrieve = vi.fn();

vi.mock('../../api/_lib/stripe', () => ({
  getStripe: () => ({ prices: { retrieve } }),
}));

import handler, { resetPriceCache, setPriceClock, toPublicOneOffPrice } from '../../api/prices';

const ENV_KEYS = [
  'STRIPE_PLUS_MONTHLY_PRICE_ID',
  'STRIPE_PLUS_YEARLY_PRICE_ID',
  'STRIPE_SCHOOL_PRICE_ID',
  'STRIPE_COURSE_UNLOCK_PRICE_ID',
  'ALLOWED_ORIGIN',
] as const;
let saved: Record<string, string | undefined> = {};

const oneOff = (overrides: Record<string, unknown> = {}) => ({
  id: 'price_course',
  active: true,
  currency: 'aud',
  type: 'one_time',
  recurring: null,
  unit_amount: 4900,
  billing_scheme: 'per_unit',
  tax_behavior: 'exclusive',
  ...overrides,
});

const call = async () => {
  const res = {
    statusCode: 0,
    body: undefined as { prices?: Record<string, unknown> } | undefined,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: unknown) {
      this.body = data as { prices?: Record<string, unknown> };
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    end() {},
  };
  await handler({ method: 'GET', headers: {} }, res);
  return res;
};

let now = 1_000_000;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  delete process.env.ALLOWED_ORIGIN;
  retrieve.mockReset();
  now = 1_000_000;
  setPriceClock(() => now);
  resetPriceCache();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

describe('GET /api/prices: courseUnlock', () => {
  it('leaves courseUnlock out when no course-unlock price is configured, and reads no such price', async () => {
    const res = await call();
    expect(res.body?.prices).not.toHaveProperty('courseUnlock');
    expect(retrieve).not.toHaveBeenCalledWith('price_course');
  });

  it('publishes the amount, currency and display of the one-off price, with no interval', async () => {
    process.env.STRIPE_COURSE_UNLOCK_PRICE_ID = 'price_course';
    retrieve.mockImplementation(async () => oneOff());

    const res = await call();
    expect(res.body?.prices?.courseUnlock).toEqual({
      amount: 49,
      currency: 'aud',
      display: 'A$49',
      taxBehavior: 'exclusive',
    });
    expect(res.body?.prices?.courseUnlock).not.toHaveProperty('interval');
  });

  it('refuses a recurring price for the course unlock', async () => {
    process.env.STRIPE_COURSE_UNLOCK_PRICE_ID = 'price_course';
    retrieve.mockImplementation(async () =>
      oneOff({ type: 'recurring', recurring: { interval: 'month', usage_type: 'licensed' } })
    );
    const res = await call();
    expect(res.body?.prices).not.toHaveProperty('courseUnlock');
  });

  it('refuses an inactive or non-AUD one-off price', () => {
    expect(toPublicOneOffPrice(oneOff({ active: false }) as never)).toBeNull();
    expect(toPublicOneOffPrice(oneOff({ currency: 'usd' }) as never)).toBeNull();
    expect(toPublicOneOffPrice(oneOff() as never)).not.toBeNull();
  });

  it('never returns the price ID', async () => {
    process.env.STRIPE_COURSE_UNLOCK_PRICE_ID = 'price_course';
    retrieve.mockImplementation(async () => oneOff());
    const res = await call();
    expect(JSON.stringify(res.body)).not.toContain('price_course');
  });
});
