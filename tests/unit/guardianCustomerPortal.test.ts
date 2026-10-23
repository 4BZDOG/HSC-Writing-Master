import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeFakeDb, type FakeDb, type Row } from './support/fakeBillingDb';

/**
 * POST /api/customer-portal, personal scope, for a student whose plan a parent pays for
 * (schema §31).
 *
 * The parent is the Stripe customer, so a student who opens "Manage" must not reach a
 * billing account at all. They are refused with 409 `managed_by_guardian`, and the
 * message says whose plan it is. Everything else keeps its answer: a student's own plan,
 * a cancelled guardian plan, a parent opening their own customer, and a database that has
 * not re-applied §31.
 *
 * Stripe is a stub; Supabase is the in-memory double in ./support/fakeBillingDb.
 */

const PARENT = 'parent-1';
const STUDENT = '11111111-1111-4111-8111-111111111111';
const PORTAL_URL = 'https://billing.stripe.test/session/abc';
const MANAGED = 'Your parent or guardian manages this subscription.';

const hooks = vi.hoisted(() => ({
  auth: { ok: true, userId: 'student-1' } as { ok: boolean; userId?: string },
  client: null as unknown,
  stripe: null as unknown,
}));

vi.mock('../../api/_lib/auth', () => ({
  verifyRequestAuth: async () => hooks.auth,
}));

vi.mock('../../api/_lib/stripe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/_lib/stripe')>();
  return {
    ...actual,
    isStripeConfigured: () => true,
    isStripeMisconfigured: () => false,
    getStripe: () => hooks.stripe,
    getSupabaseAdmin: () => hooks.client,
    resolveReturnBase: () => 'https://app.example.com/',
  };
});

import customerPortal from '../../api/customer-portal';

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
  end() {},
});

const post = () => ({
  method: 'POST',
  headers: { authorization: 'Bearer t', origin: 'https://app.example.com' },
  body: {},
});

/** A subscription row on a student's account, paid for by a parent. */
const guardianRow = (overrides: Row = {}): Row => ({
  id: 'sub_guardian_1',
  user_id: STUDENT,
  payer_id: PARENT,
  status: 'active',
  ...overrides,
});

let portalCreate: ReturnType<typeof vi.fn>;

beforeEach(() => {
  db = makeFakeDb({
    profiles: [
      { id: STUDENT, role: 'student', stripe_customer_id: null },
      { id: PARENT, role: 'parent', stripe_customer_id: 'cus_parent' },
      { id: 'self-1', role: 'student', stripe_customer_id: 'cus_self' },
    ],
    subscriptions: [],
  });
  hooks.client = db;
  hooks.auth = { ok: true, userId: STUDENT };
  portalCreate = vi.fn(async () => ({ url: PORTAL_URL }));
  hooks.stripe = { billingPortal: { sessions: { create: portalCreate } } };
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('customer-portal: a plan a parent pays for is not the student’s to manage', () => {
  it('refuses a student with a live subscription their parent pays for, with managed_by_guardian', async () => {
    db.tables.subscriptions.push(guardianRow({ status: 'active' }));
    const res = makeRes();
    await customerPortal(post(), res);

    expect(res.statusCode).toBe(409);
    expect(res.body?.code).toBe('managed_by_guardian');
    expect(res.body?.error).toBe(MANAGED);
    expect(res.body?.url).toBeUndefined();
    expect(portalCreate).not.toHaveBeenCalled();
  });

  it('refuses a past-due guardian subscription too: Stripe is still retrying it', async () => {
    db.tables.subscriptions.push(guardianRow({ status: 'past_due' }));
    const res = makeRes();
    await customerPortal(post(), res);

    expect(res.statusCode).toBe(409);
    expect(res.body?.code).toBe('managed_by_guardian');
  });

  it('does not refuse a guardian subscription that has ended: the student falls through to the old answer', async () => {
    db.tables.subscriptions.push(guardianRow({ status: 'canceled' }));
    const res = makeRes();
    await customerPortal(post(), res);

    expect(res.statusCode).toBe(404);
    expect(res.body?.error).toBe('No billing account found. Please subscribe first.');
    expect(portalCreate).not.toHaveBeenCalled();
  });
});

describe('customer-portal: everything else keeps its answer', () => {
  it('opens the caller’s own customer when they pay for their own plan', async () => {
    hooks.auth = { ok: true, userId: 'self-1' };
    db.tables.subscriptions.push({
      id: 'sub_self',
      user_id: 'self-1',
      payer_id: null,
      status: 'active',
    });
    const res = makeRes();
    await customerPortal(post(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body?.url).toBe(PORTAL_URL);
    expect(portalCreate).toHaveBeenCalledWith({
      customer: 'cus_self',
      return_url: 'https://app.example.com/',
    });
  });

  it('opens the parent’s own customer: the parent’s rows never name them as managed', async () => {
    // The parent holds no subscription row of their own here; the child's row names the
    // parent as payer, and must not make the PARENT look managed.
    hooks.auth = { ok: true, userId: PARENT };
    db.tables.subscriptions.push(guardianRow());
    const res = makeRes();
    await customerPortal(post(), res);

    expect(res.statusCode).toBe(200);
    expect(portalCreate).toHaveBeenCalledWith({
      customer: 'cus_parent',
      return_url: 'https://app.example.com/',
    });
  });

  it('answers 503 and opens nothing when the subscription read fails', async () => {
    db.readErrors.set('subscriptions', { message: 'connection lost' });
    const res = makeRes();
    await customerPortal(post(), res);

    expect(res.statusCode).toBe(503);
    expect(res.body?.error).not.toContain('connection lost');
    expect(portalCreate).not.toHaveBeenCalled();
  });

  it('treats a database without the payer column as having no guardian plan (§31 not re-applied)', async () => {
    db.readErrors.set('subscriptions', {
      code: '42703',
      message: 'column "payer_id" does not exist',
    });
    hooks.auth = { ok: true, userId: 'self-1' };
    const res = makeRes();
    await customerPortal(post(), res);

    expect(res.statusCode).toBe(200);
    expect(portalCreate).toHaveBeenCalled();
  });
});
