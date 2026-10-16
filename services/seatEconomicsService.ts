/**
 * Reads the admin seat-usage report (`school_seat_usage()`, schema §30).
 *
 * Read-only: the function measures calls, and nothing here changes a quota, a
 * limit or a price. The shape is checked by hand before the panel sees it, the
 * same way billingOverviewService checks its rows, so a drifted function fails
 * with a sentence rather than rendering NaN.
 *
 * A database that has not had §30 applied is not an error. It is `unavailable`,
 * and the panel says to re-apply the schema.
 */
import { supabase } from './supabaseClient';
import { isMissingSchemaError } from './billingOverviewService';
import type { SchoolSeatUsage, SeatUsageMeasures } from '../utils/seatEconomics';

/** The window sizes the panel offers. The database clamps anything else to 1..90. */
export const SEAT_USAGE_WINDOWS = [30, 90] as const;
export type SeatUsageWindow = (typeof SEAT_USAGE_WINDOWS)[number];

export interface SeatUsage {
  days: number;
  schools: SchoolSeatUsage[];
  totals: SeatUsageMeasures;
}

export type SeatUsageResult =
  | { status: 'ok'; usage: SeatUsage }
  | { status: 'unavailable' }
  | { status: 'error'; message: string };

const MEASURE_KEYS = [
  'seats',
  'members',
  'active_users',
  'total_calls',
  'calls_per_seat_per_day',
  'avg_calls_per_active_user_day',
  'p95_calls_per_user_day',
  'max_calls_per_user_day',
  'user_days_over_100',
  'seats_unused',
] as const;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** A count the report can show: a finite, non-negative number. Anything else is a drifted shape. */
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

const readMeasures = (raw: Record<string, unknown>): SeatUsageMeasures | null => {
  for (const key of MEASURE_KEYS) {
    if (!isCount(raw[key])) return null;
  }
  return {
    seats: raw.seats as number,
    members: raw.members as number,
    active_users: raw.active_users as number,
    total_calls: raw.total_calls as number,
    calls_per_seat_per_day: raw.calls_per_seat_per_day as number,
    avg_calls_per_active_user_day: raw.avg_calls_per_active_user_day as number,
    p95_calls_per_user_day: raw.p95_calls_per_user_day as number,
    max_calls_per_user_day: raw.max_calls_per_user_day as number,
    user_days_over_100: raw.user_days_over_100 as number,
    seats_unused: raw.seats_unused as number,
  };
};

/**
 * Checks the JSON `school_seat_usage()` returns and gives back the typed report, or
 * null when any part is missing or not a count. Pure, so the guard is tested
 * without a database.
 */
export const parseSeatUsage = (raw: unknown): SeatUsage | null => {
  if (!isRecord(raw) || !isCount(raw.days) || !Array.isArray(raw.schools)) return null;
  if (!isRecord(raw.totals)) return null;

  const totals = readMeasures(raw.totals);
  if (!totals) return null;

  const schools: SchoolSeatUsage[] = [];
  for (const row of raw.schools) {
    if (!isRecord(row) || typeof row.id !== 'string' || typeof row.name !== 'string') return null;
    const measures = readMeasures(row);
    if (!measures) return null;
    schools.push({ ...measures, id: row.id, name: row.name });
  }

  return { days: raw.days, schools, totals };
};

/**
 * The seat-usage report for the last `days` days. Admin only (the function refuses
 * anyone else, and the message is shown as it is). A missing function, which means
 * §30 has not been applied, is `unavailable` rather than an error.
 */
export const loadSeatUsage = async (days: number): Promise<SeatUsageResult> => {
  if (!supabase) return { status: 'error', message: 'Supabase is not configured.' };
  try {
    const { data, error } = await supabase.rpc('school_seat_usage', { p_days: days });
    if (error) {
      if (isMissingSchemaError(error.message)) return { status: 'unavailable' };
      return { status: 'error', message: `Could not load seat usage: ${error.message}` };
    }
    const usage = parseSeatUsage(data);
    if (!usage) {
      return { status: 'error', message: 'Seat usage came back in an unexpected shape.' };
    }
    return { status: 'ok', usage };
  } catch (e) {
    return {
      status: 'error',
      message: e instanceof Error ? e.message : 'Could not load seat usage.',
    };
  }
};
