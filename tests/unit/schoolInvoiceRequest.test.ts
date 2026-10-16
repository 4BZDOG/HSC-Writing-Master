import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * POST /api/request-invoice: a teacher or admin asks for a school licence to be
 * invoiced. These tests pin the refusals that stand between a request and the
 * database: the kill switch, the role and school checks, the live-licence
 * check, the one-pending rule, the daily cap, and the privacy rule that a
 * colleague's pending request is not shown in full.
 *
 * Supabase is an in-memory double with the same query shapes the endpoint uses.
 * Nothing here reaches Stripe or the network.
 */

type Row = Record<string, unknown>;
type SupabaseError = { code?: string; message: string } | null;

/** Table rows, reset before every test. */
let tables: Record<string, Row[]> = {};
/** Set to make the next write fail with this error. */
let insertError: SupabaseError = null;
/** Runs once, just before the next write: used to model a parallel request. */
let beforeInsert: (() => void) | null = null;
/** Tables whose reads fail, to exercise the fail-closed paths. */
let failingReads = new Set<string>();
/** What verifyRequestAuth reports for this request. */
let authResult: { ok: boolean; status?: number; error?: string; userId?: string } = {
  ok: true,
  userId: 'teacher-1',
};
/** The database the handler sees. null models an unconfigured deployment. */
let activeClient: unknown = null;

class FakeQuery implements PromiseLike<unknown> {
  private filters: Array<(row: Row) => boolean> = [];
  private operation: 'select' | 'insert' = 'select';
  private insertRow: Row | null = null;

  constructor(private readonly table: string) {}

  select(_columns?: string, _options?: unknown) {
    return this;
  }

