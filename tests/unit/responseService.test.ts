import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EvaluationResult } from '../../types';

// --- Mocks: a chainable Supabase stub + toggleable "remote" mode ------------
const getUserMock = vi.fn();
const upsertMock = vi.fn();
const insertMock = vi.fn();
const updateEqEqMock = vi.fn();
const resolvePromptRowIdMock = vi.fn();
const isRemoteMock = vi.fn();

vi.mock('../../services/supabaseClient', () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => getUserMock(...a) },
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
