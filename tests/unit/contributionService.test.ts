import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  promptToRow,
  sampleAnswerToRow,
  toQueueItems,
  moderateStructure,
  topicToRow,
  subTopicToRow,
  dotPointToRow,
} from '../../services/contributionService';
import { Prompt, SampleAnswer } from '../../types';

const rpcMock = vi.fn();
vi.mock('../../services/supabaseClient', () => ({
  supabase: { rpc: (...a: unknown[]) => rpcMock(...a) },
  fetchAllRows: vi.fn(),
}));

describe('promptToRow (app Prompt -> DB insert row)', () => {
  it('maps all fields and preserves the app id as legacy_id', () => {
    const prompt: Prompt = {
      id: 'prompt-123',
      question: 'Explain X',
      totalMarks: 6,
      verb: 'EXPLAIN',
      scenario: 'A scenario',
      markingCriteria: 'criteria',
      linkedOutcomes: ['O1'],
      keywords: ['x', 'y'],
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
    expect(row.scenario).toBeNull();
    expect(row.hsc_year).toBeNull();
    expect(row.is_past_hsc).toBe(false);
    expect(row.keywords).toEqual([]);
    // `highlighted_question`, `target_performance_bands` and `estimated_time`
    // are no longer written: two were denormalised copies of values the app
    // derives, the third was dead. Their columns remain, nullable or defaulted.
    expect('highlighted_question' in row).toBe(false);
    expect('target_performance_bands' in row).toBe(false);
    expect('estimated_time' in row).toBe(false);
    // No quality screen passed → null (unscored).
    expect(row.quality_score).toBeNull();
    expect(row.quality_notes).toBeNull();
    // No scenarioImage → all three columns default to null.
    expect(row.scenario_image_path).toBeNull();
    expect(row.scenario_image_alt).toBeNull();
    expect(row.scenario_image_updated_at).toBeNull();
  });

  it('maps scenarioImage.storagePath/alt/updatedAt into the three image columns', () => {
    const prompt: Prompt = {
      id: 'p',
      question: 'Q',
      totalMarks: 0,
      verb: 'IDENTIFY',
      scenarioImage: {
        id: 'p',
        alt: 'A network diagram',
        updatedAt: Date.parse('2026-01-15T10:00:00.000Z'),
        storagePath: 'p/p',
      },
    };

    const row = promptToRow(prompt, 'd', 'u', 'private');

    expect(row.scenario_image_path).toBe('p/p');
    expect(row.scenario_image_alt).toBe('A network diagram');
    expect(row.scenario_image_updated_at).toBe('2026-01-15T10:00:00.000Z');
  });

  it('defaults scenario_image_alt to null when the ref has no alt text', () => {
    const prompt: Prompt = {
      id: 'p',
      question: 'Q',
      totalMarks: 0,
      verb: 'IDENTIFY',
      scenarioImage: {
        id: 'p',
        updatedAt: Date.parse('2026-01-15T10:00:00.000Z'),
        storagePath: 'p/p',
      },
    };

    const row = promptToRow(prompt, 'd', 'u', 'private');

    expect(row.scenario_image_alt).toBeNull();
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

  it('surfaces the parent question as context for sample answers', () => {
    const items = toQueueItems(
      [{ id: 'p1', question: 'A question', created_at: null, quality_score: 50 }],
      [
        {
          id: 'a-obj',
          answer: 'embed as object',
          created_at: null,
          quality_score: 40,
          prompts: { question: 'Parent Q (object)' },
        },
        {
          id: 'a-arr',
          answer: 'embed as array',
          created_at: null,
          quality_score: 30,
          prompts: [{ question: 'Parent Q (array)' }],
        },
        { id: 'a-none', answer: 'no embed', created_at: null, quality_score: 20 },
      ]
    );

    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    expect(byId['p1'].context).toBeNull(); // questions have no parent context
    expect(byId['a-obj'].context).toBe('Parent Q (object)');
    expect(byId['a-arr'].context).toBe('Parent Q (array)');
    expect(byId['a-none'].context).toBeNull();
  });
});

describe('moderateStructure (reviewer structure moderation)', () => {
  beforeEach(() => rpcMock.mockReset());

  it('routes approve through set_structure_status with the kind + status', async () => {
    rpcMock.mockResolvedValue({ error: null });
    await moderateStructure('topic', 'topic-uuid', 'approved');
    expect(rpcMock).toHaveBeenCalledWith('set_structure_status', {
      p_kind: 'topic',
      p_id: 'topic-uuid',
      p_status: 'approved',
    });
  });

  it('routes reject for a dot point', async () => {
    rpcMock.mockResolvedValue({ error: null });
    await moderateStructure('dot_point', 'dp-uuid', 'rejected');
    expect(rpcMock).toHaveBeenCalledWith('set_structure_status', {
      p_kind: 'dot_point',
      p_id: 'dp-uuid',
      p_status: 'rejected',
    });
  });

  it('surfaces an RPC error', async () => {
    rpcMock.mockResolvedValue({ error: { message: 'not a reviewer' } });
    await expect(moderateStructure('sub_topic', 'st-uuid', 'approved')).rejects.toThrow(
      /not a reviewer/
    );
  });
});

describe('structural mappers (app -> DB row)', () => {
  it('topicToRow carries course, legacy id, band descriptors and status', () => {
    const row = topicToRow(
      {
        id: 'topic-1',
        name: 'Networks',
        subTopics: [],
        performanceBandDescriptors: [{ band: 6 }],
      } as never,
      'course-uuid',
      'user-uuid',
      'pending'
    );
    expect(row).toMatchObject({
      course_id: 'course-uuid',
      legacy_id: 'topic-1',
      name: 'Networks',
      status: 'pending',
      created_by: 'user-uuid',
    });
    expect(row.band_descriptors).toEqual([{ band: 6 }]);
    // A Year 12 topic sends no `year` at all, so a database that has not
    // applied schema §22 sees exactly the row it saw before the column existed.
    expect('year' in row).toBe(false);
  });

  it('topicToRow marks a Year 11 topic, and only a Year 11 topic', () => {
    const row = topicToRow(
      { id: 'topic-2', name: 'Cells', subTopics: [], year: 'year11' } as never,
      'course-uuid',
      'user-uuid',
      'pending'
    );
    expect(row.year).toBe('year11');
  });

  it('subTopicToRow and dotPointToRow carry their parent + label', () => {
    const st = subTopicToRow(
      { id: 'st-1', name: 'Subnetting', dotPoints: [] } as never,
      't-uuid',
      'u',
      'pending'
    );
    expect(st).toMatchObject({
      topic_id: 't-uuid',
      legacy_id: 'st-1',
      name: 'Subnetting',
      status: 'pending',
    });
    const dp = dotPointToRow(
      { id: 'dp-1', description: 'Explain CIDR', prompts: [] } as never,
      'st-uuid',
      'u',
      'pending'
    );
    expect(dp).toMatchObject({
      sub_topic_id: 'st-uuid',
      legacy_id: 'dp-1',
      description: 'Explain CIDR',
      status: 'pending',
    });
  });
});

describe('toQueueItems with structure', () => {
  it('includes structural nodes, labelled by kind and sorted after scored items', () => {
    const items = toQueueItems(
      [{ id: 'p1', question: 'Scored Q', created_at: null, quality_score: 90 }],
      [],
      [
        { id: 't1', kind: 'topic', label: 'A Topic', created_at: null },
        { id: 'd1', kind: 'dot_point', label: 'A dot point', created_at: null },
      ]
    );
    // Scored prompt first; structure (no score) after.
    expect(items[0].id).toBe('p1');
    const topic = items.find((i) => i.id === 't1')!;
    expect(topic.kind).toBe('topic');
    expect(topic.context).toBe('Topic');
    expect(topic.qualityScore).toBeNull();
    expect(items.find((i) => i.id === 'd1')!.context).toBe('Dot point');
  });
});
