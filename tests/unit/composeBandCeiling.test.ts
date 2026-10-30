import { describe, it, expect } from 'vitest';
import { allQuestions } from './support/shippedCourseData';
import {
  courseBandCeiling,
  getCommandTermInfo,
  getPromptTermInfo,
  getBandForMark,
} from '../../data/commandTerms';
import { recalculateSampleAnswerBands } from '../../utils/dataManagerUtils';
import type { Course, Prompt, PromptVerb } from '../../types';

/**
 * A composition is COMPOSE, a top-tier verb: a 20/20 Module C piece in English
 * Advanced is Band 6 work. In English Standard, Studies and EAL/D the same task
 * tops out at Band 5. CONSTRUCT stays Tier 4 for a built table, graph or plan.
 */
describe('composition band ceiling', () => {
  it('puts COMPOSE in the top tier and leaves CONSTRUCT at Tier 4', () => {
    expect(getCommandTermInfo('COMPOSE' as PromptVerb).tier).toBe(6);
    expect(getCommandTermInfo('CONSTRUCT' as PromptVerb).tier).toBe(4);
  });

  it('caps a composition at Band 5 in the Standard courses only', () => {
    for (const name of ['HSC English Standard', 'HSC English Studies', 'HSC English EAL/D']) {
      expect(courseBandCeiling(name, 'COMPOSE'), name).toBe(5);
    }
    expect(courseBandCeiling('HSC English Advanced', 'COMPOSE')).toBeUndefined();
    expect(courseBandCeiling('HSC English Extension 1', 'COMPOSE')).toBeUndefined();
    expect(courseBandCeiling('HSC English Standard', 'EVALUATE')).toBeUndefined();
    expect(courseBandCeiling('HSC Geography', 'COMPOSE')).toBeUndefined();
  });

  it('reads a question’s tier through its ceiling', () => {
    expect(getPromptTermInfo({ verb: 'COMPOSE' as PromptVerb, bandCeiling: 5 }).tier).toBe(5);
    expect(getPromptTermInfo({ verb: 'COMPOSE' as PromptVerb }).tier).toBe(6);
    // A ceiling never raises a verb.
    expect(getPromptTermInfo({ verb: 'EXPLAIN' as PromptVerb, bandCeiling: 5 }).tier).toBe(3);
  });

  it('sets the ceiling from the course when bands are recalculated', () => {
    const prompt = (id: string): Prompt => ({
      id,
      question: 'Compose a piece of imaginative writing.',
      totalMarks: 20,
      verb: 'COMPOSE' as PromptVerb,
      // A stale ceiling from another course is dropped, not kept.
      bandCeiling: 5,
      sampleAnswers: [
        { id: `${id}-1`, mark: 20, band: 1, source: 'AI', answer: 'x', feedback: 'y' },
      ],
    });
    const course = (name: string): Course =>
      ({
        id: name,
        name,
        outcomes: [],
        topics: [
          {
            id: 't',
            name: 't',
            subTopics: [
              {
                id: 's',
                name: 's',
                dotPoints: [{ id: 'd', description: 'd', prompts: [prompt(name)] }],
              },
            ],
          },
        ],
      }) as unknown as Course;
    const [std, adv] = recalculateSampleAnswerBands([
      course('HSC English Standard'),
      course('HSC English Advanced'),
    ]);
    const first = (c: Course) => c.topics[0].subTopics[0].dotPoints[0].prompts[0];
    expect(first(std).bandCeiling).toBe(5);
    expect(first(std).sampleAnswers![0].band).toBe(5);
    expect(first(adv).bandCeiling).toBeUndefined();
    expect(first(adv).sampleAnswers![0].band).toBe(6);
  });

  it('ships every Standard composition at Band 5 and no other question with a ceiling', () => {
    const off: string[] = [];
    for (const { courseName, prompt } of allQuestions()) {
      const expected = courseBandCeiling(courseName, prompt.verb);
      if (prompt.bandCeiling !== expected) off.push(`${prompt.id}: ${prompt.bandCeiling}`);
      for (const sa of prompt.sampleAnswers ?? []) {
        if (prompt.verb === 'COMPOSE' && sa.mark === prompt.totalMarks) {
          const ceiling = getPromptTermInfo(prompt).tier;
          if (getBandForMark(sa.mark, prompt.totalMarks, ceiling) !== ceiling) off.push(sa.id);
        }
      }
    }
    expect(off).toEqual([]);
  });
});
