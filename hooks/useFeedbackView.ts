import { useMemo } from 'react';
import { EvaluationResult, HierarchyContext, Prompt } from '../types';
import { getCommandTermInfo, getBandForMark, getNextLevelTarget } from '../data/commandTerms';
import { getBandConfig, textContainsKeyword } from '../utils/renderUtils';
import { splitSyllabusTerms } from '../utils/syllabusTermSource';
import { isFeatureLocked } from '../services/entitlements';

interface UseFeedbackViewArgs {
  result: EvaluationResult;
  prompt: Prompt;
  userAnswer: string;
  hierarchy?: HierarchyContext;
}

/**
 * The derived figures the marking report is drawn from: the rewrite as this
 * client may present it, the exemplar's mark and band, and the counts shown
 * beside the placard. Shared by the report and its exported PDF, so the two
 * cannot disagree about any of them.
 */
export function useFeedbackView({ result, prompt, userAnswer, hierarchy }: UseFeedbackViewArgs) {
  const termInfo = useMemo(() => getCommandTermInfo(prompt.verb), [prompt.verb]);
  const upgradesLocked = isFeatureLocked('answerUpgrades');

  /**
   * The rewrite, as this client is allowed to present it.
   *
   * The server withholds it from a plan without `answerUpgrades`, so normally
   * there is nothing here to hide. The lock is applied again anyway, in ONE
   * place that every consumer reads — the rendered exemplar, the buttons, the
   * comparison, and the exported PDF — because a rewrite can outlive the
   * entitlement that produced it: a cached result, or a session that was still
   * open when the plan lapsed. A paid asset should not depend on which of four
   * call sites remembered to check.
   */
  const revisedText = useMemo(() => {
    if (upgradesLocked || !result.revisedAnswer) return '';
    return typeof result.revisedAnswer === 'string'
      ? result.revisedAnswer
      : result.revisedAnswer.text;
  }, [result.revisedAnswer, upgradesLocked]);

  // The question's tier caps how high an exemplar can realistically sit.
  const maxBand = useMemo(
    () => getBandForMark(prompt.totalMarks, prompt.totalMarks, termInfo.tier),
    [prompt.totalMarks, termInfo.tier]
  );

  // What the improved response is actually worth: one mark above the student's,
  // and the band that mark maps to. Both come from `getNextLevelTarget`, which
  // is also what the marker was briefed with, so the header can never promise a
  // band the rewrite was not aimed at — in either direction. It read "Band N+1"
  // over a one-mark rewrite once, and later read the unchanged band over a
  // rewrite the student was told was an improvement.
  const nextLevel = useMemo(
    () => getNextLevelTarget(result.overallMark, prompt.totalMarks, termInfo.tier),
    [result.overallMark, prompt.totalMarks, termInfo.tier]
  );

  const exemplarMark = useMemo(() => {
    if (typeof result.revisedAnswer === 'object' && result.revisedAnswer.mark) {
      return Math.min(prompt.totalMarks, result.revisedAnswer.mark);
    }
    return nextLevel.targetMark;
  }, [result.revisedAnswer, nextLevel.targetMark, prompt.totalMarks]);

  const exemplarBand = useMemo(() => {
    // An AI-reported band is clamped to the question's ceiling too — the Verb
    // Gate applies to every band figure shown, including model output.
    if (typeof result.revisedAnswer === 'object' && result.revisedAnswer.band) {
      return Math.min(maxBand, result.revisedAnswer.band);
    }
    return Math.min(maxBand, getBandForMark(exemplarMark, prompt.totalMarks, termInfo.tier));
  }, [result.revisedAnswer, exemplarMark, prompt.totalMarks, termInfo.tier, maxBand]);

  const exemplarConfig = getBandConfig(exemplarBand);

  // Calculations for metrics
  const wordCount = useMemo(
    () => userAnswer.trim().split(/\s+/).filter(Boolean).length,
    [userAnswer]
  );
  const { keywordsUsedCount } = useMemo(() => {
    // Shares the highlighter's matcher so this count always agrees with the
    // terms shown highlighted in the response.
    const used = (prompt.keywords || []).filter((kw) => textContainsKeyword(userAnswer, kw));
    return { keywordsUsedCount: used.length };
  }, [userAnswer, prompt.keywords]);

  // Which terms the question names itself, for the printed report — the trail
  // this component already receives carries every syllabus level the
  // classifier reads, so nothing new has to be threaded down to get it.
  const mustUseKeywords = useMemo(
    () =>
      splitSyllabusTerms(prompt.keywords || [], {
        question: prompt.question,
        scenario: prompt.scenario,
        dotPointText: hierarchy?.dotPoint,
        subTopicName: hierarchy?.subTopic,
        topicName: hierarchy?.topic,
      }).mustUse,
    [prompt.keywords, prompt.question, prompt.scenario, hierarchy]
  );

  // Where this question lives in the syllabus — shown under the hero and
  // embedded in the PDF so a shared report identifies its own provenance.
  const syllabusTrail = useMemo(
    () =>
      hierarchy
        ? [hierarchy.course, hierarchy.topic, hierarchy.subTopic, hierarchy.dotPoint].filter(
            (s): s is string => !!s && !!s.trim()
          )
        : [],
    [hierarchy]
  );

  return {
    termInfo,
    upgradesLocked,
    revisedText,
    maxBand,
    nextLevel,
    exemplarMark,
    exemplarBand,
    exemplarConfig,
    wordCount,
    keywordsUsedCount,
    mustUseKeywords,
    syllabusTrail,
  };
}

export type FeedbackView = ReturnType<typeof useFeedbackView>;
