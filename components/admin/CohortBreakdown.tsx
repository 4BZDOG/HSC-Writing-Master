import React, { useMemo } from 'react';
import { Users, Activity, Grid3x3, TrendingUp } from 'lucide-react';
import type { ClassCohort } from '../../services/responseService';
import { tierShortLabel } from '../../data/commandTerms';
import {
  COGNITIVE_TIERS,
  buildCohortRows,
  buildDailySeries,
  buildTrajectories,
  formatBand,
  formatMarkFrac,
  sparklinePoints,
  trajectoryDelta,
  type StudentTierRow,
} from '../../utils/classAnalytics';

/**
 * The cohort broken down by student: a tier heatmap, per-student trajectories,
 * and cohort activity over the window (schema §20 → get_class_cohort).
 *
 * ## Why this panel exists
 *
 * The verb and topic tables answer "where is the class weak" but average across
 * students, so two very different students can be invisible in the same number: a
 * student who reaches the ceiling on recall and collapses on judgement looks
 * identical to one who is thin everywhere. Their overall bands look identical
 * too. The heatmap is the only view that separates them.
 *
 * Everything is drawn from the share of available MARKS, never from raw bands —
 * a tier's band is capped at the tier number (the Verb Gate), so a band-based
 * grid would darken left-to-right for every student regardless of ability. See
 * utils/classAnalytics.ts.
 */

interface CohortBreakdownProps {
  cohort: ClassCohort;
  /** Window length in days, for the activity axis labels. */
  days: number;
  tierOf: (verb: string) => number | null;
}

/**
 * Five ordinal steps of ONE hue for the heatmap — the accent, which is redefined
 * per theme, so the ramp follows light/dark without a second palette. Sequential
 * (more marks = darker) rather than categorical: the cells encode magnitude, and
 * a multi-hue scale would imply the tiers are unordered categories.
 *
 * ## Why the ramp stops at 70% rather than running to full accent
 *
 * The percentage is written inside every cell — that is the primary encoding,
 * with colour as reinforcement — so a step is only usable if its label is
 * legible on its own fill. The accent is a mid-tone sky in both themes
 * (`14 165 233` dark, `2 132 199` light), and a mid-tone is the worst case: too
 * light for white ink and too dark for slate ink. Running the ramp to full
 * accent put the top two steps below 4.5:1 in BOTH themes — 2.77:1 for white on
 * full accent in dark mode — which is precisely where a teacher looks, since the
 * darkest cells are the students doing best.
 *
 * Capping at 70% keeps every step clear of that dead zone, so ONE ink per theme
 * suffices for the whole ramp (no mid-ramp flip) and the worst step still clears
 * 4.5:1: white ink holds to 72% accent in dark mode, slate-900 to 97% in light.
 * `tests/unit/cohortHeatmapContrast.test.ts` computes this from the ramp and the
 * live tokens in `index.css`, so changing either fails the build rather than
 * quietly making the numbers unreadable.
 *
 * The classes are spelled out rather than built from `HEAT_OPACITY`: Tailwind
 * scans source text for whole class names, so an interpolated one would never be
 * emitted and the cells would render unstyled. `HEAT_OPACITY` mirrors them for
 * the contrast test, which also asserts the two lists agree.
 */
export const HEAT_OPACITY = [15, 30, 45, 60, 70] as const;

const HEAT_STEPS = [
  'bg-[rgb(var(--color-accent))]/15',
  'bg-[rgb(var(--color-accent))]/30',
  'bg-[rgb(var(--color-accent))]/45',
  'bg-[rgb(var(--color-accent))]/60',
  'bg-[rgb(var(--color-accent))]/70',
] as const;

/** One ink per theme, legible on every step of the ramp above. */
const HEAT_INK = 'text-white light:text-slate-900';

const heatClasses = (frac: number): string => {
  const step = Math.min(HEAT_STEPS.length - 1, Math.max(0, Math.floor(frac * HEAT_STEPS.length)));
  return `${HEAT_STEPS[step]} ${HEAT_INK}`;
};

