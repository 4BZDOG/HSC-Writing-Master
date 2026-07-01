import { describe, it, expect, vi } from 'vitest';
import { fetchAllRows } from '../../services/supabaseClient';

/** Builds a fake PostgREST query whose .range() serves slices of `rows`. */
const fakeQuery = (rows: unknown[], calls: Array<[number, number]>) => () => ({
  order: (_column: string) => ({
    order: (_c: string) => {
      throw new Error('unused');
    },
    range: (from: number, to: number) => {
      calls.push([from, to]);
      return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
    },
  }),
  range: () => {
    throw new Error('range() must be called after order()');
  },
});

describe('fetchAllRows (pages past the PostgREST row cap)', () => {
  it('walks pages until a short page and concatenates all rows', async () => {
    const rows = ['a', 'b', 'c', 'd', 'e'];
    const calls: Array<[number, number]> = [];

    const result = await fetchAllRows<string>(fakeQuery(rows, calls), 'test', 2);

    expect(result).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(calls).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
    ]);
  });

  it('makes one extra call when the total is an exact multiple of the page size', async () => {
    const rows = ['a', 'b'];
    const calls: Array<[number, number]> = [];

    const result = await fetchAllRows<string>(fakeQuery(rows, calls), 'test', 2);

    expect(result).toEqual(['a', 'b']);
    // Full first page → cannot know it was the last; second (empty) page confirms.
    expect(calls).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it('returns an empty array for an empty table', async () => {
    const calls: Array<[number, number]> = [];
    const result = await fetchAllRows<string>(fakeQuery([], calls), 'test', 2);
    expect(result).toEqual([]);
    expect(calls).toEqual([[0, 1]]);
  });

  it('throws with the caller label on a query error', async () => {
    const failing = () => ({
      order: () => ({
        order: vi.fn(),
        range: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
      }),
      range: vi.fn(),
    });
    await expect(fetchAllRows(failing as never, 'Curriculum load failed', 2)).rejects.toThrow(
      /Curriculum load failed: boom/
    );
  });
});
