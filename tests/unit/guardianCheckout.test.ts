import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeFakeDb, type FakeDb, type Row } from './support/fakeBillingDb';

/**
 * POST /api/create-checkout for a parent or guardian buying Plus for a linked child
 * (schema §31), and the purchase that is still an ordinary student's own.
 *
 * What is pinned here: who may buy for whom (each refusal with its code), where the
 * purchase is recorded and what Stripe is told (the parent is the customer, the child is
 * named in the metadata), the rule that a parent's own plan does not block a purchase for
 * a child, and the rule that one open purchase is kept per child.
 *
 * Stripe is a stub. Supabase is the in-memory double in ./support/fakeBillingDb.
 */

const PARENT = 'parent-1';
const STUDENT = '11111111-1111-4111-8111-111111111111';
const SECOND_CHILD = '22222222-2222-4222-8222-222222222222';
const LONE_STUDENT = '33333333-3333-4333-8333-333333333333';

const hooks = vi.hoisted(() => ({
  auth: { ok: true, userId: 'parent-1' } as {
    ok: boolean;
    status?: number;
    error?: string;
    userId?: string;
  },
  client: null as unknown,
  stripe: null as unknown,
}));

vi.mock('../../api/_lib/auth', () => ({
  verifyRequestAuth: async () => hooks.auth,
  extractBearerToken: () => 'token',
}));

vi.mock('../../api/_lib/stripe', () => ({
  getStripe: () => hooks.stripe,
  isStripeConfigured: () => true,
  isStripeMisconfigured: () => false,
  STRIPE_MISCONFIGURED_ERROR: 'billing misconfigured',
  getSupabaseAdmin: () => hooks.client,
  priceToPlan: (id: string) => (id === 'price_school' ? 'school' : 'plus'),
  resolveReturnBase: () => 'http://localhost:3000/',
  isProductionRuntime: () => false,
  configuredPrices: () => ({
    price_school: 'school',
    price_plus_monthly: 'plus',
    price_plus_yearly: 'plus',
  }),
}));

import checkoutHandler from '../../api/create-checkout';

const sessionCreate = vi.fn();
const sessionExpire = vi.fn();
const sessionRetrieve = vi.fn();

let db: FakeDb;

const makeRes = () => ({
  statusCode: 0,
  body: undefined as { url?: string; error?: string; code?: string } | undefined,
  status(code: number) {
    this.statusCode = code;
    return this;
  },
  json(data: unknown) {
    this.body = data as { url?: string; error?: string; code?: string };
  },
  setHeader() {},
});

const post = (body: Record<string, unknown> = {}) => ({
  method: 'POST',
  headers: { authorization: 'Bearer t' },
  body: { priceId: 'price_plus_monthly', beneficiaryUserId: STUDENT, ...body },
});

const session = (id: string) => ({ id, url: `https://stripe.test/${id}` });

/** A linked child, a parent who is their customer, and a student with no plan. */
const seedBase = (): Record<string, Row[]> => ({
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
      id: SECOND_CHILD,
      role: 'student',
      stripe_customer_id: null,
      school_id: null,
      stripe_plan: 'free',
    },
    {
      id: LONE_STUDENT,
      role: 'student',
      stripe_customer_id: null,
      school_id: null,
      stripe_plan: 'free',
    },
  ],
  guardian_links: [
    { guardian_id: PARENT, student_id: STUDENT },
    { guardian_id: PARENT, student_id: SECOND_CHILD },
  ],
  subscriptions: [],
  checkout_sessions: [],
});

/** The idempotency key and metadata of the Nth create call. */
const createCall = (n = 0) =>
  sessionCreate.mock.calls[n] as [
    {
      customer?: string;
      customer_email?: string;
      client_reference_id?: string;
      metadata?: Record<string, string>;
      subscription_data: { metadata: Record<string, string> };
      line_items: Array<{ price: string; quantity: number }>;
    },
    { idempotencyKey: string },
  ];

