/**
 * Persist student attempts + AI feedback to the `responses` table
 * (supabase/schema.sql §4) — featureRoadmap.md → Mid-term → "Persist responses".
 * This is the substrate every longitudinal feature needs (progress over time,
 * weakness heatmaps), which is why it lands before them.
 *
 * Scope + safety:
 *   - Supabase mode only. In local mode there is no server identity to attribute
 *     a response to, so this is a no-op (mock-mode parity with quotas/contrib).
 *   - Writes go to the caller's OWN rows, gated by the `responses_write` RLS
 *     policy (user_id = auth.uid()); reviewers may read all for analytics.
 *   - Best-effort: every entry point swallows its own failures so persistence
 *     never blocks or disrupts the evaluation UX. A dropped write just means a
 *     missing analytics row, never a broken mark.
 *   - One row per (user, prompt) via the uq_responses_user_prompt index: each
 *     evaluation upserts the latest attempt in place.
 */
import { supabase } from './supabaseClient';
import { isCurriculumRemote } from './curriculumService';
import { resolvePromptRowId, resolvePromptRowIds } from './contributionService';
import type { EvaluationResult, UserFeedback } from '../types';

// --- Class analytics (reviewer-facing read path over persisted responses) ----

/** One aggregated row for an analytics dimension (a verb or a topic). */
export interface DimensionAnalytics {
  /** The verb or topic name this row aggregates. */
  label: string;
  attempts: number;
  students: number;
  /** Averages are null only when no scored attempts exist for the row. */
  avg_mark: number | null;
  avg_band: number | null;
  /**
   * Fraction of attempts scoring band ≤ 3 (0–1). Reported, but NOT the ranking
   * signal: the Verb Gate caps a question's band at its verb's tier, so tier 1–3
   * verbs read 100% here however well they were answered. See `avg_mark_frac`.
   */
  low_band_rate: number;
  /**
   * Mean share of the available marks earned (0–1) — the weakness signal, and
   * the only one comparable across questions of different tiers. Null on older
   * deployments whose `get_class_analytics` predates schema §18, and where a
   * row's questions carry no marks at all.
   */
  avg_mark_frac?: number | null;
}

/** Cohort-wide totals shared by the class and per-student payloads. */
export interface AnalyticsTotals {
  total_attempts: number;
  active_students: number;
  avg_band: number | null;
  /** Mean share of available marks earned (0–1); see DimensionAnalytics. */
  avg_mark_frac?: number | null;
}

export interface ClassAnalytics {
  byVerb: DimensionAnalytics[];
  byTopic: DimensionAnalytics[];
  totals: AnalyticsTotals;
}

const EMPTY_ANALYTICS: ClassAnalytics = {
  byVerb: [],
  byTopic: [],
  totals: { total_attempts: 0, active_students: 0, avg_band: null },
};

/** One class the caller teaches (from `list_my_classes`). */
export interface TeachingClass {
  id: string;
  name: string;
  year: number | null;
  school: string;
  students: number;
}

/**
 * The classes the caller owns or co-teaches, for the class picker. Reviewer-gated
 * server-side. Returns an empty list — not an error — on a database that
 * predates schema §19, so the UI degrades to "no class filter" rather than
 * showing a failure the user cannot act on.
 */
export const fetchMyClasses = async (): Promise<TeachingClass[]> => {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.rpc('list_my_classes');
  if (error) {
    console.warn('Class list unavailable (pre-§19 database?):', error.message);
    return [];
  }
  return (data ?? []) as TeachingClass[];
};

/**
 * Builds the RPC argument object, including `p_class_id` ONLY when a class is
 * actually selected.
 *
 * Sending `p_class_id: null` would name a parameter that does not exist on a
 * database that predates schema §19, and PostgREST resolves overloads by
 * argument name — so the call would fail outright there instead of falling back
 * to the unscoped behaviour. Omitting it keeps one client compatible with both.
 */
const withClass = <T extends object>(args: T, classId?: string | null): T =>
  classId ? ({ ...args, p_class_id: classId } as T) : args;

