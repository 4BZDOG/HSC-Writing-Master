import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateNewPrompt } from '../../services/geminiService';
import { getCommandTermInfo } from '../../data/commandTerms';
import type { CourseOutcome } from '../../types';

/**
 * The question generator can build a question WITH a scenario or as a direct,
 * scenario-free question. These drive the real code path (fetch mocked) and
 * assert the request and the returned prompt honour the caller's choice.
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

const verbs = [getCommandTermInfo('Describe')];
const outcomes: CourseOutcome[] = [{ code: 'SE-11-01', description: 'x' }];

const bodyOf = (mock: ReturnType<typeof vi.fn>) =>
  JSON.parse((mock.mock.calls[0][1] as RequestInit).body as string);

describe('generateNewPrompt scenario handling', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the scenario when scenarios are enabled (default)', async () => {
    fetchMock.mockResolvedValue(
      makeProxyResponse({
        question: 'Describe X.',
        verb: 'Describe',
        scenario: 'A dev team ships a release under deadline.',
        markingCriteria: '2 marks: ...',
        keywords: ['release'],
        linkedOutcomes: ['SE-11-01'],
      })
    );

    const prompt = await generateNewPrompt('Course', 'Topic', 'describe X', 4, verbs, outcomes);
    expect(prompt.scenario).toBe('A dev team ships a release under deadline.');

    // The request asks for a scenario and marks it required.
    const body = bodyOf(fetchMock);
    const sent = JSON.stringify(body);
    expect(sent).toContain('A realistic context paragraph');
    const required = body.config.responseSchema.required as string[];
    expect(required).toContain('scenario');
  });

  it('produces no scenario when scenarios are disabled', async () => {
    // Even if the model returns a stray scenario, the caller's choice wins.
    fetchMock.mockResolvedValue(
      makeProxyResponse({
        question: 'Describe X.',
        verb: 'Describe',
        scenario: 'Some stray scenario the model added anyway.',
        markingCriteria: '2 marks: ...',
        keywords: ['release'],
        linkedOutcomes: ['SE-11-01'],
      })
    );

    const prompt = await generateNewPrompt(
      'Course',
      'Topic',
      'describe X',
      4,
      verbs,
      outcomes,
      undefined,
      'balanced',
      6,
      false
    );
    expect(prompt.scenario).toBe('');

    // The request instructs no scenario and drops it from required fields.
    const body = bodyOf(fetchMock);
    const sent = JSON.stringify(body);
    expect(sent).toContain('Do NOT write a scenario');
    expect(sent).toContain('scenario-free');
    const required = body.config.responseSchema.required as string[];
    expect(required).not.toContain('scenario');
  });
});
