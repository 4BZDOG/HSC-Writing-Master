import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EvaluationResult } from '../../types';

// --- Mocks: a chainable Supabase stub + toggleable "remote" mode ------------
const getUserMock = vi.fn();
const upsertMock = vi.fn();
const insertMock = vi.fn();
const updateEqEqMock = vi.fn();
const resolvePromptRowIdMock = vi.fn();
const isRemoteMock = vi.fn();
const rpcMock = vi.fn();

vi.mock('../../services/supabaseClient', () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => getUserMock(...a) },
    rpc: (name: string, args: unknown) => rpcMock(name, args),
    from: (table: string) => ({
      upsert: (row: unknown, opts: unknown) => upsertMock(row, opts),
      insert: (row: unknown) => insertMock(table, row),
      update: (payload: unknown) => ({
        eq: () => ({ eq: () => updateEqEqMock(payload) }),
      }),
    }),
  },
}));
vi.mock('../../services/curriculumService', () => ({
  isCurriculumRemote: () => isRemoteMock(),
}));
vi.mock('../../services/contributionService', () => ({
  resolvePromptRowId: (...a: unknown[]) => resolvePromptRowIdMock(...a),
}));

import {
  buildResponseRow,
  buildEventRow,
  persistResponse,
  saveResponseFeedback,
  fetchClassAnalytics,
  fetchResponseStudents,
  fetchStudentProgress,
  fetchMyClasses,
} from '../../services/responseService';

const result: EvaluationResult = {
  overallMark: 7,
  overallBand: 5,
  overallFeedback: 'Solid.',
  strengths: ['clear'],
  improvements: ['depth'],
  criteria: [],
};

describe('buildResponseRow', () => {
  it('maps app data to the DB row shape', () => {
    const row = buildResponseRow(
      'prompt-uuid',
      'user-uuid',
      { draft: 'my answer', wordCount: 2, result },
      new Date('2026-07-05T00:00:00Z')
    );
    expect(row).toEqual({
      prompt_id: 'prompt-uuid',
      user_id: 'user-uuid',
      draft: 'my answer',
      word_count: 2,
      overall_mark: 7,
      overall_band: 5,
      evaluation: result,
      updated_at: '2026-07-05T00:00:00.000Z',
    });
  });

  it('coerces a bad word count to a non-negative integer', () => {
    expect(buildResponseRow('p', 'u', { draft: '', wordCount: -3, result }).word_count).toBe(0);
    expect(buildResponseRow('p', 'u', { draft: '', wordCount: 4.9, result }).word_count).toBe(4);
    expect(buildResponseRow('p', 'u', { draft: '', wordCount: NaN, result }).word_count).toBe(0);
  });
});

describe('buildEventRow', () => {
  it('maps to the append-only event shape (no draft text)', () => {
    expect(
      buildEventRow('prompt-uuid', 'user-uuid', { draft: 'x', wordCount: 12, result })
    ).toEqual({
      prompt_id: 'prompt-uuid',
      user_id: 'user-uuid',
      mark: 7,
      band: 5,
      word_count: 12,
    });
  });
});

