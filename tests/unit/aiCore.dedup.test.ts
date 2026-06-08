import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Gemini SDK so we can observe how many times the underlying
// network call is actually made.
const generateContentMock = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: generateContentMock };
  },
  GenerateContentResponse: class {},
}));

import { generateContentWithRetry } from '../../services/aiCore';

const okResponse = { candidates: [{ finishReason: 'STOP' }], text: '{}' };

describe('generateContentWithRetry — request de-duplication', () => {
  beforeEach(() => {
    process.env.API_KEY = 'test-key';
    generateContentMock.mockReset();
  });

  it('collapses concurrent identical requests into a single API call', async () => {
    let resolveCall: (value: unknown) => void = () => {};
    generateContentMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCall = resolve;
        })
    );

    const request = { model: 'gemini', contents: 'hello' };
    const p1 = generateContentWithRetry(request);
    const p2 = generateContentWithRetry(request);

    // Flush microtasks so both calls register as in-flight before resolving.
    await Promise.resolve();
    resolveCall(okResponse);

    const [r1, r2] = await Promise.all([p1, p2]);

    expect(generateContentMock).toHaveBeenCalledTimes(1);
    expect(r1).toBe(r2);
  });

  it('does not de-duplicate distinct requests', async () => {
    generateContentMock.mockResolvedValue(okResponse);

    await Promise.all([
      generateContentWithRetry({ model: 'gemini', contents: 'a' }),
      generateContentWithRetry({ model: 'gemini', contents: 'b' }),
    ]);

    expect(generateContentMock).toHaveBeenCalledTimes(2);
  });

  it('clears the in-flight entry so a later identical request still calls the API', async () => {
    generateContentMock.mockResolvedValue(okResponse);

    const request = { model: 'gemini', contents: 'again' };
    await generateContentWithRetry(request);
    await generateContentWithRetry(request);

    // Sequential (not concurrent) calls are real calls, not de-duplicated.
    expect(generateContentMock).toHaveBeenCalledTimes(2);
  });
});
