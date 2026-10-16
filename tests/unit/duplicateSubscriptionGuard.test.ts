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
interface SubscriptionFixture {
  id: string;
  status: string;
  last_event_at?: string | null;
  updated_at?: string | null;
}
let existingSubscription: SubscriptionFixture | null = null;
/** Role the mocked profile lookup returns. */
let profileRole = 'student';
const sessionCreateMock = vi.fn();

const makeSupabaseMock = () => ({
  from: (table: string) => {
    if (table === 'subscriptions') {
      // The guard reads .select().eq().in(statuses).limit() and awaits the rows.
      // Honour the .in() status filter so the mock actually models what Postgres
      // would return: a row is only "found" when its status is one the guard asked
      // for. That is what makes the `canceled` case below a real exclusion test.
      let allowed: string[] = [];
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: (_col: string, statuses: string[]) => {
          allowed = statuses;
          return chain;
        },
        limit: () => chain,
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve({
            data:
              existingSubscription && allowed.includes(existingSubscription.status)
                ? [existingSubscription]
                : [],
            error: null,
          }).then(resolve, reject),
      };
      return chain;
    }
    // profiles: .select().eq().maybeSingle(). Also the checkout_sessions record,
    // which accepts the first session (no earlier one to displace).
    return {
      insert: async () => ({ error: null }),
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            // `school_id` present: create-checkout also refuses a school
            // licence bought by an account attached to no school, and that
            // guard sits just after this one. Without a school here, the
            // school case below would be answered by the wrong refusal.
            data: { stripe_customer_id: 'cus_1', role: profileRole, school_id: 'school-1' },
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

/** An ISO timestamp this many minutes before now. */
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

describe('create-checkout: an incomplete subscription holds only inside the 3-D Secure window', () => {
  it('holds a purchase while the awaiting-payment subscription was last written inside the window', async () => {
    existingSubscription = {
      id: 'sub_3ds',
      status: 'incomplete',
      last_event_at: minutesAgo(10),
      updated_at: minutesAgo(10),
    };
    const res = makeRes();
    await checkoutHandler(post({ priceId: 'price_plus_monthly' }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body?.error).toContain('still waiting for your bank');
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it('does not hold once the subscription has been quiet past the window, so a retry is allowed', async () => {
    existingSubscription = {
      id: 'sub_3ds',
      status: 'incomplete',
      last_event_at: minutesAgo(46),
      updated_at: minutesAgo(46),
    };
    const res = makeRes();
    await checkoutHandler(post({ priceId: 'price_plus_monthly' }), res);

    expect(res.statusCode).toBe(200);
    expect(sessionCreateMock).toHaveBeenCalledOnce();
  });

  it('does not hold an incomplete subscription with no timestamp at all', async () => {
    existingSubscription = {
      id: 'sub_3ds',
      status: 'incomplete',
      last_event_at: null,
      updated_at: null,
    };
    const res = makeRes();
    await checkoutHandler(post({ priceId: 'price_plus_monthly' }), res);

    expect(res.statusCode).toBe(200);
    expect(sessionCreateMock).toHaveBeenCalledOnce();
  });

  it('uses updated_at when last_event_at is absent, so a recent write still holds', async () => {
    existingSubscription = {
      id: 'sub_3ds',
      status: 'incomplete',
      last_event_at: null,
      updated_at: minutesAgo(5),
    };
    const res = makeRes();
    await checkoutHandler(post({ priceId: 'price_plus_monthly' }), res);

    expect(res.statusCode).toBe(409);
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it('still holds an active subscription regardless of its timestamps', async () => {
    existingSubscription = {
      id: 'sub_live',
      status: 'active',
      last_event_at: minutesAgo(10 * 24 * 60),
      updated_at: minutesAgo(10 * 24 * 60),
    };
    const res = makeRes();
    await checkoutHandler(post({ priceId: 'price_plus_monthly' }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body?.error).toContain('Manage subscription');
  });
});
