import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * POST /api/issue-invoice: a platform admin approves or declines a school's
 * invoice request. Approval creates real money objects in Stripe, so these
 * tests pin the exact Stripe calls, the refusals that must happen before any
 * call, and what the admin is told when a step fails part-way.
 *
 * Stripe and Supabase are doubles. Nothing reaches the network.
 */

type Row = Record<string, unknown>;
type DbError = { code?: string; message: string } | null;

let tables: Record<string, Row[]> = {};
/** Write failures to inject, keyed `table.update` or `table.insert`. */
let writeErrors: Record<string, DbError> = {};
/** Read failures to inject, keyed by table. */
let failingReads = new Set<string>();
let authResult: { ok: boolean; status?: number; error?: string; userId?: string } = {
  ok: true,
  userId: 'admin-1',
};

class FakeQuery implements PromiseLike<unknown> {
  private filters: Array<(row: Row) => boolean> = [];
  private operation: 'select' | 'insert' | 'update' = 'select';
  private payload: Row | null = null;

  constructor(private readonly table: string) {}

  select(_columns?: string) {
    return this;
  }

  insert(row: Row) {
    this.operation = 'insert';
    this.payload = row;
    return this;
  }

  update(values: Row) {
    this.operation = 'update';
    this.payload = values;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  is(column: string, value: null) {
    this.filters.push((row) => (row[column] ?? null) === value);
    return this;
  }

  private run(): { data: unknown; error: DbError } {
    const matching = (tables[this.table] ?? []).filter((row) => this.filters.every((f) => f(row)));

    if (this.operation === 'insert') {
      const failure = writeErrors[`${this.table}.insert`];
      if (failure) return { data: null, error: failure };
      const row: Row = { id: crypto.randomUUID(), status: 'pending', ...this.payload };
      tables[this.table] = [...(tables[this.table] ?? []), row];
      return { data: [row], error: null };
    }

    if (this.operation === 'update') {
      const failure = writeErrors[`${this.table}.update`];
      if (failure) return { data: null, error: failure };
      for (const row of matching) Object.assign(row, this.payload);
      return { data: matching.map((row) => ({ ...row })), error: null };
    }

    if (failingReads.has(this.table)) return { data: null, error: { message: 'read failed' } };
    return { data: matching, error: null };
  }

  maybeSingle() {
    const result = this.run();
    const rows = result.data as Row[] | null;
    return Promise.resolve({
      data: Array.isArray(rows) ? (rows[0] ?? null) : rows,
      error: result.error,
    });
  }

  single() {
    const result = this.run();
    const rows = result.data as Row[] | null;
    return Promise.resolve({ data: rows?.[0] ?? null, error: result.error });
  }

  then<A, B>(
    onFulfilled?: (value: unknown) => A | PromiseLike<A>,
    onRejected?: (reason: unknown) => B | PromiseLike<B>
  ) {
    return Promise.resolve(this.run()).then(onFulfilled, onRejected);
  }
}

const stripe = {
  customers: { create: vi.fn(), update: vi.fn() },
  subscriptions: { create: vi.fn() },
  invoices: { retrieve: vi.fn(), finalizeInvoice: vi.fn(), sendInvoice: vi.fn() },
};

let stripeConfigured = true;
let databaseConfigured = true;

vi.mock('../../api/_lib/stripe', () => ({
  getSupabaseAdmin: () =>
    databaseConfigured ? { from: (table: string) => new FakeQuery(table) } : null,
  getStripe: () => (stripeConfigured ? stripe : null),
  isStripeConfigured: () => stripeConfigured,
}));

vi.mock('../../api/_lib/auth', () => ({
  verifyRequestAuth: async () => authResult,
}));

import issueInvoice from '../../api/issue-invoice';

const REQUEST_ID = '6f1c2a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b';

const makeRes = () => ({
  statusCode: 0,
  body: undefined as Record<string, unknown> | undefined,
  headers: {} as Record<string, string>,
  ended: false,
  status(code: number) {
    this.statusCode = code;
    return this;
  },
  json(data: unknown) {
    this.body = data as Record<string, unknown>;
  },
  setHeader(name: string, value: string) {
    this.headers[name] = value;
  },
  end() {
    this.ended = true;
  },
});

const post = (body: Record<string, unknown>) => ({
  method: 'POST',
  headers: { authorization: 'Bearer t', origin: 'https://app.example.com' },
  body,
});

const approveBody = { requestId: REQUEST_ID, action: 'approve' };

const address = {
  line1: '1 Test Street',
  line2: null,
  city: 'Sydney',
  state: 'NSW',
  postcode: '2000',
  country: 'AU',
};

const pendingRequest = (overrides: Row = {}): Row => ({
  id: REQUEST_ID,
  requested_by: 'teacher-1',
  school_id: 'school-1',
  seats: 30,
  billing_name: 'Parramatta High School',
  billing_email: 'accounts@school.edu.au',
  billing_address: address,
  abn: '51824753556',
  po_number: 'PO-7781',
  note: null,
  status: 'pending',
  decided_by: null,
  decided_at: null,
  decision_note: null,
  stripe_customer_id: null,
  stripe_subscription_id: null,
  stripe_invoice_id: null,
  hosted_invoice_url: null,
  created_at: new Date().toISOString(),
  ...overrides,
});

const HOSTED = 'https://invoice.stripe.com/i/acct/in_1';

const resetStripeMocks = () => {
  stripe.customers.create.mockReset().mockResolvedValue({ id: 'cus_new' });
  stripe.customers.update.mockReset().mockResolvedValue({ id: 'cus_existing' });
  stripe.subscriptions.create
    .mockReset()
    .mockResolvedValue({ id: 'sub_1', status: 'active', latest_invoice: 'in_1' });
  stripe.invoices.retrieve.mockReset().mockResolvedValue({ id: 'in_1', status: 'draft' });
  stripe.invoices.finalizeInvoice
    .mockReset()
    .mockResolvedValue({ id: 'in_1', status: 'open', hosted_invoice_url: HOSTED });
  stripe.invoices.sendInvoice
    .mockReset()
    .mockResolvedValue({ id: 'in_1', status: 'open', hosted_invoice_url: HOSTED });
};

const stripeCallCount = () =>
  [
    stripe.customers.create,
    stripe.customers.update,
    stripe.subscriptions.create,
    stripe.invoices.retrieve,
    stripe.invoices.finalizeInvoice,
    stripe.invoices.sendInvoice,
  ].reduce((total, fn) => total + fn.mock.calls.length, 0);

beforeEach(() => {
  delete process.env.SCHOOL_INVOICE_ENABLED;
  delete process.env.VITE_SCHOOL_INVOICE_ENABLED;
  delete process.env.ALLOWED_ORIGIN;
  delete process.env.STRIPE_AUTOMATIC_TAX;
  process.env.STRIPE_SCHOOL_PRICE_ID = 'price_school';
  stripeConfigured = true;
  databaseConfigured = true;
  writeErrors = {};
  failingReads = new Set();
  authResult = { ok: true, userId: 'admin-1' };
  tables = {
    profiles: [
      { id: 'admin-1', role: 'admin', school_id: null, stripe_customer_id: null },
      { id: 'teacher-1', role: 'teacher', school_id: 'school-1', stripe_customer_id: null },
      { id: 'teacher-2', role: 'teacher', school_id: 'school-2', stripe_customer_id: null },
      {
        id: 'teacher-cust',
        role: 'teacher',
        school_id: 'school-1',
        stripe_customer_id: 'cus_existing',
      },
      { id: 'student-1', role: 'student', school_id: 'school-1', stripe_customer_id: null },
    ],
    schools: [{ id: 'school-1', stripe_subscription_id: null, plan_status: 'none' }],
    licence_requests: [pendingRequest()],
  };
  resetStripeMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const requestRow = () => tables.licence_requests.find((r) => r.id === REQUEST_ID) as Row;

describe('issue-invoice: kill switch, transport and who may decide', () => {
  it('answers 404 when SCHOOL_INVOICE_ENABLED is false, and touches nothing', async () => {
    process.env.SCHOOL_INVOICE_ENABLED = 'false';
    const res = makeRes();
    await issueInvoice(post(approveBody), res);
    expect(res.statusCode).toBe(404);
    expect(stripeCallCount()).toBe(0);
  });

  it('refuses a GET', async () => {
    const res = makeRes();
    await issueInvoice({ method: 'GET', headers: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it('refuses a teacher, even one who sends admin in the body', async () => {
    authResult = { ok: true, userId: 'teacher-1' };
    const res = makeRes();
    await issueInvoice(post({ ...approveBody, role: 'admin' }), res);

    expect(res.statusCode).toBe(403);
    expect(stripeCallCount()).toBe(0);
    expect(requestRow().status).toBe('pending');
  });

  it('refuses a student', async () => {
    authResult = { ok: true, userId: 'student-1' };
    const res = makeRes();
    await issueInvoice(post(approveBody), res);
    expect(res.statusCode).toBe(403);
  });

  it('fails closed when the caller profile cannot be read', async () => {
    failingReads = new Set(['profiles']);
    const res = makeRes();
    await issueInvoice(post(approveBody), res);
    expect(res.statusCode).toBe(503);
    expect(stripeCallCount()).toBe(0);
  });

  it('answers 501 when the database is not configured', async () => {
    databaseConfigured = false;
    const res = makeRes();
    await issueInvoice(post(approveBody), res);
    expect(res.statusCode).toBe(501);
    expect(stripeCallCount()).toBe(0);
  });

  it('rejects a malformed decision before reading the request', async () => {
    const res = makeRes();
    await issueInvoice(post({ requestId: 'nope', action: 'approve' }), res);
    expect(res.statusCode).toBe(400);
  });

  it('answers 404 for a request id that does not exist', async () => {
    const res = makeRes();
    await issueInvoice(
      post({ requestId: '00000000-0000-4000-8000-000000000000', action: 'approve' }),
      res
    );
    expect(res.statusCode).toBe(404);
    expect(stripeCallCount()).toBe(0);
  });
});

describe('issue-invoice: decline', () => {
  it('records the decline with the admin and the note, and makes no Stripe call', async () => {
    const res = makeRes();
    await issueInvoice(
      post({ requestId: REQUEST_ID, action: 'decline', decisionNote: 'Please add the PO number.' }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(requestRow()).toMatchObject({
      status: 'declined',
      decided_by: 'admin-1',
      decision_note: 'Please add the PO number.',
    });
    expect(stripeCallCount()).toBe(0);
  });

  it('works when Stripe is not configured, because it moves no money', async () => {
    stripeConfigured = false;
    const res = makeRes();
    await issueInvoice(post({ requestId: REQUEST_ID, action: 'decline' }), res);
    expect(res.statusCode).toBe(200);
    expect(requestRow().status).toBe('declined');
  });

  it('answers a repeat decline without changing anything', async () => {
    const res = makeRes();
    await issueInvoice(post({ requestId: REQUEST_ID, action: 'decline' }), res);
    const again = makeRes();
    await issueInvoice(post({ requestId: REQUEST_ID, action: 'decline' }), again);
    expect(again.statusCode).toBe(200);
  });

  it('refuses to decline a request that was already approved', async () => {
    tables.licence_requests = [pendingRequest({ status: 'approved' })];
    const res = makeRes();
    await issueInvoice(post({ requestId: REQUEST_ID, action: 'decline' }), res);
    expect(res.statusCode).toBe(409);
  });
});

describe('issue-invoice: approve, the happy path', () => {
  it('creates a new customer for the requester with the billing details, ABN and PO', async () => {
    const res = makeRes();
    await issueInvoice(post(approveBody), res);

    expect(res.statusCode).toBe(200);
    expect(stripe.customers.create).toHaveBeenCalledTimes(1);
    expect(stripe.customers.create).toHaveBeenCalledWith(
      {
        name: 'Parramatta High School',
        email: 'accounts@school.edu.au',
        address: {
          line1: '1 Test Street',
          line2: undefined,
          city: 'Sydney',
          state: 'NSW',
          postal_code: '2000',
          country: 'AU',
        },
        preferred_locales: ['en-AU'],
        metadata: {
          supabase_user_id: 'teacher-1',
          school_id: 'school-1',
          licence_request_id: REQUEST_ID,
        },
        tax_id_data: [{ type: 'au_abn', value: '51824753556' }],
        invoice_settings: { custom_fields: [{ name: 'Purchase order', value: 'PO-7781' }] },
      },
      { idempotencyKey: `licence-request-${REQUEST_ID}-customer` }
    );
  });

  it('creates the subscription as send_invoice with the due days, metadata and the idempotency key', async () => {
    const res = makeRes();
    await issueInvoice(post(approveBody), res);

    expect(stripe.subscriptions.create).toHaveBeenCalledWith(
      {
        customer: 'cus_new',
        items: [{ price: 'price_school', quantity: 30 }],
        collection_method: 'send_invoice',
        days_until_due: 30,
        metadata: {
          supabase_user_id: 'teacher-1',
          school_id: 'school-1',
          licence_request_id: REQUEST_ID,
        },
      },
      { idempotencyKey: `licence-request-${REQUEST_ID}` }
    );
  });

  it('turns on automatic tax on the subscription only when STRIPE_AUTOMATIC_TAX is true', async () => {
    process.env.STRIPE_AUTOMATIC_TAX = 'true';
    await issueInvoice(post(approveBody), makeRes());
    expect(stripe.subscriptions.create.mock.calls[0][0]).toHaveProperty('automatic_tax', {
      enabled: true,
    });
  });

  it('honours daysUntilDue when the admin sets it', async () => {
    await issueInvoice(post({ ...approveBody, daysUntilDue: 60 }), makeRes());
    expect(stripe.subscriptions.create.mock.calls[0][0]).toHaveProperty('days_until_due', 60);
  });

  it('finalises the draft invoice, sends it, and records everything on the request', async () => {
    const res = makeRes();
    await issueInvoice(post(approveBody), res);

    expect(stripe.invoices.finalizeInvoice).toHaveBeenCalledWith('in_1');
    expect(stripe.invoices.sendInvoice).toHaveBeenCalledWith('in_1');
    expect(requestRow()).toMatchObject({
      status: 'approved',
      decided_by: 'admin-1',
      stripe_customer_id: 'cus_new',
      stripe_subscription_id: 'sub_1',
      stripe_invoice_id: 'in_1',
      hosted_invoice_url: HOSTED,
    });
    expect(res.body).toMatchObject({ subscriptionId: 'sub_1', hostedInvoiceUrl: HOSTED });
    expect((res.body?.request as Row).status).toBe('approved');
    expect(res.body?.request as Row).not.toHaveProperty('stripe_customer_id');
  });

  it('links the new customer to the requester profile', async () => {
    await issueInvoice(post(approveBody), makeRes());
    expect(tables.profiles.find((p) => p.id === 'teacher-1')?.stripe_customer_id).toBe('cus_new');
  });

  it('omits the tax id and the custom field when no ABN or PO was given', async () => {
    tables.licence_requests = [pendingRequest({ abn: null, po_number: null })];
    await issueInvoice(post(approveBody), makeRes());
    const customer = stripe.customers.create.mock.calls[0][0];
    expect(customer).not.toHaveProperty('tax_id_data');
    expect(customer).not.toHaveProperty('invoice_settings');
  });
});

describe('issue-invoice: a requester who already has a Stripe customer', () => {
  beforeEach(() => {
    tables.licence_requests = [pendingRequest({ requested_by: 'teacher-cust' })];
  });

  it('reuses that customer, so the portal keeps seeing every subscription', async () => {
    await issueInvoice(post(approveBody), makeRes());
    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(stripe.subscriptions.create.mock.calls[0][0].customer).toBe('cus_existing');
  });

  it('replaces the billing email, name and address, so the invoice reaches the accounts office', async () => {
    await issueInvoice(post(approveBody), makeRes());
    expect(stripe.customers.update).toHaveBeenCalledWith('cus_existing', {
      name: 'Parramatta High School',
      email: 'accounts@school.edu.au',
      address: expect.objectContaining({ postal_code: '2000', country: 'AU' }),
      invoice_settings: { custom_fields: [{ name: 'Purchase order', value: 'PO-7781' }] },
    });
  });

  it('clears a purchase order left on the customer when this request has none', async () => {
    tables.licence_requests = [pendingRequest({ requested_by: 'teacher-cust', po_number: null })];
    await issueInvoice(post(approveBody), makeRes());
    expect(stripe.customers.update.mock.calls[0][1].invoice_settings).toEqual({
      custom_fields: '',
    });
  });

  it('refuses, before any subscription, when the customer update fails', async () => {
    stripe.customers.update.mockRejectedValue(new Error('sk_live_secret detail'));
    const res = makeRes();
    await issueInvoice(post(approveBody), res);

    expect(res.statusCode).toBe(502);
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toContain('sk_live');
    expect(requestRow().status).toBe('pending');
  });
});

describe('issue-invoice: refusals before Stripe is called', () => {
  it('refuses when the school already holds a live licence, so seats are not paid twice', async () => {
    tables.schools = [
      { id: 'school-1', stripe_subscription_id: 'sub_live', plan_status: 'active' },
    ];
    const res = makeRes();
    await issueInvoice(post(approveBody), res);

    expect(res.statusCode).toBe(409);
    expect(stripeCallCount()).toBe(0);
    expect(requestRow().status).toBe('pending');
  });

  it('fails closed when the school cannot be read', async () => {
    failingReads = new Set(['schools']);
    const res = makeRes();
    await issueInvoice(post(approveBody), res);
    expect(res.statusCode).toBe(503);
    expect(stripeCallCount()).toBe(0);
  });

  it('refuses when STRIPE_SCHOOL_PRICE_ID is not set, and says which variable', async () => {
    delete process.env.STRIPE_SCHOOL_PRICE_ID;
    const res = makeRes();
    await issueInvoice(post(approveBody), res);
    expect(res.statusCode).toBe(501);
    expect(res.body?.error).toContain('STRIPE_SCHOOL_PRICE_ID');
    expect(stripeCallCount()).toBe(0);
  });

  it('refuses when Stripe is not configured on this deployment', async () => {
    stripeConfigured = false;
    const res = makeRes();
    await issueInvoice(post(approveBody), res);
    expect(res.statusCode).toBe(501);
    expect(stripeCallCount()).toBe(0);
  });

  it('refuses when the requester has moved to another school since asking', async () => {
    tables.licence_requests = [pendingRequest({ requested_by: 'teacher-2' })];
    const res = makeRes();
    await issueInvoice(post(approveBody), res);

    expect(res.statusCode).toBe(409);
    expect(res.body?.error).toContain('no longer attached to this school');
    expect(stripeCallCount()).toBe(0);
  });

  it('refuses when the requester is no longer a teacher or admin', async () => {
    tables.licence_requests = [pendingRequest({ requested_by: 'student-1' })];
    const res = makeRes();
    await issueInvoice(post(approveBody), res);
    expect(res.statusCode).toBe(409);
    expect(stripeCallCount()).toBe(0);
  });

  it('refuses when the requester account has been removed', async () => {
    tables.licence_requests = [pendingRequest({ requested_by: null })];
    const res = makeRes();
    await issueInvoice(post(approveBody), res);
    expect(res.statusCode).toBe(409);
    expect(stripeCallCount()).toBe(0);
  });

  it('refuses to approve a request that was declined', async () => {
    tables.licence_requests = [pendingRequest({ status: 'declined' })];
    const res = makeRes();
    await issueInvoice(post(approveBody), res);
    expect(res.statusCode).toBe(409);
    expect(stripeCallCount()).toBe(0);
  });
});

describe('issue-invoice: a customer already claimed by another profile', () => {
  it('stops with a clear message and creates no subscription', async () => {
    writeErrors['profiles.update'] = { code: '23505', message: 'duplicate key' };
    const res = makeRes();
    await issueInvoice(post(approveBody), res);

    expect(res.statusCode).toBe(409);
    expect(res.body?.error).toContain('already linked to a different billing customer');
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
    expect(requestRow().status).toBe('pending');
  });
});

describe('issue-invoice: a failure part-way through', () => {
  it('leaves the request pending when Stripe does not create the subscription, and says so', async () => {
    stripe.subscriptions.create.mockRejectedValue(new Error('sk_live_abc network reset'));
    const res = makeRes();
    await issueInvoice(post(approveBody), res);

    expect(res.statusCode).toBe(502);
    expect(res.body?.error).toContain('still pending');
    expect(JSON.stringify(res.body)).not.toContain('sk_live');
    expect(requestRow().status).toBe('pending');
    expect(res.body).not.toHaveProperty('subscriptionId');
  });

  it('reuses the same subscription on a retry, because the idempotency key is the same', async () => {
    stripe.subscriptions.create.mockRejectedValueOnce(new Error('timeout'));
    await issueInvoice(post(approveBody), makeRes());
    const retry = makeRes();
    await issueInvoice(post(approveBody), retry);

    expect(retry.statusCode).toBe(200);
    const keys = stripe.subscriptions.create.mock.calls.map((call) => call[1].idempotencyKey);
    expect(keys).toEqual([`licence-request-${REQUEST_ID}`, `licence-request-${REQUEST_ID}`]);
    expect(requestRow().status).toBe('approved');
  });

  it('tells the admin the subscription exists when the invoice cannot be sent, and leaves the request pending', async () => {
    stripe.invoices.sendInvoice.mockRejectedValue(new Error('send failed'));
    stripe.invoices.retrieve.mockResolvedValue({ id: 'in_1', status: 'draft' });
    const res = makeRes();
    await issueInvoice(post(approveBody), res);

    expect(res.statusCode).toBe(502);
    expect(res.body?.subscriptionId).toBe('sub_1');
    expect(res.body?.error).toContain('subscription exists');
    expect(requestRow()).toMatchObject({
      status: 'pending',
      stripe_subscription_id: 'sub_1',
    });
  });

  it('does not treat an open-but-unsent invoice as sent when the send fails', async () => {
    // Finalised (so it is open) but the send fails and the invoice is still
    // open afterwards: it may never have reached the school.
    stripe.invoices.finalizeInvoice.mockRejectedValue(new Error('already finalised'));
    stripe.invoices.retrieve
      .mockResolvedValueOnce({ id: 'in_1', status: 'draft' })
      .mockResolvedValueOnce({ id: 'in_1', status: 'open' })
      .mockResolvedValueOnce({ id: 'in_1', status: 'open' });
    stripe.invoices.sendInvoice.mockRejectedValue(new Error('send failed'));
    const res = makeRes();
    await issueInvoice(post(approveBody), res);

    expect(res.statusCode).toBe(502);
    expect(res.body?.subscriptionId).toBe('sub_1');
    expect(requestRow().status).toBe('pending');
  });

  it('tolerates a finalise that is already done, and still sends', async () => {
    stripe.invoices.retrieve.mockResolvedValue({
      id: 'in_1',
      status: 'open',
      hosted_invoice_url: HOSTED,
    });
    const res = makeRes();
    await issueInvoice(post(approveBody), res);

    expect(res.statusCode).toBe(200);
    expect(stripe.invoices.finalizeInvoice).not.toHaveBeenCalled();
    expect(stripe.invoices.sendInvoice).toHaveBeenCalledWith('in_1');
  });

  it('tolerates a finalise that fails when the invoice is open afterwards', async () => {
    stripe.invoices.finalizeInvoice.mockRejectedValue(new Error('already finalised'));
    stripe.invoices.retrieve
      .mockResolvedValueOnce({ id: 'in_1', status: 'draft' })
      .mockResolvedValueOnce({ id: 'in_1', status: 'open', hosted_invoice_url: HOSTED });
    const res = makeRes();
    await issueInvoice(post(approveBody), res);
    expect(res.statusCode).toBe(200);
  });

  it('tolerates a send on a paid invoice, because the school has already paid', async () => {
    stripe.invoices.sendInvoice.mockRejectedValue(new Error('already paid'));
    stripe.invoices.retrieve
      .mockResolvedValueOnce({ id: 'in_1', status: 'draft' })
      .mockResolvedValueOnce({ id: 'in_1', status: 'paid', hosted_invoice_url: HOSTED });
    const res = makeRes();
    await issueInvoice(post(approveBody), res);
    expect(res.statusCode).toBe(200);
  });

  it('refuses, and says so, when the subscription has no first invoice', async () => {
    stripe.subscriptions.create.mockResolvedValue({
      id: 'sub_1',
      status: 'active',
      latest_invoice: null,
    });
    const res = makeRes();
    await issueInvoice(post(approveBody), res);

    expect(res.statusCode).toBe(502);
    expect(res.body?.subscriptionId).toBe('sub_1');
    expect(requestRow().status).toBe('pending');
  });
});

describe('issue-invoice: approving twice', () => {
  it('answers a second approval with what already exists, and creates nothing new', async () => {
    await issueInvoice(post(approveBody), makeRes());
    const before = stripeCallCount();

    const again = makeRes();
    await issueInvoice(post(approveBody), again);

    expect(again.statusCode).toBe(200);
    expect(again.body?.subscriptionId).toBe('sub_1');
    expect(stripeCallCount()).toBe(before);
  });

  it('refuses to approve after a decline', async () => {
    await issueInvoice(post({ requestId: REQUEST_ID, action: 'decline' }), makeRes());
    const res = makeRes();
    await issueInvoice(post(approveBody), res);
    expect(res.statusCode).toBe(409);
    expect(stripeCallCount()).toBe(0);
  });
});

describe('issue-invoice: CORS preflight parity with the billing endpoints', () => {
  it('answers OPTIONS with 204 for an allowed origin', async () => {
    process.env.ALLOWED_ORIGIN = 'https://app.example.com';
    const res = makeRes();
    await issueInvoice({ method: 'OPTIONS', headers: { origin: 'https://app.example.com' } }, res);
    expect(res.statusCode).toBe(204);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://app.example.com');
  });

  it('answers OPTIONS with 403 and no allow-origin header for another origin', async () => {
    process.env.ALLOWED_ORIGIN = 'https://app.example.com';
    const res = makeRes();
    await issueInvoice({ method: 'OPTIONS', headers: { origin: 'https://evil.example' } }, res);
    expect(res.statusCode).toBe(403);
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
  });
});
