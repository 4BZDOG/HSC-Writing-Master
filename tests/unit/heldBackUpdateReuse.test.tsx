import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type { Course } from '../../types';

/**
 * An edited copy with a newer shipped version waiting is kept, and the sync offers
 * "Update it". Clicking it must apply the version the sync already downloaded: the
 * sync fetched every shipped file a moment earlier, and downloading them again
 * before the replacement made the offer wait on about 17 MB for no reason.
 */

vi.mock('../../utils/storageUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/storageUtils')>();
  return {
    ...actual,
    loadCoursesFromDB: vi.fn(),
    saveCoursesToDB: vi.fn().mockResolvedValue('IndexedDB'),
    fetchLibrary: vi.fn().mockResolvedValue([]),
    // A browser saved at an older version, so the sync runs on load.
    safeGetItem: vi.fn((key: string, fallback: unknown) =>
      key === actual.STORAGE_KEYS.DATA_VERSION ? '2.39.0' : fallback
    ),
    safeSetItem: vi.fn(),
    createBackup: vi.fn().mockResolvedValue(true),
    // The migrations are not under test here; the copy is taken as saved.
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
import { loadCoursesFromDB } from '../../utils/storageUtils';
import { analyzeAndSanitizeImportData } from '../../utils/dataManagerUtils';
import { stampShipped } from '../../utils/shippedCourseStamp';

const SHIPPED = join(process.cwd(), 'public/courseData');
const BUSINESS = 'course-hsc-business-studies';

/** The course a shipped file contains, sanitised as the sync sanitises it. */
const shippedCourse = (file: string): Course => {
  const analysis = analyzeAndSanitizeImportData(
    JSON.parse(readFileSync(join(SHIPPED, file), 'utf8'))
  );
  return (analysis.data as Course[])[0];
};

/** Business Studies as it shipped before its past HSC papers, stamped, then renamed by the user. */
const editedBeforePastPapers = (): Course => {
  const current = shippedCourse('HSCBusinessStudies.json');
  const older: Course = {
    ...current,
    topics: current.topics.map((t) => ({
      ...t,
      subTopics: t.subTopics.map((st) => ({
        ...st,
        dotPoints: st.dotPoints.map((dp) => ({
          ...dp,
          prompts: dp.prompts.filter((p) => !p.isPastHSC),
        })),
      })),
    })),
  };
  return { ...stampShipped(older), name: 'My Business Studies' };
};

/** Every shipped file served by name, as the browser would fetch them. */
const serveShipped = () =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const name = String(url).split('/').pop() ?? '';
    const file = readdirSync(SHIPPED).find((f) => f === name && f.endsWith('.json'));
    return file
      ? new Response(readFileSync(join(SHIPPED, file), 'utf8'), { status: 200 })
      : new Response('', { status: 404 });
  });

type OfferAction = { label: string; onClick: () => void };

beforeEach(() => {
  vi.clearAllMocks();
  (loadCoursesFromDB as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: [editedBeforePastPapers()],
    source: 'IndexedDB',
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the held-back offer', () => {
  it('applies the update without downloading the shipped files again', async () => {
    const fetchSpy = serveShipped();
    const showToast = vi.fn();
    const shipped = shippedCourse('HSCBusinessStudies.json');

    const { result } = renderHook(() => useSyllabusData({ showToast }));
    await waitFor(() => expect(result.current.isReady).toBe(true), { timeout: 10_000 });

    const offer = showToast.mock.calls.find(([, , action]) => action?.label === 'Update it');
    expect(offer).toBeDefined();
    const action = offer![2] as OfferAction;

    const fetchesBeforeUpdate = fetchSpy.mock.calls.length;
    act(() => action.onClick());

    expect(fetchSpy.mock.calls.length).toBe(fetchesBeforeUpdate);
    const updated = result.current.courses.find((c) => c.id === BUSINESS);
    expect(updated?.name).toBe(shipped.name);
    expect(result.current.courses.map((c) => c.id)).toContain(`${BUSINESS}-before-refresh`);
  });
});
