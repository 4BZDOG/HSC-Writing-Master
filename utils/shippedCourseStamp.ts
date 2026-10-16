import type { Course, Prompt } from '../types';

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

/**
 * What a student keeps on a question: the words they have written and the time they
 * have spent writing them. The fields live inside the course object, because that is
 * where a question lives, but they are the student's working state and not an edit to
 * the course. A fingerprint that counted them made every course a student had started
 * writing in look edited, and an edited copy is kept as it is: that student would
 * never receive a newer shipped version of the course.
 */
export const PERSONAL_PROMPT_FIELDS = ['userDraft', 'draftElapsedSeconds'] as const;

const leavePersonalFields = (key: string, value: unknown): unknown =>
  (PERSONAL_PROMPT_FIELDS as readonly string[]).includes(key) ? undefined : value;

/**
 * Fingerprint of a course's content, leaving out the stamp itself and the student's
 * working state. A course with no such state hashes exactly as it always did, so
 * the stamps already stored stay valid.
 */
export const hashCourse = (course: Course): string => {
  const content: Partial<Course> = { ...course };
  delete content.shippedHash;
  return hashText(JSON.stringify(content, leavePersonalFields));
};

/**
 * Puts `from`'s personal working state onto the questions of `to`, matched by question
 * id. `orphaned` is true when some of it had no question to go to, because the newer
 * course no longer has that question: the caller keeps the old copy as a backup then,
 * so that no words are lost. Neither course is changed.
 */
export const carryPersonalFields = (
  from: Course,
  to: Course
): { course: Course; orphaned: boolean } => {
  const held = new Map<string, Pick<Prompt, (typeof PERSONAL_PROMPT_FIELDS)[number]>>();
  for (const topic of from.topics ?? [])
    for (const subTopic of topic.subTopics ?? [])
      for (const dotPoint of subTopic.dotPoints ?? [])
        for (const prompt of dotPoint.prompts ?? []) {
          const mine: Pick<Prompt, (typeof PERSONAL_PROMPT_FIELDS)[number]> = {};
          // Driven by the list, so a field added to it is carried without a second edit.
          for (const field of PERSONAL_PROMPT_FIELDS) {
            if (prompt[field] !== undefined)
              (mine as Record<string, unknown>)[field] = prompt[field];
          }
          if (Object.keys(mine).length > 0) held.set(prompt.id, mine);
        }
  if (held.size === 0) return { course: to, orphaned: false };

  const carried: Course = {
    ...to,
    topics: (to.topics ?? []).map((topic) => ({
      ...topic,
      subTopics: (topic.subTopics ?? []).map((subTopic) => ({
        ...subTopic,
        dotPoints: (subTopic.dotPoints ?? []).map((dotPoint) => ({
          ...dotPoint,
          prompts: (dotPoint.prompts ?? []).map((prompt) => {
            const mine = held.get(prompt.id);
            if (!mine) return prompt;
            held.delete(prompt.id);
            return { ...prompt, ...mine };
          }),
        })),
      })),
    })),
  };
  return { course: carried, orphaned: held.size > 0 };
};

/** A copy of a shipped course, stamped with the fingerprint of its content. */
export const stampShipped = (course: Course): Course => ({
  ...course,
  shippedHash: hashCourse(course),
});

/** True only for a stamped copy whose content is still exactly what was shipped. */
export const isUnedited = (course: Course): boolean =>
  course.shippedHash !== undefined && hashCourse(course) === course.shippedHash;
