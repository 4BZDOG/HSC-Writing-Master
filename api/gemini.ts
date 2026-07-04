import { runAiProxy } from './_lib/providers';
import { verifyRequestAuth, extractBearerToken } from './_lib/auth';
import { consumeAiQuota } from './_lib/quota';

/**
 * Vercel serverless function: POST /api/gemini
 *
 * Proxies AI generateContent calls so provider keys stay server-side. The
 * client (services/aiCore.ts) posts the full request object here — tagged with
 * a `provider` — and this function routes to the matching provider, injecting
 * the key from the environment and returning the response. The path is named
 * `/api/gemini` for backwards compatibility but serves every provider.
 *
 * Configure `GEMINI_API_KEY` (Gemini) and optionally `ANTHROPIC_API_KEY`
 * (Claude) in the Vercel project's Environment Variables. (`API_KEY` is
 * accepted as a Gemini fallback for the AI Studio convention.)
 *
 * Access control: when the server has Supabase configured (`SUPABASE_URL` +
 * `SUPABASE_ANON_KEY`), the caller must present a valid Supabase bearer token
 * or the request is rejected 401 — this stops anonymous callers from spending
 * the provider budget. See api/_lib/auth.ts for the graceful-degradation rule.
 */

// Minimal structural types so we don't need the @vercel/node dependency.
interface RequestLike {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
}
interface ResponseLike {
  status: (code: number) => ResponseLike;
  json: (data: unknown) => void;
}

const headerValue = (raw: string | string[] | undefined): string | undefined =>
  Array.isArray(raw) ? raw[0] : raw;

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  const authHeader = headerValue(req.headers?.authorization);
  const auth = await verifyRequestAuth(authHeader);
  if (!auth.ok) {
    res.status(auth.status ?? 401).json({ error: auth.error ?? 'Unauthorized.' });
    return;
  }

  // Quota gate: one unit of the caller's daily budget per proxied call
  // (per-user override → role/group default; see supabase/schema.sql §11).
  // Only meaningful for authenticated callers — when auth is disabled
  // (no Supabase) there is no identity to meter, matching the auth gate.
  if (auth.userId) {
    const token = extractBearerToken(authHeader);
    const quota = token ? await consumeAiQuota(token) : null;
    if (quota && !quota.allowed) {
      res.status(429).json({
        error: `Daily AI limit reached (${quota.used}/${quota.limit} calls used today). Your allowance resets at midnight UTC — ask an admin if you need more.`,
        quota,
      });
      return;
    }
  }

  const keys = {
    gemini: process.env.GEMINI_API_KEY || process.env.API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
  };
  const result = await runAiProxy(req.body, keys);
  res.status(result.status).json(result.body);
}