/**
 * Reviewer-gated cohort analytics over the last `days` days (1–365): per-verb
 * and per-topic attempt counts, average mark/band, the mark share the ranking
 * uses, and overall totals. Aggregated server-side so no raw student work is
 * transferred.
 *
 * Scope (enforced server-side, not here): with `classId`, that one class, after
 * the server checks the caller teaches it. Without it, every class the caller
 * teaches — or, for an admin, the whole database.
 */
export const fetchClassAnalytics = async (
  days = 30,
  classId?: string | null
): Promise<ClassAnalytics> => {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.rpc(
    'get_class_analytics',
    withClass({ p_days: days }, classId)
  );
  if (error) throw new Error(`Could not load class analytics: ${error.message}`);
  return (data as ClassAnalytics | null) ?? EMPTY_ANALYTICS;
};

/** One roster entry (from `get_response_students`) — a student who has
 *  submitted at least one scored response in the window. */
export interface RosterStudent {
  username: string;
  attempts: number;
  avg_band: number | null;
  /** ISO timestamp of their most recent response, or null. */
  last_active: string | null;
}

/**
 * Reviewer-gated roster of students with scored responses over the last `days`
 * days (attempts desc, then username), so the Student Progress picker can list
 * them instead of requiring a typed username.
 */
export const fetchResponseStudents = async (
  days = 30,
  classId?: string | null
): Promise<RosterStudent[]> => {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.rpc(
    'get_response_students',
    withClass({ p_days: days }, classId)
  );
  if (error) throw new Error(`Could not load the student roster: ${error.message}`);
  return (data ?? []) as RosterStudent[];
};

/** One (student, verb) cell of the cohort breakdown (from `get_class_cohort`). */
export interface CohortVerbRow {
  username: string;
  verb: string;
  attempts: number;
  avg_band: number | null;
  /** Share of available marks earned; null when the questions carry no marks. */
  avg_mark_frac: number | null;
}

/** One (student, week) point of a student's trajectory. */
export interface CohortWeekRow {
  username: string;
  /** 0 = the OLDEST bucket in the window, so it plots left-to-right. */
  week: number;
  attempts: number;
  avg_band: number | null;
  avg_mark_frac: number | null;
}

/** Attempts on one UTC day across the whole cohort. */
export interface CohortDayRow {
  day: string;
  attempts: number;
}

/**
 * The cohort broken down BY STUDENT — the matrix behind the tier heatmap, the
 * per-student trajectories, and cohort engagement over the window. Verbs come
 * back raw; the client folds them into cognitive tiers so `data/commandTerms.ts`
 * stays the single source of truth for the Verb Gate.
 */
export interface ClassCohort {
  byStudent: CohortVerbRow[];
  weekly: CohortWeekRow[];
  daily: CohortDayRow[];
  /** Number of week buckets the window covers. */
  weeks: number;
}

const EMPTY_COHORT: ClassCohort = { byStudent: [], weekly: [], daily: [], weeks: 0 };

/**
 * Reviewer-gated, class-scoped per-student breakdown. Returns the empty shape —
 * not an error — on a database that predates schema §20, so the panel shows its
 * "no data" state rather than a failure the user cannot act on.
 */
export const fetchClassCohort = async (
  days = 30,
  classId?: string | null
): Promise<ClassCohort> => {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.rpc(
    'get_class_cohort',
    withClass({ p_days: days }, classId)
  );
  if (error) {
    console.warn('Cohort breakdown unavailable (pre-§20 database?):', error.message);
    return EMPTY_COHORT;
  }
  return (data as ClassCohort | null) ?? EMPTY_COHORT;
};

/** One recorded attempt in a student's band trend (from `response_events`). */
export interface TrendPoint {
  /** ISO timestamp of the attempt. */
  at: string;
  band: number | null;
  mark: number | null;
}

/** One student's per-verb progress, totals, and band trend (from `get_student_progress`). */
export interface StudentProgress {
  username: string;
  byVerb: DimensionAnalytics[];
  totals: AnalyticsTotals;
  /** Oldest→newest scored attempts (empty until history accrues). */
  trend: TrendPoint[];
}

/**
 * Reviewer-gated progress for a single student (by username) over the last
 * `days` days: their per-verb attempt counts and average mark/band. The client
 * folds the verbs into the six cognitive tiers for the progress profile.
 */
