import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * What a failed Supabase password sign-in says.
 *
 * Every failure used to become "Invalid username or password" — so a student
 * who was offline, rate-limited, or had not yet followed their confirmation
 * link was told their password was wrong. Only a real credential rejection may
 * keep that wording; LoginPage matches on it to restate it in full.
 */

const signInWithPasswordMock = vi.fn();

vi.mock('../../services/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      signInWithPassword: (...args: unknown[]) => signInWithPasswordMock(...args),
      getSession: vi.fn(),
      getUser: vi.fn(),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  },
  fetchAllRows: vi.fn(),
}));

import { authService } from '../../services/authService';

const failWith = (error: Record<string, unknown>) =>
  signInWithPasswordMock.mockResolvedValue({ data: { user: null, session: null }, error });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('authService.login error wording (Supabase)', () => {
  it('keeps the credential wording for a genuine rejection', async () => {
    failWith({ message: 'Invalid login credentials', status: 400, code: 'invalid_credentials' });
    await expect(authService.login('a@b.edu', 'x')).rejects.toThrow('Invalid username or password');
  });

  it('says the account is unconfirmed rather than that the password is wrong', async () => {
    failWith({ message: 'Email not confirmed', status: 400, code: 'email_not_confirmed' });
    await expect(authService.login('a@b.edu', 'x')).rejects.toThrow(/not been confirmed/i);
  });

  it('says the service could not be reached when offline', async () => {
    failWith({ message: 'Failed to fetch', name: 'AuthRetryableFetchError', status: 0 });
    await expect(authService.login('a@b.edu', 'x')).rejects.toThrow(/could not reach/i);
  });

  it('says to wait when rate-limited', async () => {
    failWith({ message: 'Request rate limit reached', status: 429 });
    await expect(authService.login('a@b.edu', 'x')).rejects.toThrow(/too many sign-in attempts/i);
  });

  it('treats an error with no status as a rejection, not an outage', async () => {
    failWith({ message: 'Something odd' });
    await expect(authService.login('a@b.edu', 'x')).rejects.toThrow('Invalid username or password');
  });
});
