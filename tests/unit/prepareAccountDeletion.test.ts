import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeFakeDb, type FakeDb, type Row, type Write } from './support/fakeBillingDb';

/**
 * POST /api/prepare-account-deletion: before an account is deleted, every subscription
 * its owner holds or pays for is ended in Stripe (schema §16, §31).
 *
 * What is pinned here: a parent's deletion ends the plan they pay for and drops the child
 * to free at once; a child's deletion ends the plan their parent pays for; a purchase the
 * webhook has not written yet is found through Stripe's list; a plan already set to end
 * is ended too; a school licence that would renew refuses the whole request before
 * anything is cancelled, and one set to end is left to run out; a failure stops the
 * request with nothing more cancelled.
 *
 * Stripe is a stub. Supabase is the in-memory double in ./support/fakeBillingDb.
 */

const PARENT = 'parent-1';
const STUDENT = '11111111-1111-4111-8111-111111111111';
const TEACHER = 'teacher-1';

interface StripeDouble {
  subscriptions: {
    list: ReturnType<typeof vi.fn>;
    retrieve: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  };
}

const hooks = vi.hoisted(() => ({
  auth: { ok: true, userId: 'parent-1' } as { ok: boolean; userId?: string },
  client: null as unknown,
  stripe: null as StripeDouble | null,
  stripeConfigured: true,
}));

vi.mock('../../api/_lib/auth', () => ({
  verifyRequestAuth: async () => hooks.auth,
}));

vi.mock('../../api/_lib/stripe', () => ({
  getStripe: () => hooks.stripe,
  getSupabaseAdmin: () => hooks.client,
  isStripeConfigured: () => hooks.stripeConfigured,
  isStripeMisconfigured: () => false,
  STRIPE_MISCONFIGURED_ERROR: 'billing misconfigured',
  priceToPlan: (id: string) => (id === 'price_school' ? 'school' : id ? 'plus' : 'free'),
}));

import handler from '../../api/prepare-account-deletion';

const PERIOD_START = 1_700_000_000;
const PERIOD_END = 1_702_600_000;
const CANCELLED_AT = 1_700_100_000;

/** A subscription object as Stripe returns it. */
const stripeSub = (overrides: Row = {}): Row => ({
  id: 'sub_guardian_1',
  customer: 'cus_parent',
  status: 'active',
  cancel_at_period_end: false,
  metadata: { supabase_user_id: PARENT, beneficiary_user_id: STUDENT },
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

/** Stripe's own record of each subscription, by id, as the stub serves it. */
let inStripe: Record<string, Row>;

const makeRes = () => ({
  statusCode: 0,
  body: undefined as { cancelled?: number; error?: string; code?: string } | undefined,
  status(code: number) {
    this.statusCode = code;
    return this;
  },
  json(data: unknown) {
    this.body = data as { cancelled?: number; error?: string; code?: string };
  },
  setHeader() {},
});

const post = () => ({ method: 'POST', headers: { authorization: 'Bearer t' }, body: {} });

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
        stripe_plan: 'plus',
      },
      {
        id: TEACHER,
        role: 'teacher',
        stripe_customer_id: 'cus_teacher',
        school_id: 'school-1',
        stripe_plan: 'school',
      },
    ],
    subscriptions: [
      {
        id: 'sub_guardian_1',
        user_id: STUDENT,
        payer_id: PARENT,
        stripe_customer_id: 'cus_parent',
        status: 'active',
        plan: 'plus',
        cancel_at_period_end: false,
      },
    ],
    schools: [],
    billing_incidents: [],
  });
  inStripe = { sub_guardian_1: stripeSub() };

  hooks.client = db;
  hooks.auth = { ok: true, userId: PARENT };
  hooks.stripeConfigured = true;
  hooks.stripe = {
    subscriptions: {
      // Stripe's default list leaves out cancelled subscriptions.
      list: vi.fn(async ({ customer }: { customer: string }) => ({
        data: Object.values(inStripe).filter(
          (s) => s.customer === customer && s.status !== 'canceled'
        ),
      })),
      retrieve: vi.fn(async (id: string) => {
        const sub = inStripe[id];
        if (!sub)
          throw Object.assign(new Error('No such subscription'), { code: 'resource_missing' });
        return sub;
      }),
      cancel: vi.fn(async (id: string) => {
        inStripe[id] = {
          ...inStripe[id],
          status: 'canceled',
          cancel_at_period_end: false,
          canceled_at: CANCELLED_AT,
        };
        return inStripe[id];
      }),
    },
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a parent deletes their account', () => {
  it('cancels the plan they pay for and drops the child to free straight away', async () => {
    const res = makeRes();
    await handler(post(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body?.cancelled).toBe(1);
    expect(hooks.stripe!.subscriptions.cancel).toHaveBeenCalledWith('sub_guardian_1');

    // The row reads as cancelled before delete_my_account() checks it, still naming
    // the child and the payer, and stamped with Stripe's time.
    expect(db.tables.subscriptions[0]).toMatchObject({
      id: 'sub_guardian_1',
      user_id: STUDENT,
      payer_id: PARENT,
      status: 'canceled',
      last_event_at: new Date(CANCELLED_AT * 1000).toISOString(),
    });
    expect(db.tables.profiles.find((p) => p.id === STUDENT)?.stripe_plan).toBe('free');
  });
});

