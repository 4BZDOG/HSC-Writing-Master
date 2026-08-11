import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Resolving a whole dot point's worth of app ids to database uuids in one go —
 * what the picker's personal ordering needs before it can ask for the reader's
 * marks.
 *
 * The subtlety it inherits from the single-id lookup: `legacy_id` is NOT
 * unique. Seeded content carries `created_by = null`, and a teacher's variant
 * of a seeded question carries the SAME legacy_id under their own id. The
 * single-id version leans on PostgREST to order and limit; this one merges two
 * queries in memory, so it has to make the same choice itself — and get it
 * right, because picking the teacher's private variant would attach a student's
 * marks to the wrong question.
 */

interface Recorded {
  table: string;
  in: { column: string; values: string[] }[];
}

const recorded: Recorded[] = [];
let rows: Record<string, unknown[]> = { legacy_id: [], id: [] };
let failWith: string | null = null;

const makeBuilder = (table: string) => {
  const rec: Recorded = { table, in: [] };
  recorded.push(rec);
  const builder: Record<string, unknown> = {
    select: () => builder,
    in: (column: string, values: string[]) => {
      rec.in.push({ column, values });
      return Promise.resolve(
        failWith ? { data: null, error: { message: failWith } } : { data: rows[column] ?? [], error: null }
      );
    },
  };
  return builder;
};

vi.mock('../../services/supabaseClient', () => ({
  supabase: { from: (table: string) => makeBuilder(table), rpc: vi.fn() },
  fetchAllRows: vi.fn(),
}));

const { resolvePromptRowIds, __clearPromptRowIdCache } = await import(
  '../../services/contributionService'
);

const UUID_A = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  recorded.length = 0;
  rows = { legacy_id: [], id: [] };
  failWith = null;
  // The cache lives for the session, so every test starts from a cold one.
  __clearPromptRowIdCache();
});

describe('resolvePromptRowIds', () => {
  it('asks once for the whole set rather than once per question', async () => {
    rows.legacy_id = [
      { id: 'row-1', legacy_id: 'prompt-a', created_by: null },
      { id: 'row-2', legacy_id: 'prompt-b', created_by: null },
      { id: 'row-3', legacy_id: 'prompt-c', created_by: null },
    ];

    const map = await resolvePromptRowIds(['prompt-a', 'prompt-b', 'prompt-c']);

    expect(recorded).toHaveLength(1);
    expect(recorded[0].in[0]).toMatchObject({ column: 'legacy_id' });
    expect(map.get('prompt-a')).toBe('row-1');
    expect(map.get('prompt-c')).toBe('row-3');
  });

  it('prefers canonical seeded content over a teacher’s private variant', async () => {
    // Both rows answer to the same legacy_id; the shared one has no author.
    rows.legacy_id = [
      { id: 'row-variant', legacy_id: 'prompt-a', created_by: 'teacher-uuid' },
      { id: 'row-seeded', legacy_id: 'prompt-a', created_by: null },
    ];

    const map = await resolvePromptRowIds(['prompt-a']);
    expect(map.get('prompt-a')).toBe('row-seeded');
  });

  it('breaks a remaining tie deterministically, so two calls agree', async () => {
    rows.legacy_id = [
      { id: 'row-b', legacy_id: 'prompt-a', created_by: null },
      { id: 'row-a', legacy_id: 'prompt-a', created_by: null },
    ];

    const first = await resolvePromptRowIds(['prompt-a']);
    recorded.length = 0;
    const second = await resolvePromptRowIds(['prompt-a']);

    expect(first.get('prompt-a')).toBe('row-a');
    expect(second.get('prompt-a')).toBe(first.get('prompt-a'));
  });

  it('also resolves an app id that is already the row uuid', async () => {
    rows.id = [{ id: UUID_A, legacy_id: null, created_by: null }];

    const map = await resolvePromptRowIds([UUID_A]);

    // Two queries: the legacy_id sweep, then the uuid one for the ids that
    // could be uuids. A uuid can legitimately BE somebody's legacy_id, so the
    // first is not skipped.
    expect(recorded.map((r) => r.in[0].column)).toEqual(['legacy_id', 'id']);
    expect(map.get(UUID_A)).toBe(UUID_A);
  });

  it('leaves out what has no row at all, rather than inventing one', async () => {
    rows.legacy_id = [{ id: 'row-1', legacy_id: 'prompt-a', created_by: null }];

    const map = await resolvePromptRowIds(['prompt-a', 'local-draft']);

    expect(map.size).toBe(1);
    expect(map.has('local-draft')).toBe(false);
  });

  it('does nothing at all for an empty list', async () => {
    expect((await resolvePromptRowIds([])).size).toBe(0);
    expect(recorded).toHaveLength(0);
  });

  it('surfaces a lookup failure instead of reporting "no attempts"', async () => {
    failWith = 'connection reset';
    await expect(resolvePromptRowIds(['prompt-a'])).rejects.toThrow(/connection reset/);
  });
});

describe('the resolution cache', () => {
  it('does not ask twice for an id it has already placed', async () => {
    rows.legacy_id = [{ id: 'row-1', legacy_id: 'prompt-cached', created_by: null }];

    const first = await resolvePromptRowIds(['prompt-cached']);
    recorded.length = 0;
    rows.legacy_id = [];
    const second = await resolvePromptRowIds(['prompt-cached']);

    expect(first.get('prompt-cached')).toBe('row-1');
    // Answered from memory: the row a prompt lives in does not move.
    expect(recorded).toHaveLength(0);
    expect(second.get('prompt-cached')).toBe('row-1');
  });

  it('keeps asking about an id that resolved to nothing', async () => {
    rows.legacy_id = [];
    await resolvePromptRowIds(['local-draft-2']);
    recorded.length = 0;

    // A local draft contributed a minute later must not be told it does not
    // exist for as long as the tab stays open.
    rows.legacy_id = [{ id: 'row-9', legacy_id: 'local-draft-2', created_by: null }];
    const second = await resolvePromptRowIds(['local-draft-2']);

    expect(recorded.length).toBeGreaterThan(0);
    expect(second.get('local-draft-2')).toBe('row-9');
  });

  it('asks only about the ids it does not already know', async () => {
    rows.legacy_id = [{ id: 'row-a', legacy_id: 'known', created_by: null }];
    await resolvePromptRowIds(['known']);
    recorded.length = 0;

    rows.legacy_id = [{ id: 'row-b', legacy_id: 'fresh', created_by: null }];
    const map = await resolvePromptRowIds(['known', 'fresh']);

    expect(recorded[0].in[0].values).toEqual(['fresh']);
    expect(map.get('known')).toBe('row-a');
    expect(map.get('fresh')).toBe('row-b');
  });
});
