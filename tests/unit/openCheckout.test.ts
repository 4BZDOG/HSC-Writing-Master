import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * One open Checkout Session per user (monetisation review §21), at the helper level.
 *
 * The record is a row per user in checkout_sessions. The swap is a compare-and-set, so
 * two requests racing for one row cannot both believe they displaced the same session.
 * Expiry is housekeeping: a Stripe failure there must not stop a legitimate purchase,
 * with the one exception that a displaced session which was PAID, and whose subscription
 * is still held, refuses the new one.
 */

import {
  checkoutRequestKey,
  CHECKOUT_LIFE_MS,
  CHECKOUT_REQUEST_BUCKET_MS,
  expireDisplacedCheckout,
  isHeldStatus,
  isIdempotencyConflict,
  releaseCheckout,
  swapOpenCheckout,
} from '../../api/_lib/openCheckout';

type Row = Record<string, unknown>;

/** The checkout_sessions table: one session id per user. */
const recorded = new Map<string, string>();
/** Scripted answers for the next calls, so each race and failure can be staged. */
let readError: Row | null = null;
let beforeSwap: (() => void) | null = null;
let forceSwapMiss = false;
let insertCode: string | null = null;

const sessionsTable = () => ({
  select: () => {
    let userId = '';
    const builder = {
      eq: (col: string, val: unknown) => {
        if (col === 'user_id') userId = val as string;
        return builder;
      },
      maybeSingle: async () => {
        if (readError) return { data: null, error: readError };
        const sessionId = recorded.get(userId);
        return { data: sessionId ? { session_id: sessionId } : null, error: null };
      },
    };
    return builder;
  },
  insert: async (values: Row) => {
    if (insertCode) return { error: { code: insertCode, message: 'insert refused' } };
    const user = values.user_id as string;
    if (recorded.has(user)) return { error: { code: '23505', message: 'duplicate key' } };
    recorded.set(user, values.session_id as string);
    return { error: null };
  },
  update: (values: Row) => {
    let userId = '';
    let expected = '';
    const builder = {
      eq: (col: string, val: unknown) => {
        if (col === 'user_id') userId = val as string;
        if (col === 'session_id') expected = val as string;
        return builder;
      },
      select: async () => {
        beforeSwap?.();
        beforeSwap = null;
        // The compare-and-set: the row must still hold the session the caller read.
        if (forceSwapMiss || recorded.get(userId) !== expected) {
          forceSwapMiss = false;
          return { data: [], error: null };
        }
        recorded.set(userId, values.session_id as string);
        return { data: [{ user_id: userId }], error: null };
      },
    };
    return builder;
  },
});

const makeSupabase = () => ({
  from: (table: string) => {
    if (table !== 'checkout_sessions') throw new Error(`unexpected table ${table}`);
    return sessionsTable();
  },
});

beforeEach(() => {
  recorded.clear();
  readError = null;
  beforeSwap = null;
  forceSwapMiss = false;
  insertCode = null;
});

const input = {
  userId: 'user-1',
  priceId: 'price_plus_monthly',
  seats: 1,
  returnBase: 'https://app.test/',
  customerRef: 'new',
};

describe('checkoutRequestKey', () => {
  it('gives the same key and expiry to every request inside one bucket', () => {
    const start = 1_700_000_000_000 - (1_700_000_000_000 % CHECKOUT_REQUEST_BUCKET_MS);
    const a = checkoutRequestKey(input, start + 1_000);
    const b = checkoutRequestKey(input, start + CHECKOUT_REQUEST_BUCKET_MS - 1);
    expect(b).toEqual(a);
  });

  it('gives a new key once the bucket rolls over, so a deliberate later attempt gets a fresh session', () => {
    const start = 1_700_000_000_000 - (1_700_000_000_000 % CHECKOUT_REQUEST_BUCKET_MS);
    const a = checkoutRequestKey(input, start + 1_000);
    const b = checkoutRequestKey(input, start + CHECKOUT_REQUEST_BUCKET_MS + 1_000);
    expect(b.idempotencyKey).not.toBe(a.idempotencyKey);
  });

  it('separates the key by plan, seats and the customer reference', () => {
    const now = 1_700_000_000_000;
    const base = checkoutRequestKey(input, now).idempotencyKey;
    expect(checkoutRequestKey({ ...input, priceId: 'price_school' }, now).idempotencyKey).not.toBe(
      base
    );
    expect(checkoutRequestKey({ ...input, seats: 5 }, now).idempotencyKey).not.toBe(base);
    // A customer linked between two taps changes the parameters, so the key must change too.
    expect(checkoutRequestKey({ ...input, customerRef: 'cus_1' }, now).idempotencyKey).not.toBe(
      base
    );
  });

  it('keeps expires_at between 30 and 36 minutes after the call, whatever part of the bucket it falls in', () => {
    // Stripe's floor is 30 minutes from creation and its default is 24 hours. The expiry is
    // set from the END of the bucket, so the worst case is a request at the very start of
    // its bucket (the most time to spare) or a call a few seconds late at the very end.
    const start = 1_700_000_000_000 - (1_700_000_000_000 % CHECKOUT_REQUEST_BUCKET_MS);
    for (const offset of [0, 1_000, CHECKOUT_REQUEST_BUCKET_MS - 1]) {
      const now = start + offset;
      const { expiresAt } = checkoutRequestKey(input, now);
      const lifeMs = expiresAt * 1000 - now;
      expect(lifeMs).toBeGreaterThanOrEqual(30 * 60 * 1000);
      expect(lifeMs).toBeLessThanOrEqual(CHECKOUT_LIFE_MS + CHECKOUT_REQUEST_BUCKET_MS);
    }
    // A call a few seconds after the bucket ends still has the 30-minute floor.
    const lateCall = start + CHECKOUT_REQUEST_BUCKET_MS + 5_000;
    const { expiresAt } = checkoutRequestKey(input, start + CHECKOUT_REQUEST_BUCKET_MS - 1);
    expect(expiresAt * 1000 - lateCall).toBeGreaterThanOrEqual(30 * 60 * 1000);
  });
});

