import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateContentWithRetry, _resetOverloadNotices } from '../../services/aiCore';
import { subscribeAiNotices, _resetQuotaListeners } from '../../services/quotaNotifier';

const okJson = { candidates: [{ finishReason: 'STOP' }], text: '{}' };

const makeResponse = (body: unknown, ok = true, status = 200) =>
  ({
    ok,
    status,
    json: async () => body,
  }) as unknown as Response;

// Gemini's real "high demand" 503 signature, as the proxy relays it.
const OVERLOAD_MESSAGE =
  'This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.';

/**
 * A model that is genuinely overloaded on the provider's side (503) is not a
 * dead model the way zero-quota is — it will likely work again — so once
 * retries for THIS call are exhausted, the request should reroute to a
 * sibling Gemini model rather than fail outright. See aiConfig.getOverloadFallback.
 */
describe('Gemini overload (503) fallback', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    _resetQuotaListeners();
    // The overload-notice Set is module-level and persists across cases; without
    // this a rerouted model in one test suppresses the notice in the next.
    _resetOverloadNotices();
  });

  it('reroutes to a sibling model once retries on the overloaded model are exhausted', async () => {
    // Initial attempt + 3 retries (MAX_RETRIES) all see the 503, then the
    // fallback call succeeds.
    fetchMock
      .mockResolvedValueOnce(makeResponse({ error: { message: OVERLOAD_MESSAGE } }, false, 503))
      .mockResolvedValueOnce(makeResponse({ error: { message: OVERLOAD_MESSAGE } }, false, 503))
      .mockResolvedValueOnce(makeResponse({ error: { message: OVERLOAD_MESSAGE } }, false, 503))
      .mockResolvedValueOnce(makeResponse({ error: { message: OVERLOAD_MESSAGE } }, false, 503))
      .mockResolvedValueOnce(makeResponse(okJson));

    const notices: string[] = [];
    subscribeAiNotices((m) => notices.push(m));

    const promise = generateContentWithRetry({
      provider: 'gemini',
      model: 'gemini-3-flash-preview',
      contents: 'mark this',
    });

    // Flush the three exponential-backoff delays (capped at 20s each).
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(21000);
    }

    const result = await promise;

    expect(result).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(5);
    const fallbackBody = JSON.parse(fetchMock.mock.calls[4][1].body as string);
    expect(fallbackBody.model).toBe('gemini-3.7-flash');
    expect(fallbackBody.provider).toBe('gemini');

    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatch(/high demand/i);
  }, 15000);

  it('notifies only once per overloaded model across separate calls', async () => {
    // Two independent calls both exhaust retries on the same model and reroute.
    // The high-demand notice must fire on the first and stay silent on the
    // second — the once-per-session guard lives in a module-level Set.
    const overloadThenOk = () =>
      fetchMock
        .mockResolvedValueOnce(makeResponse({ error: { message: OVERLOAD_MESSAGE } }, false, 503))
        .mockResolvedValueOnce(makeResponse({ error: { message: OVERLOAD_MESSAGE } }, false, 503))
        .mockResolvedValueOnce(makeResponse({ error: { message: OVERLOAD_MESSAGE } }, false, 503))
        .mockResolvedValueOnce(makeResponse({ error: { message: OVERLOAD_MESSAGE } }, false, 503))
        .mockResolvedValueOnce(makeResponse(okJson));

    const notices: string[] = [];
    subscribeAiNotices((m) => notices.push(m));

    for (let call = 0; call < 2; call++) {
      overloadThenOk();
      const promise = generateContentWithRetry({
        provider: 'gemini',
        model: 'gemini-3-flash-preview',
        contents: 'mark this',
      });
      for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(21000);
      }
      await promise;
    }

    expect(notices).toHaveLength(1);
  }, 15000);

  it('does not reroute non-Gemini providers', async () => {
    fetchMock.mockResolvedValue(makeResponse({ error: { message: OVERLOAD_MESSAGE } }, false, 503));

    const promise = generateContentWithRetry({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      contents: 'hello',
    });
    const assertion = expect(promise).rejects.toThrow(/high demand|unavailable/i);

    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(21000);
    }

    await assertion;
    // Initial + 3 retries, no fallback call.
    expect(fetchMock).toHaveBeenCalledTimes(4);
  }, 15000);
});
