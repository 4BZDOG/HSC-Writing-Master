import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * POST /api/create-checkout with the open-checkout record (monetisation review §21).
 *
 * The record is the checkout_sessions row for the caller. Stripe is faked as far as the
 * behaviour the code depends on: create returns the same session for a repeated key (as
 * Stripe does inside an idempotency window), expire refuses a session that is no longer
 * open, and retrieve reports what the earlier session became.
 */

const sessionCreateMock = vi.fn();
const sessionExpireMock = vi.fn();
const sessionRetrieveMock = vi.fn();

type Row = Record<string, unknown>;
/** checkout_sessions: the session each user's row holds. */
const recorded = new Map<string, string>();
/** A forced error on reading the record (for the lookup and missing-table cases). */
let recordReadError: Row | null = null;

const sessionsTable = () => ({
  select: () => {
    let userId = '';
    const builder = {
      eq: (col: string, val: unknown) => {
        if (col === 'user_id') userId = val as string;
        return builder;
      },
      maybeSingle: async () => {
        if (recordReadError) return { data: null, error: recordReadError };
        const sessionId = recorded.get(userId);
        return { data: sessionId ? { session_id: sessionId } : null, error: null };
      },
    };
    return builder;
  },
  insert: async (values: Row) => {
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
        if (recorded.get(userId) !== expected) return { data: [], error: null };
        recorded.set(userId, values.session_id as string);
        return { data: [{ user_id: userId }], error: null };
      },
    };
    return builder;
  },
});

const makeSupabaseMock = () => ({
  from: (table: string) => {
    if (table === 'checkout_sessions') return sessionsTable();
    if (table === 'subscriptions') {
      // The duplicate guard: no held subscription for this caller.
      return {
        select: () => ({
          eq: () => ({
            in: () => ({
              limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
            }),
          }),
        }),
      };
    }
    // profiles: a student with no Stripe customer yet.
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { stripe_customer_id: null, role: 'student', school_id: null },
            error: null,
          }),
        }),
      }),
    };
  },
  auth: { admin: { getUserById: async () => ({ data: { user: { email: 'buyer@x' } } }) } },
});

vi.mock('../../api/_lib/stripe', () => ({
  getStripe: () =>
    ({
      checkout: {
        sessions: {
          create: (...args: unknown[]) => sessionCreateMock(...args),
          expire: (...args: unknown[]) => sessionExpireMock(...args),
          retrieve: (...args: unknown[]) => sessionRetrieveMock(...args),
        },
      },
      subscriptions: { retrieve: vi.fn() },
    }) as unknown,
  isStripeConfigured: () => true,
  isStripeMisconfigured: () => false,
  STRIPE_MISCONFIGURED_ERROR: 'billing misconfigured',
  getSupabaseAdmin: () => makeSupabaseMock(),
  priceToPlan: (id: string) => (id === 'price_school' ? 'school' : 'plus'),
  resolveReturnBase: () => 'http://localhost:3000/',
  isProductionRuntime: () => false,
  configuredPrices: () => ({
    price_school: 'school',
    price_plus_yearly: 'plus',
    price_plus_monthly: 'plus',
  }),
}));

vi.mock('../../api/_lib/auth', () => ({
  verifyRequestAuth: async () => ({ ok: true, userId: 'user-1' }),
  extractBearerToken: () => 'token',
}));

import checkoutHandler from '../../api/create-checkout';

const makeRes = () => ({
  statusCode: 0,
  body: undefined as { url?: string; error?: string; code?: string } | undefined,
  status(code: number) {
    this.statusCode = code;
    return this;
  },
  json(data: unknown) {
    this.body = data as { url?: string; error?: string; code?: string };
  },
  setHeader() {},
});

const post = () => ({
  method: 'POST',
  headers: { authorization: 'Bearer t' },
  body: { priceId: 'price_plus_monthly' },
});

const session = (id: string) => ({ id, url: `https://stripe.test/${id}` });

