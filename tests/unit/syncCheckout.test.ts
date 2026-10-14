import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * POST /api/sync-checkout confirms a purchase when the browser returns from
 * Checkout. These tests pin the contract that makes that safe to ship:
 *
 *  - the client is trusted for the session id and nothing else;
 *  - a session that is not this account's is refused, whatever it says;
 *  - the plan comes from the subscription's price, never from the session;
 *  - the row is ordered against webhook events in both directions;
 *  - a failed apply puts the ordering stamp back, so the webhook can still land.
 *
 * Stripe and Supabase are mocked. The Supabase fake is one in-memory store shared
 * by the sync endpoint and the webhook, so the ordering tests run both against
 * the same rows.
 */

type Row = Record<string, unknown>;
type TableName = 'profiles' | 'subscriptions' | 'schools' | 'stripe_events';

const tables: Record<TableName, Map<string, Row>> = {
  profiles: new Map(),
  subscriptions: new Map(),
  schools: new Map(),
  stripe_events: new Map(),
};

/** Makes writes of profiles.stripe_plan fail, after the subscription row is written. */
let failProfilePlanWrite = false;
let stripeConfigured = true;
let stripeMisconfigured = false;
let supabaseEnabled = true;
let authImpl: () => Promise<{
  ok: boolean;
  status?: number;
  error?: string;
  userId?: string;
}> = async () => ({ ok: true, userId: 'user-1' });

const retrieveSession = vi.fn();
const retrieveSubscription = vi.fn();

const matches = (row: Row, filters: Array<[string, unknown]>) =>
  filters.every(([col, val]) => row[col] === val);

const rowsOf = (table: TableName, filters: Array<[string, unknown]>) =>
  [...tables[table].values()].filter((row) => matches(row, filters));

const readBuilder = (table: TableName) => {
  const filters: Array<[string, unknown]> = [];
  const builder = {
    eq: (col: string, val: unknown) => {
      filters.push([col, val]);
      return builder;
    },
    maybeSingle: async () => ({ data: rowsOf(table, filters)[0] ?? null, error: null }),
    single: async () => ({ data: rowsOf(table, filters)[0] ?? null, error: null }),
  };
  return builder;
};

/** Makes writes of profiles.stripe_customer_id fail, before anything is stamped. */
let failCustomerLink = false;

const writeError = (table: TableName, values: Row) => {
  if (table !== 'profiles') return null;
  if ('stripe_customer_id' in values && failCustomerLink) {
    return { message: 'customer link write failed' };
  }
  if ('stripe_plan' in values && failProfilePlanWrite) {
    return { message: 'profile plan write failed' };
  }
  return null;
};

const updateBuilder = (table: TableName, values: Row) => ({
  eq: (col: string, val: unknown) => ({
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
      const error = writeError(table, values);
      if (!error) for (const row of rowsOf(table, [[col, val]])) Object.assign(row, values);
      return Promise.resolve({ data: null, error }).then(resolve, reject);
    },
  }),
});

const fakeSupabase = {
  from: (table: TableName) => ({
    select: () => readBuilder(table),
    insert: async (values: Row) => {
      const id = values.id as string;
      if (tables[table].has(id)) return { error: { code: '23505', message: 'duplicate key' } };
      tables[table].set(id, { ...values });
      return { error: null };
    },
    upsert: async (values: Row) => {
      const id = values.id as string;
      tables[table].set(id, { ...(tables[table].get(id) ?? {}), ...values });
      return { error: null };
    },
    update: (values: Row) => updateBuilder(table, values),
    delete: () => ({
      eq: async (col: string, val: unknown) => {
        for (const [id, row] of tables[table]) if (row[col] === val) tables[table].delete(id);
        return { error: null };
      },
    }),
  }),
  rpc: async () => ({ data: 'free', error: null }),
};