/** One heatmap cell. Never colour-alone: the percentage is always written in it. */
const HeatCell: React.FC<{ frac: number | null; attempts: number; title: string }> = ({
  frac,
  attempts,
  title,
}) => {
  if (attempts <= 0) {
    return (
      <td className="p-0.5">
        <div
          title={title}
          className="h-8 rounded flex items-center justify-center text-[10px] text-[rgb(var(--color-text-dim))] light:text-slate-500 bg-black/20 light:bg-slate-100"
        >
          —
        </div>
      </td>
    );
  }
  if (frac == null) {
    return (
      <td className="p-0.5">
        <div
          title={`${title} · no marks recorded on these questions`}
          className="h-8 rounded flex items-center justify-center text-[10px] italic text-[rgb(var(--color-text-dim))] light:text-slate-500 bg-black/20 light:bg-slate-100"
        >
          n/a
        </div>
      </td>
    );
  }
  return (
    <td className="p-0.5">
      <div
        title={title}
        className={`h-8 rounded flex items-center justify-center text-[10px] font-bold tabular-nums ${heatClasses(frac)}`}
      >
        {Math.round(frac * 100)}%
      </div>
    </td>
  );
};

const SPARK_W = 132;
const SPARK_H = 34;

/** One student's trajectory across the window's week buckets. */
const Trajectory: React.FC<{ points: (number | null)[] }> = ({ points }) => {
  const recorded = points.filter((p): p is number => p != null);
  if (recorded.length === 0) return null;

  // Absent weeks leave a gap rather than shifting the line: the x position comes
  // from the week index, not from the position within the recorded values.
  const coords = points
    .map((p, i) =>
      p == null
        ? null
        : ([
            points.length === 1 ? SPARK_W / 2 : (i / (points.length - 1)) * SPARK_W,
            SPARK_H - Math.min(1, Math.max(0, p)) * SPARK_H,
          ] as [number, number])
    )
    .filter((c): c is [number, number] => c !== null);

  const line = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const last = coords[coords.length - 1];
  const half = SPARK_H / 2;

  return (
    <svg
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      width="100%"
      height={SPARK_H}
      role="img"
      aria-label={`Weekly marks achieved, oldest to newest: ${points
        .map((p) => (p == null ? 'no attempts' : `${Math.round(p * 100)}%`))
        .join(', ')}`}
      className="overflow-visible"
    >
      <line
        x1={0}
        y1={half}
        x2={SPARK_W}
        y2={half}
        className="stroke-[rgb(var(--color-border-secondary))]"
        strokeWidth={1}
      />
      {coords.length > 1 && (
        <polyline
          points={line}
          fill="none"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          className="stroke-[rgb(var(--color-accent))]"
        />
      )}
      <circle
        cx={last[0]}
        cy={last[1]}
        r={3}
        className="fill-[rgb(var(--color-accent))] stroke-[rgb(var(--color-bg-surface))]"
        strokeWidth={2}
      />
    </svg>
  );
};

const VOL_W = 620;
const VOL_H = 72;