beforeEach(() => {
  recorded.clear();
  recordReadError = null;
  sessionCreateMock.mockReset();
  sessionExpireMock.mockReset();
  sessionExpireMock.mockResolvedValue({});
  sessionRetrieveMock.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('create-checkout: one open checkout per user', () => {
  it('records the first session and hands out its URL', async () => {
    sessionCreateMock.mockResolvedValueOnce(session('cs_1'));
    const res = makeRes();
    await checkoutHandler(post(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body?.url).toBe('https://stripe.test/cs_1');
    expect(recorded.get('user-1')).toBe('cs_1');
    expect(sessionExpireMock).not.toHaveBeenCalled();
  });

  it('expires the earlier session when a second checkout is started', async () => {
    sessionCreateMock.mockResolvedValueOnce(session('cs_1')).mockResolvedValueOnce(session('cs_2'));
    await checkoutHandler(post(), makeRes());
    const res = makeRes();
    await checkoutHandler(post(), res);

    expect(res.statusCode).toBe(200);
    expect(sessionExpireMock).toHaveBeenCalledWith('cs_1');
    expect(res.body?.url).toBe('https://stripe.test/cs_2');
    expect(recorded.get('user-1')).toBe('cs_2');
  });

  it('a double tap returns the same session and expires nothing', async () => {
    // Stripe returns the original session for a repeated key and parameters.
    sessionCreateMock.mockResolvedValue(session('cs_same'));
    const first = makeRes();
    const second = makeRes();
    await checkoutHandler(post(), first);
    await checkoutHandler(post(), second);

    expect(second.body?.url).toBe(first.body?.url);
    expect(sessionExpireMock).not.toHaveBeenCalled();
  });

  it('sends the session an expiry 30 to 36 minutes out, and an idempotency key', async () => {
    sessionCreateMock.mockResolvedValueOnce(session('cs_1'));
    await checkoutHandler(post(), makeRes());

    const [params, options] = sessionCreateMock.mock.calls[0] as [
      { expires_at: number },
      { idempotencyKey: string },
    ];
    const lifeMs = params.expires_at * 1000 - Date.now();
    // Stripe's floor is 30 minutes from creation, and its default is 24 hours.
    expect(lifeMs).toBeGreaterThanOrEqual(30 * 60 * 1000 - 2_000);
    expect(lifeMs).toBeLessThanOrEqual(36 * 60 * 1000);
    expect(options.idempotencyKey).toContain('user-1');
  });

  it('refuses a purchase whose displaced session was paid, releases the new one, and hands nothing out', async () => {
    // The first session was paid; the webhook has not yet recorded the subscription, so
    // the subscription guard cannot see it. Stripe can.
    sessionCreateMock.mockResolvedValueOnce(session('cs_1')).mockResolvedValueOnce(session('cs_2'));
    await checkoutHandler(post(), makeRes());

    sessionExpireMock.mockImplementation(async (id: string) => {
      if (id === 'cs_1') throw new Error('You can only expire a Checkout Session that is open.');
      return {};
    });
    sessionRetrieveMock.mockResolvedValue({
      status: 'complete',
      subscription: { id: 'sub_paid', status: 'active' },
    });

    const res = makeRes();
    await checkoutHandler(post(), res);

    expect(res.statusCode).toBe(409);
    expect(res.body?.error).toContain('Manage subscription');
    expect(res.body?.url).toBeUndefined();
    // The new session is released, so nothing payable outlives the refusal.
    expect(sessionExpireMock).toHaveBeenCalledWith('cs_2');
  });

  it('holds a purchase whose earlier subscription is still awaiting its first payment', async () => {
    sessionCreateMock.mockResolvedValueOnce(session('cs_1')).mockResolvedValueOnce(session('cs_2'));
    await checkoutHandler(post(), makeRes());

    sessionExpireMock.mockImplementation(async (id: string) => {
      if (id === 'cs_1') throw new Error('You can only expire a Checkout Session that is open.');
      return {};
    });
    sessionRetrieveMock.mockResolvedValue({
      status: 'complete',
      subscription: { id: 'sub_3ds', status: 'incomplete' },
    });

    const res = makeRes();
    await checkoutHandler(post(), res);

    expect(res.statusCode).toBe(409);
    expect(res.body?.error).toContain('still waiting for payment');
    expect(res.body?.url).toBeUndefined();
  });

  it('does not block a legitimate purchase when Stripe fails to expire the earlier session', async () => {
    sessionCreateMock.mockResolvedValueOnce(session('cs_1')).mockResolvedValueOnce(session('cs_2'));
    await checkoutHandler(post(), makeRes());

    sessionExpireMock.mockRejectedValue(new Error('Stripe 500'));
    sessionRetrieveMock.mockRejectedValue(new Error('Stripe 500'));

    const res = makeRes();
    await checkoutHandler(post(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body?.url).toBe('https://stripe.test/cs_2');
  });

  it('answers 409 and records nothing when Stripe reports the same request is still in flight', async () => {
    sessionCreateMock.mockRejectedValueOnce({
      type: 'StripeIdempotencyError',
      message: 'Keys for idempotent requests can only be used with the same parameters.',
    });
    const res = makeRes();
    await checkoutHandler(post(), res);

    expect(res.statusCode).toBe(409);
    expect(res.body?.error).toContain('still being prepared');
    expect(recorded.size).toBe(0);
    expect(sessionExpireMock).not.toHaveBeenCalled();
  });

  it('refuses (503) and releases the session when the record cannot be read', async () => {
    sessionCreateMock.mockResolvedValueOnce(session('cs_1'));
    recordReadError = { code: '08006', message: 'connection lost' };
    const res = makeRes();
    await checkoutHandler(post(), res);

    expect(res.statusCode).toBe(503);
    expect(res.body?.error).toContain('no purchase was started');
    expect(res.body?.error).not.toContain('connection lost');
    expect(res.body?.url).toBeUndefined();
    expect(sessionExpireMock).toHaveBeenCalledWith('cs_1');
  });

  it('proceeds as before, with no record, when the table has not been created (schema §13 not re-applied)', async () => {
    sessionCreateMock.mockResolvedValueOnce(session('cs_1'));
    recordReadError = {
      code: '42P01',
      message: 'relation "public.checkout_sessions" does not exist',
    };
    const res = makeRes();
    await checkoutHandler(post(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body?.url).toBe('https://stripe.test/cs_1');
    expect(sessionExpireMock).not.toHaveBeenCalled();
  });
});
