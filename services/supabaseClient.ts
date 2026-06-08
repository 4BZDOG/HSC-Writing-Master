import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Gated Supabase client.
 *
 * The app works fully without Supabase: when the env vars are absent,
 * `isSupabaseConfigured` is false and the rest of the app falls back to the
 * existing local mock behaviour. Set both to opt in:
 *
 *   VITE_SUPABASE_URL       — https://<project>.supabase.co
 *   VITE_SUPABASE_ANON_KEY  — the project's anon (public) key
 *
 * The anon key is designed to be public; Row-Level Security (see
 * supabase/schema.sql) is what actually protects the data.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string)
  : null;