describe('persistResponse', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    upsertMock.mockReset();
    insertMock.mockReset();
    resolvePromptRowIdMock.mockReset();
    isRemoteMock.mockReset();
    upsertMock.mockResolvedValue({ error: null });
    insertMock.mockResolvedValue({ error: null });
  });

  it('no-ops in local mode (never touches the client)', async () => {
    isRemoteMock.mockReturnValue(false);
    await persistResponse('prompt-1', { draft: 'x', wordCount: 1, result });
    expect(getUserMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('no-ops when there is no signed-in user', async () => {
    isRemoteMock.mockReturnValue(true);
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    await persistResponse('prompt-1', { draft: 'x', wordCount: 1, result });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('no-ops when the prompt has no shared-library row', async () => {
    isRemoteMock.mockReturnValue(true);
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    resolvePromptRowIdMock.mockResolvedValue(null);
    await persistResponse('local-only', { draft: 'x', wordCount: 1, result });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('upserts one row per (user, prompt) when everything resolves', async () => {
    isRemoteMock.mockReturnValue(true);
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    resolvePromptRowIdMock.mockResolvedValue('prompt-uuid');
    await persistResponse('prompt-app-id', { draft: 'answer', wordCount: 1, result });

    expect(upsertMock).toHaveBeenCalledTimes(1);
    const [row, opts] = upsertMock.mock.calls[0];
    expect(row).toMatchObject({
      prompt_id: 'prompt-uuid',
      user_id: 'user-1',
      overall_mark: 7,
      overall_band: 5,
    });
    expect(opts).toEqual({ onConflict: 'user_id,prompt_id' });

    // …and appends a history event to response_events.
    expect(insertMock).toHaveBeenCalledTimes(1);
    const [table, eventRow] = insertMock.mock.calls[0];
    expect(table).toBe('response_events');
    expect(eventRow).toEqual({
      prompt_id: 'prompt-uuid',
      user_id: 'user-1',
      mark: 7,
      band: 5,
      word_count: 1,
    });
  });

  it('never throws when the write fails', async () => {
    isRemoteMock.mockReturnValue(true);
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    resolvePromptRowIdMock.mockResolvedValue('prompt-uuid');
    upsertMock.mockResolvedValue({ error: { message: 'boom' } });
    await expect(
      persistResponse('p', { draft: 'x', wordCount: 1, result })
    ).resolves.toBeUndefined();
  });
});

describe('saveResponseFeedback', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    updateEqEqMock.mockReset();
    resolvePromptRowIdMock.mockReset();
    isRemoteMock.mockReset();
    updateEqEqMock.mockResolvedValue({ error: null });
  });

  it('updates the stored response with the rating', async () => {
    isRemoteMock.mockReturnValue(true);
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    resolvePromptRowIdMock.mockResolvedValue('prompt-uuid');
    await saveResponseFeedback('prompt-app-id', {
      rating: 'positive',
      reason: 'helpful',
      timestamp: 123,
    });
    expect(updateEqEqMock).toHaveBeenCalledTimes(1);
    expect(updateEqEqMock.mock.calls[0][0]).toMatchObject({
      user_feedback: { rating: 'positive', reason: 'helpful', timestamp: 123 },
    });
  });

  it('no-ops in local mode', async () => {
    isRemoteMock.mockReturnValue(false);
    await saveResponseFeedback('p', { rating: 'negative', reason: '', timestamp: 1 });
    expect(updateEqEqMock).not.toHaveBeenCalled();
  });
});


/**
 * The class-scope argument (schema §19) has one property worth pinning: it must
 * be OMITTED, not sent as null, when no class is selected. PostgREST resolves
 * overloads by argument name, so naming `p_class_id` against a database that
 * predates §19 fails the call outright instead of falling back to the unscoped
 * function — which would break Class Insights for anyone running the client
 * ahead of the migration.
 */
describe('class-scoped analytics arguments', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    rpcMock.mockResolvedValue({ data: null, error: null });
  });

  it('omits p_class_id entirely when no class is selected', async () => {
    await fetchClassAnalytics(30);
    expect(rpcMock).toHaveBeenCalledWith('get_class_analytics', { p_days: 30 });
    expect(rpcMock.mock.calls[0][1]).not.toHaveProperty('p_class_id');
  });

  it('omits p_class_id when passed null or undefined explicitly', async () => {
    await fetchClassAnalytics(30, null);
    await fetchClassAnalytics(30, undefined);
    for (const call of rpcMock.mock.calls) {
      expect(call[1]).not.toHaveProperty('p_class_id');
    }
  });

  it('sends p_class_id when a class is selected', async () => {
    await fetchClassAnalytics(90, 'class-uuid-1');
    expect(rpcMock).toHaveBeenCalledWith('get_class_analytics', {
      p_days: 90,
      p_class_id: 'class-uuid-1',
    });
  });

  it('applies the same rule to the roster and to per-student progress', async () => {
    await fetchResponseStudents(30);
    expect(rpcMock).toHaveBeenLastCalledWith('get_response_students', { p_days: 30 });

    await fetchResponseStudents(30, 'c1');
    expect(rpcMock).toHaveBeenLastCalledWith('get_response_students', {
      p_days: 30,
      p_class_id: 'c1',
    });

    rpcMock.mockResolvedValue({ data: { username: 'x', byVerb: [], totals: {} }, error: null });
    await fetchStudentProgress('jsmith', 30);
    expect(rpcMock).toHaveBeenLastCalledWith('get_student_progress', {
      p_username: 'jsmith',
      p_days: 30,
    });

    await fetchStudentProgress('jsmith', 30, 'c2');
    expect(rpcMock).toHaveBeenLastCalledWith('get_student_progress', {
      p_username: 'jsmith',
      p_days: 30,
      p_class_id: 'c2',
    });
  });

  it('returns the empty analytics shape rather than null', async () => {
    const data = await fetchClassAnalytics(30);
    expect(data.byVerb).toEqual([]);
    expect(data.byTopic).toEqual([]);
    expect(data.totals.total_attempts).toBe(0);
  });

  it('surfaces an analytics error rather than swallowing it', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'nope' } });
    await expect(fetchClassAnalytics(30)).rejects.toThrow(/nope/);
  });

  it('degrades to an empty class list on a pre-§19 database', async () => {
    // list_my_classes does not exist there. A thrown error would surface as a
    // toast the user cannot act on; an empty list just means "no class filter".
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'function public.list_my_classes() does not exist' },
    });
    await expect(fetchMyClasses()).resolves.toEqual([]);
    warn.mockRestore();
  });

  it('returns the classes the caller teaches', async () => {
    rpcMock.mockResolvedValue({
      data: [{ id: 'c1', name: 'Year 12 A', year: 12, school: 'Riverbank', students: 12 }],
      error: null,
    });
    const classes = await fetchMyClasses();
    expect(classes).toHaveLength(1);
    expect(classes[0].name).toBe('Year 12 A');
  });
});
