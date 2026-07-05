/**
 * Pure helpers for the AI Usage Dashboard's "spend depth" features
 * (featureRoadmap.md → Near-term → Dashboard depth): a CSV export of the
 * reviewer-gated usage report and an estimated-cost calculation.
 *
 * These are deliberately free of React and DOM so they can be unit-tested and
 * reused. The dashboard component owns the actual download side-effect.
 */
import type { UsageReportRow } from '../services/quotaService';

/** RFC-4180-ish field escaping: quote when the value could break a cell. */
const csvField = (value: string | number): string => {
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const CSV_HEADER = ['Day', 'Username', 'Role', 'Calls', 'Limit', 'Override'] as const;

/**
 * Serialise the usage report to CSV, newest day first (the RPC already returns
 * that order; we sort defensively so the export is stable regardless of input).
 * An empty report still yields a header row so the file is never blank.
 */
export const usageReportToCsv = (rows: UsageReportRow[]): string => {
  const sorted = [...rows].sort((a, b) =>
    a.day === b.day ? b.calls - a.calls : a.day < b.day ? 1 : -1
  );
  const lines = [
    CSV_HEADER.join(','),
    ...sorted.map((r) =>
      [r.day, r.username, r.role, r.calls, r.limit, r.override ?? ''].map(csvField).join(',')
    ),
  ];
  return lines.join('\r\n');
};

export interface CostRange {
  /** Lowest plausible spend — every call priced at the cheapest engine. */
  low: number;
  /** Highest plausible spend — every call priced at the dearest engine. */
  high: number;
}

/**
 * Estimate the USD cost of `calls` proxied calls given the per-call prices of
 * the engines that could have served them. Because the quota counter records
 * calls, not which model each used, we can only bound the cost: the range runs
 * from the cheapest configured engine to the dearest. With one price the range
 * collapses to a point; with no prices it is zero.
 */
export const estimateCostRange = (calls: number, prices: number[]): CostRange => {
  const valid = prices.filter((p) => Number.isFinite(p) && p > 0);
  if (calls <= 0 || valid.length === 0) return { low: 0, high: 0 };
  return {
    low: calls * Math.min(...valid),
    high: calls * Math.max(...valid),
  };
};

/**
 * Compact USD label. Sub-cent amounts keep more precision so a handful of
 * cheap calls doesn't render as a flat "$0.00".
 */
export const formatUsd = (amount: number): string => {
  if (!Number.isFinite(amount) || amount <= 0) return '$0.00';
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(2)}`;
};

/** "$0.01–$0.09" for a range, or a single "$0.05" when the bounds coincide. */
export const formatCostRange = ({ low, high }: CostRange): string =>
  low === high ? formatUsd(low) : `${formatUsd(low)}–${formatUsd(high)}`;
