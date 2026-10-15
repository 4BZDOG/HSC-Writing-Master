import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Stripe from 'stripe';

/**
 * The webhook's signature gate on each kind of runtime (finding 23). The real
 * stripe.ts runs, so the environment alone picks the branch; only the database
 * is faked. A Vercel preview is the case that matters: it is a deployment, so an
 * unsigned event must be refused there even though it is not "production".
 */

const SECRET = 'whsec_test_secret';
const ENV_KEYS = ['NODE_ENV', 'VERCEL_ENV', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'] as const;
let saved: Record<string, string | undefined> = {};

/** Every database call the handler makes. A refused request must make none. */
let calls: string[] = [];
/** Writes that did happen, so the trusted path can be shown to apply the event. */
let writes: Array<{ table: string; values: Record<string, unknown> }> = [];

const makeSupabaseMock = () => ({
  from: (table: string) => {
    calls.push(`from:${table}`);
    return {
      insert: async () => ({ error: null }),
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
      update: (values: Record<string, unknown>) => {
        writes.push({ table, values });
        return { eq: async () => ({ error: null }) };
      },
      delete: () => ({ eq: async () => ({ error: null }) }),
    };
  },
  rpc: async (name: string) => {
    calls.push(`rpc:${name}`);
    return { data: 'free', error: null };
  },
});

vi.mock('../../api/_lib/stripe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/_lib/stripe')>();
  return {
    ...actual,
    getSupabaseAdmin: () => makeSupabaseMock(),
  };
});

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

/** A payment failure: small, and it writes one subscription row when applied. */
const event = {
  id: 'evt_gate_1',
  object: 'event',
  created: 1_700_000_500,
  type: 'invoice.payment_failed',
  data: { object: { customer: 'cus_1', subscription: 'sub_1' } },
};
const payload = JSON.stringify(event);

const pastDueWritten = () =>
  writes.some((w) => w.table === 'subscriptions' && w.values.status === 'past_due');

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  // Vitest runs with NODE_ENV=test; a real request on a deployment has no secret set.
  process.env.NODE_ENV = 'test';
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  calls = [];
  writes = [];
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

describe('no webhook secret on a deployment: refuse, and touch nothing', () => {
  it.each([
    ['a Vercel preview', { VERCEL_ENV: 'preview' }],
    ['a Vercel production deployment', { VERCEL_ENV: 'production' }],
    ['a vercel dev run', { VERCEL_ENV: 'development' }],
    ['a self-hosted production run', { NODE_ENV: 'production' }],
  ])('%s answers 500 and never reaches the database', async (_label, env) => {
    Object.assign(process.env, env);

    const res = makeRes();
    await handler({ method: 'POST', headers: {}, body: event }, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Webhook signing secret not configured.' });
    expect(calls).toEqual([]);
    expect(writes).toEqual([]);
  });

  it('says on the log that it refused because this is a deployment', async () => {
    process.env.VERCEL_ENV = 'preview';

    await handler({ method: 'POST', headers: {}, body: event }, makeRes());

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('on a deployment'));
  });
});

describe('no webhook secret outside any deployment: the body is trusted, as before', () => {
  it.each(['test', 'development'])(
    'applies an unsigned event with VERCEL_ENV unset and NODE_ENV=%s',
    async (nodeEnv) => {
      process.env.NODE_ENV = nodeEnv;

      const res = makeRes();
      await handler({ method: 'POST', headers: {}, body: event }, res);

      expect(res.statusCode).toBe(200);
      expect(pastDueWritten()).toBe(true);
    }
  );
});

describe('with a webhook secret, a preview still verifies the signature', () => {
  beforeEach(() => {
    process.env.VERCEL_ENV = 'preview';
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  });

  it('answers 400 to a forged signature and writes nothing', async () => {
    const res = makeRes();
    await handler(
      {
        method: 'POST',
        headers: { 'stripe-signature': 't=1700000500,v1=0000deadbeef' },
        rawBody: payload,
      },
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      error: expect.stringContaining('signature verification failed'),
    });
    expect(calls).toEqual([]);
    expect(writes).toEqual([]);
  });

  it('answers 400 when the signature header is missing', async () => {
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, rawBody: payload }, res);

    expect(res.statusCode).toBe(400);
    expect(writes).toEqual([]);
  });

  it('applies an event signed with the secret', async () => {
    const header = new Stripe('sk_test_dummy').webhooks.generateTestHeaderString({
      payload,
      secret: SECRET,
    });

    const res = makeRes();
    await handler(
      { method: 'POST', headers: { 'stripe-signature': header }, rawBody: payload },
      res
    );

    expect(res.statusCode).toBe(200);
    expect(pastDueWritten()).toBe(true);
  });
});
