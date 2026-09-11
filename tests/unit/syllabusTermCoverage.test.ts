import { describe, it, expect } from 'vitest';
import { classifySyllabusTerms } from '../../utils/syllabusTermSource';
import { isWeakLoneTerm } from '../../utils/syllabusTermGaps';
import {
  allQuestions,
  referenceQuestions,
  REFERENCE_COURSE,
  type ShippedQuestion,
} from './support/shippedCourseData';

/**
 * What the must-use rule actually does to the shipped library.
 *
 * The unit tests around `classifySyllabusTerms` pin the RULES on questions
 * written to exercise them. They cannot see the thing that matters most about a
 * matcher: how much of the real library it moves. A stemmer tweak that looks
 * harmless in isolation can promote or demote a fifth of every terms list at
 * once, and the only symptom is a panel that quietly means something different.
 *
 * Two kinds of line, and they are now held over different content:
 *
 *  - The INVARIANT — no must-use term is a lone command verb or a word the
 *    whole course is written in — applies to EVERY course. It never needs
 *    re-baselining, it is a rule about the code, and it was the original bug:
 *    "Evaluate" ×4 and "security" ×10 marked as terms a Band 6 answer must use.
 *  - The RANGE — the share of questions carrying a must-use term, and the share
 *    of terms promoted — applies to the REFERENCE COURSE only.
 *
 * ## Why the range is no longer measured over everything
 *
 * It used to be, and the blended figure was 85.3% of questions and 38.9% of
 * terms: comfortably inside the bounds, and true of no course in the library.
 * Measured separately:
 *
 *   Software Engineering   93.4% of questions,  40.9% of terms   (+ its topic file, 97.6% / 40.9%)
 *   Biology                68.4%,               23.8%
 *   Enterprise Computing  100.0%,               91.5%
 *
 * Enterprise Computing has all but nine of its terms marked must-use, which is
 * the panel's two groups saying the same thing — exactly the collapse the upper
 * bound exists to catch. It passed because Biology's 23.8% pulled the average
 * back into range. An average of a broken course and a sound one is not a
 * measurement, and the bound it satisfies is not a guarantee.
 *
 * So the range is held over Software Engineering, the one course that has been
 * through a full authoring pass. The others are known-stale and due for bulk
 * regeneration; holding a code-regression pin to content that is about to be
 * replaced wholesale means re-baselining on every content drop, which is how a
 * pin stops being read. They are still measured — see the report below — so
 * the moment one of them is regenerated, the numbers are there to judge it by.
 */

interface Row {
  question: string;
  course: string;
  terms: string[];
  mustUse: string[];
}

const classify = (questions: ShippedQuestion[]): Row[] =>
  questions
    .filter((q) => q.keywords.length > 0)
    .map((q) => {
      const named = classifySyllabusTerms(q.keywords, {
        question: q.question,
        scenario: q.scenario,
        dotPointText: q.dotPointText,
        subTopicName: q.subTopicName,
        topicName: q.topicName,
      });
      return {
        question: q.question,
        course: q.courseName,
        terms: q.keywords,
        mustUse: q.keywords.filter((t) => named.has(t)),
      };
    });

/** Share of questions carrying at least one must-use term. */
const questionShare = (rows: Row[]): number =>
  rows.filter((row) => row.mustUse.length > 0).length / rows.length;

/** Share of all listed terms that are must-use. */
const termShare = (rows: Row[]): number => {
  const terms = rows.reduce((n, row) => n + row.terms.length, 0);
  return rows.reduce((n, row) => n + row.mustUse.length, 0) / terms;
};

const everything = classify(allQuestions());
const reference = classify(referenceQuestions());

describe('must-use terms across the shipped library', () => {
  it('has both the whole library and the reference course to measure', () => {
    expect(everything.length).toBeGreaterThan(400);
    expect(reference.length).toBeGreaterThan(150);
    // A typo in REFERENCE_COURSE would leave `reference` empty and every bound
    // below trivially satisfied, so prove the filter selected something real
    // and that it is genuinely narrower than the whole library.
    expect(reference.every((row) => REFERENCE_COURSE.test(row.course))).toBe(true);
    expect(reference.length).toBeLessThan(everything.length);
  });

  it('never promotes a lone command verb or a word the course is written in — in ANY course', () => {
    const offenders = everything
      .flatMap((row) =>
        row.mustUse.filter(isWeakLoneTerm).map((t) => `${t} — ${row.course} — ${row.question}`)
      )
      .slice(0, 10);
    expect(offenders).toEqual([]);
  });

  describe('the reference course', () => {
    it('leaves most questions carrying at least one must-use term', () => {
      const share = questionShare(reference);
      // Measured at 94.2% over the reference course's 224 questions. Below 80%
      // the matcher has stopped seeing questions it used to. There is no upper
      // bound here: a well-written question names its own syllabus terms, so
      // every question carrying one is the target, not a warning.
      expect(share).toBeGreaterThan(0.8);
    });

    it('keeps the split meaningful — a minority of terms are must-use', () => {
      const share = termShare(reference);
      // Measured at 40.9%. Past half, "must-use" has stopped distinguishing
      // anything and the panel's two groups say the same thing — which is the
      // bound that matters, and the one the blended figure was hiding.
      expect(share).toBeGreaterThan(0.3);
      expect(share).toBeLessThan(0.5);
    });
  });

  it('reports the other courses without gating on them', () => {
    // Not an assertion: these are the courses due for regeneration, and this is
    // the yardstick to judge a regenerated one by. Printed so a content drop
    // can be measured without anyone having to write this script again.
    const byCourse = new Map<string, Row[]>();
    for (const row of everything) {
      if (REFERENCE_COURSE.test(row.course)) continue;
      const existing = byCourse.get(row.course);
      if (existing) existing.push(row);
      else byCourse.set(row.course, [row]);
    }
    const lines = [...byCourse.entries()]
      .filter(([, rows]) => rows.length >= 10)
      .map(
        ([course, rows]) =>
          `${course}: ${rows.length} questions, ${(questionShare(rows) * 100).toFixed(1)}% carry a must-use term, ` +
          `${(termShare(rows) * 100).toFixed(1)}% of terms are must-use`
      );
    console.log('\n  Courses outside the quality gate:\n    ' + lines.join('\n    '));
    // Deliberately not a bound on the count: retiring a stale course is a
    // legitimate thing to do, and this test failing because there was nothing
    // left to report would be a false alarm on a good day's work. What it does
    // assert is that the split worked — the reference course is measured by the
    // gates above and must not also appear here.
    expect(lines.filter((line) => REFERENCE_COURSE.test(line))).toEqual([]);
  });
});
