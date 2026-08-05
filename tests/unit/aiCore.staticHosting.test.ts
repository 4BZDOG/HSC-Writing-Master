import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Whether the client believes a serverless AI proxy exists.
 *
 * This was inferred — `!import.meta.env.DEV && !API_BASE_URL`, i.e. "a production
 * build with no API host must be a static host" — and the inference was wrong for
 * the deployment that matters most. On Vercel the proxy is same-origin, so
 * `VITE_API_BASE_URL` is correctly left unset, and the client concluded "static
 * host". Every AI call short-circuited to `ProxyUnavailableError` without ever
 * trying `/api/gemini`, which was deployed and working. Marking, question
 * generation and sample answers were all dead, on the primary deployment, with a
 * message blaming GitHub Pages.
 *
 * `VITE_API_BASE_URL` means "the proxy is on ANOTHER origin". It never meant "a
 * proxy exists". These tests pin the polarity in both directions, because getting
 * it backwards is silent: nothing fails to build, and the app renders fine.
 */

/** A static host answering the proxy path with its own HTML error page. */
const staticHostResponse = (status: number) =>
  ({
    ok: false,
    status,
    json: async () => {
      throw new SyntaxError('Unexpected token < in JSON');
    },
  }) as unknown as Response;

describe('proxy detection is declared, not inferred', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('assumes a proxy when nothing is declared — the Vercel default', async () => {
    // Neither flag set: exactly what a Vercel build produces.
    //
    // DEV must be stubbed false or this test cannot see the bug at all. Vitest
    // runs with DEV === true, under which the old inference
    // (`!DEV && !API_BASE_URL`) is false — so it behaved correctly in tests and
    // wrongly in production, which is precisely why it shipped.
    vi.stubEnv('DEV', false as never);
    vi.stubEnv('MODE', 'production');
    vi.stubEnv('VITE_STATIC_HOSTING', '');
    vi.stubEnv('VITE_API_BASE_URL', '');
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        text: 'ok',
        candidates: [{ content: { parts: [{ text: 'ok' }] } }],
      }),
    } as unknown as Response);

    const { generateContentWithRetry, isProxyConfigured } = await import('../../services/aiCore');

    expect(isProxyConfigured()).toBe(true);
    await generateContentWithRetry({ model: 'gemini', contents: 'hello' });

    // The regression was that this never happened.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/gemini');
  });

  it('skips the doomed request only when the build declares static hosting', async () => {
    vi.stubEnv('VITE_STATIC_HOSTING', 'true');
    vi.stubEnv('VITE_API_BASE_URL', '');

    const { generateContentWithRetry, isProxyConfigured } = await import('../../services/aiCore');

    expect(isProxyConfigured()).toBe(false);
    await expect(generateContentWithRetry({ model: 'gemini', contents: 'hello' })).rejects.toThrow(
      /not connected on this deployment/i
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still surfaces the same error if a non-static build meets a 404', async () => {
    // The flag is an optimisation, not a correctness requirement: a build that
    // wrongly claims a proxy must degrade to the identical outcome, so no
    // deployment can be silently broken by getting the flag wrong.
    vi.stubEnv('VITE_STATIC_HOSTING', '');
    fetchMock.mockResolvedValue(staticHostResponse(404));

    const { generateContentWithRetry } = await import('../../services/aiCore');

    await expect(generateContentWithRetry({ model: 'gemini', contents: 'hello' })).rejects.toThrow(
      /not connected on this deployment/i
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('the Pages workflow declares what the client now expects', () => {
  const workflow = readFileSync(
    resolve(__dirname, '../../.github/workflows/deploy-pages.yml'),
    'utf8'
  );

  it('sets VITE_STATIC_HOSTING on the Pages build', () => {
    // If the client reads a flag no build sets, Pages regresses to paying a
    // round-trip for every AI call before failing.
    expect(workflow).toMatch(/VITE_STATIC_HOSTING:/);
  });

  it('ties the flag to whether an API proxy origin is configured', () => {
    // Pages WITH a proxy origin is not static hosting — it should call through
    // to that origin rather than refusing locally.
    expect(workflow).toMatch(/VITE_STATIC_HOSTING:.*API_BASE_URL/);
  });
});
