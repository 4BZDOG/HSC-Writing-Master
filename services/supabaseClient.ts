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

// ----------------------------------------------------------------------------
// Paging helper
// ----------------------------------------------------------------------------

/** Structural slice of a PostgREST query builder that fetchAllRows needs. */
interface PageableQuery {
  order(column: string): PageableQuery;
  range(
    from: number,
    to: number
  ): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
}

const PAGE_SIZE = 1000;

/**
 * Fetch every row of a query, paging past PostgREST's response cap (Supabase's
 * "Max rows" API setting, 1000 by default). Without this, any table that grows
 * beyond the cap is silently truncated. `buildQuery` must return a FRESH query
 * on each call (ranges are stateful on the builder); rows are ordered by `id`
 * so pages are stable — unordered paging can skip or repeat rows.
 */
export const fetchAllRows = async <T>(
  buildQuery: () => PageableQuery,
  label: string,
  pageSize: number = PAGE_SIZE
): Promise<T[]> => {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery()
      .order('id')
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
};
