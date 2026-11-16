import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * POST /api/course-unlock-checkout (projectDocs/course-unlocks.md, api/course-unlock-checkout.ts).
 *
 * Refusals (404 disabled, 409 included, 409 already unlocked, 503 when a lookup fails or no
 * price is set), the payment-mode session with its metadata, the per-course price, the
 * reused customer, and the mock URL when Stripe is unconfigured.
 */

const sessionCreateMock = vi.fn();
const createClientMock = vi.fn();

let stripeOn = true;
let misconfigured = false;
let profileResult: { data: unknown; error: unknown } = {
  data: { stripe_customer_id: null },
  error: null,
};

/** What the caller's own token reads back: the fact answers, and the catalogue row. */
let answers: {
  is_reviewer?: unknown;
  caller_plan?: unknown;
  catalogue?: { data: unknown; error: unknown };
  my_course_unlocks?: unknown;
} = {};

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

vi.mock('../../api/_lib/stripe', () => ({
  getStripe: () => ({ checkout: { sessions: { create: sessionCreateMock } } }) as unknown,
  isStripeConfigured: () => stripeOn,
  isStripeMisconfigured: () => misconfigured,
  STRIPE_MISCONFIGURED_ERROR: 'billing misconfigured',
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => profileResult,
        }),
      }),
    }),
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: { email: 'buyer@example.test' } } }),
      },
    },
  }),
  resolveReturnBase: () => 'http://localhost:3000/',
}));

vi.mock('../../api/_lib/auth', () => ({
  verifyRequestAuth: async () => ({ ok: true, userId: 'user-1' }),
  extractBearerToken: () => 'token',
}));

import handler from '../../api/course-unlock-checkout';

const COURSE = 'course-hsc-chemistry';

const ENV_KEYS = [
  'COURSE_UNLOCKS_ENABLED',
  'VITE_COURSE_UNLOCKS_ENABLED',
  'COURSE_UNLOCK_INCLUDED_PLANS',
  'VITE_COURSE_UNLOCK_INCLUDED_PLANS',
  'COURSE_UNLOCK_FREE_COURSES',
  'STRIPE_COURSE_UNLOCK_PRICE_ID',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'ALLOWED_ORIGIN',
] as const;

let saved: Record<string, string | undefined> = {};

const makeRes = () => ({
  statusCode: 0,
  body: undefined as Record<string, unknown> | undefined,
  status(code: number) {
    this.statusCode = code;
    return this;
  },
  json(data: unknown) {
    this.body = data as Record<string, unknown>;
  },
  setHeader() {},
  end() {},
});

const post = (body: Record<string, unknown>, method = 'POST') => ({
  method,
  headers: { authorization: 'Bearer token' },
  body,
});

const call = async (body: Record<string, unknown> = { courseId: COURSE }) => {
  const res = makeRes();
  await handler(post(body), res);
  return res;
};

/** A free student with nothing, against a course that needs an unlock. */
const lockedAnswers = () => ({
  is_reviewer: false,
  caller_plan: 'free',
  catalogue: { data: null, error: null },
  my_course_unlocks: [],
});

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.COURSE_UNLOCKS_ENABLED = 'true';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon';
  process.env.STRIPE_COURSE_UNLOCK_PRICE_ID = 'price_default';
  stripeOn = true;
  misconfigured = false;
  profileResult = { data: { stripe_customer_id: null }, error: null };
  answers = lockedAnswers();
  sessionCreateMock.mockReset();
  sessionCreateMock.mockResolvedValue({ id: 'cs_test_1', url: 'https://checkout.stripe.test/c/1' });
  createClientMock.mockReset();
  createClientMock.mockImplementation(() => ({
    rpc: vi.fn(async (name: string) => {
      const value = answers[name as keyof typeof answers];
      if (value instanceof Error) throw value;
      return { data: value ?? null, error: null };
    }),
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => answers.catalogue ?? { data: null, error: null },
        }),
      }),
    }),
  }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

