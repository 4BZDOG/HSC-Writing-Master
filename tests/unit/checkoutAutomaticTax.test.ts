import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Automatic-tax (GST) collection at checkout:
 *  - Stripe only computes and adds tax when `automatic_tax` is set on the
 *    Checkout Session itself, so the session params must carry it;
 *  - it is opt-in behind STRIPE_AUTOMATIC_TAX because enabling it without a
 *    configured Stripe origin address makes checkout throw, so the key must be
 *    ABSENT unless the deployment has switched the flag on.
 */

const sessionCreateMock = vi.fn();

const makeSupabaseMock = () => ({
  from: () => ({
    select: () => ({
      eq: () => ({
        // Profile lookup: a teacher with no stored customer id.
        maybeSingle: async () => ({ data: { id: 'user-1', role: 'teacher' } }),
        single: async () => ({ data: { id: 'user-1', role: 'teacher' } }),
        // Duplicate-subscription guard: no live subscription, so checkout runs.
        in: () => ({
          limit: () => ({
            maybeSingle: async () => ({ data: null }),
          }),
        }),
      }),
    }),
  }),
  auth: { admin: { getUserById: async () => ({ data: { user: { email: 'buyer@school' } } }) } },
});

vi.mock('../../api/_lib/stripe', () => ({
  getStripe: () =>
    ({
      subscriptions: { retrieve: vi.fn() },
      checkout: { sessions: { create: sessionCreateMock } },
    }) as unknown,
  isStripeConfigured: () => true,
  isStripeMisconfigured: () => false,
  STRIPE_MISCONFIGURED_ERROR: 'billing misconfigured',
  getSupabaseAdmin: () => makeSupabaseMock(),
  priceToPlan: (id: string) => (id === 'price_school' ? 'school' : 'plus'),
  resolveReturnBase: () => 'http://localhost:3000/',
  isProductionRuntime: () => false,
  configuredPrices: () => ({
    price_school: 'school',
    price_plus_yearly: 'plus',
    price_plus_monthly: 'plus',
  }),
}));

vi.mock('../../api/_lib/auth', () => ({
  verifyRequestAuth: async () => ({ ok: true, userId: 'user-1' }),
  extractBearerToken: () => 'token',
}));

import checkoutHandler from '../../api/create-checkout';

const makeRes = () => ({
  statusCode: 0,
  body: undefined as unknown,
  status(code: number) {
    this.statusCode = code;
    return this;
  },
  json(data: unknown) {
    this.body = data;
  },
});

const post = (body: Record<string, unknown>) => ({
  method: 'POST',
  headers: { authorization: 'Bearer t' },
  body,
});

describe('create-checkout: automatic tax (GST)', () => {
  /** Restored in afterEach so the flag never leaks between cases/files. */
  let savedFlag: string | undefined;

  beforeEach(() => {
    savedFlag = process.env.STRIPE_AUTOMATIC_TAX;
    sessionCreateMock.mockReset();
    sessionCreateMock.mockResolvedValue({ url: 'https://stripe.test/session' });
  });
  afterEach(() => {
    if (savedFlag === undefined) delete process.env.STRIPE_AUTOMATIC_TAX;
    else process.env.STRIPE_AUTOMATIC_TAX = savedFlag;
  });

  it('enables automatic_tax on the session when STRIPE_AUTOMATIC_TAX=true', async () => {
    process.env.STRIPE_AUTOMATIC_TAX = 'true';
    const res = makeRes();
    await checkoutHandler(post({ priceId: 'price_plus_yearly' }), res);
    expect(res.statusCode).toBe(200);
    const args = sessionCreateMock.mock.calls[0][0];
    expect(args.automatic_tax).toEqual({ enabled: true });
  });

  it('omits automatic_tax entirely when the flag is unset', async () => {
    delete process.env.STRIPE_AUTOMATIC_TAX;
    const res = makeRes();
    await checkoutHandler(post({ priceId: 'price_plus_yearly' }), res);
    expect(res.statusCode).toBe(200);
    const args = sessionCreateMock.mock.calls[0][0];
    // Absent, not merely disabled — Stripe throws on automatic_tax without a
    // configured origin address, so the key must not appear at all.
    expect('automatic_tax' in args).toBe(false);
  });

  it('omits automatic_tax when the flag is any value other than "true"', async () => {
    process.env.STRIPE_AUTOMATIC_TAX = 'false';
    const res = makeRes();
    await checkoutHandler(post({ priceId: 'price_plus_yearly' }), res);
    expect(res.statusCode).toBe(200);
    const args = sessionCreateMock.mock.calls[0][0];
    expect('automatic_tax' in args).toBe(false);
  });

  it('leaves tax_id_collection enabled regardless of the flag', async () => {
    process.env.STRIPE_AUTOMATIC_TAX = 'true';
    const res = makeRes();
    await checkoutHandler(post({ priceId: 'price_plus_yearly' }), res);
    const args = sessionCreateMock.mock.calls[0][0];
    expect(args.tax_id_collection).toEqual({ enabled: true });
  });
});
