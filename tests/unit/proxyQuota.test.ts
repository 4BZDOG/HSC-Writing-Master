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
  return { ...actual, consumeAiQuota: consumeMock, recordAiModelUsage: recordMock };
});
vi.mock('../../api/_lib/providers', () => ({ runAiProxy: runAiProxyMock }));

import { consumeAiQuota } from '../../api/_lib/quota';
import handler from '../../api/gemini';

const ORIGINAL_ENV = { ...process.env };

// consumeAiQuota/recordAiModelUsage are mocked at module level for the handler
// tests; grab the real implementations for the unit tests below.
const realQuota = await vi.importActual<typeof import('../../api/_lib/quota')>(
  '../../api/_lib/quota'
);
const realConsume = realQuota.consumeAiQuota;
const realRecord = realQuota.recordAiModelUsage;

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
    await realRecord('token', 'gemini-3-pro-preview');
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
      expect(rpcMock).toHaveBeenCalledWith('record_ai_model_usage', { p_model: 'claude-sonnet-4-6' });
    });

    it('skips the RPC entirely for an empty model tag', async () => {
      await realRecord('token', '');
      expect(rpcMock).not.toHaveBeenCalled();
    });

    it('swallows an RPC error (reporting is best-effort)', async () => {
      rpcMock.mockResolvedValue({ error: { message: 'function does not exist' } });
      await expect(realRecord('token', 'gemini-3-pro-preview')).resolves.toBeUndefined();
    });

    it('swallows a thrown client error', async () => {
      rpcMock.mockRejectedValue(new Error('network down'));
      await expect(realRecord('token', 'gemini-3-pro-preview')).resolves.toBeUndefined();
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
    body: { provider: 'gemini', model: 'gemini-3-pro-preview', contents: 'x' },
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

  it('forwards to the provider when the quota allows', async () => {
    verifyMock.mockResolvedValue({ ok: true, userId: 'user-1' });
    consumeMock.mockResolvedValue({ allowed: true, used: 3, limit: 60 });

    const res = makeRes();
    await handler(request(), res as never);

    expect(consumeMock).toHaveBeenCalledWith('jwt-token');
    expect(runAiProxyMock).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
  });

  it('records the request model for the usage breakdown when allowed', async () => {
    verifyMock.mockResolvedValue({ ok: true, userId: 'user-1' });
    consumeMock.mockResolvedValue({ allowed: true, used: 3, limit: 60 });

    const res = makeRes();
    await handler(request(), res as never);

    expect(recordMock).toHaveBeenCalledWith('jwt-token', 'gemini-3-pro-preview');
  });

  it('still records the model when quotas are unenforceable (verdict null)', async () => {
    verifyMock.mockResolvedValue({ ok: true, userId: 'user-1' });
    consumeMock.mockResolvedValue(null);

    const res = makeRes();
    await handler(request(), res as never);

    expect(recordMock).toHaveBeenCalledWith('jwt-token', 'gemini-3-pro-preview');
    expect(res.statusCode).toBe(200);
  });

  it('skips recording when the request carries no model tag', async () => {
    verifyMock.mockResolvedValue({ ok: true, userId: 'user-1' });
    consumeMock.mockResolvedValue({ allowed: true, used: 3, limit: 60 });

    const res = makeRes();
    await handler(
      { method: 'POST', headers: { authorization: 'Bearer jwt-token' }, body: { provider: 'gemini' } },
      res as never
    );

    expect(runAiProxyMock).toHaveBeenCalledTimes(1);
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
