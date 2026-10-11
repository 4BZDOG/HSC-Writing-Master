/**
 * Pure builders for the progress report (projectDocs/Plan-ProgressReportPdf.md,
 * "Data side"). Each one turns data the app already holds into a `ProgressReport`,
 * the contract in `pdf/reportModel.ts` that the print side draws:
 *
 *   - a student's own answers (or, offline, their stored totals) → buildStudentReport
 *   - a teacher's or a school's `get_progress_report()` payload → buildTeacherReport / buildSchoolReport
 *
 * The data side aggregates, filters and names. It never lays anything out. The
 * human strings the model asks for are made here: the window label, the trend
 * caption, the result-strip values ("84%", "4.3k") and the notes. Unknown values
 * are null, never NaN or undefined.
 *
 * Tiers are folded by the functions the screens use (`foldVerbsIntoTiers`,
 * `buildCohortRows`), and rows are ordered by `rankByWeakness`, so a number in the
 * report cannot disagree with the same number on screen.
 *
 * No React and no network, so every rule here is unit-tested on its own.
 */
import type { PromptVerb, UserStats } from '../types';
import type {
  ProgressReport,
  ReportAttemptRow,
  ReportAudience,
  ReportBreakdownRow,
  ReportClassRow,
  ReportScope,
  ReportSections,
  ReportStat,
  ReportStudentRow,
  ReportSubject,
  ReportTierRow,
  ReportTrendPoint,
} from '../pdf/reportModel';
import { commandTerms, tierShortLabel } from '../data/commandTerms';
import type {
  CohortWeekRow,
  DimensionAnalytics,
  ProgressReportPayload,
  ProgressReportWeekRow,
} from '../services/responseService';
import {
  buildCohortRows,
  COGNITIVE_TIERS,
  foldVerbsIntoTiers,
  formatBand,
  formatMarkFrac,
  rankByWeakness,
  type TierProfile,
} from './classAnalytics';
import {
  formatVerbLabel,
  markShare,
  REPORT_HISTORY_LIMIT,
  scoredOldestFirst,
  verbAggregates,
  withStatDefaults,
  type OwnAttempt,
  type OwnAttemptCourse,
  type ScoredAttempt,
} from './profileHistory';

// --- Inputs ------------------------------------------------------------------

/** The course a report is narrowed to. `id` is the app-facing course id. */
export interface ReportCourseFilter {
  id: string;
  name: string;
}

/** Everything the user chose in the report's options panel, plus the report's own clock. */
export interface ReportOptions {
  /** Which report. The builder's name also decides it; this is the UI's own copy. */
  audience: ReportAudience;
  /** Days back from `generatedAt`, or 'all' (the student report only). */
  windowDays: number | 'all';
  courseFilter: ReportCourseFilter | null;
  /** The class a teacher or school report is limited to, by name, or null. */
  className: string | null;
  /** Off replaces every student's name with "Student n". */
  includeStudentNames: boolean;
  sections: ReportSections;
  subject: ReportSubject;
  /** ISO timestamp. Window edges and week starts are computed from it. */
  generatedAt: string;
}

// --- Constants ---------------------------------------------------------------

/** The most recent answers the "recent attempts" table lists. */
export const REPORT_ROW_CAP = 25;

/** How many of the latest weeks a student's sparkline draws. */
export const SPARKLINE_WEEKS = 12;

export const STUDENT_TREND_CAPTION = 'Each point is one marked answer, oldest first.';
export const COHORT_TREND_CAPTION = "Each point is one week's mean band, oldest first.";
export const NO_TREND_CAPTION = 'No marked answers in this period to plot yet.';
export const LOCAL_TREND_CAPTION = 'Progress over time is kept for signed-in accounts.';

/** Why mark share, not band, is the measure the report leads with. */
export const BAND_CAP_NOTE =
  'A command verb caps the band. A question that asks for recall cannot score above Band 1, so bands are not comparable across verbs. Judge a question by the share of marks earned.';

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

// --- Formatting --------------------------------------------------------------

/** A fraction (0–1) as a whole percentage, "84%", or an em dash when unknown. */
export const formatPercent = (fraction: number | null | undefined): string =>
  formatMarkFrac(fraction);

const trimPoint = (s: string): string => s.replace(/\.0$/, '');

/**
 * A count for the result strip: "25", "999", "4.3k", "1.2M". Rounds to one decimal
 * place above a thousand, and reads any unknown or negative input as zero.
 */
