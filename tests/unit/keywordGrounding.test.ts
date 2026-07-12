import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateKeywordsForPrompt,
  enrichPromptDetails,
  sanitiseKeywords,
} from '../../services/geminiService';
import { getCommandTermInfo } from '../../data/commandTerms';
import type { Prompt, PromptVerb } from '../../types';

/**
 * "Terms to use in your answer" must stay tethered to the syllabus. These tests
 * drive the real generation code path (only `fetch` mocked) and assert that the
 * syllabus dot point's own named examples are always present and lead the list,
 * regardless of what the model returns — the fix for off-syllabus keywords.
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

const prompt: Prompt = {
  id: 'p1',
  question: 'Describe how software is designed securely.',
  totalMarks: 6,
  verb: 'Describe' as PromptVerb,
  scenario: '',
  markingCriteria: '',
  keywords: [],
  linkedOutcomes: [],
  sampleAnswers: [],
  isPastHSC: false,
};

const termInfo = getCommandTermInfo(prompt.verb);

describe('keyword grounding in syllabus context', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('seeds the syllabus dot point’s named examples ahead of AI terms', async () => {
    // The model returns supporting terms but omits a syllabus-named example.
    fetchMock.mockResolvedValue(makeProxyResponse(['authentication', 'encryption']));

    const result = await generateKeywordsForPrompt(prompt, termInfo, {
      dotPoint: 'apply security features including data protection and input validation',
      focusAreas: ['data protection', 'input validation'],
    });

    // Syllabus-named examples are present even though the AI left them out...
    expect(result).toContain('data protection');
    expect(result).toContain('input validation');
    // ...and lead the list ahead of the AI's supporting terms.
    expect(result.slice(0, 2)).toEqual(['data protection', 'input validation']);
    expect(result).toContain('authentication');
  });

  it('sends the syllabus context to the model in the request body', async () => {
    fetchMock.mockResolvedValue(makeProxyResponse(['encryption']));

    await generateKeywordsForPrompt(prompt, termInfo, {
      topicName: 'Secure Software Architecture',
      subTopicName: 'Designing software',
      dotPoint: 'apply security by design including input validation',
      focusAreas: ['input validation'],
    });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const sentText = JSON.stringify(body);
    expect(sentText).toContain('Secure Software Architecture');
    expect(sentText).toContain('apply security by design including input validation');
    expect(sentText).toContain('input validation');
  });

  it('does not duplicate a seeded example the AI also returned', async () => {
    fetchMock.mockResolvedValue(makeProxyResponse(['input validation', 'encryption']));

    const result = await generateKeywordsForPrompt(prompt, termInfo, {
      dotPoint: 'apply input validation',
      focusAreas: ['input validation'],
    });

    const occurrences = result.filter((k) => k.toLowerCase() === 'input validation').length;
    expect(occurrences).toBe(1);
    expect(result[0]).toBe('input validation');
  });

  it('still works with no syllabus context (behaviour unchanged)', async () => {
    fetchMock.mockResolvedValue(makeProxyResponse(['encryption', 'authentication']));
    const result = await generateKeywordsForPrompt(prompt, termInfo);
    expect(result).toEqual(['encryption', 'authentication']);
  });

  it('enrichPromptDetails also grounds keywords in the syllabus', async () => {
    fetchMock.mockResolvedValue(
      makeProxyResponse({
        scenario: 'A dev team ships a web app.',
        keywords: ['encryption'],
        linkedOutcomes: ['SE-11-06'],
      })
    );

    const result = await enrichPromptDetails(prompt, {
      name: 'Software Engineering',
      outcomes: [{ code: 'SE-11-06', description: 'secure software' }],
      syllabus: {
        dotPoint: 'including input validation and data protection',
        focusAreas: ['input validation', 'data protection'],
      },
    });

    expect(result.keywords.slice(0, 2)).toEqual(['input validation', 'data protection']);
    expect(result.keywords).toContain('encryption');
    expect(result.linkedOutcomes).toEqual(['SE-11-06']);
  });
});

describe('sanitiseKeywords (unchanged contract)', () => {
  it('drops the command verb, generic filler and duplicates', () => {
    const out = sanitiseKeywords(
      ['Describe', 'process', 'encryption', 'Encryption', 'input validation'],
      'Describe'
    );
    expect(out).toEqual(['encryption', 'input validation']);
  });
});
