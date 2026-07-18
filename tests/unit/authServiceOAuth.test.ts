import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * OAuth/SSO robustness contracts:
 *  - the provider redirect returns to origin + BASE PATH (GitHub Pages
 *    sub-path hosting), never bare origin;
 *  - Google sign-in always offers the account picker (shared school PCs);
 *  - the callback WAITS for supabase-js to finish processing the redirect
 *    instead of racing getSession() and dumping the user back on the login
 *    page;
 *  - no wait happens on a plain visit with no OAuth markers in the URL.
 */

const signInWithOAuthMock = vi.fn();
const getSessionMock = vi.fn();
const onAuthStateChangeMock = vi.fn();
const maybeSingleMock = vi.fn();
const updateMock = vi.fn();

vi.mock('../../services/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      signInWithOAuth: (...args: unknown[]) => signInWithOAuthMock(...args),
      getSession: (...args: unknown[]) => getSessionMock(...args),
      onAuthStateChange: (...args: unknown[]) => onAuthStateChangeMock(...args),
      getUser: vi.fn(),
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

const sessionUser = { id: 'user-1', email: 'student@school.nsw.edu.au' };

beforeEach(() => {
  vi.clearAllMocks();
  updateMock.mockResolvedValue({ error: null });
  maybeSingleMock.mockResolvedValue({ data: null, error: null });
  window.history.replaceState({}, '', '/');
  localStorage.clear();
});

describe('loginWithOAuth', () => {
  it('redirects back to origin + base path, not bare origin', async () => {
    signInWithOAuthMock.mockResolvedValue({ data: {}, error: null });
    await authService.loginWithOAuth('azure');
    const call = signInWithOAuthMock.mock.calls[0][0] as {
      provider: string;
      options: { redirectTo: string };
    };
    expect(call.provider).toBe('azure');
    expect(call.options.redirectTo).toBe(`${window.location.origin}/`);
  });

  it('asks Google for the account picker (shared school computers)', async () => {
    signInWithOAuthMock.mockResolvedValue({ data: {}, error: null });
    await authService.loginWithOAuth('google');
    const call = signInWithOAuthMock.mock.calls[0][0] as {
      options: { queryParams?: Record<string, string> };
    };
    expect(call.options.queryParams).toEqual({ prompt: 'select_account' });

    signInWithOAuthMock.mockClear();
    signInWithOAuthMock.mockResolvedValue({ data: {}, error: null });
    await authService.loginWithOAuth('azure');
    const azureCall = signInWithOAuthMock.mock.calls[0][0] as {
      options: { queryParams?: Record<string, string> };
    };
    expect(azureCall.options.queryParams).toBeUndefined();
  });
});

describe('handleOAuthCallback', () => {
  it('returns null quickly on a plain visit (no session, no OAuth markers)', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    const user = await authService.handleOAuthCallback();
    expect(user).toBeNull();
    expect(onAuthStateChangeMock).not.toHaveBeenCalled();
  });

  it('waits for the SIGNED_IN event when returning from a provider', async () => {
    // Mid OAuth-return: the URL carries the PKCE code but supabase-js has not
    // finished exchanging it yet, so the first getSession() reports nothing.
    window.history.replaceState({}, '', '/?code=pkce-abc123');
    getSessionMock.mockResolvedValue({ data: { session: null } });

    onAuthStateChangeMock.mockImplementation(
      (cb: (event: string, session: unknown) => void) => {
        // Simulate supabase-js completing the exchange a tick later.
        setTimeout(() => cb('SIGNED_IN', { user: sessionUser }), 10);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }
    );

    const user = await authService.handleOAuthCallback();
    expect(user).not.toBeNull();
    expect(user!.username).toBe('student@school.nsw.edu.au');
    // Token/code remnants are cleaned from the URL.
    expect(window.location.search).toBe('');
  });

  it('uses the session directly when the exchange already completed', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { user: sessionUser } } });
    const user = await authService.handleOAuthCallback();
    expect(user).not.toBeNull();
    expect(onAuthStateChangeMock).not.toHaveBeenCalled();
  });
});
