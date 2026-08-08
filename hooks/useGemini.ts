import { useState, useCallback, useEffect, useRef } from 'react';
import { Draft } from 'immer';
import {
  Course,
  StatePath,
  EvaluationResult,
  Prompt,
  DotPoint,
  SubTopic,
  Topic,
  CourseOutcome,
  BackgroundTask,
  CommandTermInfo,
  User,
  UserFeedback,
  SampleAnswer,
} from '../types';
import * as gemini from '../services/geminiService';
import { AICache } from '../services/aiCache';
import { emitEvalProgress } from '../services/aiCore';
import {
  recordEvaluation,
  requestUpgrade,
  syncFreeEvalCount,
  type PremiumFeatureKey,
} from '../services/entitlements';
import { persistResponse, saveResponseFeedback } from '../services/responseService';
import { findAndUpdateItem, findSelectionContext } from '../utils/stateUtils';
import { getFocusAreas } from '../utils/dataManagerUtils';
import { getBandForMark, getCommandTermInfo, getNextLevelTarget } from '../data/commandTerms';
import { generateId } from '../utils/idUtils';
import {
  addAndPruneSampleAnswers,
  mergeCourseContents,
  mergeTopicContents,
  type SyllabusPreviewNode,
} from '../utils/dataManagerUtils';

const BG_TASK_CLEANUP_DELAY = 5000;

/**
 * A completed "improve my answer" run: the rewrite, what it is worth, and the
 * student's own answer it was made from. Kept as one value so the review modal
 * can never label one revision with another's mark.
 */
export interface AnswerImprovement {
  text: string;
  mark: number;
  band: number;
  originalAnswer: string;
  originalMark: number;
}

type PreviewNode = SyllabusPreviewNode;

interface GeminiHookProps {
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  updateCourses: (updater: (draft: Draft<Course[]>) => void) => void;
  statePath: StatePath;
  currentPrompt?: Prompt | null;
  currentCourse?: Course | null;
  onApiKeyInvalid: () => void;
  user?: User;
  onUpdateUser?: (user: User) => void;
}

