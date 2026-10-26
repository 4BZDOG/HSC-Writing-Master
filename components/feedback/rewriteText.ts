import type { EvaluationResult } from '../../types';
import { getNextLevelTarget } from '../../data/commandTerms';
import { bandOnGuide } from '../../utils/guideBands';

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
  tier: number,
  /** The question's guide, so the band is the one its row shows (utils/guideBands.ts). */
  markingCriteria?: string
): { mark: number; band: number } {
  const reported = typeof revised === 'object' ? revised.mark : undefined;
  const mark =
    typeof reported === 'number' && Number.isFinite(reported)
      ? Math.min(totalMarks, Math.max(0, reported))
      : getNextLevelTarget(overallMark, totalMarks, tier).targetMark;
  return { mark, band: bandOnGuide(mark, totalMarks, tier, markingCriteria) };
}

/**
 * The note saved with a rewrite in the question's sample answers: what it is worth
 * and, when the marker said, what was changed to get there.
 *
 * It used to be a sentence of band boilerplate ("explaining key concepts with
 * adequate detail…") that said nothing about this rewrite, and the improve path's
 * claimed "one mark above the original attempt" of a rewrite briefed to reach the
 * next band. The marker's own change list is the useful part, so it is the body.
 * Kept plain: this note is also handed back to the marker as a reference sample's
 * notes when a question has no verified exemplars.
 */
export function rewriteSampleNote(args: {
  mark: number;
  band: number;
  totalMarks: number;
  originalMark: number;
  keyChanges?: string[];
}): string {
  const { mark, band, totalMarks, originalMark, keyChanges = [] } = args;
  const head = `The student's own answer, lifted from ${originalMark}/${totalMarks} to ${mark}/${totalMarks} (Band ${band}) by the marker's edits.`;
  const changes = keyChanges
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (/[.!?]$/.test(line) ? line : `${line}.`));
  return changes.length ? `${head} What changed: ${changes.join(' ')}` : head;
}
