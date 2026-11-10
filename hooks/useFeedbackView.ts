import { useMemo } from 'react';
import { EvaluationResult, HierarchyContext, Prompt } from '../types';
import { getPromptTermInfo } from '../data/commandTerms';
import { getBandConfig, textContainsKeyword } from '../utils/renderUtils';
import { splitSyllabusTerms } from '../utils/syllabusTermSource';
import { isFeatureLocked } from '../services/entitlements';
import { resultLevels } from '../utils/reportLevels';
import { presentableRewrite } from '../components/feedback/rewriteText';

interface UseFeedbackViewArgs {
  result: EvaluationResult;
  prompt: Prompt;
  userAnswer: string;
  hierarchy?: HierarchyContext;
}

/**
 * The derived figures the marking report is drawn from: the rewrite as this
 * client may present it, the three levels of the result, and the counts shown
 * beside the placard. Shared by the report and its exported PDF, so the two
 * cannot disagree about any of them.
 */
export function useFeedbackView({ result, prompt, userAnswer, hierarchy }: UseFeedbackViewArgs) {
  const termInfo = useMemo(() => getPromptTermInfo(prompt), [prompt.verb, prompt.bandCeiling]);
  const upgradesLocked = isFeatureLocked('answerUpgrades');

  // The rewrite as this client may present it (see `presentableRewrite`): the
  // one place the lock is applied, read by the report, its footer and the PDF.
  const rewrite = useMemo(
    () => presentableRewrite(result.revisedAnswer, upgradesLocked),
    [result.revisedAnswer, upgradesLocked]
  );
  const revisedText = rewrite.text;
  const keyChanges = rewrite.keyChanges;

  // The three levels of the result: You (the mark), Improved or Next (the rewrite's band,
  // or the next-level target), and Top (the question's ceiling). Every band the report
  // names comes from here (utils/reportLevels.ts), so the placard, the goal, the rewrite
  // and the review cannot disagree.
  const levels = useMemo(
    () => resultLevels(prompt, result, upgradesLocked),
    [prompt, result, upgradesLocked]
  );
  // The band the question tops out at (the verb's ceiling, or the guide's top row).
  const maxBand = levels.top.band;
  // The rewrite's mark and band. At full marks there is no next level, so the top stands in.
  const exemplarMark = levels.next?.mark ?? levels.top.mark;
  const exemplarBand = levels.next?.band ?? levels.top.band;

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
    levels,
    maxBand,
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
