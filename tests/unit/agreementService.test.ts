import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from '../../types';
import { AGREEMENT_VERSION } from '../../data/legalContent';
import { QUICK_START_VERSION } from '../../data/quickStartContent';

const updateUser = vi.fn().mockResolvedValue(undefined);

vi.mock('../../services/authService', () => ({
  authService: {
    updateUser: (user: User) => updateUser(user),
    getCurrentUser: () => null,
  },
}));

// Supabase unconfigured — the durable write is skipped and acceptance must
// still succeed locally. That is the mock-mode path most deployments run.
vi.mock('../../services/supabaseClient', () => ({
  supabase: null,
  isSupabaseConfigured: false,
}));

const {
  needsAgreement,
  isAgreementBlocking,
  isReAcceptance,
  changesSince,
  audienceForRole,
  charterForRole,
  acceptAgreement,
  needsQuickStart,
  markQuickStartSeen,
} = await import('../../services/agreementService');

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
    xp: 0,
    level: 1,
    questionsAnswered: 0,
    totalWordsWritten: 0,
    averageBand: 0,
    lastActive: Date.now(),
    streakDays: 1,
  },
  ...overrides,
});

beforeEach(() => {
  updateUser.mockClear();
});

describe('who has to accept', () => {
  it('asks a user who has never accepted', () => {
    expect(needsAgreement(makeUser())).toBe(true);
  });

  it('does not ask a user who accepted the current version', () => {
    const user = makeUser({ agreement: { version: AGREEMENT_VERSION, acceptedAt: Date.now() } });
    expect(needsAgreement(user)).toBe(false);
  });

  it('asks again when the agreement version moves on', () => {
    const user = makeUser({ agreement: { version: '0.9-old', acceptedAt: Date.now() } });
    expect(needsAgreement(user)).toBe(true);
    expect(isReAcceptance(user)).toBe(true);
  });

  it('blocks signed-in roles but never guests', () => {
    expect(isAgreementBlocking(makeUser({ role: 'user' }))).toBe(true);
    expect(isAgreementBlocking(makeUser({ role: 'teacher' }))).toBe(true);
    expect(isAgreementBlocking(makeUser({ role: 'admin' }))).toBe(true);
    expect(isAgreementBlocking(makeUser({ role: 'guest' }))).toBe(false);
  });

  it('has nothing to ask when there is no user', () => {
    expect(needsAgreement(null)).toBe(false);
    expect(isAgreementBlocking(null)).toBe(false);
  });
});

describe('which charter a role reads', () => {
  it('routes staff to the teacher charter and everyone else to the student one', () => {
    expect(audienceForRole('admin')).toBe('teacher');
    expect(audienceForRole('teacher')).toBe('teacher');
    expect(audienceForRole('user')).toBe('student');
    expect(audienceForRole('guest')).toBe('student');
    expect(charterForRole('teacher').audience).toBe('teacher');
  });
});

describe('what changed', () => {
  it('says nothing when there is no previous acceptance to compare against', () => {
    expect(changesSince(undefined)).toEqual([]);
  });

  it('says nothing for a version it has no record of, rather than inventing one', () => {
    expect(changesSince('99.0-never-shipped')).toEqual([]);
  });

  it('reports no changes for someone already on the current version', () => {
    expect(changesSince(AGREEMENT_VERSION)).toEqual([]);
  });
});

describe('recording acceptance', () => {
  it('stamps the current version and persists it', async () => {
    const user = makeUser();
    const updated = await acceptAgreement(user);

    expect(updated.agreement?.version).toBe(AGREEMENT_VERSION);
    expect(updated.agreement?.acceptedAt).toBeGreaterThan(0);
    expect(needsAgreement(updated)).toBe(false);
    expect(updateUser).toHaveBeenCalledWith(expect.objectContaining({ agreement: updated.agreement }));
  });

  it('still lets the user through when local storage refuses the write', async () => {
    updateUser.mockRejectedValueOnce(new Error('IndexedDB unavailable'));
    const updated = await acceptAgreement(makeUser());
    // A storage failure must not become a locked door.
    expect(updated.agreement?.version).toBe(AGREEMENT_VERSION);
  });

  it('leaves the rest of the user untouched', async () => {
    const user = makeUser({ displayName: 'Ada', stats: { ...makeUser().stats, xp: 420 } });
    const updated = await acceptAgreement(user);
    expect(updated.displayName).toBe('Ada');
    expect(updated.stats.xp).toBe(420);
  });
});

describe('quick start', () => {
  it('greets a new account', () => {
    expect(needsQuickStart(makeUser())).toBe(true);
  });

  it('stays out of the way once seen', async () => {
    const seen = await markQuickStartSeen(makeUser());
    expect(seen.quickStartSeenVersion).toBe(QUICK_START_VERSION);
    expect(needsQuickStart(seen)).toBe(false);
  });

  it('greets again when the guide is re-versioned', () => {
    expect(needsQuickStart(makeUser({ quickStartSeenVersion: '0.1-old' }))).toBe(true);
  });
});