export const useGemini = ({
  showToast,
  updateCourses,
  statePath,
  currentPrompt,
  currentCourse,
  onApiKeyInvalid,
  user,
  onUpdateUser,
}: GeminiHookProps) => {
  const [evaluationResult, setEvaluationResult] = useState<EvaluationResult | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);

  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);

  const [isImproving, setIsImproving] = useState(false);
  const [improveAnswerError, setImproveAnswerError] = useState<string | null>(null);
  // The whole upgrade, not three loose strings: the review modal diffs the two
  // texts against each other and labels the result with the mark and band the
  // model was briefed on, so they have to travel together or the header can
  // describe a different revision from the one on screen.
  const [improvement, setImprovement] = useState<AnswerImprovement | null>(null);
  // The diff review opens on its own the moment an upgrade lands — the student
  // asked "how do I get the next mark", and the answer is the comparison, not a
  // block of new prose they have to eyeball against their own.
  const [showImprovementReview, setShowImprovementReview] = useState(false);
  /**
   * True while the diff review is standing IN FRONT of the marking feedback
   * rather than having been opened from it.
   *
   * Marking returns the student's own answer lifted one mark, and the comparison
   * is the most teachable thing in the whole result: it names the handful of
   * words that earned the extra mark. Behind a "Compare with mine" button most
   * students never pressed it, so the diff now opens first and the feedback
   * summary waits behind it. The flag exists so the review's primary action can
   * say where it leads ("See my full feedback") instead of just closing.
   */
  const [improvementReviewLeadsToFeedback, setImprovementReviewLeadsToFeedback] = useState(false);

  const [isGeneratingScenario, setIsGeneratingScenario] = useState(false);
  const [generateScenarioError, setGenerateScenarioError] = useState<string | null>(null);

  const [isRegeneratingKeywords, setIsRegeneratingKeywords] = useState(false);
  const [regenerateKeywordsError, setRegenerateKeywordsError] = useState<string | null>(null);

  const [isSuggestingKeywords, setIsSuggestingKeywords] = useState(false);
  const [suggestKeywordsError, setSuggestKeywordsError] = useState<string | null>(null);

  const [activeBackgroundTask, setActiveBackgroundTask] = useState<BackgroundTask | null>(null);
  const enrichmentAttempted = useRef(new Set<string>());
  const cleanupTimeoutRef = useRef<number | null>(null);
  const isMounted = useRef(true);
  const enrichingRef = useRef(new Set<string>());

  // The question currently on screen. AI calls capture the prompt they were
  // started for; when one resolves AFTER the user has moved to a different
  // question, its result must not surface in the UI (the library save still
  // happens — it belongs to the evaluated prompt regardless).
  const activePromptIdRef = useRef<string | undefined>(currentPrompt?.id);
  useEffect(() => {
    activePromptIdRef.current = currentPrompt?.id;
  }, [currentPrompt?.id]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (cleanupTimeoutRef.current) clearTimeout(cleanupTimeoutRef.current);
    };
  }, []);

  const handleApiError = useCallback(
    (error: unknown): string => {
      if (error instanceof gemini.ApiKeyError) {
        onApiKeyInvalid();
        return error.message;
      }
      if (error instanceof gemini.QuotaExceededError) {
        showToast(error.message, 'error');
        return error.message;
      }
      // Paywall, not a fault: the server refused because the free tier's daily
      // evaluations are spent (the client's own counter can be cleared, so
      // this is the authoritative one). Open the upgrade prompt rather than
      // leaving an error message the user can't act on.
      if (error instanceof gemini.EvaluationLimitError) {
        // The server's figures win over the local mirror — including the
        // limit, which an admin can change in the database without a deploy.
        syncFreeEvalCount(error.used, error.limit);
        showToast(error.message, 'info');
        // Same limit, reached server-side rather than caught by the local
        // pre-check — so the prompt must say the same thing.
        requestUpgrade('fullFeedback', 'dailyLimit');
        return error.message;
      }
      // The plan doesn't include this feature at all. Sell the RIGHT thing:
      // the prompt is opened for the feature that was actually refused.
      if (error instanceof gemini.FeatureLockedError) {
        showToast(error.message, 'info');
        requestUpgrade(error.feature as PremiumFeatureKey);
        return error.message;
      }
      return error instanceof Error ? error.message : 'An unknown API error occurred.';
    },
    [onApiKeyInvalid, showToast]
  );

  const evaluate = useCallback(
    async (answer: string, prompt: Prompt) => {
      setIsEvaluating(true);
      setEvaluationError(null);
      setImprovement(null);
      setShowImprovementReview(false);
      setImprovementReviewLeadsToFeedback(false);
      const evalStart = Date.now();
      emitEvalProgress({ phase: 'started', message: 'Preparing evaluation...' });
      try {
        const result = await gemini.evaluateAnswer(answer, prompt);
        // The server has now spent one of the caller's daily evaluations, so
        // spend one from the local mirror too — HERE, at the point the call
        // actually happened. It used to be an effect on `evaluationResult` in
        // App, which fired again every time the object was replaced: rating
        // the feedback (handleFeedbackSubmit spreads a new result) charged the
        // student a second evaluation the server never metered.
        recordEvaluation();
        const elapsed = Math.round((Date.now() - evalStart) / 1000);
        emitEvalProgress({
          phase: 'done',
          message: `Evaluation complete (${elapsed}s)`,
          elapsedMs: Date.now() - evalStart,
        });

        updateCourses((draft) => {
          findAndUpdateItem(draft, statePath, (p: Draft<Prompt>) => {
            if (!p.sampleAnswers) p.sampleAnswers = [];

            const userSample: SampleAnswer = {
              id: generateId('sa'),
              answer: answer,
              mark: result.overallMark,
              band: result.overallBand,
              source: 'USER',
              feedback: result.overallFeedback,
              quickTip: result.quickTip,
            };
            p.sampleAnswers = addAndPruneSampleAnswers(p.sampleAnswers, userSample);

            // Guard on the TEXT, not on the field being present. A free-tier
            // result has had its rewrite withheld by the proxy
            // (redactPaidFeedback), and in the structured form that leaves a
            // truthy object with an empty `text` — which would save a blank
            // sample answer carrying the model's mark and band, and let it
            // evict a real exemplar through addAndPruneSampleAnswers. The same
            // guard covers a model that returns an empty rewrite because the
            // answer already scored full marks.
            const revisedText =
              typeof result.revisedAnswer === 'string'
                ? result.revisedAnswer
                : (result.revisedAnswer?.text ?? '');

            if (result.revisedAnswer && revisedText.trim()) {
              // The marker is briefed to lift the answer by exactly one mark, so
              // that is what the saved exemplar is worth unless the model said
              // otherwise in the structured form.
              const nextLevel = getNextLevelTarget(
                result.overallMark,
                prompt.totalMarks,
                getCommandTermInfo(prompt.verb).tier
              );
              const revisedMark =
                typeof result.revisedAnswer === 'object'
                  ? result.revisedAnswer.mark
                  : nextLevel.targetMark;

              const revisedBand =
                typeof result.revisedAnswer === 'object' && result.revisedAnswer.band
                  ? result.revisedAnswer.band
                  : getBandForMark(
                      revisedMark,
                      prompt.totalMarks,
                      getCommandTermInfo(prompt.verb).tier
                    );
              const aiSample: SampleAnswer = {
                id: generateId('sa'),
                answer: revisedText,
                mark: revisedMark,
                band: revisedBand,
                source: 'AI',
                // A lift of THIS student's response, not an exemplar written
                // from scratch — the library badges the two differently.
                derivedFromStudent: true,
                feedback: `This Band ${revisedBand} revision scores ${revisedMark}/${prompt.totalMarks}. It demonstrates the cognitive demand of '${prompt.verb}' at this level — ${revisedBand >= 5 ? 'providing sophisticated analysis with specific terminology and clear cause-effect reasoning' : revisedBand >= 3 ? 'explaining key concepts with adequate detail but lacking the depth or specificity of higher bands' : 'identifying basic elements with limited development or connection to the scenario'}.`,
              };
              p.sampleAnswers = addAndPruneSampleAnswers(p.sampleAnswers, aiSample);
            }
          });
        });

        // Surface the mark BEFORE any bookkeeping. Only if the user is still on
        // the question that was marked — a late response must not open the
        // feedback modal over a different question.
        if (activePromptIdRef.current === prompt.id) {
          setEvaluationResult(result);
          // Lead with the comparison when marking produced a rewrite: "here are
          // the words that would have earned the next mark" lands before a page
          // of criteria, not after it. Guarded on the TEXT for the same reason
          // the library save is — a free-tier result carries a truthy but empty
          // rewrite, and opening an empty diff over the feedback would be a
          // blank screen between the student and their mark.
          const rewrite =
            typeof result.revisedAnswer === 'string'
              ? result.revisedAnswer
              : (result.revisedAnswer?.text ?? '');
          if (rewrite.trim()) {
            setImprovementReviewLeadsToFeedback(true);
            setShowImprovementReview(true);
          }
          const elapsed2 = Math.round((Date.now() - evalStart) / 1000);
          showToast(`Marking complete in ${elapsed2}s. Results auto-saved to library.`, 'success');
        }

        // Bookkeeping, fire-and-forget: a student waiting 40s for a mark must
        // not then wait on an IndexedDB write, and nothing here can be allowed
        // to throw its way past the result above into the catch block.
        // The cache key comes from the generator so it hashes the WHOLE answer
        // — the hand-rolled key used `answer.slice(0, 100)`, so two responses
        // sharing an opening paragraph mapped to the same entry.
        void AICache.set(AICache.generateEvaluationKey(prompt.id, answer), result);

        void persistResponse(prompt.id, {
          draft: answer,
          wordCount: answer.trim().split(/\s+/).filter(Boolean).length,
          result,
        });
      } catch (error) {
        const elapsed = Math.round((Date.now() - evalStart) / 1000);
        emitEvalProgress({
          phase: 'error',
          message: `Evaluation failed after ${elapsed}s`,
          elapsedMs: Date.now() - evalStart,
        });
        console.error(`[Evaluation] Failed after ${elapsed}s:`, error);
        const message = handleApiError(error);
        if (activePromptIdRef.current === prompt.id) setEvaluationError(message);
      } finally {
        setIsEvaluating(false);
      }
    },
    [handleApiError, updateCourses, statePath, showToast]
  );

  const resetEvaluation = useCallback(() => {
    setEvaluationResult(null);
    setEvaluationError(null);
    setImprovement(null);
    setShowImprovementReview(false);
    setImprovementReviewLeadsToFeedback(false);
    setIsEvaluating(false);
    setIsImproving(false);
  }, []);

  useEffect(() => {
    resetEvaluation();
  }, [currentPrompt?.id, resetEvaluation]);

  const improveAnswer = useCallback(
    async (originalAnswer: string, prompt: Prompt, evaluation: EvaluationResult) => {
      setIsImproving(true);
      setImproveAnswerError(null);
      setImprovement(null);
      setShowImprovementReview(false);
      // "Improve my answer" is pressed FROM the feedback summary, so this
      // review is a detour off it, not the gateway to it.
      setImprovementReviewLeadsToFeedback(false);

      try {
        // The service owns the target (getNextLevelTarget): one mark up, with
        // the band that mark maps to on this question. Recomputing it here is
        // how the saved exemplar's mark used to disagree with what the model
        // was briefed to write — and a band-jump target could even land on a
        // mark at or below the one the student already earned.
        const improved = await gemini.improveAnswer(originalAnswer, prompt, evaluation);
        const { text, mark: targetMark, band: targetBand } = improved;

        // Auto-Save Logic for the specific improved answer
        updateCourses((draft) => {
          findAndUpdateItem(draft, statePath, (p: Draft<Prompt>) => {
            if (!p.sampleAnswers) p.sampleAnswers = [];

            const aiSample: SampleAnswer = {
              id: generateId('sa'),
              answer: text,
              mark: targetMark,
              band: targetBand,
              source: 'AI',
              derivedFromStudent: true,
              feedback: `This Band ${targetBand} exemplar scores ${targetMark}/${prompt.totalMarks} — one mark above the original attempt. It keeps the student's own response and lifts it by ${targetBand >= 5 ? 'sharpening the terminology and completing the analysis the command verb demands' : targetBand >= 3 ? 'adding the missing detail and making the links between points explicit' : 'addressing more of what the question asks and developing the points already made'}.`,
            };

            p.sampleAnswers = addAndPruneSampleAnswers(p.sampleAnswers, aiSample);
          });
        });

        // As with evaluate: the exemplar is saved to the library either way,
        // but a late result must not surface on a different question.
        if (activePromptIdRef.current === prompt.id) {
          setImprovement({
            text,
            mark: targetMark,
            band: targetBand,
            originalAnswer,
            originalMark: evaluation.overallMark,
          });
          setShowImprovementReview(true);
          // The feedback modal renders the exemplar from `evaluationResult`, so
          // a regenerated upgrade has to land there or the button spins, saves a
          // sample and visibly changes nothing.
          setEvaluationResult((prev) =>
            prev
              ? {
                  ...prev,
                  revisedAnswer: { text, mark: targetMark, band: targetBand, keyChanges: [] },
                }
              : prev
          );
          showToast(
            `Auto-saved ${targetMark}/${prompt.totalMarks} (Band ${targetBand}) exemplar to library.`,
            'success'
          );
        }
        return text;
      } catch (error) {
        const message = handleApiError(error);
        if (activePromptIdRef.current === prompt.id) setImproveAnswerError(message);
        return null;
      } finally {
        setIsImproving(false);
      }
    },
    [showToast, handleApiError, updateCourses, statePath]
  );

  /**
   * Re-mark saved exemplars against the rubric.
   *
   * `sampleIds` narrows it to a chosen few. Recalibration is metered marking —
   * one evaluation per sample — so re-marking eight exemplars to fix the one
   * that looks wrong spends seven units for nothing.
   */
  const recalibrateSamples = useCallback(
    async (prompt: Prompt, sampleIds?: string[]) => {
      const all = prompt.sampleAnswers || [];
      const samples = sampleIds ? all.filter((s) => sampleIds.includes(s.id)) : all;
      if (samples.length === 0) return;

      showToast(`Recalibrating ${samples.length} sample answers...`, 'info');

      // Create a "Clean" prompt context with no existing samples.
      // This forces the AI to grade purely against the rubric, preventing circular validation
      // where it might otherwise use a bad sample as a benchmark for itself.
      const calibrationPrompt = { ...prompt, sampleAnswers: [] };

      let updatedCount = 0;
      const updates: SampleAnswer[] = [];

      // Process sequentially to avoid API limits on batch ops
      for (const sample of samples) {
        try {
          // We reuse evaluateAnswer as it provides robust marking logic including thinking blocks
          const result = await gemini.evaluateAnswer(sample.answer, calibrationPrompt);
          // Recalibration is marking, and the server meters it as such
          // (consume_evaluation, schema §14) — one unit per sample. Mirror it
          // so the remaining count doesn't overstate what is left.
          recordEvaluation();

          updates.push({
            ...sample,
            mark: result.overallMark,
            band: result.overallBand,
            feedback: result.overallFeedback,
            quickTip: result.quickTip,
          });
          updatedCount++;
        } catch (e) {
          console.error(`Failed to recalibrate sample ${sample.id}`, e);
          updates.push(sample); // Keep original on failure
        }
      }

      if (updatedCount > 0) {
        // Merge by id rather than replacing the array wholesale. The old
        // assignment dropped any exemplar added while the batch was running,
        // and with a narrowed selection it would have deleted every sample the
        // teacher did NOT choose.
        const byId = new Map(updates.map((u) => [u.id, u]));
        updateCourses((draft) => {
          findAndUpdateItem(draft, statePath, (p: Draft<Prompt>) => {
            p.sampleAnswers = (p.sampleAnswers || []).map((s) => byId.get(s.id) ?? s);
          });
        });
        showToast(`Recalibration complete. Updated ${updatedCount} answers.`, 'success');
      } else {
        showToast('Failed to recalibrate samples. Check API connection.', 'error');
      }
    },
    [updateCourses, statePath, showToast]
  );

  useEffect(() => {
    setEnrichError(null);
  }, [currentPrompt?.id]);

  // The syllabus content the selected question sits under — the dot point and
  // its named examples, sub-topic, topic and linked-outcome text — so keyword
  // generation is grounded in the syllabus rather than the question wording.
  const buildSyllabusContext = useCallback((): gemini.SyllabusKeywordContext | undefined => {
    if (!currentCourse) return undefined;
    const { topic, subTopic, dotPoint } = findSelectionContext(currentCourse, statePath);
    const outcomeTexts = (currentPrompt?.linkedOutcomes || [])
      .map((code) => currentCourse.outcomes.find((o) => o.code === code))
      .filter((o): o is CourseOutcome => !!o)
      .map((o) => `${o.code}: ${o.description}`);
    return {
      topicName: topic?.name,
      subTopicName: subTopic?.name,
      dotPoint: dotPoint?.description,
      focusAreas: getFocusAreas(dotPoint),
      outcomeTexts,
    };
  }, [currentCourse, statePath, currentPrompt?.linkedOutcomes]);

  useEffect(() => {
    const promptId = currentPrompt?.id;
    if (!currentPrompt || !currentCourse || !promptId) return;

    if (enrichmentAttempted.current.has(promptId)) return;
    if (enrichingRef.current.has(promptId)) return;

    const hasOutcomesToLink = currentCourse.outcomes && currentCourse.outcomes.length > 0;
    const needsEnrichment =
      !currentPrompt.keywords?.length ||
      !currentPrompt.scenario ||
      (hasOutcomesToLink && !currentPrompt.linkedOutcomes?.length);

    if (!needsEnrichment) {
      enrichmentAttempted.current.add(promptId);
      return;
    }

    let aborted = false;

    const enrich = async () => {
      enrichingRef.current.add(promptId);
      setIsEnriching(true);
      setEnrichError(null);

      try {
        const result = await gemini.enrichPromptDetails(currentPrompt, {
          name: currentCourse.name,
          outcomes: currentCourse.outcomes,
          syllabus: buildSyllabusContext(),
        });

        if (result && !aborted && isMounted.current) {
          void AICache.set(AICache.generateEnrichKey(promptId), result);
          updateCourses((draft) => {
            findAndUpdateItem(draft, statePath, (p: Draft<Prompt>) => {
              if (p.id === promptId) {
                if (result.scenario && !p.scenario) p.scenario = result.scenario;
                if (result.keywords && (!p.keywords || p.keywords.length === 0))
                  p.keywords = result.keywords;
                if (result.linkedOutcomes && (!p.linkedOutcomes || p.linkedOutcomes.length === 0))
                  p.linkedOutcomes = result.linkedOutcomes;
              }
            });
          });
        }
      } catch (error) {
        const message = handleApiError(error);
        if (!aborted && isMounted.current && currentPrompt?.id === promptId) {
          setEnrichError(message);
        }
      } finally {
        enrichingRef.current.delete(promptId);
        enrichmentAttempted.current.add(promptId);

        if (enrichingRef.current.size === 0 && !aborted) {
          setIsEnriching(false);
        }
      }
    };
    enrich();

    return () => {
      aborted = true;
    };
  }, [
    currentPrompt?.id,
    currentCourse?.id,
    updateCourses,
    handleApiError,
    statePath,
    buildSyllabusContext,
  ]);

  const handleGenerateScenario = useCallback(async () => {
    if (!currentPrompt) return;
    setIsGeneratingScenario(true);
    setGenerateScenarioError(null);
    try {
      const scenario = await gemini.generateScenarioForPrompt(currentPrompt);
      if (scenario) {
        void AICache.set(AICache.generateScenarioKey(currentPrompt.id), scenario);
        updateCourses((draft) =>
          findAndUpdateItem(draft, statePath, (p: Draft<Prompt>) => {
            p.scenario = scenario;
          })
        );
        showToast('New scenario generated.', 'success');
      }
    } catch (error) {
      const message = handleApiError(error);
      setGenerateScenarioError(message);
    } finally {
      setIsGeneratingScenario(false);
    }
  }, [currentPrompt, statePath, updateCourses, showToast, handleApiError]);

  const handleRegenerateKeywords = useCallback(async () => {
    if (!currentPrompt) return;
    setIsRegeneratingKeywords(true);
    setRegenerateKeywordsError(null);
    try {
      // The question's OWN verb, not the typical verb for its mark value —
      // an off-scheme pairing (e.g. an 8-mark DESCRIBE) must get keywords
      // pitched at its actual cognitive demand.
      const commandTermInfo = getCommandTermInfo(currentPrompt.verb);
      const keywords = await gemini.generateKeywordsForPrompt(
        currentPrompt,
        commandTermInfo,
        buildSyllabusContext()
      );
      if (keywords) {
        void AICache.set(AICache.generateKeywordsKey(currentPrompt.id), keywords);
        updateCourses((draft) =>
          findAndUpdateItem(draft, statePath, (p: Draft<Prompt>) => {
            p.keywords = keywords;
          })
        );
        showToast('Keywords have been regenerated.', 'success');
      }
    } catch (error) {
      const message = handleApiError(error);
      setRegenerateKeywordsError(message);
    } finally {
      setIsRegeneratingKeywords(false);
    }
  }, [currentPrompt, statePath, updateCourses, showToast, handleApiError, buildSyllabusContext]);

  const handleSuggestKeywords = useCallback(async () => {
    if (!currentPrompt) return;
    setIsSuggestingKeywords(true);
    setSuggestKeywordsError(null);
    try {
      // Same rule as handleRegenerateKeywords: key off the question's own verb.
      const commandTermInfo = getCommandTermInfo(currentPrompt.verb);
      const generated = await gemini.generateKeywordsForPrompt(
        currentPrompt,
        commandTermInfo,
        buildSyllabusContext()
      );
      if (generated) {
        updateCourses((draft) =>
          findAndUpdateItem(draft, statePath, (p: Draft<Prompt>) => {
            const updatedKeywords = [...new Set([...(p.keywords || []), ...generated])];
            p.keywords = updatedKeywords;
          })
        );
        showToast('Suggested keywords added.', 'success');
      }
    } catch (error) {
      const message = handleApiError(error);
      setSuggestKeywordsError(message);
    } finally {
      setIsSuggestingKeywords(false);
    }
  }, [currentPrompt, statePath, updateCourses, showToast, handleApiError, buildSyllabusContext]);

  const generateDotPointsForSubTopic = useCallback(
    async (courseName: string, topicName: string, subTopicName: string) => {
      try {
        const result = await gemini.generateDotPointsForSubTopic(
          courseName,
          topicName,
          subTopicName
        );
        if (result) {
          showToast(`${result.length} dot points generated.`, 'success');
        }
        return result;
      } catch (error) {
        handleApiError(error);
        return null;
      }
    },
    [showToast, handleApiError]
  );

  const handleStartFullSyllabusImport = useCallback(
    async (
      courseName: string,
      structure: PreviewNode[],
      outcomes: CourseOutcome[],
      targetCourseId?: string,
      targetTopicId?: string
    ) => {
      const taskId = generateId('task');

      // Build fresh topics from the (already-normalised) preview structure.
      const builtTopics: Topic[] = structure.map((topicNode) => ({
        id: generateId('topic'),
        name: topicNode.name,
        subTopics: (topicNode.subTopics || []).map((stNode) => ({
          id: generateId('subTopic'),
          name: stNode.name,
          dotPoints: (stNode.dotPoints || []).map((dpText) => ({
            id: generateId('dp'),
            description: dpText,
            prompts: [],
          })),
        })),
      }));

      const stats = {
        topics: builtTopics.length,
        subTopics: builtTopics.reduce((a, t) => a + t.subTopics.length, 0),
        dotPoints: builtTopics.reduce(
          (a, t) => a + t.subTopics.reduce((b, st) => b + st.dotPoints.length, 0),
          0
        ),
      };

      let resolvedCourseId = '';
      let resolvedCourseName = courseName;
      let merged = false;
      let targetTopicName = '';

      updateCourses((draft) => {
        const existing = targetCourseId ? draft.find((c) => c.id === targetCourseId) : undefined;
        if (existing) {
          const idx = draft.findIndex((c) => c.id === existing.id);
          resolvedCourseId = existing.id;
          resolvedCourseName = existing.name;
          merged = true;

          const targetTopic = targetTopicId
            ? existing.topics.find((t) => t.id === targetTopicId)
            : undefined;

          if (targetTopic) {
            // Funnel everything into one existing topic: flatten all parsed
            // sub-topics into it and merge (matching sub-topic names combine).
            targetTopicName = targetTopic.name;
            const importedTopic: Topic = {
              id: targetTopic.id,
              name: targetTopic.name,
              subTopics: builtTopics.flatMap((t) => t.subTopics),
            };
            const mergedTopic = mergeTopicContents(targetTopic, importedTopic);
            const tIdx = existing.topics.findIndex((t) => t.id === targetTopic.id);
            draft[idx].topics[tIdx] = mergedTopic;

            // Merge any new outcomes by code.
            const codes = new Set(draft[idx].outcomes.map((o) => o.code));
            outcomes.forEach((o) => {
              if (!codes.has(o.code)) draft[idx].outcomes.push(o);
            });
          } else {
            // Merge into the course: topics with a matching name have their
            // sub-topics/dot points merged; new topics are appended; outcomes
            // are merged by code (see mergeCourseContents).
            const importedCourse: Course = {
              id: existing.id,
              name: existing.name,
              topics: builtTopics,
              outcomes,
            };
            draft[idx] = mergeCourseContents(existing, importedCourse);
          }
        } else {
          const newCourse: Course = {
            id: generateId('course'),
            name: courseName,
            topics: builtTopics,
            outcomes,
          };
          draft.push(newCourse);
          resolvedCourseId = newCourse.id;
        }
      });

      if (isMounted.current) {
        setActiveBackgroundTask({
          id: taskId,
          name: merged ? `Updating ${resolvedCourseName}` : `Importing ${resolvedCourseName}`,
          status: 'completed',
          progress: 100,
          message: merged ? 'Merged successfully!' : 'Imported successfully!',
          courseId: resolvedCourseId,
        });

        if (targetTopicName) {
          showToast(
            `Added ${stats.subTopics} sub-topics and ${stats.dotPoints} dot points to ` +
              `"${targetTopicName}".`,
            'success'
          );
        } else {
          showToast(
            `${merged ? 'Merged into' : 'Imported'} "${resolvedCourseName}": ` +
              `${stats.topics} topics, ${stats.subTopics} sub-topics, ${stats.dotPoints} dot points.`,
            'success'
          );
        }

        if (cleanupTimeoutRef.current) clearTimeout(cleanupTimeoutRef.current);
        cleanupTimeoutRef.current = window.setTimeout(() => {
          if (isMounted.current) {
            setActiveBackgroundTask(null);
          }
        }, BG_TASK_CLEANUP_DELAY);
      }
      return resolvedCourseId;
    },
    [updateCourses, showToast]
  );

  const handleFeedbackSubmit = useCallback(
    (feedback: UserFeedback) => {
      setEvaluationResult((prev) => {
        if (!prev) return null;
        return { ...prev, userFeedback: feedback };
      });
      // Mirror the rating onto the persisted response (Supabase mode only;
      // best-effort). No-ops if the response was never stored.
      if (currentPrompt) void saveResponseFeedback(currentPrompt.id, feedback);
      showToast('Thank you for your feedback!', 'success');
    },
    [showToast, currentPrompt]
  );

  return {
    evaluationResult,
    setEvaluationResult,
    isEvaluating,
    evaluationError,
    isEnriching,
    enrichError,
    setEnrichError,
    isImproving,
    improveAnswerError,
    improvement,
    setImprovement,
    showImprovementReview,
    setShowImprovementReview,
    improvementReviewLeadsToFeedback,
    isGeneratingScenario,
    generateScenarioError,
    isRegeneratingKeywords,
    regenerateKeywordsError,
    isSuggestingKeywords,
    suggestKeywordsError,
    activeBackgroundTask,
    evaluate,
    resetEvaluation,
    improveAnswer,
    handleGenerateScenario,
    handleRegenerateKeywords,
    handleSuggestKeywords,
    suggestOutcomesForPrompt: gemini.suggestOutcomesForPrompt,
    generateDotPointsForSubTopic,
    handleStartFullSyllabusImport,
    handleFeedbackSubmit,
    recalibrateSamples,
  };
};
