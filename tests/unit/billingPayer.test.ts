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

import { fetchBillingLookup, isMissingColumnError } from '../../services/entitlements';

/**
 * A database that predates `payer_id`. Selecting the column fails, as PostgREST
 * reports it, and only the select without the column returns the row.
 */
const clientWithoutPayerColumn = (row: Record<string, unknown>, error: unknown) => {
  const calls: string[] = [];
  return {
    calls,
    client: {
      auth: {
        getSession: async () => ({ data: { session: { user: { id: 'child-1' } } } }),
      },
      from: () => ({
        select: (columns: string) => {
          calls.push(columns);
          const failing = columns.includes('payer_id');
          return {
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () =>
                    failing ? { data: null, error } : { data: row, error: null },
                }),
              }),
            }),
          };
        },
      }),
    },
  };
};

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

  it('still answers from a database without payer_id, retrying the select without it', async () => {
    const { client, calls } = clientWithoutPayerColumn(liveRow, {
      code: '42703',
      message: 'column subscriptions.payer_id does not exist',
    });
    supabaseClient = client;

    const result = await fetchBillingLookup();

    expect(result).toMatchObject({
      status: 'found',
      state: { status: 'active', plan: 'plus', paidByGuardian: false },
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain('payer_id');
    expect(calls[1]).not.toContain('payer_id');
  });

  it('does not retry a failure that is not a missing column', async () => {
    const { client, calls } = clientWithoutPayerColumn(liveRow, {
      code: '57014',
      message: 'canceling statement due to statement timeout',
    });
    supabaseClient = client;

    const result = await fetchBillingLookup();

    expect(result).toEqual({ status: 'unknown' });
    expect(calls).toHaveLength(1);
  });
});

describe('isMissingColumnError', () => {
  it('recognises the Postgres and PostgREST codes for a missing column', () => {
    expect(isMissingColumnError({ code: '42703', message: 'x' }, 'payer_id')).toBe(true);
    expect(isMissingColumnError({ code: 'PGRST204', message: 'x' }, 'payer_id')).toBe(true);
  });

  it('recognises a message that names the column and says it is absent', () => {
    expect(
      isMissingColumnError(
        { message: "Could not find the 'payer_id' column of 'subscriptions' in the schema cache" },
        'payer_id'
      )
    ).toBe(true);
  });

  it('is not fooled by other errors, or by a different column', () => {
    expect(isMissingColumnError(null, 'payer_id')).toBe(false);
    expect(isMissingColumnError({ code: '23505', message: 'duplicate key' }, 'payer_id')).toBe(
      false
    );
    expect(
      isMissingColumnError({ message: 'column subscriptions.plan does not exist' }, 'payer_id')
    ).toBe(false);
  });
});
