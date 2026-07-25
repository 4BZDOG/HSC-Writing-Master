import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Grace-period contract for the Stripe webhook: a `past_due` subscription
 * (Stripe is still retrying the charge) must KEEP the user's paid plan;
 * only terminal states downgrade to free. A regression here silently cuts
 * off paying customers over one flaky card charge.
 */

const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
const upserts: Array<{ table: string; values: Record<string, unknown> }> = [];
const retrieveMock = vi.fn();

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
        maybeSingle: async () => ({ data: { id: 'user-1' } }),
        single: async () => ({ data: { id: 'user-1' } }),
      }),
    }),
  }),
  rpc: async () => ({ data: 'free' }),
});

vi.mock('../../api/_lib/stripe', () => ({
  getStripe: () => ({ subscriptions: { retrieve: retrieveMock } }) as unknown,
  isStripeConfigured: () => true,
  getSupabaseAdmin: () => makeSupabaseMock(),
  priceToPlan: () => 'plus',
  resolveReturnBase: () => 'http://localhost:3000/',
  configuredPrices: () => ({ price_plus: 'plus' }),
  isProductionRuntime: () => isProduction(),
}));

/** Toggled per-test so the production signature guard can be exercised. */
let isProduction = () => false;

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
    upserts.length = 0;
    retrieveMock.mockReset();
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

describe('stripe webhook modern-API (basil+) field shapes', () => {
  beforeEach(() => {
    updates.length = 0;
    upserts.length = 0;
    retrieveMock.mockReset();
  });

  it('reads period dates from subscription items when the top-level fields are absent', async () => {
    const periodEnd = 1_702_600_000;
    const res = makeRes();
    await handler(
      {
        method: 'POST',
        headers: {},
        body: {
          type: 'customer.subscription.updated',
          data: {
            object: {
              id: 'sub_1',
              customer: 'cus_1',
              status: 'active',
              // basil+: no top-level current_period_*; they live on the item.
              items: {
                data: [
                  {
                    price: { id: 'price_plus' },
                    current_period_start: 1_700_000_000,
                    current_period_end: periodEnd,
                  },
                ],
              },
            },
          },
        },
      },
      res
    );
    expect(res.statusCode).toBe(200);

    const subRow = upserts.find((u) => u.table === 'subscriptions')?.values as Record<
      string,
      string
    >;
    expect(subRow.current_period_end).toBe(new Date(periodEnd * 1000).toISOString());

    const profileWrite = updates.find((u) => u.table === 'profiles' && 'plan_period_end' in u.values)
      ?.values as Record<string, string>;
    expect(profileWrite.plan_period_end).toBe(new Date(periodEnd * 1000).toISOString());
  });

  it('marks the subscription past_due from the basil+ invoice.parent shape', async () => {
    const res = makeRes();
    await handler(
      {
        method: 'POST',
        headers: {},
        body: {
          type: 'invoice.payment_failed',
          data: {
            object: {
              customer: 'cus_1',
              // basil+: no invoice.subscription; nested under parent.
              parent: { subscription_details: { subscription: 'sub_1' } },
            },
          },
        },
      },
      res
    );
    expect(res.statusCode).toBe(200);
    const write = updates.find((u) => u.table === 'subscriptions');
    expect(write?.values.status).toBe('past_due');
  });
});

describe('stripe webhook eager activation on checkout completion', () => {
  beforeEach(() => {
    updates.length = 0;
    upserts.length = 0;
    retrieveMock.mockReset();
  });

  const checkoutEvent = {
    method: 'POST',
    headers: {},
    body: {
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: 'user-1',
          customer: 'cus_1',
          subscription: 'sub_1',
          mode: 'subscription',
        },
      },
    },
  };

  it('retrieves the subscription and activates the plan without waiting for later events', async () => {
    retrieveMock.mockResolvedValue({
      id: 'sub_1',
      customer: 'cus_1',
      status: 'active',
      items: { data: [{ price: { id: 'price_plus' } }] },
      current_period_start: 1_700_000_000,
      current_period_end: 1_702_600_000,
    });

    const res = makeRes();
    await handler(checkoutEvent, res);
    expect(res.statusCode).toBe(200);
    expect(retrieveMock).toHaveBeenCalledWith('sub_1');
    expect(profilePlanWritten()).toBe('plus');
  });

  it('still succeeds (customer linked) when the eager retrieve fails', async () => {
    retrieveMock.mockRejectedValue(new Error('stripe unavailable'));
    const res = makeRes();
    await handler(checkoutEvent, res);
    expect(res.statusCode).toBe(200);
    // Customer link still written; plan activation deferred to the
    // customer.subscription.* events.
    expect(updates.some((u) => u.table === 'profiles' && 'stripe_customer_id' in u.values)).toBe(
      true
    );
  });
});

describe('stripe webhook signature enforcement', () => {
  beforeEach(() => {
    updates.length = 0;
    upserts.length = 0;
    retrieveMock.mockReset();
    isProduction = () => false;
  });
  afterEach(() => {
    isProduction = () => false;
  });

  it('refuses unsigned events in production rather than trusting the body', async () => {
    isProduction = () => true;
    const res = makeRes();
    await handler(subscriptionEvent('active'), res);
    // Without this an attacker can POST a forged subscription event and hand
    // themselves a paid plan. 500 also makes Stripe retry once configured.
    expect(res.statusCode).toBe(500);
    expect(updates).toHaveLength(0);
    expect(upserts).toHaveLength(0);
  });

  it('still accepts unsigned events outside production (Stripe CLI / dev)', async () => {
    const res = makeRes();
    await handler(subscriptionEvent('active'), res);
    expect(res.statusCode).toBe(200);
  });
});
