/**
 * Pure decision logic for the daily-AI-quota warnings (featureRoadmap.md →
 * Mid-term → "Quota-exhaustion notification"): warn a user as they approach
 * (80%) and reach (100%) their allowance, instead of letting them hit a silent
 * 429 wall. Kept free of storage/UI so the threshold logic is unit-testable;
 * services/quotaNotifier.ts owns the per-day dedupe and toast dispatch.
 */

export interface QuotaSnapshot {
  used: number;
  limit: number;
}

export type QuotaWarningLevel = 'approaching' | 'reached';

export interface QuotaWarning {
  level: QuotaWarningLevel;
  /** The threshold that fired (80 or 100), used to dedupe. */
  threshold: number;
  used: number;
  limit: number;
  /** Integer percentage used, clamped to [0, 100] for display. */
  pct: number;
  message: string;
}

/** Ascending; the highest crossed-but-unfired threshold is the one we warn on. */
export const QUOTA_WARNING_THRESHOLDS = [80, 100] as const;

const buildMessage = (threshold: number, used: number, limit: number, pct: number): string =>
  threshold >= 100
    ? `Daily AI limit reached — ${used}/${limit} calls used today. Your allowance resets at midnight UTC; ask an admin if you need more.`
    : `Heads up — you've used ${pct}% of today's AI allowance (${used}/${limit} calls). It resets at midnight UTC.`;

/**
 * Decide which NEW warning (if any) a usage snapshot should raise, given the
 * thresholds already fired today. Picks the highest threshold the user has
 * crossed but not yet been warned about — so a jump straight past 100% surfaces
 * the "reached" warning even if the 80% one never fired. Returns null when
 * nothing new applies (below 80%, unlimited/zero limit, or already warned).
 */
export const evaluateQuotaWarning = (
  snapshot: QuotaSnapshot,
  firedThresholds: readonly number[]
): QuotaWarning | null => {
  const { used, limit } = snapshot;
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return null;

  const rawPct = (used / limit) * 100;
  const crossed = QUOTA_WARNING_THRESHOLDS.filter(
    (t) => rawPct >= t && !firedThresholds.includes(t)
  );
  if (crossed.length === 0) return null;

  const threshold = Math.max(...crossed);
  const pct = Math.min(100, Math.max(0, Math.round(rawPct)));
  return {
    level: threshold >= 100 ? 'reached' : 'approaching',
    threshold,
    used,
    limit,
    pct,
    message: buildMessage(threshold, used, limit, pct),
  };
};
