import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * create-checkout refuses to open a SECOND concurrent subscription.
 *
 * Checkout reuses the caller's Stripe customer, but Stripe will happily open a
 * parallel subscription on that customer and resolve_stripe_plan just picks the
 * newest — so a user who is already subscribed (or `cancel_at_period_end`, or a
 * teacher re-opening the modal to top up seats) could be double-billed. The
 * guard queries the caller's own subscription rows and early-returns 409 when
 * one is `active` / `trialing` / `past_due`; plan changes go through the billing
 * portal instead. When no such row exists, checkout proceeds normally.
 */

// The subscription row the mocked `subscriptions` lookup should report for the
// caller — null means "no live subscription", i.e. the happy path.
let existingSubscription: { id: string; status: string } | null = null;
/** Role the mocked profile lookup returns. */
let profileRole = 'student';
const sessionCreateMock = vi.fn();

const makeSupabaseMock = () => ({
  from: (table: string) => {
    if (table === 'subscriptions') {
      // The guard chains .select().eq().in(statuses).limit().maybeSingle().
      // Honour the .in() status filter so the mock actually models what
      // Postgres would return: a row is only "found" when its status is one
      // the guard asked for — this is what makes the `canceled` case below a
      // real exclusion test rather than one that passes by construction.
      let allowed: string[] = [];
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: (_col: string, statuses: string[]) => {
          allowed = statuses;
          return chain;
        },
        limit: () => chain,
        maybeSingle: async () => ({
          data:
            existingSubscription && allowed.includes(existingSubscription.status)
              ? existingSubscription
              : null,
        }),
      };
      return chain;
    }
    // profiles: .select().eq().maybeSingle()
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { stripe_customer_id: 'cus_1', role: profileRole },
          }),
        }),
      }),
    };
  },
  auth: { admin: { getUserById: async () => ({ data: { user: { email: 'buyer@x' } } }) } },
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
  body: undefined as { url?: string; error?: string } | undefined,
  status(code: number) {
    this.statusCode = code;
    return this;
  },
  json(data: unknown) {
    this.body = data as { url?: string; error?: string };
  },
  setHeader() {},
});

const post = (body: Record<string, unknown>) => ({
  method: 'POST',
  headers: { authorization: 'Bearer t' },
  body,
});

beforeEach(() => {
  existingSubscription = null;
  profileRole = 'student';
  sessionCreateMock.mockReset();
  sessionCreateMock.mockResolvedValue({ url: 'https://stripe.test/session' });
});

describe('create-checkout: duplicate-subscription guard', () => {
  for (const status of ['active', 'trialing', 'past_due'] as const) {
    it(`returns 409 (and creates no session) when the user already holds a ${status} subscription`, async () => {
      existingSubscription = { id: 'sub_live', status };
      const res = makeRes();
      await checkoutHandler(post({ priceId: 'price_plus_monthly' }), res);

      expect(res.statusCode).toBe(409);
      // British English, and it points the user at the portal rather than
      // silently opening a second, double-billing subscription.
      expect(res.body?.error).toContain('Manage subscription');
      expect(sessionCreateMock).not.toHaveBeenCalled();
    });
  }

  it('guards a school purchase too, not just Plus', async () => {
    profileRole = 'teacher';
    existingSubscription = { id: 'sub_live', status: 'active' };
    const res = makeRes();
    await checkoutHandler(post({ priceId: 'price_school', seats: 30 }), res);

    expect(res.statusCode).toBe(409);
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it('proceeds normally and creates a session when there is no live subscription', async () => {
    existingSubscription = null;
    const res = makeRes();
    await checkoutHandler(post({ priceId: 'price_plus_monthly' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body?.url).toBe('https://stripe.test/session');
    expect(sessionCreateMock).toHaveBeenCalledOnce();
  });

  it('ignores a cancelled subscription and lets the user re-subscribe', async () => {
    // A fully `canceled` row is not in the active/trialing/past_due set, so the
    // guard's .in() filter excludes it and a fresh purchase proceeds — the user
    // is no longer being billed. The mock applies the same filter, so this
    // exercises the exclusion rather than asserting it by construction.
    existingSubscription = { id: 'sub_dead', status: 'canceled' };
    const res = makeRes();
    await checkoutHandler(post({ priceId: 'price_plus_yearly' }), res);

    expect(res.statusCode).toBe(200);
    expect(sessionCreateMock).toHaveBeenCalledOnce();
  });
});
