import { Course, UserRole } from '../types';
import { canCreateCurriculum } from './permissions';

/**
 * A backup of an earlier version of a shipped course. The navigator lists only
 * the most recent version of each course. Backups made by the shipped-course
 * sync carry `supersededBy`; ones made before that field existed are told apart
 * by the `-before-refresh` id the sync has always given them.
 */
export const isSupersededCourse = (course: Course): boolean =>
  course.supersededBy !== undefined || course.id.endsWith('-before-refresh');

/**
 * A course is visible unless it has been superseded by a newer version (for
 * every role), or it is a draft AND the viewer is not an admin. Absence of
 * `status` (or `status === 'published'`) always means visible — see the doc
 * comment on `Course.status` in types.ts.
 */
export const isCourseVisible = (course: Course, role: UserRole): boolean =>
  !isSupersededCourse(course) && (course.status !== 'draft' || canCreateCurriculum(role));

export const visibleCourses = (courses: Course[], role: UserRole): Course[] =>
  courses.filter((c) => isCourseVisible(c, role));