describe('a child deletes their account', () => {
  it('cancels the plan their parent pays for', async () => {
    hooks.auth = { ok: true, userId: STUDENT };
    const res = makeRes();
    await handler(post(), res);

    expect(res.statusCode).toBe(200);
    expect(hooks.stripe!.subscriptions.cancel).toHaveBeenCalledWith('sub_guardian_1');
    expect(db.tables.subscriptions[0].status).toBe('canceled');
    // The child has no customer of their own, so there is no list to read.
    expect(hooks.stripe!.subscriptions.list).not.toHaveBeenCalled();
  });
});

describe('what is found and ended', () => {
  it('finds a purchase on the caller’s own customer that the webhook has not written yet', async () => {
    inStripe.sub_unwritten = stripeSub({
      id: 'sub_unwritten',
      metadata: { supabase_user_id: PARENT },
    });

    const res = makeRes();
    await handler(post(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body?.cancelled).toBe(2);
    expect(hooks.stripe!.subscriptions.cancel.mock.calls.map(([id]) => id).sort()).toEqual([
      'sub_guardian_1',
      'sub_unwritten',
    ]);
  });

  it('ends a plan already set to end, because nobody is left to serve once the account goes', async () => {
    inStripe.sub_guardian_1 = stripeSub({ cancel_at_period_end: true });
    const res = makeRes();
    await handler(post(), res);

    expect(res.statusCode).toBe(200);
    expect(hooks.stripe!.subscriptions.cancel).toHaveBeenCalledWith('sub_guardian_1');
  });

  it('leaves alone a subscription Stripe has already ended, or has never heard of', async () => {
    inStripe.sub_guardian_1 = stripeSub({ status: 'canceled' });
    db.tables.subscriptions.push({
      id: 'sub_from_elsewhere',
      user_id: PARENT,
      status: 'active',
      plan: 'plus',
    });

    const res = makeRes();
    await handler(post(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body?.cancelled).toBe(0);
    expect(hooks.stripe!.subscriptions.cancel).not.toHaveBeenCalled();
  });

  it('cancels nothing when Stripe is not configured, because nothing is billed', async () => {
    hooks.stripeConfigured = false;
    const res = makeRes();
    await handler(post(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body?.cancelled).toBe(0);
    expect(hooks.stripe!.subscriptions.cancel).not.toHaveBeenCalled();
  });
});

describe('a school licence the caller bought', () => {
  beforeEach(() => {
    hooks.auth = { ok: true, userId: TEACHER };
    db.tables.subscriptions.push({
      id: 'sub_school',
      user_id: TEACHER,
      stripe_customer_id: 'cus_teacher',
      status: 'active',
      plan: 'school',
      cancel_at_period_end: false,
    });
    inStripe.sub_school = stripeSub({
      id: 'sub_school',
      customer: 'cus_teacher',
      metadata: { supabase_user_id: TEACHER },
      items: { data: [{ price: { id: 'price_school' }, quantity: 30 }] },
    });
    // The teacher also pays for Plus of their own.
    inStripe.sub_teacher_plus = stripeSub({
      id: 'sub_teacher_plus',
      customer: 'cus_teacher',
      metadata: { supabase_user_id: TEACHER },
    });
  });

  it('refuses while it would renew, and cancels nothing at all', async () => {
    const res = makeRes();
    await handler(post(), res);

    expect(res.statusCode).toBe(409);
    expect(res.body?.code).toBe('school_licence_held');
    expect(res.body?.error).toMatch(/whole school/);
    expect(hooks.stripe!.subscriptions.cancel).not.toHaveBeenCalled();
    expect(writesTo('subscriptions')).toEqual([]);
  });

  it('leaves one already set to end to run out, and ends the rest', async () => {
    inStripe.sub_school = { ...inStripe.sub_school, cancel_at_period_end: true };
    const res = makeRes();
    await handler(post(), res);

    expect(res.statusCode).toBe(200);
    expect(hooks.stripe!.subscriptions.cancel.mock.calls.map(([id]) => id)).toEqual([
      'sub_teacher_plus',
    ]);
  });
});

describe('failures', () => {
  it('stops with nothing more cancelled when Stripe refuses a cancellation', async () => {
    inStripe.sub_second = stripeSub({ id: 'sub_second', metadata: { supabase_user_id: PARENT } });
    hooks.stripe!.subscriptions.cancel.mockRejectedValueOnce(new Error('card_error'));

    const res = makeRes();
    await handler(post(), res);

    expect(res.statusCode).toBe(502);
    expect(res.body?.error).toMatch(/has not been deleted/);
    expect(hooks.stripe!.subscriptions.cancel).toHaveBeenCalledTimes(1);
    expect(db.tables.subscriptions[0].status).toBe('active');
  });

  it('cancels nothing when it cannot read what the caller holds', async () => {
    db.readErrors.set('subscriptions', { message: 'connection reset' });
    const res = makeRes();
    await handler(post(), res);

    expect(res.statusCode).toBe(503);
    expect(hooks.stripe!.subscriptions.cancel).not.toHaveBeenCalled();
  });

  it('cancels nothing when Stripe cannot be read', async () => {
    hooks.stripe!.subscriptions.list.mockRejectedValueOnce(new Error('timeout'));
    const res = makeRes();
    await handler(post(), res);

    expect(res.statusCode).toBe(503);
    expect(hooks.stripe!.subscriptions.cancel).not.toHaveBeenCalled();
  });

  it('refuses a request it cannot tie to a user', async () => {
    hooks.auth = { ok: true };
    const res = makeRes();
    await handler(post(), res);

    expect(res.statusCode).toBe(401);
    expect(hooks.stripe!.subscriptions.cancel).not.toHaveBeenCalled();
  });
});
