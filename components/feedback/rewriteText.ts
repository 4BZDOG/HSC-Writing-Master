import type { EvaluationResult } from '../../types';

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