describe('isHeldStatus', () => {
  it('holds every status in which a purchase is paid, being paid, or may still be paid', () => {
    for (const status of ['active', 'trialing', 'past_due', 'incomplete']) {
      expect(isHeldStatus(status)).toBe(true);
    }
  });

  it('does not hold a purchase that has ended or never completed', () => {
    for (const status of ['canceled', 'incomplete_expired', 'unpaid', 'paused', '', undefined]) {
      expect(isHeldStatus(status)).toBe(false);
    }
  });
});

describe('isIdempotencyConflict', () => {
  it('recognises Stripe’s idempotency error by type', () => {
    expect(isIdempotencyConflict({ type: 'StripeIdempotencyError' })).toBe(true);
    expect(isIdempotencyConflict({ type: 'StripeInvalidRequestError' })).toBe(false);
    expect(isIdempotencyConflict(new Error('boom'))).toBe(false);
    expect(isIdempotencyConflict(null)).toBe(false);
  });
});

describe('swapOpenCheckout', () => {
  it('records the first session and displaces nothing', async () => {
    const result = await swapOpenCheckout(makeSupabase() as never, 'user-1', 'cs_new');
    expect(result).toEqual({ recorded: true, previous: null });
    expect(recorded.get('user-1')).toBe('cs_new');
  });

  it('swaps the new session in and returns the one it displaces', async () => {
    recorded.set('user-1', 'cs_old');
    const result = await swapOpenCheckout(makeSupabase() as never, 'user-1', 'cs_new');
    expect(result).toEqual({ recorded: true, previous: 'cs_old' });
    expect(recorded.get('user-1')).toBe('cs_new');
  });

  it('displaces nothing when the same session is asked for again (a double tap)', async () => {
    recorded.set('user-1', 'cs_same');
    const result = await swapOpenCheckout(makeSupabase() as never, 'user-1', 'cs_same');
    expect(result).toEqual({ recorded: true, previous: 'cs_same' });
  });

  it('reads again when another request swapped first, and displaces that session', async () => {
    // Between this request's read (cs_old) and its compare-and-set, a concurrent request
    // swapped in cs_rival. The swap must not clobber it; it displaces cs_rival instead.
    recorded.set('user-1', 'cs_old');
    beforeSwap = () => recorded.set('user-1', 'cs_rival');
    const result = await swapOpenCheckout(makeSupabase() as never, 'user-1', 'cs_new');
    expect(result).toEqual({ recorded: true, previous: 'cs_rival' });
    expect(recorded.get('user-1')).toBe('cs_new');
  });

  it('reads again after losing an insert race (23505) and displaces the winner', async () => {
    let calls = 0;
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              calls += 1;
              // The first read sees nothing; by the second, the winner has recorded.
              if (calls === 1) return { data: null, error: null };
              return { data: { session_id: 'cs_winner' }, error: null };
            },
          }),
        }),
        insert: async () => {
          recorded.set('user-1', 'cs_winner');
          return { error: { code: '23505', message: 'duplicate key' } };
        },
        update: () => ({
          eq: () => ({
            eq: () => ({ select: async () => ({ data: [{ user_id: 'user-1' }], error: null }) }),
          }),
        }),
      }),
    };
    const result = await swapOpenCheckout(supabase as never, 'user-1', 'cs_new');
    expect(result).toEqual({ recorded: true, previous: 'cs_winner' });
  });

  it('reports "not recorded" when the table is missing (schema §13 not re-applied)', async () => {
    readError = { code: '42P01', message: 'relation "public.checkout_sessions" does not exist' };
    const result = await swapOpenCheckout(makeSupabase() as never, 'user-1', 'cs_new');
    expect(result).toEqual({ recorded: false });
  });

  it('throws on a database error, so the purchase is refused rather than left unrecorded', async () => {
    readError = { code: '08006', message: 'connection lost' };
    await expect(swapOpenCheckout(makeSupabase() as never, 'user-1', 'cs_new')).rejects.toThrow(
      /could not read the open checkout/
    );
  });
});

