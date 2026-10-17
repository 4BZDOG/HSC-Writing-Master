import { useMemo } from 'react';
import { EvaluationResult, HierarchyContext, Prompt } from '../types';
import { getCommandTermInfo, getBandForMark, getNextLevelTarget } from '../data/commandTerms';
import { getBandConfig, textContainsKeyword } from '../utils/renderUtils';
import { splitSyllabusTerms } from '../utils/syllabusTermSource';
import { isFeatureLocked } from '../services/entitlements';
import { presentableRewrite, rewriteTarget } from '../components/feedback/rewriteText';

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

  // The rewrite as this client may present it (see `presentableRewrite`): the
  // one place the lock is applied, read by the report, its footer and the PDF.
  const rewrite = useMemo(
    () => presentableRewrite(result.revisedAnswer, upgradesLocked),
    [result.revisedAnswer, upgradesLocked]
  );
  const revisedText = rewrite.text;
  const keyChanges = rewrite.keyChanges;

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

  // The rewrite's mark and band, through the one helper every consumer shares
  // (`rewriteTarget`). The band is derived from the mark, never taken from the
  // model, so the header cannot promise a band above the Verb Gate's ceiling.
  const { mark: exemplarMark, band: exemplarBand } = useMemo(
    () => rewriteTarget(result.revisedAnswer, result.overallMark, prompt.totalMarks, termInfo.tier),
    [result.revisedAnswer, result.overallMark, prompt.totalMarks, termInfo.tier]
  );

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
    keyChanges,
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
