import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The student's own attempt history, read for the profile.
 *
 * The query is the one the RLS policy admits for a row owner (`can_view_student`
 * returns true for `auth.uid()`), so these tests pin its shape: the owner
 * filter, the newest-first order, the bounded limit, and the question embed the
 * verb comes from. The mock is a chainable stub; it never reaches Supabase.
 */

const getUserMock = vi.fn();
const limitMock = vi.fn();
const isRemoteMock = vi.fn();
const fromMock = vi.fn();
const selectMock = vi.fn();
const eqMock = vi.fn();
const orderMock = vi.fn();

vi.mock('../../services/supabaseClient', () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => getUserMock(...a) },
    from: (table: string) => {
      fromMock(table);
      return {
        select: (columns: string) => {
          selectMock(columns);
          return {
            eq: (col: string, value: unknown) => {
              eqMock(col, value);
              return {
                order: (column: string, opts: unknown) => {
                  orderMock(column, opts);
                  return { limit: (n: number) => limitMock(n) };
                },
              };
            },
          };
        },
      };
    },
  },
}));
vi.mock('../../services/curriculumService', () => ({
  isCurriculumRemote: () => isRemoteMock(),
}));
vi.mock('../../services/contributionService', () => ({
  resolvePromptRowId: vi.fn(),
  resolvePromptRowIds: vi.fn(),
}));

import { fetchMyAttemptHistory } from '../../services/responseService';

beforeEach(() => {
  vi.clearAllMocks();
  isRemoteMock.mockReturnValue(true);
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
});

describe('fetchMyAttemptHistory', () => {
  it('resolves to null in local mode, without touching the database', async () => {
    isRemoteMock.mockReturnValue(false);
    await expect(fetchMyAttemptHistory()).resolves.toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('resolves to null for a caller with no session, rather than an empty history', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    await expect(fetchMyAttemptHistory()).resolves.toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('reads only the caller’s own events, newest first, with the question embedded', async () => {
    limitMock.mockResolvedValue({
      data: [
        {
          mark: 5,
          band: 4,
          word_count: 180,
          created_at: '2026-09-08T10:00:00Z',
          prompts: { verb: 'analyse', total_marks: 6 },
        },
      ],
      error: null,
    });

    const attempts = await fetchMyAttemptHistory();

    expect(fromMock).toHaveBeenCalledWith('response_events');
    expect(selectMock.mock.calls[0][0]).toContain('prompts(verb, total_marks)');
    expect(eqMock).toHaveBeenCalledWith('user_id', 'user-1');
    expect(orderMock).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(limitMock).toHaveBeenCalledWith(200);
    expect(attempts).toEqual([
      {
        at: '2026-09-08T10:00:00Z',
        band: 4,
        mark: 5,
        totalMarks: 6,
        verb: 'ANALYSE',
        wordCount: 180,
      },
    ]);
  });

  it('keeps the limit a positive whole number', async () => {
    limitMock.mockResolvedValue({ data: [], error: null });
    await fetchMyAttemptHistory(0);
    expect(limitMock).toHaveBeenLastCalledWith(1);
    await fetchMyAttemptHistory(12.9);
    expect(limitMock).toHaveBeenLastCalledWith(12);
  });

  it('throws on a failed read, so the profile can say it could not load the history', async () => {
    limitMock.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    await expect(fetchMyAttemptHistory()).rejects.toThrow('permission denied');
  });
});
