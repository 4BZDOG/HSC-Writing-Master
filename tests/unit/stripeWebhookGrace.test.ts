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

interface LedgerRow {
  received_at: number;
  /** Stamped once the handler returned; null while the claim is unfinished. */
  processed_at: number | null;
}
/** The stripe_events table, keyed by event id. */
const ledger = new Map<string, LedgerRow>();
/** Simulates a database that has not re-applied schema §13 (no processed_at). */
let ledgerColumnMissing = false;
/** Forces the processed_at stamp to fail, so the claim must be released. */
let stampFails = false;
/** Forces the ledger read to fail for a reason other than a missing column. */
let ledgerReadFails = false;
const missingColumnError = {
  code: '42703',
  message: 'column stripe_events.processed_at does not exist',
};

/**
 * stripe_events UPDATE, modelled as the one statement the database would run:
 * the filters apply together, and a claim takeover is a compare-and-set.
 */
const ledgerUpdate = (values: Record<string, unknown>) => {
  let id = '';
  let unfinishedOnly = false;
  let receivedBefore: number | null = null;
  const run = async () => {
    if (ledgerColumnMissing) return { data: null, error: missingColumnError };
    if ('processed_at' in values && stampFails) {
      return { data: null, error: { message: 'stamp write failed' } };
    }
    const row = ledger.get(id);
    const matches =
      row !== undefined &&
      (!unfinishedOnly || row.processed_at === null) &&
      (receivedBefore === null || row.received_at < receivedBefore);
    if (!row || !matches) return { data: [], error: null };
    if ('processed_at' in values) row.processed_at = Date.now();
    if ('received_at' in values) row.received_at = Date.parse(values.received_at as string);
    return { data: [{ id }], error: null };
  };
  const chain = {
    eq: (_col: string, value: string) => {
      id = value;
      return chain;
    },
    is: () => {
      unfinishedOnly = true;
      return chain;
    },
    lt: (_col: string, value: string) => {
      receivedBefore = Date.parse(value);
      return chain;
    },
    select: () => run(),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      run().then(resolve, reject),
  };
  return chain;
};

const ledgerRead = (id: string) => {
  if (ledgerColumnMissing) return { data: null, error: missingColumnError };
  if (ledgerReadFails) return { data: null, error: { code: '08006', message: 'connection lost' } };
  const row = ledger.get(id);
  return {
    data: row
      ? {
          processed_at: row.processed_at === null ? null : new Date(row.processed_at).toISOString(),
        }
      : null,
    error: null,
  };
};
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
        if (ledger.has(id)) return { error: { code: '23505', message: 'duplicate key' } };
        ledger.set(id, { received_at: Date.now(), processed_at: null });
        return { error: null };
      }
      return { error: null };
    },
    delete: () => ({
      eq: async (_col: string, id: string) => {
        deletedEvents.push(id);
        ledger.delete(id);
        return { error: null };
      },
    }),
    update: (values: Record<string, unknown>) => {
      if (table === 'stripe_events') return ledgerUpdate(values);
      return {
        eq: async () => {
          if (failUpdates) return { error: { message: 'write failed' } };
          updates.push({ table, values });
          return { error: null };
        },
      };
    },
    upsert: async (values: Record<string, unknown>) => {
      upserts.push({ table, values });
      return { error: null };
    },
    select: (columns?: string) => {
      if (table === 'stripe_events') {
        return { eq: (_col: string, id: string) => ({ maybeSingle: async () => ledgerRead(id) }) };
      }
      return {
        eq: () => ({
          maybeSingle: async () =>
            columns === 'last_event_at'
              ? { data: { last_event_at: lastEventAt } }
              : columns === 'plan'
                ? { data: storedSubscriptionPlan ? { plan: storedSubscriptionPlan } : null }
                : { data: { id: 'user-1' } },
          single: async () => ({ data: { id: 'user-1' } }),
        }),
      };
    },
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
import { CLAIM_LEASE_MS } from '../../api/_lib/stripeLedger';

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
    ledger.clear();
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
    expect(ledger.has('evt_boom')).toBe(false);

    // The retry now gets a fresh claim and applies cleanly.
    failUpdates = false;
    const retry = makeRes();
    await handler(event('evt_boom', 1_700_000_500), retry);
    expect(retry.statusCode).toBe(200);
    expect(profilePlanWritten()).toBe('plus');
  });
});

/**
 * The payment-failure flag is what raises the "update your card" banner during
 * the grace period, and it was the one subscription write with no ordering
 * guard. Stripe does not order deliveries, so a `customer.subscription.updated`
 * generated BEFORE the failed charge but delivered after it would overwrite
 * `past_due` with `active`, take the banner off the screen, and leave the
 * customer hearing nothing until the retries ran out and the plan was
 * cancelled outright.
 */
