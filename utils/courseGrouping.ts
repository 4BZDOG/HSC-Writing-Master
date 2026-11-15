/**
 * Faculty grouping for the course picker: which faculty each course sits
 * under, the order courses are listed in, and the one faculty filter the
 * person may have chosen.
 *
 * The faculty definition itself lives in `utils/subjectAreas.ts`; this file
 * only arranges courses by it. Everything here is pure except the two storage
 * helpers at the bottom, which are wrapped the way `utils/focusLayout.ts` wraps
 * its own: unavailable storage means the choice is not remembered, never an
 * error in the picker.
 */

import { SUBJECT_AREAS, subjectAreaOf, type SubjectArea } from './subjectAreas';

/** The filter value that shows every faculty. */
export const FACULTY_FILTER_ALL = 'all';

/** `all`, or one faculty. */
export type FacultyFilter = SubjectArea | typeof FACULTY_FILTER_ALL;

export interface FacultyGroup<T extends { name: string; subject?: string }> {
  area: SubjectArea;
  courses: T[];
}

/**
 * Course names compare the way a teacher reads them: case and accents do not
 * matter ("bio" and "Biology" sit together, "Édu" sorts with "Edu"), and
 * numbers run in value order so "Unit 2" comes before "Unit 10".
 */
const courseCollator = new Intl.Collator('en-AU', {
  sensitivity: 'base',
  numeric: true,
});

export const compareCourseNames = (a: string, b: string): number => courseCollator.compare(a, b);

/**
 * Courses grouped by faculty, faculties in the canonical `SUBJECT_AREAS` order
 * (the order the import modal and the audit tree already use, so a faculty
 * sits in the same place on every surface), `Other` last. A faculty with no
 * courses is left out rather than shown empty. Within a faculty, courses are
 * sorted by name.
 *
 * A course's faculty is `subjectAreaOf`: its recorded subject when that is one
 * of the known faculties, otherwise a guess from its name, otherwise `Other`.
 * The input array is not mutated.
 */
export const groupCoursesByFaculty = <T extends { name: string; subject?: string }>(
  courses: readonly T[]
): FacultyGroup<T>[] => {
  const byArea = new Map<SubjectArea, T[]>();
  for (const course of courses) {
    const area = subjectAreaOf(course);
    const bucket = byArea.get(area);
    if (bucket) bucket.push(course);
    else byArea.set(area, [course]);
  }
  return SUBJECT_AREAS.filter((area) => byArea.has(area)).map((area) => ({
    area,
    courses: [...(byArea.get(area) ?? [])].sort((a, b) => compareCourseNames(a.name, b.name)),
  }));
};

/**
 * The filter to apply. A remembered faculty that no longer has any courses (a
 * course was removed, or the library was reset) falls back to `all` rather than
 * showing an empty list. The stored choice itself is left alone, so it applies
 * again if that faculty returns.
 */
export const resolveFacultyFilter = (
  filter: FacultyFilter,
  presentAreas: readonly SubjectArea[]
): FacultyFilter =>
  filter === FACULTY_FILTER_ALL || presentAreas.includes(filter) ? filter : FACULTY_FILTER_ALL;

// ---------------------------------------------------------------------------
// Remembered choice (per device).
//
// A preference about how this device is being used, not data worth syncing,
// so it lives in localStorage like the PDF export preferences do.
// ---------------------------------------------------------------------------

export const FACULTY_FILTER_STORAGE_KEY = 'hsc.coursePicker.faculty';

const isFacultyFilter = (value: string): value is FacultyFilter =>
  value === FACULTY_FILTER_ALL || (SUBJECT_AREAS as string[]).includes(value);

/** The remembered filter, or `all` when nothing valid is stored or storage is unavailable. */
export const readFacultyFilter = (): FacultyFilter => {
  try {
    const raw = window.localStorage.getItem(FACULTY_FILTER_STORAGE_KEY);
    return raw && isFacultyFilter(raw) ? raw : FACULTY_FILTER_ALL;
  } catch {
    return FACULTY_FILTER_ALL;
  }
};

/** Remember the filter for next time. Unavailable storage means it is simply not remembered. */
export const writeFacultyFilter = (filter: FacultyFilter): void => {
  try {
    window.localStorage.setItem(FACULTY_FILTER_STORAGE_KEY, filter);
  } catch {
    // Private windows and blocked site data: the choice lasts for this visit only.
  }
};
