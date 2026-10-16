import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Two ways the webhook could apply a subscription change to the WRONG row.
 *
 * 1. A School licence follows the school it was bought for. Its purchaser may
 *    have moved school since; the later events must still reach the school row
 *    that holds the licence, or an unpaid licence keeps its school plan.
 * 2. A deleted subscription downgrades the user it belongs to, even when no
 *    profile carries its customer id (two checkouts raced before either linked
 *    a customer). Returning early there left a cancelled subscriber on Plus.
 */

type Row = Record<string, unknown>;
interface Write {
  table: string;
  op: 'update' | 'upsert';
  values: Row;
  eqCol?: string;
  eqVal?: unknown;
}

/** profiles by stripe_customer_id: the customer's linked profile, if any. */
let customerProfile: Row | null = null;
/** profiles by id: the purchaser, used for the metadata fallback. */
let purchaserProfile: Row | null = null;
/** schools by stripe_subscription_id: the school row already holding the licence. */
let licensedSchool: Row | null = null;
/** subscriptions by id: the row that names the owning user. */
let subscriptionOwner: Row | null = null;

const writes: Write[] = [];
const rpcCalls: Array<{ name: string; args: Row }> = [];

const makeSupabaseMock = () => ({
  from: (table: string) => {
    if (table === 'stripe_events') {
      return {
        insert: async () => ({ error: null }),
        update: () => ({ eq: async () => ({ error: null }) }),
        delete: () => ({ eq: async () => ({ error: null }) }),
      };
    }
    const lookup = (col: string, cols?: string) => {
      if (table === 'profiles') {
        if (col === 'stripe_customer_id') return customerProfile;
        return purchaserProfile;
      }
      if (table === 'schools') return licensedSchool;
      if (table === 'subscriptions') {
        if (cols === 'user_id') return subscriptionOwner;
        if (cols === 'last_event_at') return { last_event_at: null };
        return null;
      }
      return null;
    };
    return {
      select: (cols?: string) => ({
        eq: (col: string) => ({
          maybeSingle: async () => ({ data: lookup(col, cols), error: null }),
          single: async () => ({ data: lookup(col, cols), error: null }),
        }),
      }),
      update: (values: Row) => ({
        eq: async (eqCol: string, eqVal: unknown) => {
          writes.push({ table, op: 'update', values, eqCol, eqVal });
          return { error: null };
        },
      }),
      upsert: async (values: Row) => {
        writes.push({ table, op: 'upsert', values });
        return { error: null };
      },
    };
  },
  rpc: async (name: string, args: Row) => {
    rpcCalls.push({ name, args });
    return { data: 'free' };
  },
});

vi.mock('../../api/_lib/stripe', () => ({
  getStripe: () => ({ subscriptions: { retrieve: vi.fn() } }) as unknown,
  isStripeConfigured: () => true,
  getSupabaseAdmin: () => makeSupabaseMock(),
  priceToPlan: (id: string) => (id === 'price_school' ? 'school' : 'plus'),
  resolveReturnBase: () => 'http://localhost:3000/',
  configuredPrices: () => ({ price_school: 'school', price_plus: 'plus' }),
  isProductionRuntime: () => false,
  isDeployedRuntime: () => false,
}));

import handler from '../../api/stripe-webhook';

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

const schoolEvent = (type: string, status: string, subId = 'sub_school') => ({
  method: 'POST',
  headers: {},
  body: {
    id: `evt_${type}_${status}`,
    created: 1_700_000_500,
    type,
    data: {
      object: {
        id: subId,
        customer: 'cus_1',
        status,
        cancel_at_period_end: false,
        items: {
          data: [
            {
              price: { id: 'price_school' },
              quantity: 30,
              current_period_start: 1_700_000_000,
              current_period_end: 1_702_600_000,
            },
          ],
        },
      },
    },
  },
});

const deletedEvent = (subId = 'sub_gone') => ({
  method: 'POST',
  headers: {},
  body: {
    id: `evt_deleted_${subId}`,
    created: 1_700_000_500,
    type: 'customer.subscription.deleted',
    data: { object: { id: subId, customer: 'cus_1' } },
  },
});

beforeEach(() => {
  writes.length = 0;
  rpcCalls.length = 0;
  customerProfile = null;
  purchaserProfile = null;
  licensedSchool = null;
  subscriptionOwner = null;
});

describe('a School licence follows the school it was bought for', () => {
  it('syncs a later event to the licensed school after the purchaser has moved school', async () => {
    // The teacher bought the licence for school-old and has since moved to school-new.
    customerProfile = { id: 'user-1', school_id: 'school-new' };
    licensedSchool = { id: 'school-old' };

    const res = makeRes();
    await handler(schoolEvent('customer.subscription.updated', 'past_due'), res);

    expect(res.statusCode).toBe(200);
    const schoolWrites = writes.filter((w) => w.table === 'schools');
    expect(schoolWrites).toHaveLength(1);
    expect(schoolWrites[0]).toMatchObject({
      eqCol: 'id',
      eqVal: 'school-old',
      values: { plan_status: 'past_due' },
    });
    expect(writes.some((w) => w.table === 'schools' && w.eqVal === 'school-new')).toBe(false);
  });

  it('falls back to the purchaser’s school on a first event, before any licence row exists', async () => {
    customerProfile = { id: 'user-1', school_id: 'school-1' };
    licensedSchool = null;

    const res = makeRes();
    await handler(schoolEvent('customer.subscription.created', 'active'), res);

    const schoolWrite = writes.find((w) => w.table === 'schools');
    expect(schoolWrite).toMatchObject({ eqCol: 'id', eqVal: 'school-1' });
  });
});

describe('a deleted subscription downgrades the user it belongs to', () => {
  it('finds the user through the subscription row when no profile carries the customer id', async () => {
    customerProfile = null;
    subscriptionOwner = { user_id: 'user-1' };
    rpcCalls.length = 0;

    const res = makeRes();
    await handler(deletedEvent(), res);

    expect(res.statusCode).toBe(200);
    expect(rpcCalls).toEqual([{ name: 'resolve_stripe_plan', args: { p_user_id: 'user-1' } }]);
    const profileWrite = writes.find((w) => w.table === 'profiles');
    expect(profileWrite).toMatchObject({
      eqCol: 'id',
      eqVal: 'user-1',
      values: { stripe_plan: 'free' },
    });
  });

  it('changes nothing on any profile when neither route names a user', async () => {
    customerProfile = null;
    subscriptionOwner = null;

    const res = makeRes();
    await handler(deletedEvent(), res);

    expect(res.statusCode).toBe(200);
    expect(writes.some((w) => w.table === 'profiles')).toBe(false);
    expect(rpcCalls).toHaveLength(0);
  });

  it('keeps the customer route as the first choice when it finds a profile', async () => {
    customerProfile = { id: 'user-2' };
    subscriptionOwner = { user_id: 'user-1' };

    await handler(deletedEvent(), makeRes());

    expect(rpcCalls[0]?.args).toEqual({ p_user_id: 'user-2' });
  });
});
