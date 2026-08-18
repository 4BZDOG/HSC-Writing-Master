import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { Course } from '../../types';

/**
 * handleSetCourseStatus: the admin-only publish/hide toggle. Deleting the
 * field (rather than writing 'published') keeps the same absence-means-
 * default idiom as every other additive field in this hook, and the remote
 * sync only fires in Supabase mode — see hooks/useSyllabusData.ts.
 */

vi.mock('../../utils/storageUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/storageUtils')>();
  return {
    ...actual,
    loadCoursesFromDB: vi.fn(),
    saveCoursesToDB: vi.fn().mockResolvedValue(undefined),
    fetchLibrary: vi.fn().mockResolvedValue([]),
    safeGetItem: vi.fn(() => actual.DATA_VERSION),
    safeSetItem: vi.fn(),
    createBackup: vi.fn(),
    saveToLibrary: vi.fn(),
    deleteFromLibrary: vi.fn(),
  };
});

vi.mock('../../services/curriculumService', () => ({
  fetchRemoteCourses: vi.fn(),
  isCurriculumRemote: vi.fn(() => false),
}));

vi.mock('../../services/contributionService', () => ({
  saveSampleAnswerContribution: vi.fn(),
  saveTopicContribution: vi.fn(),
  saveSubTopicContribution: vi.fn(),
  saveDotPointContribution: vi.fn(),
  updateCourseStatus: vi.fn().mockResolvedValue(undefined),
}));

import { useSyllabusData } from '../../hooks/useSyllabusData';
import { loadCoursesFromDB } from '../../utils/storageUtils';
import { isCurriculumRemote, fetchRemoteCourses } from '../../services/curriculumService';
import { updateCourseStatus } from '../../services/contributionService';

const baseCourse = (): Course => ({
  id: 'course-1',
  name: 'Software Engineering',
  outcomes: [],
  topics: [],
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('handleSetCourseStatus — local (non-Supabase) mode', () => {
  beforeEach(() => {
    (isCurriculumRemote as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (loadCoursesFromDB as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [baseCourse()],
      source: 'IndexedDB',
    });
  });

  it('sets status: draft and does not touch the shared library', async () => {
    const showToast = vi.fn();
    const { result } = renderHook(() => useSyllabusData({ showToast }));
    await waitFor(() => expect(result.current.isReady).toBe(true));

    act(() => {
      result.current.handleSetCourseStatus('course-1', 'draft');
    });

    await waitFor(() => expect(result.current.courses[0].status).toBe('draft'));
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('hidden'), 'success');
    expect(updateCourseStatus).not.toHaveBeenCalled();
  });

  it('publishing deletes the field rather than writing "published"', async () => {
    const showToast = vi.fn();
    (loadCoursesFromDB as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ ...baseCourse(), status: 'draft' as const }],
      source: 'IndexedDB',
    });
    const { result } = renderHook(() => useSyllabusData({ showToast }));
    await waitFor(() => expect(result.current.isReady).toBe(true));

    act(() => {
      result.current.handleSetCourseStatus('course-1', 'published');
    });

    await waitFor(() => expect('status' in result.current.courses[0]).toBe(false));
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('published'), 'success');
    expect(updateCourseStatus).not.toHaveBeenCalled();
  });
});

describe('handleSetCourseStatus — Supabase mode', () => {
  beforeEach(() => {
    (isCurriculumRemote as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fetchRemoteCourses as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([baseCourse()]);
  });

  it('also syncs the flip to the shared library', async () => {
    const showToast = vi.fn();
    const { result } = renderHook(() => useSyllabusData({ showToast }));
    await waitFor(() => expect(result.current.isReady).toBe(true));

    act(() => {
      result.current.handleSetCourseStatus('course-1', 'draft');
    });

    await waitFor(() => expect(result.current.courses[0].status).toBe('draft'));
    await waitFor(() => expect(updateCourseStatus).toHaveBeenCalledWith('course-1', 'draft'));
  });

  it('shows an error toast when the remote sync fails, without reverting the local change', async () => {
    const showToast = vi.fn();
    (updateCourseStatus as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('network down')
    );
    const { result } = renderHook(() => useSyllabusData({ showToast }));
    await waitFor(() => expect(result.current.isReady).toBe(true));

    act(() => {
      result.current.handleSetCourseStatus('course-1', 'draft');
    });

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        expect.stringContaining('Could not sync visibility'),
        'error'
      )
    );
    expect(result.current.courses[0].status).toBe('draft');
  });
});
