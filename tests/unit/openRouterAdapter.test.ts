import { describe, it, expect } from 'vitest';
import { geminiToOpenRouterRequest, openRouterToClientResponse } from '../../api/_lib/openrouter';

/**
 * The OpenRouter adapter translates the app's Gemini-shaped requests into the
 * OpenAI Chat Completions format (which OpenRouter serves for GLM, DeepSeek,
 * Qwen, Llama, …) and maps the response back into the envelope the client
 * already consumes. Verifying the pure translation lets us ship open-model
 * support with confidence, no live key required.
 */
describe('geminiToOpenRouterRequest', () => {
  it('flattens contents.parts into a single user message and carries the model', () => {
    const body = geminiToOpenRouterRequest({
      model: 'z-ai/glm-4.6',
      contents: { parts: [{ text: 'Mark this answer.' }, { text: 'Second part.' }] },
    });
    expect(body.model).toBe('z-ai/glm-4.6');
    expect(body.messages).toEqual([{ role: 'user', content: 'Mark this answer.\nSecond part.' }]);
    expect(body.max_tokens).toBeGreaterThan(0);
  });

  it('falls back to a default model when none is supplied', () => {
    const body = geminiToOpenRouterRequest({ contents: { parts: [{ text: 'q' }] } });
    expect(body.model).toBe('z-ai/glm-4.6');
  });

  it('prepends a JSON-only system message (with the schema) for JSON requests', () => {
    const body = geminiToOpenRouterRequest({
      model: 'z-ai/glm-4.6',
      contents: { parts: [{ text: 'q' }] },
      config: {
        responseMimeType: 'application/json',
        responseSchema: { type: 'OBJECT', properties: { overallMark: { type: 'INTEGER' } } },
      },
    });
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toMatch(/valid JSON/i);
    expect(body.messages[0].content).toMatch(/overallMark/);
    expect(body.messages[1]).toEqual({ role: 'user', content: 'q' });
  });

  it('carries temperature only when provided', () => {
    expect(
      geminiToOpenRouterRequest({ contents: { parts: [{ text: 'q' }] } }).temperature
    ).toBeUndefined();
    expect(
      geminiToOpenRouterRequest({
        contents: { parts: [{ text: 'q' }] },
        config: { temperature: 0.2 },
      }).temperature
    ).toBe(0.2);
  });
});

describe('openRouterToClientResponse', () => {
  it('maps choices[0].message.content to the client envelope', () => {
    const out = openRouterToClientResponse({
      choices: [{ message: { content: '{"overallMark":5}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 100, completion_tokens: 20 },
    }) as any;

    expect(out.text).toBe('{"overallMark":5}');
    expect(out.candidates[0].finishReason).toBe('STOP');
    expect(out.candidates[0].content.parts[0].text).toBe('{"overallMark":5}');
    expect(out.usageMetadata).toEqual({
      promptTokenCount: 100,
      candidatesTokenCount: 20,
      totalTokenCount: 120,
    });
  });

  it('maps a length finish_reason to MAX_TOKENS and content_filter to SAFETY', () => {
    expect(
      (openRouterToClientResponse({ choices: [{ finish_reason: 'length' }] }) as any).candidates[0]
        .finishReason
    ).toBe('MAX_TOKENS');
    expect(
      (openRouterToClientResponse({ choices: [{ finish_reason: 'content_filter' }] }) as any)
        .candidates[0].finishReason
    ).toBe('SAFETY');
  });

  it('degrades gracefully on an empty/malformed response', () => {
    const out = openRouterToClientResponse({}) as any;
    expect(out.text).toBe('');
    expect(out.usageMetadata.totalTokenCount).toBe(0);
  });
});
