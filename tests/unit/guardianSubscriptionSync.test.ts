import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeFakeDb, type FakeDb, type Row, type Write } from './support/fakeBillingDb';

/**
 * A guardian purchase (schema §31) as the server writes it: the parent pays, the plan is
 * the child's. Three paths carry it, and each is pinned here:
 *
 *   - the webhook's subscription events (applySubscriptionUpsert);
 *   - sync-checkout, the fast path from the browser's return;
 *   - the webhook's deletion, which must lower the CHILD's plan, not the parent's.
 *
 * Each also has its non-guardian twin, which must write exactly what it wrote before.
 * Stripe is a stub; Supabase is the in-memory double in ./support/fakeBillingDb.
 */

const PARENT = 'parent-1';
const STUDENT = '11111111-1111-4111-8111-111111111111';

/** The Stripe calls these handlers make. Each test sets what they return. */
interface StripeDouble {
  checkout: { sessions: { retrieve: ReturnType<typeof vi.fn> } };
  subscriptions: { retrieve: ReturnType<typeof vi.fn> };
}

const hooks = vi.hoisted(() => ({
  auth: { ok: true, userId: 'parent-1' } as { ok: boolean; userId?: string },
  client: null as unknown,
  stripe: null as StripeDouble | null,
}));

vi.mock('../../api/_lib/auth', () => ({
  verifyRequestAuth: async () => hooks.auth,
}));

vi.mock('../../api/_lib/stripe', () => ({
  getStripe: () => hooks.stripe,
  getSupabaseAdmin: () => hooks.client,
  isStripeConfigured: () => true,
  isStripeMisconfigured: () => false,
  isDeployedRuntime: () => false,
  isProductionRuntime: () => false,
  STRIPE_MISCONFIGURED_ERROR: 'billing misconfigured',
  resolveReturnBase: () => 'http://localhost:3000/',
  priceToPlan: (id: string) => (id === 'price_school' ? 'school' : id ? 'plus' : 'free'),
  configuredPrices: () => ({ price_school: 'school', price_plus_monthly: 'plus' }),
}));

import webhookHandler from '../../api/stripe-webhook';
import syncHandler from '../../api/sync-checkout';

const PERIOD_START = 1_700_000_000;
const PERIOD_END = 1_702_600_000;

/** A subscription object as Stripe sends it, on a Plus price. */
const subscription = (overrides: Row = {}): Row => ({
  id: 'sub_guardian_1',
  customer: 'cus_parent',
  status: 'active',
  cancel_at_period_end: false,
  metadata: {},
  items: {
    data: [
      {
        price: { id: 'price_plus_monthly' },
        quantity: 1,
        current_period_start: PERIOD_START,
        current_period_end: PERIOD_END,
      },
    ],
  },
  ...overrides,
});

const guardianMetadata = { supabase_user_id: PARENT, beneficiary_user_id: STUDENT };

const updated = (object: Row) => ({
  method: 'POST',
  headers: {},
  body: {
    id: `evt_${String(object.id)}_${Math.random()}`,
    created: 1_700_000_500,
    type: 'customer.subscription.updated',
    data: { object },
  },
});

const deleted = (object: Row) => ({
  method: 'POST',
  headers: {},
  body: {
    id: `evt_del_${String(object.id)}_${Math.random()}`,
    created: 1_700_000_600,
    type: 'customer.subscription.deleted',
    data: { object },
  },
});

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

/** The writes a table received, in order. */
const writesTo = (table: string): Write[] => db.writes.filter((w) => w.table === table);

let db: FakeDb;

