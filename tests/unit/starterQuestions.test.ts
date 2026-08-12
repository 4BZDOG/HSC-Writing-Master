import { describe, it, expect } from 'vitest';
import {
  findStarterTargets,
  planStarterQuestion,
  questionCoverage,
} from '../../utils/starterQuestions';
import type { Course } from '../../types';

/**
 * Seeding does not finish at the structure.
 *
 * An imported syllabus gives topics, sub-topics and dot points and no
 * questions — the one thing a student opens the app for. This is the pass that
 * fills that in, and the coverage figure that says whether it needs running.
 */

const dotPoint = (id: string, description: string, prompts: unknown[] = []) => ({
  id,
  description,
  prompts,
});

const course = {
  id: 'c1',
  name: 'HSC Biology',
  outcomes: [],
  topics: [
    {
      id: 't1',
      name: 'Heredity',
      subTopics: [
        {
          id: 'st1',
          name: 'Reproduction',
          dotPoints: [
            dotPoint('dp1', 'identify the features of asexual reproduction'),
            dotPoint('dp2', 'explain the mechanisms of meiosis', [{ id: 'p1' }]),
          ],
        },
      ],
    },
    {
      id: 't2',
      name: 'Genetic Change',
      subTopics: [
        { id: 'st2', name: 'Mutation', dotPoints: [dotPoint('dp3', 'evaluate the effect of…')] },
      ],
    },
  ],
} as unknown as Course;

describe('finding what still needs a question', () => {
  it('lists only the syllabus points with nothing on them', () => {
    // Topping up a dot point that already has a question is a different job —
    // this pass is "make the course usable", and running it twice must be free.
    expect(findStarterTargets(course).map((t) => t.path.dotPointId)).toEqual(['dp1', 'dp3']);
  });

  it('can be narrowed to one topic', () => {
    expect(findStarterTargets(course, { topicId: 't2' }).map((t) => t.path.dotPointId)).toEqual([
      'dp3',
    ]);
  });

  it('carries the names a question needs to be written about', () => {
    const [first] = findStarterTargets(course);
    expect(first.topicName).toBe('Heredity');
    expect(first.subTopicName).toBe('Reproduction');
    expect(first.description).toContain('asexual reproduction');
  });
});

describe('planning one starter question', () => {
  it('reads the demand out of the syllabus point’s own verb', () => {
    // NESA writes the demand into the dot point: "identify" is a two-mark ask
    // and "evaluate" is not. Generating everything at one weight would produce
    // a course whose marks say nothing.
    const identify = planStarterQuestion('identify the features of asexual reproduction', () => 0);
    const evaluate = planStarterQuestion('evaluate the effect of mutation', () => 0);
    expect(identify.targetMarks).toBeLessThan(evaluate.targetMarks);
  });

  it('always offers the dot point’s own verb, whatever the mark band suggests', () => {
    // The syllabus said what kind of thinking this point is for. The mark band
    // is a second opinion, and where the two disagree the syllabus wins by
    // being in the list at all.
    for (const [text, verb] of [
      ['identify the features of asexual reproduction', 'identify'],
      ['critically evaluate the impact of biotechnology', 'critically evaluate'],
    ] as const) {
      const plan = planStarterQuestion(text, () => 0);
      expect(plan.verbs.map((v) => v.term.toLowerCase())).toContain(verb);
    }
  });

  it('falls back to a middling ask when there is no verb to read', () => {
    const plan = planStarterQuestion('cell structure and function');
    expect(plan.targetMarks).toBe(5);
    expect(plan.verbs.length).toBeGreaterThan(0);
  });
});

describe('question coverage', () => {
  it('counts syllabus points with a question against the total', () => {
    expect(questionCoverage(course)).toEqual({ dotPoints: 3, withQuestions: 1 });
    expect(questionCoverage(course, { topicId: 't1' })).toEqual({
      dotPoints: 2,
      withQuestions: 1,
    });
  });

  it('reports nothing to cover as zero of zero, not as zero per cent', () => {
    // An empty topic is unwritten, not neglected — the chip hides rather than
    // marking it 0%.
    expect(questionCoverage({ topics: [] })).toEqual({ dotPoints: 0, withQuestions: 0 });
  });
});
