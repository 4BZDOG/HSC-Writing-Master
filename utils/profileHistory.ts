import type { UserStats } from '../types';
import type { VerbAggregate } from './classAnalytics';

/**
 * Pure shaping for the student's own profile (UserProfileModal and its charts).
 *
 * WHAT THE PROFILE HAS TO DRAW FROM. `user.stats` holds running totals only — no
 * history. The per-attempt history lives in the `response_events` table (one
 * append-only row per marked answer, with the question's verb and marks joined
 * on). A student can read their own rows under the same RLS policy the
 * reviewers use, so the profile reads that table directly; this file turns the
 * rows into the shapes the charts draw.
 *
 * Nothing here touches the network or React, so every rule below is unit-tested.
 */

/** The history the progress report reads, when a student asks for every answer. */
export const REPORT_HISTORY_LIMIT = 1000;

/** The course a question belongs to, as far as the signed-in reader can see it. */
export interface OwnAttemptCourse {
  /** The database row id. */
  id: string | null;
  /** The app-facing id the course carries when it was seeded from the syllabus. */
  legacyId: string | null;
  name: string | null;
}

/** The topic a question belongs to, and the course that topic sits in. */
export interface OwnAttemptTopic {
  name: string | null;
  course: OwnAttemptCourse | null;
}

/** One marked answer, as the profile needs it. */
export interface OwnAttempt {
  /** ISO timestamp of the attempt. */
  at: string;
  /** Overall band, or null when the attempt carries none. */
  band: number | null;
  /** Marks awarded, or null when not recorded. */
  mark: number | null;
  /** The question's total marks, when the question still exists and has marks. */
  totalMarks: number | null;
  /** The question's command verb, uppercase, or null when it has none. */
  verb: string | null;
  wordCount: number;
  /**
   * The question's course. Set only when mapped with `{ curriculum: true }`
   * (the progress report's read); absent on the profile's read. Null when the
   * question or its course is not visible to the reader.
   */
  course?: OwnAttemptCourse | null;
  /** The question's topic, under the same rule as `course`. */
  topic?: OwnAttemptTopic | null;
}

/** An attempt that has a band — the only kind a band chart can plot. */
export type ScoredAttempt = OwnAttempt & { band: number };

/** One row of `response_events`, with the question embedded as `prompts`. */
export interface OwnEventRow {
  mark: number | null;
  band: number | null;
  word_count: number | null;
  created_at: string;
  /** PostgREST returns a many-to-one embed as an object; tolerate an array too. */
  prompts: EmbeddedPrompt | EmbeddedPrompt[] | null;
}

/** Each level of an embed is many-to-one, so PostgREST sends an object; tolerate an array. */
type Embed<T> = T | T[] | null | undefined;

interface EmbeddedPrompt {
  verb: string | null;
  total_marks: number | null;
  /** Present only when the read embeds the curriculum (`fetchMyReportHistory`). */
  dot_points?: Embed<EmbeddedDotPoint>;
}

interface EmbeddedDotPoint {
  sub_topics?: Embed<EmbeddedSubTopic>;
}

interface EmbeddedSubTopic {
  topics?: Embed<EmbeddedTopic>;
}

interface EmbeddedTopic {
  name: string | null;
  courses?: Embed<EmbeddedCourse>;
}

interface EmbeddedCourse {
  id: string | null;
  legacy_id: string | null;
  name: string | null;
}

/**
 * What the profile knows about its own history.
 *
 * `local` is the honest answer for a copy of the app with no online account:
 * there is no history to read, and the charts say so rather than showing an
 * empty chart that looks like "no attempts".
 */
export type OwnHistory =
  | { status: 'local' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; attempts: OwnAttempt[] };

const finiteOrNull = (n: unknown): number | null =>
  typeof n === 'number' && Number.isFinite(n) ? n : null;

/** The first element of an embed that PostgREST may send as an object or an array. */
const firstOf = <T>(value: Embed<T>): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null);

const textOrNull = (value: string | null | undefined): string | null => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed ? trimmed : null;
};

