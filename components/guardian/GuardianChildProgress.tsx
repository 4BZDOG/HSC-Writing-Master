import React, { useEffect, useState } from 'react';
import { commandTerms } from '../../data/commandTerms';
import type { PromptVerb } from '../../types';
import {
  fetchGuardianStudentProgress,
  type GuardianStudentProgress,
} from '../../services/guardianService';
import type { DimensionAnalytics } from '../../services/responseService';
import {
  formatBand,
  formatMarkFrac,
  rankByWeakness,
  sparklinePoints,
  type RankedRow,
} from '../../utils/classAnalytics';
import { getBandConfig, getTierBandConfig } from '../../utils/renderUtils';

/**
 * A linked child's progress, read-only, for the parent dashboard.
 *
 * Reads `get_guardian_student_progress`, which returns the same aggregates a
 * teacher sees (attempts, marks, bands, verbs, a trend) and never the text of
 * an answer. Band colour comes from `getBandConfig` and tier colour from
 * `getTierBandConfig`; no colour is written here.
 */

export const PROGRESS_WINDOWS = [30, 90] as const;
export type ProgressWindow = (typeof PROGRESS_WINDOWS)[number];

/** A verb's cognitive tier, from the command-term data. Null for an unknown verb. */
const tierOf = (label: string): number | null =>
  commandTerms.get(label as PromptVerb)?.tier ?? null;

/** `EXPLAIN` reads as `Explain`. The verb is a word, not a shout. */
export const verbDisplayName = (label: string): string =>
  label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();

export interface VerbHighlights {
  /** The verb the child loses the most marks on. */
  weakest: RankedRow | null;
  /** The verb the child keeps the most marks on, when it is not the weakest. */
  strongest: RankedRow | null;
}

/**
 * Strongest and weakest command verbs by share of marks earned. A verb with no
 * mark data is left out rather than counted as perfect or as nothing earned,
 * and a single measured verb gives a weakest with no strongest to compare it to.
 */
export const verbHighlights = (rows: DimensionAnalytics[]): VerbHighlights => {
  const measured = rankByWeakness(rows, tierOf).filter((row) => row.markLostPct !== null);
  if (measured.length === 0) return { weakest: null, strongest: null };
  const weakest = measured[0];
  const strongest = measured[measured.length - 1];
  return {
    weakest,
    strongest: measured.length > 1 && strongest.label !== weakest.label ? strongest : null,
  };
};

/** The band colour for an average, clamped to a real band. Null when unscored. */
export const bandForAverage = (average: number | null | undefined): number | null => {
  if (average == null || !Number.isFinite(average)) return null;
  return Math.min(6, Math.max(1, Math.round(average)));
};

/** The bands an average has reached, for the six-segment scale (true = reached). */
export const bandsReached = (average: number | null | undefined): boolean[] =>
  [1, 2, 3, 4, 5, 6].map((band) => average != null && Number.isFinite(average) && average >= band);

const TREND_W = 320;
const TREND_H = 56;

/** The scored points of a trend, oldest first. Unscored attempts are dropped. */
const scoredBands = (progress: GuardianStudentProgress): number[] =>
  progress.trend.filter((p) => p.band != null).map((p) => p.band as number);

/** A short band change, in words: "Band 3.0 to 4.5, up 1.5". Empty without two points. */
export const trendSentence = (bands: number[]): string => {
  if (bands.length < 2) return '';
  const first = bands[0];
  const last = bands[bands.length - 1];
  const delta = Math.round((last - first) * 10) / 10;
  const change = delta > 0 ? `up ${delta}` : delta < 0 ? `down ${Math.abs(delta)}` : 'no change';
  return `Band ${formatBand(first)} to ${formatBand(last)}, ${change}`;
};

const BandScale: React.FC<{ average: number | null }> = ({ average }) => {
  const reached = bandsReached(average);
  return (
    <div className="flex gap-1" aria-hidden="true">
      {reached.map((on, i) => {
        const band = i + 1;
        return (
          <span
            key={band}
            className={`h-2 flex-1 rounded-full ${
              on ? getBandConfig(band).solidBg : 'bg-surface-inset'
            }`}
          />
        );
      })}
    </div>
  );
};

const BandSparkline: React.FC<{ bands: number[] }> = ({ bands }) => {
  if (bands.length < 2) return null;
  const line = sparklinePoints(bands, { width: TREND_W, height: TREND_H, min: 1, max: 6 });
  const sentence = trendSentence(bands);
  return (
    <div>
      <svg
        viewBox={`0 0 ${TREND_W} ${TREND_H}`}
        width="100%"
        role="img"
        aria-label={`Band trend across ${bands.length} marked answers, oldest to newest: ${bands.join(', ')}`}
        className="rounded-lg bg-surface-inset"
      >
        <polyline
          points={line}
          fill="none"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          className="stroke-[rgb(var(--color-accent))]"
        />
      </svg>
      <p className="mt-1.5 t-label text-secondary">{sentence}</p>
    </div>
  );
};

interface GuardianChildProgressProps {
  studentId: string;
  /** The child's first name or display name, for the sentences that name them. */
  name: string;
}

