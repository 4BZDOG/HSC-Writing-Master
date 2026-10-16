import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Billing incidents and the customer link (monetisation review §21, §22, §24).
 *
 * An incident records what the webhook found and never changes the plan. The customer
 * link is never overwritten with a different Stripe customer, and the plan is still
 * applied when that happens. Each finding is written once however many times the event
 * is redelivered. The fake database below enforces the one rule the real one does: one
 * OPEN incident per user and kind, and per school and kind.
 */

type Row = Record<string, unknown>;

const db: Record<string, Row[]> = {
  profiles: [],
  subscriptions: [],
  schools: [],
  billing_incidents: [],
};
/** Forces every read and write on one table to fail with this error. */
let failTable: string | null = null;
let failError: Row = { code: '08006', message: 'connection lost' };
/** Forces inserts into billing_incidents to fail with this error (e.g. the table is missing). */
let failIncidentInsert: Row | null = null;

const matchRow = (row: Row, filters: Array<(r: Row) => boolean>) => filters.every((f) => f(row));

const readBuilder = (table: string) => {
  const filters: Array<(r: Row) => boolean> = [];
  const result = () => {
    if (failTable === table) return { data: null, error: failError };
    return { data: (db[table] ?? []).filter((r) => matchRow(r, filters)), error: null };
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
    limit: () => builder,
    maybeSingle: async () => {
      const r = result();
      return { data: r.data?.[0] ?? null, error: r.error };
    },
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve, reject),
  };
  return builder;
};

const updateBuilder = (table: string, values: Row) => {
  const filters: Array<(r: Row) => boolean> = [];
  const apply = () => {
    if (failTable === table) return { data: null, error: failError };
    const hit = (db[table] ?? []).filter((r) => matchRow(r, filters));
    for (const row of hit) Object.assign(row, values);
    return { data: hit.map((r) => ({ id: r.id ?? r.user_id })), error: null };
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
    select: async () => apply(),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(apply()).then(resolve, reject),
  };
  return builder;
};

const insertRow = async (table: string, values: Row) => {
  if (failTable === table) return { error: failError };
  if (table !== 'billing_incidents') {
    db[table].push({ ...values });
    return { error: null };
  }
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
  return { error: null };
};

const upsertRow = async (table: string, values: Row) => {
  if (failTable === table) return { error: failError };
  const existing = db[table].find((r) => r.id === values.id);
  if (existing) Object.assign(existing, values);
  else db[table].push({ ...values });
  return { error: null };
};

const makeSupabase = () => ({
  from: (table: string) => ({
    select: () => readBuilder(table),
    insert: (values: Row) => insertRow(table, values),
    upsert: (values: Row) => upsertRow(table, values),
    update: (values: Row) => updateBuilder(table, values),
  }),
});

vi.mock('../../api/_lib/stripe', () => ({
  priceToPlan: (id: string) =>
    id === 'price_school' ? 'school' : id.startsWith('price_plus') ? 'plus' : 'free',
}));

import {
  checkDuplicateSubscriptions,
  checkSchoolLicenceReplaced,
  recordIncident,
} from '../../api/_lib/billingIncidents';
import { applySubscriptionUpsert, linkStripeCustomer } from '../../api/_lib/subscriptionSync';

const sb = () => makeSupabase() as never;
const incidents = () => db.billing_incidents;

const liveSub = (id: string, userId: string, status = 'active', plan = 'plus') => ({
  id,
  user_id: userId,
  status,
  plan,
  stripe_customer_id: 'cus_1',
  last_event_at: null,
});

const subEvent = (id: string, customer: string, priceId: string, status = 'active') => ({
  id,
  customer,
  status,
  cancel_at_period_end: false,
  items: {
    data: [
      {
        price: { id: priceId },
        quantity: 1,
        current_period_start: 1_700_000_000,
        current_period_end: 1_702_600_000,
      },
    ],
  },
  metadata: { supabase_user_id: 'user-1' },
});

