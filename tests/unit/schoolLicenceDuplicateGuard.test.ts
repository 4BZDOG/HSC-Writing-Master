import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * create-checkout refuses a second School licence for a school that already
 * holds one.
 *
 * The duplicate guard is per PERSON, so two teachers at one school each passed it
 * and each bought a licence. Both were charged, and the webhook wrote whichever
 * arrived last onto schools.stripe_subscription_id, leaving one licence paid for
 * and invisible. The school row is the thing to check, so it is checked here,
 * before any Stripe session exists.
 *
 * Held means a Stripe subscription id on the school AND a status that is still
 * being paid for (active, trialing, past_due). A cancelling licence is still
 * active until its period ends, so it holds too. A cancelled or unpaid licence
 * does not, and the school can buy again.
 *
 * Two lookup failures are deliberately different. An ERROR (connection, a bad
 * query) refuses the purchase: we cannot establish that it is safe. A MISSING
 * COLUMN (schema §13 not re-applied) is "cannot tell", and the purchase proceeds
 * exactly as it did before the guard existed.
 */

let existingSubscription: { id: string; status: string } | null = null;
let existingSubError: { code?: string; message: string } | null = null;
let profileRole = 'teacher';
let profileSchoolId: string | null = 'school-1';
let profileError: { code?: string; message: string } | null = null;
/** The school row the mocked `schools` lookup reports; null means no such row. */
let schoolRow: Record<string, unknown> | null = null;
let schoolError: { code?: string; message: string } | null = null;
/** Every school id the guard looked up, in order. */
const schoolQueries: string[] = [];
const sessionCreateMock = vi.fn();

const makeSupabaseMock = () => ({
  from: (table: string) => {
    if (table === 'subscriptions') {
      let allowed: string[] = [];
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: (_col: string, statuses: string[]) => {
          allowed = statuses;
          return chain;
        },
        limit: () => chain,
        maybeSingle: async () => {
          if (existingSubError) return { data: null, error: existingSubError };
          return {
            data:
              existingSubscription && allowed.includes(existingSubscription.status)
                ? existingSubscription
                : null,
            error: null,
          };
        },
      };
      return chain;
    }
    if (table === 'schools') {
      return {
        select: () => ({
          eq: (_col: string, id: string) => {
            schoolQueries.push(id);
            return {
              maybeSingle: async () =>
                schoolError ? { data: null, error: schoolError } : { data: schoolRow, error: null },
            };
          },
        }),
      };
    }
    // The open-checkout record: nothing recorded yet, so the first session displaces none.
    // Its own branch, so a profile-column error in these cases does not reach it.
    if (table === 'checkout_sessions') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        insert: async () => ({ error: null }),
      };
    }
    // profiles: .select().eq().maybeSingle()
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            profileError
              ? { data: null, error: profileError }
              : {
                  data: {
                    stripe_customer_id: 'cus_1',
                    role: profileRole,
                    school_id: profileSchoolId,
                  },
                  error: null,
                },
        }),
      }),
    };
  },
  auth: { admin: { getUserById: async () => ({ data: { user: { email: 'buyer@x' } } }) } },
});