vi.mock('../../api/_lib/stripe', () => ({
  getStripe: () =>
    ({
      checkout: {
        sessions: { retrieve: (...args: unknown[]) => retrieveSession(...args) },
      },
      subscriptions: { retrieve: (...args: unknown[]) => retrieveSubscription(...args) },
    }) as unknown,
  isStripeConfigured: () => stripeConfigured,
  isStripeMisconfigured: () => stripeMisconfigured,
  STRIPE_MISCONFIGURED_ERROR: 'billing misconfigured',
  getSupabaseAdmin: () => (supabaseEnabled ? fakeSupabase : null),
  priceToPlan: (id: string) =>
    (({ price_plus: 'plus', price_school: 'school' }) as Record<string, string>)[id] ?? 'free',
  resolveReturnBase: () => 'http://localhost:3000/',
  configuredPrices: () => ({ price_plus: 'plus', price_school: 'school' }),
  isProductionRuntime: () => false,
}));

vi.mock('../../api/_lib/auth', () => ({
  verifyRequestAuth: (...args: unknown[]) => (authImpl as (...a: unknown[]) => unknown)(...args),
  extractBearerToken: () => 'token',
}));

import syncCheckout from '../../api/sync-checkout';
import webhook from '../../api/stripe-webhook';

const T0 = 1_700_000_000; // seconds
const SESSION_ID = 'cs_test_a1B2c3D4e5F6g7';
const iso = (sec: number) => new Date(sec * 1000).toISOString();

const makeRes = () => ({
  statusCode: 0,
  body: undefined as Record<string, unknown> | undefined,
  status(code: number) {
    this.statusCode = code;
    return this;
  },
  json(data: unknown) {
    this.body = data as Record<string, unknown>;
  },
  setHeader() {},
});

const subscriptionObj = (overrides: Row = {}, priceId = 'price_plus', quantity = 1): Row => ({
  id: 'sub_1',
  customer: 'cus_1',
  status: 'active',
  cancel_at_period_end: false,
  items: {
    data: [
      {
        price: { id: priceId },
        quantity,
        current_period_start: 1_700_000_000,
        current_period_end: 1_702_600_000,
      },
    ],
  },
  metadata: { supabase_user_id: 'user-1' },
  ...overrides,
});

const session = (overrides: Row = {}): Row => ({
  id: SESSION_ID,
  client_reference_id: 'user-1',
  mode: 'subscription',
  status: 'complete',
  payment_status: 'paid',
  customer: 'cus_1',
  subscription: subscriptionObj(),
  ...overrides,
});

const syncRequest = (body: Record<string, unknown> = { sessionId: SESSION_ID }) => ({
  method: 'POST',
  headers: { authorization: 'Bearer t' },
  body,
});

const webhookRequest = (id: string, created: number, type: string, object: Row) => ({
  method: 'POST',
  headers: {},
  body: { id, created, type, data: { object } },
});

const row = (table: TableName, id: string) => tables[table].get(id);

