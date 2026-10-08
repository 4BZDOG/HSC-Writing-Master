import type { Course } from '../types';

/**
 * A course copied from the shipped files carries `shippedHash`: a fingerprint of
 * its content as it was saved. Courses keep no edit history, so this is how the
 * app tells a copy the user has changed from one they have not. A stamped copy
 * that still hashes to its stamp is unedited, and a newer shipped version may
 * replace it. A stamped copy that no longer matches has been edited, and is kept.
 */

const hashText = (text: string): string => {
  // FNV-1a, 32-bit. Only ever compared with another hash of the same kind, so
  // a collision would need a deliberate edit that happens to land on the stamp.
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

/** Fingerprint of a course's content, leaving out the stamp itself. */
export const hashCourse = (course: Course): string => {
  const content: Partial<Course> = { ...course };
  delete content.shippedHash;
  return hashText(JSON.stringify(content));
};

/** A copy of a shipped course, stamped with the fingerprint of its content. */
export const stampShipped = (course: Course): Course => ({
  ...course,
  shippedHash: hashCourse(course),
});

/** True only for a stamped copy whose content is still exactly what was shipped. */
export const isUnedited = (course: Course): boolean =>
  course.shippedHash !== undefined && hashCourse(course) === course.shippedHash;
