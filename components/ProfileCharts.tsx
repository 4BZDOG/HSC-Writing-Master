import React from 'react';
import { Info } from 'lucide-react';
import { BAND_NAMES, getBandConfig, getBandInkRgb, getBandRgb } from '../utils/renderUtils';
import { commandTerms, commandTermsList, TIER_GROUPS, tierShortLabel } from '../data/commandTerms';
import type { PromptVerb } from '../types';
import { foldVerbsIntoTiers, formatBand, type TierProfile } from '../utils/classAnalytics';
import {
  bandRowY,
  bandSeries,
  formatAttemptWhen,
  formatVerbLabel,
  legacyHistoryNotice,
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

/**
 * A card on the profile's desk. Paper, with a real edge and the resting shadow:
 * the cards are where the reading happens, so they are the brightest thing in the
 * body, and they are told apart from the desk by an edge, not by a second white.
 * `border-slate-300` is the edge that survives a bright monitor; the old
 * `slate-200` was the same declaration doing none of that work.
 */
export const PROFILE_CARD =
  'min-w-0 rounded-panel border border-slate-300 bg-surface shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none p-5 sm:p-6';

/**
 * A section heading: sentence case, in the display face (`.t-display`, Inter 900).
 * It is the `t-section` voice without the caps, the italics and the tracking, which
 * set three headings in a row as shouting. Sentence case is the register a
 * heading that divides a panel is meant to have.
 */
export const PROFILE_SECTION_TITLE = 't-display text-base sm:text-lg tracking-tight text-primary';

/** A filled band-coloured surface (bar, dot). The light theme takes the band's `-700` ink,
 *  because its `-500` is too pale to read as a fill on white (yellow is 1.9:1). */
export const BAND_FILL = 'bg-[rgb(var(--band-ink))] dark:bg-[rgb(var(--band-rgb))]';
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
 * Headline figures, as a strip that belongs to the profile's head rather than
 * a box of its own. It sits on the head's band wash, so it has no fill and no
 * border: a hairline between columns from `sm`, and the figure reads first with
 * its caption naming what it counts. Two columns on a phone, four from `sm`.
 */
export const ProfileScoreboard: React.FC<{ cells: ScoreCell[] }> = ({ cells }) => (
  <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4 sm:gap-x-0 sm:gap-y-0 sm:divide-x sm:divide-slate-300 dark:sm:divide-white/10">
    {cells.map((cell) => (
      <div
        key={cell.label}
        title={cell.title}
        className="flex flex-col min-w-0 sm:px-5 sm:first:pl-0"
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

/**
 * The one line that says why there are no history charts, drawn once above where
 * they would be.
 *
 * The charts used to each state it inside their own card, so the same paragraph
 * stood three times in three empty boxes. A card is a claim that there is something
 * to read in it, and there is not, so when there is no history the profile draws
 * this note and no cards at all. The wording stays in `HistoryState`, so the
 * charts and the note cannot drift apart.
 */
export const ProfileHistoryNote: React.FC<{
  history: Exclude<OwnHistory, { status: 'ready' }>;
}> = ({ history }) => (
  <div className="flex items-start gap-3 min-w-0 rounded-panel border border-slate-300 bg-surface shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none p-4 sm:p-5">
    <Info className="w-4 h-4 mt-0.5 shrink-0 text-muted" aria-hidden="true" />
    <div className="min-w-0">
      <HistoryState history={history} />
    </div>
  </div>
);

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
          ? legacyHistoryNotice(questionsAnswered)
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
    (hasAverage ? ` All-time average band ${formatBand(averageBand)}.` : '');

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
                className="stroke-slate-300 dark:stroke-white/10"
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
          {questionsAnswered > bands.length
            ? `${bands.length} of ${questionsAnswered} answers plotted`
            : `${bands.length} marked ${bands.length === 1 ? 'answer' : 'answers'}`}
        </span>
        {hasAverage && (
          <span className="text-[rgb(var(--color-text-secondary))]">
            All-time average {formatBand(averageBand)}{' '}
            <span className="text-muted">(dashed line)</span>
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
  // The full group title, not the one-word short label: "Define" alone reads as
  // the verb DEFINE, and a DESCRIBE answer then looks misfiled. The title is
  // allowed to wrap rather than truncate, so every word of it is on screen; the
  // verbs the tier holds go in the tooltip for anyone who wants the full list.
  const name =
    TIER_GROUPS.find((g) => g.tier === profile.tier)?.title ?? tierShortLabel(profile.tier);
  const verbs = commandTermsList
    .filter((t) => t.tier === profile.tier)
    .map((t) => formatVerbLabel(t.term));
  const description = verbs.length > 0 ? `${name}: ${verbs.join(', ')}` : name;

  return (
    <li className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <span
          title={description}
          className="t-label min-w-0 leading-snug text-[rgb(var(--color-text-secondary))]"
        >
          <span className="font-mono tabular-nums">{profile.tier}</span> {name}
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
            ? 'border border-dashed border-slate-400 dark:border-white/20'
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
export const TierStrengthChart: React.FC<{ history: OwnHistory; questionsAnswered?: number }> = ({
  history,
  questionsAnswered = 0,
}) => {
  if (history.status !== 'ready') return <HistoryState history={history} />;

  const scored = scoredOldestFirst(history.attempts);
  const profiles = foldVerbsIntoTiers(verbAggregates(scored), tierOf);
  if (!profiles.some((p) => p.attempts > 0)) {
    return (
      <HistoryNotice>
        {scored.length === 0 && questionsAnswered > 0
          ? legacyHistoryNotice(questionsAnswered)
          : 'Strength by tier appears once you have marked a response to a question with a command verb.'}
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
export const RecentAttemptsList: React.FC<{ history: OwnHistory; questionsAnswered?: number }> = ({
  history,
  questionsAnswered = 0,
}) => {
  if (history.status !== 'ready') return <HistoryState history={history} />;

  const recent = recentAttempts(history.attempts, 6);
  if (recent.length === 0) {
    return (
      <HistoryNotice>
        {questionsAnswered > 0
          ? legacyHistoryNotice(questionsAnswered)
          : 'No marked responses yet. Each one you mark is listed here, newest first.'}
      </HistoryNotice>
    );
  }

  return (
    <ol
      aria-label="Recent attempts, newest first"
      className="relative space-y-4 before:absolute before:bottom-2 before:left-[0.3125rem] before:top-2 before:w-px before:bg-slate-300 dark:before:bg-white/10"
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