describe('expireDisplacedCheckout', () => {
  let errorLog: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    errorLog.mockRestore();
    vi.restoreAllMocks();
  });

  const stripeWith = (expire: unknown, retrieve: unknown) =>
    ({ checkout: { sessions: { expire, retrieve } } }) as never;

  it('expires an open session and proceeds', async () => {
    const expire = vi.fn().mockResolvedValue({});
    const retrieve = vi.fn();
    const result = await expireDisplacedCheckout(stripeWith(expire, retrieve), 'cs_old');
    expect(result).toEqual({ held: false });
    expect(expire).toHaveBeenCalledWith('cs_old');
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('refuses when the displaced session was paid and its subscription is active', async () => {
    const expire = vi.fn().mockRejectedValue(new Error('session is complete'));
    const retrieve = vi.fn().mockResolvedValue({
      status: 'complete',
      subscription: { id: 'sub_paid', status: 'active' },
    });
    const result = await expireDisplacedCheckout(stripeWith(expire, retrieve), 'cs_old');
    expect(result).toEqual({ held: true, status: 'active' });
    expect(retrieve).toHaveBeenCalledWith('cs_old', { expand: ['subscription'] });
  });

  it('refuses when the displaced session’s subscription is still awaiting its first payment', async () => {
    const expire = vi.fn().mockRejectedValue(new Error('session is complete'));
    const retrieve = vi.fn().mockResolvedValue({
      status: 'complete',
      subscription: { id: 'sub_3ds', status: 'incomplete' },
    });
    const result = await expireDisplacedCheckout(stripeWith(expire, retrieve), 'cs_old');
    expect(result).toEqual({ held: true, status: 'incomplete' });
  });

  it('proceeds when the displaced session was completed but its subscription has ended', async () => {
    const expire = vi.fn().mockRejectedValue(new Error('session is complete'));
    const retrieve = vi.fn().mockResolvedValue({
      status: 'complete',
      subscription: { id: 'sub_old', status: 'canceled' },
    });
    expect(await expireDisplacedCheckout(stripeWith(expire, retrieve), 'cs_old')).toEqual({
      held: false,
    });
  });

  it('proceeds when the displaced session is already expired', async () => {
    const expire = vi.fn().mockRejectedValue(new Error('already expired'));
    const retrieve = vi.fn().mockResolvedValue({ status: 'expired', subscription: null });
    expect(await expireDisplacedCheckout(stripeWith(expire, retrieve), 'cs_old')).toEqual({
      held: false,
    });
  });

  it('does not block the purchase when Stripe fails on expiry AND on the follow-up read', async () => {
    // A Stripe hiccup is housekeeping. The purchase proceeds, and the failure is logged.
    const expire = vi.fn().mockRejectedValue(new Error('Stripe 500'));
    const retrieve = vi.fn().mockRejectedValue(new Error('Stripe 500'));
    const result = await expireDisplacedCheckout(stripeWith(expire, retrieve), 'cs_old');
    expect(result).toEqual({ held: false });
    expect(errorLog).toHaveBeenCalled();
  });

  it('proceeds when the expiry fails transiently and the session is still open', async () => {
    const expire = vi.fn().mockRejectedValue(new Error('Stripe timeout'));
    const retrieve = vi.fn().mockResolvedValue({ status: 'open', subscription: null });
    expect(await expireDisplacedCheckout(stripeWith(expire, retrieve), 'cs_old')).toEqual({
      held: false,
    });
  });
});

describe('releaseCheckout', () => {
  it('expires a session we are not handing out, and never throws if Stripe refuses', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const expire = vi.fn().mockRejectedValue(new Error('Stripe 500'));
    await expect(
      releaseCheckout({ checkout: { sessions: { expire } } } as never, 'cs_unused')
    ).resolves.toBeUndefined();
    expect(expire).toHaveBeenCalledWith('cs_unused');
    vi.restoreAllMocks();
  });
});