/** Cohort attempts per day across the window. One series, so no legend. */
const ActivityChart: React.FC<{ cohort: ClassCohort; days: number }> = ({ cohort, days }) => {
  const series = useMemo(() => buildDailySeries(cohort.daily, days), [cohort.daily, days]);
  const max = Math.max(1, ...series.map((d) => d.attempts));
  const total = series.reduce((sum, d) => sum + d.attempts, 0);

  if (total === 0) return null;

  const line = sparklinePoints(
    series.map((d) => d.attempts),
    { width: VOL_W, height: VOL_H, min: 0, max }
  );
  const first = line.split(' ')[0]?.split(',')[0] ?? '0';
  const lastX = line.split(' ').slice(-1)[0]?.split(',')[0] ?? String(VOL_W);
  const area = `M${first},${VOL_H} L${line.split(' ').join(' L')} L${lastX},${VOL_H} Z`;

  return (
    <section>
      <h3 className="text-xs font-bold uppercase tracking-wider text-[rgb(var(--color-text-muted))] light:text-slate-500 mb-3 flex items-center gap-2">
        <Activity className="w-3.5 h-3.5" />
        Cohort activity
      </h3>
      <div className="rounded-xl border border-[rgb(var(--color-border-secondary))] light:border-slate-200 p-3 bg-black/10 light:bg-slate-50">
        <svg
          viewBox={`0 0 ${VOL_W} ${VOL_H}`}
          width="100%"
          role="img"
          aria-label={`Attempts per day over the last ${days} days, oldest to newest. Peak ${max} in one day, ${total} in total.`}
        >
          <path d={area} className="fill-[rgb(var(--color-accent))]" fillOpacity={0.12} />
          <polyline
            points={line}
            fill="none"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            className="stroke-[rgb(var(--color-accent))]"
          />
        </svg>
        <div className="flex justify-between mt-1 text-[10px] text-[rgb(var(--color-text-dim))] light:text-slate-500 tabular-nums">
          <span>{days === 365 ? '1 year ago' : `${days} days ago`}</span>
          <span>
            {total} attempts · peak {max}/day
          </span>
          <span>today</span>
        </div>
      </div>
    </section>
  );
};

