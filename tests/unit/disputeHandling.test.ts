import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Payment disputes and full refunds (schema §29, api/_lib/disputes.ts).
 *
 * The webhook records a dispute or a full refund, alerts the operator, and never acts on
 * it: no cancellation, no refund, no plan or licence write. Each case below pins one part
 * of that. The fake database enforces the one rule the real one does: one OPEN incident
 * per user and kind, and per school and kind. A redelivered event leaves one row and sends
 * one alert, and a failed lookup never fails the event.
 */

type Row = Record<string, unknown>;
interface Write {
  table: string;
  op: 'insert' | 'update';
  values: Row;
}

const db: Record<string, Row[]> = {
  profiles: [],
  subscriptions: [],
  schools: [],
  billing_incidents: [],
  stripe_events: [],
};
const writes: Write[] = [];
/** Forces every read and write on one table to fail with this error. */
let failTable: string | null = null;
/** Forces inserts into billing_incidents to fail (e.g. the table is missing). */
let failIncidentInsert: Row | null = null;
/** Forces stripe.charges.retrieve to reject. */
let retrieveError: Error | null = null;
/** The charges Stripe knows about, by id. */
let charges: Record<string, Row> = {};

const failure = { code: '08006', message: 'connection lost' };
const PLAN_TABLES = ['profiles', 'subscriptions', 'schools'];

type Filter = (r: Row) => boolean;

const selectBuilder = (table: string) => {
  const filters: Filter[] = [];
  let max: number | null = null;
  const run = () => {
    if (failTable === table) return { data: null, error: failure };
    let rows = (db[table] ?? []).filter((r) => filters.every((f) => f(r)));
    if (max !== null) rows = rows.slice(0, max);
    return { data: rows.map((r) => ({ ...r })), error: null };
  };
  const builder = {
    eq: (col: string, val: unknown) => {
      filters.push((r) => r[col] === val);
      return builder;
    },
    in: (col: string, vals: unknown[]) => {
      filters.push((r) => vals.includes(r[col]));
      return builder;
    },
    is: (col: string, val: unknown) => {
      filters.push((r) => (r[col] ?? null) === val);
      return builder;
    },
    contains: (col: string, vals: unknown[]) => {
      filters.push((r) => {
        const held = (r[col] as unknown[] | undefined) ?? [];
        return vals.every((v) => held.includes(v));
      });
      return builder;
    },
    limit: (n: number) => {
      max = n;
      return builder;
    },
    maybeSingle: async () => {
      const r = run();
      return { data: r.data?.[0] ?? null, error: r.error };
    },
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(run()).then(resolve, reject),
  };
  return builder;
};

const updateBuilder = (table: string, values: Row) => {
  const filters: Filter[] = [];
  const run = () => {
    if (failTable === table) return { data: null, error: failure };
    const hit = (db[table] ?? []).filter((r) => filters.every((f) => f(r)));
    for (const row of hit) Object.assign(row, values);
    writes.push({ table, op: 'update', values });
    return { data: hit.map((r) => ({ id: r.id })), error: null };
  };
  const builder = {
    eq: (col: string, val: unknown) => {
      filters.push((r) => r[col] === val);
      return builder;
    },
    is: (col: string, val: unknown) => {
      filters.push((r) => (r[col] ?? null) === val);
      return builder;
    },
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(run()).then(resolve, reject),
  };
  return builder;
};

const insertRow = async (table: string, values: Row) => {
  if (table === 'billing_incidents') {
    if (failIncidentInsert) return { error: failIncidentInsert };
    const clash = db.billing_incidents.some(
      (row) =>
        row.resolved_at == null &&
        row.kind === values.kind &&
        ((values.user_id != null && row.user_id === values.user_id) ||
          (values.school_id != null && row.school_id === values.school_id))
    );
    if (clash) return { error: { code: '23505', message: 'duplicate key' } };
    db.billing_incidents.push({
      id: `inc_${db.billing_incidents.length + 1}`,
      ...values,
      resolved_at: null,
    });
    writes.push({ table, op: 'insert', values });
    return { error: null };
  }
  if (table === 'stripe_events') {
    if (db.stripe_events.some((r) => r.id === values.id)) {
      return { error: { code: '23505', message: 'duplicate key' } };
    }
    db.stripe_events.push({ ...values });
    return { error: null };
  }
  if (failTable === table) return { error: failure };
  db[table].push({ ...values });
  writes.push({ table, op: 'insert', values });
  return { error: null };
};

