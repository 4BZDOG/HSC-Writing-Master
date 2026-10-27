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

const safeSetItem = vi.fn();

vi.mock('../../utils/storageUtils', () => ({
  safeSetItem: (key: string, value: unknown) => safeSetItem(key, value),
  STORAGE_KEYS: { AUTH_USER: 'hsc-ai-auth-user-v2' },
}));

const {
  agreementPromptReason,
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
  safeSetItem.mockClear();
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

  it('re-asks a promoted account, because the staff charter is a different deal', () => {
    // Accepted the CURRENT version, but as a student. The staff charter covers
    // student visibility and moderation, which they have never agreed to.
    const promoted = makeUser({
      role: 'teacher',
      agreement: { version: AGREEMENT_VERSION, acceptedAt: Date.now(), audience: 'student' },
    });
    expect(needsAgreement(promoted)).toBe(true);
    expect(agreementPromptReason(promoted)).toBe('roleChanged');
    // ...and is NOT told the agreement changed, because it did not.
    expect(isReAcceptance(promoted)).toBe(false);
  });

  it('leaves a matching audience alone', () => {
    const teacher = makeUser({
      role: 'teacher',
      agreement: { version: AGREEMENT_VERSION, acceptedAt: Date.now(), audience: 'teacher' },
    });
    expect(needsAgreement(teacher)).toBe(false);
  });

  it('honours an old record that pre-dates audience tracking', () => {
    // Re-prompting everyone who accepted before we added the field would be a
    // self-inflicted wound; an acceptance is not invalidated by a later column.
    const legacy = makeUser({
      agreement: { version: AGREEMENT_VERSION, acceptedAt: Date.now() },
    });
    expect(needsAgreement(legacy)).toBe(false);
    expect(agreementPromptReason(legacy)).toBe('none');
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
  it('routes staff to the teacher charter and students and guests to the student one', () => {
    expect(audienceForRole('admin')).toBe('teacher');
    expect(audienceForRole('teacher')).toBe('teacher');
    expect(audienceForRole('user')).toBe('student');
    expect(audienceForRole('guest')).toBe('student');
    expect(charterForRole('teacher').audience).toBe('teacher');
  });

  it('gives a parent or guardian their own charter, not the student one', () => {
    expect(audienceForRole('parent')).toBe('parent');
    expect(charterForRole('parent').audience).toBe('parent');
    expect(charterForRole('parent').title).not.toBe(charterForRole('user').title);
  });
});

describe('re-prompting a parent whose charter was the student one', () => {
  it('asks a parent who accepted as a student, although the version has not moved', () => {
    // Every parent accepted the student charter before this one existed. Their
    // record names 'student', so the mismatch alone brings them back.
    const parent = makeUser({
      role: 'parent',
      agreement: { version: AGREEMENT_VERSION, acceptedAt: Date.now(), audience: 'student' },
    });
    expect(needsAgreement(parent)).toBe(true);
    expect(agreementPromptReason(parent)).toBe('roleChanged');
    expect(isReAcceptance(parent)).toBe(false);
  });

  it('asks a parent whose record pre-dates audience tracking, which is the same charter', () => {
    const legacyParent = makeUser({
      role: 'parent',
      agreement: { version: AGREEMENT_VERSION, acceptedAt: Date.now() },
    });
    expect(agreementPromptReason(legacyParent)).toBe('roleChanged');
  });

  it('leaves a parent who has accepted the parent charter alone', () => {
    const parent = makeUser({
      role: 'parent',
      agreement: { version: AGREEMENT_VERSION, acceptedAt: Date.now(), audience: 'parent' },
    });
    expect(needsAgreement(parent)).toBe(false);
  });

  it('still honours a pre-audience record for a student, as before', () => {
    const legacyStudent = makeUser({
      role: 'user',
      agreement: { version: AGREEMENT_VERSION, acceptedAt: Date.now() },
    });
    expect(agreementPromptReason(legacyStudent)).toBe('none');
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
    expect(updated.agreement?.audience).toBe('student');
    expect(updated.agreement?.acceptedAt).toBeGreaterThan(0);
    expect(needsAgreement(updated)).toBe(false);
    expect(updateUser).toHaveBeenCalledWith(expect.objectContaining({ agreement: updated.agreement }));
  });

  it('records acceptance synchronously, before any await', async () => {
    // A user who clicks Agree and immediately reloads (or closes the tab, or
    // is on a slow device) must not be asked all over again. The cached user
    // has to carry the acceptance before the IndexedDB round trip, not after.
    let cachedBeforeAwait: unknown = null;
    updateUser.mockImplementationOnce(async () => {
      cachedBeforeAwait = safeSetItem.mock.calls[0]?.[1];
    });

    await acceptAgreement(makeUser());

    expect(safeSetItem).toHaveBeenCalledWith(
      'hsc-ai-auth-user-v2',
      expect.objectContaining({ agreement: expect.objectContaining({ version: AGREEMENT_VERSION }) })
    );
    expect(cachedBeforeAwait).toBeTruthy();
  });

  it('still lets the user through when local storage refuses the write', async () => {
    updateUser.mockRejectedValueOnce(new Error('IndexedDB unavailable'));
    const updated = await acceptAgreement(makeUser());
    // A storage failure must not become a locked door.
    expect(updated.agreement?.version).toBe(AGREEMENT_VERSION);
  });

  it('records which charter a teacher actually read', async () => {
    const updated = await acceptAgreement(makeUser({ role: 'teacher' }));
    expect(updated.agreement?.audience).toBe('teacher');
  });

  it('records the parent charter for a parent, so the re-prompt does not fire again', async () => {
    const updated = await acceptAgreement(makeUser({ role: 'parent' }));
    expect(updated.agreement?.audience).toBe('parent');
    expect(needsAgreement(updated)).toBe(false);
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
