import { describe, it, expect, vi, beforeEach } from 'vitest';
import { User } from '../../types';

// Simulate Supabase mode with a chainable stub client so the supabase code
// paths in authService (normally dormant in tests) can be exercised.
const getUserMock = vi.fn();
const signInMock = vi.fn();
const maybeSingleMock = vi.fn();
const updateMock = vi.fn();

vi.mock('../../services/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getUser: (...args: unknown[]) => getUserMock(...args),
      signInWithPassword: (...args: unknown[]) => signInMock(...args),
      signInWithOAuth: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => maybeSingleMock() }) }),
      update: (payload: unknown) => ({ eq: () => updateMock(payload) }),
    }),
  },
  fetchAllRows: vi.fn(),
}));

import { authService } from '../../services/authService';

const cachedAdmin: User = {
  username: 'jsmith',
  role: 'admin',
  displayName: 'J. Smith',
  preferences: {
    defaultFocusMode: false,
    autoSave: true,
    highContrast: false,
    showTips: false,
    theme: 'light',
  },
  stats: {
    xp: 4200,
    level: 9,
    questionsAnswered: 88,
    totalWordsWritten: 12345,
    averageBand: 5,
    lastActive: Date.now(),
    streakDays: 12,
  },
};

const authedUser = { id: 'user-1', email: 'jsmith@example.test' };

beforeEach(() => {
  getUserMock.mockReset();
  signInMock.mockReset();
  maybeSingleMock.mockReset();
  updateMock.mockReset();
  updateMock.mockResolvedValue({ error: null });
});

describe('supabase refreshSession (cache-preserving failure modes)', () => {
  it('keeps the cached user and writes NOTHING when the profile read fails', async () => {
    getUserMock.mockResolvedValue({ data: { user: authedUser }, error: null });
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: 'network hiccup' } });

    const result = await authService.refreshSession(cachedAdmin);

    // A transient profiles failure must not downgrade the role, reset the
    // stats, or write defaults back over the real row.
    expect(result).toEqual(cachedAdmin);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('keeps the cached user on a retryable (offline) auth error', async () => {
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthRetryableFetchError', status: 0 },
    });

    const result = await authService.refreshSession(cachedAdmin);

    expect(result).toEqual(cachedAdmin);
    expect(maybeSingleMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('returns null (logout) when the session is positively rejected', async () => {
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthApiError', status: 401 },
    });

    const result = await authService.refreshSession(cachedAdmin);
    expect(result).toBeNull();
  });

  it('refreshes from the live profile and writes back on the happy path', async () => {
    getUserMock.mockResolvedValue({ data: { user: authedUser }, error: null });
    maybeSingleMock.mockResolvedValue({
      data: {
        username: 'jsmith',
        display_name: 'J. Smith',
        role: 'teacher',
        preferences: { theme: 'dark' },
        stats: { xp: 5000 },
      },
      error: null,
    });

    const result = await authService.refreshSession(cachedAdmin);

    // This also covers the server-side role-change path: the cached user was
    // an admin, the live profile says teacher, and the refresh downgrades the
    // session to the distinct (non-system-admin) teacher role.
    expect(result?.role).toBe('teacher');
    expect(result?.stats.xp).toBe(5000);
    expect(updateMock).toHaveBeenCalledTimes(1);
    const payload = updateMock.mock.calls[0][0] as { stats: { xp: number } };
    expect(payload.stats.xp).toBe(5000);
  });

  it('leaves guest sessions untouched', async () => {
    const guest: User = { ...cachedAdmin, username: 'guest', role: 'guest' };
    const result = await authService.refreshSession(guest);
    expect(result).toBe(guest);
    expect(getUserMock).not.toHaveBeenCalled();
  });
});

describe('supabase login (write-back safety)', () => {
  it('logs in with session defaults but skips the write-back when the profile read fails', async () => {
    signInMock.mockResolvedValue({ data: { user: authedUser }, error: null });
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: 'rest 503' } });

    const user = await authService.login('jsmith@example.test', 'pw');

    expect(user.username).toBe('jsmith@example.test');
    // Defaults are used for the session, but the real row is not overwritten.
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('writes back stats/preferences when the profile was actually read', async () => {
    signInMock.mockResolvedValue({ data: { user: authedUser }, error: null });
    maybeSingleMock.mockResolvedValue({
      data: { username: 'jsmith', display_name: 'J', role: 'student', preferences: {}, stats: {} },
      error: null,
    });

    const user = await authService.login('jsmith@example.test', 'pw');

    expect(user.role).toBe('user');
    expect(updateMock).toHaveBeenCalledTimes(1);
  });
});
