/**
 * Supabase settings and the paging helper. This module must NOT import
 * '@supabase/supabase-js', not even for a value it could get elsewhere.
 *
 * Many modules read `isSupabaseConfigured` to choose a label or a branch, and
 * a local-mode student never needs the client library. The library is about
 * 54 kB gzipped, so it is loaded by `services/supabaseClient.ts` on first use,
 * and only when Supabase is configured. A static import of the library from
 * here would put it back in every student's first load.
 *
 * Set both to opt in:
 *
 *   VITE_SUPABASE_URL       — https://<project>.supabase.co
 *   VITE_SUPABASE_ANON_KEY  — the project's anon (public) key
 *
 * The anon key is designed to be public; Row-Level Security (see
 * supabase/schema.sql) is what actually protects the data.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const SUPABASE_URL: string | undefined = url;
export const SUPABASE_ANON_KEY: string | undefined = anonKey;

export const isSupabaseConfigured = Boolean(url && anonKey);

// ----------------------------------------------------------------------------
// Paging helper
// ----------------------------------------------------------------------------

/** Structural slice of a PostgREST query builder that fetchAllRows needs. */
export interface PageableQuery {
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
