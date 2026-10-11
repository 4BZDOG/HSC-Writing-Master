import React from 'react';
import { BAND_NAMES, getBandConfig, getBandInkRgb, getBandRgb } from '../utils/renderUtils';
import { commandTerms, tierShortLabel } from '../data/commandTerms';
import type { PromptVerb } from '../types';
import { foldVerbsIntoTiers, formatBand, type TierProfile } from '../utils/classAnalytics';
import {
  bandRowY,
  bandSeries,
  formatAttemptWhen,
  formatVerbLabel,
  plotPoints,
  recentAttempts,
  scoredOldestFirst,
  verbAggregates,
  type OwnHistory,
  type ScoredAttempt,
} from '../utils/profileHistory';

/**
 * The visual vocabulary of the student profile.
 *
 * Band and tier colour comes from `getBandRgb` / `getBandInkRgb` (derived from
 * the single BAND_HEX table) and is handed to the classes below as two custom
 * properties, so no colour is written here by hand:
 *
 *   --band-rgb   the -500 hue: a fill on the dark theme, where it clears the ground
 *   --band-ink   the -700 ink: a fill on the light theme, where -500 is too pale
 *                (yellow-500 is 1.9:1 on white) and -700 clears 4.5:1
 *
 * Text in a band colour uses `getBandConfig(band).text`, which already carries
 * its own light and dark pair.
 */

/** A card. The verb ribbon's idle tier card, so the profile reads as the same family. */
export const PROFILE_CARD =
  'min-w-0 rounded-panel border border-slate-200 dark:border-white/10 bg-white shadow-sm dark:bg-white/[0.03] dark:shadow-none p-5 sm:p-6';

/** A section heading inside the stats tab. */
export const PROFILE_SECTION_TITLE = 't-section text-[rgb(var(--color-text-secondary))]';

/** A filled band-coloured surface (bar, dot). */
const BAND_FILL = 'bg-[rgb(var(--band-ink))] dark:bg-[rgb(var(--band-rgb))]';
/** A band-coloured SVG fill (point). */
const BAND_SVG_FILL = 'fill-[rgb(var(--band-ink))] dark:fill-[rgb(var(--band-rgb))]';

/** The custom properties a band-coloured element reads. */
export const bandVars = (band: number): React.CSSProperties =>
  ({
    '--band-rgb': getBandRgb(band),
    '--band-ink': getBandInkRgb(band),
  }) as React.CSSProperties;

// ---------------------------------------------------------------------------
// Scoreboard
// ---------------------------------------------------------------------------

export interface ScoreCell {
  label: string;
  value: string;
  title?: string;
}

/**
 * Headline figures as a scoreboard: a grid of flat cells divided by hairlines,
 * the same construction as the verb ribbon's stat strip. Two columns on a phone,
 * four from `sm`. The label is a caption and the value is telemetry, so the
 * figure reads first and the caption says what it counts.
 */
export const ProfileScoreboard: React.FC<{ cells: ScoreCell[] }> = ({ cells }) => (
  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-px overflow-hidden rounded-panel border border-slate-200 dark:border-white/10 bg-slate-200 dark:bg-white/10">
    {cells.map((cell) => (
      <div
        key={cell.label}
        title={cell.title}
        className="flex flex-col px-4 sm:px-5 py-3 bg-surface-elevated min-w-0"
      >
        <dt className="t-label text-muted truncate">{cell.label}</dt>
        <dd className="mt-1.5 font-mono text-xl sm:text-2xl font-black tabular-nums leading-none text-primary whitespace-nowrap">
          {cell.value}
        </dd>
      </div>
    ))}
  </dl>
);

// ---------------------------------------------------------------------------
// Shared states
// ---------------------------------------------------------------------------

const HistoryNotice: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-sm leading-relaxed text-secondary">{children}</p>
);

/**
 * What a chart shows when there is no history to draw. Each state says what is
 * missing and what closes the gap, and none of them shows an empty chart that
 * could be read as "no attempts".
 */
