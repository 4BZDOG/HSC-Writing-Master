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
