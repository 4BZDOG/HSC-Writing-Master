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
import { resolvePromptRowId } from './contributionService';
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
   * deployments whose `get_class_analytics` predates schema §13, and where a
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
 * predates schema §14, so the UI degrades to "no class filter" rather than
 * showing a failure the user cannot act on.
 */
export const fetchMyClasses = async (): Promise<TeachingClass[]> => {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.rpc('list_my_classes');
  if (error) {
    console.warn('Class list unavailable (pre-§14 database?):', error.message);
    return [];
  }
  return (data ?? []) as TeachingClass[];
};

/**
 * Builds the RPC argument object, including `p_class_id` ONLY when a class is
 * actually selected.
 *
 * Sending `p_class_id: null` would name a parameter that does not exist on a
 * database that predates schema §14, and PostgREST resolves overloads by
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
