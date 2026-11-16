/**
 * One course per name in the navigator.
 *
 * A library can end up holding two copies of the same course: a copy imported
 * from a file with fresh ids beside the shipped one, an older "HSC Biology"
 * beside the current "Biology", or a shipped course the version sync added by id
 * next to a same-named copy saved under another id. The navigator then lists the
 * course twice, in two versions, with nothing to say which is which.
 *
 * The best copy is kept and the others are hidden the way a refresh hides the copy
 * it replaces: marked `supersededBy` the copy kept, so the navigator leaves them
 * out (`isSupersededCourse`) but the library and the Data vault still hold them,
 * and nothing is lost. A student's drafts on a hidden copy are carried onto the
 * kept one wherever the same question is there and the kept copy has no draft of
 * its own.
 *
 * "Best" means most recent, then most complete:
 *   1. a copy taken from the shipped files (`shippedHash`), which is what the
 *      current release ships, beats one that was not;
 *   2. then the copy with more questions;
 *   3. then the copy added to the library later.
 *
 * A draft course (`status: 'draft'`) is an admin's work in progress and is never
 * hidden, or used to hide another.
 */

import type { Course } from '../types';
import { isSameCourseName } from './courseNames';
import { isSupersededCourse } from './courseVisibility';
import { carryPersonalFields } from './shippedCourseStamp';
import { countQuestions } from './shippedCatalogue';

/** True when `a` is a better copy to keep than `b`. Positions break the last tie. */
const isBetter = (a: Course, aAt: number, b: Course, bAt: number): boolean => {
  const aShipped = a.shippedHash !== undefined;
  const bShipped = b.shippedHash !== undefined;
  if (aShipped !== bShipped) return aShipped;
  const aQuestions = countQuestions(a);
  const bQuestions = countQuestions(b);
  if (aQuestions !== bQuestions) return aQuestions > bQuestions;
  return aAt > bAt;
};

/**
 * `courses` with every duplicate but the best copy hidden. Returns the same array
 * when there is nothing to hide, so a caller that writes on a changed reference
 * does not write on every load. `hidden` names each course that lost copies.
 */
export const hideDuplicateCourses = (
  courses: Course[]
): { courses: Course[]; hidden: Array<{ name: string; keptId: string; hiddenIds: string[] }> } => {
  const eligible = (course: Course) => !isSupersededCourse(course) && course.status !== 'draft';

  // Groups of positions sharing a name, in library order.
  const groups: number[][] = [];
  courses.forEach((course, at) => {
    if (!eligible(course)) return;
    const group = groups.find((g) => isSameCourseName(courses[g[0]].name, course.name));
    if (group) group.push(at);
    else groups.push([at]);
  });

  const duplicates = groups.filter((g) => g.length > 1);
  if (duplicates.length === 0) return { courses, hidden: [] };

  const next = [...courses];
  const hidden: Array<{ name: string; keptId: string; hiddenIds: string[] }> = [];
  for (const group of duplicates) {
    const keepAt = group.reduce((best, at) =>
      isBetter(courses[at], at, courses[best], best) ? at : best
    );
    const keeper = courses[keepAt];
    let kept = keeper;
    const hiddenIds: string[] = [];
    for (const at of group) {
      if (at === keepAt) continue;
      const copy = courses[at];
      // The copy's drafts go onto the kept course, then the kept course's own go back
      // over them, so a question with a draft in both keeps the kept course's words.
      kept = carryPersonalFields(keeper, carryPersonalFields(copy, kept).course).course;
      next[at] = { ...copy, supersededBy: keeper.id };
      hiddenIds.push(copy.id);
    }
    next[keepAt] = kept;
    hidden.push({ name: keeper.name, keptId: keeper.id, hiddenIds });
  }
  return { courses: next, hidden };
};
