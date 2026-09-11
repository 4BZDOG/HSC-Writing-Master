import { describe, it, expect } from 'vitest';
import { CourseSchema } from '../../utils/dataManagerUtils';
import { shippedCourses, questionsOf, type ShippedCourse } from './support/shippedCourseData';

/**
 * The shipped content, put through the app's own front door.
 *
 * `CourseSchema` is deliberately forgiving. A question with no mark value, a
 * verb it does not recognise, marking criteria in the wrong shape — none of
 * these reject the file, because ONE bad question used to reject an entire
 * import, and hand-written and LLM-authored courses are the normal case. So
 * the schema repairs instead: `.catch()` substitutes a placeholder and the
 * import succeeds.
 *
 * That tolerance is right for a file a user drags in. It is wrong for the
 * files WE ship, and nothing checked them: `CourseSchema` was only ever
 * exercised against hand-written fixtures, so the content students actually
 * receive had no gate at all. A repair on our own content is not resilience,
 * it is a defect that has been rendered invisible — a sample answer whose body
 * failed to parse does not error, it reaches a student as an exemplar reading
 * "No answer provided."
 *
 * This matters most right now, because the stale courses are due to be
 * regenerated in bulk by an external model. Bulk generation is exactly the
 * event that produces a null where a string belongs, in one question out of
 * four hundred, in a file no one will read end to end.
 *
 * So: every shipped file imports, and no placeholder is load-bearing. This is
 * the STRUCTURAL bar and it applies to every course, refined or stale — a
 * malformed file breaks the app for everyone, whatever the content quality.
 * The quality bar is a separate test (`syllabusTermCoverage`) and deliberately
 * scoped to the reference course.
 *
 * Each check below was verified by corrupting the shipped data and watching it
 * fail, which is the only way to know a content gate is a gate: a null exemplar
 * body, a null question stem and a null topic name each fire the placeholder
 * check, and a `prompts` array replaced by an object fires the parse check.
 */

/*
 * Two checks were tried here and deliberately are not present, because
 * measuring them first is the only reason they are not:
 *
 *  - "every question is markable". `repairPromptFields` falls back to EXPLAIN
 *    and the bottom of its mark range, unconditionally, so the assertion can
 *    never fail. A test that cannot fail still reads as coverage, which is
 *    worse than no test.
 *  - "the stored verb matches the question text", and "marks sit inside the
 *    verb's range". Neither is a defect: `extractCommandVerb` finds a command
 *    word ANYWHERE in the stem, so "Compare and contrast…" reads as CONTRAST
 *    while COMPARE is correct; and 114 shipped questions sit outside their
 *    verb's range because `markRange` is a TYPICAL range — ManualPromptModal
 *    shows it as advice and says pairing an unusual verb with a mark value is
 *    a valid thing to want. A 3-mark JUSTIFY is an ordinary HSC question.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The strings the schema substitutes when it cannot use what it was given. */
const PLACEHOLDERS = {
  question: 'Untitled Question',
  answer: 'No answer provided.',
  topic: 'Untitled Topic',
  subTopic: 'Untitled Sub-Topic',
  dotPoint: 'No description',
  course: 'Untitled Course',
};

const courses = shippedCourses();

/** A topic file is not a course, so it is parsed as the topic it is. */
const parseFor = (course: ShippedCourse) =>
  course.isTopicFile
    ? CourseSchema.safeParse({ name: course.courseName || 'Topic file', topics: [course.raw] })
    : CourseSchema.safeParse(course.raw);

/**
 * Parsed once, and shared — but the reason this is a list of BOTH outcomes
 * rather than only the successes is the important part. Each check below used
 * to skip a file that failed to parse, which meant one malformed file hid
 * every other defect in it: corrupt a course four ways and only the parse
 * check spoke up, so a fix for that one failure would reveal three more on the
 * next run. A file that could not be read is now reported by every check that
 * could not read it, so one run tells you everything that is wrong.
 */
const parsed = courses.map((course) => ({ course, result: parseFor(course) }));

/** The files each downstream check could not look at, named so they are not mistaken for passes. */
const unreadable = parsed
  .filter(({ result }) => !result.success)
  .map(({ course }) => `${course.file}: could not be parsed, so this check could not run`);

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const readable = parsed.filter(({ result }) => result.success) as Array<{
  course: ShippedCourse;
  result: { success: true; data: any };
}>;

describe('shipped course data survives the app’s own import', () => {
  it('is actually looking at every shipped course', () => {
    // The guard on the guard. Every check in this file, and in
    // courseDataIds/outcomeLinks, is a loop over whatever the walker returns —
    // so a JSON restructure that the walker does not understand does not fail
    // anything, it silently iterates nothing and every content test goes green
    // over zero rows. Naming the courses means that shows up here instead.
    const withQuestions = courses
      .filter((course) => questionsOf(course).length > 0)
      .map((course) => course.courseName);

    expect(withQuestions).toEqual(
      expect.arrayContaining([
        'HSC Software Engineering',
        'HSC Biology',
        'HSC Enterprise Computing',
      ])
    );
    // Both per-topic files import into a course that is already listed, so the
    // count exceeds the three named above; it must never fall below them.
    expect(courses.flatMap(questionsOf).length).toBeGreaterThan(400);
  });

  it('every file parses — no shipped course fails the import outright', () => {
    const failures = parsed
      .filter(({ result }) => !result.success)
      .map(
        ({ course, result }) =>
          `${course.file}: ${JSON.stringify(
            (result as { error: { issues: unknown[] } }).error.issues.slice(0, 3)
          )}`
      );
    expect(failures).toEqual([]);
  });

  it('never needs a placeholder — no repair is load-bearing in what we ship', () => {
    // Each of these is a string a STUDENT would read, standing where real
    // content should be. "No answer provided." is the worst of them: it is
    // shipped as a band-N exemplar and looks like one.
    const repaired: string[] = [...unreadable];
    for (const { course, result } of readable) {
      const data = result.data as any;
      const where = (...parts: string[]) => `${course.file} → ${parts.join(' → ')}`;

      if (!course.isTopicFile && data.name === PLACEHOLDERS.course)
        repaired.push(where('course name'));

      for (const topic of data.topics ?? []) {
        if (topic.name === PLACEHOLDERS.topic) repaired.push(where('topic name'));
        for (const subTopic of topic.subTopics ?? []) {
          if (subTopic.name === PLACEHOLDERS.subTopic)
            repaired.push(where(topic.name, 'sub-topic name'));
          for (const dotPoint of subTopic.dotPoints ?? []) {
            if (dotPoint.description === PLACEHOLDERS.dotPoint)
              repaired.push(where(topic.name, subTopic.name, 'dot point description'));
            for (const prompt of dotPoint.prompts ?? []) {
              if (prompt.question === PLACEHOLDERS.question)
                repaired.push(where(subTopic.name, 'question text'));
              for (const sample of prompt.sampleAnswers ?? []) {
                if (sample.answer === PLACEHOLDERS.answer)
                  repaired.push(
                    where(subTopic.name, `exemplar for "${prompt.question.slice(0, 50)}…"`)
                  );
              }
            }
          }
        }
      }
    }
    expect(repaired.slice(0, 10)).toEqual([]);
  });
});
