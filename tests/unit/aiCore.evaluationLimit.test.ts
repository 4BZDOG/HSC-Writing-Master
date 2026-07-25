import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateContentWithRetry, EvaluationLimitError, apiGuard } from '../../services/aiCore';

/**
 * The proxy answers 402 when the free tier's daily evaluations are spent
 * (api/gemini.ts, schema §14). That is a paywall, not a fault: it must fail
 * fast — no retries, no circuit-breaker error count — so the UI can open the
 * upgrade prompt straight away.
 */
const make402 = (used: number, limit: number) =>
  ({
    ok: false,
    status: 402,
    json: async () => ({
      error: `You've used all ${limit} free evaluations for today. Upgrade to Plus for unlimited marking.`,
      upgradeRequired: true,
      evaluations: { allowed: false, used, limit, unlimited: false },
    }),
  }) as unknown as Response;

describe('generateContentWithRetry — free-tier evaluation limit', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    apiGuard.reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    apiGuard.reset();
  });

  it('throws EvaluationLimitError carrying the spent allowance', async () => {
    fetchMock.mockResolvedValue(make402(5, 5));

    const error = await generateContentWithRetry({
      model: 'gemini',
      contents: 'answer',
      __feature: 'evaluation',
    }).catch((e) => e);

    expect(error).toBeInstanceOf(EvaluationLimitError);
    expect(error.used).toBe(5);
    expect(error.limit).toBe(5);
    expect(error.message).toMatch(/free evaluations/i);
  });

  it('does not retry — the answer is "upgrade", not "try again"', async () => {
    fetchMock.mockResolvedValue(make402(5, 5));

    await generateContentWithRetry({
      model: 'gemini',
      contents: 'no-retry',
      __feature: 'evaluation',
    }).catch(() => undefined);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not count against the circuit breaker (the service is healthy)', async () => {
    fetchMock.mockResolvedValue(make402(5, 5));

    for (let i = 0; i < 3; i++) {
      await generateContentWithRetry({
        model: 'gemini',
        contents: `breaker-${i}`,
        __feature: 'evaluation',
      }).catch(() => undefined);
    }

    expect(apiGuard.isBlocked()).toBe(false);
    expect(apiGuard.getStatus().errorCount).toBe(0);
  });
});
