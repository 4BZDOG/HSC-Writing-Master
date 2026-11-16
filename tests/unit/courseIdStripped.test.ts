import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `__courseId` is ours, like `__feature`: the course gate reads it on the proxy, and it must
 * never reach a provider SDK, which would reject the unknown property.
 */

const runGeminiProxyMock = vi.fn();

vi.mock('../../api/_lib/generate', () => ({
  runGeminiProxy: (...args: unknown[]) => runGeminiProxyMock(...args),
}));

import { runAiProxy } from '../../api/_lib/providers';

beforeEach(() => {
  runGeminiProxyMock.mockReset();
  runGeminiProxyMock.mockResolvedValue({ status: 200, body: { text: 'ok' } });
});

describe('providers: __courseId is stripped before the provider', () => {
  it('removes __courseId and __feature, and forwards the rest unchanged', async () => {
    await runAiProxy(
      {
        provider: 'gemini',
        model: 'gemini-3-flash-preview',
        __feature: 'evaluation',
        __courseId: 'course-hsc-chemistry',
        contents: 'hello',
      },
      { gemini: 'key' }
    );

    expect(runGeminiProxyMock).toHaveBeenCalledTimes(1);
    const forwarded = runGeminiProxyMock.mock.calls[0][1];
    expect(forwarded).not.toHaveProperty('__courseId');
    expect(forwarded).not.toHaveProperty('__feature');
    expect(forwarded).not.toHaveProperty('provider');
    expect(forwarded).toMatchObject({ model: 'gemini-3-flash-preview', contents: 'hello' });
  });
});