export const formatCount = (n: number | null | undefined): string => {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return '0';
  if (n < 999.5) return String(Math.round(n));
  if (n < 999_950) return `${trimPoint((n / 1000).toFixed(1))}k`;
  return `${trimPoint((n / 1_000_000).toFixed(1))}M`;
};

/** The window the report covers, in the words the page prints. */
export const formatWindowLabel = (windowDays: number | 'all'): string => {
  if (windowDays === 'all') return 'All time';
  if (windowDays === 365) return 'Last 12 months';
  return windowDays === 1 ? 'Last 1 day' : `Last ${windowDays} days`;
};

// --- Shared helpers ----------------------------------------------------------

const finiteOrNull = (n: number | null | undefined): number | null =>
  typeof n === 'number' && Number.isFinite(n) ? n : null;

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** The band a headline value is drawn in: the nearest whole band, 1–6. */
const bandForColour = (band: number | null): number | undefined =>
  band === null ? undefined : Math.min(6, Math.max(1, Math.round(band)));

/** A date for a note, in Sydney time, as "12 Aug 2026". */
const noteDate = (ms: number): string =>
  new Date(ms).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Australia/Sydney',
  });

/**
 * The cognitive tier (1–6) of a command verb, or null for an unknown or missing one.
 *
 * The exact lookup the screens use (`tierOf` in ClassInsightsModal and
 * StudentProgressModal), with no case folding: a verb the screens cannot tier is
 * untiered here too, so a tier in the report cannot disagree with one on screen.
 * The student's own verbs are already uppercased when they are read.
 */
export const verbTier = (label: string): number | null =>
  commandTerms.get(label as PromptVerb)?.tier ?? null;

/** The reference "now" for the report. Falls back to the clock only for an unreadable stamp. */
const nowMs = (generatedAt: string): number => {
  const parsed = Date.parse(generatedAt);
  return Number.isFinite(parsed) ? parsed : Date.now();
};

/** Whether an attempt belongs to the course the user picked, matched the way the app maps course ids. */
export const courseMatches = (
  course: OwnAttemptCourse | null,
  filter: ReportCourseFilter
): boolean =>
  course !== null && ((course.legacyId || course.id) === filter.id || course.id === filter.id);

/** The six tier rows, always in full, from folded profiles. */
const tierRowsOf = (profiles: TierProfile[]): ReportTierRow[] =>
  profiles.map((p) => ({
    tier: p.tier,
    label: tierShortLabel(p.tier),
    attempts: p.attempts,
    markShare: p.markFrac,
  }));

const emptyTierRows = (): ReportTierRow[] =>
  COGNITIVE_TIERS.map((tier) => ({
    tier,
    label: tierShortLabel(tier),
    attempts: 0,
    markShare: null,
  }));

/**
 * Weakest first by share of marks lost, the order the Class Insights screen uses.
 * Built on `rankByWeakness` so the two cannot drift. A row keeps its sublabel
 * through the round trip, and a suffix keeps duplicate names apart.
 */
const weakestFirst = (rows: ReportBreakdownRow[]): ReportBreakdownRow[] => {
  const byKey = new Map<string, ReportBreakdownRow>();
  const dims: DimensionAnalytics[] = rows.map((row, i) => {
    const key = `${row.label}\u0001${row.sublabel ?? ''}\u0001${i}`;
    byKey.set(key, row);
    return {
      label: key,
      attempts: row.attempts,
      students: row.students ?? 0,
      avg_mark: null,
      avg_band: row.avgBand,
      low_band_rate: 0,
      avg_mark_frac: row.markShare,
    };
  });
  return rankByWeakness(dims).flatMap((ranked) => {
    const row = byKey.get(ranked.label);
    return row ? [row] : [];
  });
};

interface Bucket {
  label: string;
  sublabel?: string;
  attempts: number;
  bandSum: number;
  bandCount: number;
  shareSum: number;
  shareCount: number;
}

