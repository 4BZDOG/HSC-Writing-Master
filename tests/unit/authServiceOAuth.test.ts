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
const rpcMock = vi.fn();

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
    rpc: (...args: unknown[]) => rpcMock(...args),
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
  rpcMock.mockResolvedValue({ data: { role: 'parent' }, error: null });
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

/**
 * A parent choice made on the sign-up form has to survive the provider redirect,
 * which leaves the app. `signInWithOAuth` cannot carry it, so it is kept in the
 * browser: written before the redirect, applied by the callback through
 * `claim_parent_account`, and forgotten afterwards. A refused claim must never
 * block the sign-in.
 */
describe('parent choice across the OAuth redirect', () => {
  const PENDING_KEY = 'hsc.pendingAccountType';
  const googleUser = {
    id: 'user-7',
    email: 'pat@gmail.com',
    app_metadata: { provider: 'google' },
  };

  const storedMarker = () => localStorage.getItem(PENDING_KEY);
  const freshParentMarker = () =>
    localStorage.setItem(PENDING_KEY, JSON.stringify({ type: 'parent', at: Date.now() }));

  it('stores the parent choice before leaving for the provider', async () => {
    let seenAtRedirect: string | null | undefined;
    signInWithOAuthMock.mockImplementation(() => {
      seenAtRedirect = storedMarker();
      return Promise.resolve({ data: {}, error: null });
    });
    await authService.loginWithOAuth('google', 'parent');
    expect(seenAtRedirect).not.toBeNull();
    expect(JSON.parse(seenAtRedirect!).type).toBe('parent');
  });

  it('a sign-in (no account type) clears a choice left by an earlier sign-up', async () => {
    freshParentMarker();
    signInWithOAuthMock.mockResolvedValue({ data: {}, error: null });
    await authService.loginWithOAuth('google');
    expect(storedMarker()).toBeNull();
  });

  it('forgets the choice when the provider refuses to start', async () => {
    signInWithOAuthMock.mockResolvedValue({
      data: {},
      error: { message: 'Network request failed' },
    });
    await expect(authService.loginWithOAuth('google', 'parent')).rejects.toThrow();
    expect(storedMarker()).toBeNull();
  });

  it('claims the parent role on return, and the user comes back as a parent', async () => {
    freshParentMarker();
    getSessionMock.mockResolvedValue({ data: { session: { user: googleUser } } });
    maybeSingleMock.mockResolvedValue({
      data: { username: 'pat', display_name: 'Pat', role: 'parent', preferences: {}, stats: {} },
      error: null,
    });

    const user = await authService.handleOAuthCallback();

    expect(rpcMock).toHaveBeenCalledWith('claim_parent_account');
    expect(user!.role).toBe('parent');
    expect(storedMarker()).toBeNull();
  });

  it('claims before the profile is read, so the role it loads is the new one', async () => {
    freshParentMarker();
    getSessionMock.mockResolvedValue({ data: { session: { user: googleUser } } });
    const order: string[] = [];
    rpcMock.mockImplementation(() => {
      order.push('claim');
      return Promise.resolve({ data: { role: 'parent' }, error: null });
    });
    maybeSingleMock.mockImplementation(() => {
      order.push('profile');
      return Promise.resolve({ data: null, error: null });
    });

    await authService.handleOAuthCallback();

    expect(order.indexOf('claim')).toBeLessThan(order.indexOf('profile'));
  });

  it('a refused claim keeps the sign-in, says why, and clears the choice', async () => {
    freshParentMarker();
    getSessionMock.mockResolvedValue({ data: { session: { user: googleUser } } });
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'This account already has work in it' },
    });
    const onNotice = vi.fn();

    const user = await authService.handleOAuthCallback({ onNotice });

    expect(user).not.toBeNull();
    expect(user!.role).toBe('user');
    expect(onNotice).toHaveBeenCalledWith(
      'This Google account already has a student account, so it stays a student account. ' +
        'To make a parent account, sign up with a different email.'
    );
    expect(storedMarker()).toBeNull();
  });

  it('a thrown claim error is treated as a refusal, not a failed sign-in', async () => {
    freshParentMarker();
    getSessionMock.mockResolvedValue({ data: { session: { user: googleUser } } });
    rpcMock.mockRejectedValue(new Error('network down'));
    const onNotice = vi.fn();

    await expect(authService.handleOAuthCallback({ onNotice })).resolves.not.toBeNull();
    expect(onNotice).toHaveBeenCalledTimes(1);
  });

  it('does not call the claim when no choice was made', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { user: googleUser } } });
    await authService.handleOAuthCallback();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('ignores a choice older than 30 minutes, and clears it', async () => {
    localStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ type: 'parent', at: Date.now() - 31 * 60 * 1000 })
    );
    getSessionMock.mockResolvedValue({ data: { session: { user: googleUser } } });
    const onNotice = vi.fn();

    await authService.handleOAuthCallback({ onNotice });

    expect(rpcMock).not.toHaveBeenCalled();
    expect(onNotice).not.toHaveBeenCalled();
    expect(storedMarker()).toBeNull();
  });

  it('forgets the choice when the domain gate refuses the account', async () => {
    testEnv.VITE_ALLOWED_EMAIL_DOMAINS = 'education.nsw.gov.au';
    freshParentMarker();
    getSessionMock.mockResolvedValue({ data: { session: { user: googleUser } } });

    await expect(authService.handleOAuthCallback()).rejects.toThrow();

    expect(rpcMock).not.toHaveBeenCalled();
    expect(storedMarker()).toBeNull();
  });
});
