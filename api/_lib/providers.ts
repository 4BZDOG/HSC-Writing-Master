/**
 * Provider router for the AI proxy. The client stamps each request with a
 * `provider` field (see services/aiConfig.ts); this dispatches to the matching
 * provider adapter, picking the right server-side key. The `provider` field is
 * stripped before the request reaches a provider SDK, which would reject the
 * unknown property.
 *
 * Defaults to Gemini when no provider is given, so existing requests and the
 * direct `runGeminiProxy` callers/tests keep working unchanged.
 */

import { runGeminiProxy, type ProxyResult } from './generate';
import { runAnthropicProxy } from './anthropic';
import { runOpenRouterProxy } from './openrouter';
import { runGroqProxy } from './groq';
import { runKimiProxy } from './kimi';

export interface ProviderKeys {
  gemini?: string;
  anthropic?: string;
  openrouter?: string;
  groq?: string;
  kimi?: string;
}

export const runAiProxy = async (request: unknown, keys: ProviderKeys): Promise<ProxyResult> => {
  if (!request || typeof request !== 'object') {
    return { status: 400, body: { error: 'Invalid request body.' } };
  }

  // `__keyOverride` is an optional per-request key supplied by an admin's
  // runtime-key modal (services/runtimeKeys.ts). When present it wins over the
  // server env key for THIS call only; it is stripped here so it never reaches
  // a provider SDK. It cannot expose the server key — the client can only pass
  // a key it already holds — and the auth/quota gates upstream still apply.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { provider, __keyOverride, ...rest } = request as any;
  const effective: ProviderKeys = {
    gemini: __keyOverride?.gemini || keys.gemini,
    anthropic: __keyOverride?.anthropic || keys.anthropic,
    openrouter: __keyOverride?.openrouter || keys.openrouter,
    groq: __keyOverride?.groq || keys.groq,
    kimi: __keyOverride?.kimi || keys.kimi,
  };

  if (provider === 'anthropic') {
    return runAnthropicProxy(effective.anthropic, rest);
  }
  if (provider === 'openrouter') {
    return runOpenRouterProxy(effective.openrouter, rest);
  }
  if (provider === 'groq') {
    return runGroqProxy(effective.groq, rest);
  }
  if (provider === 'kimi') {
    return runKimiProxy(effective.kimi, rest);
  }
  // Default + explicit 'gemini'
  return runGeminiProxy(effective.gemini, rest);
};
