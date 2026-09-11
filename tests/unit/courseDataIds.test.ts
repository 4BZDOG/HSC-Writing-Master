import { describe, it, expect } from 'vitest';
import { shippedCourses, type ShippedCourse } from './support/shippedCourseData';

/**
 * An id identifies one thing.
 *
 * Software Engineering shipped with two dot points wearing `dp-1762984770472-i9mtydz`
 * — the same syllabus dot point filed under both "Designing software" and
 * "Developing secure code", sharing a question and its two exemplars — and a
 * second pair, `dp-1763034567890-ghij678`, where two GENUINELY DIFFERENT dot
 * points had been given one id. The first needed a merge, the second a fresh
 * id; the scan below cannot tell them apart, which is the point. It says
 * "these collide", and a person decides which kind it is.
 *
 * It matters because an id is the React key, the IndexedDB record, the
 * accordion `resetKey`, and per-question progress. Two rows sharing one is a
 * correctness problem before it is a content one.
 *
 * The per-topic files under `topics/` are scanned too: they ship in the
 * manifest and import independently, so fixing only the aggregated course would
 * let an import put the duplicate straight back.
 *
 * Ids must be unique WITHIN a file, which is why this groups by file rather
 * than by course: two files may legitimately describe the same syllabus, and
 * only one of them is ever imported.
 */

/** Every shipped file, with the courses inside it — a file may hold more than one. */
const byFile = (): Array<[string, ShippedCourse[]]> => {
  const grouped = new Map<string, ShippedCourse[]>();
  for (const course of shippedCourses()) {
    const existing = grouped.get(course.file);
    if (existing) existing.push(course);
    else grouped.set(course.file, [course]);
  }
  return [...grouped];
};

describe('shipped course data: every id identifies one thing', () => {
  it.each(byFile())('%s has no id used twice', (_name, courses) => {
    const seen: Record<string, Map<string, string[]>> = {
      subTopic: new Map(),
      dotPoint: new Map(),
      prompt: new Map(),
      sampleAnswer: new Map(),
    };
    const note = (kind: string, id: unknown, where: string) => {
      if (typeof id !== 'string' || !id) return;
      seen[kind].set(id, [...(seen[kind].get(id) ?? []), where]);
    };

    for (const course of courses)
      for (const topic of course.topics)
        for (const sub of topic.subTopics ?? []) {
          note('subTopic', sub.id, sub.name);
          for (const dot of sub.dotPoints ?? []) {
            note('dotPoint', dot.id, sub.name);
            for (const prompt of dot.prompts ?? []) {
              note('prompt', prompt.id, sub.name);
              for (const sample of prompt.sampleAnswers ?? [])
                note('sampleAnswer', sample.id, prompt.id);
            }
          }
        }

    const collisions: string[] = [];
    for (const [kind, map] of Object.entries(seen))
      for (const [id, where] of map)
        if (where.length > 1)
          collisions.push(`${kind} ${id} appears ${where.length}x: ${where.join(' | ')}`);

    expect(collisions, collisions.join('\n')).toEqual([]);
  });

  it('checked every shipped file, not an empty list', () => {
    // `it.each` over an empty array reports nothing and passes, so the scan
    // going blind would look exactly like the data being clean.
    expect(byFile().length).toBeGreaterThanOrEqual(5);
  });
});
