import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from '../../types';

/**
 * Data rights are the one place where a bug is also a broken promise: the
 * Privacy Notice tells users they can take a copy of their data and delete it.
 * These lock in the two properties that matter — an export that is actually
 * about the caller and nobody else, and a deletion that never reports success
 * it did not achieve.
 */

const rpc = vi.fn();
const eq = vi.fn();
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));
const logout = vi.fn();
const deleteUserProfile = vi.fn().mockResolvedValue(undefined);

let supabaseConfigured = true;

vi.mock('../../services/supabaseClient', () => ({
  get supabase() {
    return supabaseConfigured
      ? {
          from,
          rpc,
          auth: { getSession: async () => ({ data: { session: { user: { id: 'uid-1' } } } }) },
        }
      : null;
  },
  get isSupabaseConfigured() {
    return supabaseConfigured;
  },
}));

vi.mock('../../services/authService', () => ({
  authService: { logout: () => logout() },
}));

vi.mock('../../utils/storageUtils', () => ({
  deleteUserProfile: (username: string) => deleteUserProfile(username),
}));

const { buildDataExport, deleteMyAccount } = await import('../../services/dataRightsService');

const makeUser = (overrides: Partial<User> = {}): User => ({
  username: 'student@example.com',
  role: 'user',
  displayName: 'Student',
  preferences: {
    defaultFocusMode: false,
    autoSave: true,
    highContrast: false,
    showTips: true,
    theme: 'dark',
  },
  stats: {
    xp: 120,
    level: 2,
    questionsAnswered: 4,
    totalWordsWritten: 900,
    averageBand: 4.2,
    lastActive: Date.now(),
    streakDays: 3,
  },
  ...overrides,
});

beforeEach(() => {
  supabaseConfigured = true;
  rpc.mockReset();
  eq.mockReset();
  from.mockClear();
  select.mockClear();
  logout.mockClear();
  deleteUserProfile.mockClear();
});

describe('exporting my data', () => {
  it('scopes the response query to the caller, not just to RLS', async () => {
    eq.mockResolvedValue({ data: [], error: null });
    await buildDataExport(makeUser());
    // A reviewer's session can read other people's responses. Without this
    // filter an export would quietly widen into somebody else's work.
    expect(eq).toHaveBeenCalledWith('user_id', 'uid-1');
  });

  it('includes the marking, not just the writing', async () => {
    eq.mockResolvedValue({
      data: [
        {
          prompt_id: 'p1',
          draft: 'My answer',
          overall_mark: 5,
          overall_band: 4,
          evaluation: { overallFeedback: 'Solid' },
          updated_at: '2026-07-01T00:00:00Z',
        },
      ],
      error: null,
    });
    const output = await buildDataExport(makeUser());
    expect(output.responses).toHaveLength(1);
    expect(output.responses[0].answer).toBe('My answer');
    // An export that returns your words but not the feedback on them is half
    // a copy of what we hold about you.
    expect(output.responses[0].evaluation).toEqual({ overallFeedback: 'Solid' });
  });

  it('carries the account, agreement and progress', async () => {
    eq.mockResolvedValue({ data: [], error: null });
    const output = await buildDataExport(
      makeUser({ agreement: { version: '1.0', acceptedAt: 1, audience: 'student' } })
    );
    expect(output.account.username).toBe('student@example.com');
    expect(output.agreement?.version).toBe('1.0');
    expect(output.progress.questionsAnswered).toBe(4);
    expect(output.notes.length).toBeGreaterThan(0);
  });

  it('says so when responses could not be read, rather than implying there are none', async () => {
    eq.mockResolvedValue({ data: null, error: { message: 'network' } });
    const output = await buildDataExport(makeUser());
    expect(output.responses).toEqual([]);
    expect(output.notes.join(' ')).toMatch(/could not be read/i);
  });

  it('tells a guest their session was never on our servers', async () => {
    const output = await buildDataExport(makeUser({ role: 'guest' }));
    expect(output.notes.join(' ')).toMatch(/guest session/i);
    expect(from).not.toHaveBeenCalled();
  });
});

describe('deleting my account', () => {
  it('asks the server to delete the caller, with no user-id to point elsewhere', async () => {
    rpc.mockResolvedValue({ error: null });
    const result = await deleteMyAccount(makeUser());

    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith('delete_my_account');
    // The RPC derives its target from auth.uid(); passing an id would make the
    // endpoint aimable at somebody else's account.
    expect(rpc.mock.calls[0]).toHaveLength(1);
    expect(deleteUserProfile).toHaveBeenCalledWith('student@example.com');
    expect(logout).toHaveBeenCalled();
  });

  it('never reports success it did not achieve', async () => {
    rpc.mockResolvedValue({ error: { message: 'function does not exist' } });
    const result = await deleteMyAccount(makeUser());

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/contact/i);
    // Crucially, the local record is NOT cleared — telling someone their data
    // is gone while the server still holds it is the worst possible outcome.
    expect(deleteUserProfile).not.toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
  });

  it('survives an unreachable server with an actionable message', async () => {
    rpc.mockRejectedValue(new Error('offline'));
    const result = await deleteMyAccount(makeUser());
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/connection/i);
  });

  it('clears a guest session locally without calling the server', async () => {
    const result = await deleteMyAccount(makeUser({ role: 'guest' }));
    expect(result.ok).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
    expect(deleteUserProfile).toHaveBeenCalledWith('student@example.com');
  });
});
