/**
 * The arithmetic behind the admin "Seat economics" panel: what a paid School seat
 * costs in AI calls, and whether the seat price covers it.
 *
 * Pure, so the rules can be tested without a database or the build environment.
 * The inputs are the usage figures from `school_seat_usage()` (schema §30) and two
 * prices the client is given: the cost of one call (VITE_AI_COST_PER_CALL_AUD) and
 * the seat price (parsed from PLAN_PRICING.schoolSeat). Nothing here reads the
 * database or changes a plan, quota or price.
 */

/** The per-school figures `school_seat_usage()` returns (snake_case, as the database names them). */
export interface SeatUsageMeasures {
  seats: number;
  members: number;
  active_users: number;
  total_calls: number;
  calls_per_seat_per_day: number;
  avg_calls_per_active_user_day: number;
  p95_calls_per_user_day: number;
  max_calls_per_user_day: number;
  user_days_over_100: number;
  seats_unused: number;
}

export interface SchoolSeatUsage extends SeatUsageMeasures {
  id: string;
  name: string;
}

/**
 * `thin` is between half the seat price and the whole of it. `loss` is more than
 * the seat price. `unknown` is any case where there is no cost or no price to
 * compare with, so the panel never guesses a verdict.
 */
export type SeatVerdict = 'unknown' | 'healthy' | 'thin' | 'loss';

export interface SeatEconomics {
  /** Projected AI cost of one seat over a year, or null when it cannot be worked out. */
  costPerSeatPerYearAud: number | null;
  /** Seat price minus that cost. Negative when the seat loses money. */
  marginPerSeatPerYearAud: number | null;
  /** The same projection for a heavy user: the 95th-percentile user-day, every day of the year. */
  heavyUserCostPerYearAud: number | null;
  heavyUserMarginPerYearAud: number | null;
  /** Cost as a share of the seat price (1 is break-even). Null when there is no price to divide by. */
  costShareOfRevenue: number | null;
  verdict: SeatVerdict;
}

export const DAYS_PER_YEAR = 365;

/** Cost at or below this share of the seat price is `healthy`. */
export const HEALTHY_COST_SHARE = 0.5;

/** Cost above this share of the seat price is `loss`. Exactly 1 is `thin`. */
export const LOSS_COST_SHARE = 1;

/** A finite, non-negative number, or null. Anything else (NaN, Infinity, negatives) is refused. */
const nonNegative = (n: number | null | undefined): number | null =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;

/**
 * The cost of one AI call in AUD, from the environment. Unset, blank, negative or
 * not a plain decimal (so no "1e-3", no "NaN") gives null, which keeps the panel to
 * calls only rather than showing a cost it cannot stand behind.
 */
export const parseCostPerCallAud = (raw: string | null | undefined): number | null => {
  const text = raw?.trim() ?? '';
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  return nonNegative(Number(text));
};

/**
 * The first dollar amount in a display price, as a number: "A$4" is 4,
 * "A$4.50 per student per year" is 4.5, "A$1,200" is 1200. No dollar amount (or
 * "four dollars") is null, so an unreadable price is never treated as a figure.
 */
export const parseSeatRevenueAud = (text: string | null | undefined): number | null => {
  const match = /\$\s*(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?/.exec(text ?? '');
  if (!match) return null;
  return nonNegative(Number(`${match[1].replace(/,/g, '')}${match[2] ?? ''}`));
};

/**
 * What one seat costs in AI calls over a year, and whether the seat price covers
 * it. Projected from the average calls a seat makes per day, and separately from
 * the heavy user (the 95th-percentile user-day), held every day of the year.
 *
 * A school with no seats has no per-seat figure, so its seat projection is null
 * and its verdict `unknown`. Zero calls is a real answer: a seat that makes none
 * costs nothing and is `healthy`.
 */
export const projectSeatEconomics = (
  usage: Pick<SeatUsageMeasures, 'seats' | 'calls_per_seat_per_day' | 'p95_calls_per_user_day'>,
  costPerCallAud: number | null | undefined,
  revenuePerSeatPerYearAud: number | null | undefined
): SeatEconomics => {
  const cost = nonNegative(costPerCallAud);
  const revenue = nonNegative(revenuePerSeatPerYearAud);
  const seats = nonNegative(usage.seats) ?? 0;
  const perSeatCalls = nonNegative(usage.calls_per_seat_per_day);
  const heavyCalls = nonNegative(usage.p95_calls_per_user_day);

  const costPerSeat =
    cost !== null && perSeatCalls !== null && seats >= 1
      ? perSeatCalls * DAYS_PER_YEAR * cost
      : null;
  const heavyUserCost =
    cost !== null && heavyCalls !== null ? heavyCalls * DAYS_PER_YEAR * cost : null;

  const share =
    costPerSeat !== null && revenue !== null && revenue > 0 ? costPerSeat / revenue : null;

  let verdict: SeatVerdict = 'unknown';
  if (share !== null) {
    if (share > LOSS_COST_SHARE) verdict = 'loss';
    else if (share > HEALTHY_COST_SHARE) verdict = 'thin';
    else verdict = 'healthy';
  }

  return {
    costPerSeatPerYearAud: costPerSeat,
    marginPerSeatPerYearAud:
      costPerSeat !== null && revenue !== null ? revenue - costPerSeat : null,
    heavyUserCostPerYearAud: heavyUserCost,
    heavyUserMarginPerYearAud:
      heavyUserCost !== null && revenue !== null ? revenue - heavyUserCost : null,
    costShareOfRevenue: share,
    verdict,
  };
};
