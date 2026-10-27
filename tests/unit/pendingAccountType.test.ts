import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PENDING_ACCOUNT_TYPE_KEY,
  PENDING_ACCOUNT_TYPE_MAX_AGE_MS,
  clearPendingAccountType,
  readPendingParentChoice,
  rememberPendingAccountType,
} from '../../services/pendingAccountType';

/**
 * The parent choice carried across an OAuth redirect. The redirect leaves the
 * page, so the choice lives in localStorage between the sign-up button and the
 * callback. These pin the rules that make that safe: only a parent choice is
 * kept, it expires after 30 minutes, and blocked storage never throws.
 */

const NOW = 1_800_000_000_000;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('rememberPendingAccountType', () => {
  it('stores a parent choice with the time it was made', () => {
    rememberPendingAccountType('parent', NOW);
    expect(JSON.parse(localStorage.getItem(PENDING_ACCOUNT_TYPE_KEY)!)).toEqual({
      type: 'parent',
      at: NOW,
    });
  });

  it('stores nothing for a student, and clears an earlier parent choice', () => {
    rememberPendingAccountType('parent', NOW);
    rememberPendingAccountType('student', NOW);
    expect(localStorage.getItem(PENDING_ACCOUNT_TYPE_KEY)).toBeNull();
  });

  it('clears the choice on a plain sign-in (no type passed)', () => {
    rememberPendingAccountType('parent', NOW);
    rememberPendingAccountType(undefined, NOW);
    expect(localStorage.getItem(PENDING_ACCOUNT_TYPE_KEY)).toBeNull();
  });

  it('does not throw when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(() => rememberPendingAccountType('parent', NOW)).not.toThrow();
    expect(() => rememberPendingAccountType('student', NOW)).not.toThrow();
  });
});

describe('readPendingParentChoice', () => {
  it('is true for a fresh parent choice', () => {
    rememberPendingAccountType('parent', NOW);
    expect(readPendingParentChoice(NOW + 1000)).toBe(true);
  });

  it('is false when nothing was stored', () => {
    expect(readPendingParentChoice(NOW)).toBe(false);
  });

  it('expires after 30 minutes, the window the server allows', () => {
    rememberPendingAccountType('parent', NOW);
    expect(readPendingParentChoice(NOW + PENDING_ACCOUNT_TYPE_MAX_AGE_MS - 1)).toBe(true);
    expect(readPendingParentChoice(NOW + PENDING_ACCOUNT_TYPE_MAX_AGE_MS)).toBe(false);
  });

  it('is false for a choice dated in the future (a clock or a planted value)', () => {
    rememberPendingAccountType('parent', NOW + 60_000);
    expect(readPendingParentChoice(NOW)).toBe(false);
  });

  it('ignores anything that is not a parent choice', () => {
    localStorage.setItem(PENDING_ACCOUNT_TYPE_KEY, JSON.stringify({ type: 'admin', at: NOW }));
    expect(readPendingParentChoice(NOW)).toBe(false);
  });

  it('treats a corrupt value as absent rather than throwing', () => {
    localStorage.setItem(PENDING_ACCOUNT_TYPE_KEY, '{not json');
    expect(readPendingParentChoice(NOW)).toBe(false);
  });

  it('treats a value without a numeric time as absent', () => {
    localStorage.setItem(PENDING_ACCOUNT_TYPE_KEY, JSON.stringify({ type: 'parent', at: 'soon' }));
    expect(readPendingParentChoice(NOW)).toBe(false);
  });

  it('is false, and does not throw, when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(readPendingParentChoice(NOW)).toBe(false);
  });
});

describe('clearPendingAccountType', () => {
  it('removes the choice', () => {
    rememberPendingAccountType('parent', NOW);
    clearPendingAccountType();
    expect(readPendingParentChoice(NOW)).toBe(false);
  });

  it('does not throw when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(() => clearPendingAccountType()).not.toThrow();
  });
});
