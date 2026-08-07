import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * A deployment that publishes plan prices to the browser but has no
 * `STRIPE_SECRET_KEY` used to hand a real customer the TEST-MODE mock URL —
 * `…#/upgrade-test`, a route nothing in the app handles. The browser
 * navigated, the page did not change, and "Upgrade now" looked like a dead
 * button. No toast, no log, no sale.
 *
 * The same asymmetry the AI proxy already refuses (isMisconfigured in
 * api/_lib/auth.ts), for the same reason: a hosting platform puts every
 * project variable in the function's environment, so the mismatch is
 * detectable, and it is always a mistake rather than a choice.
 */

vi.mock('../../api/_lib/auth', () => ({
  verifyRequestAuth: async () => ({ ok: true, userId: 'user-1' }),
  extractBearerToken: () => 'token',
}));

import createCheckout from '../../api/create-checkout';
import customerPortal from '../../api/customer-portal';
import { isStripeMisconfigured, STRIPE_MISCONFIGURED_ERROR } from '../../api/_lib/stripe';

const makeRes = () => ({
  statusCode: 0,
  body: undefined as { url?: string; error?: string; test?: boolean } | undefined,
  status(code: number) {
    this.statusCode = code;
    return this;
  },
  json(data: unknown) {
    this.body = data as { url?: string; error?: string; test?: boolean };
  },
  setHeader() {},
});

const post = (body: Record<string, unknown>) => ({
  method: 'POST',
  headers: { authorization: 'Bearer t', origin: 'https://app.example.com' },
  body,
});

const ENV_KEYS = [
  'NODE_ENV',
  'VERCEL_ENV',
  'STRIPE_SECRET_KEY',
  'VITE_STRIPE_PLUS_MONTHLY_PRICE_ID',
  'VITE_STRIPE_PLUS_YEARLY_PRICE_ID',
  'VITE_STRIPE_SCHOOL_PRICE_ID',
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

describe('isStripeMisconfigured', () => {
  it('is true in production when prices are published but no secret key is set', () => {
    process.env.NODE_ENV = 'production';
    process.env.VITE_STRIPE_PLUS_MONTHLY_PRICE_ID = 'price_123';

    expect(isStripeMisconfigured()).toBe(true);
  });

  it('is false when Stripe is fully configured', () => {
    process.env.NODE_ENV = 'production';
    process.env.VITE_STRIPE_PLUS_MONTHLY_PRICE_ID = 'price_123';
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';

    expect(isStripeMisconfigured()).toBe(false);
  });

  it('is false when nothing is on sale — that is an honest unconfigured deployment', () => {
    process.env.NODE_ENV = 'production';

    expect(isStripeMisconfigured()).toBe(false);
  });

  it('is false outside production, where the mock URL is the point', () => {
    process.env.VITE_STRIPE_PLUS_MONTHLY_PRICE_ID = 'price_123';

    expect(isStripeMisconfigured()).toBe(false);
  });

  it('catches a school-only price list too', () => {
    process.env.VERCEL_ENV = 'production';
    process.env.VITE_STRIPE_SCHOOL_PRICE_ID = 'price_school';

    expect(isStripeMisconfigured()).toBe(true);
  });
});

describe('create-checkout in the half-configured state', () => {
  it('answers 503 naming what is missing, not a mock URL', async () => {
    process.env.NODE_ENV = 'production';
    process.env.VITE_STRIPE_PLUS_YEARLY_PRICE_ID = 'price_year';

    const res = makeRes();
    await createCheckout(post({ priceId: 'price_year' }), res);

    expect(res.statusCode).toBe(503);
    expect(res.body?.url).toBeUndefined();
    expect(res.body?.error).toBe(STRIPE_MISCONFIGURED_ERROR);
    // The message has to be actionable by whoever configured the deployment.
    expect(res.body?.error).toContain('STRIPE_SECRET_KEY');
    expect(res.body?.error).toContain('VITE_STRIPE_');
  });

  it('still returns the mock URL locally, so the redirect path stays testable', async () => {
    process.env.VITE_STRIPE_PLUS_YEARLY_PRICE_ID = 'price_year';

    const res = makeRes();
    await createCheckout(post({ priceId: 'price_year' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body?.test).toBe(true);
    expect(res.body?.url).toContain('#/upgrade-test');
  });

  it('still returns the mock URL in production when nothing is on sale', async () => {
    // No VITE_ prices means no upgrade button was ever drawn, so a request
    // here is a developer poking the endpoint, not a customer being failed.
    process.env.NODE_ENV = 'production';

    const res = makeRes();
    await createCheckout(post({ priceId: 'price_year' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body?.test).toBe(true);
  });
});

describe('customer-portal in the half-configured state', () => {
  it('answers 503 naming what is missing, not a mock URL', async () => {
    process.env.NODE_ENV = 'production';
    process.env.VITE_STRIPE_PLUS_MONTHLY_PRICE_ID = 'price_month';

    const res = makeRes();
    await customerPortal(post({}), res);

    expect(res.statusCode).toBe(503);
    expect(res.body?.error).toBe(STRIPE_MISCONFIGURED_ERROR);
  });

  it('still returns the mock URL locally', async () => {
    process.env.VITE_STRIPE_PLUS_MONTHLY_PRICE_ID = 'price_month';

    const res = makeRes();
    await customerPortal(post({}), res);

    expect(res.statusCode).toBe(200);
    expect(res.body?.url).toContain('#/portal-test');
  });
});