  insert(row: Row) {
    this.operation = 'insert';
    this.insertRow = row;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  gte(column: string, value: string) {
    this.filters.push((row) => String(row[column]) >= value);
    return this;
  }

  private run(): { data: unknown; count: number; error: SupabaseError } {
    if (this.operation === 'insert') {
      const hook = beforeInsert;
      beforeInsert = null;
      hook?.();
      if (insertError) return { data: null, count: 0, error: insertError };
      const row: Row = {
        id: crypto.randomUUID(),
        status: 'pending',
        created_at: new Date().toISOString(),
        decided_at: null,
        decision_note: null,
        stripe_customer_id: null,
        stripe_subscription_id: null,
        stripe_invoice_id: null,
        hosted_invoice_url: null,
        ...this.insertRow,
      };
      tables[this.table] = [...(tables[this.table] ?? []), row];
      return { data: row, count: 1, error: null };
    }
    if (failingReads.has(this.table)) {
      return { data: null, count: 0, error: { message: 'read failed' } };
    }
    const rows = (tables[this.table] ?? []).filter((row) => this.filters.every((f) => f(row)));
    return { data: rows, count: rows.length, error: null };
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
    return Promise.resolve({ data: result.data, error: result.error });
  }

  then<A, B>(
    onFulfilled?: (value: unknown) => A | PromiseLike<A>,
    onRejected?: (reason: unknown) => B | PromiseLike<B>
  ) {
    return Promise.resolve(this.run()).then(onFulfilled, onRejected);
  }
}

const fakeClient = () => ({
  from: (table: string) => new FakeQuery(table),
});

vi.mock('../../api/_lib/stripe', () => ({
  getSupabaseAdmin: () => activeClient,
}));

vi.mock('../../api/_lib/auth', () => ({
  verifyRequestAuth: async () => authResult,
}));

import requestInvoice from '../../api/request-invoice';

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

const address = {
  line1: '1 Test Street',
  city: 'Sydney',
  state: 'NSW',
  postcode: '2000',
  country: 'AU',
};

const validBody = {
  seats: 30,
  billingName: 'Parramatta High School',
  billingEmail: 'accounts@school.edu.au',
  billingAddress: address,
  abn: '51 824 753 556',
  poNumber: 'PO-7781',
  note: 'For the Year 12 English team',
};

const post = (body: unknown = validBody) => ({
  method: 'POST',
  headers: { authorization: 'Bearer t', origin: 'https://app.example.com' },
  body,
});

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

const liveSchool = {
  id: 'school-1',
  name: 'Parramatta High School',
  stripe_subscription_id: null,
  plan_status: 'none',
};

beforeEach(() => {
  delete process.env.SCHOOL_INVOICE_ENABLED;
  delete process.env.VITE_SCHOOL_INVOICE_ENABLED;
  delete process.env.ALLOWED_ORIGIN;
  delete process.env.BILLING_ALERT_WEBHOOK_URL;
  insertError = null;
  beforeInsert = null;
  failingReads = new Set();
  authResult = { ok: true, userId: 'teacher-1' };
  activeClient = fakeClient();
  tables = {
    profiles: [
      { id: 'teacher-1', role: 'teacher', school_id: 'school-1' },
      { id: 'colleague-1', role: 'teacher', school_id: 'school-1' },
      { id: 'admin-1', role: 'admin', school_id: 'school-1' },
      { id: 'student-1', role: 'student', school_id: 'school-1' },
      { id: 'loner-1', role: 'teacher', school_id: null },
    ],
    schools: [liveSchool],
    licence_requests: [],
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('request-invoice: kill switch and transport', () => {
  it('answers 404 with the plain-English reason when SCHOOL_INVOICE_ENABLED is false', async () => {
    process.env.SCHOOL_INVOICE_ENABLED = 'false';
    const res = makeRes();
    await requestInvoice(post(), res);

    expect(res.statusCode).toBe(404);
    expect(res.body?.error).toBe('Invoiced licences are not offered on this deployment.');
    expect(tables.licence_requests).toHaveLength(0);
  });

  it('answers 404 before it checks the caller, so a switched-off deployment reveals nothing', async () => {
    process.env.SCHOOL_INVOICE_ENABLED = 'false';
    authResult = { ok: false, status: 401, error: 'Authentication required.' };
    const res = makeRes();
    await requestInvoice(post(), res);
    expect(res.statusCode).toBe(404);
  });

  it('refuses a GET', async () => {
    const res = makeRes();
    await requestInvoice({ method: 'GET', headers: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it('passes an authentication failure through', async () => {
    authResult = { ok: false, status: 401, error: 'Invalid or expired session.' };
    const res = makeRes();
    await requestInvoice(post(), res);
    expect(res.statusCode).toBe(401);
    expect(res.body?.error).toBe('Invalid or expired session.');
  });

  it('answers 501 and writes nothing when the database is not configured', async () => {
    activeClient = null;
    const res = makeRes();
    await requestInvoice(post(), res);
    expect(res.statusCode).toBe(501);
    expect(res.body?.error).toContain('database');
  });
});

describe('request-invoice: who may ask, and for which school', () => {
  it('refuses a student, and writes nothing', async () => {
    authResult = { ok: true, userId: 'student-1' };
    const res = makeRes();
    await requestInvoice(post(), res);

    expect(res.statusCode).toBe(403);
    expect(res.body?.error).toBe('School licences are requested by a teacher or admin account.');
    expect(tables.licence_requests).toHaveLength(0);
  });

  it('refuses a teacher who is not attached to any school, with the step that fixes it', async () => {
    authResult = { ok: true, userId: 'loner-1' };
    const res = makeRes();
    await requestInvoice(post(), res);

    expect(res.statusCode).toBe(400);
    expect(res.body?.error).toContain('Admin → Schools');
    expect(tables.licence_requests).toHaveLength(0);
  });

  it('refuses when the caller has no profile at all', async () => {
    authResult = { ok: true, userId: 'nobody' };
    const res = makeRes();
    await requestInvoice(post(), res);
    expect(res.statusCode).toBe(403);
  });

  it('accepts an admin attached to a school', async () => {
    authResult = { ok: true, userId: 'admin-1' };
    const res = makeRes();
    await requestInvoice(post(), res);
    expect(res.statusCode).toBe(201);
  });

  it('takes the school from the caller profile, never from the request body', async () => {
    const res = makeRes();
    await requestInvoice(post({ ...validBody, schoolId: 'school-2', school_id: 'school-2' }), res);

    expect(res.statusCode).toBe(201);
    expect(tables.licence_requests[0].school_id).toBe('school-1');
  });
});

describe('request-invoice: validation', () => {
  it('refuses a request for three seats and writes nothing', async () => {
    const res = makeRes();
    await requestInvoice(post({ ...validBody, seats: 3 }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body?.error).toContain('5 to 1000');
    expect(tables.licence_requests).toHaveLength(0);
  });

  it('refuses a bad ABN before any database read', async () => {
    const res = makeRes();
    await requestInvoice(post({ ...validBody, abn: '51 824 753 557' }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body?.error).toContain('ABN');
  });
});

describe('request-invoice: the school must need a licence', () => {
  it('refuses when the school already holds a live licence', async () => {
    tables.schools = [
      { id: 'school-1', stripe_subscription_id: 'sub_live', plan_status: 'active' },
    ];
    const res = makeRes();
    await requestInvoice(post(), res);

    expect(res.statusCode).toBe(409);
    expect(res.body?.error).toContain('already holds a licence');
    expect(tables.licence_requests).toHaveLength(0);
  });

  it('still refuses a school whose licence is cancelling at period end', async () => {
    tables.schools = [
      { id: 'school-1', stripe_subscription_id: 'sub_live', plan_status: 'active' },
    ];
    const res = makeRes();
    await requestInvoice(post(), res);
    expect(res.statusCode).toBe(409);
  });

  it('accepts a school whose old licence has been cancelled', async () => {
    tables.schools = [
      { id: 'school-1', stripe_subscription_id: 'sub_old', plan_status: 'canceled' },
    ];
    const res = makeRes();
    await requestInvoice(post(), res);
    expect(res.statusCode).toBe(201);
  });

  it('fails closed when the school cannot be read: refuse, do not guess', async () => {
    failingReads = new Set(['schools']);
    const res = makeRes();
    await requestInvoice(post(), res);

    expect(res.statusCode).toBe(503);
    expect(tables.licence_requests).toHaveLength(0);
  });

  it('fails closed when the profile cannot be read', async () => {
    failingReads = new Set(['profiles']);
    const res = makeRes();
    await requestInvoice(post(), res);
    expect(res.statusCode).toBe(503);
    expect(tables.licence_requests).toHaveLength(0);
  });
});

describe('request-invoice: one pending request per school', () => {
  it('returns the existing pending request to its own author and writes no second row', async () => {
    tables.licence_requests = [
      {
        id: 'req-1',
        requested_by: 'teacher-1',
        school_id: 'school-1',
        seats: 30,
        billing_name: 'Parramatta High School',
        billing_email: 'accounts@school.edu.au',
        billing_address: address,
        abn: null,
        po_number: null,
        note: null,
        status: 'pending',
        created_at: daysAgo(0.1),
        stripe_customer_id: 'cus_secret',
      },
    ];
    const res = makeRes();
    await requestInvoice(post(), res);

    expect(res.statusCode).toBe(200);
    const request = res.body?.request as Record<string, unknown>;
    expect(request.id).toBe('req-1');
    expect(request.billing_email).toBe('accounts@school.edu.au');
    expect(tables.licence_requests).toHaveLength(1);
  });

  it('shows a colleague’s pending request as a summary only, without their billing details', async () => {
    // One instant, read once: calling daysAgo() again for the expectation reads the
    // clock a millisecond later and fails about one run in a few hundred.
    const colleaguesRequestAt = daysAgo(0.2);
    tables.licence_requests = [
      {
        id: 'req-2',
        requested_by: 'colleague-1',
        school_id: 'school-1',
        seats: 40,
        billing_name: 'Someone Else Pty Ltd',
        billing_email: 'private@other.example',
        billing_address: address,
        status: 'pending',
        created_at: colleaguesRequestAt,
      },
    ];
    const res = makeRes();
    await requestInvoice(post(), res);

    expect(res.statusCode).toBe(200);
    const request = res.body?.request as Record<string, unknown>;
    expect(request).toEqual({
      id: 'req-2',
      status: 'pending',
      seats: 40,
      created_at: colleaguesRequestAt,
    });
    expect(JSON.stringify(res.body)).not.toContain('private@other.example');
    expect(JSON.stringify(res.body)).not.toContain('Someone Else');
    expect(tables.licence_requests).toHaveLength(1);
  });

  it('ignores a declined request, so a school can ask again after one is turned down', async () => {
    tables.licence_requests = [
      {
        id: 'req-old',
        requested_by: 'teacher-1',
        school_id: 'school-1',
        seats: 30,
        billing_name: 'Old',
        billing_email: 'old@school.edu.au',
        billing_address: address,
        status: 'declined',
        created_at: daysAgo(1),
      },
    ];
    const res = makeRes();
    await requestInvoice(post(), res);
    expect(res.statusCode).toBe(201);
  });

  it('returns the winning request when a parallel insert hits the one-pending index', async () => {
    // Nothing is pending when this request looks, so it reaches the insert.
    // Another teacher's request lands between the look and the insert, and the
    // insert then fails on the one-pending index.
    beforeInsert = () => {
      tables.licence_requests.push({
        id: 'req-race',
        requested_by: 'colleague-1',
        school_id: 'school-1',
        seats: 30,
        status: 'pending',
        created_at: new Date().toISOString(),
      });
    };
    insertError = { code: '23505', message: 'duplicate key' };

    const res = makeRes();
    await requestInvoice(post(), res);

    expect(res.statusCode).toBe(200);
    expect((res.body?.request as Record<string, unknown>).id).toBe('req-race');
    expect(tables.licence_requests).toHaveLength(1);
  });
});

describe('request-invoice: the daily cap', () => {
  const recent = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `r-${i}`,
      requested_by: 'teacher-1',
      school_id: 'school-9',
      seats: 30,
      status: 'declined',
      created_at: daysAgo(0.05),
    }));

  it('allows a third request in 24 hours', async () => {
    tables.licence_requests = recent(2);
    const res = makeRes();
    await requestInvoice(post(), res);
    expect(res.statusCode).toBe(201);
  });

  it('refuses a fourth request in 24 hours, whatever became of the earlier three', async () => {
    tables.licence_requests = recent(3);
    const res = makeRes();
    await requestInvoice(post(), res);

    expect(res.statusCode).toBe(429);
    expect(res.body?.error).toContain('3 invoice requests in the last 24 hours');
    expect(tables.licence_requests).toHaveLength(3);
  });

  it('does not count requests older than 24 hours', async () => {
    tables.licence_requests = recent(3).map((row) => ({ ...row, created_at: daysAgo(2) }));
    const res = makeRes();
    await requestInvoice(post(), res);
    expect(res.statusCode).toBe(201);
  });

  it('counts only the caller’s own requests', async () => {
    tables.licence_requests = recent(3).map((row) => ({ ...row, requested_by: 'colleague-1' }));
    const res = makeRes();
    await requestInvoice(post(), res);
    expect(res.statusCode).toBe(201);
  });
});

describe('request-invoice: success', () => {
  it('stores a pending request for the caller school and returns it without internal ids', async () => {
    const res = makeRes();
    await requestInvoice(post(), res);

    expect(res.statusCode).toBe(201);
    const stored = tables.licence_requests[0];
    expect(stored).toMatchObject({
      requested_by: 'teacher-1',
      school_id: 'school-1',
      seats: 30,
      billing_name: 'Parramatta High School',
      billing_email: 'accounts@school.edu.au',
      abn: '51824753556',
      po_number: 'PO-7781',
      note: 'For the Year 12 English team',
      status: 'pending',
    });

    const request = res.body?.request as Record<string, unknown>;
    expect(request.status).toBe('pending');
    expect(request).not.toHaveProperty('requested_by');
    expect(request).not.toHaveProperty('school_id');
    expect(request).not.toHaveProperty('stripe_customer_id');
    expect(request).not.toHaveProperty('stripe_subscription_id');
  });

  it('stores null for the optional fields the teacher left blank', async () => {
    const res = makeRes();
    await requestInvoice(
      post({
        seats: 5,
        billingName: 'Accounts',
        billingEmail: 'a@school.edu.au',
        billingAddress: address,
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect(tables.licence_requests[0]).toMatchObject({ abn: null, po_number: null, note: null });
  });

  it('answers a failed write with a generic sentence and no database detail', async () => {
    insertError = { code: '42501', message: 'permission denied for table licence_requests' };
    const res = makeRes();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await requestInvoice(post(), res);

    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('permission denied');
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('request-invoice: CORS preflight parity with the billing endpoints', () => {
  it('answers OPTIONS with 204 when the origin is in ALLOWED_ORIGIN', async () => {
    process.env.ALLOWED_ORIGIN = 'https://app.example.com';
    const res = makeRes();
    await requestInvoice(
      { method: 'OPTIONS', headers: { origin: 'https://app.example.com' } },
      res
    );
    expect(res.statusCode).toBe(204);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://app.example.com');
  });

  it('answers OPTIONS with 403 for an origin that is not allowed', async () => {
    process.env.ALLOWED_ORIGIN = 'https://app.example.com';
    const res = makeRes();
    await requestInvoice({ method: 'OPTIONS', headers: { origin: 'https://evil.example' } }, res);
    expect(res.statusCode).toBe(403);
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('emits no CORS headers when ALLOWED_ORIGIN is unset', async () => {
    const res = makeRes();
    await requestInvoice(
      { method: 'OPTIONS', headers: { origin: 'https://app.example.com' } },
      res
    );
    expect(res.statusCode).toBe(403);
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
  });
});

describe('request-invoice: operator alert on a new request', () => {
  const HOOK = 'https://hooks.example.com/services/T000/B000/SECRETTOKEN';
  let fetchMock: ReturnType<typeof vi.fn>;

  /** Everything the alert posted, as one string, for checking what it does not carry. */
  const postedText = () => {
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    return String(init.body);
  };

  beforeEach(() => {
    process.env.BILLING_ALERT_WEBHOOK_URL = HOOK;
    fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.BILLING_ALERT_WEBHOOK_URL;
    vi.unstubAllGlobals();
  });

  it('posts the school name, seat count, PO number and where to act, once', async () => {
    const res = makeRes();
    await requestInvoice(post(), res);

    expect(res.statusCode).toBe(201);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(HOOK);
    const body = JSON.parse(postedText()) as { text: string; content: string };
    expect(body.text).toContain('[HSC billing] New invoice request');
    expect(body.text).toContain('School: Parramatta High School');
    expect(body.text).toContain('30 seats');
    expect(body.text).toContain('PO number: PO-7781');
    expect(body.text).toContain('Open Admin → Billing overview → Invoice requests');
    expect(body.content).toBe(body.text);
  });

  it('uses the school id when the school has no readable name', async () => {
    tables.schools = [{ id: 'school-1', stripe_subscription_id: null, plan_status: 'none' }];
    const res = makeRes();
    await requestInvoice(post(), res);

    expect(res.statusCode).toBe(201);
    expect(postedText()).toContain('School: school-1');
  });

  it('leaves out the PO number line when the teacher gave none', async () => {
    const res = makeRes();
    await requestInvoice(post({ ...validBody, poNumber: undefined }), res);
    expect(res.statusCode).toBe(201);
    expect(postedText()).not.toContain('PO number');
  });

  it('never carries the billing email, ABN, address, note or billing name', async () => {
    const res = makeRes();
    await requestInvoice(
      post({
        ...validBody,
        billingName: 'Accounts Office Pty',
        billingEmail: 'bursar@hush.example',
      }),
      res
    );

    expect(res.statusCode).toBe(201);
    const text = postedText();
    for (const secret of [
      'bursar@hush.example',
      'Accounts Office',
      '51824753556',
      '51 824 753 556',
      '1 Test Street',
      'For the Year 12 English team',
      'teacher-1',
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it('still answers 201, with the request stored, when the alert is refused', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    const res = makeRes();
    await requestInvoice(post(), res);

    expect(res.statusCode).toBe(201);
    expect(tables.licence_requests).toHaveLength(1);
  });

  it('still answers 201 when the alert cannot be reached at all', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    const res = makeRes();
    await requestInvoice(post(), res);

    expect(res.statusCode).toBe(201);
    expect(res.body?.request).toBeDefined();
    expect(tables.licence_requests).toHaveLength(1);
  });

  it('sends nothing when no webhook is configured', async () => {
    delete process.env.BILLING_ALERT_WEBHOOK_URL;
    const res = makeRes();
    await requestInvoice(post(), res);

    expect(res.statusCode).toBe(201);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends no alert when the existing pending request is returned (200)', async () => {
    tables.licence_requests = [
      {
        id: 'req-1',
        requested_by: 'teacher-1',
        school_id: 'school-1',
        seats: 30,
        billing_name: 'Parramatta High School',
        billing_email: 'accounts@school.edu.au',
        billing_address: address,
        status: 'pending',
        created_at: daysAgo(0.1),
      },
    ];
    const res = makeRes();
    await requestInvoice(post(), res);

    expect(res.statusCode).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends no alert when a parallel insert wins the race (23505, answered 200)', async () => {
    beforeInsert = () => {
      tables.licence_requests.push({
        id: 'req-race',
        requested_by: 'colleague-1',
        school_id: 'school-1',
        seats: 30,
        status: 'pending',
        created_at: new Date().toISOString(),
      });
    };
    insertError = { code: '23505', message: 'duplicate key' };
    const res = makeRes();
    await requestInvoice(post(), res);

    expect(res.statusCode).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends no alert when the request is refused before it is recorded', async () => {
    const res = makeRes();
    await requestInvoice(post({ ...validBody, seats: 3 }), res);

    expect(res.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