vi.mock('../../api/_lib/stripe', () => ({
  getStripe: () =>
    ({
      subscriptions: { retrieve: vi.fn() },
      checkout: { sessions: { create: sessionCreateMock } },
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

const post = (body: Record<string, unknown>) => ({
  method: 'POST',
  headers: { authorization: 'Bearer t' },
  body,
});

const schoolPurchase = () => post({ priceId: 'price_school', seats: 30 });

beforeEach(() => {
  existingSubscription = null;
  existingSubError = null;
  profileRole = 'teacher';
  profileSchoolId = 'school-1';
  profileError = null;
  schoolRow = null;
  schoolError = null;
  schoolQueries.length = 0;
  sessionCreateMock.mockReset();
  sessionCreateMock.mockResolvedValue({ url: 'https://stripe.test/session' });
});

describe('create-checkout: one School licence per school', () => {
  it.each(['active', 'trialing', 'past_due'])(
    'refuses (409, no session) while the school holds a %s licence',
    async (plan_status) => {
      schoolRow = { stripe_subscription_id: 'sub_held', plan_status };
      const res = makeRes();
      await checkoutHandler(schoolPurchase(), res);

      expect(res.statusCode).toBe(409);
      expect(res.body?.code).toBe('school_licence_held');
      expect(res.body?.error).toContain('Your school already has a School licence');
      expect(res.body?.error).toContain('Manage subscription');
      expect(sessionCreateMock).not.toHaveBeenCalled();
    }
  );

  it('still refuses when the held licence is set to lapse at period end (it is still paid for)', async () => {
    // Stripe keeps a cancelling subscription at `active` until the boundary, and
    // the existing buyer can still resume it. Buying a second licence now would
    // double-bill for the same school.
    schoolRow = {
      stripe_subscription_id: 'sub_cancelling',
      plan_status: 'active',
      plan_cancel_at_period_end: true,
    };
    const res = makeRes();
    await checkoutHandler(schoolPurchase(), res);
    expect(res.statusCode).toBe(409);
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it.each(['canceled', 'unpaid', 'incomplete_expired', 'none'])(
    'lets the school buy again when its last licence is %s',
    async (plan_status) => {
      schoolRow = { stripe_subscription_id: 'sub_old', plan_status };
      const res = makeRes();
      await checkoutHandler(schoolPurchase(), res);
      expect(res.statusCode).toBe(200);
      expect(sessionCreateMock).toHaveBeenCalledOnce();
    }
  );

  it('does not treat an active status with no Stripe subscription as a held licence', async () => {
    // Held needs both: a status that is paid for AND a subscription to point at.
    // Without an id there is nothing to resume or cancel, so refusing would
    // block a school on a row no one can act on.
    schoolRow = { stripe_subscription_id: null, plan_status: 'active' };
    const res = makeRes();
    await checkoutHandler(schoolPurchase(), res);
    expect(res.statusCode).toBe(200);
    expect(sessionCreateMock).toHaveBeenCalledOnce();
  });

  it('looks up the buyer’s own school, not one named by the client', async () => {
    schoolRow = null;
    await checkoutHandler(
      post({ priceId: 'price_school', seats: 30, schoolId: 'other' }),
      makeRes()
    );
    expect(schoolQueries).toEqual(['school-1']);
  });

  it('never affects an individual Plus purchase, even when the school holds a licence', async () => {
    schoolRow = { stripe_subscription_id: 'sub_held', plan_status: 'active' };
    const res = makeRes();
    await checkoutHandler(post({ priceId: 'price_plus_monthly' }), res);
    expect(res.statusCode).toBe(200);
    expect(sessionCreateMock).toHaveBeenCalledOnce();
    expect(schoolQueries).toHaveLength(0);
  });

  it('is unaffected for a buyer whose school has no licence', async () => {
    schoolRow = { stripe_subscription_id: null, plan_status: 'none' };
    const res = makeRes();
    await checkoutHandler(schoolPurchase(), res);
    expect(res.statusCode).toBe(200);
    expect(sessionCreateMock).toHaveBeenCalledOnce();
  });

  it('still refuses a buyer attached to no school, before looking at licences', async () => {
    profileSchoolId = null;
    schoolRow = { stripe_subscription_id: 'sub_held', plan_status: 'active' };
    const res = makeRes();
    await checkoutHandler(schoolPurchase(), res);
    expect(res.statusCode).toBe(400);
    expect(schoolQueries).toHaveLength(0);
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it('keeps the personal duplicate refusal as the stronger answer when both apply', async () => {
    existingSubscription = { id: 'sub_mine', status: 'active' };
    schoolRow = { stripe_subscription_id: 'sub_held', plan_status: 'active' };
    const res = makeRes();
    await checkoutHandler(schoolPurchase(), res);
    expect(res.statusCode).toBe(409);
    expect(res.body?.code).toBeUndefined();
    expect(res.body?.error).toContain('Manage subscription');
  });
});

describe('create-checkout: a database that has not re-applied the schema', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
  });

  it('proceeds as before, with a warning, when the licence columns are missing', async () => {
    schoolError = { code: '42703', message: 'column schools.plan_status does not exist' };
    const res = makeRes();
    await checkoutHandler(schoolPurchase(), res);
    expect(res.statusCode).toBe(200);
    expect(sessionCreateMock).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalled();
  });

  it('proceeds for Plus when the billing columns on profiles are missing', async () => {
    profileError = { code: '42703', message: 'column profiles.stripe_customer_id does not exist' };
    const res = makeRes();
    await checkoutHandler(post({ priceId: 'price_plus_monthly' }), res);
    expect(res.statusCode).toBe(200);
    expect(sessionCreateMock).toHaveBeenCalledOnce();
  });
});

describe('create-checkout: a lookup that ERRORS refuses the purchase', () => {
  let errorLog: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    errorLog.mockRestore();
  });

  it('refuses a school purchase (503, no session) when the licence lookup errors', async () => {
    schoolError = { code: '08006', message: 'connection lost' };
    const res = makeRes();
    await checkoutHandler(schoolPurchase(), res);
    expect(res.statusCode).toBe(503);
    expect(res.body?.error).toContain('no purchase was started');
    // The reason is logged, not handed to the browser.
    expect(res.body?.error).not.toContain('connection lost');
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it('refuses a Plus purchase (503, no session) when the subscription guard cannot read', async () => {
    existingSubError = { code: '08006', message: 'connection lost' };
    const res = makeRes();
    await checkoutHandler(post({ priceId: 'price_plus_monthly' }), res);
    expect(res.statusCode).toBe(503);
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it('refuses any purchase (503, no session) when the profile lookup errors', async () => {
    profileError = { code: '08006', message: 'connection lost' };
    const res = makeRes();
    await checkoutHandler(post({ priceId: 'price_plus_monthly' }), res);
    expect(res.statusCode).toBe(503);
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });
});