/** Groups scored answers into breakdown rows, then orders them weakest first. */
const breakdownOf = (
  attempts: ScoredAttempt[],
  keyOf: (a: ScoredAttempt) => { key: string; label: string; sublabel?: string }
): ReportBreakdownRow[] => {
  const buckets = new Map<string, Bucket>();
  for (const a of attempts) {
    const { key, label, sublabel } = keyOf(a);
    const bucket: Bucket = buckets.get(key) ?? {
      label,
      ...(sublabel ? { sublabel } : {}),
      attempts: 0,
      bandSum: 0,
      bandCount: 0,
      shareSum: 0,
      shareCount: 0,
    };
    bucket.attempts += 1;
    bucket.bandSum += a.band;
    bucket.bandCount += 1;
    const share = markShare(a);
    if (share !== null) {
      bucket.shareSum += share;
      bucket.shareCount += 1;
    }
    buckets.set(key, bucket);
  }
  return weakestFirst(
    [...buckets.values()].map((b) => ({
      label: b.label,
      ...(b.sublabel ? { sublabel: b.sublabel } : {}),
      attempts: b.attempts,
      avgBand: b.bandCount > 0 ? b.bandSum / b.bandCount : null,
      markShare: b.shareCount > 0 ? b.shareSum / b.shareCount : null,
    }))
  );
};

const windowStartMs = (generatedAt: string, windowDays: number | 'all'): number =>
  windowDays === 'all' ? Number.NEGATIVE_INFINITY : nowMs(generatedAt) - windowDays * DAY_MS;

// --- Student report ----------------------------------------------------------

export interface StudentReportInput {
  /** The stored running totals (`user.stats`). Used alone when there is no history. */
  stats: Partial<UserStats> | undefined;
  /** The caller's answers from `fetchMyReportHistory()`, or null when there is no online account to read. */
  history: OwnAttempt[] | null;
  options: ReportOptions;
}

/**
 * The student's own progress report.
 *
 * With history: every figure comes from the answers in scope (the course and the
 * period the user chose), so the page never mixes a filtered number with an
 * all-time one. Words are the only figure that can come from the totals, and only
 * when nothing is filtered. The streak is a totals-only figure, so it is printed
 * only when nothing is filtered.
 *
 * Without history (local mode, or a signed-in account with no answers in history):
 * the report shows the stored totals and says why, because the course and period
 * need the history to apply.
 */
export const buildStudentReport = ({
  stats,
  history,
  options,
}: StudentReportInput): ProgressReport => {
  const sections: ReportSections = { ...options.sections };
  const s = withStatDefaults(stats);
  if (history === null || history.length === 0) {
    return studentFromTotals(s, history, options, sections);
  }
  return studentFromHistory(s, history, options, sections);
};

const studentFromTotals = (
  s: UserStats,
  history: OwnAttempt[] | null,
  options: ReportOptions,
  sections: ReportSections
): ProgressReport => {
  const answered = Math.max(0, Math.trunc(s.questionsAnswered));
  const hasAnswers = answered > 0;
  const shareKnown = (s.markShareCount ?? 0) > 0 && Number.isFinite(s.markShareMean);
  const filtered = options.courseFilter !== null || options.windowDays !== 'all';

  const notes: string[] = [
    history === null
      ? 'Answer history is kept for signed-in accounts. This copy has no online history, so these figures are your running totals for all time.'
      : 'You have no marked answers in your history yet, so these figures are your running totals for all time.',
  ];
  if (filtered) {
    notes.push(
      'The course and period you chose need your answer history, so they are not applied to these totals.'
    );
  }

  return {
    audience: 'student',
    title: 'Progress report',
    subject: options.subject,
    scope: {
      courseName: null,
      windowLabel: 'All time',
      className: null,
      firstAttemptAt: null,
      lastAttemptAt: null,
    },
    generatedAt: options.generatedAt,
    headline: [
      { label: 'Answers marked', value: formatCount(answered), hint: 'all time' },
      {
        label: 'Avg mark share',
        value: shareKnown ? formatPercent(s.markShareMean) : '—',
        hint: 'of the marks on offer',
      },
      {
        label: 'Avg band',
        value: hasAnswers ? formatBand(s.averageBand) : '—',
        band: hasAnswers ? bandForColour(s.averageBand) : undefined,
      },
      { label: 'Words written', value: formatCount(s.totalWordsWritten), hint: 'all time' },
      {
        label: 'Streak',
        value: String(Math.max(0, Math.trunc(s.streakDays))),
        hint: 'days in a row',
      },
    ],
    trend: [],
    trendCaption: LOCAL_TREND_CAPTION,
    averageBand: null,
    tiers: emptyTierRows(),
    byCourse: [],
    byTopic: [],
    byVerb: [],
    ...(sections.recent ? { recent: [] } : {}),
    anonymised: false,
    notes,
    sections,
  };
};

