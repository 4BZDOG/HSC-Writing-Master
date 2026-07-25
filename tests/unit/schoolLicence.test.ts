import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * School seat-licence contracts:
 *  - a school-plan subscription syncs seats + status onto the buyer's school
 *    (that's what grants every member the plan at sign-in);
 *  - deleting the subscription ends the school licence;
 *  - checkout honours a seat quantity ONLY for the school price, clamped.
 */

const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
const upserts: Array<{ table: string; values: Record<string, unknown> }> = [];
const sessionCreateMock = vi.fn();
/** Role the mocked profile lookup returns — school licences are staff-only. */
let profileRole = 'teacher';

const makeSupabaseMock = () => ({
  from: (table: string) => ({
    update: (values: Record<string, unknown>) => ({
      eq: async () => {
        updates.push({ table, values });
        return { error: null };
      },
    }),
    upsert: async (values: Record<string, unknown>) => {
      upserts.push({ table, values });
      return { error: null };
    },
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: { id: 'user-1', school_id: 'school-1', role: profileRole },
        }),
        single: async () => ({ data: { id: 'user-1', school_id: 'school-1', role: profileRole } }),
      }),
    }),
  }),
  rpc: async () => ({ data: 'free' }),
  auth: { admin: { getUserById: async () => ({ data: { user: { email: 'buyer@school' } } }) } },
});

vi.mock('../../api/_lib/stripe', () => ({
  getStripe: () =>
    ({
      subscriptions: { retrieve: vi.fn() },
      checkout: { sessions: { create: sessionCreateMock } },
    }) as unknown,
  isStripeConfigured: () => true,
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

import webhookHandler from '../../api/stripe-webhook';
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

beforeEach(() => {
  updates.length = 0;
  upserts.length = 0;
  sessionCreateMock.mockReset();
  profileRole = 'teacher';
});

describe('webhook: school seat licence sync', () => {
  const schoolSubEvent = (status: string, quantity = 30) => ({
    method: 'POST',
    headers: {},
    body: {
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_school_1',
          customer: 'cus_1',
          status,
          items: {
            data: [
              {
                price: { id: 'price_school' },
                quantity,
                current_period_start: 1_700_000_000,
                current_period_end: 1_702_600_000,
              },
            ],
          },
        },
      },
    },
  });

  it('writes seats and status to the buyer’s school and the subscription row', async () => {
    const res = makeRes();
    await webhookHandler(schoolSubEvent('active', 42), res);
    expect(res.statusCode).toBe(200);

    const subRow = upserts.find((u) => u.table === 'subscriptions')?.values;
    expect(subRow?.seats).toBe(42);
    expect(subRow?.plan).toBe('school');

    const schoolWrite = updates.find((u) => u.table === 'schools')?.values;
    expect(schoolWrite).toMatchObject({
      stripe_subscription_id: 'sub_school_1',
      plan_seats: 42,
      plan_status: 'active',
    });

    const profileWrite = updates.find(
      (u) => u.table === 'profiles' && 'stripe_plan' in u.values
    )?.values;
    expect(profileWrite?.stripe_plan).toBe('school');
  });

  it('keeps the school licence during past_due (same grace rule as personal plans)', async () => {
    const res = makeRes();
    await webhookHandler(schoolSubEvent('past_due'), res);
    const schoolWrite = updates.find((u) => u.table === 'schools')?.values;
    expect(schoolWrite?.plan_status).toBe('past_due');
    const profileWrite = updates.find(
      (u) => u.table === 'profiles' && 'stripe_plan' in u.values
    )?.values;
    expect(profileWrite?.stripe_plan).toBe('school');
  });

  it('ends the school licence when the subscription is deleted', async () => {
    const res = makeRes();
    await webhookHandler(
      {
        method: 'POST',
        headers: {},
        body: {
          type: 'customer.subscription.deleted',
          data: { object: { id: 'sub_school_1', customer: 'cus_1' } },
        },
      },
      res
    );
    expect(res.statusCode).toBe(200);
    const schoolWrite = updates.find((u) => u.table === 'schools')?.values;
    expect(schoolWrite?.plan_status).toBe('canceled');
  });
});

describe('create-checkout: seat quantities', () => {
  const post = (body: Record<string, unknown>) => ({
    method: 'POST',
    headers: { authorization: 'Bearer t' },
    body,
  });

  beforeEach(() => {
    process.env.STRIPE_SCHOOL_PRICE_ID = 'price_school';
    sessionCreateMock.mockResolvedValue({ url: 'https://stripe.test/session' });
  });
  afterEach(() => {
    delete process.env.STRIPE_SCHOOL_PRICE_ID;
  });

  it('bills the requested seats for the school price', async () => {
    const res = makeRes();
    await checkoutHandler(post({ priceId: 'price_school', seats: 30 }), res);
    expect(res.statusCode).toBe(200);
    const args = sessionCreateMock.mock.calls[0][0];
    expect(args.line_items).toEqual([{ price: 'price_school', quantity: 30 }]);
  });

  it('clamps absurd seat counts', async () => {
    const res = makeRes();
    await checkoutHandler(post({ priceId: 'price_school', seats: 999999 }), res);
    const args = sessionCreateMock.mock.calls[0][0];
    expect(args.line_items[0].quantity).toBe(1000);
  });

  it('refuses a school licence bought from a student account', async () => {
    // The seat picker is staff-only in the UI; the server must not take the
    // client's word for that — a licence grants the plan to the whole school.
    profileRole = 'student';
    const res = makeRes();
    await checkoutHandler(post({ priceId: 'price_school', seats: 30 }), res);
    expect(res.statusCode).toBe(403);
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it('still sells an individual Plus plan to a student', async () => {
    profileRole = 'student';
    const res = makeRes();
    await checkoutHandler(post({ priceId: 'price_plus_yearly' }), res);
    expect(res.statusCode).toBe(200);
  });

  it('ignores seats for individual Plus prices', async () => {
    const res = makeRes();
    await checkoutHandler(post({ priceId: 'price_plus_yearly', seats: 30 }), res);
    const args = sessionCreateMock.mock.calls[0][0];
    expect(args.line_items[0].quantity).toBe(1);
  });
});

describe('create-checkout: price allowlist', () => {
  const post = (body: Record<string, unknown>) => ({
    method: 'POST',
    headers: { authorization: 'Bearer t' },
    body,
  });

  beforeEach(() => {
    sessionCreateMock.mockResolvedValue({ url: 'https://stripe.test/session' });
  });

  it('rejects a price this deployment does not sell', async () => {
    const res = makeRes();
    await checkoutHandler(post({ priceId: 'price_someone_elses' }), res);
    // Any price in the Stripe account would otherwise be checkout-able —
    // including ones priceToPlan maps to 'free', which charge the customer
    // and grant them nothing.
    expect(res.statusCode).toBe(400);
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it('accepts a configured price', async () => {
    const res = makeRes();
    await checkoutHandler(post({ priceId: 'price_plus_monthly' }), res);
    expect(res.statusCode).toBe(200);
    expect(sessionCreateMock).toHaveBeenCalled();
  });
});
