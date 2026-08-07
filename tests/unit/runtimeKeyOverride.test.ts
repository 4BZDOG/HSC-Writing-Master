import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

/**
 * A runtime key is not only a testing convenience: with one set, three
 * fallbacks in services/aiCore.ts (static hosting, a network failure reaching
 * the proxy, and a 404/405 from the proxy path) call the provider DIRECTLY
 * from the browser — skipping auth, the daily AI quota, the free-tier
 * evaluation meter and the feedback redaction alike.
 *
 * That is deliberate; it is what makes the app usable on a host with no
 * serverless functions. It is also why the entry point is admin-only: an admin
 * already resolves to the most permissive plan with unlimited evaluations, so
 * the bypass grants them nothing they did not already hold. Widen the gate and
 * the paywall becomes optional for anyone willing to paste a key of their own.
 */
describe('the runtime-key entry point stays admin-only', () => {
  const app = readFileSync(resolve(__dirname, '../../App.tsx'), 'utf8');

  /**
   * Source-scanning, so read it for what it is: it proves an
   * `isSystemAdmin(user.role)` guard sits close above each usage, not that the
   * JSX nests the way it looks. That is enough to catch the change worth
   * catching — someone moving the key modal out of the admin toolbar, or
   * relaxing the guard to `canModerate` — and it costs nothing to keep.
   */
  const guardedByAdmin = (needle: string, within: number): boolean => {
    const at = app.indexOf(needle);
    expect(at, `${needle} not found in App`).toBeGreaterThan(-1);
    const guard = app.lastIndexOf('isSystemAdmin(user.role)', at);
    return guard !== -1 && at - guard <= within;
  };

  it('gates the button that opens the key modal', () => {
    // The button sits with the other admin tools inside one shared guard.
    expect(guardedByAdmin('setIsRuntimeKeyOpen(true)', 2000)).toBe(true);
  });

  it('gates the modal itself, so the state cannot be reached another way', () => {
    expect(guardedByAdmin('<RuntimeKeyModal', 200)).toBe(true);
  });
});