export const HistoryState: React.FC<{ history: Exclude<OwnHistory, { status: 'ready' }> }> = ({
  history,
}) => {
  if (history.status === 'loading') {
    return (
      <p role="status" className="text-sm text-muted">
        Loading your history…
      </p>
    );
  }
  if (history.status === 'error') {
    return (
      <HistoryNotice>
        Could not load your history. Your totals above are unchanged; try opening your profile
        again.
      </HistoryNotice>
    );
  }
  return (
    <HistoryNotice>
      Band history is kept in your online account. This copy of the app is not connected to one, so
      only your totals are shown.
    </HistoryNotice>
  );
};

// ---------------------------------------------------------------------------
// Band progress: the band ladder as the y axis
// ---------------------------------------------------------------------------

/** The plot's coordinate space. Its aspect ratio is also the box's, so the HTML
 *  rung labels beside it line up with the SVG's rungs by construction. */
const PLOT_W = 600;
const PLOT_H = 300;
const PAD_X = 14;
const PAD_Y = 22;
const RUNGS = [1, 2, 3, 4, 5, 6];

const rungPct = (band: number): number => (bandRowY(band, PLOT_H, PAD_Y) / PLOT_H) * 100;

const attemptTitle = (a: ScoredAttempt, i: number, n: number): string =>
  `Attempt ${i + 1} of ${n} · ${formatAttemptWhen(a.at)} · ${formatVerbLabel(a.verb)} · Band ${a.band}${
    a.mark !== null && a.totalMarks !== null ? ` · ${a.mark} of ${a.totalMarks} marks` : ''
  }`;

/**
 * Band over time, one point per marked answer, oldest to latest.
 *
 * The y axis is the band ladder itself: six rungs named as the app names them,
 * and each point sits on the rung it earned. Points are coloured by band, so the
 * colour and the rung say the same thing and neither depends on the other. The
 * dashed line is the student's average band, labelled on the chart.
 *
 * A single attempt is drawn as a single point rather than hidden: one mark is
 * already a fact about the student, and the caption says a second one draws the
 * line.
 */