beforeEach(() => {
  for (const table of Object.keys(tables) as TableName[]) tables[table].clear();
  tables.profiles.set('user-1', {
    id: 'user-1',
    role: 'teacher',
    school_id: 'school-1',
    stripe_plan: 'free',
    stripe_customer_id: null,
  });
  tables.schools.set('school-1', { id: 'school-1', stripe_subscription_id: null });

  retrieveSession.mockReset();
  retrieveSubscription.mockReset();
  retrieveSession.mockResolvedValue(session());
  failProfilePlanWrite = false;
  failCustomerLink = false;
  stripeConfigured = true;
  stripeMisconfigured = false;
  supabaseEnabled = true;
  authImpl = async () => ({ ok: true, userId: 'user-1' });

  // Stripe's clock, frozen so the stamp is exact. Only Date is faked.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0 * 1000 + 500_000);

  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('sync-checkout: who may confirm a purchase', () => {
  it('refuses a session that belongs to another account, and writes nothing', async () => {
    retrieveSession.mockResolvedValue(session({ client_reference_id: 'user-2' }));
    const res = makeRes();
    await syncCheckout(syncRequest(), res);

    expect(res.statusCode).toBe(403);
    expect(res.body?.error).not.toContain('user-2');
    expect(row('profiles', 'user-1')?.stripe_customer_id).toBeNull();
    expect(row('profiles', 'user-1')?.stripe_plan).toBe('free');
    expect(tables.subscriptions.size).toBe(0);
  });

  it('refuses a session that is not a subscription', async () => {
    retrieveSession.mockResolvedValue(session({ mode: 'payment' }));
    const res = makeRes();
    await syncCheckout(syncRequest(), res);

    expect(res.statusCode).toBe(403);
    expect(tables.subscriptions.size).toBe(0);
  });

  it('answers the same generic 403 for an unknown session as for someone else’s', async () => {
    retrieveSession.mockRejectedValue(
      Object.assign(new Error('No such checkout session'), { code: 'resource_missing' })
    );
    const res = makeRes();
    await syncCheckout(syncRequest(), res);

    expect(res.statusCode).toBe(403);
    expect(res.body?.error).toBe(
      'We could not confirm a purchase for this account from that checkout session. If you have just paid, wait a minute and refresh; if the plan is still locked, contact us.'
    );
    expect(tables.subscriptions.size).toBe(0);
  });

  it('answers 401 when the caller is not signed in, and never asks Stripe', async () => {
    authImpl = async () => ({ ok: false, status: 401, error: 'Authentication required.' });
    const res = makeRes();
    await syncCheckout(syncRequest(), res);

    expect(res.statusCode).toBe(401);
    expect(retrieveSession).not.toHaveBeenCalled();
  });

  it('answers 401 when the auth gate passes without a user identity', async () => {
    authImpl = async () => ({ ok: true });
    const res = makeRes();
    await syncCheckout(syncRequest(), res);

    expect(res.statusCode).toBe(401);
    expect(retrieveSession).not.toHaveBeenCalled();
  });
});

describe('sync-checkout: the request is validated before anything else', () => {
  it.each([
    ['no session id', {}],
    ['a non-string session id', { sessionId: 12345 }],
    ['a session id with the wrong prefix', { sessionId: 'pi_test_a1B2c3D4e5F6g7' }],
    ['a session id with characters outside the Stripe alphabet', { sessionId: 'cs_test_a1 b2;c3' }],
    ['a session id that is too short', { sessionId: 'cs_x' }],
  ])('answers 400 for %s without calling Stripe', async (_label, body) => {
    const res = makeRes();
    await syncCheckout(syncRequest(body as Record<string, unknown>), res);

    expect(res.statusCode).toBe(400);
    expect(retrieveSession).not.toHaveBeenCalled();
  });

  it('answers 405 to anything but POST', async () => {
    const res = makeRes();
    await syncCheckout({ method: 'GET', headers: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it('answers 503 when Stripe is half configured, so the user is not told nothing was bought', async () => {
    stripeMisconfigured = true;
    const res = makeRes();
    await syncCheckout(syncRequest(), res);

    expect(res.statusCode).toBe(503);
    expect(retrieveSession).not.toHaveBeenCalled();
  });

  it('answers 501 when the Supabase service role is missing', async () => {
    supabaseEnabled = false;
    const res = makeRes();
    await syncCheckout(syncRequest(), res);

    expect(res.statusCode).toBe(501);
    expect(retrieveSession).not.toHaveBeenCalled();
  });

  it('answers pending in test mode, without calling Stripe, so the poll takes over', async () => {
    stripeConfigured = false;
    const res = makeRes();
    await syncCheckout(syncRequest(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'pending', test: true });
    expect(retrieveSession).not.toHaveBeenCalled();
  });
});

describe('sync-checkout: what counts as a confirmed purchase', () => {
  it('answers pending for a session still open, and writes nothing', async () => {
    retrieveSession.mockResolvedValue(session({ status: 'open', payment_status: 'unpaid' }));
    const res = makeRes();
    await syncCheckout(syncRequest(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'pending' });
    expect(tables.subscriptions.size).toBe(0);
    expect(row('profiles', 'user-1')?.stripe_plan).toBe('free');
  });

  it('answers pending for a completed session that was not paid', async () => {
    retrieveSession.mockResolvedValue(session({ payment_status: 'unpaid' }));
    const res = makeRes();
    await syncCheckout(syncRequest(), res);

    expect(res.body).toEqual({ status: 'pending' });
    expect(tables.subscriptions.size).toBe(0);
  });

  it('answers pending while the subscription is still incomplete (3-D Secure, say)', async () => {
    retrieveSession.mockResolvedValue(
      session({ subscription: subscriptionObj({ status: 'incomplete' }) })
    );
    const res = makeRes();
    await syncCheckout(syncRequest(), res);

    expect(res.body).toEqual({ status: 'pending' });
    expect(tables.subscriptions.size).toBe(0);
  });

  it('answers pending when the subscription is not expanded, rather than guessing a plan', async () => {
    retrieveSession.mockResolvedValue(session({ subscription: 'sub_1' }));
    const res = makeRes();
    await syncCheckout(syncRequest(), res);

    expect(res.body).toEqual({ status: 'pending' });
    expect(tables.subscriptions.size).toBe(0);
  });

  it('answers pending for a price this deployment does not sell, and grants nothing', async () => {
    retrieveSession.mockResolvedValue(
      session({ subscription: subscriptionObj({}, 'price_retired') })
    );
    const res = makeRes();
    await syncCheckout(syncRequest(), res);

    expect(res.body).toEqual({ status: 'pending' });
    expect(tables.subscriptions.size).toBe(0);
    expect(row('profiles', 'user-1')?.stripe_customer_id).toBeNull();
  });

  it('answers 502 with a generic message when Stripe cannot be reached, and writes nothing', async () => {
    retrieveSession.mockRejectedValue(new Error('connect ETIMEDOUT api.stripe.com'));
    const res = makeRes();
    await syncCheckout(syncRequest(), res);

    expect(res.statusCode).toBe(502);
    expect(res.body?.error).not.toContain('ETIMEDOUT');
    expect(tables.subscriptions.size).toBe(0);
    expect(row('profiles', 'user-1')?.stripe_customer_id).toBeNull();
  });
});

describe('sync-checkout: a paid purchase is applied through the shared module', () => {
  it('writes the subscription row, links the customer and sets the profile plan', async () => {
    const res = makeRes();
    await syncCheckout(syncRequest(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'active', plan: 'plus' });
    expect(retrieveSession).toHaveBeenCalledWith(SESSION_ID, { expand: ['subscription'] });

    expect(row('subscriptions', 'sub_1')).toMatchObject({
      user_id: 'user-1',
      stripe_customer_id: 'cus_1',
      status: 'active',
      plan: 'plus',
      seats: 1,
    });
    expect(row('profiles', 'user-1')).toMatchObject({
      stripe_customer_id: 'cus_1',
      stripe_plan: 'plus',
    });
  });

  it('syncs the school licence onto the purchaser’s school, with the seat count', async () => {
    retrieveSession.mockResolvedValue(
      session({ subscription: subscriptionObj({}, 'price_school', 30) })
    );
    const res = makeRes();
    await syncCheckout(syncRequest(), res);

    expect(res.body).toEqual({ status: 'active', plan: 'school' });
    expect(row('profiles', 'user-1')?.stripe_plan).toBe('school');
    expect(row('schools', 'school-1')).toMatchObject({
      stripe_subscription_id: 'sub_1',
      plan_seats: 30,
      plan_status: 'active',
    });
  });

  it('grants nothing the client names: only the session id is read from the body', async () => {
    const res = makeRes();
    await syncCheckout(
      syncRequest({
        sessionId: SESSION_ID,
        plan: 'school',
        priceId: 'price_school',
        userId: 'user-2',
      }),
      res
    );

    expect(res.body).toEqual({ status: 'active', plan: 'plus' });
    expect(row('profiles', 'user-1')?.stripe_plan).toBe('plus');
    expect(row('profiles', 'user-2')).toBeUndefined();
  });

  it('is a no-op on a repeat call: both answer active and the stored rows are identical', async () => {
    const first = makeRes();
    await syncCheckout(syncRequest(), first);
    const snapshot = JSON.stringify({
      profiles: [...tables.profiles.entries()],
      subscriptions: [...tables.subscriptions.entries()],
      schools: [...tables.schools.entries()],
    });

    const second = makeRes();
    await syncCheckout(syncRequest(), second);

    expect(first.body).toEqual({ status: 'active', plan: 'plus' });
    expect(second.body).toEqual({ status: 'active', plan: 'plus' });
    expect(
      JSON.stringify({
        profiles: [...tables.profiles.entries()],
        subscriptions: [...tables.subscriptions.entries()],
        schools: [...tables.schools.entries()],
      })
    ).toBe(snapshot);
  });

  it('stamps the row with the time captured BEFORE the Stripe call', async () => {
    // Stripe takes five seconds to answer. The stamp must still be the time we asked.
    retrieveSession.mockImplementation(async () => {
      vi.setSystemTime(T0 * 1000 + 505_000);
      return session();
    });
    const res = makeRes();
    await syncCheckout(syncRequest(), res);

    expect(row('subscriptions', 'sub_1')?.last_event_at).toBe(iso(T0 + 500));
  });
});

describe('sync-checkout and the webhook: ordering in both directions', () => {
  const later = (status: string) =>
    webhookRequest(
      'evt_after_look',
      T0 + 600,
      'customer.subscription.updated',
      subscriptionObj({ status })
    );
  const earlier = (status: string) =>
    webhookRequest(
      'evt_before_look',
      T0 + 400,
      'customer.subscription.updated',
      subscriptionObj({ status })
    );

  it('applies a webhook event created AFTER the sync looked, even though it lands later', async () => {
    const res = makeRes();
    await syncCheckout(syncRequest(), res);
    expect(res.body).toEqual({ status: 'active', plan: 'plus' });

    // A cancellation that Stripe created after our look must not be discarded.
    const hook = makeRes();
    await webhook(later('canceled'), hook);

    expect(hook.statusCode).toBe(200);
    expect(row('subscriptions', 'sub_1')?.status).toBe('canceled');
    expect(row('profiles', 'user-1')?.stripe_plan).toBe('free');
  });

  it('discards a webhook event created BEFORE the sync looked, because the sync already holds that state', async () => {
    const res = makeRes();
    await syncCheckout(syncRequest(), res);

    const hook = makeRes();
    await webhook(earlier('canceled'), hook);

    expect(hook.statusCode).toBe(200);
    expect(row('subscriptions', 'sub_1')?.status).toBe('active');
    expect(row('profiles', 'user-1')?.stripe_plan).toBe('plus');
  });

  it('does not roll back a row that a newer webhook event has already written', async () => {
    // The webhook's newer event lands first; the sync, which started earlier, must not
    // write its older view over it.
    const hook = makeRes();
    await webhook(later('active'), hook);
    expect(row('subscriptions', 'sub_1')?.last_event_at).toBe(iso(T0 + 600));

    const res = makeRes();
    await syncCheckout(syncRequest(), res);

    expect(res.statusCode).toBe(200);
    expect(row('subscriptions', 'sub_1')?.last_event_at).toBe(iso(T0 + 600));
  });

  it('keeps the webhook copy of the purchase when the sync fails after stamping the row', async () => {
    // The subscription row is written with the stamp, then the profile write fails.
    // Without the restore, the webhook's earlier event would be discarded as stale and
    // the customer would never receive the plan.
    failProfilePlanWrite = true;
    const res = makeRes();
    await syncCheckout(syncRequest(), res);

    expect(res.statusCode).toBe(502);
    expect(row('subscriptions', 'sub_1')?.last_event_at).toBeNull();

    failProfilePlanWrite = false;
    const hook = makeRes();
    await webhook(earlier('active'), hook);

    expect(hook.statusCode).toBe(200);
    expect(row('profiles', 'user-1')?.stripe_plan).toBe('plus');
  });

  it('answers 502 and stamps nothing when the customer link fails, because the link runs before the apply', async () => {
    failCustomerLink = true;
    const res = makeRes();
    await syncCheckout(syncRequest(), res);

    expect(res.statusCode).toBe(502);
    expect(tables.subscriptions.size).toBe(0);
    expect(row('profiles', 'user-1')?.stripe_plan).toBe('free');
  });
});