beforeEach(() => {
  db = makeFakeDb({
    profiles: [
      {
        id: PARENT,
        role: 'parent',
        stripe_customer_id: 'cus_parent',
        school_id: null,
        stripe_plan: 'free',
      },
      {
        id: STUDENT,
        role: 'student',
        stripe_customer_id: null,
        school_id: null,
        stripe_plan: 'free',
      },
      {
        id: 'self-1',
        role: 'student',
        stripe_customer_id: 'cus_self',
        school_id: null,
        stripe_plan: 'free',
      },
    ],
    subscriptions: [],
    schools: [],
    stripe_events: [],
  });
  hooks.client = db;
  hooks.auth = { ok: true, userId: PARENT };
  hooks.stripe = {
    checkout: {
      sessions: { retrieve: vi.fn() },
    },
    subscriptions: { retrieve: vi.fn() },
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a guardian subscription lands on the child (webhook sync)', () => {
  it('writes the row to the student, names the parent as payer, and sets the plan on the student', async () => {
    const res = makeRes();
    await webhookHandler(updated(subscription({ metadata: guardianMetadata })), res);

    expect(res.statusCode).toBe(200);

    const row = writesTo('subscriptions').find((w) => w.op === 'upsert');
    expect(row?.values).toMatchObject({
      id: 'sub_guardian_1',
      user_id: STUDENT,
      payer_id: PARENT,
      stripe_customer_id: 'cus_parent',
      plan: 'plus',
    });

    // The plan is written where entitlements read it: the student's profile.
    const planWrites = writesTo('profiles').filter(
      (w) => w.op === 'update' && 'stripe_plan' in w.values
    );
    expect(planWrites.map((w) => [w.eqs, w.values.stripe_plan])).toEqual([
      [[['id', STUDENT]], 'plus'],
    ]);
    // The parent's own plan is not touched by the purchase.
    expect(planWrites.some((w) => w.eqs.some(([, v]) => v === PARENT))).toBe(false);
  });

  it('never runs school logic for a guardian subscription, even if its price were a licence', async () => {
    db.tables.schools.push({ id: 'school-1', stripe_subscription_id: null });
    db.tables.profiles[0].school_id = 'school-1';

    const res = makeRes();
    await webhookHandler(
      updated(
        subscription({
          metadata: guardianMetadata,
          items: {
            data: [
              {
                price: { id: 'price_school' },
                quantity: 30,
                current_period_start: PERIOD_START,
                current_period_end: PERIOD_END,
              },
            ],
          },
        })
      ),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(writesTo('schools')).toHaveLength(0);
  });

  it('writes a self-paid subscription exactly as before: no payer, the customer’s own profile', async () => {
    const res = makeRes();
    await webhookHandler(
      updated(subscription({ id: 'sub_self', customer: 'cus_self', metadata: {} })),
      res
    );

    expect(res.statusCode).toBe(200);
    const row = writesTo('subscriptions').find((w) => w.op === 'upsert');
    expect(row?.values.user_id).toBe('self-1');
    expect(row?.values).not.toHaveProperty('payer_id');

    const planWrite = writesTo('profiles').find(
      (w) => w.op === 'update' && 'stripe_plan' in w.values
    );
    expect(planWrite?.eqs).toEqual([['id', 'self-1']]);
  });
});

describe('sync-checkout confirms a guardian purchase for the parent, and the plan lands on the child', () => {
  const paidSession = (overrides: Row = {}): Row => ({
    id: 'cs_guardian_1',
    client_reference_id: PARENT,
    mode: 'subscription',
    status: 'complete',
    payment_status: 'paid',
    customer: 'cus_parent',
    subscription: subscription({ metadata: guardianMetadata }),
    ...overrides,
  });

  it('applies the subscription to the student and answers active', async () => {
    hooks.stripe.checkout.sessions.retrieve = vi.fn().mockResolvedValue(paidSession());
    const res = makeRes();
    await syncHandler({ method: 'POST', headers: {}, body: { sessionId: 'cs_guardian_1' } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'active', plan: 'plus' });

    const row = writesTo('subscriptions').find((w) => w.op === 'upsert');
    expect(row?.values).toMatchObject({ user_id: STUDENT, payer_id: PARENT });
    const planWrite = writesTo('profiles').find(
      (w) => w.op === 'update' && 'stripe_plan' in w.values
    );
    expect(planWrite?.eqs).toEqual([['id', STUDENT]]);
  });

  it('still refuses a session that is not the caller’s, whatever the metadata says', async () => {
    // The caller is the parent. A session created for someone else, even one naming this
    // parent in its metadata, is not theirs to confirm.
    hooks.stripe.checkout.sessions.retrieve = vi
      .fn()
      .mockResolvedValue(paidSession({ client_reference_id: 'someone-else' }));
    const res = makeRes();
    await syncHandler({ method: 'POST', headers: {}, body: { sessionId: 'cs_guardian_1' } }, res);

    expect(res.statusCode).toBe(403);
    expect(writesTo('subscriptions')).toHaveLength(0);
  });

  it('confirms a self-paid session exactly as before, with no payer', async () => {
    hooks.auth = { ok: true, userId: 'self-1' };
    hooks.stripe.checkout.sessions.retrieve = vi.fn().mockResolvedValue(
      paidSession({
        client_reference_id: 'self-1',
        customer: 'cus_self',
        subscription: subscription({ id: 'sub_self', customer: 'cus_self', metadata: {} }),
      })
    );
    const res = makeRes();
    await syncHandler({ method: 'POST', headers: {}, body: { sessionId: 'cs_guardian_1' } }, res);

    expect(res.statusCode).toBe(200);
    const row = writesTo('subscriptions').find((w) => w.op === 'upsert');
    expect(row?.values.user_id).toBe('self-1');
    expect(row?.values).not.toHaveProperty('payer_id');
  });
});

describe('cancelling a guardian subscription lowers the child’s plan, not the parent’s', () => {
  it('resolves the downgrade from the row’s holder when the row names a payer', async () => {
    db.tables.subscriptions.push({
      id: 'sub_guardian_1',
      user_id: STUDENT,
      payer_id: PARENT,
      status: 'active',
      last_event_at: null,
    });
    db.tables.profiles[1].stripe_plan = 'plus';

    const res = makeRes();
    await webhookHandler(
      deleted(subscription({ metadata: guardianMetadata, status: 'canceled' })),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(db.rpcCalls).toEqual([{ name: 'resolve_stripe_plan', args: { p_user_id: STUDENT } }]);

    const downgrade = writesTo('profiles').find(
      (w) => w.op === 'update' && 'stripe_plan' in w.values
    );
    expect(downgrade?.eqs).toEqual([['id', STUDENT]]);
    expect(downgrade?.values.stripe_plan).toBe('free');

    // The parent's profile is not written, and the parent keeps any plan of their own.
    expect(writesTo('profiles').some((w) => w.eqs.some(([, v]) => v === PARENT))).toBe(false);
  });

  it('falls back to the event’s metadata when the row was never written', async () => {
    // No subscriptions row: the deletion is the first event this deployment sees for it.
    db.tables.profiles[1].stripe_plan = 'plus';

    const res = makeRes();
    await webhookHandler(
      deleted(subscription({ metadata: guardianMetadata, status: 'canceled' })),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(db.rpcCalls).toEqual([{ name: 'resolve_stripe_plan', args: { p_user_id: STUDENT } }]);
    expect(writesTo('profiles').some((w) => w.eqs.some(([, v]) => v === PARENT))).toBe(false);
  });

  it('downgrades a self-paid subscription through its customer, as before', async () => {
    db.tables.subscriptions.push({
      id: 'sub_self',
      user_id: 'self-1',
      status: 'active',
      last_event_at: null,
    });

    const res = makeRes();
    await webhookHandler(
      deleted(
        subscription({ id: 'sub_self', customer: 'cus_self', metadata: {}, status: 'canceled' })
      ),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(db.rpcCalls).toEqual([{ name: 'resolve_stripe_plan', args: { p_user_id: 'self-1' } }]);
    const downgrade = writesTo('profiles').find(
      (w) => w.op === 'update' && 'stripe_plan' in w.values
    );
    expect(downgrade?.eqs).toEqual([['id', 'self-1']]);
  });
});

describe('an event for an account that has been deleted (schema §16)', () => {
  /** Deleting the auth user cascades the profile away; this is what the webhook then sees. */
  const deleteProfile = (id: string) => {
    db.tables.profiles = db.tables.profiles.filter((p) => p.id !== id);
  };

  it('ignores the event when the child who held the plan is gone, rather than answering 500', async () => {
    deleteProfile(STUDENT);
    const res = makeRes();
    await webhookHandler(updated(subscription({ metadata: guardianMetadata })), res);

    expect(res.statusCode).toBe(200);
    // A row for the deleted child would fail the foreign key on profiles.
    expect(writesTo('subscriptions')).toEqual([]);
    expect(writesTo('profiles').filter((w) => 'stripe_plan' in w.values)).toEqual([]);
  });

  it('keeps the child’s row in step when the parent who paid is gone, naming no payer', async () => {
    deleteProfile(PARENT);
    const res = makeRes();
    await webhookHandler(
      updated(subscription({ metadata: guardianMetadata, cancel_at_period_end: true })),
      res
    );

    expect(res.statusCode).toBe(200);
    const row = writesTo('subscriptions').find((w) => w.op === 'upsert');
    expect(row?.values).toMatchObject({
      id: 'sub_guardian_1',
      user_id: STUDENT,
      cancel_at_period_end: true,
    });
    // Naming the deleted parent would fail the foreign key on profiles.
    expect(row?.values).not.toHaveProperty('payer_id');
  });

  it('ignores the event when a self-paying holder is gone', async () => {
    deleteProfile('self-1');
    const res = makeRes();
    await webhookHandler(
      updated(subscription({ customer: 'cus_self', metadata: { supabase_user_id: 'self-1' } })),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(writesTo('subscriptions')).toEqual([]);
  });

  it('answers 500, so Stripe retries, when it cannot tell whether the child still exists', async () => {
    db.readErrors.set('profiles', { message: 'connection reset' });
    const res = makeRes();
    await webhookHandler(updated(subscription({ metadata: guardianMetadata })), res);

    expect(res.statusCode).toBe(500);
    expect(writesTo('subscriptions')).toEqual([]);
  });
});