export const fetchStudentProgress = async (
  username: string,
  days = 30,
  classId?: string | null
): Promise<StudentProgress> => {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.rpc(
    'get_student_progress',
    withClass({ p_username: username, p_days: days }, classId)
  );
  if (error) throw new Error(error.message);
  const progress = data as StudentProgress;
  // `trend` is absent on a database that predates the history table — treat it
  // as empty rather than undefined so the UI can rely on the array.
  return { ...progress, trend: progress.trend ?? [] };
};

export interface ResponsePersistInput {
  draft: string;
  wordCount: number;
  result: EvaluationResult;
}

/** DB row shape written to `public.responses` (snake_case). */
export interface ResponseRow {
  prompt_id: string;
  user_id: string;
  draft: string;
  word_count: number;
  overall_mark: number;
  overall_band: number;
  evaluation: EvaluationResult;
  updated_at: string;
}

/** Pure app-shape → DB-row mapper, unit-tested without any IO. */
export const buildResponseRow = (
  promptId: string,
  userId: string,
  input: ResponsePersistInput,
  now: Date = new Date()
): ResponseRow => ({
  prompt_id: promptId,
  user_id: userId,
  draft: input.draft,
  word_count: Math.max(0, Math.trunc(input.wordCount) || 0),
  overall_mark: input.result.overallMark,
  overall_band: input.result.overallBand,
  evaluation: input.result,
  updated_at: now.toISOString(),
});

/** Append-only history row for `public.response_events` (no draft text). */
export interface ResponseEventRow {
  prompt_id: string;
  user_id: string;
  mark: number;
  band: number;
  word_count: number;
}

/** Pure app-shape → event-row mapper for the band-trend history. */
export const buildEventRow = (
  promptId: string,
  userId: string,
  input: ResponsePersistInput
): ResponseEventRow => ({
  prompt_id: promptId,
  user_id: userId,
  mark: input.result.overallMark,
  band: input.result.overallBand,
  word_count: Math.max(0, Math.trunc(input.wordCount) || 0),
});

/** The signed-in user's id, or null when there is no usable session. */
const currentUserId = async (): Promise<string | null> => {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
};

/**
 * Attempts, remembered for a few minutes.
 *
 * Moving between the dot points of one sub-topic asks for the same handful of
 * questions over and over — two round trips each time, on a picker a student
 * clicks through quickly. The only thing that can change the answer while the
 * app is open is the student marking something, and that goes through
 * `persistResponse` right here, which drops the cache. So the TTL is a backstop
 * for the case this file cannot see: the same account marking work in a second
 * tab.
 */
const ATTEMPT_CACHE_TTL_MS = 5 * 60 * 1000;

const attemptCache = new Map<string, { at: number; value: Map<string, AttemptSummary> }>();

/** Sorted, so the same set of questions in any order is the same key. */
const attemptCacheKey = (promptAppIds: string[]): string =>
  [...new Set(promptAppIds)].sort().join('|');

/** Called wherever this module writes — the picker must not show a stale mark. */
const forgetAttempts = (): void => attemptCache.clear();

/** Exposed for tests; nothing in the app needs to reach past `forgetAttempts`. */
export const __clearAttemptCache = forgetAttempts;

/**
 * Save (upsert) the student's latest attempt + AI feedback for a prompt.
 * No-ops silently when persistence isn't possible (local mode, guest with no
 * session, or a prompt that has no row in the shared library — e.g. a purely
 * local draft). Never throws.
 */
export const persistResponse = async (
  promptAppId: string,
  input: ResponsePersistInput
): Promise<void> => {
  if (!isCurriculumRemote() || !supabase) return;
  try {
    const userId = await currentUserId();
    if (!userId) return;
    const promptId = await resolvePromptRowId(promptAppId);
    if (!promptId) return;

    const { error } = await supabase
      .from('responses')
      .upsert(buildResponseRow(promptId, userId, input) as never, {
        onConflict: 'user_id,prompt_id',
      });
    if (error) console.warn('[responses] persist failed (ignored):', error.message);
    // The picker's "You: 4/6" chip and its suggestion both read this.
    forgetAttempts();

    // Append to the per-attempt history for the band trend. Independent and
    // best-effort — a lost event only shortens the trend, never the mark.
    const { error: evError } = await supabase
      .from('response_events')
      .insert(buildEventRow(promptId, userId, input) as never);
    if (evError) console.warn('[responses] history append failed (ignored):', evError.message);
  } catch (e) {
    console.warn('[responses] persist failed (ignored):', e);
  }
};

