import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * `authService.signUp` and the account type. A parent is created by sending
 * `account_type: 'parent'` in the sign-up metadata. A student sends nothing
 * extra, so the trigger's default (a student) applies and the metadata is the
 * same as it always was.
 */

const signUpMock = vi.fn();

vi.mock('../../services/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      signUp: (...args: unknown[]) => signUpMock(...args),
      signInWithPassword: vi.fn(),
      getSession: vi.fn(),
      getUser: vi.fn(),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  },
  fetchAllRows: vi.fn(),
}));

import { authService } from '../../services/authService';

const testEnv = import.meta.env as unknown as Record<string, string | undefined>;
const ORIGINAL_ENV = { ...import.meta.env };

/** Confirmation on, so signUp returns without needing a session. */
const pendingUser = { id: 'user-1', email: 'pat@example.com', identities: [{ id: 'i1' }] };

beforeEach(() => {
  vi.clearAllMocks();
  signUpMock.mockResolvedValue({ data: { user: pendingUser, session: null }, error: null });
  delete testEnv.VITE_ENABLE_SIGNUP;
  delete testEnv.VITE_SIGNUP_ALLOWED_DOMAINS;
  delete testEnv.VITE_ALLOWED_EMAIL_DOMAINS;
});

afterEach(() => {
  Object.assign(import.meta.env, ORIGINAL_ENV);
});

describe('authService.signUp account type', () => {
  it('sends account_type: parent in the metadata for a parent', async () => {
    await authService.signUp('pat@example.com', 'correct-horse', 'Pat Nguyen', 'parent');

    const options = signUpMock.mock.calls[0][0].options;
    expect(options.data).toEqual({ display_name: 'Pat Nguyen', account_type: 'parent' });
  });

  it('sends the parent account type even without a display name', async () => {
    await authService.signUp('pat@example.com', 'correct-horse', '', 'parent');

    expect(signUpMock.mock.calls[0][0].options.data).toEqual({ account_type: 'parent' });
  });

  it('sends nothing extra for a student, as before', async () => {
    await authService.signUp('sam@example.com', 'correct-horse', 'Sam');

    expect(signUpMock.mock.calls[0][0].options.data).toEqual({ display_name: 'Sam' });
  });

  it('treats an unknown account type as a student', async () => {
    await authService.signUp(
      'sam@example.com',
      'correct-horse',
      '',
      'administrator' as unknown as 'parent'
    );

    expect(signUpMock.mock.calls[0][0].options.data).toEqual({});
  });
});