describe('payment failures take part in the same ordering guard', () => {
  beforeEach(() => {
    updates.length = 0;
    upserts.length = 0;
    ledger.clear();
    lastEventAt = null;
    failUpdates = false;
  });

  const paymentFailed = (id: string, created: number) => ({
    method: 'POST',
    headers: {},
    body: {
      id,
      created,
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_1', subscription: 'sub_1' } },
    },
  });

  const subscriptionUpdated = (id: string, created: number) => ({
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
          status: 'active',
          items: { data: [{ price: { id: 'price_plus' } }] },
          current_period_start: 1_700_000_000,
          current_period_end: 1_702_600_000,
        },
      },
    },
  });

  it('stamps the event time, so later writes can tell it happened', async () => {
    await handler(paymentFailed('evt_fail', 1_700_005_000), makeRes());

    const row = updates.find((u) => u.table === 'subscriptions')?.values;
    expect(row?.status).toBe('past_due');
    expect(row?.last_event_at).toBe(new Date(1_700_005_000 * 1000).toISOString());
  });

  it('does not let an older subscription event clear the past_due flag', async () => {
    // The failure is applied first and stamps the row…
    await handler(paymentFailed('evt_fail', 1_700_005_000), makeRes());
    lastEventAt = new Date(1_700_005_000 * 1000).toISOString();
    updates.length = 0;
    upserts.length = 0;

    // …then an `updated` that Stripe generated earlier arrives late.
    const res = makeRes();
    await handler(subscriptionUpdated('evt_stale', 1_700_000_000), res);

    expect(res.statusCode).toBe(200);
    expect(upserts).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it('ignores a payment failure older than the state already applied', async () => {
    lastEventAt = new Date(1_700_009_000 * 1000).toISOString();

    const res = makeRes();
    await handler(paymentFailed('evt_old_fail', 1_700_000_000), res);

    expect(res.statusCode).toBe(200);
    expect(updates).toHaveLength(0);
  });

  it('still applies a failure newer than the last event seen', async () => {
    lastEventAt = new Date(1_700_000_000 * 1000).toISOString();

    await handler(paymentFailed('evt_fresh_fail', 1_700_009_000), makeRes());

    expect(updates.find((u) => u.table === 'subscriptions')?.values.status).toBe('past_due');
  });
});

/**
 * The claim is "done" only once the handler has returned and stamped it. A
 * handler killed in between (a Vercel timeout, an OOM, a deploy swap) must not
 * cost the customer the event: its unstamped claim goes stale after the lease,
 * and Stripe's retry takes it over. See api/_lib/stripeLedger.ts.
 */