/** The topic and course of a question, from the nested embed. Every level may be hidden. */
const curriculumOf = (prompt: EmbeddedPrompt | null): Pick<OwnAttempt, 'course' | 'topic'> => {
  const subTopic = firstOf(firstOf(prompt?.dot_points)?.sub_topics);
  const topic = firstOf(subTopic?.topics);
  const course = firstOf(topic?.courses);
  const courseOut: OwnAttemptCourse | null = course
    ? {
        id: course.id ?? null,
        legacyId: textOrNull(course.legacy_id),
        name: textOrNull(course.name),
      }
    : null;
  return {
    course: courseOut,
    topic: topic ? { name: textOrNull(topic.name), course: courseOut } : null,
  };
};

export interface OwnAttemptOptions {
  /**
   * Also map the question's topic and course. The profile does not need them and
   * does not ask for them; the progress report breaks answers down by both. With
   * it on, a question RLS hides yields null rather than an absent field, so the
   * report can say "not recorded" instead of guessing.
   */
  curriculum?: boolean;
}

/**
 * Maps raw rows to attempts. Rows without a usable timestamp are dropped.
 *
 * With `{ curriculum: true }` each attempt also carries `course` and `topic`, read
 * from the embed the caller selected. The default output is unchanged, so the
 * profile's shape and its tests stay as they were.
 */
export const toOwnAttempts = (rows: OwnEventRow[], options: OwnAttemptOptions = {}): OwnAttempt[] =>
  rows.flatMap((row) => {
    if (!row || typeof row.created_at !== 'string' || Number.isNaN(Date.parse(row.created_at))) {
      return [];
    }
    const prompt = firstOf(row.prompts);
    const verb = prompt?.verb?.trim() ? prompt.verb.trim().toUpperCase() : null;
    const totalMarks = finiteOrNull(prompt?.total_marks);
    const attempt: OwnAttempt = {
      at: row.created_at,
      band: finiteOrNull(row.band),
      mark: finiteOrNull(row.mark),
      totalMarks: totalMarks !== null && totalMarks > 0 ? totalMarks : null,
      verb,
      wordCount: Math.max(0, Math.trunc(finiteOrNull(row.word_count) ?? 0)),
    };
    return [options.curriculum ? { ...attempt, ...curriculumOf(prompt) } : attempt];
  });

/** Share of the question's marks earned (0–1), or null when either side is unknown. */
export const markShare = (attempt: OwnAttempt): number | null => {
  if (attempt.mark === null || attempt.totalMarks === null) return null;
  return Math.min(1, Math.max(0, attempt.mark / attempt.totalMarks));
};

/** Scored attempts, oldest first. Sorting here keeps every chart on one order. */
export const scoredOldestFirst = (attempts: OwnAttempt[]): ScoredAttempt[] =>
  attempts
    .filter(
      (a): a is ScoredAttempt =>
        a.band !== null && Number.isFinite(a.band) && Number.isFinite(Date.parse(a.at))
    )
    .sort((x, y) => Date.parse(x.at) - Date.parse(y.at));

/**
 * The band line: the most recent `cap` scored attempts, oldest first. The cap
 * keeps a long-standing account's chart readable; the table beside the chart
 * still names every point it shows.
 */
export const bandSeries = (attempts: OwnAttempt[], cap = 100): ScoredAttempt[] =>
  scoredOldestFirst(attempts).slice(-Math.max(1, Math.trunc(cap)));

/** Newest first, scored attempts only, capped at `n`. */
export const recentAttempts = (attempts: OwnAttempt[], n = 6): ScoredAttempt[] =>
  scoredOldestFirst(attempts)
    .reverse()
    .slice(0, Math.max(0, Math.trunc(n)));

/**
 * Per-verb aggregates in the shape `foldVerbsIntoTiers` reads, so the profile's
 * tier strength is folded by the same code the admin Student Progress view uses.
 * Attempts without a verb fold under `UNSPECIFIED`, which has no tier and so is
 * left out of the tier bars rather than guessed at.
 */