/** What the picker needs to know about a question the caller has answered. */
export interface AttemptSummary {
  /** The app-facing prompt id, so callers can key straight off their own data. */
  promptId: string;
  mark: number | null;
  band: number | null;
  /** ISO timestamp of the latest attempt — how "most recent" is decided. */
  attemptedAt: string | null;
}

/**
 * The caller's own attempts at a set of questions — the read side of
 * `persistResponse`, and the substrate for personal ordering in the question
 * picker (projectDocs/contentVolumeStrategy.md).
 *
 * Scoped to the caller by the `responses_read` RLS policy; this asks for the
 * mark and the band only, never anyone's draft. Best-effort like the rest of
 * this module: local mode, a guest with no session, or a failed lookup all
 * return an empty map, and the picker simply shows no personal marks rather
 * than an error. Never throws.
 */
export const fetchMyAttempts = async (
  promptAppIds: string[]
): Promise<Map<string, AttemptSummary>> => {
  const empty = new Map<string, AttemptSummary>();
  if (!isCurriculumRemote() || !supabase || promptAppIds.length === 0) return empty;

  const key = attemptCacheKey(promptAppIds);
  const hit = attemptCache.get(key);
  if (hit && Date.now() - hit.at < ATTEMPT_CACHE_TTL_MS) return hit.value;

  try {
    const userId = await currentUserId();
    if (!userId) return empty;

    const rowIds = await resolvePromptRowIds(promptAppIds);
    if (rowIds.size === 0) return empty;

    const { data, error } = await supabase
      .from('responses')
      .select('prompt_id, overall_mark, overall_band, updated_at')
      .eq('user_id', userId)
      .in('prompt_id', Array.from(new Set(rowIds.values())));
    if (error) {
      console.warn('[responses] attempt lookup failed (ignored):', error.message);
      return empty;
    }

    const byRowId = new Map<string, ResponseSummaryRow>();
    for (const row of (data ?? []) as ResponseSummaryRow[]) byRowId.set(row.prompt_id, row);

    // Keyed back to app ids: two app ids can resolve to one row (the same
    // seeded question reached by legacy id and by uuid), so this walks the
    // resolution map rather than the rows.
    const out = new Map<string, AttemptSummary>();
    rowIds.forEach((rowId, appId) => {
      const row = byRowId.get(rowId);
      if (!row) return;
      out.set(appId, {
        promptId: appId,
        mark: row.overall_mark ?? null,
        band: row.overall_band ?? null,
        attemptedAt: row.updated_at ?? null,
      });
    });
    attemptCache.set(key, { at: Date.now(), value: out });
    return out;
  } catch (e) {
    console.warn('[responses] attempt lookup failed (ignored):', e);
    return empty;
  }
};

interface ResponseSummaryRow {
  prompt_id: string;
  overall_mark: number | null;
  overall_band: number | null;
  updated_at: string | null;
}

/**
 * Attach the student's thumbs up/down on the AI feedback to their stored
 * response. No-ops when the response was never persisted (e.g. local mode) and
 * never throws.
 */
export const saveResponseFeedback = async (
  promptAppId: string,
  feedback: UserFeedback
): Promise<void> => {
  if (!isCurriculumRemote() || !supabase) return;
  try {
    const userId = await currentUserId();
    if (!userId) return;
    const promptId = await resolvePromptRowId(promptAppId);
    if (!promptId) return;

    const { error } = await supabase
      .from('responses')
      .update({ user_feedback: feedback, updated_at: new Date().toISOString() } as never)
      .eq('user_id', userId)
      .eq('prompt_id', promptId);
    if (error) console.warn('[responses] feedback save failed (ignored):', error.message);
  } catch (e) {
    console.warn('[responses] feedback save failed (ignored):', e);
  }
};
