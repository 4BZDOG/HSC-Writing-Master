import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The stripe-webhook's course-unlock path (projectDocs/course-unlocks.md, schema §34).
 *
 * A `checkout.session.completed` with metadata.kind === 'course_unlock' records one
 * course_unlocks row, idempotently, and never touches the subscription path. A full refund of
 * that charge revokes the unlock; a partial refund does not. A subscription checkout still
 * links the customer, as before.
 */

type Row = Record<string, unknown>;

/** course_unlocks, as the fake database holds it. */
let unlocks: Row[] = [];
/** Every write the handler makes, by table, so the tests can show what was not touched. */
let writes: Array<{ table: string; op: string; values?: Row }> = [];
/** Set to make the next course_unlocks write fail, as a database outage would. */
let unlockWriteError: { message: string } | null = null;

const linkStripeCustomerMock = vi.fn();
const applySubscriptionUpsertMock = vi.fn();
const handleChargeRefundedMock = vi.fn();
const releaseEventMock = vi.fn();

const fakeSupabase = () => ({
  from: (table: string) => {
    if (table !== 'course_unlocks') {
      // Any other table: record the write, so "did not touch subscriptions/profiles" is checkable.
      return {
        upsert: async (values: Row) => {
          writes.push({ table, op: 'upsert', values });
          return { error: null };
        },
        update: (values: Row) => {
          writes.push({ table, op: 'update', values });
          return { eq: () => ({ is: async () => ({ error: null }) }), error: null };
        },
      };
    }
    return {
      upsert: async (values: Row, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
        writes.push({ table, op: 'upsert', values });
        if (unlockWriteError) return { error: unlockWriteError };
        const key = opts?.onConflict ?? 'id';
        const clash = unlocks.find((r) => r[key] === values[key]);
        if (clash) {
          // ON CONFLICT DO NOTHING: a replayed session adds no second row.
          if (opts?.ignoreDuplicates) return { error: null };
          return { error: { message: 'duplicate key' } };
        }
        unlocks.push({ id: `row_${unlocks.length + 1}`, revoked_at: null, ...values });
        return { error: null };
      },
      update: (values: Row) => {
        writes.push({ table, op: 'update', values });
        const matches: Array<[string, unknown]> = [];
        const chain = {
          eq: (col: string, val: unknown) => {
            matches.push([col, val]);
            return chain;
          },
          is: async (col: string, val: unknown) => {
            for (const row of unlocks) {
              const ok = matches.every(([c, v]) => row[c] === v) && row[col] === val;
              if (ok) Object.assign(row, values);
            }
            return { error: null };
          },
        };
        return chain;
      },
    };
  },
});

vi.mock('../../api/_lib/stripe', () => ({
  getStripe: () => ({ subscriptions: { retrieve: vi.fn() } }) as unknown,
  isStripeConfigured: () => true,
  getSupabaseAdmin: () => fakeSupabase(),
  priceToPlan: () => 'plus',
  isDeployedRuntime: () => false,
}));

vi.mock('../../api/_lib/stripeLedger', () => ({
  claimEvent: async () => 'claimed',
  markEventProcessed: async () => undefined,
  releaseEvent: (...args: unknown[]) => releaseEventMock(...args),
}));

vi.mock('../../api/_lib/disputes', () => ({
  handleChargeRefunded: (...args: unknown[]) => handleChargeRefundedMock(...args),
  handleDisputeCreated: async () => undefined,
  handleDisputeClosed: async () => undefined,
}));

vi.mock('../../api/_lib/subscriptionSync', () => ({
  applySubscriptionUpsert: (...args: unknown[]) => applySubscriptionUpsertMock(...args),
  eventStamp: () => 0,
  isStaleEvent: () => false,
  linkStripeCustomer: (...args: unknown[]) => linkStripeCustomerMock(...args),
}));

import handler from '../../api/stripe-webhook';

const ENV_KEYS = ['STRIPE_WEBHOOK_SECRET', 'COURSE_UNLOCK_DURATION_DAYS'] as const;
let saved: Record<string, string | undefined> = {};

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

const event = (type: string, object: Row, id = 'evt_1') => ({
  method: 'POST',
  headers: {},
  body: { id, created: 1_700_000_500, type, data: { object } },
});

/** A paid course-unlock checkout session, as Stripe sends it on completion. */
const courseSession = (overrides: Row = {}): Row => ({
  id: 'cs_cu_1',
  mode: 'payment',
  payment_status: 'paid',
  client_reference_id: 'user-1',
  customer: null,
  payment_intent: 'pi_cu_1',
  metadata: {
    kind: 'course_unlock',
    course_id: 'course-hsc-chemistry',
    supabase_user_id: 'user-1',
  },
  ...overrides,
});

const deliver = async (body: ReturnType<typeof event>) => {
  const res = makeRes();
  await handler(body, res);
  return res;
};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.COURSE_UNLOCK_DURATION_DAYS;
  unlocks = [];
  writes = [];
  unlockWriteError = null;
  linkStripeCustomerMock.mockReset();
  applySubscriptionUpsertMock.mockReset();
  handleChargeRefundedMock.mockReset();
  releaseEventMock.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

