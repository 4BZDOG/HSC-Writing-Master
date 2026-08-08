import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from '../../types';

/**
 * Holding a paid plan is not the same as being the payer, and "no
 * subscription" is not the same as "could not tell".
 *
 * Teachers hold Plus as a staff perk, admins hold School by role, and every
 * member of a licensed school holds School because someone else bought seats.
 * None has a `stripe_customer_id`, so offering them the Stripe portal gets a
 * 404 telling them to subscribe to what they already have.
 *
 * The fix keys off the caller's own subscription row — which makes the
 * distinction below load-bearing. `fetchBillingState` collapses "no row" and
 * "the query failed" into null, so a transient Supabase failure would be read
 * as "this is a perk", and a real paying customer would be told they have
 * nothing to manage and shown no route to Stripe at all. That is a worse wrong
 * than a button that might 404, so the failure case has to be distinguishable.
 */

const rpcUnused = vi.fn();
let supabaseClient: unknown = null;

vi.mock('../../services/authService', () => ({
  authService: {
    getCurrentUser: () => ({ username: 'alice', role: 'student' }) as unknown as User,
  },
}));

vi.mock('../../services/supabaseClient', () => ({
  get supabase() {
    return supabaseClient;
  },
}));

import { fetchBillingLookup, fetchBillingState } from '../../services/entitlements';

/** A Supabase double whose subscriptions query resolves to `result`. */
const clientReturning = (result: { data: unknown; error: unknown }, userId = 'u1') => ({
  auth: {
    getSession: async () => ({ data: { session: userId ? { user: { id: userId } } : null } }),
  },
  from: () => ({
    select: () => ({
      eq: () => ({
        order: () => ({
          limit: () => ({
            maybeSingle: async () => result,
          }),
        }),
      }),
    }),
  }),
  rpc: rpcUnused,
});

const row = {
  status: 'active',
  plan: 'plus',
  current_period_end: '2026-12-01T00:00:00Z',
  cancel_at_period_end: false,
};

beforeEach(() => {
  supabaseClient = null;
});

describe('fetchBillingLookup', () => {
  it('reports a subscription the caller actually holds', async () => {
    supabaseClient = clientReturning({ data: row, error: null });

    const result = await fetchBillingLookup();

    expect(result.status).toBe('found');
    expect(result).toMatchObject({ state: { status: 'active', plan: 'plus' } });
  });

  it('reports "none" for a caller with no subscription row', async () => {
    // A teacher on the staff perk: real session, real query, no row.
    supabaseClient = clientReturning({ data: null, error: null });

    expect((await fetchBillingLookup()).status).toBe('none');
  });

  it('reports "none" in mock mode, where a subscription cannot exist', async () => {
    supabaseClient = null;

    expect((await fetchBillingLookup()).status).toBe('none');
  });

  it('reports "none" when there is no Supabase session', async () => {
    supabaseClient = clientReturning({ data: null, error: null }, '');

    expect((await fetchBillingLookup()).status).toBe('none');
  });

  it('reports "unknown" when the query fails — not "none"', async () => {
    // The distinction the portal button depends on. Collapsing this into
    // "none" tells a paying customer they have nothing to manage.
    supabaseClient = clientReturning({ data: null, error: { message: 'network' } });

    expect((await fetchBillingLookup()).status).toBe('unknown');
  });

  it('reports "unknown" when the client throws', async () => {
    supabaseClient = {
      auth: {
        getSession: async () => {
          throw new Error('offline');
        },
      },
    };

    expect((await fetchBillingLookup()).status).toBe('unknown');
  });
});

describe('fetchBillingState still behaves as its callers expect', () => {
  it('returns the state when one was found', async () => {
    supabaseClient = clientReturning({ data: row, error: null });

    expect(await fetchBillingState()).toMatchObject({ status: 'active', plan: 'plus' });
  });

  it('returns null for both "none" and "unknown", as the past-due banner needs', async () => {
    supabaseClient = clientReturning({ data: null, error: null });
    expect(await fetchBillingState()).toBeNull();

    supabaseClient = clientReturning({ data: null, error: { message: 'network' } });
    expect(await fetchBillingState()).toBeNull();
  });
});
