import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { Course } from '../../types';

/**
 * The debounced auto-save (hooks/useSyllabusData.ts) reports a StorageStatus.
 * When a save fails ('Error') the header shows a passive badge — easy to miss
 * while typing — so the hook also raises an active toast on the transition
 * into failure, and a recovery toast when saving starts working again. Both
 * are guarded (a ref) so they fire once per transition, not on every 1s tick
 * while storage stays broken.
 */

vi.mock('../../utils/storageUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/storageUtils')>();
  return {
    ...actual,
    loadCoursesFromDB: vi.fn(),
    saveCoursesToDB: vi.fn(),
    fetchLibrary: vi.fn().mockResolvedValue([]),
    safeGetItem: vi.fn(() => actual.DATA_VERSION),
    safeSetItem: vi.fn(),
    createBackup: vi.fn().mockResolvedValue(undefined),
    saveToLibrary: vi.fn(),
    deleteFromLibrary: vi.fn(),
  };
});

vi.mock('../../services/curriculumService', () => ({
  fetchRemoteCourses: vi.fn(),
  isCurriculumRemote: vi.fn(() => false),
}));

import { useSyllabusData } from '../../hooks/useSyllabusData';
import { loadCoursesFromDB, saveCoursesToDB as saveCoursesToDBImport } from '../../utils/storageUtils';

const saveCoursesToDB = saveCoursesToDBImport as unknown as ReturnType<typeof vi.fn>;

const baseCourse = (): Course => ({
  id: 'course-1',
  name: 'Software Engineering',
  outcomes: [],
  topics: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  (loadCoursesFromDB as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: [baseCourse()],
    source: 'IndexedDB',
  });
});

describe('useSyllabusData — auto-save failure surfacing', () => {
  it('raises an error toast once when a save fails, then a recovery toast when it succeeds again', async () => {
    const showToast = vi.fn();
    saveCoursesToDB.mockResolvedValue('Error');

    const { result } = renderHook(() => useSyllabusData({ showToast }));
    await waitFor(() => expect(result.current.isReady).toBe(true));

    // A change kicks off the debounced save (1s), which fails.
    act(() => {
      result.current.handleCreateTopic('course-1', 'A New Topic');
    });

    await waitFor(
      () =>
        expect(showToast).toHaveBeenCalledWith(
          expect.stringContaining('not saving'),
          'error'
        ),
      { timeout: 4000 }
    );
    const errorCalls = showToast.mock.calls.filter(([, type]) => type === 'error').length;

    // A second failing change must NOT re-toast — the ref guards it.
    act(() => {
      result.current.handleCreateTopic('course-1', 'Another Topic');
    });
    await new Promise((r) => setTimeout(r, 1500));
    expect(showToast.mock.calls.filter(([, type]) => type === 'error').length).toBe(errorCalls);

    // Storage recovers; the next change surfaces a recovery toast.
    saveCoursesToDB.mockResolvedValue('IndexedDB');
    act(() => {
      result.current.handleCreateTopic('course-1', 'Third Topic');
    });

    await waitFor(
      () =>
        expect(showToast).toHaveBeenCalledWith(
          expect.stringContaining('recovered'),
          'success'
        ),
      { timeout: 4000 }
    );
  });

  it('does not toast about saving while storage is healthy', async () => {
    const showToast = vi.fn();
    saveCoursesToDB.mockResolvedValue('IndexedDB');

    const { result } = renderHook(() => useSyllabusData({ showToast }));
    await waitFor(() => expect(result.current.isReady).toBe(true));

    act(() => {
      result.current.handleCreateTopic('course-1', 'A New Topic');
    });
    await new Promise((r) => setTimeout(r, 1500));

    expect(showToast).not.toHaveBeenCalledWith(expect.stringContaining('not saving'), 'error');
    expect(showToast).not.toHaveBeenCalledWith(expect.stringContaining('recovered'), 'success');
  });
});
