import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from '../../types';

/**
 * A student whose Plus is paid for by a parent or guardian sees who pays, and
 * is not offered the Stripe portal, which belongs to the payer. The lookup
 * reads `payer_id` off the student's own subscription row and says whether it
 * is someone else.
 */

let supabaseClient: unknown = null;
let selectedColumns = '';

vi.mock('../../services/authService', () => ({
  authService: {
    getCurrentUser: () => ({ username: 'sam', role: 'user' }) as unknown as User,
  },
}));

vi.mock('../../services/supabaseClient', () => ({
  get supabase() {
    return supabaseClient;
  },
}));

import { fetchBillingLookup } from '../../services/entitlements';

const clientReturning = (row: Record<string, unknown> | null, userId = 'child-1') => ({
  auth: {
    getSession: async () => ({ data: { session: { user: { id: userId } } } }),
  },
  from: () => ({
    select: (columns: string) => {
      selectedColumns = columns;
      return {
        eq: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: async () => ({ data: row, error: null }),
            }),
          }),
        }),
      };
    },
  }),
});

const liveRow = {
  status: 'active',
  plan: 'plus',
  current_period_end: '2026-12-01T00:00:00Z',
  cancel_at_period_end: false,
};

beforeEach(() => {
  supabaseClient = null;
  selectedColumns = '';
});

describe('fetchBillingLookup and the payer', () => {
  it('reads payer_id alongside the rest of the subscription', async () => {
    supabaseClient = clientReturning({ ...liveRow, payer_id: 'parent-1' });

    await fetchBillingLookup();

    expect(selectedColumns).toContain('payer_id');
  });

  it('says the plan is paid for by someone else when the payer is not the student', async () => {
    supabaseClient = clientReturning({ ...liveRow, payer_id: 'parent-1' });

    const result = await fetchBillingLookup();

    expect(result).toMatchObject({ status: 'found', state: { paidByGuardian: true } });
  });

  it('is not paid by a guardian when the student paid for it themselves', async () => {
    supabaseClient = clientReturning({ ...liveRow, payer_id: null });

    const result = await fetchBillingLookup();

    expect(result).toMatchObject({ status: 'found', state: { paidByGuardian: false } });
  });

  it('is not paid by a guardian when the payer is the student', async () => {
    supabaseClient = clientReturning({ ...liveRow, payer_id: 'child-1' });

    const result = await fetchBillingLookup();

    expect(result).toMatchObject({ status: 'found', state: { paidByGuardian: false } });
  });
});
