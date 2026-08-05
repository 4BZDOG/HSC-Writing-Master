import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Resolving an app-facing id (`prompt-ec-01`) to a database uuid.
 *
 * `legacy_id` is NOT unique. The only index on it is `uniq_prompts_legacy_owner`,
 * a PARTIAL unique index on `(legacy_id, created_by)` `where legacy_id is not
 * null and created_by is not null` — so it does not constrain seeded content
 * (`created_by = null`) at all, and a teacher contributing a variant of a seeded
 * question writes a second row with the same `legacy_id` under their own id.
 * Verified against Postgres: three rows can share one `legacy_id`.
 *
 * The lookup used a bare `.maybeSingle()`, which PostgREST fails with PGRST116
 * when more than one row matches. That reached much further than this function:
 * `resolvePromptRowId` feeds `persistResponse`, which swallows its errors by
 * design — so the first time anyone contributed a variant of a question,
 * responses to that question silently stopped being saved, for everyone.
 */

/** Records the query chain so the test can assert how the row was selected. */
interface Recorded {
  table: string;
  order: { column: string; opts?: Record<string, unknown> }[];
  limit: number | null;
  maybeSingle: boolean;
}

const recorded: Recorded[] = [];
let result: { data: unknown; error: unknown } = { data: { id: 'row-uuid' }, error: null };

const makeBuilder = (table: string) => {
  const rec: Recorded = { table, order: [], limit: null, maybeSingle: false };
  recorded.push(rec);
  const builder: Record<string, unknown> = {
    select: () => builder,
    or: () => builder,
    eq: () => builder,
    order: (column: string, opts?: Record<string, unknown>) => {
      rec.order.push({ column, opts });
      return builder;
    },
    limit: (n: number) => {
      rec.limit = n;
      return builder;
    },
    maybeSingle: () => {
      rec.maybeSingle = true;
      return Promise.resolve(result);
    },
  };
  return builder;
};

vi.mock('../../services/supabaseClient', () => ({
  supabase: { from: (table: string) => makeBuilder(table), rpc: vi.fn() },
  fetchAllRows: vi.fn(),
}));

const { resolvePromptRowId } = await import('../../services/contributionService');

beforeEach(() => {
  recorded.length = 0;
  result = { data: { id: 'row-uuid' }, error: null };
});

describe('resolveRowId — a legacy_id can match several rows', () => {
  it('asks for a single row explicitly instead of assuming uniqueness', async () => {
    await resolvePromptRowId('prompt-ec-01');

    const q = recorded.at(-1)!;
    expect(q.table).toBe('prompts');
    // Without `.limit(1)`, `.maybeSingle()` throws PGRST116 the moment a second
    // row shares the legacy_id.
    expect(q.limit).toBe(1);
    expect(q.maybeSingle).toBe(true);
  });

  it('prefers canonical seeded content over a user’s private variant', async () => {
    await resolvePromptRowId('prompt-ec-01');

    const q = recorded.at(-1)!;
    // Seeded content has `created_by = null`, so nulls-first resolves to the
    // SHARED question rather than to whoever's copy happened to sort first.
    expect(q.order[0]).toMatchObject({
      column: 'created_by',
      opts: { ascending: true, nullsFirst: true },
    });
  });

  it('breaks ties deterministically, so repeated calls agree', async () => {
    await resolvePromptRowId('prompt-ec-01');

    const q = recorded.at(-1)!;
    // Two seeded rows can both have created_by null; without a second key the
    // winner would be whatever Postgres returned first that day.
    expect(q.order.map((o) => o.column)).toEqual(['created_by', 'id']);
  });

  it('does not order by a column three of the five tables lack', async () => {
    // `topics`, `sub_topics` and `dot_points` have no `created_at`. Ordering by
    // it would turn a duplicate-row bug into a hard failure on every curriculum
    // lookup — a strictly worse outcome.
    await resolvePromptRowId('prompt-ec-01');

    const q = recorded.at(-1)!;
    expect(q.order.map((o) => o.column)).not.toContain('created_at');
  });

  it('still returns null when nothing matches', async () => {
    result = { data: null, error: null };
    await expect(resolvePromptRowId('nope')).resolves.toBeNull();
  });

  it('surfaces a real lookup error rather than pretending the row is absent', async () => {
    result = { data: null, error: { message: 'connection reset' } };
    await expect(resolvePromptRowId('prompt-ec-01')).rejects.toThrow(/connection reset/);
  });
});