describe('stripe webhook ledger: stamp, lease and takeover', () => {
  const LEASE = CLAIM_LEASE_MS;
  const DAY = 24 * 60 * 60 * 1000;

  beforeEach(() => {
    updates.length = 0;
    upserts.length = 0;
    retrieveMock.mockReset();
    ledger.clear();
    deletedEvents.length = 0;
    lastEventAt = null;
    failUpdates = false;
    ledgerColumnMissing = false;
    stampFails = false;
    ledgerReadFails = false;
  });

  const subUpdated = (id: string | undefined, created = 1_700_000_500) => ({
    method: 'POST',
    headers: {},
    body: {
      ...(id ? { id } : {}),
      created,
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1',
          customer: 'cus_1',
          status: 'active',
          items: { data: [{ price: { id: 'price_plus' } }] },
          current_period_start: 1_700_000_000,
          current_period_end: 1_702_600_000,
        },
      },
    },
  });

  const subscriptionWrites = () => upserts.filter((u) => u.table === 'subscriptions');

  it('stamps the claim finished once the handler has returned', async () => {
    const res = makeRes();
    await handler(subUpdated('evt_stamp'), res);
    expect(res.statusCode).toBe(200);
    expect(subscriptionWrites()).toHaveLength(1);
    expect(ledger.get('evt_stamp')?.processed_at).not.toBeNull();
  });

  it('acknowledges a finished event as a duplicate and applies nothing', async () => {
    ledger.set('evt_done', {
      received_at: Date.now() - DAY,
      processed_at: Date.now() - DAY + 1000,
    });
    const res = makeRes();
    await handler(subUpdated('evt_done'), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ duplicate: true });
    expect(upserts).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it('reads rows written before processed_at existed as finished, so a deploy replays nothing', async () => {
    // The migration stamps every pre-existing row with the time it ran, so
    // history looks finished. Without that, every historical event would look
    // abandoned and be applied again the first time Stripe retried it.
    ledger.set('evt_history', {
      received_at: Date.now() - 400 * DAY,
      processed_at: Date.now() - 30 * DAY,
    });
    const res = makeRes();
    await handler(subUpdated('evt_history'), res);
    expect(res.body).toMatchObject({ duplicate: true });
    expect(upserts).toHaveLength(0);
  });

  it('answers 409 and applies nothing while another invocation holds a live claim', async () => {
    ledger.set('evt_busy', { received_at: Date.now() - (LEASE - 30_000), processed_at: null });
    const res = makeRes();
    await handler(subUpdated('evt_busy'), res);
    expect(res.statusCode).toBe(409);
    expect(upserts).toHaveLength(0);
    expect(updates).toHaveLength(0);
    // The live claim is left as it was: its owner will stamp it.
    expect(ledger.get('evt_busy')?.processed_at).toBeNull();
  });

  it('takes over an abandoned claim, reprocesses it and stamps it', async () => {
    ledger.set('evt_abandoned', { received_at: Date.now() - (LEASE + 30_000), processed_at: null });
    const res = makeRes();
    await handler(subUpdated('evt_abandoned'), res);
    expect(res.statusCode).toBe(200);
    expect(subscriptionWrites()).toHaveLength(1);
    expect(profilePlanWritten()).toBe('plus');
    expect(ledger.get('evt_abandoned')?.processed_at).not.toBeNull();
  });

  it('lets exactly one of two racing redeliveries take over an abandoned claim', async () => {
    ledger.set('evt_race', { received_at: Date.now() - (LEASE + 60_000), processed_at: null });
    const first = makeRes();
    const second = makeRes();
    await Promise.all([
      handler(subUpdated('evt_race'), first),
      handler(subUpdated('evt_race'), second),
    ]);
    expect([first.statusCode, second.statusCode].sort()).toEqual([200, 409]);
    expect(subscriptionWrites()).toHaveLength(1);
  });

  it('releases the claim when the handler throws, so the retry is claimed fresh', async () => {
    failUpdates = true;
    const res = makeRes();
    await handler(subUpdated('evt_throw'), res);
    expect(res.statusCode).toBe(500);
    expect(ledger.has('evt_throw')).toBe(false);

    failUpdates = false;
    const retry = makeRes();
    await handler(subUpdated('evt_throw'), retry);
    expect(retry.statusCode).toBe(200);
    expect(ledger.get('evt_throw')?.processed_at).not.toBeNull();
  });

  it('releases the claim and answers 500 when the stamp itself fails, so Stripe retries', async () => {
    stampFails = true;
    const res = makeRes();
    await handler(subUpdated('evt_nostamp'), res);
    expect(res.statusCode).toBe(500);
    // An unstamped claim would be taken over only after the lease, so release it
    // now. The retry reapplies the event, which is safe: the writes are ordered.
    expect(ledger.has('evt_nostamp')).toBe(false);

    stampFails = false;
    const retry = makeRes();
    await handler(subUpdated('evt_nostamp'), retry);
    expect(retry.statusCode).toBe(200);
    expect(ledger.get('evt_nostamp')?.processed_at).not.toBeNull();
  });

  it('with no processed_at column, applies the event and treats a redelivery as before', async () => {
    ledgerColumnMissing = true;
    const first = makeRes();
    await handler(subUpdated('evt_nocol'), first);
    expect(first.statusCode).toBe(200);
    expect(subscriptionWrites()).toHaveLength(1);

    const second = makeRes();
    await handler(subUpdated('evt_nocol'), second);
    expect(second.statusCode).toBe(200);
    expect(second.body).toMatchObject({ duplicate: true });
    expect(subscriptionWrites()).toHaveLength(1);
  });

  it('answers 409 rather than skipping when the ledger cannot be read', async () => {
    // Acknowledging here could drop an abandoned event for good; refusing only
    // makes Stripe try again.
    ledger.set('evt_unreadable', { received_at: Date.now(), processed_at: null });
    ledgerReadFails = true;
    const res = makeRes();
    await handler(subUpdated('evt_unreadable'), res);
    expect(res.statusCode).toBe(409);
    expect(upserts).toHaveLength(0);
  });

  it('applies an event that carries no id, with no ledger row (as before the ledger)', async () => {
    const res = makeRes();
    await handler(subUpdated(undefined), res);
    expect(res.statusCode).toBe(200);
    expect(subscriptionWrites()).toHaveLength(1);
    expect(ledger.size).toBe(0);
  });
});
