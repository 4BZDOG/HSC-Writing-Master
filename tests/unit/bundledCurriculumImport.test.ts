import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { regenerateTopicIds, mergeOrAddTopic } from '../../utils/dataManagerUtils';
import type { Course, Topic } from '../../types';
import { shippedCourses } from './support/shippedCourseData';

/**
 * The bundled curriculum, imported the way a new user imports it, without
 * duplicating itself.
 *
 * The manifest used to list `topics/software-engineering-secure-architecture-topic.json`
 * beside its course: a copy of the Secure software architecture topic that is
 * also inside the Software Engineering course file. The two had drifted (the
 * course's copy carried a later round of sample-answer fixes), so the picker
 * offered the same topic twice in two versions. The stale copy was removed and
 * the course file's version kept. The first block here keeps a topic file that
 * repeats a topic of its own course from being shipped again.
 *
 * The second block keeps what the old test proved about the merge. Importing a
 * topic that a course already holds must add nothing: `handleImportFromLibrary`
 * runs every topic through `regenerateTopicIds`, which rewrites every id below
 * the topic, so what saves the merge is the text fallback at each level
 * (sub-topic by name, dot point by description, prompt by question). Take away
 * the dot-point one and Software Engineering's Secure software architecture is
 * appended a second time, with every question twice.
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

/** Every question in a course, as the tree holds them after a merge. */
const questionsIn = (course: Course): string[] =>
  (course.topics ?? [])
    .flatMap((t) => t.subTopics ?? [])
    .flatMap((s) => s.dotPoints ?? [])
    .flatMap((d) => d.prompts ?? [])
    .map((p) => String(p.question ?? ''));

/** The course file of that name, parsed fresh each time. */
const shippedCourse = (name: string): Course | null => {
  for (const shipped of shippedCourses()) {
    if (shipped.isTopicFile || shipped.courseName !== name) continue;
    return JSON.parse(JSON.stringify(shipped.raw)) as Course;
  }
  return null;
};

describe('the shipped curriculum offers each thing once', () => {
  it('lists every course file once', () => {
    const files = manifest().map((e) => e.file);
    expect(new Set(files).size).toBe(files.length);
  });

  it('ships each course name once', () => {
    const names = shippedCourses()
      .filter((c) => !c.isTopicFile)
      .map((c) => c.courseName.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it('ships no topic file that repeats a topic its course already holds', () => {
    for (const entry of manifest().filter((e) => e.type === 'topic')) {
      const course = shippedCourse(entry.targetCourseName ?? '');
      expect(course, `${entry.file} names a course that is not shipped`).not.toBeNull();
      const topic = read(entry.file) as Topic;
      const names = course!.topics.map((t) => t.name.toLowerCase());
      expect(
        course!.topics.some((t) => t.id === topic.id) || names.includes(topic.name.toLowerCase()),
        `${entry.file} repeats a topic already inside ${entry.targetCourseName}`
      ).toBe(false);
    }
  });
});

describe('importing a topic a course already holds adds nothing', () => {
  it('merges Secure software architecture into Software Engineering without a second copy', () => {
    const course = shippedCourse('Software Engineering')!;
    const topic = course.topics.find((t) => t.name === 'Secure software architecture');
    expect(topic, 'Software Engineering no longer has the topic this test merges').toBeTruthy();
    const before = questionsIn(course);

    // Exactly what handleImportFromLibrary does with a topic: new ids, then merge.
    mergeOrAddTopic(course.topics, regenerateTopicIds(JSON.parse(JSON.stringify(topic))));
    const after = questionsIn(course);

    expect(after.length).toBe(before.length);
    for (const question of new Set(before)) expect(after).toContain(question);
  });
});
