import { describe, it, expect } from 'vitest';
import {
  minimumTierForMarks,
  verbFitsLength,
  liftVerbForLength,
  fitVerbsToLength,
  lengthMismatchNote,
  getCommandTermsForMarks,
  getCommandTermInfo,
  bandMarkRanges,
  commandTermsList,
} from '../../data/commandTerms';
import { validateAndFixCourses } from '../../utils/dataManagerUtils';
import { shippedCourses, questionsOf } from './support/shippedCourseData';
import type { Course, PromptVerb } from '../../types';

/**
 * A mark is only a band step while a question is short. At 20 marks an Explain
 * has three bands seven marks apart, so a 14 and a 20 read as the same result;
 * a Tier 5 verb gives NESA's own five bands. The floor keeps that combination
 * from being created, and these tests hold the places that create questions to it.
 */
describe('minimum verb tier by length', () => {
  it('sets the floor by the length of the question', () => {
    expect([1, 3, 6].map(minimumTierForMarks)).toEqual([1, 1, 1]);
    expect([7, 9].map(minimumTierForMarks)).toEqual([3, 3]);
    expect([10, 12, 14].map(minimumTierForMarks)).toEqual([4, 4, 4]);
    expect([15, 20, 25].map(minimumTierForMarks)).toEqual([5, 5, 5]);
  });

  it('refuses a low-tier verb on a long question and accepts a fitting one', () => {
    expect(verbFitsLength('EXPLAIN' as PromptVerb, 20)).toBe(false);
    expect(verbFitsLength('EXPLAIN' as PromptVerb, 12)).toBe(false);
    expect(verbFitsLength('ANALYSE' as PromptVerb, 12)).toBe(true);
    expect(verbFitsLength('DISCUSS' as PromptVerb, 20)).toBe(true);
    expect(verbFitsLength('EVALUATE' as PromptVerb, 25)).toBe(true);
    // Short questions keep every verb: Identify and Outline are real short-answer verbs.
    expect(verbFitsLength('IDENTIFY' as PromptVerb, 2)).toBe(true);
    expect(verbFitsLength('EXPLAIN' as PromptVerb, 6)).toBe(true);
  });

  it('keeps composition tasks at Tier 4 at any length', () => {
    expect(verbFitsLength('CONSTRUCT' as PromptVerb, 20)).toBe(true);
    expect(verbFitsLength('CONSTRUCT' as PromptVerb, 15)).toBe(true);
  });

  it('raises a verb that does not fit to the default for the length, and leaves the rest alone', () => {
    expect(liftVerbForLength('EXPLAIN' as PromptVerb, 20)).toEqual({
      verb: 'DISCUSS',
      lifted: true,
    });
    expect(liftVerbForLength('DESCRIBE' as PromptVerb, 12)).toEqual({
      verb: 'ANALYSE',
      lifted: true,
    });
    expect(liftVerbForLength('IDENTIFY' as PromptVerb, 8)).toEqual({
      verb: 'EXPLAIN',
      lifted: true,
    });
    expect(liftVerbForLength('ASSESS' as PromptVerb, 20)).toEqual({
      verb: 'ASSESS',
      lifted: false,
    });
  });

  it('never leaves a lifted verb below the floor', () => {
    for (const t of commandTermsList)
      for (let m = 1; m <= 25; m++) {
        const { verb } = liftVerbForLength(t.term, m);
        expect(verbFitsLength(verb, m), `${t.term} at ${m} marks -> ${verb}`).toBe(true);
      }
  });

  it('says what is wrong in words a teacher can act on', () => {
    const note = lengthMismatchNote('EXPLAIN' as PromptVerb, 20);
    expect(note).toContain('3 bands across 20 marks');
    expect(note).toContain('DISCUSS');
    expect(note).toContain('split');
  });

  it('only offers fitting verbs for a mark value, and keeps a verb for every length', () => {
    for (const m of [7, 10, 12, 15, 20]) {
      const { terms, primaryTerm } = getCommandTermsForMarks(m);
      expect(terms.length).toBeGreaterThan(0);
      for (const t of terms) expect(verbFitsLength(t.term, m), `${t.term} at ${m}`).toBe(true);
      expect(verbFitsLength(primaryTerm.term, m)).toBe(true);
    }
  });

  it("filters a caller's verb list, and raises the first verb when none fit", () => {
    const explain = getCommandTermInfo('EXPLAIN' as PromptVerb);
    const discuss = getCommandTermInfo('DISCUSS' as PromptVerb);
    expect(fitVerbsToLength([explain, discuss], 20).map((v) => v.term)).toEqual(['DISCUSS']);
    expect(fitVerbsToLength([explain], 20).map((v) => v.term)).toEqual(['DISCUSS']);
    expect(fitVerbsToLength([explain], 5).map((v) => v.term)).toEqual(['EXPLAIN']);
  });

  it('gives a long question the ladder NESA marks it against', () => {
    // The point of the floor: 20 marks at Tier 5 is five bands of four marks.
    expect(bandMarkRanges(20, 5).map((r) => `${r.lo}-${r.hi}`)).toEqual([
      '17-20',
      '13-16',
      '9-12',
      '5-8',
      '1-4',
    ]);
  });

  it('raises the verb on import', () => {
    const course = {
      id: 'c1',
      name: 'Test course',
      outcomes: [],
      topics: [
        {
          id: 't1',
          name: 'Topic',
          subTopics: [
            {
              id: 's1',
              name: 'Sub',
              dotPoints: [
                {
                  id: 'd1',
                  description: 'Explain something',
                  prompts: [
                    {
                      id: 'p1',
                      question: 'Explain the causes of the event.',
                      verb: 'EXPLAIN',
                      totalMarks: 20,
                    },
                    { id: 'p2', question: 'Explain the cause.', verb: 'EXPLAIN', totalMarks: 5 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    } as unknown as Course;
    const fixed = validateAndFixCourses([course]);
    const prompts = fixed[0].topics[0].subTopics[0].dotPoints[0].prompts;
    expect(prompts.find((p) => p.id === 'p1')?.verb).toBe('DISCUSS');
    expect(prompts.find((p) => p.id === 'p2')?.verb).toBe('EXPLAIN');
  });
});

describe('shipped questions', () => {
  it('carry a verb that can show their length as bands', () => {
    const bad: string[] = [];
    for (const course of shippedCourses().filter((c) => !c.isTopicFile))
      for (const q of questionsOf(course)) {
        const { verb, totalMarks, id } = q.prompt as {
          verb: string;
          totalMarks: number;
          id: string;
        };
        if (!verbFitsLength(verb, totalMarks)) bad.push(`${id}: ${verb} at ${totalMarks} marks`);
      }
    expect(bad.slice(0, 10)).toEqual([]);
  });
});
