/**
 * Personal ordering — the last of the volume strategy's follow-ups
 * (projectDocs/contentVolumeStrategy.md).
 *
 * Every other move in that strategy makes a long list easier to READ. This one
 * is the only one that makes it shorter *for this reader*, and it costs them
 * nothing to set, because the data already exists: the app has been storing
 * every marked attempt since `persistResponse` landed and nothing has read it
 * back here.
 *
 * Two things follow from an attempt history:
 *
 * 1. **A question already answered is a different object** from one never
 *    attempted, and the picker should say so — with the mark, because "I got
 *    4/6 on this" is the fact a student is actually navigating by.
 * 2. **There is a next question**, and it is knowable. Not "the hardest one",
 *    which is how a student loses an afternoon, and not "the next in the list",
 *    which is an accident of curation order — one step on from where they
 *    actually got to.
 *
 * The step is deliberately conservative. A solid result moves up a tier; a
 * shaky one stays put, because the answer to "you scored 40%" is another
 * question at that level, not a harder one. This module is pure so the rule is
 * inspectable and testable in isolation from where the marks came from.
 */

/** A question, reduced to what ordering needs. */
export interface OrderableQuestion {
  id: string;
  /** Cognitive tier 1–6 — the ladder the suggestion climbs. */
  tier: number;
  marks: number;
}

/** One stored attempt. Mark and band may be absent on older/unscored rows. */
export interface AttemptRecord {
  mark: number | null;
  band: number | null;
  attemptedAt: string | null;
}

/** Why a question is being suggested — the picker turns this into a heading. */
export type SuggestionReason = 'step-up' | 'consolidate';

export interface Suggestion {
  id: string;
  reason: SuggestionReason;
  /** The tier the reader last worked at, for the heading's explanation. */
  fromTier: number;
}

/** At or above this share of the marks, a result is solid enough to move on. */
export const STEP_UP_THRESHOLD = 0.6;

/**
 * The most recently attempted question among those supplied.
 *
 * Rows with no timestamp still count — an attempt with a missing `updated_at`
 * is a real attempt — but they lose to any dated one, so the answer is stable.
 */
export const mostRecentAttempt = (
  questions: OrderableQuestion[],
  attempts: Map<string, AttemptRecord>
): { question: OrderableQuestion; attempt: AttemptRecord } | null => {
  let best: { question: OrderableQuestion; attempt: AttemptRecord } | null = null;
  for (const question of questions) {
    const attempt = attempts.get(question.id);
    if (!attempt) continue;
    if (!best) {
      best = { question, attempt };
      continue;
    }
    const a = attempt.attemptedAt ?? '';
    const b = best.attempt.attemptedAt ?? '';
    if (a > b) best = { question, attempt };
  }
  return best;
};

/**
 * The question to put in front of this reader first, or `null` when there is
 * nothing personal to say — no attempts yet, or everything here answered.
 *
 * Never suggests a question already attempted: "do this next" pointing at
 * something with a mark on it would read as a bug. Where nothing sits at or
 * above the target tier, the closest tier BELOW is offered rather than nothing;
 * more practice one rung down is a real answer, and silence is not.
 */
export const suggestNextQuestion = (
  questions: OrderableQuestion[],
  attempts: Map<string, AttemptRecord>
): Suggestion | null => {
  const last = mostRecentAttempt(questions, attempts);
  if (!last) return null;

  const fromTier = Math.max(1, Math.min(6, Math.round(last.question.tier) || 1));
  const marks = Math.max(1, last.question.marks || 1);
  const share = last.attempt.mark === null ? 0 : last.attempt.mark / marks;
  // An unscored attempt reads as "not yet demonstrated", so it consolidates —
  // the same call as a weak mark, and the safer one to get wrong.
  const reason: SuggestionReason = share >= STEP_UP_THRESHOLD ? 'step-up' : 'consolidate';
  const targetTier = reason === 'step-up' ? Math.min(6, fromTier + 1) : fromTier;

  const unattempted = questions.filter((q) => !attempts.has(q.id));
  if (unattempted.length === 0) return null;

  // Upward is preferred: the half-step penalty means tier+1 wins over tier-1 at
  // equal distance, so the ladder is climbed rather than descended.
  const distance = (tier: number): number => {
    const t = Math.max(1, Math.min(6, Math.round(tier) || 1));
    return t >= targetTier ? t - targetTier : targetTier - t + 0.5;
  };

  const pick = [...unattempted].sort(
    (a, b) => distance(a.tier) - distance(b.tier) || a.marks - b.marks || a.id.localeCompare(b.id)
  )[0];

  return pick ? { id: pick.id, reason, fromTier } : null;
};
