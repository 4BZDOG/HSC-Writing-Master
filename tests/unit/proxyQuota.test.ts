import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.mock factories are hoisted above const declarations, so the mock fns
// they capture must be hoisted too.
const { rpcMock, verifyMock, consumeMock, recordMock, runAiProxyMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  verifyMock: vi.fn(),
  consumeMock: vi.fn(),
  recordMock: vi.fn(),
  runAiProxyMock: vi.fn(),
}));

// Mock the Supabase SDK so the quota RPC can be exercised without network.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc: rpcMock, auth: { getUser: vi.fn() } }),
}));
vi.mock('../../api/_lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/_lib/auth')>();
  return { ...actual, verifyRequestAuth: verifyMock };
});
vi.mock('../../api/_lib/quota', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/_lib/quota')>();
  return {
    ...actual,
    consumeAiQuota: consumeMock,
    recordAiModelUsage: recordMock,
    resolveCallerIsStaff: async () => false,
  };
});
vi.mock('../../api/_lib/providers', () => ({ runAiProxy: runAiProxyMock }));

import { consumeAiQuota } from '../../api/_lib/quota';
import handler from '../../api/gemini';

const ORIGINAL_ENV = { ...process.env };

// consumeAiQuota/recordAiModelUsage are mocked at module level for the handler
// tests; grab the real implementations for the unit tests below.
const realQuota =
  await vi.importActual<typeof import('../../api/_lib/quota')>('../../api/_lib/quota');
const realConsume = realQuota.consumeAiQuota;
const realRecord = realQuota.recordAiModelUsage;
const realRefund = realQuota.refundEvaluation;

