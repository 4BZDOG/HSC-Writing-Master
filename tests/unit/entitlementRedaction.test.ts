import { describe, it, expect } from 'vitest';
import {
  isEvaluationRequest,
  redactEvaluationResponse,
  redactPaidFeedback,
  LOCKED_FEEDBACK_PLACEHOLDER,
} from '../../api/_lib/entitlements';

/**
 * The content paywall has to hold on the SERVER. The UI blurs locked feedback,
 * but blurred text is still in the DOM — so the free tier's result is trimmed
 * before it leaves the proxy, and a marking request is recognised from its own
 * shape rather than from a client-supplied tag.
 */

const evaluationPayload = () => ({
  overallMark: 7,
  overallBand: 5,
  overallFeedback: 'A sound response with gaps in synthesis.',
  quickTip: 'Name the syllabus term before you apply it.',
  strengths: ['Clear thesis', 'Good use of evidence'],
  improvements: ['Sustain the judgement through the final paragraph'],
  criteria: [
    { criterion: 'Knowledge', mark: 3, maxMark: 4, feedback: 'Thorough but uneven.' },
    { criterion: 'Analysis', mark: 4, maxMark: 6, feedback: 'Describes where it should analyse.' },
  ],
  revisedAnswer: 'A full band 6 rewrite of the student answer…',
});

const geminiResponse = (text: string) => ({
  candidates: [{ content: { parts: [{ text }] } }],
  usageMetadata: { totalTokenCount: 1234 },
});

const evaluationSchema = {
  type: 'object',
  properties: {
    overallMark: { type: 'integer' },
    overallBand: { type: 'integer' },
    criteria: { type: 'array' },
  },
  required: ['overallMark', 'overallBand', 'overallFeedback', 'criteria'],
};

describe('isEvaluationRequest', () => {
  it('recognises the client tag', () => {
    expect(isEvaluationRequest({ __feature: 'evaluation', contents: 'x' })).toBe(true);
  });

  it('recognises a marking request whose tag has been stripped', () => {
    // The whole point: a tampered client that drops __feature to dodge the
    // free-tier meter is still recognised by what it asks the model for.
    expect(isEvaluationRequest({ contents: 'x', config: { responseSchema: evaluationSchema } })).toBe(
      true
    );
  });

  it('recognises it from properties when `required` is absent', () => {
    expect(
      isEvaluationRequest({
        config: { responseSchema: { properties: evaluationSchema.properties } },
      })
    ).toBe(true);
  });

  it('leaves other AI calls alone', () => {
    expect(isEvaluationRequest({ contents: 'generate a question' })).toBe(false);
    expect(
      isEvaluationRequest({
        config: {
          responseSchema: {
            required: ['question', 'markingCriteria'],
            properties: { question: {}, markingCriteria: {} },
          },
        },
      })
    ).toBe(false);
  });

  it('tolerates junk bodies', () => {
    expect(isEvaluationRequest(null)).toBe(false);
    expect(isEvaluationRequest('nope')).toBe(false);
    expect(isEvaluationRequest({ config: { responseSchema: 'not an object' } })).toBe(false);
  });
});

