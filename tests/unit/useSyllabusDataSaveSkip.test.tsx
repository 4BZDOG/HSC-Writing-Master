import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { Course } from '../../types';

/**
 * The debounced auto-save (hooks/useSyllabusData.ts) wrote the whole library to
 * IndexedDB on every launch, with nothing changed: the library it had just loaded
 * was written back one second later. Immer gives a changed library a new reference,
 * so a save is needed only when the library is not the one last written. The daily
 * backup check still runs on launch, as it always has.
 */

vi.mock('../../utils/storageUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/storageUtils')>();
  return {
    ...actual,
    loadCoursesFromDB: vi.fn(),
    saveCoursesToDB: vi.fn(),
    fetchLibrary: vi.fn().mockResolvedValue([]),
    safeGetItem: vi.fn((key: string, fallback: unknown) =>
      key === actual.STORAGE_KEYS.DATA_VERSION ? actual.DATA_VERSION : fallback
    ),
    safeSetItem: vi.fn(),
    createBackup: vi.fn().mockResolvedValue(true),
    runMigrations: vi.fn((courses: Course[]) => courses),
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
  DATA_VERSION,
  loadCoursesFromDB,
  saveCoursesToDB as saveCoursesToDBImport,
  createBackup as createBackupImport,
  runMigrations as runMigrationsImport,
  STORAGE_KEYS,
  safeGetItem as safeGetItemImport,
} from '../../utils/storageUtils';

const loadMock = loadCoursesFromDB as unknown as ReturnType<typeof vi.fn>;
const saveCoursesToDB = saveCoursesToDBImport as unknown as ReturnType<typeof vi.fn>;
const createBackup = createBackupImport as unknown as ReturnType<typeof vi.fn>;
const runMigrations = runMigrationsImport as unknown as ReturnType<typeof vi.fn>;
const safeGetItem = safeGetItemImport as unknown as ReturnType<typeof vi.fn>;

const baseCourse = (): Course => ({
  id: 'course-1',
  name: 'Software Engineering',
  outcomes: [],
  topics: [],
});

/** Waits past the 1 s auto-save debounce, so any save it would make has happened. */
const pastDebounce = () => new Promise((resolve) => setTimeout(resolve, 1500));

beforeEach(() => {
  vi.clearAllMocks();
  // A browser already at the current version: no migration, no shipped-course sync.
  safeGetItem.mockImplementation((key: string, fallback: unknown) =>
    key === STORAGE_KEYS.DATA_VERSION ? DATA_VERSION : fallback
  );
  runMigrations.mockImplementation((courses: Course[]) => courses);
  saveCoursesToDB.mockResolvedValue('IndexedDB');
  createBackup.mockResolvedValue(true);
  loadMock.mockResolvedValue({ data: [baseCourse()], source: 'IndexedDB' });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useSyllabusData auto-save', () => {
  it('does not write back a library it has just loaded and not changed', async () => {
    const showToast = vi.fn();
    const { result } = renderHook(() => useSyllabusData({ showToast }));
    await waitFor(() => expect(result.current.isReady).toBe(true));

    await pastDebounce();

    expect(saveCoursesToDB).not.toHaveBeenCalled();
    // The daily backup check still runs on launch, so the first launch of a day snapshots.
    expect(createBackup).toHaveBeenCalledTimes(1);
    expect(createBackup.mock.calls[0][0]).toEqual([baseCourse()]);
  });

  it('writes an edit, and does not write again once the edit is saved', async () => {
    const showToast = vi.fn();
    const { result } = renderHook(() => useSyllabusData({ showToast }));
    await waitFor(() => expect(result.current.isReady).toBe(true));

    act(() => {
      result.current.handleCreateTopic('course-1', 'A New Topic');
    });
    await waitFor(() => expect(saveCoursesToDB).toHaveBeenCalledTimes(1), { timeout: 4000 });
    const saved = saveCoursesToDB.mock.calls[0][0] as Course[];
    expect(saved[0].topics.map((t) => t.name)).toEqual(['A New Topic']);

    await pastDebounce();
    expect(saveCoursesToDB).toHaveBeenCalledTimes(1);
  });

  it('writes a migrated library, which differs from the copy IndexedDB holds', async () => {
    // A browser saved at an older version: the migration returns a new array, which must be
    // written, or the migration would run again on every launch and never reach the store.
    safeGetItem.mockImplementation((key: string, fallback: unknown) =>
      key === STORAGE_KEYS.DATA_VERSION ? '2.0.0' : fallback
    );
    runMigrations.mockImplementation((courses: Course[]) => [...courses]);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }));
    const showToast = vi.fn();

    const { result } = renderHook(() => useSyllabusData({ showToast }));
    await waitFor(() => expect(result.current.isReady).toBe(true));
    await waitFor(() => expect(saveCoursesToDB).toHaveBeenCalledTimes(1), { timeout: 4000 });
  });

  it('writes the loaded library when it came from the fallback store, to recover IndexedDB', async () => {
    loadMock.mockResolvedValue({ data: [baseCourse()], source: 'LocalStorage' });
    const showToast = vi.fn();

    const { result } = renderHook(() => useSyllabusData({ showToast }));
    await waitFor(() => expect(result.current.isReady).toBe(true));

    await waitFor(() => expect(saveCoursesToDB).toHaveBeenCalledTimes(1), { timeout: 4000 });
  });
});
