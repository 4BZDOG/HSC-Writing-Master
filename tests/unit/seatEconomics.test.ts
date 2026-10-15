import { describe, it, expect } from 'vitest';
import {
  DAYS_PER_YEAR,
  parseCostPerCallAud,
  parseSeatRevenueAud,
  projectSeatEconomics,
} from '../../utils/seatEconomics';

/**
 * The seat economics rules, as pure functions. The thresholds are the ones the
 * panel's explanation and docs/seat-economics.md state, so each boundary is pinned
 * here: exactly half the price is healthy, exactly the price is thin, and one cent
 * over is a loss.
 */

const usage = (over: Partial<Parameters<typeof projectSeatEconomics>[0]> = {}) => ({
  seats: 10,
  calls_per_seat_per_day: 1,
  p95_calls_per_user_day: 40,
  ...over,
});

describe('parseCostPerCallAud', () => {
  it('reads a plain decimal', () => {
    expect(parseCostPerCallAud('0.01')).toBe(0.01);
    expect(parseCostPerCallAud(' 0.0125 ')).toBe(0.0125);
    expect(parseCostPerCallAud('0')).toBe(0);
  });

  it('gives null when unset, blank or not a plain decimal', () => {
    expect(parseCostPerCallAud(undefined)).toBeNull();
    expect(parseCostPerCallAud(null)).toBeNull();
    expect(parseCostPerCallAud('')).toBeNull();
    expect(parseCostPerCallAud('   ')).toBeNull();
    expect(parseCostPerCallAud('-0.01')).toBeNull();
    expect(parseCostPerCallAud('NaN')).toBeNull();
    expect(parseCostPerCallAud('Infinity')).toBeNull();
    expect(parseCostPerCallAud('1e-3')).toBeNull();
    expect(parseCostPerCallAud('A$0.01')).toBeNull();
  });
});

describe('parseSeatRevenueAud', () => {
  it('reads the first dollar amount in the display price', () => {
    expect(parseSeatRevenueAud('A$4')).toBe(4);
    expect(parseSeatRevenueAud('A$4.50')).toBe(4.5);
    expect(parseSeatRevenueAud('A$4 per student per year')).toBe(4);
    expect(parseSeatRevenueAud('A$1,200')).toBe(1200);
    expect(parseSeatRevenueAud('$0')).toBe(0);
  });

  it('gives null when there is no readable amount', () => {
    expect(parseSeatRevenueAud('Four dollars')).toBeNull();
    expect(parseSeatRevenueAud('A$')).toBeNull();
    expect(parseSeatRevenueAud('')).toBeNull();
    expect(parseSeatRevenueAud(undefined)).toBeNull();
    expect(parseSeatRevenueAud(null)).toBeNull();
  });
});

describe('projectSeatEconomics: the figures', () => {
  it('projects a year of calls at the cost per call, and the margin against the seat price', () => {
    // 2 calls a seat a day, A$0.01 a call, A$4 seat: 2 * 365 * 0.01 = A$7.30 cost.
    const e = projectSeatEconomics(usage({ calls_per_seat_per_day: 2 }), 0.01, 4);
    expect(e.costPerSeatPerYearAud).toBeCloseTo(7.3, 10);
    expect(e.marginPerSeatPerYearAud).toBeCloseTo(-3.3, 10);
    expect(e.costShareOfRevenue).toBeCloseTo(1.825, 10);
  });

  it('projects the heavy user from the 95th percentile, every day of the year', () => {
    // 200 calls at the 95th percentile, A$0.01 a call: 200 * 365 * 0.01 = A$730.
    const e = projectSeatEconomics(usage({ p95_calls_per_user_day: 200 }), 0.01, 4);
    expect(e.heavyUserCostPerYearAud).toBeCloseTo(200 * DAYS_PER_YEAR * 0.01, 10);
    expect(e.heavyUserMarginPerYearAud).toBeCloseTo(4 - 730, 10);
  });

  it('uses 365 days', () => {
    expect(DAYS_PER_YEAR).toBe(365);
  });
});

