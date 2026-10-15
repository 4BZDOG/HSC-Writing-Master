import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadSeatUsage, parseSeatUsage } from '../../services/seatEconomicsService';

/**
 * The seat-usage reader is admin-only and read-only. Its two jobs are to refuse a
 * payload that does not have the promised shape (so the panel never renders NaN),
 * and to tell "the schema has not been applied" apart from a real failure. The
 * client is stubbed; the database side is covered by the schema tests.
 */

const rpc = vi.fn();
const client = vi.hoisted(() => ({ supabase: null as null | { rpc: unknown } }));

vi.mock('../../services/supabaseClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/supabaseClient')>();
  return {
    ...actual,
    get supabase() {
      return client.supabase;
    },
  };
});

const measures = {
  seats: 10,
  members: 8,
  active_users: 6,
  total_calls: 300,
  calls_per_seat_per_day: 1,
  avg_calls_per_active_user_day: 5,
  p95_calls_per_user_day: 40,
  max_calls_per_user_day: 90,
  user_days_over_100: 0,
  seats_unused: 2,
};

const payload = () => ({
  days: 30,
  schools: [{ id: 'school-1', name: 'Alpha High', ...measures }],
  totals: { ...measures },
});

beforeEach(() => {
  rpc.mockReset();
  client.supabase = { rpc };
});

describe('parseSeatUsage: the shape guard', () => {
  it('accepts the shape school_seat_usage() returns', () => {
    const parsed = parseSeatUsage(payload());
    expect(parsed).not.toBeNull();
    expect(parsed?.days).toBe(30);
    expect(parsed?.schools[0]).toEqual({ id: 'school-1', name: 'Alpha High', ...measures });
    expect(parsed?.totals).toEqual(measures);
  });

  it('accepts an empty report: no licensed schools', () => {
    const parsed = parseSeatUsage({ days: 90, schools: [], totals: { ...measures } });
    expect(parsed?.schools).toEqual([]);
  });

  it('refuses a payload that is not an object, or has no totals or schools list', () => {
    expect(parseSeatUsage(null)).toBeNull();
    expect(parseSeatUsage('report')).toBeNull();
    expect(parseSeatUsage([])).toBeNull();
    expect(parseSeatUsage({ ...payload(), totals: undefined })).toBeNull();
    expect(parseSeatUsage({ ...payload(), schools: 'Alpha' })).toBeNull();
    expect(parseSeatUsage({ days: 30, schools: [] })).toBeNull();
  });

  it('refuses a missing, non-numeric, NaN, negative or infinite count, anywhere in the report', () => {
    for (const bad of [undefined, '3', null, Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      const dropped = { ...payload(), totals: { ...measures, total_calls: bad } };
      expect(parseSeatUsage(dropped), `totals.total_calls = ${String(bad)}`).toBeNull();

      const inSchool = payload();
      inSchool.schools[0] = { ...inSchool.schools[0], p95_calls_per_user_day: bad as number };
      expect(parseSeatUsage(inSchool), `school p95 = ${String(bad)}`).toBeNull();
    }
  });

  it('refuses a school with no id or name, because the table row would have no key or label', () => {
    const noId = payload();
    noId.schools[0] = { ...noId.schools[0], id: undefined as unknown as string };
    expect(parseSeatUsage(noId)).toBeNull();

    const noName = payload();
    noName.schools[0] = { ...noName.schools[0], name: 42 as unknown as string };
    expect(parseSeatUsage(noName)).toBeNull();
  });

  it('refuses a days value that is not a count', () => {
    expect(parseSeatUsage({ ...payload(), days: undefined })).toBeNull();
    expect(parseSeatUsage({ ...payload(), days: -30 })).toBeNull();
  });
});

describe('loadSeatUsage', () => {
  it('calls school_seat_usage with the window and returns the typed report', async () => {
    rpc.mockResolvedValue({ data: { ...payload(), days: 90 }, error: null });

    const result = await loadSeatUsage(90);

    expect(rpc).toHaveBeenCalledWith('school_seat_usage', { p_days: 90 });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.usage.days).toBe(90);
      expect(result.usage.schools).toHaveLength(1);
    }
  });

  it('is unavailable, not an error, when the function is missing (schema not re-applied)', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        message: 'Could not find the function public.school_seat_usage(p_days) in the schema cache',
      },
    });
    expect(await loadSeatUsage(30)).toEqual({ status: 'unavailable' });
  });

  it('is unavailable for Postgres wording of a missing function too', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'function public.school_seat_usage(integer) does not exist' },
    });
    expect(await loadSeatUsage(30)).toEqual({ status: 'unavailable' });
  });

  it('is an error with the database message when a non-admin is refused', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'Only admins can read seat usage' },
    });
    expect(await loadSeatUsage(30)).toEqual({
      status: 'error',
      message: 'Could not load seat usage: Only admins can read seat usage',
    });
  });

  it('is an error, never a guessed report, when the payload has the wrong shape', async () => {
    rpc.mockResolvedValue({ data: { days: 30, schools: [] }, error: null });
    expect(await loadSeatUsage(30)).toEqual({
      status: 'error',
      message: 'Seat usage came back in an unexpected shape.',
    });
  });

  it('is an error when the request itself throws', async () => {
    rpc.mockRejectedValue(new Error('Failed to fetch'));
    expect(await loadSeatUsage(30)).toEqual({ status: 'error', message: 'Failed to fetch' });
  });

  it('is an error, with no request, when Supabase is not configured', async () => {
    client.supabase = null;
    expect(await loadSeatUsage(30)).toEqual({
      status: 'error',
      message: 'Supabase is not configured.',
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
