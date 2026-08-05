import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Password reset, both halves.
 *
 * The trap that shapes this whole feature: under PKCE a recovery link comes
 * back carrying the same bare `?code=` as an OAuth sign-in. If the app cannot
 * tell them apart it consumes the recovery as a sign-in — the user is silently
 * logged in and NEVER shown the form they asked for, so "reset my password"
 * appears to do nothing. That is why `requestPasswordReset` sends a marked
 * redirect (`?mode=reset`) and detection is a URL read rather than a race
 * between `PASSWORD_RECOVERY` and `SIGNED_IN`.
 *
 * The second shaping constraint is anti-enumeration: Supabase does not report
 * unknown addresses, and neither may we. "No account with that email" turns
 * this form into a way to discover who has one, which on a school deployment is
 * a roster of students.
 */

const resetPasswordForEmailMock = vi.fn();
const updateUserMock = vi.fn();
const signOutMock = vi.fn();
const maybeSingleMock = vi.fn();
const updateMock = vi.fn();

vi.mock('../../services/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      resetPasswordForEmail: (...args: unknown[]) => resetPasswordForEmailMock(...args),
      updateUser: (...args: unknown[]) => updateUserMock(...args),
      signOut: (...args: unknown[]) => signOutMock(...args),
      getSession: vi.fn(),
      getUser: vi.fn(),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => maybeSingleMock() }) }),
      update: (payload: unknown) => ({ eq: () => updateMock(payload) }),
    }),
  },
  fetchAllRows: vi.fn(),
}));

import { authService, PASSWORD_RESET_QUERY } from '../../services/authService';

const recoveredUser = { id: 'user-1', email: 'student@example.com' };

beforeEach(() => {
  vi.clearAllMocks();
  signOutMock.mockResolvedValue({ error: null });
  updateMock.mockResolvedValue({ error: null });
  maybeSingleMock.mockResolvedValue({ data: null, error: null });
  resetPasswordForEmailMock.mockResolvedValue({ data: {}, error: null });
  updateUserMock.mockResolvedValue({ data: { user: recoveredUser }, error: null });
  window.history.replaceState({}, '', '/');
  localStorage.clear();
});

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('requestPasswordReset', () => {
  it('sends a MARKED redirect so the return is not mistaken for an OAuth sign-in', async () => {
    await authService.requestPasswordReset('student@example.com');
    const [email, options] = resetPasswordForEmailMock.mock.calls[0];
    expect(email).toBe('student@example.com');
    expect(options.redirectTo).toBe(
      `${window.location.origin}/${PASSWORD_RESET_QUERY}`
    );
  });

  it('trims the address', async () => {
    await authService.requestPasswordReset('  student@example.com  ');
    expect(resetPasswordForEmailMock.mock.calls[0][0]).toBe('student@example.com');
  });

  it('resolves silently for an unknown address — no account enumeration', async () => {
    // Supabase returns success for an address with no account, on purpose. The
    // caller must not add the distinction back by surfacing an error here.
    await expect(authService.requestPasswordReset('nobody@example.com')).resolves.toBeUndefined();
  });

  it('surfaces a rate limit, which is the one failure the user can act on', async () => {
    resetPasswordForEmailMock.mockResolvedValue({
      data: {},
      error: { message: 'Email rate limit exceeded' },
    });
    await expect(authService.requestPasswordReset('a@example.com')).rejects.toThrow(
      /wait a minute/i
    );
  });

  it('stays quiet about any other error, so responses cannot be used to probe', async () => {
    resetPasswordForEmailMock.mockResolvedValue({
      data: {},
      error: { message: 'User not found' },
    });
    await expect(authService.requestPasswordReset('a@example.com')).resolves.toBeUndefined();
  });
});

describe('isPasswordRecovery', () => {
  it('recognises the marked return', () => {
    window.history.replaceState({}, '', `/${PASSWORD_RESET_QUERY}&code=abc123`);
    expect(authService.isPasswordRecovery()).toBe(true);
  });

  it('recognises the marker WHEREVER Supabase puts it in the query string', () => {
    // The order of `code` and `mode` in the return URL is Supabase's to choose,
    // not ours. A prefix match on `?mode=reset` passes the first case and
    // silently fails the second — and failing means the return falls through to
    // the OAuth path, the user is signed in without being asked for a password,
    // and the reset appears to have done nothing.
    window.history.replaceState({}, '', '/?code=abc123&mode=reset');
    expect(authService.isPasswordRecovery()).toBe(true);
  });

  it('is not fooled by a parameter that merely starts with the marker', () => {
    window.history.replaceState({}, '', '/?mode=resetting');
    expect(authService.isPasswordRecovery()).toBe(false);
  });

  it('recognises the implicit flow, which puts type=recovery in the hash', () => {
    window.history.replaceState({}, '', '/#access_token=x&type=recovery');
    expect(authService.isPasswordRecovery()).toBe(true);
  });

  it('does NOT claim a plain OAuth return', () => {
    // The whole point: a bare ?code= is a sign-in, not a recovery.
    window.history.replaceState({}, '', '/?code=abc123');
    expect(authService.isPasswordRecovery()).toBe(false);
  });

  it('does NOT claim an ordinary visit', () => {
    expect(authService.isPasswordRecovery()).toBe(false);
  });
});