beforeEach(() => {
  db = makeFakeDb(seedBase());
  hooks.client = db;
  hooks.auth = { ok: true, userId: PARENT };
  hooks.stripe = {
    checkout: {
      sessions: {
        create: (...args: unknown[]) => sessionCreate(...args),
        expire: (...args: unknown[]) => sessionExpire(...args),
        retrieve: (...args: unknown[]) => sessionRetrieve(...args),
      },
    },
    subscriptions: { retrieve: vi.fn() },
  };
  sessionCreate.mockReset();
  sessionExpire.mockReset();
  sessionExpire.mockResolvedValue({});
  sessionRetrieve.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('create-checkout: a parent buys Plus for a linked child', () => {
  it('starts a session for the parent as the customer, naming the child in the metadata', async () => {
    sessionCreate.mockResolvedValueOnce(session('cs_child'));
    const res = makeRes();
    await checkoutHandler(post(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body?.url).toBe('https://stripe.test/cs_child');

    const [params] = createCall();
    // The parent is the customer, and the one the client reference names: their card pays.
    expect(params.customer).toBe('cus_parent');
    expect(params.client_reference_id).toBe(PARENT);
    expect(params.line_items).toEqual([{ price: 'price_plus_monthly', quantity: 1 }]);
    // The plan is the child's: both the session and the subscription name the pair.
    const pair = { supabase_user_id: PARENT, beneficiary_user_id: STUDENT };
    expect(params.metadata).toEqual(pair);
    expect(params.subscription_data.metadata).toEqual(pair);
  });

  it('keys the idempotency key to the child, so two children never share a session', async () => {
    sessionCreate.mockResolvedValueOnce(session('cs_a')).mockResolvedValueOnce(session('cs_b'));
    await checkoutHandler(post(), makeRes());
    await checkoutHandler(post({ beneficiaryUserId: SECOND_CHILD }), makeRes());

    const [, first] = createCall(0);
    const [, second] = createCall(1);
    expect(first.idempotencyKey).toContain(`beneficiary=${STUDENT}`);
    expect(second.idempotencyKey).toContain(`beneficiary=${SECOND_CHILD}`);
    expect(first.idempotencyKey).not.toBe(second.idempotencyKey);
  });

  it('is not blocked by the parent’s own subscription: a parent may pay for several children', async () => {
    db.tables.subscriptions.push({
      id: 'sub_parent_own',
      user_id: PARENT,
      status: 'active',
      last_event_at: null,
      updated_at: new Date().toISOString(),
    });
    sessionCreate.mockResolvedValueOnce(session('cs_child'));
    const res = makeRes();
    await checkoutHandler(post(), res);

    expect(res.statusCode).toBe(200);
  });

  it('records the open purchase against the child, so a second child is not displaced by the first', async () => {
    // The first child's purchase completed, so its session can no longer be expired. The
    // second child's purchase must still go ahead: it displaces nothing of the first's.
    sessionCreate.mockResolvedValueOnce(session('cs_a')).mockResolvedValueOnce(session('cs_b'));
    sessionExpire.mockRejectedValue(
      new Error('You can only expire a Checkout Session that is open.')
    );
    sessionRetrieve.mockResolvedValue({
      status: 'complete',
      subscription: { id: 'sub_a', status: 'active' },
    });

    await checkoutHandler(post(), makeRes());
    const res = makeRes();
    await checkoutHandler(post({ beneficiaryUserId: SECOND_CHILD }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body?.url).toBe('https://stripe.test/cs_b');
    expect(sessionExpire).not.toHaveBeenCalledWith('cs_a');
    // One open purchase per child: each child has its own record.
    expect(db.tables.checkout_sessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ user_id: STUDENT, session_id: 'cs_a' }),
        expect.objectContaining({ user_id: SECOND_CHILD, session_id: 'cs_b' }),
      ])
    );
  });

  it('refuses a displaced session that a child’s plan already holds, with beneficiary_has_plan', async () => {
    // A second purchase for the SAME child, while the first has been paid but the webhook
    // has not yet written the subscription. Stripe can see it; the guard cannot.
    sessionCreate.mockResolvedValueOnce(session('cs_1')).mockResolvedValueOnce(session('cs_2'));
    await checkoutHandler(post(), makeRes());

    sessionExpire.mockImplementation(async (id: string) => {
      if (id === 'cs_1') throw new Error('You can only expire a Checkout Session that is open.');
      return {};
    });
    sessionRetrieve.mockResolvedValue({
      status: 'complete',
      subscription: { id: 'sub_paid', status: 'active' },
    });

    const res = makeRes();
    await checkoutHandler(post(), res);

    expect(res.statusCode).toBe(409);
    expect(res.body?.code).toBe('beneficiary_has_plan');
    expect(res.body?.url).toBeUndefined();
    expect(sessionExpire).toHaveBeenCalledWith('cs_2');
  });
});

