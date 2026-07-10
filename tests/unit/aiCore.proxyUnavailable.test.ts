import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateContentWithRetry, ProxyUnavailableError } from '../../services/aiCore';

// A static host (GitHub Pages, nginx) answering the proxy path returns an
// HTML/plain error page, so `res.json()` throws — that absence of a
// proxy-shaped JSON body is what distinguishes "no proxy deployed" from a
// real error the proxy (or a provider behind it) produced.
const makeStaticHostResponse = (status: number) =>
  ({
    ok: false,
    status,
    json: async () => {
      throw new SyntaxError('Unexpected token < in JSON');
    },
  }) as unknown as Response;

const makeJsonResponse = (body: unknown, status: number, ok = false) =>
  ({
    ok,
    status,
    json: async () => body,
  }) as unknown as Response;

describe('generateContentWithRetry — missing proxy endpoint (static hosting)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('surfaces an actionable ProxyUnavailableError on a bodyless 405 without retrying', async () => {
    fetchMock.mockResolvedValue(makeStaticHostResponse(405));

    await expect(
      generateContentWithRetry({ model: 'gemini', contents: 'p405' })
    ).rejects.toMatchObject({
      name: 'ProxyUnavailableError',
      status: 405,
      message: expect.stringMatching(/GitHub Pages|API_BASE_URL/),
    });

    // Deployment-level condition — must fail fast, not burn the retry budget.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces ProxyUnavailableError on a bodyless 404 (wrong or absent API host)', async () => {
    fetchMock.mockResolvedValue(makeStaticHostResponse(404));

    await expect(generateContentWithRetry({ model: 'gemini', contents: 'p404' })).rejects.toThrow(
      ProxyUnavailableError
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the proxy’s own JSON error message when one is present', async () => {
    fetchMock.mockResolvedValue(
      makeJsonResponse({ error: 'Method not allowed. Use POST.' }, 405)
    );

    await expect(generateContentWithRetry({ model: 'gemini', contents: 'p405j' })).rejects.toThrow(
      'Method not allowed. Use POST.'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('unwraps a nested provider error body instead of stringifying the object', async () => {
    // Providers passed through the proxy shape errors as { error: { message } }.
    fetchMock.mockResolvedValue(
      makeJsonResponse({ error: { message: 'model not found', status: 'NOT_FOUND' } }, 404)
    );

    // 404 with a real provider message still maps to the model-unavailable
    // path in callGeminiWithRetry — not the missing-endpoint diagnosis.
    await expect(generateContentWithRetry({ model: 'gemini', contents: 'p404j' })).rejects.toThrow(
      /model is currently unavailable/
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
