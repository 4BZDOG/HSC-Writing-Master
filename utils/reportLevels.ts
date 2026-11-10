import type { EvaluationResult, Prompt, PromptVerb } from '../types';
import { getPromptTermInfo } from '../data/commandTerms';
import { promptBandForMark } from './guideBands';
import { getBandDeepInkRgb, getBandRgb } from './renderUtils';
import { presentableRewrite, rewriteTarget } from '../components/feedback/rewriteText';

/**
 * The three levels every post-marking window names, and the one place they are
 * worked out (DesignSpec, "Levels in the post-marking windows"):
 *
 *  - `you`   the band of the mark the student got. It colours the window.
 *  - `next`  the band the rewrite reaches, or the next-level target when there is
 *            no rewrite to show. It colours the improvement and the way forward.
 *  - `top`   the highest band this question can award. An indicator only.
 *
 * Every consumer reads its bands from here, so the feedback report and the review
 * cannot name different bands for the same mark. A band is always
 * `promptBandForMark` (the marking guide's rows where it is a ranged ladder, the
 * verb's ceiling otherwise); nothing here works a band out inline.
 */

/** The question's marking inputs: what the band of a mark depends on. */
export type LevelsPrompt = Pick<Prompt, 'totalMarks' | 'verb' | 'bandCeiling' | 'markingCriteria'>;

export interface ReportLevelsRewrite {
  /** The rewrite the report presents (`presentableRewrite`), or the raw one. */
  revised?: EvaluationResult['revisedAnswer'] | null;
  /**
   * The mark the rewrite reaches, when the caller already holds it (the improve
   * path reports its target this way). Wins over `revised`'s own mark.
   */
  mark?: number;
}

export interface ReportLevels {
  you: { mark: number; band: number };
  /** Null at full marks: there is no next level. */
  next: { mark: number; band: number; isRewrite: boolean } | null;
  top: { mark: number; band: number };
}

const textOf = (revised: ReportLevelsRewrite['revised']): string =>
  typeof revised === 'string' ? revised : (revised?.text ?? '');

export function reportLevels(
  prompt: LevelsPrompt,
  overallMark: number,
  rewrite?: ReportLevelsRewrite
): ReportLevels {
  const total = prompt.totalMarks;
  const you = { mark: overallMark, band: promptBandForMark(prompt, overallMark) };
  const top = { mark: total, band: promptBandForMark(prompt, total) };
  if (overallMark >= total) return { you, next: null, top };

  const isRewrite = rewrite?.mark !== undefined || textOf(rewrite?.revised).trim() !== '';
  // A caller-held mark takes the same clamp and band rule as a rewrite's reported
  // mark (`rewriteTarget`), so the two paths cannot disagree.
  const revised: EvaluationResult['revisedAnswer'] | undefined =
    rewrite?.mark !== undefined
      ? { text: '', mark: rewrite.mark, keyChanges: [] }
      : (rewrite?.revised ?? undefined);
  const tier = getPromptTermInfo({
    verb: prompt.verb as PromptVerb,
    bandCeiling: prompt.bandCeiling,
  }).tier;
  const target = rewriteTarget(revised, overallMark, total, tier, prompt.markingCriteria);
  return { you, next: { mark: target.mark, band: target.band, isRewrite }, top };
}

/**
 * The three levels of a marked result, for the report and its frame. The rewrite is
 * taken as the report presents it (`presentableRewrite`): on a plan without answer
 * upgrades there is no rewrite to show, so the Improved level is the next-level target.
 */
export function resultLevels(
  prompt: LevelsPrompt,
  result: Pick<EvaluationResult, 'overallMark' | 'revisedAnswer'>,
  upgradesLocked: boolean
): ReportLevels {
  const shown = presentableRewrite(result.revisedAnswer, upgradesLocked);
  return reportLevels(prompt, result.overallMark, {
    revised: shown.text ? result.revisedAnswer : null,
  });
}

/** The You band's custom properties, for the element that IS the window's band (its frame). */
export const youVars = (band: number): Record<string, string> => ({
  '--band-rgb': getBandRgb(band),
  '--band-ink-deep-rgb': getBandDeepInkRgb(band),
});

/** The Improved band's custom properties, for the element that carries the improvement. */
export const nextVars = (band: number): Record<string, string> => ({
  '--next-rgb': getBandRgb(band),
  '--next-ink-deep-rgb': getBandDeepInkRgb(band),
});

/** Both pairs on a window's frame: the You band is the frame's; the Improved band is its accent. */
export const levelFrameVars = (you: number, next: number): Record<string, string> => ({
  ...youVars(you),
  ...nextVars(next),
});