const studentFromHistory = (
  s: UserStats,
  history: OwnAttempt[],
  options: ReportOptions,
  sections: ReportSections
): ProgressReport => {
  const { courseFilter, windowDays } = options;
  const unfiltered = courseFilter === null && windowDays === 'all';
  const start = windowStartMs(options.generatedAt, windowDays);

  const inScope = history.filter(
    (a) =>
      Date.parse(a.at) >= start &&
      (courseFilter === null || courseMatches(a.course ?? null, courseFilter))
  );
  const scored = scoredOldestFirst(inScope);

  const bandMean = mean(scored.map((a) => a.band));
  const shareMean = mean(scored.map(markShare).filter((v): v is number => v !== null));
  const words = unfiltered
    ? Math.max(0, s.totalWordsWritten)
    : inScope.reduce((sum, a) => sum + a.wordCount, 0);
  const hint = unfiltered ? 'all time' : 'in this report';

  const headline: ReportStat[] = [
    { label: 'Answers marked', value: formatCount(scored.length), hint },
    {
      label: 'Avg mark share',
      value: shareMean === null ? '—' : formatPercent(shareMean),
      hint: 'of the marks on offer',
    },
    {
      label: 'Avg band',
      value: bandMean === null ? '—' : formatBand(bandMean),
      band: bandForColour(bandMean),
    },
    { label: 'Words written', value: formatCount(words), hint },
    ...(unfiltered
      ? [
          {
            label: 'Streak',
            value: String(Math.max(0, Math.trunc(s.streakDays))),
            hint: 'days in a row',
          },
        ]
      : []),
  ];

  const trend: ReportTrendPoint[] = scored.map((a) => ({ at: a.at, band: a.band, attempts: 1 }));

  const byVerb = breakdownOf(scored, (a) => {
    const key = a.verb ?? 'UNSPECIFIED';
    const tier = verbTier(key);
    return {
      key,
      label: formatVerbLabel(key),
      sublabel: tier === null ? undefined : `Tier ${tier}`,
    };
  });
  const byCourse = breakdownOf(scored, (a) => ({
    key: a.course ? a.course.legacyId || a.course.id || a.course.name || 'course' : 'none',
    label: a.course?.name ?? 'Course not recorded',
  }));
  const byTopic = breakdownOf(scored, (a) => ({
    key: `${a.course?.legacyId || a.course?.id || 'none'}\u0001${a.topic?.name ?? ''}`,
    label: a.topic?.name ?? 'Topic not recorded',
    sublabel: a.course?.name ?? undefined,
  }));

  const recent: ReportAttemptRow[] = [...scored]
    .reverse()
    .slice(0, REPORT_ROW_CAP)
    .map((a) => ({
      at: a.at,
      course: a.course?.name ?? null,
      topic: a.topic?.name ?? null,
      verb: a.verb === null ? null : formatVerbLabel(a.verb),
      mark: a.mark,
      totalMarks: a.totalMarks,
      band: a.band,
    }));

  const notes: string[] = [];
  if (scored.length === 0) {
    const scope =
      courseFilter !== null && windowDays !== 'all'
        ? 'this course and period'
        : courseFilter !== null
          ? 'this course'
          : windowDays !== 'all'
            ? 'this period'
            : null;
    notes.push(scope ? `No marked answers match ${scope}.` : 'No marked answers yet.');
  } else {
    notes.push(BAND_CAP_NOTE);
  }
  if (history.length >= REPORT_HISTORY_LIMIT) {
    notes.push(
      `Only your latest ${REPORT_HISTORY_LIMIT.toLocaleString('en-AU')} answers are included, so the oldest may be missing.`
    );
  } else if (unfiltered && s.questionsAnswered > history.length) {
    const earliest = Math.min(...history.map((a) => Date.parse(a.at)));
    notes.push(
      `Answer history starts on ${noteDate(earliest)}. Answers marked before then count in your totals but not in this report.`
    );
  }
  if (scored.length > REPORT_ROW_CAP) {
    notes.push(
      `The recent list shows the latest ${REPORT_ROW_CAP} of ${scored.length} marked answers. The summary and breakdowns cover all of them.`
    );
  }

  return {
    audience: 'student',
    title: 'Progress report',
    subject: options.subject,
    scope: {
      courseName: courseFilter?.name ?? null,
      windowLabel: formatWindowLabel(windowDays),
      className: null,
      firstAttemptAt: scored[0]?.at ?? null,
      lastAttemptAt: scored[scored.length - 1]?.at ?? null,
    },
    generatedAt: options.generatedAt,
    headline,
    trend,
    trendCaption: scored.length > 0 ? STUDENT_TREND_CAPTION : NO_TREND_CAPTION,
    averageBand: bandMean,
    tiers: tierRowsOf(foldVerbsIntoTiers(verbAggregates(scored), verbTier)),
    byCourse,
    byTopic,
    byVerb,
    ...(sections.recent ? { recent } : {}),
    anonymised: false,
    notes,
    sections,
  };
};

