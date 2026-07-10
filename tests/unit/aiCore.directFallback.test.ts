import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateContentWithRetry } from '../../services/aiCore';
import { setRuntimeKeys, clearRuntimeKeys } from '../../services/runtimeKeys';

// Static hosts (GitHub Pages) answer the proxy path with an HTML error page.
const staticHost405 = () =>
  ({
    ok: false,
    status: 405,
    json: async () => {
      throw new SyntaxError('Unexpected token < in JSON');
    },
  }) as unknown as Response;

const groqOk = (content: string) =>
  ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 5, completion_tokens: 7 },
    }),
  }) as unknown as Response;

describe('generateContentWithRetry — direct-from-browser fallback (runtime keys, no proxy)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    clearRuntimeKeys();
    vi.unstubAllGlobals();
  });

  it('calls the provider directly with the runtime key when the proxy is missing', async () => {
    setRuntimeKeys({ groq: 'gsk_test123' });
    fetchMock.mockImplementation(async (url: unknown) => {
      const target = String(url);
      if (target.includes('/api/gemini')) return staticHost405();
      if (target.includes('api.groq.com')) return groqOk('direct answer');
      throw new Error(`Unexpected fetch target: ${target}`);
    });

    const response = await generateContentWithRetry({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      contents: { parts: [{ text: 'hello' }] },
    });

    expect(response.text).toBe('direct answer');
    expect(response.usageMetadata?.totalTokenCount).toBe(12);

    // Proxy attempt first, then exactly one direct provider call.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [directUrl, directInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(directUrl).toContain('api.groq.com');
    expect((directInit.headers as Record<string, string>).authorization).toBe(
      'Bearer gsk_test123'
    );
    // The routing/override fields must never reach the provider.
    const sentBody = JSON.parse(String(directInit.body));
    expect(sentBody.provider).toBeUndefined();
    expect(sentBody.__keyOverride).toBeUndefined();
  });

  it('explains a missing key for the selected provider without retrying', async () => {
    // Groq key pasted, but the engine points at Anthropic — the adapter must
    // report the gap in browser terms, not "Server is missing …".
    setRuntimeKeys({ groq: 'gsk_test123' });
    fetchMock.mockImplementation(async (url: unknown) => {
      const target = String(url);
      if (target.includes('/api/gemini')) return staticHost405();
      throw new Error(`Unexpected fetch target: ${target}`);
    });

    await expect(
      generateContentWithRetry({
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        contents: { parts: [{ text: 'hello' }] },
      })
    ).rejects.toThrow(/Runtime AI Keys panel/);

    // Only the proxy probe — the adapter fails before any provider call.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still raises ProxyUnavailableError when no runtime keys are set', async () => {
    fetchMock.mockResolvedValue(staticHost405());

    await expect(
      generateContentWithRetry({
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
        contents: { parts: [{ text: 'no keys' }] },
      })
    ).rejects.toMatchObject({ name: 'ProxyUnavailableError', status: 405 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
