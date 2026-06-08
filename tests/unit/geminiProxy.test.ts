import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Gemini SDK so the proxy core can be tested without a real key.
const generateContentMock = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: generateContentMock };
  },
}));

import { runGeminiProxy } from '../../api/_lib/generate';

describe('runGeminiProxy', () => {
  beforeEach(() => {
    generateContentMock.mockReset();
  });

  it('returns 500 when the API key is missing', async () => {
    const result = await runGeminiProxy(undefined, { contents: 'x' });
    expect(result.status).toBe(500);
    expect((result.body as { error: string }).error).toMatch(/GEMINI_API_KEY/);
  });

  it('returns 400 for an invalid request body', async () => {
    const result = await runGeminiProxy('key', null);
    expect(result.status).toBe(400);
  });

  it('returns the response text explicitly so it survives JSON serialisation', async () => {
    generateContentMock.mockResolvedValue({
      candidates: [{ finishReason: 'STOP' }],
      usageMetadata: { totalTokenCount: 5 },
      text: '{"ok":true}',
    });

    const result = await runGeminiProxy('key', { contents: 'x' });

    expect(result.status).toBe(200);
    const body = result.body as { text: string; candidates: unknown[] };
    expect(body.text).toBe('{"ok":true}');
    expect(body.candidates).toHaveLength(1);
  });

  it('maps SDK errors to their status code and message', async () => {
    const err = Object.assign(new Error('API key not valid'), { status: 403 });
    generateContentMock.mockRejectedValue(err);

    const result = await runGeminiProxy('key', { contents: 'x' });

    expect(result.status).toBe(403);
    expect((result.body as { error: string }).error).toContain('API key not valid');
  });

  it('falls back to status 500 for errors without a status', async () => {
    generateContentMock.mockRejectedValue(new Error('boom'));
    const result = await runGeminiProxy('key', { contents: 'x' });
    expect(result.status).toBe(500);
  });
});