const CohortBreakdown: React.FC<CohortBreakdownProps> = ({ cohort, days, tierOf }) => {
  const rows: StudentTierRow[] = useMemo(
    () => buildCohortRows(cohort.byStudent, tierOf),
    [cohort.byStudent, tierOf]
  );
  const trajectories = useMemo(
    () => buildTrajectories(cohort.weekly, cohort.weeks),
    [cohort.weekly, cohort.weeks]
  );
  const trajectoryFor = useMemo(
    () => new Map(trajectories.map((t) => [t.username, t])),
    [trajectories]
  );

  if (rows.length === 0) {
    return (
      <p className="text-sm text-[rgb(var(--color-text-muted))] light:text-slate-500 italic py-4">
        No marked responses from your classes in this window yet. Students appear here once they
        have work marked and are enrolled in a class you teach.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tier heatmap */}
      <section>
        <h3 className="text-xs font-bold uppercase tracking-wider text-[rgb(var(--color-text-muted))] light:text-slate-500 mb-3 flex items-center gap-2">
          <Grid3x3 className="w-3.5 h-3.5" />
          Marks achieved by student and verb group
        </h3>
        <div className="rounded-xl border border-[rgb(var(--color-border-secondary))] light:border-slate-200 overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[620px]">
            <thead className="bg-[rgb(var(--color-bg-surface-inset))]/60 light:bg-slate-100 text-[rgb(var(--color-text-muted))] light:text-slate-600 uppercase text-[10px] font-bold">
              <tr>
                <th className="px-3 py-2.5">Student</th>
                {COGNITIVE_TIERS.map((t) => (
                  <th key={t} className="px-1 py-2.5 text-center">
                    B{t} {tierShortLabel(t)}
                  </th>
                ))}
                <th className="px-1 py-2.5 text-center">Untiered</th>
                <th className="px-3 py-2.5 text-right">Overall</th>
                <th className="px-3 py-2.5 text-right">Band</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--color-border-secondary))]/30 light:divide-slate-200">
              {rows.map((row) => (
                <tr key={row.username}>
                  <td className="px-3 py-1.5">
                    <span className="text-[rgb(var(--color-text-primary))] light:text-slate-800 font-semibold">
                      {row.username}
                    </span>
                    <span className="ml-2 text-[10px] text-[rgb(var(--color-text-dim))] light:text-slate-500 tabular-nums">
                      {row.attempts}
                    </span>
                  </td>
                  {row.tiers.map((tier) => (
                    <HeatCell
                      key={tier.tier}
                      frac={tier.markFrac}
                      attempts={tier.attempts}
                      title={`${row.username} · ${tierShortLabel(tier.tier)} (tier ${tier.tier}) · ${formatMarkFrac(
                        tier.markFrac
                      )} of marks over ${tier.attempts} attempt${tier.attempts === 1 ? '' : 's'}`}
                    />
                  ))}
                  <HeatCell
                    frac={row.untiered.markFrac}
                    attempts={row.untiered.attempts}
                    title={`${row.username} · questions with no command verb set · ${formatMarkFrac(
                      row.untiered.markFrac
                    )} of marks over ${row.untiered.attempts} attempt${
                      row.untiered.attempts === 1 ? '' : 's'
                    }`}
                  />
                  <td className="px-3 py-1.5 text-right font-mono text-xs font-bold tabular-nums text-[rgb(var(--color-text-primary))] light:text-slate-900">
                    {formatMarkFrac(row.markFrac)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-[10px] tabular-nums text-[rgb(var(--color-text-muted))] light:text-slate-500">
                    B{formatBand(row.avgBand)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] text-[rgb(var(--color-text-dim))] light:text-slate-500">
          Share of available marks, darker is stronger; weakest student first. Read across a row for
          one student&rsquo;s profile, down a column for where the class thins out. A student strong
          on B1&ndash;B3 and weak on B4&ndash;B6 can hold a mid-table overall band, which is what
          this grid exists to surface. &ldquo;n/a&rdquo; means those questions carry no marks;
          &ldquo;&mdash;&rdquo; means nothing attempted. <strong>Untiered</strong> holds attempts on
          questions with no command verb set, so the six tier cells and the row total always account
          for the same attempts.
        </p>
      </section>

      {/* Per-student trajectories */}
      <section>
        <h3 className="text-xs font-bold uppercase tracking-wider text-[rgb(var(--color-text-muted))] light:text-slate-500 mb-3 flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5" />
          Weekly trajectories
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-[rgb(var(--color-border-secondary))]/40 light:bg-slate-200 border border-[rgb(var(--color-border-secondary))] light:border-slate-200 rounded-xl overflow-hidden">
          {rows.map((row) => {
            const trajectory = trajectoryFor.get(row.username);
            const delta = trajectory ? trajectoryDelta(trajectory.points) : null;
            return (
              <div
                key={row.username}
                className="bg-[rgb(var(--color-bg-surface))] light:bg-white px-3 pt-2 pb-1"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-bold text-[rgb(var(--color-text-primary))] light:text-slate-800 truncate">
                    {row.username}
                  </span>
                  <span
                    className={`text-[10px] font-bold tabular-nums shrink-0 ${
                      delta == null
                        ? 'text-[rgb(var(--color-text-dim))] light:text-slate-500'
                        : delta > 0.02
                          ? 'text-emerald-500'
                          : delta < -0.02
                            ? 'text-red-500'
                            : 'text-[rgb(var(--color-text-muted))]'
                    }`}
                  >
                    {delta == null
                      ? 'one week'
                      : `${delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '● '}${Math.round(delta * 100)} pts`}
                  </span>
                </div>
                {trajectory ? (
                  <Trajectory points={trajectory.points} />
                ) : (
                  <div className="h-[34px]" />
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] text-[rgb(var(--color-text-dim))] light:text-slate-500">
          Weekly mark share, oldest week at the left, every panel on the same 0&ndash;100% scale so
          the shapes are comparable. The change is first recorded week to last. A flat line at high
          volume is the case worth chasing: working hard, not improving.
        </p>
      </section>

      <ActivityChart cohort={cohort} days={days} />

      <p className="text-[10px] text-[rgb(var(--color-text-dim))] light:text-slate-500 flex items-start gap-1.5">
        <Users className="w-3 h-3 mt-0.5 shrink-0" />
        <span>
          Aggregated server-side and scoped to the classes you teach — counts and averages only,
          never a student&rsquo;s writing.
        </span>
      </p>
    </div>
  );
};

export default CohortBreakdown;