describe('projectSeatEconomics: the verdict', () => {
  // At A$0.50 a call and one call a seat a day, a seat costs 1 * 365 * 0.5 = A$182.50 a
  // year. Those figures are exact in binary, so each boundary below is exact too.
  const COST = 0.5;
  const oneCallADay = usage({ calls_per_seat_per_day: 1 });

  it('is healthy when the cost is at most half the seat price', () => {
    expect(projectSeatEconomics(oneCallADay, COST, 182.5 * 2).verdict).toBe('healthy');
    expect(projectSeatEconomics(oneCallADay, COST, 365).costShareOfRevenue).toBe(0.5);
  });

  it('is thin just over half the price, and at exactly the price', () => {
    expect(projectSeatEconomics(oneCallADay, COST, 364.9).verdict).toBe('thin');
    expect(projectSeatEconomics(oneCallADay, COST, 182.5).verdict).toBe('thin');
    expect(projectSeatEconomics(oneCallADay, COST, 182.5).costShareOfRevenue).toBe(1);
  });

  it('is a loss above the seat price', () => {
    const over = projectSeatEconomics(oneCallADay, COST, 182.4);
    expect(over.verdict).toBe('loss');
    expect(over.marginPerSeatPerYearAud).toBeCloseTo(-0.1, 10);
  });

  it('is unknown when no cost per call is configured, and says so without a projection', () => {
    const e = projectSeatEconomics(usage(), null, 4);
    expect(e.verdict).toBe('unknown');
    expect(e.costPerSeatPerYearAud).toBeNull();
    expect(e.marginPerSeatPerYearAud).toBeNull();
    expect(e.heavyUserCostPerYearAud).toBeNull();
    expect(e.costShareOfRevenue).toBeNull();
  });

  it('is unknown when the seat price cannot be read, but still projects the cost', () => {
    const e = projectSeatEconomics(usage({ calls_per_seat_per_day: 2 }), 0.01, null);
    expect(e.verdict).toBe('unknown');
    expect(e.costPerSeatPerYearAud).toBeCloseTo(7.3, 10);
    expect(e.marginPerSeatPerYearAud).toBeNull();
    expect(e.costShareOfRevenue).toBeNull();
  });

  it('is unknown when the price is zero, because there is nothing to divide by', () => {
    expect(projectSeatEconomics(usage(), 0.01, 0).verdict).toBe('unknown');
  });
});

describe('projectSeatEconomics: edge cases', () => {
  it('is healthy with zero calls: a seat that makes none costs nothing', () => {
    const e = projectSeatEconomics(
      usage({ calls_per_seat_per_day: 0, p95_calls_per_user_day: 0 }),
      0.01,
      4
    );
    expect(e.verdict).toBe('healthy');
    expect(e.costPerSeatPerYearAud).toBe(0);
    expect(e.marginPerSeatPerYearAud).toBe(4);
    expect(e.heavyUserCostPerYearAud).toBe(0);
  });

  it('is unknown with zero seats, because there is no per-seat figure', () => {
    const e = projectSeatEconomics(usage({ seats: 0, calls_per_seat_per_day: 9 }), 0.01, 4);
    expect(e.verdict).toBe('unknown');
    expect(e.costPerSeatPerYearAud).toBeNull();
    expect(e.marginPerSeatPerYearAud).toBeNull();
  });

  it('still projects the heavy user for a school with zero seats', () => {
    const e = projectSeatEconomics(usage({ seats: 0, p95_calls_per_user_day: 100 }), 0.01, 4);
    expect(e.heavyUserCostPerYearAud).toBeCloseTo(365, 10);
  });

  it('is safe against NaN, Infinity and negative inputs: each becomes null, never a number', () => {
    const bad = projectSeatEconomics(
      usage({
        calls_per_seat_per_day: Number.NaN,
        p95_calls_per_user_day: Number.POSITIVE_INFINITY,
        seats: -3,
      }),
      Number.NaN,
      Number.NaN
    );
    expect(bad).toEqual({
      costPerSeatPerYearAud: null,
      marginPerSeatPerYearAud: null,
      heavyUserCostPerYearAud: null,
      heavyUserMarginPerYearAud: null,
      costShareOfRevenue: null,
      verdict: 'unknown',
    });
    expect(
      projectSeatEconomics(usage({ calls_per_seat_per_day: -1 }), -0.01, 4).costPerSeatPerYearAud
    ).toBeNull();
  });
});
