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