beforeEach(() => {
  for (const table of Object.keys(db)) db[table] = [];
  failTable = null;
  failError = { code: '08006', message: 'connection lost' };
  failIncidentInsert = null;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('recordIncident', () => {
  it('writes one open incident and logs it as an error', async () => {
    const outcome = await recordIncident(sb(), {
      kind: 'customer_mismatch',
      userId: 'user-1',
      detail: 'linked to cus_a; cus_b completed',
    });
    expect(outcome).toBe('recorded');
    expect(incidents()).toHaveLength(1);
    expect(incidents()[0]).toMatchObject({
      kind: 'customer_mismatch',
      user_id: 'user-1',
      resolved_at: null,
    });
    expect(console.error).toHaveBeenCalled();
  });

  it('finds the open incident again on a redelivery and refreshes its list, without a second row', async () => {
    await recordIncident(sb(), {
      kind: 'duplicate_subscription',
      userId: 'user-1',
      subscriptionIds: ['sub_a', 'sub_b'],
      detail: 'two live',
    });
    const again = await recordIncident(sb(), {
      kind: 'duplicate_subscription',
      userId: 'user-1',
      subscriptionIds: ['sub_a', 'sub_b', 'sub_c'],
      detail: 'three live',
    });
    expect(again).toBe('already_open');
    expect(incidents()).toHaveLength(1);
    expect(incidents()[0].subscription_ids).toEqual(['sub_a', 'sub_b', 'sub_c']);
  });

  it('keeps a resolved incident on file and opens a new one when the problem recurs', async () => {
    await recordIncident(sb(), {
      kind: 'duplicate_subscription',
      userId: 'user-1',
      subscriptionIds: ['sub_a', 'sub_b'],
      detail: 'first',
    });
    incidents()[0].resolved_at = new Date().toISOString();
    const outcome = await recordIncident(sb(), {
      kind: 'duplicate_subscription',
      userId: 'user-1',
      subscriptionIds: ['sub_a', 'sub_c'],
      detail: 'second',
    });
    expect(outcome).toBe('recorded');
    expect(incidents()).toHaveLength(2);
  });

  it('reports "unavailable" and does not throw when the table is missing (schema §13 not re-applied)', async () => {
    failIncidentInsert = {
      code: '42P01',
      message: 'relation "public.billing_incidents" does not exist',
    };
    await expect(
      recordIncident(sb(), { kind: 'customer_mismatch', userId: 'user-1', detail: 'x' })
    ).resolves.toBe('unavailable');
  });

  it('reports "unavailable" and does not throw when the write itself throws', async () => {
    const broken = {
      from: () => ({ insert: async () => Promise.reject(new Error('socket hang up')) }),
    };
    await expect(
      recordIncident(broken as never, { kind: 'customer_mismatch', userId: 'user-1', detail: 'x' })
    ).resolves.toBe('unavailable');
  });
});

describe('checkDuplicateSubscriptions', () => {
  it('records one incident naming both subscriptions when a user holds two live ones', async () => {
    db.subscriptions.push(liveSub('sub_a', 'user-1'), liveSub('sub_b', 'user-1', 'past_due'));
    await checkDuplicateSubscriptions(sb(), 'user-1');

    expect(incidents()).toHaveLength(1);
    expect(incidents()[0]).toMatchObject({ kind: 'duplicate_subscription', user_id: 'user-1' });
    expect(incidents()[0].subscription_ids).toEqual(['sub_a', 'sub_b']);
    expect(String(incidents()[0].detail)).toContain('Nothing has been cancelled or refunded');
  });

  it('does not record a second incident when the same event is redelivered', async () => {
    db.subscriptions.push(liveSub('sub_a', 'user-1'), liveSub('sub_b', 'user-1'));
    await checkDuplicateSubscriptions(sb(), 'user-1');
    await checkDuplicateSubscriptions(sb(), 'user-1');
    expect(incidents()).toHaveLength(1);
  });

  it('records nothing for one live subscription, or for a cancelled one beside it', async () => {
    db.subscriptions.push(liveSub('sub_a', 'user-1'), liveSub('sub_old', 'user-1', 'canceled'));
    await checkDuplicateSubscriptions(sb(), 'user-1');
    expect(incidents()).toHaveLength(0);
  });

  it('never throws when the count cannot be read', async () => {
    failTable = 'subscriptions';
    await expect(checkDuplicateSubscriptions(sb(), 'user-1')).resolves.toBeUndefined();
    expect(incidents()).toHaveLength(0);
  });
});

describe('checkSchoolLicenceReplaced', () => {
  it('records an incident when a school licence is replaced while the one it held is still live', async () => {
    db.schools.push({ id: 'school-1', stripe_subscription_id: 'sub_a' });
    db.subscriptions.push(liveSub('sub_a', 'teacher-1', 'active', 'school'));
    await checkSchoolLicenceReplaced(sb(), {
      schoolId: 'school-1',
      purchaserId: 'teacher-2',
      subscriptionId: 'sub_b',
    });

    expect(incidents()).toHaveLength(1);
    expect(incidents()[0]).toMatchObject({
      kind: 'duplicate_school_licence',
      school_id: 'school-1',
      user_id: 'teacher-2',
    });
    expect(incidents()[0].subscription_ids).toEqual(['sub_a', 'sub_b']);
  });

  it('replaces a cancelled licence quietly', async () => {
    db.schools.push({ id: 'school-1', stripe_subscription_id: 'sub_a' });
    db.subscriptions.push(liveSub('sub_a', 'teacher-1', 'canceled', 'school'));
    await checkSchoolLicenceReplaced(sb(), {
      schoolId: 'school-1',
      purchaserId: 'teacher-2',
      subscriptionId: 'sub_b',
    });
    expect(incidents()).toHaveLength(0);
  });

  it('does nothing when the school already names this subscription', async () => {
    db.schools.push({ id: 'school-1', stripe_subscription_id: 'sub_a' });
    db.subscriptions.push(liveSub('sub_a', 'teacher-1', 'active', 'school'));
    await checkSchoolLicenceReplaced(sb(), {
      schoolId: 'school-1',
      purchaserId: 'teacher-1',
      subscriptionId: 'sub_a',
    });
    expect(incidents()).toHaveLength(0);
  });

  it('never throws when the school cannot be read', async () => {
    failTable = 'schools';
    await expect(
      checkSchoolLicenceReplaced(sb(), {
        schoolId: 'school-1',
        purchaserId: 'teacher-2',
        subscriptionId: 'sub_b',
      })
    ).resolves.toBeUndefined();
  });
});

describe('operator alert on a new incident', () => {
  const HOOK = 'https://hooks.example.com/services/T000/B000/SECRETTOKEN';
  let fetchMock: ReturnType<typeof vi.fn>;

  const postedBody = (call = 0) =>
    JSON.parse(String((fetchMock.mock.calls[call][1] as RequestInit).body)) as {
      text: string;
      content: string;
    };

  beforeEach(() => {
    process.env.BILLING_ALERT_WEBHOOK_URL = HOOK;
    fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    delete process.env.BILLING_ALERT_WEBHOOK_URL;
    vi.unstubAllGlobals();
  });

  it('alerts once when a new incident is recorded, naming its kind and school', async () => {
    const outcome = await recordIncident(sb(), {
      kind: 'duplicate_school_licence',
      userId: 'teacher-2',
      schoolId: 'school-1',
      subscriptionIds: ['sub_a', 'sub_b'],
      detail: 'Both are billed. Nothing has been cancelled or refunded.',
    });

    expect(outcome).toBe('recorded');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(HOOK);
    const body = postedBody();
    expect(body.text).toBe(
      '[HSC billing] New billing incident\n' +
        'Kind: duplicate_school_licence\n' +
        'School: school-1\n' +
        'Open Admin → Billing overview.'
    );
    expect(body.content).toBe(body.text);
  });

  it('leaves out the school line for an account-level incident, and carries no account detail', async () => {
    db.subscriptions.push(liveSub('sub_a', 'user-1'), liveSub('sub_b', 'user-1'));
    await checkDuplicateSubscriptions(sb(), 'user-1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const text = postedBody().text;
    expect(text).toContain('Kind: duplicate_subscription');
    expect(text).not.toContain('School:');
    for (const secret of ['user-1', 'sub_a', 'sub_b', 'Nothing has been cancelled']) {
      expect(text).not.toContain(secret);
    }
  });

  it('sends no alert when an open incident of this kind is found again', async () => {
    await recordIncident(sb(), { kind: 'customer_mismatch', userId: 'user-1', detail: 'x' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockClear();

    const again = await recordIncident(sb(), {
      kind: 'customer_mismatch',
      userId: 'user-1',
      detail: 'x',
    });
    expect(again).toBe('already_open');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('alerts once across a redelivered duplicate-subscription event', async () => {
    db.subscriptions.push(liveSub('sub_a', 'user-1'), liveSub('sub_b', 'user-1'));
    await checkDuplicateSubscriptions(sb(), 'user-1');
    await checkDuplicateSubscriptions(sb(), 'user-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends no alert when the incident could not be written', async () => {
    failIncidentInsert = {
      code: '42P01',
      message: 'relation "public.billing_incidents" does not exist',
    };
    const outcome = await recordIncident(sb(), {
      kind: 'customer_mismatch',
      userId: 'user-1',
      detail: 'x',
    });
    expect(outcome).toBe('unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still records the incident, and returns the same outcome, when the alert is refused', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    const outcome = await recordIncident(sb(), {
      kind: 'customer_mismatch',
      userId: 'user-1',
      detail: 'x',
    });
    expect(outcome).toBe('recorded');
    expect(incidents()).toHaveLength(1);
  });

  it('records the incident and sends nothing when no webhook is configured', async () => {
    delete process.env.BILLING_ALERT_WEBHOOK_URL;
    const outcome = await recordIncident(sb(), {
      kind: 'customer_mismatch',
      userId: 'user-1',
      detail: 'x',
    });
    expect(outcome).toBe('recorded');
    expect(incidents()).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('linkStripeCustomer', () => {
  it('links a profile that has no customer yet', async () => {
    db.profiles.push({ id: 'user-1', stripe_customer_id: null });
    await expect(linkStripeCustomer(sb(), 'user-1', 'cus_1')).resolves.toBe('linked');
    expect(db.profiles[0].stripe_customer_id).toBe('cus_1');
  });

  it('reports "already" when the profile already holds this customer', async () => {
    db.profiles.push({ id: 'user-1', stripe_customer_id: 'cus_1' });
    await expect(linkStripeCustomer(sb(), 'user-1', 'cus_1')).resolves.toBe('already');
    expect(incidents()).toHaveLength(0);
  });

  it('does not replace a different customer, and records the mismatch', async () => {
    db.profiles.push({ id: 'user-1', stripe_customer_id: 'cus_old' });
    await expect(linkStripeCustomer(sb(), 'user-1', 'cus_new')).resolves.toBe('mismatch');

    expect(db.profiles[0].stripe_customer_id).toBe('cus_old');
    expect(incidents()).toHaveLength(1);
    expect(incidents()[0]).toMatchObject({ kind: 'customer_mismatch', user_id: 'user-1' });
    expect(String(incidents()[0].detail)).toContain('cus_old');
  });

  it('does nothing for a user id with no profile, as before', async () => {
    await expect(linkStripeCustomer(sb(), 'ghost', 'cus_1')).resolves.toBe('no_profile');
    expect(incidents()).toHaveLength(0);
  });

  it('throws on a write error, so the caller can retry', async () => {
    db.profiles.push({ id: 'user-1', stripe_customer_id: null });
    failTable = 'profiles';
    await expect(linkStripeCustomer(sb(), 'user-1', 'cus_1')).rejects.toEqual(failError);
  });
});

describe('applySubscriptionUpsert: incidents never change the plan', () => {
  it('applies a second live subscription and records the duplicate', async () => {
    db.profiles.push({
      id: 'user-1',
      stripe_customer_id: 'cus_1',
      school_id: null,
      stripe_plan: 'plus',
    });
    db.subscriptions.push(liveSub('sub_old', 'user-1'));

    await applySubscriptionUpsert(
      sb(),
      subEvent('sub_new', 'cus_1', 'price_plus_yearly') as never,
      1_700_000_100
    );

    expect(db.subscriptions.find((s) => s.id === 'sub_new')).toBeDefined();
    expect(db.profiles[0].stripe_plan).toBe('plus');
    expect(incidents()).toHaveLength(1);
    expect(incidents()[0].kind).toBe('duplicate_subscription');
  });

  it('keeps the customer already linked and still grants the plan when a different customer completes a purchase', async () => {
    db.profiles.push({
      id: 'user-1',
      stripe_customer_id: 'cus_old',
      school_id: null,
      stripe_plan: 'free',
    });

    await applySubscriptionUpsert(
      sb(),
      subEvent('sub_new', 'cus_new', 'price_plus_monthly') as never,
      1_700_000_100
    );

    expect(db.profiles[0].stripe_customer_id).toBe('cus_old');
    expect(db.profiles[0].stripe_plan).toBe('plus');
    expect(incidents().map((i) => i.kind)).toEqual(['customer_mismatch']);
  });

  it('records a school licence replaced while live, and still writes the school row to the new subscription', async () => {
    db.profiles.push({
      id: 'teacher-2',
      stripe_customer_id: 'cus_2',
      school_id: 'school-1',
      stripe_plan: 'free',
    });
    db.schools.push({ id: 'school-1', stripe_subscription_id: 'sub_a', plan_status: 'active' });
    db.subscriptions.push(liveSub('sub_a', 'teacher-1', 'active', 'school'));

    await applySubscriptionUpsert(
      sb(),
      subEvent('sub_b', 'cus_2', 'price_school') as never,
      1_700_000_100
    );

    expect(incidents().map((i) => i.kind)).toEqual(['duplicate_school_licence']);
    expect(db.schools[0].stripe_subscription_id).toBe('sub_b');
    expect(db.profiles[0].stripe_plan).toBe('school');
  });
});