describe('course-unlock-checkout: refusals', () => {
  it('answers 404 course_unlocks_disabled while unlocks are off, and starts nothing', async () => {
    delete process.env.COURSE_UNLOCKS_ENABLED;
    const res = await call();
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ code: 'course_unlocks_disabled' });
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it('answers 400 for a missing or malformed course id', async () => {
    expect((await call({})).statusCode).toBe(400);
    expect((await call({ courseId: 'bad id!' })).statusCode).toBe(400);
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it("answers 409 course_included when the caller's plan already includes the course", async () => {
    answers = { ...lockedAnswers(), caller_plan: 'school' };
    const res = await call();
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: 'course_included' });
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it('answers 409 course_included for staff', async () => {
    answers = { ...lockedAnswers(), is_reviewer: true };
    const res = await call();
    expect(res.body).toMatchObject({ code: 'course_included' });
  });

  it('answers 409 course_included for a course on the free list', async () => {
    process.env.COURSE_UNLOCK_FREE_COURSES = COURSE;
    const res = await call();
    expect(res.body).toMatchObject({ code: 'course_included' });
  });

  it('answers 409 course_included when the catalogue says the course needs no unlock', async () => {
    answers = {
      ...lockedAnswers(),
      catalogue: { data: { unlock_required: false, stripe_price_id: null }, error: null },
    };
    const res = await call();
    expect(res.body).toMatchObject({ code: 'course_included' });
  });

  it('answers 409 course_already_unlocked when the caller holds an active unlock', async () => {
    answers = { ...lockedAnswers(), my_course_unlocks: [COURSE] };
    const res = await call();
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: 'course_already_unlocked' });
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it('answers 503 account_lookup_failed when a fact the purchase needs cannot be read', async () => {
    // The plan is unknown and the default includes school, so the caller's standing cannot
    // be proved. The purchase is refused rather than selling a course the caller may hold.
    answers = { ...lockedAnswers(), caller_plan: new Error('rpc down') };
    const res = await call();
    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({ code: 'account_lookup_failed' });
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it('answers 503 course_unlock_unavailable when there is no price at all', async () => {
    delete process.env.STRIPE_COURSE_UNLOCK_PRICE_ID;
    const res = await call();
    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({ code: 'course_unlock_unavailable' });
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it('answers 503 when Stripe is half configured, rather than a mock URL', async () => {
    misconfigured = true;
    stripeOn = false;
    const res = await call();
    expect(res.statusCode).toBe(503);
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it('answers 405 to anything but POST', async () => {
    const res = makeRes();
    await handler({ method: 'GET', headers: {} }, res);
    expect(res.statusCode).toBe(405);
  });
});

describe('course-unlock-checkout: the session', () => {
  it('starts a payment-mode session for one unit, keyed to the user, with the course metadata', async () => {
    const res = await call();

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ url: 'https://checkout.stripe.test/c/1' });
    expect(sessionCreateMock).toHaveBeenCalledTimes(1);
    const params = sessionCreateMock.mock.calls[0][0];
    expect(params).toMatchObject({
      mode: 'payment',
      line_items: [{ price: 'price_default', quantity: 1 }],
      client_reference_id: 'user-1',
      metadata: { kind: 'course_unlock', course_id: COURSE, supabase_user_id: 'user-1' },
      customer_email: 'buyer@example.test',
    });
    expect(params).not.toHaveProperty('subscription_data');
  });

  it('returns to the course on success, and to the app on cancel', async () => {
    await call();
    const params = sessionCreateMock.mock.calls[0][0];
    expect(params.success_url).toBe(
      `http://localhost:3000/#/course-unlocked?course=${encodeURIComponent(COURSE)}`
    );
    expect(params.cancel_url).toBe('http://localhost:3000/?checkout=cancelled');
  });

  it("uses the course's own catalogue price in place of the default", async () => {
    answers = {
      ...lockedAnswers(),
      catalogue: { data: { unlock_required: true, stripe_price_id: 'price_chem' }, error: null },
    };
    await call();
    expect(sessionCreateMock.mock.calls[0][0].line_items).toEqual([
      { price: 'price_chem', quantity: 1 },
    ]);
  });

  it('reuses the Stripe customer when the profile already has one', async () => {
    profileResult = { data: { stripe_customer_id: 'cus_existing' }, error: null };
    await call();
    const params = sessionCreateMock.mock.calls[0][0];
    expect(params.customer).toBe('cus_existing');
    expect(params).not.toHaveProperty('customer_email');
  });

  it('answers 503 and starts nothing when the profile cannot be read', async () => {
    profileResult = { data: null, error: { message: 'boom' } };
    const res = await call();
    expect(res.statusCode).toBe(503);
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it('answers 500 with a generic message when Stripe refuses, without the raw error', async () => {
    sessionCreateMock.mockRejectedValue(new Error('acct_secret_123 is not active'));
    const res = await call();
    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('acct_secret_123');
  });
});

describe('course-unlock-checkout: test mode', () => {
  it('returns a mock URL with test:true when Stripe is unconfigured, and starts no session', async () => {
    stripeOn = false;
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ test: true });
    expect(String(res.body?.url)).toContain(
      `#/course-unlock-test?course=${encodeURIComponent(COURSE)}`
    );
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });
});
