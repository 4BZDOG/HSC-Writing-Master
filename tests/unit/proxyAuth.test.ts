import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the Supabase SDK so token verification can be exercised without network.
const getUserMock = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: getUserMock } }),
}));

import { verifyRequestAuth, isAuthEnabled } from '../../api/_lib/auth';

const ORIGINAL_ENV = { ...process.env };

describe('AI proxy auth gate (verifyRequestAuth)', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    // The VITE_ pair participates in the misconfiguration check below, so it
    // has to be cleared too or a developer's .env leaks into these results.
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.VITE_SUPABASE_ANON_KEY;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('is disabled (allows all) when the server has no Supabase configured', async () => {
    expect(isAuthEnabled()).toBe(false);
    const result = await verifyRequestAuth(undefined);
    expect(result.ok).toBe(true);
    // Must not even attempt a token lookup when auth is off.
    expect(getUserMock).not.toHaveBeenCalled();
  });

  /**
   * The half-configured deployment: `VITE_SUPABASE_*` set, `SUPABASE_*` not.
   *
   * Mock-mode parity says "no server Supabase → let it through", and that is
   * right for a deployment with no Supabase at all. It is wrong for one that
   * clearly has Supabase and missed the second pair of variables — the UI shows
   * real accounts and real quotas while the proxy serves anyone who finds the
   * URL, spending the provider budget with no limit and no attribution. The
   * setup table lists the VITE_ pair first and explains the unprefixed pair in
   * a note underneath, so this is an easy state to land in.
   */
  describe('half-configured deployment (client Supabase, no server Supabase)', () => {
    beforeEach(() => {
      process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
      process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';
    });

    it('fails CLOSED in production rather than serving an open proxy', async () => {
      process.env.NODE_ENV = 'production';
      const result = await verifyRequestAuth('Bearer whatever');
      expect(result.ok).toBe(false);
      expect(result.status).toBe(503);
      // The message has to name the variables — an operator reading a 503 in a
      // function log is the only person who can fix this.
      expect(result.error).toMatch(/SUPABASE_URL/);
      expect(result.error).toMatch(/SUPABASE_ANON_KEY/);
      expect(getUserMock).not.toHaveBeenCalled();
    });

    it('does not refuse in development, where nothing is exposed', async () => {
      // Refusing here would break `npm run dev` for anyone signing in through
      // Supabase without server vars set, to protect a proxy nobody can reach.
      process.env.NODE_ENV = 'development';
      await expect(verifyRequestAuth(undefined)).resolves.toEqual({ ok: true });
    });

    it('still passes a genuinely unconfigured production deploy (mock mode)', async () => {
      // No Supabase anywhere is a supported mode, not a misconfiguration.
      process.env.NODE_ENV = 'production';
      delete process.env.VITE_SUPABASE_URL;
      delete process.env.VITE_SUPABASE_ANON_KEY;
      await expect(verifyRequestAuth(undefined)).resolves.toEqual({ ok: true });
    });

    it('enforces normally once the server pair is added', async () => {
      process.env.NODE_ENV = 'production';
      process.env.SUPABASE_URL = 'https://example.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'anon-key';
      const result = await verifyRequestAuth(undefined);
      // 401 (needs a token), not 503 (misconfigured) — the fix takes effect.
      expect(result.status).toBe(401);
    });
  });

  describe('when Supabase IS configured on the server', () => {
    beforeEach(() => {
      process.env.SUPABASE_URL = 'https://example.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'anon-key';
    });

    it('reports auth as enabled', () => {
      expect(isAuthEnabled()).toBe(true);
    });

    it('rejects a request with no Authorization header (401)', async () => {
      const result = await verifyRequestAuth(undefined);
      expect(result.ok).toBe(false);
      expect(result.status).toBe(401);
      expect(getUserMock).not.toHaveBeenCalled();
    });

    it('rejects a malformed Authorization header (401)', async () => {
      const result = await verifyRequestAuth('NotBearer abc');
      expect(result.ok).toBe(false);
      expect(result.status).toBe(401);
    });

    it('rejects an invalid / expired token (401)', async () => {
      getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'bad jwt' } });
      const result = await verifyRequestAuth('Bearer expired-token');
      expect(result.ok).toBe(false);
      expect(result.status).toBe(401);
      expect(getUserMock).toHaveBeenCalledWith('expired-token');
    });

    it('accepts a valid token and returns the user id', async () => {
      getUserMock.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
      const result = await verifyRequestAuth('Bearer good-token');
      expect(result.ok).toBe(true);
      expect(result.userId).toBe('user-123');
    });

    it('parses the bearer scheme case-insensitively', async () => {
      getUserMock.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
      const result = await verifyRequestAuth('bearer good-token');
      expect(result.ok).toBe(true);
      expect(getUserMock).toHaveBeenCalledWith('good-token');
    });
  });
});
