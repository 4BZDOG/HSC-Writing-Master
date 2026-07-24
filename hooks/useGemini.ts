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
import { persistResponse, saveResponseFeedback } from '../services/responseService';
import { findAndUpdateItem, findSelectionContext } from '../utils/stateUtils';
import { parseSubItemsFromDescription } from '../utils/dataManagerUtils';
import { getBandForMark, getCommandTermInfo, markForBand } from '../data/commandTerms';
import { generateId } from '../utils/idUtils';
import {
  addAndPruneSampleAnswers,
  mergeCourseContents,
  mergeTopicContents,
  type SyllabusPreviewNode,
} from '../utils/dataManagerUtils';

const BG_TASK_CLEANUP_DELAY = 5000;

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
  const [improvedAnswer, setImprovedAnswer] = useState<string | null>(null);
  const [originalAnswerForImprovement, setOriginalAnswerForImprovement] = useState<string | null>(
    null
  );

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
      return error instanceof Error ? error.message : 'An unknown API error occurred.';
    },
    [onApiKeyInvalid, showToast]
  );

  const evaluate = useCallback(
    async (answer: string, prompt: Prompt) => {
      setIsEvaluating(true);
      setEvaluationError(null);
      setImprovedAnswer(null);
      setOriginalAnswerForImprovement(null);
      const evalStart = Date.now();
      emitEvalProgress({ phase: 'started', message: 'Preparing evaluation...' });
      try {
        const result = await gemini.evaluateAnswer(answer, prompt);
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

            if (result.revisedAnswer) {
              const revisedText =
                typeof result.revisedAnswer === 'string'
                  ? result.revisedAnswer
                  : result.revisedAnswer.text;

              const revisedMark =
                typeof result.revisedAnswer === 'object'
                  ? result.revisedAnswer.mark
                  : Math.min(prompt.totalMarks, result.overallMark + 1);

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
                feedback: `This Band ${revisedBand} revision scores ${revisedMark}/${prompt.totalMarks}. It demonstrates the cognitive demand of '${prompt.verb}' at this level — ${revisedBand >= 5 ? 'providing sophisticated analysis with specific terminology and clear cause-effect reasoning' : revisedBand >= 3 ? 'explaining key concepts with adequate detail but lacking the depth or specificity of higher bands' : 'identifying basic elements with limited development or connection to the scenario'}.`,
              };
              p.sampleAnswers = addAndPruneSampleAnswers(p.sampleAnswers, aiSample);
            }
          });
        });

        await AICache.set(`evaluate:${prompt.id}:${answer.slice(0, 100)}`, result);

        void persistResponse(prompt.id, {
          draft: answer,
          wordCount: answer.trim().split(/\s+/).filter(Boolean).length,
          result,
        });

        if (activePromptIdRef.current === prompt.id) {
          setEvaluationResult(result);
          const elapsed2 = Math.round((Date.now() - evalStart) / 1000);
          showToast(`Marking complete in ${elapsed2}s. Results auto-saved to library.`, 'success');
        }
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
    setImprovedAnswer(null);
    setOriginalAnswerForImprovement(null);
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
      setImprovedAnswer(null);
      setOriginalAnswerForImprovement(null);

      try {
        // Cap the improvement target at the question's tier ceiling — a verb
        // like 'Describe' (Tier 2) cannot reach Band 4+, so targeting one band
        // above the current band must not exceed what the question can award.
        const tier = getCommandTermInfo(prompt.verb).tier;
        const maxBand = getBandForMark(prompt.totalMarks, prompt.totalMarks, tier);
        const targetBand = Math.min(maxBand, evaluation.overallBand + 1);
        const improved = await gemini.improveAnswer(originalAnswer, prompt, evaluation, targetBand);

        // Auto-Save Logic for the specific improved answer
        updateCourses((draft) => {
          findAndUpdateItem(draft, statePath, (p: Draft<Prompt>) => {
            if (!p.sampleAnswers) p.sampleAnswers = [];

            // Smallest mark that still maps to the target band on this question,
            // so the saved exemplar's mark and band agree with getBandForMark.
            const aiSampleMark = markForBand(targetBand, prompt.totalMarks, tier);

            const aiSample: SampleAnswer = {
              id: generateId('sa'),
              answer: improved,
              mark: aiSampleMark,
              band: targetBand,
              source: 'AI',
              feedback: `This Band ${targetBand} exemplar scores ${aiSampleMark}/${prompt.totalMarks}. As an improvement over the original attempt, it elevates the response by ${targetBand >= 5 ? 'integrating specific terminology, demonstrating thorough analysis, and fully satisfying the cognitive demand of the command verb' : targetBand >= 3 ? 'providing clearer explanations with more relevant detail, though still below the sophistication expected at the highest bands' : 'addressing the basic requirements of the question with some relevant content'}.`,
            };

            p.sampleAnswers = addAndPruneSampleAnswers(p.sampleAnswers, aiSample);
          });
        });

        // As with evaluate: the exemplar is saved to the library either way,
        // but a late result must not surface on a different question.
        if (activePromptIdRef.current === prompt.id) {
          setImprovedAnswer(improved);
          setOriginalAnswerForImprovement(originalAnswer);
          showToast(`Auto-saved Band ${targetBand} exemplar to library.`, 'success');
        }
        return improved;
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

  const recalibrateSamples = useCallback(
    async (prompt: Prompt) => {
      const samples = prompt.sampleAnswers || [];
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
        updateCourses((draft) => {
          findAndUpdateItem(draft, statePath, (p: Draft<Prompt>) => {
            p.sampleAnswers = updates;
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
      focusAreas: dotPoint ? parseSubItemsFromDescription(dotPoint.description) : [],
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
          await AICache.set(`enrich:${promptId}`, result);
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
        await AICache.set(`scenario:${currentPrompt.id}`, scenario);
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
        await AICache.set(`keywords:${currentPrompt.id}`, keywords);
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
    improvedAnswer,
    setImprovedAnswer,
    originalAnswerForImprovement,
    setOriginalAnswerForImprovement,
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
