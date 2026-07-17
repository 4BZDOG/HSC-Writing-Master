import { describe, it, expect } from 'vitest';
import { CourseSchema, repairPromptIntegrity } from '../../utils/dataManagerUtils';
import { getCommandTermInfo } from '../../data/commandTerms';
import type { Course, Prompt, PromptVerb } from '../../types';

/**
 * Imported JSON could leave a prompt with an unrecognised verb (undefined) or
 * totalMarks of 0. The UI surfaces fall back differently for those — the
 * navigator re-extracts a verb from the question text while the prompt/editor
 * default to EXPLAIN — so one question rendered with different tier colours in
 * different places. The import schema and the v2.3.0 migration must both
 * canonicalise these fields.
 */

const courseWith = (prompt: Record<string, unknown>) => ({
  name: 'Course',
  outcomes: [],
  topics: [
    {
      name: 'Topic',
      subTopics: [
        {
          name: 'Sub',
          dotPoints: [{ description: 'describe X', prompts: [prompt] }],
        },
      ],
    },
  ],
});

const parsePrompt = (prompt: Record<string, unknown>) => {
  const result = CourseSchema.safeParse(courseWith(prompt));
  expect(result.success).toBe(true);
  return (result as { success: true; data: Course }).data.topics[0].subTopics[0].dotPoints[0]
    .prompts[0];
};

describe('import schema verb canonicalisation', () => {
  it('keeps a canonical uppercase verb as-is', () => {
    const p = parsePrompt({ question: 'Describe X.', verb: 'DESCRIBE', totalMarks: 4 });
    expect(p.verb).toBe('DESCRIBE');
  });

  it('uppercases a known mixed-case verb', () => {
    const p = parsePrompt({ question: 'Describe X.', verb: 'describe', totalMarks: 4 });
    expect(p.verb).toBe('DESCRIBE');
  });

  it('uppercases a known multi-word verb', () => {
    const p = parsePrompt({ question: 'Analyse X.', verb: 'Critically analyse', totalMarks: 6 });
    expect(p.verb).toBe('CRITICALLY ANALYSE');
  });

  it('resolves a decorated verb to the known verb inside it', () => {
    const p = parsePrompt({ question: 'X.', verb: 'Please discuss the following', totalMarks: 8 });
    expect(p.verb).toBe('DISCUSS');
  });

  it('falls back to the verb extracted from the question text', () => {
    const p = parsePrompt({
      question: 'Evaluate the impact of automation on society.',
      verb: 'banana',
      totalMarks: 8,
    });
    expect(p.verb).toBe('EVALUATE');
  });

  it('defaults to EXPLAIN when neither verb nor question yields a known verb', () => {
    const p = parsePrompt({ question: 'What about the thing?', verb: '???', totalMarks: 3 });
    expect(p.verb).toBe('EXPLAIN');
  });

  it('repairs a zero/invalid totalMarks to the verb’s minimum mark', () => {
    const p = parsePrompt({ question: 'Describe X.', verb: 'DESCRIBE', totalMarks: 0 });
    expect(p.totalMarks).toBe(getCommandTermInfo('DESCRIBE' as PromptVerb).markRange[0]);
  });

  it('rounds fractional marks to a whole number', () => {
    const p = parsePrompt({ question: 'Describe X.', verb: 'DESCRIBE', totalMarks: 4.4 });
    expect(p.totalMarks).toBe(4);
  });
});

describe('repairPromptIntegrity (v2.3.0 migration)', () => {
  it('repairs stored prompts with missing verbs and zero marks, and no-ops healthy ones', () => {
    const course = {
      id: 'c1',
      name: 'C',
      outcomes: [],
      topics: [
        {
          id: 't1',
          name: 'T',
          subTopics: [
            {
              id: 's1',
              name: 'S',
              dotPoints: [
                {
                  id: 'd1',
                  description: 'describe X',
                  prompts: [
                    {
                      id: 'p1',
                      question: 'Assess the effectiveness of the policy.',
                      verb: undefined as unknown as PromptVerb,
                      totalMarks: 0,
                      sampleAnswers: [],
                    },
                    {
                      id: 'p2',
                      question: 'Describe X.',
                      verb: 'DESCRIBE' as PromptVerb,
                      totalMarks: 4,
                      sampleAnswers: [],
                    },
                  ] as Prompt[],
                },
              ],
            },
          ],
        },
      ],
    } as unknown as Course;

    const [repaired] = repairPromptIntegrity([course]);
    const [broken, healthy] =
      repaired.topics[0].subTopics[0].dotPoints[0].prompts;

    expect(broken.verb).toBe('ASSESS');
    expect(broken.totalMarks).toBeGreaterThanOrEqual(1);
    // Healthy prompt is returned untouched (same reference — cheap no-op).
    expect(healthy.verb).toBe('DESCRIBE');
    expect(healthy.totalMarks).toBe(4);
  });
});
