/**
 * Server-side AI usage quotas (per user, with per-role/group defaults).
 *
 * Why this exists: the auth gate (auth.ts) stops ANONYMOUS spending, but any
 * signed-in student could still hammer the proxy and burn the provider
 * budget. consume_ai_quota() (supabase/schema.sql §11) atomically spends one
 * unit of the caller's daily allowance — per-user override → role default →
 * built-in 50 — and this module surfaces the verdict to the handler.
 *
 * Fail-open by design: if the RPC is missing (schema §11 not applied yet) or
 * Supabase is unreachable, the request is ALLOWED and a warning is logged.
 * Otherwise deploying the proxy ahead of the migration would brick every AI
 * feature; the auth gate still protects against anonymous abuse in that
 * window. Like the auth gate, quotas are disabled entirely when the server
 * has no Supabase configured (mock-mode parity).
 */
import { createClient } from '@supabase/supabase-js';

export interface QuotaVerdict {
  allowed: boolean;
  used: number;
  limit: number;
}

export const isQuotaEnabled = (): boolean =>
  Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);

/**
 * Spend one unit of the caller's daily budget. Returns null when quotas are
 * not enforceable (Supabase unconfigured, RPC missing, transient failure) —
 * the caller should treat null as "allowed".
 */
export const consumeAiQuota = async (accessToken: string): Promise<QuotaVerdict | null> => {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  try {
    // The user's own JWT scopes the RPC: consume_ai_quota() reads auth.uid(),
    // so a caller can only ever spend their own allowance.
    const client = createClient(url, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data, error } = await client.rpc('consume_ai_quota');
    if (error || !data || typeof (data as QuotaVerdict).allowed !== 'boolean') {
      console.warn(
        '[quota] consume_ai_quota unavailable — allowing request (fail-open):',
        error?.message ?? 'malformed response'
      );
      return null;
    }
    return data as QuotaVerdict;
  } catch (e) {
    console.warn('[quota] unexpected failure — allowing request (fail-open):', e);
    return null;
  }
};

/**
 * Best-effort per-model usage tally for the admin dashboard's cost breakdown.
 * REPORTING ONLY: this is completely separate from the budget above — the
 * model a call uses doesn't change the allowance it spends — so any failure
 * here is swallowed and never affects whether the request proceeds. Called
 * after a quota unit has been spent, mirroring that same call. No-ops when
 * Supabase is unconfigured, the RPC is missing (schema not migrated yet), or
 * the model tag is empty.
 */
export const recordAiModelUsage = async (accessToken: string, model: string): Promise<void> => {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey || !model) return;

  try {
    // The user's own JWT scopes the RPC to their auth.uid(), so a caller can
    // only ever record against their own tally.
    const client = createClient(url, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { error } = await client.rpc('record_ai_model_usage', { p_model: model });
    if (error) {
      console.warn('[quota] record_ai_model_usage unavailable (ignored):', error.message);
    }
  } catch (e) {
    console.warn('[quota] record_ai_model_usage failed (ignored):', e);
  }
};
