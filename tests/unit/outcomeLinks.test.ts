import { describe, it, expect } from 'vitest';
import {
  normaliseOutcomeCode,
  normaliseOutcomeLinks,
  normaliseCourseOutcomeLinks,
} from '../../utils/dataManagerUtils';
import { Course } from '../../types';
import { shippedCourses, questionsOf } from './support/shippedCourseData';

/**
 * An outcome link is a code, not the statement the code stands for.
 *
 * `ReferenceMaterials` resolves a prompt's outcomes by exact equality on the
 * code, and gates the whole "What's Assessed" section on the resolved list
 * being non-empty — so a link that stores the whole statement did not render an
 * empty panel, it removed the panel. Seventeen shipped Software Engineering
 * questions never showed a student the standards they are marked against, and
 * nothing said so.
 *
 * Two gates: the shape rule, and the shipped data actually resolving.
 */

describe('outcome link normalisation', () => {
  it('takes the code off a "CODE: statement" link', () => {
    expect(
      normaliseOutcomeCode(
        'SE-12-04: evaluates practices to safely and securely collect, use and store data'
      )
    ).toBe('SE-12-04');
    expect(normaliseOutcomeCode('BIO12-12: explains natural selection')).toBe('BIO12-12');
  });

  it('leaves a bare code untouched', () => {
    expect(normaliseOutcomeCode('SE-12-04')).toBe('SE-12-04');
    expect(normaliseOutcomeCode('  BI-12-01  ')).toBe('BI-12-01');
  });

  it('refuses to truncate a shape it does not recognise', () => {
    // A head with whitespace is prose, not a code. Mangling it to its first
    // word would be worse than failing to match it.
    const prose = 'evaluates practices: safely and securely';
    expect(normaliseOutcomeCode(prose)).toBe(prose);
    expect(normaliseOutcomeCode(': leading colon')).toBe(': leading colon');
    expect(normaliseOutcomeCode('SE-12-04:')).toBe('SE-12-04:');
  });

  it('de-duplicates once the statements collapse to their codes', () => {
    expect(normaliseOutcomeLinks(['SE-12-04: one', 'SE-12-04', ' SE-12-07 ', ''])).toEqual([
      'SE-12-04',
      'SE-12-07',
    ]);
  });

  it('is a no-op on healthy data, so the migration is safe to re-run', () => {
    const course = {
      id: 'c',
      name: 'c',
      outcomes: [],
      topics: [
        {
          id: 't',
          name: 't',
          subTopics: [
            {
              id: 's',
              name: 's',
              dotPoints: [
                {
                  id: 'd',
                  description: 'd',
                  prompts: [{ id: 'p', linkedOutcomes: ['SE-12-04'] }],
                },
              ],
            },
          ],
        },
      ],
    } as unknown as Course;
    const once = normaliseCourseOutcomeLinks([course]);
    const twice = normaliseCourseOutcomeLinks(once);
    expect(twice[0].topics[0].subTopics[0].dotPoints[0].prompts[0].linkedOutcomes).toEqual([
      'SE-12-04',
    ]);
  });
});

/**
 * The shipped data itself. The unit rule above can be right while the courses
 * on disk are still broken — this is the half that a student would have felt.
 *
 * Widened to what it always meant to cover. It read the top level of
 * `public/courseData` only, so the two per-topic files under `topics/` — 56
 * questions declaring outcomes, which import into Biology and Software
 * Engineering — were never checked; and it took `parsed[0]` from an array
 * file, so a second course in one would have been invisible too. Neither gap
 * was hiding a break (all 340 declared links resolve today), but a scan that
 * silently walks less than it claims reads as proof that it did.
 *
 * A topic file carries no outcome list of its own, which is why this needs the
 * walker: outcomes live on the COURSE, and the manifest is the only thing that
 * says which course a topic file lands in.
 */
describe('shipped courses resolve their own outcomes', () => {
  const courses = shippedCourses();

  /** Outcome codes per course, taken from the course files that declare them. */
  const codesByCourse = new Map<string, Set<string>>();
  for (const course of courses) {
    if (course.isTopicFile) continue;
    const outcomes = ((course.raw as Course).outcomes ?? []).map((o) => o.code);
    codesByCourse.set(course.courseName, new Set(outcomes));
  }

  it('knows the outcome list of every course it is about to check', () => {
    // Without this, a renamed course silently yields an empty code set, every
    // link "fails to resolve", and the real assertion below drowns in noise —
    // or worse, a course with no questions passes it in silence.
    for (const [course, codes] of codesByCourse) {
      if (course === 'My Example Course (Template)') continue;
      expect(codes.size, `${course} declares no outcomes`).toBeGreaterThan(0);
    }
  });

  it('every prompt that declares outcomes resolves at least one', () => {
    const orphans: string[] = [];
    let declared = 0;
    for (const course of courses) {
      const codes = codesByCourse.get(course.courseName) ?? new Set<string>();
      for (const question of questionsOf(course)) {
        const links: string[] =
          (question.prompt as { linkedOutcomes?: string[] }).linkedOutcomes ?? [];
        if (!links.length) continue;
        declared++;
        if (!links.some((code) => codes.has(code)))
          orphans.push(`${course.file} ${question.prompt.id}: ${links.join(', ')}`);
      }
    }
    // The per-topic files are the reason this number is not 284.
    expect(declared).toBeGreaterThan(300);
    expect(
      orphans,
      `these questions render no "What's Assessed" panel:\n${orphans.join('\n')}`
    ).toEqual([]);
  });
});
