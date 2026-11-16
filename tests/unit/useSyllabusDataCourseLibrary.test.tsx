import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { Course } from '../../types';
import type { ShippedCourseOffer } from '../../utils/shippedCatalogue';

/**
 * addShippedCourses: what the course library calls when a returning user adds a
 * shipped course they left unticked at first run. The course joins the library
 * once, and joins the offered record, so deleting it later stays a deletion.
 */

const stored = new Map<string, unknown>();

vi.mock('../../utils/storageUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/storageUtils')>();
  return {
    ...actual,
    loadCoursesFromDB: vi.fn(),
    saveCoursesToDB: vi.fn().mockResolvedValue(undefined),
    fetchLibrary: vi.fn().mockResolvedValue([]),
    safeGetItem: vi.fn((key: string, fallback: unknown) =>
      key === actual.STORAGE_KEYS.DATA_VERSION
        ? actual.DATA_VERSION
        : stored.has(key)
          ? stored.get(key)
          : fallback
    ),
    safeSetItem: vi.fn((key: string, value: unknown) => {
      stored.set(key, value);
    }),
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
import { loadCoursesFromDB, STORAGE_KEYS } from '../../utils/storageUtils';
import { isUnedited } from '../../utils/shippedCourseStamp';

const course = (id: string, name: string): Course => ({ id, name, outcomes: [], topics: [] });

const offer = (id: string, name: string, subject = 'Science'): ShippedCourseOffer => ({
  id,
  name,
  subject,
  source: `${name}.json`,
  course: course(id, name),
});

const setup = async () => {
  const showToast = vi.fn();
  const hook = renderHook(() => useSyllabusData({ showToast }));
  await waitFor(() => expect(hook.result.current.isReady).toBe(true));
  return { ...hook, showToast };
};

beforeEach(() => {
  vi.clearAllMocks();
  stored.clear();
  stored.set(STORAGE_KEYS.OFFERED_SHIPPED, ['course-hsc-biology', 'course-hsc-chemistry']);
  (loadCoursesFromDB as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: [course('course-hsc-economics', 'Economics')],
    source: 'IndexedDB',
  });
});

describe('adding shipped courses from the course library', () => {
  it('adds the chosen course, stamped and filed under its faculty', async () => {
    const { result, showToast } = await setup();
    let added: string[] = [];
    act(() => {
      added = result.current.addShippedCourses([offer('course-hsc-biology', 'Biology')]);
    });
    expect(added).toEqual(['course-hsc-biology']);
    await waitFor(() => expect(result.current.courses).toHaveLength(2));
    const biology = result.current.courses.find((c) => c.id === 'course-hsc-biology')!;
    expect(biology.subject).toBe('Science');
    expect(biology.shippedHash).toBeDefined();
    expect(isUnedited(biology)).toBe(true);
    expect(showToast).toHaveBeenCalledWith('Added Biology.', 'success');
  });

  it('does not add a course the library already holds', async () => {
    const { result, showToast } = await setup();
    let added: string[] = ['unset'];
    act(() => {
      added = result.current.addShippedCourses([offer('course-hsc-economics', 'Economics')]);
    });
    expect(added).toEqual([]);
    expect(result.current.courses).toHaveLength(1);
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('already'), 'info');
  });

  it('adds a course once when it is added twice in a row', async () => {
    const { result } = await setup();
    const physics = offer('course-hsc-physics', 'Physics');
    act(() => {
      result.current.addShippedCourses([physics]);
    });
    await waitFor(() => expect(result.current.courses).toHaveLength(2));
    act(() => {
      result.current.addShippedCourses([physics]);
    });
    expect(result.current.courses.filter((c) => c.id === 'course-hsc-physics')).toHaveLength(1);
  });

  it('keeps the offered record whole and adds what it lacked', async () => {
    const { result } = await setup();
    act(() => {
      result.current.addShippedCourses([
        offer('course-hsc-biology', 'Biology'),
        offer('course-hsc-physics', 'Physics'),
      ]);
    });
    const record = stored.get(STORAGE_KEYS.OFFERED_SHIPPED) as string[];
    expect(new Set(record)).toEqual(
      new Set(['course-hsc-biology', 'course-hsc-chemistry', 'course-hsc-physics'])
    );
  });

  it('names several added courses in one notice', async () => {
    const { result, showToast } = await setup();
    act(() => {
      result.current.addShippedCourses([
        offer('course-hsc-biology', 'Biology'),
        offer('course-hsc-physics', 'Physics'),
        offer('course-hsc-chemistry', 'Chemistry'),
      ]);
    });
    expect(showToast).toHaveBeenCalledWith('Added Biology, Physics and Chemistry.', 'success');
  });
});
