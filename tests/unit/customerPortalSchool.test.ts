import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * POST /api/customer-portal with `scope: 'school'`: a teacher or admin opens the
 * Stripe portal for the licence their school holds, not only for a licence they
 * bought themselves. These tests pin the refusals and the fallbacks, and the
 * rule that the school and the Stripe customer are never taken from the body.
 *
 * The personal path is pinned too: a request with no scope must behave as it
 * always has, so every existing caller is unaffected.
 *
 * Supabase is an in-memory double with the query shapes the endpoint uses.
 * Stripe is a stub. Nothing here reaches the network.
 */

type Row = Record<string, unknown>;
type StripeDouble = {
  billingPortal: { sessions: { create: ReturnType<typeof vi.fn> } };
  subscriptions: { retrieve: ReturnType<typeof vi.fn> };
};

const hooks = vi.hoisted(() => ({
  auth: { ok: true, userId: 'teacher-1' } as {
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
}));

vi.mock('../../api/_lib/stripe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/_lib/stripe')>();
  return {
    ...actual,
    isStripeConfigured: () => true,
    isStripeMisconfigured: () => false,
    getStripe: () => hooks.stripe,
    getSupabaseAdmin: () => hooks.client,
  };
});

import customerPortal from '../../api/customer-portal';

/** Table rows, reset before every test. */
let tables: Record<string, Row[]> = {};
/** Tables whose reads fail, to exercise the fail-closed paths. */
let failingReads = new Set<string>();

class FakeQuery {
  private filters: Array<(row: Row) => boolean> = [];

  constructor(private readonly table: string) {}

  select(_columns?: string) {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  private rows(): { data: Row[]; error: { message: string } | null } {
    if (failingReads.has(this.table)) {
      return { data: [], error: { message: `${this.table} read failed` } };
    }
    return {
      data: (tables[this.table] ?? []).filter((row) => this.filters.every((f) => f(row))),
      error: null,
    };
  }

  maybeSingle() {
    const { data, error } = this.rows();
    return Promise.resolve({ data: data[0] ?? null, error });
  }

  single() {
    const { data, error } = this.rows();
    if (error) return Promise.resolve({ data: null, error });
    return Promise.resolve({
      data: data[0] ?? null,
      error: data[0] ? null : { message: 'no rows' },
    });
  }
}

const fakeClient = () => ({
  from: (table: string) => new FakeQuery(table),
});

const makeRes = () => ({
  statusCode: 0,
  body: undefined as { url?: string; error?: string } | undefined,
  headers: {} as Record<string, string>,
  status(code: number) {
    this.statusCode = code;
    return this;
  },
  json(data: unknown) {
    this.body = data as { url?: string; error?: string };
  },
  setHeader(name: string, value: string) {
    this.headers[name] = value;
  },
  end() {},
});

const post = (body: unknown = {}) => ({
  method: 'POST',
  headers: { authorization: 'Bearer t', origin: 'https://app.example.com' },
  body,
});

const PORTAL_URL = 'https://billing.stripe.test/session/abc';
const NO_SCHOOL_LICENCE = 'Your school does not have a licence to manage yet.';
const NO_BILLING_ACCOUNT = 'We could not find the billing account for your school licence.';

let stripe: StripeDouble;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  hooks.auth = { ok: true, userId: 'teacher-1' };
  hooks.client = fakeClient();
  stripe = {
    billingPortal: {
      sessions: {
        create: vi.fn(async () => ({ url: PORTAL_URL })),
      },
    },
    subscriptions: {
      retrieve: vi.fn(async () => ({ customer: 'cus_from_stripe' })),
    },
  };
  hooks.stripe = stripe;
  failingReads = new Set();
  tables = {
    profiles: [
      { id: 'teacher-1', role: 'teacher', school_id: 'school-1', stripe_customer_id: 'cus_own' },
      {
        id: 'colleague-1',
        role: 'teacher',
        school_id: 'school-1',
        stripe_customer_id: 'cus_colleague',
      },
      { id: 'admin-1', role: 'admin', school_id: 'school-1', stripe_customer_id: null },
      { id: 'student-1', role: 'student', school_id: 'school-1', stripe_customer_id: null },
      { id: 'loner-1', role: 'teacher', school_id: null, stripe_customer_id: null },
      { id: 'teacher-3', role: 'teacher', school_id: 'school-3', stripe_customer_id: null },
    ],
    schools: [
      { id: 'school-1', stripe_subscription_id: 'sub_school', plan_status: 'active' },
      { id: 'school-2', stripe_subscription_id: 'sub_other', plan_status: 'active' },
      { id: 'school-3', stripe_subscription_id: null, plan_status: 'none' },
    ],
    subscriptions: [
      { id: 'sub_school', user_id: 'buyer-1', stripe_customer_id: 'cus_school' },
      { id: 'sub_other', user_id: 'buyer-2', stripe_customer_id: 'cus_other' },
    ],
  };
  // The log is spied on so a test can read what the server wrote, and so a
  // refusal does not print to the test output.
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const loggedText = () =>
  errorSpy.mock.calls.map((args: unknown[]) => args.map(String).join(' ')).join('\n');

describe('customer-portal with no scope (the personal path, unchanged)', () => {
  it('opens the caller’s own customer when no scope is sent', async () => {
    const res = makeRes();
    await customerPortal(post({}), res);

    expect(res.statusCode).toBe(200);
    expect(res.body?.url).toBe(PORTAL_URL);
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: 'cus_own',
      return_url: 'https://app.example.com/',
    });
  });

