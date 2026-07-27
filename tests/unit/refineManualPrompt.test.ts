import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { refineManualPrompt } from '../../services/geminiService';
import type { CourseOutcome } from '../../types';

/**
 * The manual composer's choices are decisions, not hints. These drive the real
 * code path (fetch mocked) and assert that a pinned verb, a scenario switched
 * off and hand-picked outcomes all survive a model that ignores them.
 */
const makeProxyResponse = (json: unknown) =>
  ({
    ok: true,
    status: 200,
    json: async () => ({
      text: JSON.stringify(json),
      candidates: [{ finishReason: 'STOP' }],
      usageMetadata: { totalTokenCount: 50 },
    }),
  }) as unknown as Response;

const outcomes: CourseOutcome[] = [
  { code: 'SE-11-01', description: 'first' },
  { code: 'SE-11-02', description: 'second' },
];

const modelReply = {
  question: 'Explain X.',
  verb: 'Explain',
  totalMarks: 99,
  scenario: 'A dev team ships a release under deadline.',
  markingCriteria: '4 marks: ...',
  keywords: ['release'],
  linkedOutcomes: ['SE-11-02'],
};

const bodyOf = (mock: ReturnType<typeof vi.fn>) =>
  JSON.parse((mock.mock.calls[0][1] as RequestInit).body as string);

describe('refineManualPrompt options', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(makeProxyResponse(modelReply));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('behaves as before when no options are passed', async () => {
    const prompt = await refineManualPrompt('rough idea', 'Course', 'Topic', outcomes, 4);

    expect(prompt.verb).toBe('EXPLAIN');
    expect(prompt.scenario).toBe(modelReply.scenario);
    expect(prompt.linkedOutcomes).toEqual(['SE-11-02']);
    // The teacher's mark value always wins over the model's.
    expect(prompt.totalMarks).toBe(4);

    const sent = JSON.stringify(bodyOf(fetchMock));
    expect(sent).toContain('Select Verb');
    expect(sent).toContain('Create a Scenario');
  });

  it('holds the question to a pinned verb even when the model returns another', async () => {
    const prompt = await refineManualPrompt('rough idea', 'Course', 'Topic', outcomes, 8, {
      verb: 'ASSESS',
    });

    expect(prompt.verb).toBe('ASSESS');
    const sent = JSON.stringify(bodyOf(fetchMock));
    expect(sent).toContain('Command Verb (FIXED)');
    expect(sent).toContain('ASSESS');
  });

  it('drops a scenario the model wrote anyway when scenarios are off', async () => {
    const prompt = await refineManualPrompt('rough idea', 'Course', 'Topic', outcomes, 4, {
      includeScenario: false,
    });

    expect(prompt.scenario).toBe('');

    const body = bodyOf(fetchMock);
    expect(JSON.stringify(body)).toContain('No Scenario');
    expect(body.config.responseSchema.required).not.toContain('scenario');
  });

  it('uses exactly the outcomes the teacher pinned', async () => {
    const prompt = await refineManualPrompt('rough idea', 'Course', 'Topic', outcomes, 4, {
      pinnedOutcomes: ['SE-11-01'],
    });

    expect(prompt.linkedOutcomes).toEqual(['SE-11-01']);

    // The unchosen outcome is not even offered to the model.
    const sent = JSON.stringify(bodyOf(fetchMock));
    expect(sent).toContain('Outcomes (FIXED)');
    expect(sent).not.toContain('SE-11-02');
  });

  it('grounds the question in the dot point when one is supplied', async () => {
    await refineManualPrompt('rough idea', 'Course', 'Topic', outcomes, 4, {
      dotPoint: 'Explore the applications of web programming.',
    });

    expect(JSON.stringify(bodyOf(fetchMock))).toContain(
      'Explore the applications of web programming.'
    );
  });
});