describe('handleOAuthCallback during a recovery', () => {
  it('refuses to consume a recovery return as a sign-in', async () => {
    // Without this backstop the user is signed straight in and never sees the
    // form — the reset silently does nothing.
    window.history.replaceState({}, '', `/${PASSWORD_RESET_QUERY}&code=abc123`);
    await expect(authService.handleOAuthCallback()).resolves.toBeNull();
  });
});

describe('completePasswordReset', () => {
  it('sets the password and returns the signed-in user', async () => {
    const user = await authService.completePasswordReset('a-new-password');
    expect(updateUserMock).toHaveBeenCalledWith({ password: 'a-new-password' });
    // Proving control of the mailbox IS the authentication — sending them back
    // to type the password they just chose adds a step and no security.
    expect(user.username).toBe('student@example.com');
    expect(authService.getCurrentUser()).not.toBeNull();
  });

  it('scrubs the reset marker from the URL so a refresh does not re-enter', async () => {
    window.history.replaceState({}, '', `/${PASSWORD_RESET_QUERY}&code=abc123`);
    await authService.completePasswordReset('a-new-password');
    expect(window.location.search).toBe('');
  });

  it('explains an expired or already-used link', async () => {
    // Much the most common failure, and the one whose native wording explains
    // nothing: recovery links are single-use and short-lived.
    updateUserMock.mockResolvedValue({
      data: { user: null },
      error: { message: 'Auth session missing!' },
    });
    await expect(authService.completePasswordReset('a-new-password')).rejects.toThrow(
      /expired or has already been used.*request a new one/is
    );
  });

  it('treats a missing user with no error as the same expired link', async () => {
    updateUserMock.mockResolvedValue({ data: { user: null }, error: null });
    await expect(authService.completePasswordReset('a-new-password')).rejects.toThrow(/expired/i);
  });

  it('explains a rejected password reuse', async () => {
    updateUserMock.mockResolvedValue({
      data: { user: null },
      error: { message: 'New password should be different from the old password.' },
    });
    await expect(authService.completePasswordReset('same-as-before')).rejects.toThrow(
      /not used on this account before/i
    );
  });

  it('passes an unrecognised error through rather than inventing one', async () => {
    updateUserMock.mockResolvedValue({
      data: { user: null },
      error: { message: 'Database is on fire' },
    });
    await expect(authService.completePasswordReset('a-new-password')).rejects.toThrow(
      'Database is on fire'
    );
  });
});

describe('cancelPasswordRecovery', () => {
  it('signs out — the link already created a session before anything was chosen', async () => {
    // On a shared computer the person who opened the email is not necessarily
    // the account holder, so walking away must not leave them signed in.
    localStorage.setItem('hsc-ai-auth-user-v2', '{"username":"student"}');
    window.history.replaceState({}, '', `/${PASSWORD_RESET_QUERY}&code=abc123`);

    await authService.cancelPasswordRecovery();

    expect(signOutMock).toHaveBeenCalled();
    expect(authService.getCurrentUser()).toBeNull();
    expect(window.location.search).toBe('');
  });

  it('clears the URL before awaiting signOut, so a HANGING sign-out cannot trap the user', async () => {
    // A *rejected* signOut is caught and harmless. A hung one is the trap: with
    // the clear sequenced after the await it never runs, the marker stays in the
    // URL, and every reload lands back on a reset screen whose session is dead —
    // "link expired" on every attempt, with no route to the login page short of
    // editing the address bar. So the clear happens first, before any await.
    signOutMock.mockReturnValue(new Promise(() => {})); // never settles
    window.history.replaceState({}, '', `/${PASSWORD_RESET_QUERY}&code=abc123`);

    // Deliberately NOT awaited — the point is that the URL is already clean
    // while signOut is still in flight.
    void authService.cancelPasswordRecovery();
    await Promise.resolve();

    expect(window.location.search).toBe('');
    expect(authService.isPasswordRecovery()).toBe(false);
    expect(authService.getCurrentUser()).toBeNull();
  });
});
