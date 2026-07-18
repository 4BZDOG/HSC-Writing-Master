import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from '../../types';

/**
 * The free daily evaluation counter must be scoped PER ACCOUNT: on a shared
 * computer (school library), one student burning their 5 free marks must not
 * consume a classmate's, and switching accounts must not reset anyone's count.
 */

let currentUsername: string | null = 'alice';

vi.mock('../../services/authService', () => ({
  authService: {
    getCurrentUser: () =>
      currentUsername
        ? ({ username: currentUsername, role: 'student', preferences: {} } as unknown as User)
        : null,
  },
}));

import {
  recordEvaluation,
  freeEvalsRemaining,
  isEvalLimitReached,
  FREE_TIER_EVAL_LIMIT,
} from '../../services/entitlements';

describe('free evaluation counter is per-account', () => {
  beforeEach(() => {
    localStorage.clear();
    currentUsername = 'alice';
  });

  it('counts evaluations against the signed-in account only', () => {
    recordEvaluation();
    recordEvaluation();
    expect(freeEvalsRemaining()).toBe(FREE_TIER_EVAL_LIMIT - 2);

    // A different student on the same machine has an untouched pool.
    currentUsername = 'bob';
    expect(freeEvalsRemaining()).toBe(FREE_TIER_EVAL_LIMIT);

    // Switching back restores alice's count — no reset by account-hopping.
    currentUsername = 'alice';
    expect(freeEvalsRemaining()).toBe(FREE_TIER_EVAL_LIMIT - 2);
  });

  it('reaches the limit independently per account', () => {
    for (let i = 0; i < FREE_TIER_EVAL_LIMIT; i++) recordEvaluation();
    expect(isEvalLimitReached()).toBe(true);

    currentUsername = 'bob';
    expect(isEvalLimitReached()).toBe(false);
  });
});
