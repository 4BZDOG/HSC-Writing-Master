import { describe, it, expect } from 'vitest';
import { geminiToKimiRequest, kimiToClientResponse } from '../../api/_lib/kimi';

describe('geminiToKimiRequest', () => {
  it('flattens contents.parts into a single user message and carries the model', () => {
    const body = geminiToKimiRequest({
      model: 'kimi-k3',
      contents: { parts: [{ text: 'Mark this answer.' }, { text: 'Second part.' }] },
    });
    expect(body.model).toBe('kimi-k3');
    expect(body.messages).toEqual([{ role: 'user', content: 'Mark this answer.\nSecond part.' }]);
    expect(body.max_tokens).toBeGreaterThan(0);
  });

  it('falls back to a default model when none is supplied', () => {
    const body = geminiToKimiRequest({ contents: { parts: [{ text: 'q' }] } });
    expect(body.model).toBe('kimi-k3');
  });

  it('prepends a JSON-only system message (with the schema) for JSON requests', () => {
    const body = geminiToKimiRequest({
      model: 'kimi-k3',
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

  it('never sends temperature (fixed server-side by Kimi)', () => {
    const body = geminiToKimiRequest({
      contents: { parts: [{ text: 'q' }] },
      config: { temperature: 0.2 },
    });
    expect('temperature' in body).toBe(false);
  });

  it('handles array-form contents', () => {
    const body = geminiToKimiRequest({
      contents: [{ parts: [{ text: 'First block.' }] }, { parts: [{ text: 'Second block.' }] }],
    });
    expect(body.messages[0].content).toBe('First block.\nSecond block.');
  });

  it('uses maxOutputTokens from config when provided', () => {
    const body = geminiToKimiRequest({
      contents: { parts: [{ text: 'q' }] },
      config: { maxOutputTokens: 4096 },
    });
    expect(body.max_tokens).toBe(4096);
  });
});

describe('kimiToClientResponse', () => {
  it('maps choices[0].message.content to the client envelope', () => {
    const out = kimiToClientResponse({
      choices: [{ message: { content: '{"overallMark":5}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 100, completion_tokens: 20 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (kimiToClientResponse({ choices: [{ finish_reason: 'length' }] }) as any).candidates[0]
        .finishReason
    ).toBe('MAX_TOKENS');
    expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (kimiToClientResponse({ choices: [{ finish_reason: 'content_filter' }] }) as any)
        .candidates[0].finishReason
    ).toBe('SAFETY');
  });

  it('degrades gracefully on an empty/malformed response', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = kimiToClientResponse({}) as any;
    expect(out.text).toBe('');
    expect(out.usageMetadata.totalTokenCount).toBe(0);
  });
});
