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

/** Event ids already in the ledger — a second delivery must be skipped. */
const seenEvents = new Set<string>();
/** last_event_at stamped on the subscription row, if any. */
let lastEventAt: string | null = null;
const deletedEvents: string[] = [];
/** Forces the profile/subscription writes to fail, so the handler throws. */
let failUpdates = false;

const makeSupabaseMock = () => ({
  from: (table: string) => ({
    insert: async (values: Record<string, unknown>) => {
      if (table === 'stripe_events') {
        const id = values.id as string;
        if (seenEvents.has(id)) return { error: { code: '23505', message: 'duplicate key' } };
        seenEvents.add(id);
        return { error: null };
      }
      return { error: null };
    },
    delete: () => ({
      eq: async (_col: string, id: string) => {
        deletedEvents.push(id);
        seenEvents.delete(id);
        return { error: null };
      },
    }),
    update: (values: Record<string, unknown>) => ({
      eq: async () => {
        if (failUpdates) return { error: { message: 'write failed' } };
        updates.push({ table, values });
        return { error: null };
      },
    }),
    upsert: async (values: Record<string, unknown>) => {
      upserts.push({ table, values });
      return { error: null };
    },
    select: (columns?: string) => ({
      eq: () => ({
        maybeSingle: async () =>
          columns === 'last_event_at'
            ? { data: { last_event_at: lastEventAt } }
            : columns === 'plan'
              ? { data: storedSubscriptionPlan ? { plan: storedSubscriptionPlan } : null }
              : { data: { id: 'user-1' } },
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
  priceToPlan: (id: string) => priceToPlanImpl(id),
  resolveReturnBase: () => 'http://localhost:3000/',
  configuredPrices: () => ({ price_plus: 'plus' }),
  isProductionRuntime: () => isProduction(),
}));

/** Toggled per-test so the production signature guard can be exercised. */
let isProduction = () => false;
/** Swapped per-test so an unrecognised price ID can be simulated. */
let priceToPlanImpl: (id: string) => string = () => 'plus';
/** The plan already stored on the subscription row, if any. */
let storedSubscriptionPlan: string | null = null;

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

describe('an unrecognised price never downgrades a paying customer', () => {
  // priceToPlan falls back to 'free' for any price this deployment doesn't
  // list — and Stripe sends customer.subscription.updated for renewals, card
  // updates and quantity changes. So a rotated price, or one STRIPE_*_PRICE_ID
  // missing from the Vercel project, used to cut off every active subscriber
  // on the next routine event.
  beforeEach(() => {
    updates.length = 0;
    upserts.length = 0;
    retrieveMock.mockReset();
    priceToPlanImpl = () => 'free';
    storedSubscriptionPlan = null;
  });
  afterEach(() => {
    priceToPlanImpl = () => 'plus';
    storedSubscriptionPlan = null;
  });

  it('keeps the plan already on the subscription row', async () => {
    storedSubscriptionPlan = 'school';
    const res = makeRes();
    await handler(subscriptionEvent('active'), res);
    expect(res.statusCode).toBe(200);
    expect(profilePlanWritten()).toBe('school');
    expect(upserts.find((u) => u.table === 'subscriptions')?.values.plan).toBe('school');
  });

  it('falls back to the paid individual plan when the row is new', async () => {
    const res = makeRes();
    await handler(subscriptionEvent('active'), res);
    expect(profilePlanWritten()).toBe('plus');
  });

  it('still downgrades when the subscription itself has ended', async () => {
    storedSubscriptionPlan = 'plus';
    const res = makeRes();
    await handler(subscriptionEvent('canceled'), res);
    expect(profilePlanWritten()).toBe('free');
  });
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

    const profileWrite = updates.find(
      (u) => u.table === 'profiles' && 'plan_period_end' in u.values
    )?.values as Record<string, string>;
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

describe('stripe webhook idempotency and ordering', () => {
  beforeEach(() => {
    updates.length = 0;
    upserts.length = 0;
    retrieveMock.mockReset();
    seenEvents.clear();
    deletedEvents.length = 0;
    lastEventAt = null;
    failUpdates = false;
  });

  const event = (id: string, created: number, status = 'active') => ({
    method: 'POST',
    headers: {},
    body: {
      id,
      created,
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

  it('applies an event once and skips the redelivery', async () => {
    const first = makeRes();
    await handler(event('evt_1', 1_700_000_500), first);
    expect(first.statusCode).toBe(200);
    const writesAfterFirst = updates.length + upserts.length;
    expect(writesAfterFirst).toBeGreaterThan(0);

    // Stripe delivers at least once: the same event arriving again must not
    // be applied a second time.
    const second = makeRes();
    await handler(event('evt_1', 1_700_000_500), second);
    expect(second.statusCode).toBe(200);
    expect(second.body).toMatchObject({ duplicate: true });
    expect(updates.length + upserts.length).toBe(writesAfterFirst);
  });

  it('stamps the event time on the subscription row', async () => {
    await handler(event('evt_1', 1_700_000_500), makeRes());
    const subRow = upserts.find((u) => u.table === 'subscriptions')?.values;
    expect(subRow?.last_event_at).toBe(new Date(1_700_000_500 * 1000).toISOString());
  });

  it('ignores an event older than the state already applied', async () => {
    // A delayed `updated` arriving after a newer event must not roll the row
    // back — this is what would resurrect a cancelled plan.
    lastEventAt = new Date(1_700_009_000 * 1000).toISOString();
    const res = makeRes();
    await handler(event('evt_old', 1_700_000_000), res);
    expect(res.statusCode).toBe(200);
    expect(upserts).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it('still applies an event newer than the last one seen', async () => {
    lastEventAt = new Date(1_700_000_000 * 1000).toISOString();
    await handler(event('evt_new', 1_700_009_000), makeRes());
    expect(upserts.some((u) => u.table === 'subscriptions')).toBe(true);
  });

  it('releases the claim when handling throws, so the retry is reprocessed', async () => {
    // Otherwise a transient DB failure would be permanent: Stripe retries, the
    // ledger says "already seen", and the plan never lands.
    failUpdates = true;
    const res = makeRes();
    await handler(event('evt_boom', 1_700_000_500), res);
    expect(res.statusCode).toBe(500);
    expect(deletedEvents).toContain('evt_boom');
    expect(seenEvents.has('evt_boom')).toBe(false);

    // The retry now gets a fresh claim and applies cleanly.
    failUpdates = false;
    const retry = makeRes();
    await handler(event('evt_boom', 1_700_000_500), retry);
    expect(retry.statusCode).toBe(200);
    expect(profilePlanWritten()).toBe('plus');
  });
});
