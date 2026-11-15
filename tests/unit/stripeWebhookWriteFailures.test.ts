import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Failed writes in the Stripe webhook must reach Stripe as a 500, so the event is
 * retried. A write that errors but is acknowledged with 200 is lost for good, and a
 * plan lookup that errors must never fall back to "free" for a user who still holds
 * another live subscription. These tests drive the real handler against a fake
 * database that records every write and can be told to fail one.
 */

type Err = { code?: string; message: string } | null;
interface Result {
  data: unknown;
  error: Err;
}
interface Chain extends PromiseLike<Result> {
  eq(col: string, value: unknown): Chain;
  in(col: string, values: unknown[]): Chain;
  is(col: string, value: unknown): Chain;
  lt(col: string, value: unknown): Chain;
  select(columns?: string): Chain;
  maybeSingle(): Promise<Result>;
}
interface Write {
  table: string;
  values: Record<string, unknown>;
}

const state = {
  /** The status the subscription row already holds. */
  status: 'active' as string | null,
  /** Error for a read of the subscription status column. */
  statusReadError: null as Err,
  /** Error for a write to a table, so the write fails. */
  updateErrors: {} as Record<string, Err>,
  /** What resolve_stripe_plan returns, or its error. */
  rpcResult: { data: 'free', error: null } as Result,
  writes: [] as Write[],
  rpcCalls: [] as Array<{ name: string; args: unknown }>,
};

const row = () => ({
  id: 'user-1',
  user_id: 'user-1',
  payer_id: null,
  school_id: 'school-1',
  status: state.status,
  last_event_at: null,
  plan: null,
  stripe_subscription_id: null,
});

const readChain = (table: string, columns?: string): Chain => {
  const single = (): Result => {
    if (table === 'subscriptions' && columns === 'status' && state.statusReadError) {
      return { data: null, error: state.statusReadError };
    }
    return { data: table === 'stripe_events' ? null : row(), error: null };
  };
  const list: Result = { data: [], error: null };
  const chain: Chain = {
    eq: () => chain,
    in: () => chain,
    is: () => chain,
    lt: () => chain,
    select: () => chain,
    maybeSingle: async () => single(),
    then: (ok, fail) => Promise.resolve(list).then(ok, fail),
  };
  return chain;
};

const writeChain = (table: string, values: Record<string, unknown>): Chain => {
  state.writes.push({ table, values });
  const result: Result = { data: [{ id: 'x' }], error: state.updateErrors[table] ?? null };
  const chain: Chain = {
    eq: () => chain,
    in: () => chain,
    is: () => chain,
    lt: () => chain,
    select: () => chain,
    maybeSingle: async () => result,
    then: (ok, fail) => Promise.resolve(result).then(ok, fail),
  };
  return chain;
};

const fakeSupabase = {
  from: (table: string) => ({
    insert: async () => ({ error: null }),
    select: (columns?: string) => readChain(table, columns),
    update: (values: Record<string, unknown>) => writeChain(table, values),
    upsert: async (values: Record<string, unknown>) => {
      state.writes.push({ table, values });
      return { error: null };
    },
    delete: () => ({ eq: async () => ({ error: null }) }),
  }),
  rpc: async (name: string, args: unknown) => {
    state.rpcCalls.push({ name, args });
    return state.rpcResult;
  },
};

const PRICES: Record<string, string> = { price_plus: 'plus', price_school: 'school' };

vi.mock('../../api/_lib/stripe', () => ({
  getStripe: () => ({ subscriptions: { retrieve: async () => ({}) } }),
  getSupabaseAdmin: () => fakeSupabase,
  isStripeConfigured: () => true,
  isDeployedRuntime: () => false,
  priceToPlan: (id: string) => PRICES[id] ?? 'free',
}));

import handler from '../../api/stripe-webhook';

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

const post = (event: Record<string, unknown>) => ({
  method: 'POST',
  headers: {},
  body: event,
});

const subscriptionEvent = (
  type: string,
  status: string,
  price = 'price_plus',
  created = 1_700_000_000
) => ({
  id: `evt_${type}_${status}_${price}`,
  type,
  created,
  data: {
    object: {
      id: 'sub_1',
      customer: 'cus_1',
      status,
      items: {
        data: [
          {
            price: { id: price },
            quantity: 1,
            current_period_start: 1_700_000_000,
            current_period_end: 1_702_600_000,
          },
        ],
      },
    },
  },
});

const deletedEvent = () => ({
  id: 'evt_deleted',
  type: 'customer.subscription.deleted',
  created: 1_700_000_000,
  data: { object: { id: 'sub_1', customer: 'cus_1' } },
});

const paymentFailedEvent = (created = 1_700_000_500) => ({
  id: `evt_fail_${created}`,
  type: 'invoice.payment_failed',
  created,
  data: { object: { customer: 'cus_1', subscription: 'sub_1' } },
});

const writesTo = (table: string) => state.writes.filter((w) => w.table === table);
const profilePlanWrites = () =>
  writesTo('profiles')
    .filter((w) => 'stripe_plan' in w.values)
    .map((w) => w.values.stripe_plan);