/**
 * The progress panel for one child, with its own 30/90-day window. Loads on
 * mount and again when the window changes. A failed read says so, with a retry.
 */
const GuardianChildProgress: React.FC<GuardianChildProgressProps> = ({ studentId, name }) => {
  const [days, setDays] = useState<ProgressWindow>(30);
  const [progress, setProgress] = useState<GuardianStudentProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchGuardianStudentProgress(studentId, days)
      .then((result) => {
        if (active) setProgress(result);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setProgress(null);
        setError(
          err instanceof Error && err.message
            ? err.message
            : 'Progress could not be loaded. Try again in a moment.'
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [studentId, days, attempt]);

  const windowToggle = (
    <div role="group" aria-label="Progress window" className="flex gap-2">
      {PROGRESS_WINDOWS.map((option) => {
        const selected = option === days;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            onClick={() => setDays(option)}
            className={`t-label min-h-11 sm:min-h-0 px-3 py-1.5 rounded-xl border touch-manipulation select-none transition-colors ${
              selected
                ? 'border-accent bg-surface-elevated text-primary'
                : 'border-secondary bg-surface text-secondary can-hover:hover:bg-surface-inset'
            }`}
          >
            {option} days
          </button>
        );
      })}
    </div>
  );

  const totals = progress?.totals;
  const hasAttempts = !!totals && totals.total_attempts > 0;
  const average = totals?.avg_band ?? null;
  const band = bandForAverage(average);
  const highlights = progress ? verbHighlights(progress.byVerb) : null;
  const bands = progress ? scoredBands(progress) : [];

  return (
    <section aria-labelledby={`progress-${studentId}`} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 id={`progress-${studentId}`} className="text-sm font-semibold text-primary">
          Progress
        </h4>
        {windowToggle}
      </div>

      {loading && (
        <p className="t-label text-secondary" role="status" aria-busy="true">
          Loading progress for {name}…
        </p>
      )}

      {!loading && error && (
        <div className="space-y-2">
          <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
            {error}
          </p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="t-label min-h-11 sm:min-h-0 px-3 py-1.5 rounded-xl border border-secondary bg-surface text-secondary can-hover:hover:bg-surface-inset touch-manipulation"
          >
            Try again
          </button>
        </div>
      )}

      {!loading && !error && progress && !hasAttempts && (
        <p className="text-sm leading-relaxed text-secondary">
          {name} has no marked answers in the last {days} days. Progress appears here once they have
          had an answer marked.
        </p>
      )}

      {!loading && !error && progress && hasAttempts && (
        <div className="space-y-5">
          <dl className="grid grid-cols-3 gap-3">
            <div className="min-w-0">
              <dt className="t-label text-muted">Marked answers</dt>
              <dd className="mt-1 font-mono text-lg font-bold tabular-nums text-primary">
                {totals?.total_attempts ?? 0}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="t-label text-muted">Average band</dt>
              <dd
                className={`mt-1 font-mono text-lg font-bold tabular-nums ${
                  band !== null ? getBandConfig(band).text : 'text-primary'
                }`}
              >
                {formatBand(average)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="t-label text-muted">Marks earned</dt>
              <dd className="mt-1 font-mono text-lg font-bold tabular-nums text-primary">
                {formatMarkFrac(totals?.avg_mark_frac)}
              </dd>
            </div>
          </dl>

          <div className="space-y-1.5">
            <BandScale average={average} />
            <p className="t-label text-secondary">
              {average != null
                ? `Average band ${formatBand(average)} out of 6`
                : 'No band average yet'}
            </p>
          </div>

          {highlights && highlights.weakest && (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-secondary bg-surface-inset p-3">
                <dt className="t-label text-muted">Weakest command verb</dt>
                <dd className="mt-1 flex items-baseline justify-between gap-2">
                  <span
                    className={`font-semibold ${
                      highlights.weakest.tier !== null
                        ? getTierBandConfig(highlights.weakest.tier).text
                        : 'text-primary'
                    }`}
                  >
                    {verbDisplayName(highlights.weakest.label)}
                  </span>
                  <span className="font-mono text-sm tabular-nums text-secondary">
                    {formatMarkFrac(highlights.weakest.avg_mark_frac)} of marks
                  </span>
                </dd>
              </div>
              {highlights.strongest ? (
                <div className="rounded-xl border border-secondary bg-surface-inset p-3">
                  <dt className="t-label text-muted">Strongest command verb</dt>
                  <dd className="mt-1 flex items-baseline justify-between gap-2">
                    <span
                      className={`font-semibold ${
                        highlights.strongest.tier !== null
                          ? getTierBandConfig(highlights.strongest.tier).text
                          : 'text-primary'
                      }`}
                    >
                      {verbDisplayName(highlights.strongest.label)}
                    </span>
                    <span className="font-mono text-sm tabular-nums text-secondary">
                      {formatMarkFrac(highlights.strongest.avg_mark_frac)} of marks
                    </span>
                  </dd>
                </div>
              ) : null}
            </dl>
          )}

          {bands.length >= 2 && <BandSparkline bands={bands} />}
        </div>
      )}
    </section>
  );
};

export default GuardianChildProgress;