describe('consumeAiQuota (proxy quota module)', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('is disabled (returns null) when the server has no Supabase configured', async () => {
    const verdict = await realConsume('token');
    expect(verdict).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  describe('when Supabase IS configured', () => {
    beforeEach(() => {
      process.env.SUPABASE_URL = 'https://example.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'anon-key';
    });

    it('returns the RPC verdict verbatim', async () => {
      rpcMock.mockResolvedValue({ data: { allowed: false, used: 60, limit: 60 }, error: null });
      const verdict = await realConsume('token');
      expect(rpcMock).toHaveBeenCalledWith('consume_ai_quota');
      expect(verdict).toEqual({ allowed: false, used: 60, limit: 60 });
    });

    it('fails OPEN when the RPC is missing (schema not migrated yet)', async () => {
      rpcMock.mockResolvedValue({
        data: null,
        error: { message: 'function consume_ai_quota() does not exist' },
      });
      expect(await realConsume('token')).toBeNull();
    });

    it('fails OPEN on a malformed response', async () => {
      rpcMock.mockResolvedValue({ data: { nonsense: true }, error: null });
      expect(await realConsume('token')).toBeNull();
    });

    it('fails OPEN when the client throws', async () => {
      rpcMock.mockRejectedValue(new Error('network down'));
      expect(await realConsume('token')).toBeNull();
    });
  });
});

describe('recordAiModelUsage (proxy model-tally module)', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('no-ops (no RPC) when Supabase is unconfigured', async () => {
    await realRecord('token', 'gemini-3.1-pro-preview');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  describe('when Supabase IS configured', () => {
    beforeEach(() => {
      process.env.SUPABASE_URL = 'https://example.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'anon-key';
    });

    it('calls record_ai_model_usage with the model tag', async () => {
      rpcMock.mockResolvedValue({ error: null });
      await realRecord('token', 'claude-sonnet-4-6');
      expect(rpcMock).toHaveBeenCalledWith('record_ai_model_usage', {
        p_model: 'claude-sonnet-4-6',
      });
    });

    it('skips the RPC entirely for an empty model tag', async () => {
      await realRecord('token', '');
      expect(rpcMock).not.toHaveBeenCalled();
    });

    it('swallows an RPC error (reporting is best-effort)', async () => {
      rpcMock.mockResolvedValue({ error: { message: 'function does not exist' } });
      await expect(realRecord('token', 'gemini-3.1-pro-preview')).resolves.toBeUndefined();
    });

    it('swallows a thrown client error', async () => {
      rpcMock.mockRejectedValue(new Error('network down'));
      await expect(realRecord('token', 'gemini-3.1-pro-preview')).resolves.toBeUndefined();
    });

    it('stops waiting on a hung write after 1500ms, so the request is not held', async () => {
      vi.useFakeTimers();
      try {
        rpcMock.mockReturnValue(new Promise(() => {}));
        let settled = false;
        const done = realRecord('token', 'claude-sonnet-4-6').then(() => {
          settled = true;
        });
        await vi.advanceTimersByTimeAsync(1499);
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        await done;
        expect(settled).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});

describe('refundEvaluation (give back a spent free evaluation)', () => {
  // getSupabaseAdmin caches its service-role client in a module-level variable,
  // so a client built by an earlier test would leak into the "unconfigured"
  // cases. Each test therefore gets a fresh copy of the quota module (and with
  // it a fresh, empty cache). The mocked createClient and rpcMock are hoisted,
  // so they survive the registry reset.
  let refund: typeof realRefund;
  beforeEach(async () => {
    rpcMock.mockReset();
    vi.resetModules();
    refund = (await vi.importActual<typeof import('../../api/_lib/quota')>('../../api/_lib/quota'))
      .refundEvaluation;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  it('no-ops (no RPC) when Supabase is unconfigured', async () => {
    await refund('user-1');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('no-ops (no RPC) when only the anon key is set, never falling back to it', async () => {
    // The refund is service-role only; the anon key must not be a substitute.
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    await refund('user-1');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('no-ops (no RPC) when the URL is set but SUPABASE_SERVICE_ROLE_KEY is not', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    await refund('user-1');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  describe('when the service-role client IS configured', () => {
    beforeEach(() => {
      process.env.SUPABASE_URL = 'https://example.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    });

    it('calls refund_evaluation with the user id as p_user', async () => {
      rpcMock.mockResolvedValue({ data: { refunded: true }, error: null });
      await refund('user-1');
      expect(rpcMock).toHaveBeenCalledTimes(1);
      expect(rpcMock).toHaveBeenCalledWith('refund_evaluation', { p_user: 'user-1' });
    });

    it('swallows an RPC error (best-effort, never throws)', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      rpcMock.mockResolvedValue({ error: { message: 'function does not exist' } });
      await expect(refund('user-1')).resolves.toBeUndefined();
    });

    it('swallows a thrown client error', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      rpcMock.mockRejectedValue(new Error('network down'));
      await expect(refund('user-1')).resolves.toBeUndefined();
    });

    it('stops waiting on a hung refund after 5000ms, so the request is not held', async () => {
      vi.useFakeTimers();
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      rpcMock.mockReturnValue(new Promise(() => {}));
      let settled = false;
      const done = refund('user-1').then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(4999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await done;
      expect(settled).toBe(true);
    });
  });
});

describe('AI proxy handler quota gate', () => {
  const makeRes = () => {
    const res: { statusCode?: number; body?: unknown; status: any; json: any } = {
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(data: unknown) {
        this.body = data;
      },
    };
    return res;
  };

  const request = (auth = 'Bearer jwt-token') => ({
    method: 'POST',
    headers: { authorization: auth },
    body: { provider: 'gemini', model: 'gemini-3.1-pro-preview', contents: 'x' },
  });

  beforeEach(() => {
    verifyMock.mockReset();
    consumeMock.mockReset();
    recordMock.mockReset();
    recordMock.mockResolvedValue(undefined);
    runAiProxyMock.mockReset();
    runAiProxyMock.mockResolvedValue({ status: 200, body: { text: 'ok' } });
  });

  it('rejects with 429 and a "Daily AI limit" message when the budget is spent', async () => {
    verifyMock.mockResolvedValue({ ok: true, userId: 'user-1' });
    consumeMock.mockResolvedValue({ allowed: false, used: 60, limit: 60 });

    const res = makeRes();
    await handler(request(), res as never);

    expect(res.statusCode).toBe(429);
    const body = res.body as { error: string; quota: unknown };
    // services/aiCore.ts fast-fails on /daily ai limit/i — the wording is a
    // client/server contract, so pin it here.
    expect(body.error).toMatch(/daily ai limit/i);
    expect(body.error).toContain('60/60');
    expect(body.quota).toEqual({ allowed: false, used: 60, limit: 60 });
    expect(runAiProxyMock).not.toHaveBeenCalled();
    // A rejected call spent no unit, so nothing should be tallied for it.
    expect(recordMock).not.toHaveBeenCalled();
  });

  it('rejects with a school-pool wording when the shared budget is spent', async () => {
    verifyMock.mockResolvedValue({ ok: true, userId: 'user-1' });
    consumeMock.mockResolvedValue({ allowed: false, used: 200, limit: 200, scope: 'school' });

    const res = makeRes();
    await handler(request(), res as never);

    expect(res.statusCode).toBe(429);
    const body = res.body as { error: string };
    // Still matches aiCore's /daily ai limit/i fast-fail, but names the school pool.
    expect(body.error).toMatch(/daily ai limit/i);
    expect(body.error).toMatch(/school/i);
    expect(body.error).toContain('200/200');
    expect(runAiProxyMock).not.toHaveBeenCalled();
  });

  it('forwards to the provider when the quota allows', async () => {
    verifyMock.mockResolvedValue({ ok: true, userId: 'user-1' });
    consumeMock.mockResolvedValue({ allowed: true, used: 3, limit: 60 });

    const res = makeRes();
    await handler(request(), res as never);

    expect(consumeMock).toHaveBeenCalledWith('jwt-token');
    expect(runAiProxyMock).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
  });

  it('echoes the caller usage as __quota on a successful response', async () => {
    verifyMock.mockResolvedValue({ ok: true, userId: 'user-1' });
    consumeMock.mockResolvedValue({ allowed: true, used: 48, limit: 60 });

    const res = makeRes();
    await handler(request(), res as never);

    const body = res.body as { text: string; __quota?: { used: number; limit: number } };
    expect(body.text).toBe('ok');
    expect(body.__quota).toEqual({ used: 48, limit: 60 });
  });

  it('does not attach __quota when quotas are unenforceable (verdict null)', async () => {
    verifyMock.mockResolvedValue({ ok: true, userId: 'user-1' });
    consumeMock.mockResolvedValue(null);

    const res = makeRes();
    await handler(request(), res as never);

    expect(res.body).toEqual({ text: 'ok' });
  });

  it('records the request model for the usage breakdown when allowed', async () => {
    verifyMock.mockResolvedValue({ ok: true, userId: 'user-1' });
    consumeMock.mockResolvedValue({ allowed: true, used: 3, limit: 60 });

    const res = makeRes();
    await handler(request(), res as never);

    expect(recordMock).toHaveBeenCalledWith('jwt-token', 'gemini-3.1-pro-preview');
  });

  it('still records the model when quotas are unenforceable (verdict null)', async () => {
    verifyMock.mockResolvedValue({ ok: true, userId: 'user-1' });
    consumeMock.mockResolvedValue(null);

    const res = makeRes();
    await handler(request(), res as never);

    expect(recordMock).toHaveBeenCalledWith('jwt-token', 'gemini-3.1-pro-preview');
    expect(res.statusCode).toBe(200);
  });

  it('forwards a student-sized call with its output ceiling set', async () => {
    // Gemini's own default output limit runs to tens of thousands of tokens.
    verifyMock.mockResolvedValue({ ok: true, userId: 'user-1' });
    consumeMock.mockResolvedValue({ allowed: true, used: 3, limit: 60 });

    const res = makeRes();
    await handler(request(), res as never);

    const forwarded = runAiProxyMock.mock.calls[0][0] as { config: { maxOutputTokens: number } };
    expect(forwarded.config.maxOutputTokens).toBe(16_384);
  });

  it('refuses a request that carries no model tag, before spending or recording anything', async () => {
    // The request guard (api/_lib/requestGuard.ts): a provider fills a missing
    // model with its own default, which is not a cost the app chose.
    verifyMock.mockResolvedValue({ ok: true, userId: 'user-1' });
    consumeMock.mockResolvedValue({ allowed: true, used: 3, limit: 60 });

    const res = makeRes();
    await handler(
      {
        method: 'POST',
        headers: { authorization: 'Bearer jwt-token' },
        body: { provider: 'gemini' },
      },
      res as never
    );

    expect(res.statusCode).toBe(400);
    expect(runAiProxyMock).not.toHaveBeenCalled();
    expect(consumeMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it('forwards when quotas are unenforceable (fail-open verdict null)', async () => {
    verifyMock.mockResolvedValue({ ok: true, userId: 'user-1' });
    consumeMock.mockResolvedValue(null);

    const res = makeRes();
    await handler(request(), res as never);

    expect(runAiProxyMock).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
  });

  it('skips the quota gate entirely for anonymous mode (auth disabled)', async () => {
    verifyMock.mockResolvedValue({ ok: true }); // no userId: Supabase not configured
    const res = makeRes();
    await handler(request(''), res as never);

    expect(consumeMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
    expect(runAiProxyMock).toHaveBeenCalledTimes(1);
  });

  it('never reaches the quota gate when auth rejects', async () => {
    verifyMock.mockResolvedValue({ ok: false, status: 401, error: 'Invalid or expired session.' });
    const res = makeRes();
    await handler(request(), res as never);

    expect(res.statusCode).toBe(401);
    expect(consumeMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
    expect(runAiProxyMock).not.toHaveBeenCalled();
  });
});

// Keep the import "used" so the module-level mock stays active for the
// handler tests above.
void consumeAiQuota;
