import { Course, UserRole } from '../types';
import { canCreateCurriculum } from './permissions';

/**
 * A course is visible unless it is a draft AND the viewer is not an admin.
 * Absence of `status` (or `status === 'published'`) always means visible —
 * see the doc comment on `Course.status` in types.ts.
 */
export const isCourseVisible = (course: Course, role: UserRole): boolean =>
  course.status !== 'draft' || canCreateCurriculum(role);

export const visibleCourses = (courses: Course[], role: UserRole): Course[] =>
  courses.filter((c) => isCourseVisible(c, role));