export const verbAggregates = (attempts: OwnAttempt[]): VerbAggregate[] => {
  const acc = new Map<
    string,
    { attempts: number; bandSum: number; shareSum: number; shareCount: number }
  >();
  for (const a of attempts) {
    if (a.band === null || !Number.isFinite(a.band)) continue;
    const label = a.verb ?? 'UNSPECIFIED';
    const cur = acc.get(label) ?? { attempts: 0, bandSum: 0, shareSum: 0, shareCount: 0 };
    cur.attempts += 1;
    cur.bandSum += a.band;
    const share = markShare(a);
    if (share !== null) {
      cur.shareSum += share;
      cur.shareCount += 1;
    }
    acc.set(label, cur);
  }
  return [...acc.entries()].map(([label, v]) => ({
    label,
    attempts: v.attempts,
    avg_band: v.bandSum / v.attempts,
    avg_mark_frac: v.shareCount > 0 ? v.shareSum / v.shareCount : null,
  }));
};

const clampBand = (band: number): number => Math.max(1, Math.min(6, band));

/**
 * The y position of a band on the ladder, in the same coordinate space as the
 * plot. Band 6 sits at the top padding and band 1 at the bottom, so the rungs
 * of the ladder and the points that land on them agree by construction.
 */
export const bandRowY = (band: number, height: number, padY: number): number =>
  padY + ((6 - clampBand(band)) / 5) * (height - 2 * padY);

export interface PlotOpts {
  width: number;
  height: number;
  padX: number;
  padY: number;
}

/**
 * Plot coordinates for a band series. Attempts are spaced evenly along x (the
 * index, not the clock, so a quiet fortnight does not stretch the line), and
 * bands map onto the ladder. A single point sits centred. Non-finite bands are
 * dropped rather than written into the SVG as NaN.
 */
export const plotPoints = (
  bands: number[],
  { width, height, padX, padY }: PlotOpts
): { x: number; y: number }[] => {
  const usable = bands.filter((b) => Number.isFinite(b));
  const span = Math.max(0, width - 2 * padX);
  return usable.map((band, i) => ({
    x: usable.length === 1 ? width / 2 : padX + (i / (usable.length - 1)) * span,
    y: bandRowY(band, height, padY),
  }));
};

/** "12 Oct, 14:30" in the reader's own timezone, or an em dash for a bad stamp. */
export const formatAttemptWhen = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * What a history view says when the totals count answers that no history row
 * records. The totals and the history come from different places, and answers
 * marked before attempt history was kept are in the first but not the second.
 * Saying so is the only honest empty state for that case: "no marked responses
 * yet" would contradict the figure beside it.
 */
export const legacyHistoryNotice = (answers: number): string => {
  const n = Math.max(0, Math.trunc(answers));
  return `Your ${n} earlier ${n === 1 ? 'answer was' : 'answers were'} marked before attempt history was kept, so ${n === 1 ? 'it is' : 'they are'} not listed here. New answers will appear from now on.`;
};

/** `EXPLAIN` → `Explain`. A missing verb reads as a state, not a blank. */
export const formatVerbLabel = (verb: string | null): string => {
  if (!verb || verb === 'UNSPECIFIED') return 'No command verb';
  return verb.charAt(0) + verb.slice(1).toLowerCase();
};

const finiteOr = (n: unknown, fallback: number): number =>
  typeof n === 'number' && Number.isFinite(n) ? n : fallback;

/**
 * The stats the profile draws from, with every number guaranteed finite. A
 * profile saved before a field existed, or a partial object in a test, must
 * render as zero rather than as NaN in an attribute.
 */
export const withStatDefaults = (stats: Partial<UserStats> | undefined): UserStats => ({
  xp: finiteOr(stats?.xp, 0),
  level: finiteOr(stats?.level, 1),
  questionsAnswered: finiteOr(stats?.questionsAnswered, 0),
  totalWordsWritten: finiteOr(stats?.totalWordsWritten, 0),
  averageBand: finiteOr(stats?.averageBand, 0),
  markShareMean: stats?.markShareMean,
  markShareCount: stats?.markShareCount,
  lastActive: finiteOr(stats?.lastActive, 0),
  streakDays: finiteOr(stats?.streakDays, 0),
});
