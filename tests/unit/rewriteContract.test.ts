import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { evaluateAnswer, improveAnswer } from '../../services/geminiService';
import type { EvaluationResult, Prompt, PromptVerb } from '../../types';

/**
 * The marking rewrite and the Regenerate rewrite both come back as
 * `{ text, keyChanges }`: the improved answer, plus the "what changed and why"
 * lines the review modal shows beside it. Before this, the marking rewrite was a
 * bare string and Regenerate returned plain text, so the list was always empty.
 *
 * These drive the real request builders and parsers with `fetch` mocked, so they
 * check what is sent to the model and what comes back from it.
 */
const makeProxyResponse = (payload: unknown) =>
  ({
    ok: true,
    status: 200,
    json: async () => ({
      text: typeof payload === 'string' ? payload : JSON.stringify(payload),
      candidates: [{ finishReason: 'STOP' }],
      usageMetadata: { totalTokenCount: 60 },
    }),
  }) as unknown as Response;

const bodyOf = (mock: ReturnType<typeof vi.fn>) =>
  JSON.parse((mock.mock.calls[0][1] as RequestInit).body as string);

const promptTextOf = (mock: ReturnType<typeof vi.fn>): string =>
  bodyOf(mock).contents.parts[0].text as string;

const prompt: Prompt = {
  id: 'p1',
  question: 'Analyse the impact of caching on system performance.',
  totalMarks: 8,
  verb: 'Analyse' as PromptVerb,
  markingCriteria: '8 marks: ...',
  keywords: [],
  sampleAnswers: [],
} as unknown as Prompt;

const evaluation: EvaluationResult = {
  overallMark: 4,
  overallBand: 2,
  overallFeedback: 'Sound.',
  quickTip: 'Link cause and effect.',
  strengths: [],
  improvements: ['Explain the effect on latency'],
  criteria: [],
};

const ANSWER = 'Caching keeps data in memory.';

const evaluationReply = (revisedAnswer: unknown) => ({
  overallMark: 4,
  overallBand: 2,
  overallFeedback: 'Sound.',
  quickTip: 'Link cause and effect.',
  strengths: [],
  improvements: [],
  criteria: [],
  revisedAnswer,
});

describe('evaluateAnswer asks for the marking rewrite as text plus keyChanges', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi
      .fn()
      .mockResolvedValue(makeProxyResponse(evaluationReply({ text: '', keyChanges: [] })));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('declares revisedAnswer as an object with text and keyChanges', async () => {
    await evaluateAnswer(ANSWER, prompt);

    const schema = bodyOf(fetchMock).config.responseSchema;
    expect(schema.properties.revisedAnswer).toEqual({
      type: 'OBJECT',
      properties: {
        text: { type: 'STRING' },
        keyChanges: { type: 'ARRAY', items: { type: 'STRING' } },
      },
      required: ['text', 'keyChanges'],
    });
  });

  it('briefs the keyChanges lines and the empty form for a withheld rewrite', async () => {
    await evaluateAnswer(ANSWER, prompt);

    const text = promptTextOf(fetchMock);
    expect(text).toContain('2 to 4 short lines');
    expect(text).toContain('at most 20 words');
    expect(text).toContain('WHY');
    expect(text).toContain('{"text": "", "keyChanges": []}');
    expect(text).not.toContain('return an empty string for revisedAnswer');
  });

  it('keeps the structured rewrite, trimmed, with blank keyChanges dropped and capped at four', async () => {
    fetchMock.mockResolvedValue(
      makeProxyResponse(
        evaluationReply({
          text: 'Caching keeps data in memory.',
          mark: 5,
          keyChanges: [
            '  Named the mechanism.  ',
            '',
            '   ',
            'Second.',
            'Third.',
            'Fourth.',
            'Fifth.',
          ],
        })
      )
    );

    const result = await evaluateAnswer(ANSWER, prompt);

    expect(result.revisedAnswer).toEqual({
      text: 'Caching keeps data in memory.',
      mark: 5,
      keyChanges: ['Named the mechanism.', 'Second.', 'Third.', 'Fourth.'],
    });
  });

  it('accepts the structured form without a mark, as the prompt now asks for', async () => {
    fetchMock.mockResolvedValue(
      makeProxyResponse(
        evaluationReply({ text: 'Caching keeps data in memory.', keyChanges: ['Named it.'] })
      )
    );

    const result = await evaluateAnswer(ANSWER, prompt);

    expect(typeof result.revisedAnswer === 'object' && result.revisedAnswer.mark).toBeFalsy();
    expect(typeof result.revisedAnswer === 'object' && result.revisedAnswer.keyChanges).toEqual([
      'Named it.',
    ]);
  });

  it('clears keyChanges when the rewrite text is empty', async () => {
    // Nothing is left for the change list to describe, so it goes too.
    fetchMock.mockResolvedValue(
      makeProxyResponse(evaluationReply({ text: '   ', keyChanges: ['Named the term.'] }))
    );

    const result = await evaluateAnswer(ANSWER, prompt);

    expect(result.revisedAnswer).toEqual({ text: '', keyChanges: [] });
  });

  it('still accepts the plain-string form from an older cache or another provider', async () => {
    fetchMock.mockResolvedValue(
      makeProxyResponse(evaluationReply('Caching keeps data in memory.'))
    );

    const result = await evaluateAnswer(ANSWER, prompt);

    expect(result.revisedAnswer).toBe('Caching keeps data in memory.');
  });
});

