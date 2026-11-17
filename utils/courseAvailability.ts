/**
 * What a course is to the person looking at it: purchased, included, available
 * to unlock, or not ready yet. One answer, so the course picker, the course
 * library and the first-run picker never disagree about a course.
 *
 * Two facts decide it:
 *   - the access rule `services/courseAccess.ts` applied (`CourseAccessReason`),
 *     which is "open" for everyone while course unlocks are switched off;
 *   - whether the course has any questions. A course that ships as structure
 *     only has nothing to practise or to be marked on yet, so it is "coming
 *     soon" whatever its price: offering to sell it would sell an empty course.
 *
 * Pure, and free of imports that run code, so eager surfaces can use it.
 */

import type { Course } from '../types';
import type { CourseAccessReason } from '../services/courseAccess';

export type CourseAvailability =
  /** Open, and nothing worth saying: unlocks are off, or the viewer is staff. */
  | 'open'
  /** The viewer bought it. */
  | 'purchased'
  /** Open without a purchase: the viewer's plan includes every course, or this one is free. */
  | 'included'
  /** Browsable, but marking needs a one-off unlock. */
  | 'locked'
  /** No questions yet. Listed so people know it is coming; disabled for students. */
  | 'coming-soon';

/** How many questions a course carries, in both years. Zero means it ships as structure only. */
export const countQuestions = (course: Pick<Course, 'topics'>): number =>
  (course.topics ?? []).reduce(
    (n, topic) =>
      n +
      (topic.subTopics ?? []).reduce(
        (m, st) => m + (st.dotPoints ?? []).reduce((k, dp) => k + (dp.prompts ?? []).length, 0),
        0
      ),
    0
  );

export const courseAvailability = (
  questionCount: number,
  reason: CourseAccessReason
): CourseAvailability => {
  if (questionCount === 0) return 'coming-soon';
  switch (reason) {
    case 'owned':
      return 'purchased';
    case 'included-plan':
    case 'free-course':
      return 'included';
    case 'locked':
      return 'locked';
    default:
      return 'open';
  }
};

/** The heading the course picker files not-yet-ready courses under, after every faculty. */
export const COMING_SOON_GROUP = 'Coming soon';

/** The words each state is announced with, for a chip's tooltip and a screen reader. */
export const AVAILABILITY_DESCRIPTION: Record<CourseAvailability, string> = {
  open: '',
  purchased: 'You have unlocked this course: marking and feedback are on.',
  included: 'Included in your plan: marking and feedback are on.',
  locked: 'You can browse this course. Unlock it to be marked and get feedback.',
  'coming-soon': 'No questions yet. This course is on its way.',
};

/** A one-line count of the states worth naming, e.g. "2 purchased · 5 to unlock · 3 coming soon". */
export const summariseAvailability = (states: readonly CourseAvailability[]): string => {
  const count = (state: CourseAvailability) => states.filter((s) => s === state).length;
  return [
    [count('purchased'), 'purchased'],
    [count('included'), 'included'],
    [count('locked'), 'to unlock'],
    [count('coming-soon'), 'coming soon'],
  ]
    .filter(([n]) => (n as number) > 0)
    .map(([n, words]) => `${n} ${words}`)
    .join(' · ');
};