describe('create-checkout: refusals for a guardian purchase', () => {
  it('refuses a parent who names no child, with guardian_needs_beneficiary', async () => {
    const res = makeRes();
    await checkoutHandler(post({ beneficiaryUserId: undefined }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body?.code).toBe('guardian_needs_beneficiary');
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('refuses a student who names a child, with not_a_guardian', async () => {
    hooks.auth = { ok: true, userId: LONE_STUDENT };
    const res = makeRes();
    await checkoutHandler(post(), res);

    expect(res.statusCode).toBe(403);
    expect(res.body?.code).toBe('not_a_guardian');
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('refuses a parent for a student they are not linked to, with not_a_guardian', async () => {
    const res = makeRes();
    await checkoutHandler(post({ beneficiaryUserId: LONE_STUDENT }), res);

    expect(res.statusCode).toBe(403);
    expect(res.body?.code).toBe('not_a_guardian');
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('refuses a School licence for a child, with guardian_plus_only', async () => {
    const res = makeRes();
    await checkoutHandler(post({ priceId: 'price_school', seats: 10 }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body?.code).toBe('guardian_plus_only');
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('refuses a child who already holds a plan on their profile, with beneficiary_has_plan', async () => {
    db.tables.profiles.find((p) => p.id === STUDENT)!.stripe_plan = 'plus';
    const res = makeRes();
    await checkoutHandler(post(), res);

    expect(res.statusCode).toBe(409);
    expect(res.body?.code).toBe('beneficiary_has_plan');
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('refuses a child with a live subscription, with beneficiary_has_plan', async () => {
    db.tables.subscriptions.push({
      id: 'sub_child',
      user_id: STUDENT,
      status: 'past_due',
      last_event_at: null,
      updated_at: new Date().toISOString(),
    });
    const res = makeRes();
    await checkoutHandler(post(), res);

    expect(res.statusCode).toBe(409);
    expect(res.body?.code).toBe('beneficiary_has_plan');
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('answers 400 for a malformed beneficiaryUserId, creating nothing', async () => {
    const res = makeRes();
    await checkoutHandler(post({ beneficiaryUserId: 'not-a-uuid' }), res);

    expect(res.statusCode).toBe(400);
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('answers 503 when the link cannot be read, and creates nothing', async () => {
    db.readErrors.set('guardian_links', { message: 'connection lost' });
    const res = makeRes();
    await checkoutHandler(post(), res);

    expect(res.statusCode).toBe(503);
    expect(res.body?.code).toBe('account_lookup_failed');
    expect(res.body?.error).not.toContain('connection lost');
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('refuses a child purchase with no database to show the link (fails closed)', async () => {
    hooks.client = null;
    const res = makeRes();
    await checkoutHandler(post(), res);

    expect(res.statusCode).toBe(403);
    expect(res.body?.code).toBe('not_a_guardian');
    expect(sessionCreate).not.toHaveBeenCalled();
  });
});

describe('create-checkout: a student buying for themselves is unchanged', () => {
  it('sends no session metadata and names only the buyer on the subscription', async () => {
    hooks.auth = { ok: true, userId: LONE_STUDENT };
    db.users[LONE_STUDENT] = { email: 'student@example.test' };
    sessionCreate.mockResolvedValueOnce(session('cs_self'));
    const res = makeRes();
    await checkoutHandler(
      {
        method: 'POST',
        headers: { authorization: 'Bearer t' },
        body: { priceId: 'price_plus_monthly' },
      },
      res
    );

    expect(res.statusCode).toBe(200);
    const [params, options] = createCall();
    expect(params).not.toHaveProperty('metadata');
    expect(params.subscription_data.metadata).toEqual({ supabase_user_id: LONE_STUDENT });
    expect(options.idempotencyKey).not.toContain('beneficiary');
    expect(params.customer_email).toBe('student@example.test');
  });
});
