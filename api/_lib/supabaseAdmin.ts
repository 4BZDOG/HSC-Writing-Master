/**
 * The service-role Supabase client for the serverless API layer.
 *
 * Service role bypasses RLS, and `auth.uid()` is null for it — which is how
 * the schema's authority triggers tell "the server did this" from "an end user
 * asked for this". So this key is the server's way of writing the columns no
 * client is allowed to write (see enforce_quality_score_authority in
 * supabase/schema.sql), and it must never reach the browser: SUPABASE_SERVICE_
 * ROLE_KEY is deliberately un-prefixed so Vite cannot bundle it.
 *
 * Returns null rather than throwing when unconfigured, so each endpoint can
 * decide how to degrade — billing answers 501, the quality screen fails open
 * and leaves the contribution unscored.
 *
 * Lives in its own module (rather than alongside the billing helpers, where it
 * started) so a non-billing endpoint can reach it without loading the Stripe
 * SDK into a cold function it has no use for.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _supabaseAdmin: SupabaseClient | null = null;

export const getSupabaseAdmin = (): SupabaseClient | null => {
  if (_supabaseAdmin) return _supabaseAdmin;
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  _supabaseAdmin = createClient(url, serviceKey, { auth: { persistSession: false } });
  return _supabaseAdmin;
};