beforeEach(() => {
  delete process.env.STRIPE_WEBHOOK_SECRET;
  state.status = 'active';
  state.statusReadError = null;
  state.updateErrors = {};
  state.rpcResult = { data: 'free', error: null };
  state.writes = [];
  state.rpcCalls = [];
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('invoice.payment_failed only marks a plan-holding subscription past_due', () => {
  it.each(['active', 'trialing', 'past_due'])(
    'marks a %s subscription past_due',
    async (status) => {
      state.status = status;
      const res = makeRes();
      await handler(post(paymentFailedEvent()), res);
      expect(res.statusCode).toBe(200);
      const write = writesTo('subscriptions')[0];
      expect(write?.values.status).toBe('past_due');
      expect(write?.values.last_event_at).toBe(new Date(1_700_000_500 * 1000).toISOString());
    }
  );

  it('leaves an incomplete first purchase unchanged, with no status and no stamp', async () => {
    state.status = 'incomplete';
    const res = makeRes();
    await handler(post(paymentFailedEvent()), res);
    expect(res.statusCode).toBe(200);
    expect(writesTo('subscriptions')).toEqual([]);
  });

  it('leaves a row that does not exist unchanged', async () => {
    state.status = null;
    const res = makeRes();
    await handler(post(paymentFailedEvent()), res);
    expect(res.statusCode).toBe(200);
    expect(writesTo('subscriptions')).toEqual([]);
  });

  it('answers 500 when the status cannot be read, so Stripe retries', async () => {
    state.statusReadError = { message: 'connection lost' };
    const res = makeRes();
    await handler(post(paymentFailedEvent()), res);
    expect(res.statusCode).toBe(500);
    expect(writesTo('subscriptions')).toEqual([]);
  });

  it('answers 500 when the past_due write fails', async () => {
    state.updateErrors.subscriptions = { message: 'write failed' };
    const res = makeRes();
    await handler(post(paymentFailedEvent()), res);
    expect(res.statusCode).toBe(500);
  });
});

describe('customer.subscription.deleted does not drop a plan it cannot resolve', () => {
  it('answers 500 when the school licence cancel fails', async () => {
    state.updateErrors.schools = { message: 'write failed' };
    const res = makeRes();
    await handler(post(deletedEvent()), res);
    expect(res.statusCode).toBe(500);
    expect(profilePlanWrites()).toEqual([]);
  });

  it('answers 500 and writes no free plan when resolve_stripe_plan errors', async () => {
    state.rpcResult = { data: null, error: { message: 'rpc unavailable' } };
    const res = makeRes();
    await handler(post(deletedEvent()), res);
    expect(res.statusCode).toBe(500);
    expect(profilePlanWrites()).toEqual([]);
  });

  it('keeps the plan a second live subscription still grants', async () => {
    state.rpcResult = { data: 'plus', error: null };
    const res = makeRes();
    await handler(post(deletedEvent()), res);
    expect(res.statusCode).toBe(200);
    expect(profilePlanWrites()).toEqual(['plus']);
  });

  it('answers 500 when the profile downgrade fails', async () => {
    state.updateErrors.profiles = { message: 'write failed' };
    const res = makeRes();
    await handler(post(deletedEvent()), res);
    expect(res.statusCode).toBe(500);
  });
});

describe('a terminal subscription update resolves the plan across the holder’s subscriptions', () => {
  it('asks resolve_stripe_plan for the holder and writes its answer, not free', async () => {
    state.rpcResult = { data: 'plus', error: null };
    const res = makeRes();
    await handler(post(subscriptionEvent('customer.subscription.updated', 'canceled')), res);
    expect(res.statusCode).toBe(200);
    expect(state.rpcCalls).toEqual([
      { name: 'resolve_stripe_plan', args: { p_user_id: 'user-1' } },
    ]);
    expect(profilePlanWrites()).toEqual(['plus']);
  });

  it('writes free when resolve_stripe_plan finds no other live subscription', async () => {
    state.rpcResult = { data: 'free', error: null };
    const res = makeRes();
    await handler(post(subscriptionEvent('customer.subscription.updated', 'canceled')), res);
    expect(profilePlanWrites()).toEqual(['free']);
  });

  it('answers 500 and writes nothing to the plan when resolve_stripe_plan errors', async () => {
    state.rpcResult = { data: null, error: { message: 'rpc unavailable' } };
    const res = makeRes();
    await handler(post(subscriptionEvent('customer.subscription.updated', 'canceled')), res);
    expect(res.statusCode).toBe(500);
    expect(profilePlanWrites()).toEqual([]);
  });

  it('does not consult resolve_stripe_plan for a live subscription', async () => {
    const res = makeRes();
    await handler(post(subscriptionEvent('customer.subscription.updated', 'active')), res);
    expect(res.statusCode).toBe(200);
    expect(state.rpcCalls).toEqual([]);
    expect(profilePlanWrites()).toEqual(['plus']);
  });
});

describe('a school licence write that fails is retried, not acknowledged', () => {
  it('answers 500 when the school sync fails', async () => {
    state.updateErrors.schools = { message: 'write failed' };
    const res = makeRes();
    await handler(
      post(subscriptionEvent('customer.subscription.updated', 'active', 'price_school')),
      res
    );
    expect(res.statusCode).toBe(500);
  });

  it('applies the school sync when it succeeds', async () => {
    const res = makeRes();
    await handler(
      post(subscriptionEvent('customer.subscription.updated', 'active', 'price_school')),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(writesTo('schools').some((w) => w.values.plan_status === 'active')).toBe(true);
  });
});
