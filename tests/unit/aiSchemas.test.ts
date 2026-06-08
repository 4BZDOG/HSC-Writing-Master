import { describe, it, expect } from 'vitest';
import {
  EvaluationResponseSchema,
  GeneratedPromptResponseSchema,
  SampleAnswerResponseSchema,
  validateAiResponse,
} from '../../services/aiSchemas';

describe('validateAiResponse + EvaluationResponseSchema', () => {
  const validEvaluation = {
    overallMark: 7,
    overallBand: 5,
    overallFeedback: 'Solid response.',
    strengths: ['Clear thesis'],
    improvements: ['Add evidence'],
    criteria: [{ criterion: 'Analysis', mark: 4, maxMark: 5, feedback: 'Good' }],
  };

  it('accepts a well-formed evaluation', () => {
    const data = validateAiResponse(EvaluationResponseSchema, validEvaluation, 'evaluation');
    expect(data.overallMark).toBe(7);
    expect(data.criteria).toHaveLength(1);
  });

  it('coerces numeric strings (a common model quirk)', () => {
    const data = validateAiResponse(
      EvaluationResponseSchema,
      { ...validEvaluation, overallMark: '7', overallBand: '5' },
      'evaluation'
    );
    expect(data.overallMark).toBe(7);
    expect(data.overallBand).toBe(5);
  });

  it('defaults missing arrays so downstream code is safe', () => {
    const data = validateAiResponse(
      EvaluationResponseSchema,
      { overallMark: 3, overallBand: 2, overallFeedback: 'ok' },
      'evaluation'
    );
    expect(data.strengths).toEqual([]);
    expect(data.criteria).toEqual([]);
  });

  it('throws a clear error when overallMark is missing', () => {
    expect(() =>
      validateAiResponse(
        EvaluationResponseSchema,
        { overallBand: 5, overallFeedback: 'x' },
        'evaluation'
      )
    ).toThrow(/overallMark/);
  });

  it('throws when a numeric field is non-numeric garbage', () => {
    expect(() =>
      validateAiResponse(
        EvaluationResponseSchema,
        { ...validEvaluation, overallMark: 'not-a-number' },
        'evaluation'
      )
    ).toThrow(/evaluation/);
  });
});

describe('GeneratedPromptResponseSchema', () => {
  it('accepts a valid prompt and defaults optional arrays', () => {
    const data = validateAiResponse(
      GeneratedPromptResponseSchema,
      { question: 'Explain X.', verb: 'Explain', markingCriteria: 'rubric' },
      'prompt'
    );
    expect(data.question).toBe('Explain X.');
    expect(data.keywords).toEqual([]);
    expect(data.linkedOutcomes).toEqual([]);
  });

  it('rejects an empty question', () => {
    expect(() =>
      validateAiResponse(
        GeneratedPromptResponseSchema,
        { question: '', verb: 'Explain', markingCriteria: 'r' },
        'prompt'
      )
    ).toThrow();
  });
});

describe('SampleAnswerResponseSchema', () => {
  it('accepts a valid sample answer', () => {
    const data = validateAiResponse(
      SampleAnswerResponseSchema,
      { answer: 'A model answer.', feedback: 'why it works' },
      'sample answer'
    );
    expect(data.answer).toBe('A model answer.');
  });

  it('rejects a missing answer', () => {
    expect(() =>
      validateAiResponse(SampleAnswerResponseSchema, { feedback: 'x' }, 'sample answer')
    ).toThrow(/sample answer/);
  });
});
