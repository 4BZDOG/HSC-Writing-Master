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

const extractBearerToken = (header: string | undefined): string | null => {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
};

export const isAuthEnabled = (): boolean =>
  Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);

export const verifyRequestAuth = async (
  authorizationHeader: string | undefined
): Promise<AuthResult> => {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

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