const makeSupabase = () => ({
  from: (table: string) => ({
    select: () => selectBuilder(table),
    insert: (values: Row) => insertRow(table, values),
    update: (values: Row) => updateBuilder(table, values),
    delete: () => ({ eq: async () => ({ error: null }) }),
  }),
  rpc: async () => ({ data: null, error: null }),
});

const stripeFake = {
  charges: {
    retrieve: vi.fn(async (id: string) => {
      if (retrieveError) throw retrieveError;
      return charges[id] ?? { id, customer: null };
    }),
  },
};

vi.mock('../../api/_lib/stripe', () => ({
  getStripe: () => stripeFake as unknown,
  isStripeConfigured: () => true,
  getSupabaseAdmin: () => makeSupabase(),
  priceToPlan: (id: string) => (id === 'price_school' ? 'school' : 'plus'),
  isProductionRuntime: () => false,
  isDeployedRuntime: () => false,
}));

import {
  handleChargeRefunded,
  handleDisputeClosed,
  handleDisputeCreated,
} from '../../api/_lib/disputes';

const sb = () => makeSupabase() as never;
const stripe = () => stripeFake as never;
const incidents = () => db.billing_incidents;
const planWrites = () => writes.filter((w) => PLAN_TABLES.includes(w.table));

const HOOK = 'https://hooks.example.com/services/T000/B000/SECRETTOKEN';
let fetchMock: ReturnType<typeof vi.fn>;
/** The text of every alert sent, in order. */
const alertTexts = () =>
  fetchMock.mock.calls.map(
    (call) => (JSON.parse(String((call[1] as RequestInit).body)) as { text: string }).text
  );

/** 2 a.m. UTC on 3 November 2026 is 1 p.m. in Sydney, so the date reads the same everywhere. */
const DUE_BY = Date.UTC(2026, 10, 3, 2, 0, 0) / 1000;

const dispute = (over: Row = {}): Row => ({
  id: 'dp_1',
  object: 'dispute',
  amount: 4900,
  currency: 'aud',
  charge: 'ch_1',
  reason: 'fraudulent',
  status: 'needs_response',
  evidence_details: { due_by: DUE_BY, has_evidence: false },
  ...over,
});

const refundedCharge = (over: Row = {}): Row => ({
  id: 'ch_1',
  object: 'charge',
  amount: 4900,
  amount_refunded: 4900,
  currency: 'aud',
  customer: 'cus_1',
  refunded: true,
  ...over,
});

const linkedProfile = (over: Row = {}): Row => ({
  id: 'user-1',
  stripe_customer_id: 'cus_1',
  school_id: null,
  stripe_plan: 'plus',
  ...over,
});

beforeEach(() => {
  for (const table of Object.keys(db)) db[table] = [];
  writes.length = 0;
  failTable = null;
  failIncidentInsert = null;
  retrieveError = null;
  charges = {};
  stripeFake.charges.retrieve.mockClear();
  delete process.env.STRIPE_WEBHOOK_SECRET;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  process.env.BILLING_ALERT_WEBHOOK_URL = HOOK;
  fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  delete process.env.BILLING_ALERT_WEBHOOK_URL;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // Whatever happened above, no plan or licence row was written.
  expect(planWrites()).toEqual([]);
});