  it('treats an explicit personal scope exactly as no scope', async () => {
    const res = makeRes();
    await customerPortal(post({ scope: 'personal' }), res);

    expect(res.statusCode).toBe(200);
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: 'cus_own',
      return_url: 'https://app.example.com/',
    });
  });

  it('still answers the old 404 for a personal caller with no customer', async () => {
    hooks.auth = { ok: true, userId: 'student-1' };

    const res = makeRes();
    await customerPortal(post({}), res);

    expect(res.statusCode).toBe(404);
    expect(res.body?.error).toBe('No billing account found. Please subscribe first.');
    expect(stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
  });

  it('reads only the caller’s profile for a personal request', async () => {
    const touched: string[] = [];
    hooks.client = {
      from: (table: string) => {
        touched.push(table);
        return new FakeQuery(table);
      },
    };

    await customerPortal(post({}), makeRes());

    expect(touched).toEqual(['profiles']);
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
  });
});

describe('customer-portal with scope school: the happy path', () => {
  it('opens the school licence’s customer, not the caller’s own', async () => {
    hooks.auth = { ok: true, userId: 'colleague-1' };

    const res = makeRes();
    await customerPortal(post({ scope: 'school' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body?.url).toBe(PORTAL_URL);
    // The colleague has a customer of their own (cus_colleague) and did not buy
    // the licence. The portal must be for the purchaser's customer.
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: 'cus_school',
      return_url: 'https://app.example.com/',
    });
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  it('lets an admin at the school open it too', async () => {
    hooks.auth = { ok: true, userId: 'admin-1' };

    const res = makeRes();
    await customerPortal(post({ scope: 'school' }), res);

    expect(res.statusCode).toBe(200);
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_school' })
    );
  });
});

describe('customer-portal with scope school: refusals', () => {
  it('refuses a student with a plain 403, and opens nothing', async () => {
    hooks.auth = { ok: true, userId: 'student-1' };

    const res = makeRes();
    await customerPortal(post({ scope: 'school' }), res);

    expect(res.statusCode).toBe(403);
    expect(res.body?.error).toBe('Only a teacher or admin can manage a school licence.');
    expect(stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
  });

  it('refuses a teacher with no school with a 403 that says what to do', async () => {
    hooks.auth = { ok: true, userId: 'loner-1' };

    const res = makeRes();
    await customerPortal(post({ scope: 'school' }), res);

    expect(res.statusCode).toBe(403);
    expect(res.body?.error).toContain('not attached to a school');
    expect(stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
  });

  it('answers 404 when the school holds no subscription', async () => {
    hooks.auth = { ok: true, userId: 'teacher-3' };

    const res = makeRes();
    await customerPortal(post({ scope: 'school' }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body?.error).toBe(NO_SCHOOL_LICENCE);
    expect(stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
  });

  it('answers 404 with a plain sentence when neither the row nor Stripe can give a customer', async () => {
    tables.subscriptions = [];
    stripe.subscriptions.retrieve.mockRejectedValue(
      new Error("No such subscription: 'sub_school'")
    );

    const res = makeRes();
    await customerPortal(post({ scope: 'school' }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body?.error).toContain(NO_BILLING_ACCOUNT);
    expect(stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
  });

  it('answers 503 when the profile read fails, and does not guess', async () => {
    failingReads.add('profiles');

    const res = makeRes();
    await customerPortal(post({ scope: 'school' }), res);

    expect(res.statusCode).toBe(503);
    expect(res.body?.error).toBe('Could not check your account. Please try again.');
    expect(stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
  });

  it('answers 503 when the school read fails, and does not guess', async () => {
    failingReads.add('schools');

    const res = makeRes();
    await customerPortal(post({ scope: 'school' }), res);

    expect(res.statusCode).toBe(503);
    expect(res.body?.error).toBe('Could not check your school. Please try again.');
    expect(stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  it('answers 503 when the subscriptions read fails, rather than falling back to Stripe', async () => {
    failingReads.add('subscriptions');

    const res = makeRes();
    await customerPortal(post({ scope: 'school' }), res);

    expect(res.statusCode).toBe(503);
    expect(stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  it('answers 503 when the school row is missing, since it cannot be checked', async () => {
    tables.schools = [];

    const res = makeRes();
    await customerPortal(post({ scope: 'school' }), res);

    expect(res.statusCode).toBe(503);
    expect(stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
  });
});

describe('customer-portal with scope school: the Stripe fallback', () => {
  it('reads the customer from Stripe when the subscriptions row is missing', async () => {
    tables.subscriptions = [];

    const res = makeRes();
    await customerPortal(post({ scope: 'school' }), res);

    expect(res.statusCode).toBe(200);
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_school');
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_from_stripe' })
    );
  });

  it('accepts a customer that Stripe returns as an object, not an id', async () => {
    tables.subscriptions = [];
    stripe.subscriptions.retrieve.mockResolvedValue({ customer: { id: 'cus_expanded' } });

    const res = makeRes();
    await customerPortal(post({ scope: 'school' }), res);

    expect(res.statusCode).toBe(200);
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_expanded' })
    );
  });

  it('logs only the error class when the Stripe lookup fails, not the id it names', async () => {
    tables.subscriptions = [];
    stripe.subscriptions.retrieve.mockRejectedValue(
      new Error("No such subscription: 'sub_school'")
    );

    const res = makeRes();
    await customerPortal(post({ scope: 'school' }), res);

    expect(res.statusCode).toBe(404);
    expect(loggedText()).toContain('school subscription lookup failed');
    expect(loggedText()).not.toContain('sub_school');
    expect(loggedText()).not.toContain('cus_');
  });
});

describe('customer-portal with scope school: what the body cannot change', () => {
  it('ignores a school id, a customer id and a subscription id sent in the body', async () => {
    hooks.auth = { ok: true, userId: 'colleague-1' };

    const res = makeRes();
    await customerPortal(
      post({
        scope: 'school',
        schoolId: 'school-2',
        school_id: 'school-2',
        customerId: 'cus_other',
        stripe_customer_id: 'cus_other',
        subscriptionId: 'sub_other',
        stripe_subscription_id: 'sub_other',
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_school' })
    );
    expect(stripe.billingPortal.sessions.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_other' })
    );
  });
});

describe('customer-portal: scope values', () => {
  it.each([
    ['an unknown word', { scope: 'all' }],
    ['a capitalised word', { scope: 'School' }],
    ['an empty string', { scope: '' }],
    ['null', { scope: null }],
    ['a number', { scope: 1 }],
    ['a list', { scope: ['school'] }],
  ])('refuses %s with a 400, and opens nothing', async (_label, body) => {
    const res = makeRes();
    await customerPortal(post(body), res);

    expect(res.statusCode).toBe(400);
    expect(res.body?.error).toBe('The billing scope must be personal or school.');
    expect(stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
  });
});

describe('customer-portal: a Stripe error in the portal call', () => {
  it('answers a generic 500 for the school scope and keeps the detail in the log', async () => {
    stripe.billingPortal.sessions.create.mockRejectedValue(
      new Error('No configuration provided: bpc_secret_123')
    );

    const res = makeRes();
    await customerPortal(post({ scope: 'school' }), res);

    expect(res.statusCode).toBe(500);
    expect(res.body?.error).toBe('Could not open the billing portal. Please try again.');
    expect(JSON.stringify(res.body)).not.toContain('bpc_');
    expect(loggedText()).toContain('No configuration provided');
  });

  it('answers the same generic 500 for the personal scope', async () => {
    stripe.billingPortal.sessions.create.mockRejectedValue(new Error('Stripe is down'));

    const res = makeRes();
    await customerPortal(post({}), res);

    expect(res.statusCode).toBe(500);
    expect(res.body?.error).toBe('Could not open the billing portal. Please try again.');
  });
});
