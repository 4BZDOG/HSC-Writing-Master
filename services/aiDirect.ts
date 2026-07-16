/**
 * Direct-from-browser provider calls — the static-hosting testing fallback.
 *
 * Normally every AI call goes through the server-side proxy (`/api/gemini`) so
 * provider keys stay off the client. On a static deployment (e.g. GitHub Pages
 * before an API host is connected) there is no proxy: when an admin has pasted
 * runtime keys (services/runtimeKeys.ts), aiCore falls back to this module,
 * which runs the proxy's own provider adapters (api/_lib) in the browser using
 * the pasted key.
 *
 * ⚠️ Testing affordance only. Direct calls bypass the proxy's sign-in and
 * daily-quota gates (there is no server to enforce them) and put the key in
 * browser memory. Connect an API host for real use — see DEPLOYMENT.md.
 */

import type { GenerateContentResponse } from '@google/genai';
import { runAiProxy } from '../api/_lib/providers';

/** The adapters report an absent key in server terms; translate for the browser. */
const MISSING_KEY_PATTERN = /Server is missing (\w+)_API_KEY configuration\./;

const PROVIDER_LABELS: Record<string, string> = {
  GEMINI: 'Gemini',
  ANTHROPIC: 'Anthropic (Claude)',
  OPENROUTER: 'OpenRouter',
  GROQ: 'Groq',
  KIMI: 'Kimi (Moonshot AI)',
};

/**
 * Runs one Gemini-shaped request against its provider straight from the
 * browser. The request's own `__keyOverride` (attached by aiCore, applied and
 * stripped inside runAiProxy) is the only key source — no env keys exist here.
 * Errors carry `.status` so aiCore's ApiGuard/retry logic classifies them
 * exactly as it does for proxied calls.
 */
export const callProviderDirect = async (request: unknown): Promise<GenerateContentResponse> => {
  const result = await runAiProxy(request, {});

  if (result.status === 200) {
    return result.body as GenerateContentResponse;
  }

  const rawDetail = (result.body as { error?: unknown } | null)?.error;
  const detail = typeof rawDetail === 'string' ? rawDetail : '';

  const missingKey = detail.match(MISSING_KEY_PATTERN);
  if (missingKey) {
    const label = PROVIDER_LABELS[missingKey[1]] || missingKey[1];
    const err: Error & { status?: number } = new Error(
      `No ${label} key available for direct browser calls — paste one in the ` +
        'Runtime AI Keys panel (or switch the AI Engine to a provider whose key is set).'
    );
    err.status = 400; // client configuration problem — fatal, never retried
    throw err;
  }

  const err: Error & { status?: number } = new Error(
    detail || `AI provider error (${result.status}).`
  );
  err.status = result.status;
  throw err;
};