describe('charge.dispute.created', () => {
  it('records a dispute for a known user, with its amount, reason, status, deadline and ids', async () => {
    db.profiles.push(linkedProfile());
    charges.ch_1 = { id: 'ch_1', customer: 'cus_1' };

    await handleDisputeCreated(sb(), stripe(), dispute());

    expect(incidents()).toHaveLength(1);
    expect(incidents()[0]).toMatchObject({
      kind: 'dispute',
      user_id: 'user-1',
      school_id: null,
      subscription_ids: ['dp_1'],
      resolved_at: null,
    });
    const detail = String(incidents()[0].detail);
    expect(detail).toContain('$49.00');
    expect(detail).toContain('reason fraudulent');
    expect(detail).toContain('status needs_response');
    expect(detail).toContain('Evidence due 3 November 2026');
    expect(detail).toContain('dp_1');
    expect(detail).toContain('ch_1');
    expect(detail).toContain('Nothing has been cancelled, refunded or changed.');
  });

  it('alerts the operator once, with the deadline in the message', async () => {
    db.profiles.push(linkedProfile());
    charges.ch_1 = { id: 'ch_1', customer: 'cus_1' };

    await handleDisputeCreated(sb(), stripe(), dispute());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(HOOK);
    expect(alertTexts()[0]).toBe(
      '[HSC billing] Payment dispute opened\n' +
        '$49.00\n' +
        'Reason: fraudulent\n' +
        'Respond in Stripe by 3 November 2026\n' +
        'Open Admin → Billing overview.'
    );
  });

  it('records a dispute for a school purchaser, and names the school', async () => {
    db.profiles.push(linkedProfile({ id: 'teacher-1', stripe_customer_id: 'cus_t' }));
    db.subscriptions.push({ id: 'sub_school', user_id: 'teacher-1', stripe_customer_id: 'cus_t' });
    db.schools.push({ id: 'school-1', stripe_subscription_id: 'sub_school' });
    charges.ch_1 = { id: 'ch_1', customer: 'cus_t' };

    await handleDisputeCreated(sb(), stripe(), dispute());

    expect(incidents()).toHaveLength(1);
    expect(incidents()[0]).toMatchObject({
      kind: 'dispute',
      user_id: 'teacher-1',
      school_id: 'school-1',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still records an unknown customer, with no owner, and alerts', async () => {
    charges.ch_1 = { id: 'ch_1', customer: null };

    await handleDisputeCreated(sb(), stripe(), dispute());

    expect(incidents()).toHaveLength(1);
    expect(incidents()[0]).toMatchObject({ kind: 'dispute', user_id: null, school_id: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still records the dispute when the charge cannot be retrieved, and does not throw', async () => {
    retrieveError = new Error('No such charge: ch_1');
    db.profiles.push(linkedProfile());

    await expect(handleDisputeCreated(sb(), stripe(), dispute())).resolves.toBeUndefined();

    expect(incidents()).toHaveLength(1);
    expect(incidents()[0]).toMatchObject({ kind: 'dispute', user_id: null });
    expect(String(incidents()[0].detail)).toContain('$49.00');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still alerts when the incident cannot be written (schema §13 not applied)', async () => {
    failIncidentInsert = {
      code: '42P01',
      message: 'relation "public.billing_incidents" does not exist',
    };
    charges.ch_1 = { id: 'ch_1', customer: null };

    await handleDisputeCreated(sb(), stripe(), dispute());

    expect(incidents()).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(alertTexts()[0]).toContain('Payment dispute opened');
    expect(alertTexts()[0]).toContain('Respond in Stripe by 3 November 2026');
  });

  it('sends exactly one alert when the incident is recorded, not the generic one as well', async () => {
    charges.ch_1 = { id: 'ch_1', customer: null };

    await handleDisputeCreated(sb(), stripe(), dispute());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(alertTexts()[0]).toContain('Payment dispute opened');
    expect(alertTexts().join('\n')).not.toContain('New billing incident');
  });

  it('sends no alert and writes no second row when the same dispute is redelivered', async () => {
    db.profiles.push(linkedProfile());
    charges.ch_1 = { id: 'ch_1', customer: 'cus_1' };

    await handleDisputeCreated(sb(), stripe(), dispute());
    await handleDisputeCreated(sb(), stripe(), dispute());

    expect(incidents()).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('dedupes a redelivered dispute with no owner by its dispute id', async () => {
    charges.ch_1 = { id: 'ch_1', customer: null };

    await handleDisputeCreated(sb(), stripe(), dispute());
    await handleDisputeCreated(sb(), stripe(), dispute());

    expect(incidents()).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('adds a second dispute for the same user to the open row, and alerts for it too', async () => {
    db.profiles.push(linkedProfile());
    charges.ch_1 = { id: 'ch_1', customer: 'cus_1' };
    charges.ch_2 = { id: 'ch_2', customer: 'cus_1' };

    await handleDisputeCreated(sb(), stripe(), dispute());
    await handleDisputeCreated(
      sb(),
      stripe(),
      dispute({ id: 'dp_2', charge: 'ch_2', amount: 1200, reason: 'duplicate' })
    );

    expect(incidents()).toHaveLength(1);
    expect(incidents()[0].subscription_ids).toEqual(['dp_1', 'dp_2']);
    expect(String(incidents()[0].detail)).toContain('dp_2');
    expect(String(incidents()[0].detail)).toContain('$12.00');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(alertTexts()[1]).toContain('Payment dispute opened');
  });

  it('keeps the alert text free of personal details and account identifiers', async () => {
    db.profiles.push(linkedProfile({ id: 'user-1' }));
    db.subscriptions.push({ id: 'sub_school', user_id: 'user-1', stripe_customer_id: 'cus_1' });
    db.schools.push({ id: 'school-1', stripe_subscription_id: 'sub_school' });
    charges.ch_1 = { id: 'ch_1', customer: 'cus_1' };

    await handleDisputeCreated(sb(), stripe(), dispute());

    const text = alertTexts()[0];
    for (const secret of ['user-1', 'school-1', 'sub_school', 'cus_1', 'ch_1', 'dp_1', '@']) {
      expect(text).not.toContain(secret);
    }
  });
});

describe('charge.dispute.closed', () => {
  const openDispute = async () => {
    charges.ch_1 = { id: 'ch_1', customer: null };
    await handleDisputeCreated(sb(), stripe(), dispute());
    fetchMock.mockClear();
  };

  it('resolves the open incident when the dispute is won', async () => {
    await openDispute();

    await handleDisputeClosed(sb(), dispute({ status: 'won' }));

    expect(incidents()[0].resolved_at).not.toBeNull();
    expect(incidents()[0].resolution_note).toBe('Dispute won');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the incident open on a lost dispute, says the funds were withdrawn, and alerts', async () => {
    await openDispute();

    await handleDisputeClosed(sb(), dispute({ status: 'lost' }));

    expect(incidents()[0].resolved_at).toBeNull();
    expect(String(incidents()[0].detail)).toContain('Dispute lost: the funds were withdrawn');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(alertTexts()[0]).toContain('Payment dispute lost');
  });

  it('resolves on any other closing status, with that status as the note', async () => {
    await openDispute();

    await handleDisputeClosed(sb(), dispute({ status: 'warning_closed' }));

    expect(incidents()[0].resolved_at).not.toBeNull();
    expect(incidents()[0].resolution_note).toBe('warning_closed');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the row open for a second dispute still pending on it', async () => {
    db.profiles.push(linkedProfile());
    charges.ch_1 = { id: 'ch_1', customer: 'cus_1' };
    charges.ch_2 = { id: 'ch_2', customer: 'cus_1' };
    await handleDisputeCreated(sb(), stripe(), dispute());
    await handleDisputeCreated(sb(), stripe(), dispute({ id: 'dp_2', charge: 'ch_2' }));

    await handleDisputeClosed(sb(), dispute({ status: 'won' }));

    expect(incidents()[0].resolved_at).toBeNull();
    expect(incidents()[0].subscription_ids).toEqual(['dp_2']);
  });

  it('does nothing when no open incident names the dispute', async () => {
    await handleDisputeClosed(sb(), dispute({ status: 'won' }));

    expect(incidents()).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws when the incident cannot be read, so Stripe retries the close', async () => {
    await openDispute();
    failTable = 'billing_incidents';

    await expect(handleDisputeClosed(sb(), dispute({ status: 'won' }))).rejects.toEqual(failure);
  });
});

describe('charge.refunded', () => {
  it('records a full refund for a known customer, and says access is unchanged', async () => {
    db.profiles.push(linkedProfile());

    await handleChargeRefunded(sb(), refundedCharge());

    expect(incidents()).toHaveLength(1);
    expect(incidents()[0]).toMatchObject({ kind: 'refund', user_id: 'user-1' });
    const detail = String(incidents()[0].detail);
    expect(detail).toContain('ch_1');
    expect(detail).toContain('$49.00');
    expect(detail).toContain('Access is unchanged.');
    expect(detail).toContain('Cancel the subscription in Stripe if this refund ends the licence.');
  });

  it('alerts once for a full refund', async () => {
    await handleChargeRefunded(sb(), refundedCharge({ customer: null }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(alertTexts()[0]).toContain('Payment refunded in full');
    expect(alertTexts()[0]).toContain('$49.00');
  });

  it('ignores a partial refund: no incident, no alert', async () => {
    db.profiles.push(linkedProfile());

    await handleChargeRefunded(sb(), refundedCharge({ refunded: false, amount_refunded: 1000 }));

    expect(incidents()).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('partial refund'));
  });

  it('sends no alert when the same full refund is redelivered', async () => {
    await handleChargeRefunded(sb(), refundedCharge({ customer: null }));
    await handleChargeRefunded(sb(), refundedCharge({ customer: null }));

    expect(incidents()).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still alerts when the incident cannot be written', async () => {
    failIncidentInsert = { code: '42P01', message: 'relation does not exist' };

    await handleChargeRefunded(sb(), refundedCharge({ customer: null }));

    expect(incidents()).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(alertTexts()[0]).toContain('Payment refunded in full');
  });

  it('keeps the refund alert free of personal details and account identifiers', async () => {
    db.profiles.push(linkedProfile());

    await handleChargeRefunded(sb(), refundedCharge());

    const text = alertTexts()[0];
    for (const secret of ['user-1', 'cus_1', 'ch_1', '@']) {
      expect(text).not.toContain(secret);
    }
  });
});

describe('the webhook routes these events (api/stripe-webhook.ts)', () => {
  // Imported here, after the mocks above, so the handler reads the same fakes.
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

  it('records a dispute delivered to the handler, acknowledges it, and marks the event processed', async () => {
    const { default: handler } = await import('../../api/stripe-webhook');
    db.profiles.push(linkedProfile());
    charges.ch_1 = { id: 'ch_1', customer: 'cus_1' };
    const res = makeRes();

    await handler(
      {
        method: 'POST',
        headers: {},
        body: {
          id: 'evt_dispute_1',
          created: 1_700_000_500,
          type: 'charge.dispute.created',
          data: { object: dispute() },
        },
      },
      res
    );

    expect(res.statusCode).toBe(200);
    expect(incidents()).toHaveLength(1);
    expect(incidents()[0].kind).toBe('dispute');
    expect(db.stripe_events[0]).toMatchObject({ id: 'evt_dispute_1' });
    expect(db.stripe_events[0].processed_at).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('acknowledges a partial refund without recording anything', async () => {
    const { default: handler } = await import('../../api/stripe-webhook');
    const res = makeRes();

    await handler(
      {
        method: 'POST',
        headers: {},
        body: {
          id: 'evt_refund_partial',
          created: 1_700_000_500,
          type: 'charge.refunded',
          data: { object: refundedCharge({ refunded: false, amount_refunded: 500 }) },
        },
      },
      res
    );

    expect(res.statusCode).toBe(200);
    expect(incidents()).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
