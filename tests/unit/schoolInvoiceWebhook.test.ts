import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The webhook must license a school bought on an invoice WITHOUT any change to
 * api/stripe-webhook.ts. An invoiced subscription differs from a card one in
 * one way that matters here: the customer is not yet linked to the requester's
 * profile when `customer.subscription.created` arrives, because the request
 * approval only links it after creating it. The webhook's existing fallback is
 * `subscription.metadata.supabase_user_id`, which the approval sets. This test
 * sends the event the way Stripe would for a send_invoice subscription, and
 * checks the school row comes out synced.
 *
 * Only Stripe and Supabase are doubled. The real priceToPlan runs, so the
 * school price is recognised the same way it is in production.
 */

type Row = Record<string, unknown>;
interface Write {
  table: string;
  values: Row;
  filter?: [string, unknown];
  upsert?: boolean;
}

/** Every write the webhook makes, in order. */
let writes: Write[] = [];
/** Profiles the webhook can look up. */
let profiles: Row[] = [];
/** Subscription rows, for the ordering guard. */
let subscriptionRows: Row[] = [];

const lookup = (table: string, column: string, value: unknown): Row | null => {
  if (table === 'profiles') {
    return profiles.find((p) => p[column] === value) ?? null;
  }
  if (table === 'subscriptions') {
    return subscriptionRows.find((s) => s[column] === value) ?? null;
  }
  return null;
};

const fakeSupabase = {
  from: (table: string) => ({
    insert: async () => ({ error: null }),
    delete: () => ({ eq: async () => ({ error: null }) }),
    select: (columns: string) => ({
      eq: (column: string, value: unknown) => {
        const found = () => {
          const row = lookup(table, column, value);
          if (!row) return null;
          // Return only the requested columns, as Postgres would.
          const wanted = columns.split(',').map((c) => c.trim());
          return Object.fromEntries(wanted.map((c) => [c, row[c] ?? null]));
        };
        return {
          maybeSingle: async () => ({ data: found(), error: null }),
          single: async () => ({ data: found(), error: null }),
        };
      },
    }),
    update: (values: Row) => ({
      eq: async (column: string, value: unknown) => {
        writes.push({ table, values, filter: [column, value] });
        return { error: null };
      },
    }),
    upsert: async (values: Row) => {
      writes.push({ table, values, upsert: true });
      return { error: null };
    },
  }),
  rpc: async () => ({ data: 'free', error: null }),
};

vi.mock('../../api/_lib/stripe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/_lib/stripe')>();
  return {
    ...actual,
    getSupabaseAdmin: () => fakeSupabase,
    getStripe: () => ({ subscriptions: { retrieve: vi.fn() } }),
    isStripeConfigured: () => true,
  };
});

import webhook from '../../api/stripe-webhook';

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

/** The subscription object Stripe sends for an invoiced school licence. */
const invoicedSubscription = (overrides: Row = {}): Row => ({
  id: 'sub_invoice_1',
  object: 'subscription',
  customer: 'cus_new_for_school',
  status: 'active',
  collection_method: 'send_invoice',
  cancel_at_period_end: false,
  current_period_start: 1_790_000_000,
  current_period_end: 1_792_592_000,
  latest_invoice: 'in_1',
  metadata: {
    supabase_user_id: 'teacher-1',
    school_id: 'school-1',
    licence_request_id: '6f1c2a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b',
  },
  items: {
    data: [
      {
        price: { id: 'price_school' },
        quantity: 30,
        current_period_start: 1_790_000_000,
        current_period_end: 1_792_592_000,
      },
    ],
  },
  ...overrides,
});

const subscriptionCreatedEvent = (subscription: Row) => ({
  id: 'evt_invoice_created',
  type: 'customer.subscription.created',
  created: 1_790_000_100,
  data: { object: subscription },
});

const makeReq = (body: unknown) => ({ method: 'POST', headers: {}, body });

beforeEach(() => {
  writes = [];
  // The approval has created the customer but not yet linked it: the profile
  // has no stripe_customer_id, so the webhook must find the requester through
  // the subscription metadata.
  profiles = [{ id: 'teacher-1', school_id: 'school-1', stripe_customer_id: null }];
  subscriptionRows = [];
  process.env.STRIPE_SCHOOL_PRICE_ID = 'price_school';
  process.env.STRIPE_PLUS_MONTHLY_PRICE_ID = 'price_plus_monthly';
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.VERCEL_ENV;
  delete process.env.STRIPE_PLUS_YEARLY_PRICE_ID;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('webhook: an invoiced school licence needs no webhook change', () => {
  it('syncs the school row from the invoiced subscription, with the seats and the live status', async () => {
    const res = makeRes();
    await webhook(makeReq(subscriptionCreatedEvent(invoicedSubscription())), res);

    expect(res.statusCode).toBe(200);
    const schoolWrite = writes.find((w) => w.table === 'schools');
    expect(schoolWrite).toBeDefined();
    expect(schoolWrite?.filter).toEqual(['id', 'school-1']);
    expect(schoolWrite?.values).toMatchObject({
      stripe_subscription_id: 'sub_invoice_1',
      plan_seats: 30,
      plan_status: 'active',
      plan_cancel_at_period_end: false,
    });
  });

  it('links the new customer to the requester, through the subscription metadata', async () => {
    await webhook(makeReq(subscriptionCreatedEvent(invoicedSubscription())), makeRes());

    const link = writes.find((w) => w.table === 'profiles' && 'stripe_customer_id' in w.values);
    expect(link?.values).toEqual({ stripe_customer_id: 'cus_new_for_school' });
    expect(link?.filter).toEqual(['id', 'teacher-1']);
  });

  it('gives the requester the school plan on their own profile', async () => {
    await webhook(makeReq(subscriptionCreatedEvent(invoicedSubscription())), makeRes());

    const planWrite = writes.find((w) => w.table === 'profiles' && 'stripe_plan' in w.values);
    expect(planWrite?.values.stripe_plan).toBe('school');
  });

  it('records the subscription as a school plan with the requester as its owner', async () => {
    await webhook(makeReq(subscriptionCreatedEvent(invoicedSubscription())), makeRes());

    const subWrite = writes.find((w) => w.table === 'subscriptions' && w.upsert);
    expect(subWrite?.values).toMatchObject({
      id: 'sub_invoice_1',
      user_id: 'teacher-1',
      plan: 'school',
      seats: 30,
      status: 'active',
    });
  });

  it('keeps the school licence while an invoice is unpaid (past_due), as a card licence is kept', async () => {
    await webhook(
      makeReq(subscriptionCreatedEvent(invoicedSubscription({ status: 'past_due' }))),
      makeRes()
    );
    const schoolWrite = writes.find((w) => w.table === 'schools');
    expect(schoolWrite?.values.plan_status).toBe('past_due');
    const planWrite = writes.find((w) => w.table === 'profiles' && 'stripe_plan' in w.values);
    expect(planWrite?.values.stripe_plan).toBe('school');
  });

  it('warns, and does not sync the school, when the requester has no school at all', async () => {
    profiles = [{ id: 'teacher-1', school_id: null, stripe_customer_id: null }];
    await webhook(makeReq(subscriptionCreatedEvent(invoicedSubscription())), makeRes());
    expect(writes.some((w) => w.table === 'schools')).toBe(false);
  });
});
