import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateContentWithRetry,
  humaniseRateLimitMessage,
  QuotaExceededError,
} from '../../services/aiCore';
import { subscribeAiNotices, _resetQuotaListeners } from '../../services/quotaNotifier';
import { isModelQuotaDead, resolveTarget, setSelectedModel } from '../../services/aiConfig';

const okJson = { candidates: [{ finishReason: 'STOP' }], text: '{}' };

const makeResponse = (body: unknown, ok = true, status = 200) =>
  ({
    ok,
    status,
    json: async () => body,
  }) as unknown as Response;

// The exact failure signature Gemini returns when a model has NO free-tier
// quota at all (as opposed to a temporarily exhausted one): limit is 0.
const ZERO_QUOTA_MESSAGE =
  'You exceeded your current quota, please check your plan and billing details.\n' +
  '* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_input_token_count, limit: 0, model: gemini-3.1-pro\n' +
  '* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0, model: gemini-3.1-pro\n' +
  'Please retry in 39.723135003s.';

const RATE_LIMIT_MESSAGE =
  'You exceeded your current quota, please check your plan and billing details.\n' +
  '* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 250, model: gemini-3-flash\n' +
  'Please retry in 12.5s.';

describe('free-tier zero-quota fallback', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    _resetQuotaListeners();
  });

  it('retries a zero-quota Gemini request on the free-tier Flash engine', async () => {
    fetchMock
      .mockResolvedValueOnce(
        makeResponse({ error: { message: ZERO_QUOTA_MESSAGE } }, false, 429)
      )
      .mockResolvedValueOnce(makeResponse(okJson));

    const notices: string[] = [];
    subscribeAiNotices((m) => notices.push(m));

    const result = await generateContentWithRetry({
      provider: 'gemini',
      model: 'gemini-3.1-pro-preview',
      contents: 'mark this',
    });

    expect(result).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(secondBody.model).toBe('gemini-3-flash-preview');
    expect(secondBody.provider).toBe('gemini');

    // The dead model is remembered for the session and the user was told once.
    expect(isModelQuotaDead('gemini-3.1-pro-preview')).toBe(true);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatch(/no quota/i);
    expect(notices[0]).toMatch(/Flash/);
  });

  it('reroutes subsequent resolveTarget calls away from the dead model', () => {
    // gemini-3.1-pro-preview was marked dead by the previous test (module
    // singleton — the same lifetime the reroute is designed for).
    setSelectedModel('reasoning', 'gemini-pro');
    const target = resolveTarget('reasoning');
    expect(target.model).toBe('gemini-3-flash-preview');
    // Selecting Flash for the role directly also resolves to Flash.
    setSelectedModel('reasoning', 'gemini-flash');
    expect(resolveTarget('reasoning').model).toBe('gemini-3-flash-preview');
  });

  it('does not notify again for an already-dead model', async () => {
    fetchMock
      .mockResolvedValueOnce(
        makeResponse({ error: { message: ZERO_QUOTA_MESSAGE } }, false, 429)
      )
      .mockResolvedValueOnce(makeResponse(okJson));

    const notices: string[] = [];
    subscribeAiNotices((m) => notices.push(m));

    await generateContentWithRetry({
      provider: 'gemini',
      model: 'gemini-3.1-pro-preview',
      contents: 'mark this again',
    });

    expect(notices).toHaveLength(0);
  });

  it('surfaces an ordinary rate limit (non-zero quota) without fallback', async () => {
    fetchMock.mockResolvedValue(
      makeResponse({ error: { message: RATE_LIMIT_MESSAGE } }, false, 429)
    );

    await expect(
      generateContentWithRetry({
        provider: 'gemini',
        model: 'gemini-3-flash-preview',
        contents: 'hello',
      })
    ).rejects.toThrow(QuotaExceededError);

    // No fallback attempt — a genuine rate limit is not a dead model.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(isModelQuotaDead('gemini-3-flash-preview')).toBe(false);
  });

  it('does not fall back for non-Gemini providers', async () => {
    fetchMock.mockResolvedValue(
      makeResponse({ error: { message: ZERO_QUOTA_MESSAGE } }, false, 429)
    );

    await expect(
      generateContentWithRetry({
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        contents: 'hello',
      })
    ).rejects.toThrow(QuotaExceededError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('humaniseRateLimitMessage', () => {
  it('unwraps a raw JSON 429 body into the inner message', () => {
    const raw = JSON.stringify({ error: { code: 429, message: RATE_LIMIT_MESSAGE } });
    const result = humaniseRateLimitMessage(raw);
    expect(result).not.toContain('{');
    expect(result).toContain('exceeded your current quota');
  });

  it('extracts a concrete retry hint when the provider gives one', () => {
    const result = humaniseRateLimitMessage(RATE_LIMIT_MESSAGE);
    expect(result).toContain('Try again in about 13 seconds.');
  });

  it('falls back to a generic wait hint without a retry delay', () => {
    const result = humaniseRateLimitMessage('Rate limit exceeded');
    expect(result).toContain('Please wait a moment and try again.');
  });

  it('keeps only the first line of multi-paragraph quota dumps', () => {
    const result = humaniseRateLimitMessage(ZERO_QUOTA_MESSAGE);
    expect(result).not.toContain('Quota exceeded for metric');
  });
});
