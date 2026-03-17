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
import { findAndUpdateItem } from '../utils/stateUtils';
import { getCommandTermsForMarks, getBandForMark, getCommandTermInfo } from '../data/commandTerms';
import { generateId } from '../utils/idUtils';
import { addAndPruneSampleAnswers } from '../utils/dataManagerUtils';

const BG_TASK_CLEANUP_DELAY = 5000;

interface PreviewNode {
  name: string;
  subTopics: {
    name: string;
    dotPoints: string[];
  }[];
}

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
      try {
        const result = await gemini.evaluateAnswer(answer, prompt);

        // Auto-save logic: Save both user attempt and AI initial revision to prompt library
        updateCourses((draft) => {
          findAndUpdateItem(draft, statePath, (p: Draft<Prompt>) => {
            if (!p.sampleAnswers) p.sampleAnswers = [];

            // 1. Save User Attempt
            const userSample: SampleAnswer = {
              id: generateId('sa'),
              answer: answer,
              mark: result.overallMark,
              band: result.overallBand,
              source: 'USER',
              feedback: result.overallFeedback,
              quickTip: result.quickTip, // Save the tip!
            };
            p.sampleAnswers = addAndPruneSampleAnswers(p.sampleAnswers, userSample);

            // 2. Save initial AI Revised Answer if provided by the evaluation model
            if (result.revisedAnswer) {
              const revisedText =
                typeof result.revisedAnswer === 'string'
                  ? result.revisedAnswer
                  : result.revisedAnswer.text;

              const revisedMark =
                typeof result.revisedAnswer === 'object'
                  ? result.revisedAnswer.mark
                  : Math.min(prompt.totalMarks, result.overallMark + 1);

              const aiSample: SampleAnswer = {
                id: generateId('sa'),
                answer: revisedText,
                mark: revisedMark,
                band:
                  typeof result.revisedAnswer === 'object' && result.revisedAnswer.band
                    ? result.revisedAnswer.band
                    : getBandForMark(
                        revisedMark,
                        prompt.totalMarks,
                        getCommandTermInfo(prompt.verb).tier
                      ),
                source: 'AI',
                feedback: 'Automated revision generated during evaluation.',
              };
              p.sampleAnswers = addAndPruneSampleAnswers(p.sampleAnswers, aiSample);
            }
          });
        });

        await AICache.set(`evaluate:${prompt.id}:${answer.slice(0, 100)}`, result);
        setEvaluationResult(result);
        showToast('Marking complete. Results auto-saved to library.', 'success');
      } catch (error) {
        const message = handleApiError(error);
        setEvaluationError(message);
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
        const targetBand = Math.min(6, evaluation.overallBand + 1);
        const improved = await gemini.improveAnswer(originalAnswer, prompt, evaluation, targetBand);

        // Auto-Save Logic for the specific improved answer
        updateCourses((draft) => {
          findAndUpdateItem(draft, statePath, (p: Draft<Prompt>) => {
            if (!p.sampleAnswers) p.sampleAnswers = [];

            const aiSampleMark = Math.min(
              prompt.totalMarks,
              Math.ceil(prompt.totalMarks * (targetBand / 6))
            );

            const aiSample: SampleAnswer = {
              id: generateId('sa'),
              answer: improved,
              mark: aiSampleMark,
              band: targetBand,
              source: 'AI',
              feedback: `Auto-generated improvement targeting Band ${targetBand}.`,
            };

            p.sampleAnswers = addAndPruneSampleAnswers(p.sampleAnswers, aiSample);
          });
        });

        setImprovedAnswer(improved);
        setOriginalAnswerForImprovement(originalAnswer);
        showToast(`Auto-saved Band ${targetBand} exemplar to library.`, 'success');
        return improved;
      } catch (error) {
        const message = handleApiError(error);
        setImproveAnswerError(message);
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

  useEffect(() => {
    const promptId = currentPrompt?.id;
    if (!currentPrompt || !currentCourse || !promptId) return;

    if (enrichmentAttempted.current.has(promptId)) return;
    if (enrichingRef.current.has(promptId)) return;

    const needsEnrichment =
      !currentPrompt.keywords?.length ||
      !currentPrompt.scenario ||
      !currentPrompt.linkedOutcomes?.length;

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
  }, [currentPrompt?.id, currentCourse?.id, updateCourses, handleApiError, statePath]);

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
      const { primaryTerm: commandTermInfo } = getCommandTermsForMarks(currentPrompt.totalMarks);
      const keywords = await gemini.generateKeywordsForPrompt(currentPrompt, commandTermInfo);
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
  }, [currentPrompt, statePath, updateCourses, showToast, handleApiError]);

  const handleSuggestKeywords = useCallback(async () => {
    if (!currentPrompt) return;
    setIsSuggestingKeywords(true);
    setSuggestKeywordsError(null);
    try {
      const { primaryTerm: commandTermInfo } = getCommandTermsForMarks(currentPrompt.totalMarks);
      const generated = await gemini.generateKeywordsForPrompt(currentPrompt, commandTermInfo);
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
  }, [currentPrompt, statePath, updateCourses, showToast, handleApiError]);

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
    async (courseName: string, structure: PreviewNode[], outcomes: CourseOutcome[]) => {
      const taskId = generateId('task');
      const newCourse: Course = {
        id: generateId('course'),
        name: courseName,
        topics: [],
        outcomes,
      };

      structure.forEach((topicNode) => {
        const topic: Topic = {
          id: generateId('topic'),
          name: topicNode.name,
          subTopics: topicNode.subTopics.map((stNode) => ({
            id: generateId('subTopic'),
            name: stNode.name,
            dotPoints: stNode.dotPoints.map((dpText) => ({
              id: generateId('dp'),
              description: dpText,
              prompts: [],
            })),
          })),
        };
        newCourse.topics.push(topic);
      });

      updateCourses((draft) => {
        draft.push(newCourse);
      });

      if (isMounted.current) {
        setActiveBackgroundTask({
          id: taskId,
          name: `Importing ${courseName}`,
          status: 'completed',
          progress: 100,
          message: `Imported successfully!`,
          courseId: newCourse.id,
        });

        const stats = {
          topics: newCourse.topics.length,
          subTopics: newCourse.topics.reduce((a, t) => a + t.subTopics.length, 0),
          dotPoints: newCourse.topics.reduce(
            (a, t) => a + t.subTopics.reduce((b, st) => b + st.dotPoints.length, 0),
            0
          ),
        };

        showToast(
          `Imported "${courseName}" with ${stats.topics} topics, ${stats.subTopics} sub-topics, and ${stats.dotPoints} dot points.`,
          'success'
        );

        if (cleanupTimeoutRef.current) clearTimeout(cleanupTimeoutRef.current);
        cleanupTimeoutRef.current = window.setTimeout(() => {
          if (isMounted.current) {
            setActiveBackgroundTask(null);
          }
        }, BG_TASK_CLEANUP_DELAY);
      }
      return newCourse;
    },
    [updateCourses, showToast]
  );

  const handleFeedbackSubmit = useCallback(
    (feedback: UserFeedback) => {
      setEvaluationResult((prev) => {
        if (!prev) return null;
        return { ...prev, userFeedback: feedback };
      });
      showToast('Thank you for your feedback!', 'success');
    },
    [showToast]
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
