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

export interface ProviderKeys {
  gemini?: string;
  anthropic?: string;
}

export const runAiProxy = async (request: unknown, keys: ProviderKeys): Promise<ProxyResult> => {
  if (!request || typeof request !== 'object') {
    return { status: 400, body: { error: 'Invalid request body.' } };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { provider, ...rest } = request as any;

  if (provider === 'anthropic') {
    return runAnthropicProxy(keys.anthropic, rest);
  }
  // Default + explicit 'gemini'
  return runGeminiProxy(keys.gemini, rest);
};
