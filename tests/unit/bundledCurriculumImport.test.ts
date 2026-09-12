import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { regenerateTopicIds, mergeOrAddTopic } from '../../utils/dataManagerUtils';
import type { Course, Topic } from '../../types';
import { shippedCourses } from './support/shippedCourseData';

/**
 * The bundled curriculum, imported the way a new user imports it.
 *
 * Every shipped topic file is a copy of a topic that is ALSO inside its
 * course file — `topics/biology-heredity-topic.json` is the Heredity topic
 * from `HSCBiology.json`, and the secure-architecture one is the Secure
 * software architecture topic from the Software Engineering course. All 72
 * question ids they hold already exist in the course file, with identical
 * text. That is fine and deliberate: a topic file lets someone take one topic
 * without the whole course. It is only fine because the import DEDUPES.
 *
 * And the dedupe is not free. `handleImportFromLibrary` runs every topic
 * through `regenerateTopicIds`, which rewrites the id of the topic, every
 * sub-topic, dot point, prompt and sample answer — so by the time
 * `mergeOrAddTopic` runs, not one id matches the course already in the tree.
 * What saves it is the text fallback at each of the three levels below the
 * topic: sub-topic by name, dot point by description, prompt by question.
 * Take away just the dot-point one and Biology goes from 152 questions to
 * 183, Software Engineering from 183 to 224 — the whole topic is appended a
 * second time, and a student browsing Heredity meets every question twice
 * with no way to tell which is which.
 *
 * The Biology topic file is `"selected": true` in the manifest, so this is not
 * a path someone has to go looking for: it is what the first-run "import the
 * bundled curriculum" button does for every new user.
 *
 * Verified by deleting the dot-point text fallback in
 * `mergeDotPointCollections` and watching both cases fail with exactly those
 * numbers.
 */

const ROOT = join(process.cwd(), 'public/courseData');
const read = (file: string) => JSON.parse(readFileSync(join(ROOT, file), 'utf8'));

interface ManifestEntry {
  file: string;
  type?: string;
  targetCourseName?: string;
  selected?: boolean;
}

const manifest = (): ManifestEntry[] => {
  const path = join(ROOT, 'manifest.json');
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  return Array.isArray(parsed?.entries) ? parsed.entries : [];
};

const topicEntries = manifest().filter((e) => e.type === 'topic' && e.targetCourseName);

/** Every question in a course, as the tree holds them after a merge. */
const questionsIn = (course: Course): string[] =>
  (course.topics ?? [])
    .flatMap((t) => t.subTopics ?? [])
    .flatMap((s) => s.dotPoints ?? [])
    .flatMap((d) => d.prompts ?? [])
    .map((p) => String(p.question ?? ''));

/** The course file a topic file names as its target, parsed fresh each time. */
const targetCourse = (name: string): Course | null => {
  for (const shipped of shippedCourses()) {
    if (shipped.isTopicFile || shipped.courseName !== name) continue;
    return JSON.parse(JSON.stringify(shipped.raw)) as Course;
  }
  return null;
};

describe('the bundled curriculum imports without duplicating itself', () => {
  it('has topic files to check', () => {
    // Both assertions below iterate `topicEntries`. An empty list would make
    // them pass by doing nothing at all, which is the failure this whole file
    // exists to catch in the import.
    expect(topicEntries.length).toBeGreaterThan(0);
    for (const entry of topicEntries) {
      expect(
        targetCourse(entry.targetCourseName!),
        `${entry.file} names a course that is not shipped`
      ).not.toBeNull();
    }
  });

  it.each(topicEntries.map((e) => [e.file, e.targetCourseName!] as const))(
    'importing %s into %s adds only what is new',
    (file, courseName) => {
      const course = targetCourse(courseName)!;
      const before = questionsIn(course);

      // Exactly what handleImportFromLibrary does with a topic: new ids, then
      // merge. The regeneration is why the text fallbacks carry this.
      mergeOrAddTopic(course.topics, regenerateTopicIds(read(file) as Topic));
      const after = questionsIn(course);

      const incoming = questionsIn({
        topics: [read(file)],
      } as unknown as Course);
      const expected = new Set([...before, ...incoming]).size;

      expect(
        after.length,
        `${file} merged into ${courseName}: expected ${expected} distinct questions, got ${after.length}. ` +
          `A count above that means the merge appended content it should have matched.`
      ).toBe(expected);

      // And nothing already in the course was lost to make room.
      for (const question of new Set(before)) expect(after).toContain(question);
    }
  );
});