// --- Teacher and school reports ----------------------------------------------

export interface RosterReportInput {
  payload: ProgressReportPayload;
  options: ReportOptions;
  /** Verb → cognitive tier. Defaults to the command-term table, which the screens use too. */
  tierOf?: (label: string) => number | null;
}

/** A week-indexed series for one student, `weeks` long, with gaps as null. */
const weekSeries = (rows: CohortWeekRow[], weeks: number): (number | null)[] => {
  const series: (number | null)[] = Array.from({ length: weeks }, () => null);
  for (const row of rows) {
    if (row.week >= 0 && row.week < weeks) series[row.week] = finiteOrNull(row.avg_band);
  }
  return series;
};

const roster = (
  audience: 'teacher' | 'school',
  { payload, options, tierOf = verbTier }: RosterReportInput
): ProgressReport => {
  const sections: ReportSections = { ...options.sections };
  const totals = payload.totals;
  const attempts = Math.max(0, totals.attempts);
  const days =
    payload.days > 0 ? payload.days : options.windowDays === 'all' ? 365 : options.windowDays;
  const weeks = payload.weeks > 0 ? payload.weeks : Math.ceil(days / 7);
  const anonymised = !options.includeStudentNames;
  const windowStart = nowMs(options.generatedAt) - days * DAY_MS;
  const weekStart = (week: number): string => new Date(windowStart + week * WEEK_MS).toISOString();

  // Cohort trend: one point per week, oldest first, with gaps as null.
  const weekRows = new Map<number, ProgressReportWeekRow>(
    payload.weekly.map((row) => [row.week, row])
  );
  const trend: ReportTrendPoint[] =
    attempts > 0
      ? Array.from({ length: weeks }, (_, week) => {
          const row = weekRows.get(week);
          return {
            at: weekStart(week),
            band: finiteOrNull(row?.avg_band),
            attempts: row?.attempts ?? 0,
          };
        })
      : [];

  // Students: the Class Insights order (weakest first), each with a sparkline and a band change.
  const byName = new Map(payload.byStudent.map((s) => [s.username, s]));
  const numberOf = new Map(
    [...payload.byStudent]
      .sort((a, b) => a.username.localeCompare(b.username))
      .map((s, i) => [s.username, i + 1])
  );
  const weeksByUser = new Map<string, CohortWeekRow[]>();
  for (const row of payload.byStudentWeek) {
    weeksByUser.set(row.username, [...(weeksByUser.get(row.username) ?? []), row]);
  }
  const studentRows: ReportStudentRow[] = buildCohortRows(payload.byStudentVerb, tierOf).flatMap(
    (tierRow) => {
      const s = byName.get(tierRow.username);
      if (!s) return [];
      const series = weekSeries(weeksByUser.get(tierRow.username) ?? [], weeks);
      const recorded = series.filter((v): v is number => v !== null);
      return [
        {
          name: anonymised
            ? `Student ${numberOf.get(tierRow.username) ?? 0}`
            : s.display_name.trim() || s.username,
          attempts: s.attempts,
          avgBand: finiteOrNull(s.avg_band),
          markShare: finiteOrNull(s.avg_mark_frac),
          bandChange:
            recorded.length >= 2 ? round2(recorded[recorded.length - 1] - recorded[0]) : null,
          sparkline: series.slice(-SPARKLINE_WEEKS),
          lastActiveAt: s.last_active,
          tierShares: tierRow.tiers.map((tier) => tier.markFrac),
        },
      ];
    }
  );

  // School only: one row per class the caller can see. Absent when a class is named.
  const classRows: ReportClassRow[] | undefined =
    audience === 'school' && sections.classes && payload.byClass !== undefined
      ? payload.byClass.map((c) => ({
          name: c.name,
          year: c.year ?? null,
          students: c.students,
          attempts: c.attempts,
          avgBand: finiteOrNull(c.avg_band),
          markShare: finiteOrNull(c.avg_mark_frac),
        }))
      : undefined;
  const classesWithAnswers = (payload.byClass ?? []).filter((c) => c.students > 0).length;

  const notes: string[] = [];
  if (attempts === 0) {
    notes.push(
      'No marked answers in these classes for this period. Try a longer period, or clear the course filter.'
    );
  } else {
    notes.push(
      'Each question counts once, at the latest marked answer, as on the Class Insights screen.'
    );
    notes.push(BAND_CAP_NOTE);
    if (sections.students)
      notes.push('Students are listed weakest first by share of marks earned.');
  }
  if (classRows !== undefined && classRows.length > 0) {
    notes.push(
      'A student enrolled in more than one class is counted in each of those classes, so the class rows can add up to more than the school total.'
    );
  }
  if (anonymised) {
    notes.push(
      'Student names are replaced by numbers, and each number is the same in every table.'
    );
  }

  return {
    audience,
    title: audience === 'school' ? 'School report' : 'Class report',
    subject: options.subject,
    scope: {
      courseName: options.courseFilter?.name ?? null,
      windowLabel: formatWindowLabel(days),
      className: options.className,
      firstAttemptAt: totals.first_attempt_at,
      lastAttemptAt: totals.last_attempt_at,
    },
    generatedAt: options.generatedAt,
    headline: [
      {
        label: 'Students',
        value: formatCount(totals.active_students),
        hint: 'with a marked answer',
      },
      ...(audience === 'school' && payload.byClass !== undefined
        ? [
            {
              label: 'Classes',
              value: formatCount(classesWithAnswers),
              hint: 'with a marked answer',
            },
          ]
        : []),
      { label: 'Answers marked', value: formatCount(attempts), hint: 'latest answer per question' },
      {
        label: 'Avg mark share',
        value: formatPercent(totals.avg_mark_frac),
        hint: 'of the marks on offer',
      },
      {
        label: 'Avg band',
        value: formatBand(totals.avg_band),
        band: bandForColour(finiteOrNull(totals.avg_band)),
      },
    ],
    trend,
    trendCaption: attempts > 0 ? COHORT_TREND_CAPTION : NO_TREND_CAPTION,
    averageBand: finiteOrNull(totals.avg_band),
    tiers: tierRowsOf(
      foldVerbsIntoTiers(
        payload.byVerb.map((v) => ({
          label: v.label,
          attempts: v.attempts,
          avg_band: v.avg_band,
          avg_mark_frac: v.avg_mark_frac,
        })),
        tierOf
      )
    ),
    byCourse: weakestFirst(
      payload.byCourse.map((c) => ({
        label: c.label,
        attempts: c.attempts,
        students: c.students,
        avgBand: finiteOrNull(c.avg_band),
        markShare: finiteOrNull(c.avg_mark_frac),
      }))
    ),
    byTopic: weakestFirst(
      payload.byTopic.map((t) => ({
        label: t.label,
        sublabel: t.course,
        attempts: t.attempts,
        students: t.students,
        avgBand: finiteOrNull(t.avg_band),
        markShare: finiteOrNull(t.avg_mark_frac),
      }))
    ),
    byVerb: weakestFirst(
      payload.byVerb.map((v) => {
        const tier = tierOf(v.label);
        return {
          label: formatVerbLabel(v.label.trim().toUpperCase()),
          ...(tier === null ? {} : { sublabel: `Tier ${tier}` }),
          attempts: v.attempts,
          students: v.students,
          avgBand: finiteOrNull(v.avg_band),
          markShare: finiteOrNull(v.avg_mark_frac),
        };
      })
    ),
    ...(sections.students ? { students: studentRows } : {}),
    ...(classRows ? { classes: classRows } : {}),
    anonymised,
    notes,
    sections,
  };
};

/** The teacher's class report, from the `get_progress_report()` payload. */
export const buildTeacherReport = (input: RosterReportInput): ProgressReport =>
  roster('teacher', input);

/** The administrator's school report, from the same payload, with the class table. */
export const buildSchoolReport = (input: RosterReportInput): ProgressReport =>
  roster('school', input);
