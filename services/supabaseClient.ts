import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from './supabaseConfig';

/**
 * The Supabase client, created the first time anything asks for it.
 *
 * `@supabase/supabase-js` is a dynamic import here, so the library is a chunk
 * of its own and stays out of the first load. Without Supabase configured this
 * resolves to null without loading anything, which is what the old eager
 * `supabase` export gave when the env vars were absent:
 *
 *   const supabase = await getSupabase();
 *   if (!supabase) return …;
 *
 * The promise is cached, so the library loads once however many callers ask.
 */
let client: Promise<SupabaseClient> | null = null;

export const getSupabase = (): Promise<SupabaseClient | null> => {
  if (!isSupabaseConfigured) return Promise.resolve(null);
  if (!client) {
    client = import('@supabase/supabase-js')
      .then(({ createClient }) => createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string))
      .catch((error: unknown) => {
        // A failed chunk fetch (offline, a deploy in progress) must not poison
        // every later call. The next caller tries again.
        client = null;
        throw error;
      });
  }
  return client;
};
