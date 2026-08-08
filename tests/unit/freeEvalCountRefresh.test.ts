import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { User } from '../../types';

/**
 * `get_evaluation_status()` (schema §14) reads today's marking count without
 * spending one. It existed for a while with no caller, which left the local
 * mirror correcting itself only on a refusal — so the two disagreed exactly
 * when it mattered: a second device, a fresh browser or cleared site data all
 * showed a full allowance the server had already spent, and the student found
 * out by writing an answer and waiting out the marking call.
 *
 * `refreshFreeEvalCount()` pulls the real figure in at sign-in.
 */

let currentUsername: string | null = 'alice';
const rpcMock = vi.fn();
let hasSupabase = true;

vi.mock('../../services/authService', () => ({
  authService: {
    getCurrentUser: () =>
      currentUsername
        ? ({ username: currentUsername, role: 'student', preferences: {} } as unknown as User)
        : null,
  },
}));

vi.mock('../../services/supabaseClient', () => ({
  get supabase() {
    return hasSupabase ? { rpc: rpcMock } : null;
  },
}));

import {
  refreshFreeEvalCount,
  freeEvalsRemaining,
  freeEvalLimit,
  isEvalLimitReached,
  FREE_TIER_EVAL_LIMIT,
} from '../../services/entitlements';

describe('refreshFreeEvalCount', () => {
  beforeEach(() => {
    localStorage.clear();
    rpcMock.mockReset();
    currentUsername = 'alice';
    hasSupabase = true;
  });

  it('adopts the count the server is actually enforcing', async () => {
    rpcMock.mockResolvedValue({ data: { used: 4, limit: 5, unlimited: false }, error: null });

    await refreshFreeEvalCount();

    // A browser that had never marked anything would have said 5 remaining.
    expect(freeEvalsRemaining()).toBe(1);
    expect(rpcMock).toHaveBeenCalledWith('get_evaluation_status');
  });

  it('adopts a limit an admin changed without a redeploy', async () => {
    rpcMock.mockResolvedValue({ data: { used: 2, limit: 20, unlimited: false }, error: null });

    await refreshFreeEvalCount();

    expect(freeEvalLimit()).toBe(20);
    expect(freeEvalsRemaining()).toBe(18);
  });

  it('reports the limit as reached when the server says it is', async () => {
    rpcMock.mockResolvedValue({ data: { used: 5, limit: 5, unlimited: false }, error: null });

    await refreshFreeEvalCount();

    expect(isEvalLimitReached()).toBe(true);
  });

  it('does not display a negative allowance for an unmetered caller', async () => {
    // limit -1 means "not metered at all" (staff, paid plan, licensed school).
    rpcMock.mockResolvedValue({ data: { used: 0, limit: -1, unlimited: true }, error: null });

    await refreshFreeEvalCount();

    expect(freeEvalLimit()).toBe(FREE_TIER_EVAL_LIMIT);
  });

  it('leaves the mirror alone when the RPC is missing (schema not migrated)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'function does not exist' } });

    await refreshFreeEvalCount();

    expect(freeEvalsRemaining()).toBe(FREE_TIER_EVAL_LIMIT);
  });

  it('leaves the mirror alone when Supabase is unreachable', async () => {
    rpcMock.mockRejectedValue(new Error('network down'));

    await expect(refreshFreeEvalCount()).resolves.toBeUndefined();
    expect(freeEvalsRemaining()).toBe(FREE_TIER_EVAL_LIMIT);
  });

  it('no-ops in mock mode, where there is no server to ask', async () => {
    hasSupabase = false;

    await refreshFreeEvalCount();

    expect(rpcMock).not.toHaveBeenCalled();
    expect(freeEvalsRemaining()).toBe(FREE_TIER_EVAL_LIMIT);
  });

  it('writes against the signed-in account, not a shared key', async () => {
    rpcMock.mockResolvedValue({ data: { used: 3, limit: 5, unlimited: false }, error: null });
    await refreshFreeEvalCount();
    expect(freeEvalsRemaining()).toBe(2);

    // A classmate on the same library machine keeps their own pool.
    currentUsername = 'bob';
    expect(freeEvalsRemaining()).toBe(FREE_TIER_EVAL_LIMIT);
  });
});

describe('the reconcile actually runs at sign-in', () => {
  const app = readFileSync(resolve(__dirname, '../../App.tsx'), 'utf8');

  it('is called from App, not merely exported', () => {
    // The RPC sat unused for several releases. A unit test of the function
    // alone would not have noticed, so pin the call site too.
    expect(app).toContain('refreshFreeEvalCount()');
  });
});
