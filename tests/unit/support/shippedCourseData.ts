import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Walking the content students are actually served.
 *
 * Several tests hold a line on `public/courseData` — ids are unique, outcome
 * links resolve, the terms panel means something — and each had grown its own
 * copy of "find the files, find the topics inside them". The copies had started
 * to disagree about what a topic file even is, which is the failure mode that
 * matters here: a scan that quietly walks nothing passes, and reads as proof.
 *
 * It also answers the question those copies could not: WHICH COURSE is this?
 * The courses are not equally finished — Software Engineering is the reference,
 * the others are known-stale and due for bulk regeneration — so a test that
 * blends them reports an average of a good course and a bad one and calls it
 * health. Anything measuring quality needs to say which course it measured.
 */

const ROOT = join(process.cwd(), 'public/courseData');

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyNode = Record<string, any>;

/**
 * The course whose content is finished enough to hold to a quality bar.
 *
 * Not a favourite: it is the one course that has been through the full
 * authoring pass, so it is the only one where a moved number means the CODE
 * moved. See `courseQuality` below for what this does and does not gate.
 */
export const REFERENCE_COURSE = /software engineering/i;

export interface ManifestEntry {
  file: string;
  type?: 'course' | 'topic';
  targetCourseName?: string;
}

const manifest = (): ManifestEntry[] => {
  const path = join(ROOT, 'manifest.json');
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  return Array.isArray(parsed?.entries) ? parsed.entries : [];
};

/** Every shipped content file, course files and per-topic files alike. */
export const shippedFiles = (): string[] => {
  const files = readdirSync(ROOT)
    .filter((f) => f.endsWith('.json') && f !== 'manifest.json')
    .map((f) => join(ROOT, f));
  const topics = join(ROOT, 'topics');
  if (existsSync(topics))
    files.push(
      ...readdirSync(topics)
        .filter((f) => f.endsWith('.json'))
        .map((f) => join(topics, f))
    );
  return files;
};

export interface ShippedCourse {
  /** Path relative to `public/courseData`, for error messages a person can act on. */
  file: string;
  /** The course this content belongs to — from the file, or the manifest for a topic file. */
  courseName: string;
  topics: AnyNode[];
  /** The raw parsed root, for tests that validate the file's own shape. */
  raw: unknown;
  /** A topic file imports INTO a course; a course file is one. */
  isTopicFile: boolean;
}

/**
 * Every shipped file, resolved to the course it belongs to.
 *
 * A course file holds `topics` (and may be an array of courses); a topic file
 * IS a topic and names no course at all — the manifest's `targetCourseName` is
 * the only thing that says where it lands, which is exactly why the per-file
 * copies of this could not attribute one.
 */
export const shippedCourses = (): ShippedCourse[] => {
  const entries = manifest();
  const out: ShippedCourse[] = [];

  for (const path of shippedFiles()) {
    const relative = path.slice(ROOT.length + 1);
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    const entry = entries.find((e) => e.file === relative);
    const roots = (Array.isArray(raw) ? raw : [raw]) as AnyNode[];

    for (const root of roots) {
      const isTopicFile = !root?.topics && Array.isArray(root?.subTopics);
      out.push({
        file: relative,
        courseName: isTopicFile
          ? (entry?.targetCourseName ?? '')
          : String(root?.name ?? ''),
        topics: isTopicFile ? [root] : (root?.topics ?? []),
        raw: root,
        isTopicFile,
      });
    }
  }
  return out;
};

/** One question, with the five syllabus levels the term classifier reads. */
export interface ShippedQuestion {
  file: string;
  courseName: string;
  question: string;
  scenario?: string;
  dotPointText: string;
  subTopicName: string;
  topicName: string;
  keywords: string[];
  prompt: AnyNode;
  dotPoint: AnyNode;
}

/** Flatten a course's topics down to its questions, carrying the context with them. */
export const questionsOf = (course: ShippedCourse): ShippedQuestion[] => {
  const out: ShippedQuestion[] = [];
  for (const topic of course.topics ?? [])
    for (const subTopic of topic.subTopics ?? [])
      for (const dotPoint of subTopic.dotPoints ?? [])
        for (const prompt of dotPoint.prompts ?? [])
          out.push({
            file: course.file,
            courseName: course.courseName,
            question: String(prompt.question ?? ''),
            scenario: prompt.scenario,
            dotPointText: dotPoint.description,
            subTopicName: subTopic.name,
            topicName: topic.name,
            keywords: (prompt.keywords ?? []).filter(
              (k: unknown) => typeof k === 'string' && k.trim()
            ),
            prompt,
            dotPoint,
          });
  return out;
};

/** Every shipped question, across every course. */
export const allQuestions = (): ShippedQuestion[] => shippedCourses().flatMap(questionsOf);

/** Just the reference course's questions — course file and its topic files. */
export const referenceQuestions = (): ShippedQuestion[] =>
  allQuestions().filter((q) => REFERENCE_COURSE.test(q.courseName));