describe('redactPaidFeedback', () => {
  it('withholds criterion feedback, the improvement path and the rewrite', () => {
    const redacted = redactPaidFeedback(evaluationPayload());
    expect(redacted.criteria?.every((c) => c.feedback === LOCKED_FEEDBACK_PLACEHOLDER)).toBe(true);
    expect(redacted.improvements).toEqual([LOCKED_FEEDBACK_PLACEHOLDER]);
    expect(redacted.revisedAnswer).toBe('');
  });

  it('withholds the rewrite in its structured form too', () => {
    // The evaluation request asks for a plain string, but only Gemini enforces
    // a response schema — the OpenRouter/Groq/Kimi adapters treat it as a hint,
    // and the client's Zod schema accepts either shape. A string-only check
    // handed a free user the whole band-6 rewrite whenever a provider chose the
    // object form, which is the answerUpgrades feature given away outright.
    const redacted = redactPaidFeedback({
      ...evaluationPayload(),
      revisedAnswer: {
        text: 'A full band 6 rewrite of the student answer…',
        mark: 9,
        band: 6,
        keyChanges: ['Sustained judgement', 'Named the syllabus term'],
      },
    });
    const rewrite = redacted.revisedAnswer as { text: string; keyChanges: string[]; band: number };
    expect(rewrite.text).toBe('');
    expect(rewrite.keyChanges).toEqual([]);
    // The shape survives — the client validates this payload, so deleting the
    // field would show an error instead of a paywall.
    expect(rewrite.band).toBe(6);
  });

  it('keeps the summary the free tier is promised, and every mark', () => {
    const original = evaluationPayload();
    const redacted = redactPaidFeedback(original);
    expect(redacted.overallMark).toBe(7);
    expect(redacted.overallBand).toBe(5);
    expect(redacted.overallFeedback).toBe(original.overallFeedback);
    expect(redacted.quickTip).toBe(original.quickTip);
    expect(redacted.strengths).toEqual(original.strengths);
    // Marks per criterion survive — the band breakdown chart and the stored
    // stats depend on them; only the prose is withheld.
    expect(redacted.criteria?.map((c) => c.mark)).toEqual([3, 4]);
    expect(redacted.criteria?.map((c) => c.criterion)).toEqual(['Knowledge', 'Analysis']);
  });

  it('preserves the shape the client validates against', () => {
    const redacted = redactPaidFeedback(evaluationPayload());
    // Deleting fields would fail the client's Zod schema and show an error
    // instead of a paywall.
    for (const key of ['overallMark', 'overallBand', 'overallFeedback', 'quickTip', 'criteria']) {
      expect(redacted).toHaveProperty(key);
    }
  });

  it('does not mutate the original payload', () => {
    const original = evaluationPayload();
    redactPaidFeedback(original);
    expect(original.criteria[0].feedback).toBe('Thorough but uneven.');
  });
});

describe('redactEvaluationResponse', () => {
  it('redacts the marking payload inside a provider response', () => {
    const response = geminiResponse(JSON.stringify(evaluationPayload()));
    const out = redactEvaluationResponse(response) as ReturnType<typeof geminiResponse>;
    const parsed = JSON.parse(out.candidates[0].content.parts[0].text);
    expect(parsed.criteria[0].feedback).toBe(LOCKED_FEEDBACK_PLACEHOLDER);
    expect(parsed.overallMark).toBe(7);
  });

  it('still redacts when the model wraps the JSON in code fences', () => {
    // The client's parser extracts JSON from surrounding prose, so a stricter
    // server would leak exactly when the model decided to add a fence.
    const fenced = '```json\n' + JSON.stringify(evaluationPayload()) + '\n```';
    const out = redactEvaluationResponse(geminiResponse(fenced)) as ReturnType<
      typeof geminiResponse
    >;
    const text = out.candidates[0].content.parts[0].text;
    expect(text.startsWith('```json')).toBe(true);
    expect(text).toContain(LOCKED_FEEDBACK_PLACEHOLDER);
    expect(text).not.toContain('Describes where it should analyse.');
  });

  it('leaves non-evaluation responses untouched', () => {
    const other = geminiResponse(JSON.stringify({ question: 'Analyse the causes.', marks: 8 }));
    expect(redactEvaluationResponse(other)).toBe(other);
  });

  it('leaves prose responses untouched', () => {
    const prose = geminiResponse('Here is some plain text with no JSON at all.');
    expect(redactEvaluationResponse(prose)).toBe(prose);
  });

  it('preserves everything outside the redacted part', () => {
    const response = geminiResponse(JSON.stringify(evaluationPayload()));
    const out = redactEvaluationResponse(response) as typeof response;
    expect(out.usageMetadata).toEqual({ totalTokenCount: 1234 });
  });

  it('never throws on malformed bodies', () => {
    expect(() => redactEvaluationResponse(null)).not.toThrow();
    expect(() => redactEvaluationResponse('text')).not.toThrow();
    expect(() => redactEvaluationResponse({ candidates: 'nope' })).not.toThrow();
    expect(() => redactEvaluationResponse({ candidates: [{}] })).not.toThrow();
    expect(() => redactEvaluationResponse({ candidates: [{ content: { parts: [{}] } }] })).not.toThrow();
  });
});
