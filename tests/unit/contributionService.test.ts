import { describe, it, expect } from 'vitest';
import { promptToRow, sampleAnswerToRow, toQueueItems } from '../../services/contributionService';
import { Prompt, SampleAnswer } from '../../types';

describe('promptToRow (app Prompt -> DB insert row)', () => {
  it('maps all fields and preserves the app id as legacy_id', () => {
    const prompt: Prompt = {
      id: 'prompt-123',
      question: 'Explain X',
      totalMarks: 6,
      verb: 'EXPLAIN',
      highlightedQuestion: '<b>Explain</b> X',
      scenario: 'A scenario',
      markingCriteria: 'criteria',
      linkedOutcomes: ['O1'],
      keywords: ['x', 'y'],
      targetPerformanceBands: [5, 6],
      estimatedTime: '10 min',
      isPastHSC: true,
      hscYear: 2024,
      hscQuestionNumber: '7b',
    };

    const row = promptToRow(prompt, 'dot-uuid', 'user-uuid', 'pending', {
      score: 82,
      notes: 'Solid question',
    });

    expect(row.dot_point_id).toBe('dot-uuid');
    expect(row.created_by).toBe('user-uuid');
    expect(row.status).toBe('pending');
    expect(row.legacy_id).toBe('prompt-123');
    expect(row.highlighted_question).toBe('<b>Explain</b> X');
    expect(row.total_marks).toBe(6);
    expect(row.is_past_hsc).toBe(true);
    expect(row.hsc_year).toBe(2024);
    expect(row.linked_outcomes).toEqual(['O1']);
    expect(row.quality_score).toBe(82);
    expect(row.quality_notes).toBe('Solid question');
  });

  it('defaults optional fields to null/empty and status to caller value', () => {
    const prompt: Prompt = {
      id: 'p',
      question: 'Q',
      totalMarks: 0,
      verb: 'IDENTIFY',
    };

    const row = promptToRow(prompt, 'd', 'u', 'private');

    expect(row.status).toBe('private');
    expect(row.highlighted_question).toBeNull();
    expect(row.scenario).toBeNull();
    expect(row.hsc_year).toBeNull();
    expect(row.is_past_hsc).toBe(false);
    expect(row.keywords).toEqual([]);
    expect(row.target_performance_bands).toEqual([]);
    // No quality screen passed → null (unscored).
    expect(row.quality_score).toBeNull();
    expect(row.quality_notes).toBeNull();
  });
});

describe('sampleAnswerToRow (app SampleAnswer -> DB insert row)', () => {
  it('maps fields and defaults a missing source to USER', () => {
    const answer = {
      id: 'ans-1',
      band: 5,
      mark: 4,
      answer: 'text',
      quickTip: 'tip',
    } as SampleAnswer;

    const row = sampleAnswerToRow(answer, 'prompt-uuid', 'user-uuid', 'private');

    expect(row.prompt_id).toBe('prompt-uuid');
    expect(row.legacy_id).toBe('ans-1');
    expect(row.created_by).toBe('user-uuid');
    expect(row.status).toBe('private');
    expect(row.source).toBe('USER');
    expect(row.quick_tip).toBe('tip');
    expect(row.feedback).toBeNull();
  });

  it('keeps an explicit AI source (for contributed AI-generated answers)', () => {
    const answer: SampleAnswer = {
      id: 'ans-2',
      band: 6,
      mark: 6,
      answer: 'ai text',
      source: 'AI',
    };
    const row = sampleAnswerToRow(answer, 'p', 'u', 'pending');
    expect(row.source).toBe('AI');
    expect(row.status).toBe('pending');
  });
});

describe('toQueueItems (pending rows -> review list)', () => {
  it('merges prompts and answers, lowest quality score first, with truncated titles', () => {
    const longAnswer = 'x'.repeat(200);
    const items = toQueueItems(
      [{ id: 'p1', question: 'A question', created_at: '2026-01-01T00:00:00Z', quality_score: 80 }],
      [{ id: 'a1', answer: longAnswer, created_at: '2026-06-01T00:00:00Z', quality_score: 30 }]
    );

    expect(items).toHaveLength(2);
    // Riskiest (lowest score) sorts first.
    expect(items[0].kind).toBe('sample_answer');
    expect(items[0].id).toBe('a1');
    expect(items[0].qualityScore).toBe(30);
    expect(items[0].title.endsWith('…')).toBe(true);
    expect(items[0].title.length).toBeLessThan(longAnswer.length);
    expect(items[1].kind).toBe('prompt');
    expect(items[1].title).toBe('A question');
  });

  it('carries the untruncated source text in fullText for reviewer expand/collapse', () => {
    const longAnswer = 'x'.repeat(200);
    const items = toQueueItems(
      [{ id: 'p1', question: 'A question', created_at: null, quality_score: 80 }],
      [{ id: 'a1', answer: longAnswer, created_at: null, quality_score: 30 }]
    );

    const answerItem = items.find((i) => i.id === 'a1')!;
    const promptItem = items.find((i) => i.id === 'p1')!;
    // fullText is never truncated, even when the title is.
    expect(answerItem.fullText).toBe(longAnswer);
    expect(promptItem.fullText).toBe('A question');
  });

  it('sorts unscored items after scored ones', () => {
    const items = toQueueItems(
      [
        { id: 'scored', question: 'q', created_at: null, quality_score: 90 },
        { id: 'unscored', question: 'q', created_at: null, quality_score: null },
      ],
      []
    );
    expect(items.map((i) => i.id)).toEqual(['scored', 'unscored']);
  });

  it('returns an empty list when nothing is pending', () => {
    expect(toQueueItems([], [])).toEqual([]);
  });
});
