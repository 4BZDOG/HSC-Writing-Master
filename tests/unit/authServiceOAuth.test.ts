import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * OAuth/SSO robustness contracts:
 *  - the provider redirect returns to origin + BASE PATH (GitHub Pages
 *    sub-path hosting), never bare origin;
 *  - EVERY provider offers the account picker (shared school PCs);
 *  - an email domain outside the allowlist is refused, and the session dropped;
 *  - the callback WAITS for supabase-js to finish processing the redirect
 *    instead of racing getSession() and dumping the user back on the login
 *    page;
 *  - no wait happens on a plain visit with no OAuth markers in the URL.
 */

const signInWithOAuthMock = vi.fn();
const signOutMock = vi.fn();
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
      signOut: (...args: unknown[]) => signOutMock(...args),
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


/**
 * `import.meta.env` is declared readonly for the app, and rightly so — nothing
 * in the product may write to it. Under Vitest it is backed by `process.env`,
 * so a test CAN set and unset keys, which is the only way to exercise a
 * deployment-configuration branch. One narrow cast, named for what it is.
 */
const testEnv = import.meta.env as unknown as Record<string, string | undefined>;

beforeEach(() => {
  vi.clearAllMocks();
  signOutMock.mockResolvedValue({ error: null });
  updateMock.mockResolvedValue({ error: null });
  maybeSingleMock.mockResolvedValue({ data: null, error: null });
  window.history.replaceState({}, '', '/');
  localStorage.clear();
  // `delete`, not assignment: import.meta.env is backed by process.env here, so
  // assigning undefined stores the literal string "undefined".
  delete testEnv.VITE_ALLOWED_EMAIL_DOMAINS;
  delete testEnv.VITE_SIGNUP_ALLOWED_DOMAINS;
});

afterEach(() => {
  delete testEnv.VITE_ALLOWED_EMAIL_DOMAINS;
  delete testEnv.VITE_SIGNUP_ALLOWED_DOMAINS;
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

  /**
   * A provider that is not switched on in the Supabase dashboard — which is
   * EVERY provider on a new project — fails with "Unsupported provider". That
   * string reaches a student on the login screen, where it names neither the
   * cause nor a way forward. The message must say which provider, who fixes
   * it, and what to do meanwhile.
   */
  it('translates a disabled provider into something a student can act on', async () => {
    signInWithOAuthMock.mockResolvedValue({
      data: {},
      error: { message: 'Unsupported provider: provider is not enabled' },
    });
    await expect(authService.loginWithOAuth('azure')).rejects.toThrow(
      /Microsoft sign-in is not enabled.*administrator.*email and password/s
    );
  });

  it('passes other OAuth failures through untouched', async () => {
    signInWithOAuthMock.mockResolvedValue({
      data: {},
      error: { message: 'Network request failed' },
    });
    await expect(authService.loginWithOAuth('google')).rejects.toThrow('Network request failed');
  });

  /**
   * The account picker, on EVERY provider.
   *
   * This asked Google alone, which missed the one a NSW DoE school actually
   * uses. On a shared classroom PC that meant the second student to sit down
   * was signed straight into the first student's account — their drafts, their
   * marks — with no prompt and nothing to notice. Entra and GitHub take the
   * same parameter, so there was never a reason to single Google out.
   */
  it.each(['google', 'azure', 'github'] as const)(
    'asks %s for the account picker (shared school computers)',
    async (provider) => {
      signInWithOAuthMock.mockResolvedValue({ data: {}, error: null });
      await authService.loginWithOAuth(provider);
      const call = signInWithOAuthMock.mock.calls[0][0] as {
        options: { queryParams?: Record<string, string> };
      };
      expect(call.options.queryParams).toEqual({ prompt: 'select_account' });
    }
  );
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

  /**
   * The domain gate on the SSO path.
   *
   * The allowlist covered self-registration only, which restricted nothing: a
   * MULTI-TENANT Entra registration — the account type a school needs so its
   * students can sign in — accepts any Microsoft work or school account in the
   * world, and Google accepts any Google account. Either way the arrival lands
   * as a `student` with a daily AI budget on this deployment's provider key.
   *
   * This refuses the SESSION. The auth.users row already exists by then (GoTrue
   * inserts it before the redirect returns) — the authoritative control is a
   * single-tenant Entra registration, and this is the layer that holds whatever
   * the provider is configured to do.
   */
  describe('email domain gate', () => {
    const outsider = { id: 'user-9', email: 'someone@gmail.com' };

    it('admits an address inside the allowlist', async () => {
      testEnv.VITE_ALLOWED_EMAIL_DOMAINS = 'school.nsw.edu.au';
      getSessionMock.mockResolvedValue({ data: { session: { user: sessionUser } } });
      await expect(authService.handleOAuthCallback()).resolves.not.toBeNull();
    });

    it('refuses an address outside it, naming the address and the rule', async () => {
      testEnv.VITE_ALLOWED_EMAIL_DOMAINS = 'education.nsw.gov.au';
      getSessionMock.mockResolvedValue({ data: { session: { user: outsider } } });
      await expect(authService.handleOAuthCallback()).rejects.toThrow(
        /someone@gmail\.com.*@education\.nsw\.gov\.au/s
      );
    });

    it('drops the Supabase session on refusal', async () => {
      // Without this the rejected user stays signed in to Supabase and a plain
      // refresh walks straight past the check.
      testEnv.VITE_ALLOWED_EMAIL_DOMAINS = 'education.nsw.gov.au';
      getSessionMock.mockResolvedValue({ data: { session: { user: outsider } } });
      localStorage.setItem('hsc-ai-auth-user-v2', '{"username":"someone"}');

      await expect(authService.handleOAuthCallback()).rejects.toThrow();

      expect(signOutMock).toHaveBeenCalled();
      expect(authService.getCurrentUser()).toBeNull();
    });

    it('admits anyone when no allowlist is configured', async () => {
      getSessionMock.mockResolvedValue({ data: { session: { user: outsider } } });
      await expect(authService.handleOAuthCallback()).resolves.not.toBeNull();
    });

    it('still honours the older sign-up-only variable name', async () => {
      testEnv.VITE_SIGNUP_ALLOWED_DOMAINS = 'education.nsw.gov.au';
      getSessionMock.mockResolvedValue({ data: { session: { user: outsider } } });
      await expect(authService.handleOAuthCallback()).rejects.toThrow(/cannot be used here/i);
    });
  });
});
