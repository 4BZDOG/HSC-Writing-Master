import type { EvaluationResult } from '../../types';
import { getBandForMark, getNextLevelTarget } from '../../data/commandTerms';

export interface PresentableRewrite {
  /** The rewritten answer, or '' when there is nothing this client may show. */
  text: string;
  /** The edits the marker says it made, in the marker's words. */
  keyChanges: string[];
}

/**
 * The rewrite, as this client is allowed to present it.
 *
 * The server withholds it from a plan without `answerUpgrades`, so normally
 * there is nothing here to hide. The lock is applied again anyway, in ONE place
 * that every consumer reads — the report, its footer's "Use this version", the
 * comparison and the exported PDF — because a rewrite can outlive the
 * entitlement that produced it: a cached result, or a session that was still
 * open when the plan lapsed. A paid asset should not depend on which of four
 * call sites remembered to check.
 */
export function presentableRewrite(
  revised: EvaluationResult['revisedAnswer'] | undefined,
  upgradesLocked: boolean
): PresentableRewrite {
  const none: PresentableRewrite = { text: '', keyChanges: [] };
  if (upgradesLocked || !revised) return none;
  if (typeof revised === 'string') return { text: revised, keyChanges: [] };
  return { text: revised.text, keyChanges: revised.keyChanges ?? [] };
}

/**
 * What the rewrite is worth: the mark the marker was briefed to reach, and its band.
 *
 * The mark is the model's own when it reports one, clamped to the question.
 * Otherwise it is the target the model was briefed with, from
 * {@link getNextLevelTarget} — the same figure the saved exemplar and the header
 * have always used.
 *
 * The band is ALWAYS derived from that mark, never taken from the model. This is
 * the same rule `evaluateAnswer` applies to `overallBand`: a band the model chose
 * freely could sit above the Verb Gate's ceiling for the command verb (a DESCRIBE
 * question tops out at Band 2, whatever the model says), and the header would then
 * promise a band the report does not give.
 */
export function rewriteTarget(
  revised: EvaluationResult['revisedAnswer'] | undefined,
  overallMark: number,
  totalMarks: number,
  tier: number
): { mark: number; band: number } {
  const reported = typeof revised === 'object' ? revised.mark : undefined;
  const mark =
    typeof reported === 'number' && Number.isFinite(reported)
      ? Math.min(totalMarks, Math.max(0, reported))
      : getNextLevelTarget(overallMark, totalMarks, tier).targetMark;
  return { mark, band: getBandForMark(mark, totalMarks, tier) };
}
