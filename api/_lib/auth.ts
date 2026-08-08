/**
 * Server-side authentication gate for the AI proxy.
 *
 * Why this exists: the AI proxy injects a paid provider key and forwards the
 * request. Without an auth check, anyone on the internet can POST to it and
 * spend the project's Gemini/Anthropic budget. This verifies the caller holds
 * a valid Supabase session before the request is allowed through.
 *
 * Graceful degradation: if the server has no Supabase configured
 * (`SUPABASE_URL` / `SUPABASE_ANON_KEY` unset), auth is DISABLED and requests
 * pass — this preserves the "works fully without Supabase" mock-mode contract
 * used for local dev and the current keyless deployments. Enforcement turns on
 * automatically once an operator sets those two server-side env vars.
 *
 * That degradation has one exception, `isMisconfigured()` below: a production
 * deployment with the CLIENT-side Supabase variables but not the server-side
 * ones is not in mock mode, it is misconfigured, and passing its requests
 * through would leave the proxy open. It fails closed instead.
 *
 * Note: these are the NON-`VITE_` variables. The `VITE_SUPABASE_*` pair is
 * bundled to the client; this code is server-only and reads the unprefixed
 * names so the values never have to be client-exposed. The anon key is used
 * (not the service-role key) purely to call the Auth API for token
 * verification — `getUser(token)` validates the JWT's signature, expiry, and
 * revocation server-side.
 */
import { createClient } from '@supabase/supabase-js';

export interface AuthResult {
  ok: boolean;
  status?: number;
  error?: string;
  userId?: string;
}

export const extractBearerToken = (header: string | undefined): string | null => {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
};

export const isAuthEnabled = (): boolean =>
  Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);

/**
 * Is this deployment HALF configured — client-side Supabase set up, server-side
 * not?
 *
 * The degradation above is right for a deployment with no Supabase at all: mock
 * mode, no accounts, nothing to verify a token against. It is badly wrong for a
 * deployment that plainly HAS Supabase and simply missed the second pair of
 * variables. That state is easy to reach — the setup table lists the `VITE_`
 * pair first and explains the unprefixed pair in a note underneath — and it
 * fails open: real accounts and real quotas in the UI, and an AI proxy that
 * serves the whole internet, spending the provider budget with no per-user
 * limit and no attribution.
 *
 * The `VITE_` pair is readable here because a hosting platform puts every
 * project variable in the function's environment; the prefix only tells Vite
 * what to bundle. So the asymmetry is detectable, and it is always a mistake
 * rather than a configuration anyone chooses.
 *
 * Production only. Locally the same asymmetry is harmless (nothing is exposed)
 * and refusing would break `npm run dev` for anyone signing in through Supabase
 * without server vars set.
 */
export const isMisconfigured = (): boolean =>
  process.env.NODE_ENV === 'production' &&
  !isAuthEnabled() &&
  Boolean(process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY);

export const verifyRequestAuth = async (
  authorizationHeader: string | undefined
): Promise<AuthResult> => {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  // Half-configured: fail CLOSED, and say exactly what is missing. Serving
  // openly here would hand the provider budget to anyone with the URL.
  if (isMisconfigured()) {
    return {
      ok: false,
      status: 503,
      error:
        'AI proxy misconfigured: this deployment has client-side Supabase (VITE_SUPABASE_URL / ' +
        'VITE_SUPABASE_ANON_KEY) but not the server-side pair. Set SUPABASE_URL and ' +
        'SUPABASE_ANON_KEY to the same values in the hosting project so sessions can be verified.',
    };
  }

  // Supabase not configured on the server → auth disabled (mock-mode parity).
  if (!url || !anonKey) {
    return { ok: true };
  }

  const token = extractBearerToken(authorizationHeader);
  if (!token) {
    return { ok: false, status: 401, error: 'Authentication required.' };
  }

  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    return { ok: false, status: 401, error: 'Invalid or expired session.' };
  }

  return { ok: true, userId: data.user.id };
};
