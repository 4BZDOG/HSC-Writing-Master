import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * `authService.signUp` contracts.
 *
 * The two that carry real weight:
 *
 *  1. **Confirmation vs. active are different outcomes.** With email
 *     confirmation on, `signUp` returns a user and NO session — the account is
 *     inert until the emailed link is clicked. Treating that as a successful
 *     login drops the user on a dead session; treating an active signup as
 *     "check your email" sends them hunting for a mail that never comes.
 *
 *  2. **Supabase hides that an address is already taken.** Re-registering an
 *     existing email returns a normal-looking user with an EMPTY `identities`
 *     array rather than an error. Without detecting it the app says "check your
 *     email" for a mail that is never sent.
 */

const signUpMock = vi.fn();
const signInWithPasswordMock = vi.fn();
const maybeSingleMock = vi.fn();
const updateMock = vi.fn();

vi.mock('../../services/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      signUp: (...args: unknown[]) => signUpMock(...args),
      signInWithPassword: (...args: unknown[]) => signInWithPasswordMock(...args),
      getSession: vi.fn(),
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

const ORIGINAL_ENV = { ...import.meta.env };

/** A user object shaped like a real signup response (one linked identity). */
const newUser = { id: 'user-1', email: 'student@example.com', identities: [{ id: 'i1' }] };


/**
 * `import.meta.env` is declared readonly for the app, and rightly so — nothing
 * in the product may write to it. Under Vitest it is backed by `process.env`,
 * so a test CAN set and unset keys, which is the only way to exercise a
 * deployment-configuration branch. One narrow cast, named for what it is.
 */
const testEnv = import.meta.env as unknown as Record<string, string | undefined>;

beforeEach(() => {
  vi.clearAllMocks();
  updateMock.mockResolvedValue({ error: null });
  maybeSingleMock.mockResolvedValue({ data: null, error: null });
  signInWithPasswordMock.mockResolvedValue({
    data: { user: newUser, session: { access_token: 't' } },
    error: null,
  });
  localStorage.clear();
  // `delete`, not assignment: import.meta.env is backed by process.env here, so
  // assigning `undefined` stores the literal string "undefined" — which
  // parseAllowedDomains then reads as a domain named "undefined" and locks
  // everyone out. (It fails closed, which is the right direction, but it is not
  // what these tests mean to set up.)
  delete testEnv.VITE_ENABLE_SIGNUP;
  delete testEnv.VITE_SIGNUP_ALLOWED_DOMAINS;
});

afterEach(() => {
  delete testEnv.VITE_ENABLE_SIGNUP;
  delete testEnv.VITE_SIGNUP_ALLOWED_DOMAINS;
  Object.assign(import.meta.env, ORIGINAL_ENV);
});

describe('authService.signUp', () => {
  it('returns confirmation-required when no session comes back', async () => {
    signUpMock.mockResolvedValue({ data: { user: newUser, session: null }, error: null });

    const result = await authService.signUp('student@example.com', 'correct-horse');

    expect(result).toEqual({
      status: 'confirmation-required',
      email: 'student@example.com',
    });
    // Must NOT try to log in — there is nothing to log in with yet.
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  it('logs the user straight in when a session comes back', async () => {
    signUpMock.mockResolvedValue({
      data: { user: newUser, session: { access_token: 't' } },
      error: null,
    });

    const result = await authService.signUp('student@example.com', 'correct-horse');

    expect(result.status).toBe('active');
    // Routed through the ordinary login path, so streaks, plan and onboarding
    // state are applied rather than a second hand-built User drifting from it.
    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: 'student@example.com',
      password: 'correct-horse',
    });
  });

  it('detects the obfuscated "already registered" response', async () => {
    // Supabase's anti-enumeration shape: a user with no identities.
    signUpMock.mockResolvedValue({
      data: { user: { ...newUser, identities: [] }, session: null },
      error: null,
    });

    await expect(authService.signUp('taken@example.com', 'correct-horse')).rejects.toThrow(
      /already exists/i
    );
  });

  it('passes the display name through for handle_new_user', async () => {
    signUpMock.mockResolvedValue({ data: { user: newUser, session: null }, error: null });

    await authService.signUp('student@example.com', 'correct-horse', '  Jane Smith  ');

    const options = signUpMock.mock.calls[0][0].options;
    expect(options.data).toEqual({ display_name: 'Jane Smith' });
    // `username` is deliberately NOT sent: the trigger derives and de-duplicates
    // it from the email, and two sources of usernames means two usernames.
    expect(options.data.username).toBeUndefined();
  });

  it('omits metadata entirely when no display name is given', async () => {
    signUpMock.mockResolvedValue({ data: { user: newUser, session: null }, error: null });
    await authService.signUp('student@example.com', 'correct-horse', '   ');
    expect(signUpMock.mock.calls[0][0].options.data).toEqual({});
  });

  it('sends the confirmation link back to origin + base path', async () => {
    // Same trap as the OAuth redirect: bare origin 404s on sub-path hosting, so
    // the confirmation link would land nowhere.
    signUpMock.mockResolvedValue({ data: { user: newUser, session: null }, error: null });
    await authService.signUp('student@example.com', 'correct-horse');
    expect(signUpMock.mock.calls[0][0].options.emailRedirectTo).toBe(
      `${window.location.origin}/`
    );
  });

  it('trims the email before sending it', async () => {
    signUpMock.mockResolvedValue({ data: { user: newUser, session: null }, error: null });
    const result = await authService.signUp('  student@example.com  ', 'correct-horse');
    expect(signUpMock.mock.calls[0][0].email).toBe('student@example.com');
    expect(result).toMatchObject({ email: 'student@example.com' });
  });

  describe('deployment policy', () => {
    it('refuses when sign-up is switched off, without calling Supabase', async () => {
      testEnv.VITE_ENABLE_SIGNUP = 'false';
      await expect(authService.signUp('a@example.com', 'correct-horse')).rejects.toThrow(
        /switched off/i
      );
      expect(signUpMock).not.toHaveBeenCalled();
    });

    it('enforces the domain allowlist server-side of the form', async () => {
      // The form checks this too, but a form check is a suggestion that a
      // direct call ignores — this is the one that decides.
      testEnv.VITE_SIGNUP_ALLOWED_DOMAINS = 'education.nsw.gov.au';
      await expect(authService.signUp('someone@gmail.com', 'correct-horse')).rejects.toThrow(
        /@education\.nsw\.gov\.au/
      );
      expect(signUpMock).not.toHaveBeenCalled();
    });

    it('admits an address inside the allowlist', async () => {
      testEnv.VITE_SIGNUP_ALLOWED_DOMAINS = 'education.nsw.gov.au';
      signUpMock.mockResolvedValue({ data: { user: newUser, session: null }, error: null });
      await expect(
        authService.signUp('jane@education.nsw.gov.au', 'correct-horse')
      ).resolves.toMatchObject({ status: 'confirmation-required' });
    });
  });

  describe('error wording', () => {
    it('restates "already registered" as something actionable', async () => {
      signUpMock.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'User already registered' },
      });
      await expect(authService.signUp('a@example.com', 'correct-horse')).rejects.toThrow(
        /sign in instead/i
      );
    });

    it('explains a disabled-signups project setting', async () => {
      // Supabase can refuse at the project level too; the app-level switch is
      // not the only way this fails, and "Signups not allowed" alone tells a
      // student nothing they can do.
      signUpMock.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Signups not allowed for this instance' },
      });
      await expect(authService.signUp('a@example.com', 'correct-horse')).rejects.toThrow(
        /administrator/i
      );
    });

    it('surfaces a rate limit as a wait, not a failure', async () => {
      signUpMock.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Email rate limit exceeded' },
      });
      await expect(authService.signUp('a@example.com', 'correct-horse')).rejects.toThrow(
        /wait a minute/i
      );
    });

    it('passes an unrecognised error through rather than inventing one', async () => {
      signUpMock.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Database is on fire' },
      });
      await expect(authService.signUp('a@example.com', 'correct-horse')).rejects.toThrow(
        'Database is on fire'
      );
    });
  });
});