describe('evaluateAnswer leaves the rewrite out for a plan that cannot receive it', () => {
  // The server strips the rewrite from a free-tier result (api/gemini.ts), so
  // asking for it paid for output nobody reads. See EvaluateOptions.
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(makeProxyResponse(evaluationReply(undefined)));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('asks for no rewrite in the brief or the schema', async () => {
    await evaluateAnswer(ANSWER, prompt, undefined, undefined, { withRewrite: false });

    const body = bodyOf(fetchMock);
    expect(body.config.responseSchema.properties).not.toHaveProperty('revisedAnswer');
    const text = promptTextOf(fetchMock);
    expect(text).toContain('**Revised Answer**: Not requested.');
    expect(text).not.toContain("Lift the STUDENT'S answer");
    expect(text).not.toContain('Hard length ceiling');
  });

  it('still marks: the mark, the criteria and the feedback come back as before', async () => {
    const result = await evaluateAnswer(ANSWER, prompt, undefined, undefined, {
      withRewrite: false,
    });
    expect(result.overallMark).toBe(4);
    expect(result.revisedAnswer).toBeUndefined();
  });

  it('asks for the rewrite by default, so every other caller is unchanged', async () => {
    await evaluateAnswer(ANSWER, prompt);
    expect(bodyOf(fetchMock).config.responseSchema.properties).toHaveProperty('revisedAnswer');
    expect(promptTextOf(fetchMock)).toContain("Lift the STUDENT'S answer");
  });
});

describe('improveAnswer (Regenerate) returns its keyChanges', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('asks for JSON with text and keyChanges, and keeps the answer-upgrade feature tag', async () => {
    fetchMock.mockResolvedValue(
      makeProxyResponse({ text: 'Caching keeps data in memory.', keyChanges: [] })
    );

    await improveAnswer(ANSWER, prompt, evaluation);

    const body = bodyOf(fetchMock);
    expect(body.config.responseMimeType).toBe('application/json');
    expect(body.config.responseSchema).toEqual({
      type: 'OBJECT',
      properties: {
        text: { type: 'STRING' },
        keyChanges: { type: 'ARRAY', items: { type: 'STRING' } },
      },
      required: ['text', 'keyChanges'],
    });
    expect(body.__feature).toBe('answerUpgrades');
    expect(promptTextOf(fetchMock)).toContain('`keyChanges`');
  });

  it('returns the improved text together with its keyChanges', async () => {
    fetchMock.mockResolvedValue(
      makeProxyResponse({
        text: 'Caching keeps data in memory, cutting latency.',
        keyChanges: ['Explained the effect on latency.'],
      })
    );

    const result = await improveAnswer(ANSWER, prompt, evaluation);

    expect(result.text).toBe('Caching keeps data in memory, cutting latency.');
    expect(result.keyChanges).toEqual(['Explained the effect on latency.']);
    expect(result.mark).toBeGreaterThan(evaluation.overallMark);
  });

  it('trims keyChanges, drops blanks and caps them at four', async () => {
    fetchMock.mockResolvedValue(
      makeProxyResponse({
        text: 'Caching keeps data in memory.',
        keyChanges: [' One. ', '', 'Two.', ' ', 'Three.', 'Four.', 'Five.'],
      })
    );

    const result = await improveAnswer(ANSWER, prompt, evaluation);

    expect(result.keyChanges).toEqual(['One.', 'Two.', 'Three.', 'Four.']);
  });

  it('falls back to plain prose as the answer, with no change list, when the schema is ignored', async () => {
    fetchMock.mockResolvedValue(makeProxyResponse('Caching keeps data in memory.'));

    const result = await improveAnswer(ANSWER, prompt, evaluation);

    expect(result.text).toBe('Caching keeps data in memory.');
    expect(result.keyChanges).toEqual([]);
  });

  it('refuses a broken JSON object rather than saving it as the answer', async () => {
    fetchMock.mockResolvedValue(makeProxyResponse('{"text": "Caching keeps'));

    await expect(improveAnswer(ANSWER, prompt, evaluation)).rejects.toThrow(/could not read/i);
  });

  it('refuses a JSON object of the wrong shape rather than saving it as the answer', async () => {
    fetchMock.mockResolvedValue(makeProxyResponse({ answer: 'Caching keeps data in memory.' }));

    await expect(improveAnswer(ANSWER, prompt, evaluation)).rejects.toThrow(/could not read/i);
  });

  it('treats an empty text field as a failed call, even with keyChanges present', async () => {
    fetchMock.mockResolvedValue(makeProxyResponse({ text: '  ', keyChanges: ['Named the term.'] }));

    await expect(improveAnswer(ANSWER, prompt, evaluation)).rejects.toThrow(/came back empty/i);
  });
});
