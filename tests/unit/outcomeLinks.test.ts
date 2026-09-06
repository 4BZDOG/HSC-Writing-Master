import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  normaliseOutcomeCode,
  normaliseOutcomeLinks,
  normaliseCourseOutcomeLinks,
} from '../../utils/dataManagerUtils';
import { Course } from '../../types';

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
 */
describe('shipped courses resolve their own outcomes', () => {
  const dir = join(process.cwd(), 'public/courseData');

  it('every prompt that declares outcomes resolves at least one', () => {
    const orphans: string[] = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(join(dir, file), 'utf8'));
      } catch {
        continue;
      }
      const course = (Array.isArray(parsed) ? parsed[0] : parsed) as Course | undefined;
      if (!course?.topics) continue;
      const codes = new Set((course.outcomes || []).map((o) => o.code));
      for (const topic of course.topics)
        for (const sub of topic.subTopics || [])
          for (const dot of sub.dotPoints || [])
            for (const prompt of dot.prompts || []) {
              const links = prompt.linkedOutcomes || [];
              if (!links.length) continue;
              if (!links.some((code) => codes.has(code)))
                orphans.push(`${file} ${prompt.id}: ${links.join(', ')}`);
            }
    }
    expect(orphans, `these questions render no "What's Assessed" panel:\n${orphans.join('\n')}`).toEqual([]);
  });
});
