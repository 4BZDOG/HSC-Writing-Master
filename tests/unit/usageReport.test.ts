import { describe, it, expect } from 'vitest';
import {
  usageReportToCsv,
  estimateCostRange,
  formatUsd,
  formatCostRange,
  aggregateModelCosts,
} from '../../utils/usageReport';
import type { UsageReportRow } from '../../services/quotaService';

const row = (over: Partial<UsageReportRow> = {}): UsageReportRow => ({
  username: 'alice',
  role: 'student',
  day: '2026-07-04',
  calls: 3,
  limit: 60,
  override: null,
  ...over,
});

describe('usageReportToCsv', () => {
  it('emits a header row even for an empty report', () => {
    expect(usageReportToCsv([])).toBe('Day,Username,Role,Calls,Limit,Override');
  });

  it('serialises rows and blanks a null override', () => {
    const csv = usageReportToCsv([row()]);
    expect(csv).toBe(
      ['Day,Username,Role,Calls,Limit,Override', '2026-07-04,alice,student,3,60,'].join('\r\n')
    );
  });

  it('includes the override value when present', () => {
    const csv = usageReportToCsv([row({ override: 100, limit: 100 })]);
    expect(csv.split('\r\n')[1]).toBe('2026-07-04,alice,student,3,100,100');
  });

  it('sorts newest day first, then busiest user', () => {
    const csv = usageReportToCsv([
      row({ username: 'quiet', day: '2026-07-03', calls: 1 }),
      row({ username: 'busy', day: '2026-07-04', calls: 9 }),
      row({ username: 'idle', day: '2026-07-04', calls: 2 }),
    ]);
    expect(csv.split('\r\n').slice(1)).toEqual([
      '2026-07-04,busy,student,9,60,',
      '2026-07-04,idle,student,2,60,',
      '2026-07-03,quiet,student,1,60,',
    ]);
  });

  it('escapes fields that contain commas or quotes', () => {
    const csv = usageReportToCsv([row({ username: 'a,b "x"' })]);
    expect(csv.split('\r\n')[1]).toBe('2026-07-04,"a,b ""x""",student,3,60,');
  });
});

describe('estimateCostRange', () => {
  it('is zero when there are no calls', () => {
    expect(estimateCostRange(0, [0.01])).toEqual({ low: 0, high: 0 });
  });

  it('is zero when no valid prices are supplied', () => {
    expect(estimateCostRange(10, [])).toEqual({ low: 0, high: 0 });
    expect(estimateCostRange(10, [0, -1, NaN])).toEqual({ low: 0, high: 0 });
  });

  it('collapses to a point for a single price', () => {
    expect(estimateCostRange(100, [0.006])).toEqual({ low: 0.6, high: 0.6 });
  });

  it('bounds cost by the cheapest and dearest engine', () => {
    const range = estimateCostRange(100, [0.0008, 0.009, 0.002]);
    expect(range.low).toBeCloseTo(0.08);
    expect(range.high).toBeCloseTo(0.9);
  });
});

describe('formatUsd', () => {
  it('renders zero and non-finite as $0.00', () => {
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(-5)).toBe('$0.00');
    expect(formatUsd(NaN)).toBe('$0.00');
  });

  it('keeps precision for sub-cent and sub-dollar amounts', () => {
    expect(formatUsd(0.0008)).toBe('$0.0008');
    expect(formatUsd(0.05)).toBe('$0.050');
    expect(formatUsd(12.3)).toBe('$12.30');
  });
});

describe('formatCostRange', () => {
  it('shows a single value when bounds coincide', () => {
    expect(formatCostRange({ low: 0.6, high: 0.6 })).toBe('$0.600');
  });

  it('shows a dash-separated range otherwise', () => {
    expect(formatCostRange({ low: 0.08, high: 0.9 })).toBe('$0.080–$0.900');
  });
});

describe('aggregateModelCosts', () => {
  const meta = (model: string) =>
    ({
      'gemini-3-pro-preview': { label: 'Gemini 3 Pro', price: 0.006 },
      'claude-sonnet-4-6': { label: 'Claude Sonnet 4.6', price: 0.009 },
    })[model] ?? { label: model, price: 0 };

  it('sums calls across days and prices each model', () => {
    const summary = aggregateModelCosts(
      [
        { model: 'gemini-3-pro-preview', calls: 10 },
        { model: 'gemini-3-pro-preview', calls: 5 },
        { model: 'claude-sonnet-4-6', calls: 4 },
      ],
      meta
    );
    expect(summary.totalCalls).toBe(19);
    expect(summary.totalCost).toBeCloseTo(15 * 0.006 + 4 * 0.009);
    const gemini = summary.rows.find((r) => r.model === 'gemini-3-pro-preview')!;
    expect(gemini.calls).toBe(15);
    expect(gemini.cost).toBeCloseTo(0.09);
  });

  it('sorts dearest-first even when a cheaper model has more calls', () => {
    const summary = aggregateModelCosts(
      [
        { model: 'gemini-3-pro-preview', calls: 20 }, // 20 * 0.006 = 0.12
        { model: 'claude-sonnet-4-6', calls: 15 }, // 15 * 0.009 = 0.135
      ],
      meta
    );
    expect(summary.rows.map((r) => r.model)).toEqual(['claude-sonnet-4-6', 'gemini-3-pro-preview']);
  });

  it('keeps an unknown model, labelled by its raw string at zero cost', () => {
    const summary = aggregateModelCosts([{ model: 'mystery/model', calls: 3 }], meta);
    expect(summary.rows).toEqual([
      { model: 'mystery/model', label: 'mystery/model', calls: 3, cost: 0 },
    ]);
    expect(summary.totalCost).toBe(0);
  });

  it('ignores blank model tags', () => {
    const summary = aggregateModelCosts([{ model: '', calls: 9 }], meta);
    expect(summary.rows).toEqual([]);
    expect(summary.totalCalls).toBe(0);
  });
});
