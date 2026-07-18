import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Grace-period contract for the Stripe webhook: a `past_due` subscription
 * (Stripe is still retrying the charge) must KEEP the user's paid plan;
 * only terminal states downgrade to free. A regression here silently cuts
 * off paying customers over one flaky card charge.
 */

const updates: Array<{ table: string; values: Record<string, unknown> }> = [];

const makeSupabaseMock = () => ({
  from: (table: string) => ({
    update: (values: Record<string, unknown>) => ({
      eq: async () => {
        updates.push({ table, values });
        return { error: null };
      },
    }),
    upsert: async () => ({ error: null }),
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: { id: 'user-1' } }),
        single: async () => ({ data: { id: 'user-1' } }),
      }),
    }),
  }),
  rpc: async () => ({ data: 'free' }),
});

vi.mock('../../api/_lib/stripe', () => ({
  getStripe: () => ({}) as unknown,
  isStripeConfigured: () => true,
  getSupabaseAdmin: () => makeSupabaseMock(),
  priceToPlan: () => 'plus',
  resolveReturnBase: () => 'http://localhost:3000/',
}));

import handler from '../../api/stripe-webhook';

const makeRes = () => {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: unknown) {
      this.body = data;
    },
  };
  return res;
};

const subscriptionEvent = (status: string) => ({
  method: 'POST',
  headers: {},
  body: {
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: 'sub_1',
        customer: 'cus_1',
        status,
        items: { data: [{ price: { id: 'price_plus' } }] },
        current_period_start: 1_700_000_000,
        current_period_end: 1_702_600_000,
      },
    },
  },
});

const profilePlanWritten = (): unknown => {
  const write = updates.find((u) => u.table === 'profiles' && 'stripe_plan' in u.values);
  return write?.values.stripe_plan;
};

describe('stripe webhook plan grace period', () => {
  beforeEach(() => {
    updates.length = 0;
  });

  it('keeps the paid plan while the subscription is past_due (Stripe still retrying)', async () => {
    const res = makeRes();
    await handler(subscriptionEvent('past_due'), res);
    expect(res.statusCode).toBe(200);
    expect(profilePlanWritten()).toBe('plus');
  });

  it.each(['active', 'trialing'])('grants the plan for %s subscriptions', async (status) => {
    const res = makeRes();
    await handler(subscriptionEvent(status), res);
    expect(res.statusCode).toBe(200);
    expect(profilePlanWritten()).toBe('plus');
  });

  it.each(['canceled', 'unpaid', 'incomplete_expired'])(
    'downgrades to free for terminal status %s',
    async (status) => {
      const res = makeRes();
      await handler(subscriptionEvent(status), res);
      expect(res.statusCode).toBe(200);
      expect(profilePlanWritten()).toBe('free');
    }
  );
});
