import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { Course } from '../../types';
import type { DiscoveredDoc } from '../../hooks/useSyllabusData';

/**
 * Adding syllabuses from the first-run picker (`importDiscoveredDocs`) must say
 * it worked when it did.
 *
 * It counted what it added INSIDE the courses updater and read the count right
 * after queuing it. React runs an updater on the spot only when nothing else is
 * queued on that state; with another courses update pending it runs later, so
 * the count read 0, the call returned false and the picker said "Import
 * sequence failed" while the syllabuses were being added behind it. The picker
 * stayed open over the app, and a new account could not get past it.
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
    createBackup: vi.fn().mockResolvedValue(true),
    saveToLibrary: vi.fn(),
    deleteFromLibrary: vi.fn(),
  };
});

vi.mock('../../services/curriculumService', () => ({
  fetchRemoteCourses: vi.fn(),
  isCurriculumRemote: vi.fn(() => false),
}));

import { useSyllabusData } from '../../hooks/useSyllabusData';
import {
  loadCoursesFromDB,
  saveCoursesToDB as saveCoursesToDBImport,
  createBackup as createBackupImport,
} from '../../utils/storageUtils';

const saveCoursesToDB = saveCoursesToDBImport as unknown as ReturnType<typeof vi.fn>;
const createBackup = createBackupImport as unknown as ReturnType<typeof vi.fn>;

const baseCourse = (): Course => ({
  id: 'course-1',
  name: 'Software Engineering',
  outcomes: [],
  topics: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  createBackup.mockResolvedValue(true);
  (loadCoursesFromDB as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: [baseCourse()],
    source: 'IndexedDB',
  });
});

describe('useSyllabusData — importing from the syllabus picker', () => {
  const courseDoc = (id: string, name: string): DiscoveredDoc => ({
    id: `doc-${id}`,
    name,
    source: 'courseData',
    type: 'course',
    data: { id, name, outcomes: [], topics: [] },
    selected: true,
  });

  it('reports success when another courses update is already queued', async () => {
    const showToast = vi.fn();
    saveCoursesToDB.mockResolvedValue('IndexedDB');
    const { result } = renderHook(() => useSyllabusData({ showToast }));
    await waitFor(() => expect(result.current.isReady).toBe(true));

    let ok: boolean | undefined;
    await act(async () => {
      // Queue a courses update first, so the import's updater cannot run on the spot.
      result.current.handleCreateTopic('course-1', 'A topic made a moment before');
      ok = await result.current.importDiscoveredDocs([courseDoc('course-2', 'Biology')]);
    });

    expect(ok).toBe(true);
    expect(showToast).toHaveBeenCalledWith('Added 1 syllabus.', 'success');
    expect(result.current.courses.map((c) => c.id)).toEqual(['course-1', 'course-2']);
  });

  it('still says nothing was added when every topic is missing its course', async () => {
    const showToast = vi.fn();
    saveCoursesToDB.mockResolvedValue('IndexedDB');
    const { result } = renderHook(() => useSyllabusData({ showToast }));
    await waitFor(() => expect(result.current.isReady).toBe(true));

    const orphan: DiscoveredDoc = {
      id: 'doc-topic',
      name: 'A topic',
      source: 'courseData',
      type: 'topic',
      targetCourseId: 'no-such-course',
      data: { id: 't-1', name: 'A topic', subTopics: [] } as unknown as DiscoveredDoc['data'],
      selected: true,
    };
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.importDiscoveredDocs([orphan]);
    });
    expect(ok).toBe(false);
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining('Nothing could be imported'),
      'info'
    );
  });
});
