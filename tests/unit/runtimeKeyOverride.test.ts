import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the provider adapters so runAiProxy can be exercised without SDKs.
const { geminiMock, anthropicMock, openRouterMock } = vi.hoisted(() => ({
  geminiMock: vi.fn(),
  anthropicMock: vi.fn(),
  openRouterMock: vi.fn(),
}));

vi.mock('../../api/_lib/generate', () => ({ runGeminiProxy: geminiMock }));
vi.mock('../../api/_lib/anthropic', () => ({ runAnthropicProxy: anthropicMock }));
vi.mock('../../api/_lib/openrouter', () => ({ runOpenRouterProxy: openRouterMock }));

import { runAiProxy } from '../../api/_lib/providers';

beforeEach(() => {
  geminiMock.mockReset().mockResolvedValue({ status: 200, body: { text: 'ok' } });
  anthropicMock.mockReset().mockResolvedValue({ status: 200, body: { text: 'ok' } });
  openRouterMock.mockReset().mockResolvedValue({ status: 200, body: { text: 'ok' } });
});

describe('runAiProxy — runtime key override', () => {
  it('uses the server env key when no override is supplied', async () => {
    await runAiProxy({ provider: 'gemini', contents: 'x' }, { gemini: 'ENV_KEY' });
    expect(geminiMock).toHaveBeenCalledWith('ENV_KEY', { contents: 'x' });
  });

  it('prefers the request __keyOverride over the env key', async () => {
    await runAiProxy(
      { provider: 'gemini', contents: 'x', __keyOverride: { gemini: 'RUNTIME_KEY' } },
      { gemini: 'ENV_KEY' }
    );
    expect(geminiMock).toHaveBeenCalledWith('RUNTIME_KEY', { contents: 'x' });
  });

  it('strips __keyOverride so it never reaches the provider SDK', async () => {
    await runAiProxy(
      { provider: 'gemini', contents: 'x', __keyOverride: { gemini: 'RUNTIME_KEY' } },
      { gemini: 'ENV_KEY' }
    );
    const [, forwarded] = geminiMock.mock.calls[0];
    expect(forwarded).not.toHaveProperty('__keyOverride');
    expect(forwarded).not.toHaveProperty('provider');
  });

  it('routes the anthropic override to the Claude adapter', async () => {
    await runAiProxy(
      { provider: 'anthropic', contents: 'x', __keyOverride: { anthropic: 'RT_CLAUDE' } },
      { anthropic: 'ENV_CLAUDE' }
    );
    expect(anthropicMock).toHaveBeenCalledWith('RT_CLAUDE', { contents: 'x' });
    expect(geminiMock).not.toHaveBeenCalled();
  });

  it('falls back to the env key for a provider the override omits', async () => {
    // Override only carries a gemini key; an anthropic request still uses env.
    await runAiProxy(
      { provider: 'anthropic', contents: 'x', __keyOverride: { gemini: 'RT_GEMINI' } },
      { anthropic: 'ENV_CLAUDE' }
    );
    expect(anthropicMock).toHaveBeenCalledWith('ENV_CLAUDE', { contents: 'x' });
  });

  it('routes an openrouter request to the OpenRouter adapter with its key', async () => {
    await runAiProxy(
      { provider: 'openrouter', model: 'z-ai/glm-4.6', contents: 'x' },
      { openrouter: 'ENV_OR' }
    );
    expect(openRouterMock).toHaveBeenCalledWith('ENV_OR', { model: 'z-ai/glm-4.6', contents: 'x' });
    expect(geminiMock).not.toHaveBeenCalled();
  });

  it('prefers the openrouter override and strips it before the adapter', async () => {
    await runAiProxy(
      {
        provider: 'openrouter',
        model: 'z-ai/glm-4.6',
        contents: 'x',
        __keyOverride: { openrouter: 'RT_OR' },
      },
      { openrouter: 'ENV_OR' }
    );
    const [key, forwarded] = openRouterMock.mock.calls[0];
    expect(key).toBe('RT_OR');
    expect(forwarded).not.toHaveProperty('__keyOverride');
    expect(forwarded).not.toHaveProperty('provider');
  });
});

describe('runAiProxy — internal request tags', () => {
  it('strips __feature so the provider SDK never sees it', async () => {
    // api/gemini.ts reads __feature to meter evaluations against the free-tier
    // allowance; it is ours, not the provider's, and Gemini rejects unknown
    // top-level fields.
    await runAiProxy(
      { provider: 'gemini', contents: 'x', __feature: 'evaluation' },
      { gemini: 'ENV_KEY' }
    );
    expect(geminiMock).toHaveBeenCalledWith('ENV_KEY', { contents: 'x' });
  });
});
