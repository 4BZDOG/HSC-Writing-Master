import { describe, it, expect } from 'vitest';
import { geminiToAnthropicRequest, anthropicToClientResponse } from '../../api/_lib/anthropic';

/**
 * The Anthropic adapter translates the app's Gemini-shaped requests into the
 * Anthropic Messages API and maps the response back into the envelope the
 * client already consumes. Verifying the pure translation lets us ship Claude
 * support with confidence without a live key.
 */
describe('geminiToAnthropicRequest', () => {
  it('flattens contents.parts into a single user prompt and carries the model', () => {
    const body = geminiToAnthropicRequest({
      model: 'claude-sonnet-4-6',
      contents: { parts: [{ text: 'Mark this answer.' }, { text: 'Second part.' }] },
    });
    expect(body.model).toBe('claude-sonnet-4-6');
    expect(body.messages).toEqual([{ role: 'user', content: 'Mark this answer.\nSecond part.' }]);
    expect(body.max_tokens).toBeGreaterThan(0);
  });

  it('adds a JSON-only system instruction (with the schema) for JSON requests', () => {
    const body = geminiToAnthropicRequest({
      model: 'claude-sonnet-4-6',
      contents: { parts: [{ text: 'q' }] },
      config: {
        responseMimeType: 'application/json',
        responseSchema: { type: 'OBJECT', properties: { overallMark: { type: 'INTEGER' } } },
      },
    });
    expect(body.system).toMatch(/valid JSON/i);
    expect(body.system).toMatch(/overallMark/); // schema serialised in so field names match
  });

  it('passes temperature through for marking consistency', () => {
    const body = geminiToAnthropicRequest({
      model: 'claude-sonnet-4-6',
      contents: { parts: [{ text: 'q' }] },
      config: { temperature: 0.2 },
    });
    expect(body.temperature).toBe(0.2);
  });

  it('omits system + temperature when not requested (plain text call)', () => {
    const body = geminiToAnthropicRequest({
      model: 'claude-haiku-4-5',
      contents: { parts: [{ text: 'Suggest a topic name.' }] },
    });
    expect(body.system).toBeUndefined();
    expect(body.temperature).toBeUndefined();
  });
});

describe('anthropicToClientResponse', () => {
  it('maps text blocks, STOP finish reason, and usage into the client envelope', () => {
    const mapped = anthropicToClientResponse({
      content: [
        { type: 'text', text: '{"overallMark":' },
        { type: 'text', text: '7}' },
      ],
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 25 },
    }) as {
      text: string;
      candidates: { finishReason: string }[];
      usageMetadata: { totalTokenCount: number };
    };

    expect(mapped.text).toBe('{"overallMark":7}');
    expect(mapped.candidates[0].finishReason).toBe('STOP');
    expect(mapped.usageMetadata.totalTokenCount).toBe(125);
  });

  it('maps a refusal stop reason to SAFETY so the client surfaces it', () => {
    const mapped = anthropicToClientResponse({
      content: [],
      stop_reason: 'refusal',
    }) as { candidates: { finishReason: string }[] };
    expect(mapped.candidates[0].finishReason).toBe('SAFETY');
  });
});