export const BandProgressChart: React.FC<{
  history: OwnHistory;
  averageBand: number | null;
  questionsAnswered: number;
}> = ({ history, averageBand, questionsAnswered }) => {
  if (history.status !== 'ready') return <HistoryState history={history} />;

  const scored = bandSeries(history.attempts);
  if (scored.length === 0) {
    return (
      <HistoryNotice>
        {questionsAnswered > 0
          ? 'Band history starts with your next marked answer, so earlier answers are not plotted.'
          : 'Mark a response to a question and its band is plotted here, one point per answer.'}
      </HistoryNotice>
    );
  }

  const bands = scored.map((a) => a.band);
  const coords = plotPoints(bands, { width: PLOT_W, height: PLOT_H, padX: PAD_X, padY: PAD_Y });
  const polyline = coords.map((p) => `${p.x},${p.y}`).join(' ');
  const first = bands[0];
  const last = bands[bands.length - 1];
  const delta = Math.round(last - first);
  const tone =
    delta > 0
      ? 'text-emerald-700 dark:text-emerald-400'
      : delta < 0
        ? 'text-red-700 dark:text-red-400'
        : 'text-secondary';
  const hasAverage = averageBand !== null && Number.isFinite(averageBand) && averageBand > 0;
  const avgY = hasAverage ? bandRowY(averageBand, PLOT_H, PAD_Y) : 0;

  const summary =
    `Band progress across ${bands.length} marked ${bands.length === 1 ? 'answer' : 'answers'}, oldest to latest: ${bands.join(', ')}.` +
    (hasAverage ? ` Average band ${formatBand(averageBand)}.` : '');

  return (
    <div>
      <div className="grid grid-cols-[4.25rem_minmax(0,1fr)] sm:grid-cols-[6rem_minmax(0,1fr)] gap-x-3">
        {/* The ladder's rungs. This column stretches to the height of the plot
            beside it, so a rung's percentage is the same height as the plot's. */}
        <div className="relative">
          {RUNGS.map((band) => {
            const cfg = getBandConfig(band);
            return (
              <div
                key={band}
                className="absolute left-0 right-0 -translate-y-1/2 leading-tight"
                style={{ top: `${rungPct(band)}%` }}
              >
                <span className={`t-label block ${cfg.text}`}>Band {band}</span>
                <span className="t-label hidden sm:block text-muted">{BAND_NAMES[band]}</span>
              </div>
            );
          })}
        </div>

        <div className="relative min-w-0" style={{ aspectRatio: `${PLOT_W} / ${PLOT_H}` }}>
          <svg
            viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
            role="img"
            aria-label={summary}
            className="absolute inset-0 h-full w-full overflow-visible"
          >
            {RUNGS.map((band) => (
              <line
                key={band}
                x1={0}
                x2={PLOT_W}
                y1={bandRowY(band, PLOT_H, PAD_Y)}
                y2={bandRowY(band, PLOT_H, PAD_Y)}
                strokeWidth={1}
                className="stroke-slate-200 dark:stroke-white/10"
              />
            ))}
            {hasAverage && (
              <line
                x1={0}
                x2={PLOT_W}
                y1={avgY}
                y2={avgY}
                strokeWidth={1.5}
                strokeDasharray="6 6"
                className="stroke-[rgb(var(--color-text-muted))]"
              />
            )}
            {coords.length > 1 && (
              <polyline
                points={polyline}
                fill="none"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                className="stroke-[rgb(var(--color-accent))]"
              />
            )}
            {coords.map((p, i) => (
              <g key={i} style={bandVars(bands[i])}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={6}
                  strokeWidth={2}
                  className={`${BAND_SVG_FILL} stroke-[rgb(var(--color-bg-surface))]`}
                >
                  <title>{attemptTitle(scored[i], i, scored.length)}</title>
                </circle>
              </g>
            ))}
          </svg>
        </div>

        <div />
        <div className="mt-1.5 flex justify-between t-label text-muted">
          <span>Oldest</span>
          <span>Latest</span>
        </div>
      </div>

      <p className="mt-4 t-label text-[rgb(var(--color-text-secondary))] flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>
          Band {first} → {last}
        </span>
        <span className={`font-bold ${tone}`}>
          {delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : '● no change'}
        </span>
        <span className="text-muted">
          {bands.length} marked {bands.length === 1 ? 'answer' : 'answers'}
        </span>
        {hasAverage && (
          <span className="text-[rgb(var(--color-text-secondary))]">
            Average {formatBand(averageBand)} <span className="text-muted">(dashed line)</span>
          </span>
        )}
      </p>
      {bands.length === 1 && (
        <p className="mt-1 text-xs text-muted">
          One marked answer so far. A second one draws the line.
        </p>
      )}

      {/* The same points as data, for a screen reader or anyone who wants the
          numbers. The SVG's label summarises it; this names each attempt. */}
      <table className="sr-only">
        <caption>Band history, one row per marked answer, oldest first</caption>
        <thead>
          <tr>
            <th scope="col">Attempt</th>
            <th scope="col">When</th>
            <th scope="col">Command verb</th>
            <th scope="col">Band</th>
            <th scope="col">Marks</th>
          </tr>
        </thead>
        <tbody>
          {scored.map((a, i) => (
            <tr key={`${a.at}-${i}`}>
              <td>{i + 1}</td>
              <td>{formatAttemptWhen(a.at)}</td>
              <td>{formatVerbLabel(a.verb)}</td>
              <td>{a.band}</td>
              <td>
                {a.mark !== null && a.totalMarks !== null
                  ? `${a.mark} of ${a.totalMarks}`
                  : 'Not recorded'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Strength by command tier
// ---------------------------------------------------------------------------

const tierOf = (verb: string): number | null => commandTerms.get(verb as PromptVerb)?.tier ?? null;

const TierRow: React.FC<{ profile: TierProfile }> = ({ profile }) => {
  const untried = profile.attempts === 0;
  const pct = profile.markFrac === null ? null : Math.round(profile.markFrac * 100);
  const tries = `${profile.attempts} ${profile.attempts === 1 ? 'try' : 'tries'}`;

  return (
    <li className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="t-label text-[rgb(var(--color-text-secondary))] truncate">
          <span className="font-mono tabular-nums">{profile.tier}</span>{' '}
          {tierShortLabel(profile.tier)}
        </span>
        {untried ? (
          <span className="t-label text-right text-muted whitespace-nowrap">Not attempted</span>
        ) : (
          <span className="flex items-baseline gap-2 whitespace-nowrap">
            <span className="font-mono text-sm font-bold tabular-nums text-primary">
              {pct === null ? 'No marks' : `${pct}%`}
            </span>
            <span className="t-label tabular-nums text-muted">{tries}</span>
          </span>
        )}
      </div>
      <div
        className={`mt-1.5 h-2.5 rounded-full overflow-hidden ${
          untried
            ? 'border border-dashed border-slate-300 dark:border-white/20'
            : 'bg-slate-200 dark:bg-white/10'
        }`}
      >
        {pct !== null && (
          <div
            className={`h-full rounded-full ${BAND_FILL}`}
            style={{ width: `${Math.min(100, Math.max(0, pct))}%`, ...bandVars(profile.tier) }}
          />
        )}
      </div>
    </li>
  );
};

/**
 * Share of the marks on offer, by cognitive tier, from the same fold the admin
 * Student Progress view uses.
 *
 * It plots the mark share, not the band, and says so. A verb caps the band it can
 * reach, so a band plotted against tier is a rising staircase for every student,
 * flawless or failing; the marks are the fair measure of how well each verb was
 * answered.
 */
export const TierStrengthChart: React.FC<{ history: OwnHistory }> = ({ history }) => {
  if (history.status !== 'ready') return <HistoryState history={history} />;

  const profiles = foldVerbsIntoTiers(verbAggregates(scoredOldestFirst(history.attempts)), tierOf);
  if (!profiles.some((p) => p.attempts > 0)) {
    return (
      <HistoryNotice>
        Strength by tier appears once you have marked a response to a question with a command verb.
      </HistoryNotice>
    );
  }

  return (
    <div>
      <ul aria-label="Share of marks earned, by command tier" className="space-y-3">
        {profiles.map((p) => (
          <TierRow key={p.tier} profile={p} />
        ))}
      </ul>
      <p className="mt-4 text-xs leading-relaxed text-muted">
        Share of the marks on offer. A command verb caps the band it can reach, so this reads marks
        rather than bands.
      </p>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Recent attempts
// ---------------------------------------------------------------------------

/** The latest marked answers, newest first, on a rail the band colours sit on. */
export const RecentAttemptsList: React.FC<{ history: OwnHistory }> = ({ history }) => {
  if (history.status !== 'ready') return <HistoryState history={history} />;

  const recent = recentAttempts(history.attempts, 6);
  if (recent.length === 0) {
    return (
      <HistoryNotice>
        No marked responses yet. Each one you mark is listed here, newest first.
      </HistoryNotice>
    );
  }

  return (
    <ol
      aria-label="Recent attempts, newest first"
      className="relative space-y-4 before:absolute before:bottom-2 before:left-[0.3125rem] before:top-2 before:w-px before:bg-slate-200 dark:before:bg-white/10"
    >
      {recent.map((a, i) => {
        const cfg = getBandConfig(a.band);
        return (
          <li key={`${a.at}-${i}`} className="relative min-w-0 pl-6">
            <span
              aria-hidden="true"
              className={`absolute left-0 top-1 h-2.5 w-2.5 rounded-full ${BAND_FILL}`}
              style={bandVars(a.band)}
            />
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-semibold text-primary">{formatVerbLabel(a.verb)}</span>
              <span
                className={`t-label px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}
              >
                Band {a.band}
              </span>
              {a.mark !== null && a.totalMarks !== null && (
                <span className="font-mono text-xs tabular-nums text-[rgb(var(--color-text-secondary))]">
                  {a.mark}/{a.totalMarks}
                </span>
              )}
            </div>
            <p className="mt-0.5 t-label text-muted">{formatAttemptWhen(a.at)}</p>
          </li>
        );
      })}
    </ol>
  );
};