describe('stripe-webhook: a course-unlock checkout', () => {
  it('records one unlock for the user and course, with the payment intent and no expiry', async () => {
    const res = await deliver(event('checkout.session.completed', courseSession()));

    expect(res.statusCode).toBe(200);
    expect(unlocks).toHaveLength(1);
    expect(unlocks[0]).toMatchObject({
      user_id: 'user-1',
      course_id: 'course-hsc-chemistry',
      source: 'purchase',
      stripe_checkout_session_id: 'cs_cu_1',
      stripe_payment_intent_id: 'pi_cu_1',
      expires_at: null,
    });
  });

  it('writes with the session id as the conflict key, ignoring a duplicate', async () => {
    await deliver(event('checkout.session.completed', courseSession()));
    const upsert = writes.find((w) => w.table === 'course_unlocks' && w.op === 'upsert');
    expect(upsert).toBeDefined();
    const values = upsert?.values as Row;
    expect(values.stripe_checkout_session_id).toBe('cs_cu_1');
  });

  it('is idempotent: a replayed event leaves a single unlock row', async () => {
    await deliver(event('checkout.session.completed', courseSession()));
    const replay = await deliver(event('checkout.session.completed', courseSession()));

    expect(replay.statusCode).toBe(200);
    expect(unlocks.filter((r) => r.stripe_checkout_session_id === 'cs_cu_1')).toHaveLength(1);
  });

  it('sets expires_at from COURSE_UNLOCK_DURATION_DAYS when it is set', async () => {
    process.env.COURSE_UNLOCK_DURATION_DAYS = '365';
    const before = Date.now();
    await deliver(event('checkout.session.completed', courseSession()));

    const expires = Date.parse(String(unlocks[0].expires_at));
    const days = (expires - before) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(364.9);
    expect(days).toBeLessThan(365.1);
  });

  it('never touches the subscription path, the customer link or the profile or subscription rows', async () => {
    await deliver(
      event(
        'checkout.session.completed',
        courseSession({ customer: 'cus_1', subscription: 'sub_should_not_matter' })
      )
    );

    expect(linkStripeCustomerMock).not.toHaveBeenCalled();
    expect(applySubscriptionUpsertMock).not.toHaveBeenCalled();
    const tables = writes.map((w) => w.table);
    expect(tables.every((t) => t === 'course_unlocks')).toBe(true);
  });

  it('records nothing for a session that is not yet paid, and acknowledges it', async () => {
    const res = await deliver(
      event('checkout.session.completed', courseSession({ payment_status: 'unpaid' }))
    );
    expect(res.statusCode).toBe(200);
    expect(unlocks).toHaveLength(0);
    expect(linkStripeCustomerMock).not.toHaveBeenCalled();
  });

  it('answers 500 and releases the claim when the write fails, so Stripe retries', async () => {
    unlockWriteError = { message: 'connection reset' };
    const res = await deliver(event('checkout.session.completed', courseSession()));

    expect(res.statusCode).toBe(500);
    expect(releaseEventMock).toHaveBeenCalled();
  });
});

describe('stripe-webhook: a subscription checkout still links the customer', () => {
  it('runs the customer link for a checkout with no course_unlock kind', async () => {
    await deliver(
      event('checkout.session.completed', {
        id: 'cs_sub_1',
        mode: 'subscription',
        payment_status: 'paid',
        client_reference_id: 'user-9',
        customer: 'cus_9',
        subscription: null,
        metadata: {},
      })
    );

    expect(linkStripeCustomerMock).toHaveBeenCalledWith(expect.anything(), 'user-9', 'cus_9');
    expect(unlocks).toHaveLength(0);
  });
});

describe('stripe-webhook: a refund takes back a course unlock', () => {
  beforeEach(async () => {
    await deliver(event('checkout.session.completed', courseSession(), 'evt_buy'));
    writes = [];
  });

  it('revokes the unlock when the charge is refunded in full', async () => {
    const res = await deliver(
      event(
        'charge.refunded',
        {
          id: 'ch_1',
          payment_intent: 'pi_cu_1',
          refunded: true,
          amount_refunded: 4900,
          currency: 'aud',
        },
        'evt_refund'
      )
    );

    expect(res.statusCode).toBe(200);
    expect(unlocks[0].revoked_at).not.toBeNull();
    expect(handleChargeRefundedMock).toHaveBeenCalled();
  });

  it('leaves the unlock in place for a partial refund', async () => {
    await deliver(
      event(
        'charge.refunded',
        { id: 'ch_1', payment_intent: 'pi_cu_1', refunded: false, amount_refunded: 1000 },
        'evt_partial'
      )
    );

    expect(unlocks[0].revoked_at).toBeNull();
    // The existing incident handler still runs, as before.
    expect(handleChargeRefundedMock).toHaveBeenCalled();
  });

  it('does not touch an unlock whose payment intent is different', async () => {
    await deliver(
      event(
        'charge.refunded',
        { id: 'ch_other', payment_intent: 'pi_other', refunded: true, amount_refunded: 4900 },
        'evt_other'
      )
    );

    expect(unlocks[0].revoked_at).toBeNull();
  });

  it('does not revoke an unlock that was already revoked, and keeps the first revoke time', async () => {
    const first = '2026-01-01T00:00:00.000Z';
    unlocks[0].revoked_at = first;
    await deliver(
      event(
        'charge.refunded',
        { id: 'ch_1', payment_intent: 'pi_cu_1', refunded: true, amount_refunded: 4900 },
        'evt_again'
      )
    );
    expect(unlocks[0].revoked_at).toBe(first);
  });
});
