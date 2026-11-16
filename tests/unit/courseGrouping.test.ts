import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  FACULTY_FILTER_ALL,
  FACULTY_FILTER_STORAGE_KEY,
  compareCourseNames,
  groupCoursesByFaculty,
  readFacultyFilter,
  resolveFacultyFilter,
  writeFacultyFilter,
} from '../../utils/courseGrouping';
import { SUBJECT_AREAS } from '../../utils/subjectAreas';

/**
 * The course picker lists courses under their faculty, in faculty order, with
 * names sorted within each faculty. These pin the pure arrangement; the picker
 * itself is covered in coursePickerFaculties.test.tsx.
 */

type C = { id: string; name: string; subject?: string };
const c = (id: string, name: string, subject?: string): C => ({ id, name, subject });

describe('compareCourseNames', () => {
  it('ignores case and accents, as a teacher reads a name', () => {
    expect(compareCourseNames('biology', 'Biology')).toBe(0);
    expect(compareCourseNames('Édu', 'Edu')).toBe(0);
    expect(compareCourseNames('Chemistry', 'biology')).toBeGreaterThan(0);
  });

  it('runs numbers in value order, so Unit 2 comes before Unit 10', () => {
    const sorted = ['Unit 10', 'Unit 2', 'Unit 1'].sort(compareCourseNames);
    expect(sorted).toEqual(['Unit 1', 'Unit 2', 'Unit 10']);
  });
});

describe('groupCoursesByFaculty', () => {
  it('lists faculties in alphabetical order, with Other last', () => {
    const groups = groupCoursesByFaculty([
      c('1', 'Unknown Thing', undefined), // Other
      c('2', 'Modern History', 'HSIE'),
      c('3', 'English Advanced', 'English'),
      c('4', 'Biology', 'Science'),
      c('5', 'Software Engineering', 'TAS'),
    ]);
    expect(groups.map((g) => g.area)).toEqual(['English', 'HSIE', 'Science', 'TAS', 'Other']);
  });

  it('lists faculties in the SUBJECT_AREAS order, whatever that order is', () => {
    const groups = groupCoursesByFaculty([
      c('1', 'Unknown Thing', undefined), // Other
      c('2', 'Modern History', 'HSIE'),
      c('3', 'English Advanced', 'English'),
      c('4', 'Biology', 'Science'),
      c('5', 'Software Engineering', 'TAS'),
    ]);
    const present = SUBJECT_AREAS.filter((a) =>
      ['Other', 'HSIE', 'English', 'Science', 'TAS'].includes(a)
    );
    expect(groups.map((g) => g.area)).toEqual(present);
  });

  it('sorts courses by name within a faculty, not by the order they arrived in', () => {
    const groups = groupCoursesByFaculty([
      c('1', 'Chemistry', 'Science'),
      c('2', 'biology', 'Science'),
      c('3', 'Physics', 'Science'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].courses.map((x) => x.name)).toEqual(['biology', 'Chemistry', 'Physics']);
  });

  it('files a course with an unrecognised recorded subject by its name, else under Other', () => {
    const groups = groupCoursesByFaculty([
      c('1', 'Biology', 'Not A Faculty'),
      c('2', 'Zebra Studies', 'Not A Faculty'),
    ]);
    expect(groups.map((g) => [g.area, g.courses.map((x) => x.id)])).toEqual([
      ['Science', ['1']],
      ['Other', ['2']],
    ]);
  });

  it('leaves out a faculty that has no courses rather than listing it empty', () => {
    const groups = groupCoursesByFaculty([c('1', 'Biology', 'Science')]);
    expect(groups.map((g) => g.area)).toEqual(['Science']);
  });

  it('does not mutate the input array or its order', () => {
    const input = [c('1', 'Physics', 'Science'), c('2', 'Biology', 'Science')];
    const snapshot = input.map((x) => x.id);
    groupCoursesByFaculty(input);
    expect(input.map((x) => x.id)).toEqual(snapshot);
  });

  it('returns no groups for an empty library', () => {
    expect(groupCoursesByFaculty([])).toEqual([]);
  });
});

describe('resolveFacultyFilter', () => {
  it('keeps a filter whose faculty still has courses', () => {
    expect(resolveFacultyFilter('Science', ['Science', 'English'])).toBe('Science');
  });

  it('falls back to All when the remembered faculty has no courses', () => {
    expect(resolveFacultyFilter('PDHPE', ['Science', 'English'])).toBe(FACULTY_FILTER_ALL);
  });

  it('keeps All', () => {
    expect(resolveFacultyFilter(FACULTY_FILTER_ALL, [])).toBe(FACULTY_FILTER_ALL);
  });
});

describe('remembered faculty filter', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('defaults to All when nothing is stored', () => {
    expect(readFacultyFilter()).toBe(FACULTY_FILTER_ALL);
  });

  it('restores the faculty the person last chose on this device', () => {
    writeFacultyFilter('Science');
    expect(window.localStorage.getItem(FACULTY_FILTER_STORAGE_KEY)).toBe('Science');
    expect(readFacultyFilter()).toBe('Science');
  });

  it('ignores a stored value that is not a faculty or All', () => {
    window.localStorage.setItem(FACULTY_FILTER_STORAGE_KEY, 'Astrology');
    expect(readFacultyFilter()).toBe(FACULTY_FILTER_ALL);
  });

  it('does not throw when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readFacultyFilter()).toBe(FACULTY_FILTER_ALL);
    expect(() => writeFacultyFilter('English')).not.toThrow();
  });
});
