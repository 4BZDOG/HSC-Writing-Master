import { useState, useCallback, useEffect, useRef } from 'react';
import { Draft } from 'immer';
import { Course, StatePath, EvaluationResult, Prompt, DotPoint, SubTopic, Topic, CourseOutcome, BackgroundTask, CommandTermInfo, User, UserFeedback, SampleAnswer } from '../types';
import * as gemini from '../services/geminiService';
import { AICache } from '../services/aiCache';
import { findAndUpdateItem } from '../utils/stateUtils';
import { getCommandTermsForMarks } from '../data/commandTerms';
import { generateId } from '../utils/idUtils';

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

export const useGemini = ({ showToast, updateCourses, statePath, currentPrompt, currentCourse, onApiKeyInvalid, user, onUpdateUser }: GeminiHookProps) => {
  const [evaluationResult, setEvaluationResult] = useState<EvaluationResult | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);

  const [isImproving, setIsImproving] = useState(false);
  const [improveAnswerError, setImproveAnswerError] = useState<string | null>(null);
  const [improvedAnswer, setImprovedAnswer] = useState<string | null>(null);
  const [originalAnswerForImprovement, setOriginalAnswerForImprovement] = useState<string | null>(null);
  
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
    }
  }, []);

  const handleApiError = useCallback((error: unknown): string => {
    if (error instanceof gemini.ApiKeyError) {
      onApiKeyInvalid();
      return error.message;
    }
    if (error instanceof gemini.QuotaExceededError) {
        showToast(error.message, 'error');
        return error.message;
    }
    return error instanceof Error ? error.message : 'An unknown API error occurred.';
  }, [onApiKeyInvalid, showToast]);

  const evaluate = useCallback(async (answer: string, prompt: Prompt) => {
    setIsEvaluating(true);
    setEvaluationError(null);
    setImprovedAnswer(null); // Clear previous improvements on new eval
    setOriginalAnswerForImprovement(null);
    try {
      const result = await gemini.evaluateAnswer(answer, prompt);
      await AICache.set(`evaluate:${prompt.id}:${answer.slice(0, 100)}`, result);
      setEvaluationResult(result);
    } catch (error) {
      const message = handleApiError(error);
      setEvaluationError(message);
    } finally {
      setIsEvaluating(false);
    }
  }, [handleApiError]);

  // Reset evaluation state. Useful for modal closure or navigation.
  const resetEvaluation = useCallback(() => {
      setEvaluationResult(null);
      setEvaluationError(null);
      setImprovedAnswer(null);
      setOriginalAnswerForImprovement(null);
      setIsEvaluating(false);
      setIsImproving(false);
  }, []);

  // Auto-reset evaluation when the prompt ID changes (Navigation)
  useEffect(() => {
      resetEvaluation();
  }, [currentPrompt?.id, resetEvaluation]);
  
  const improveAnswer = useCallback(async (originalAnswer: string, prompt: Prompt, evaluation: EvaluationResult) => {
    setIsImproving(true);
    setImproveAnswerError(null);
    setImprovedAnswer(null);
    setOriginalAnswerForImprovement(null);

    try {
        const targetBand = Math.min(6, evaluation.overallBand + 1);
        const improved = await gemini.improveAnswer(originalAnswer, prompt, evaluation, targetBand);
        
        // Auto-Save Logic:
        updateCourses(draft => {
            findAndUpdateItem(draft, statePath, (p: Draft<Prompt>) => {
                if (!p.sampleAnswers) p.sampleAnswers = [];

                // 1. Auto-save Student's Original (Prevent duplicates)
                const existingUserAnswer = p.sampleAnswers.find(sa => sa.answer === originalAnswer && sa.source === 'USER');
                if (!existingUserAnswer) {
                    p.sampleAnswers.push({
                        id: generateId('sa'),
                        answer: originalAnswer,
                        mark: evaluation.overallMark,
                        band: evaluation.overallBand,
                        source: 'USER',
                        feedback: evaluation.overallFeedback
                    });
                }

                // 2. Auto-save AI Improved Version (Prevent duplicates)
                const existingAiAnswer = p.sampleAnswers.find(sa => sa.answer === improved && sa.source === 'AI');
                if (!existingAiAnswer) {
                    p.sampleAnswers.push({
                         id: generateId('sa'),
                         answer: improved,
                         mark: Math.min(prompt.totalMarks, Math.ceil(prompt.totalMarks * (targetBand/6))), // Approximate mark based on band
                         band: targetBand,
                         source: 'AI',
                         feedback: `Auto-generated improvement targeting Band ${targetBand}.`
                    });
                }
            });
        });

        setImprovedAnswer(improved);
        setOriginalAnswerForImprovement(originalAnswer);
        showToast(`Generated and saved Band ${targetBand} improvement.`, 'success');
        return improved;
    } catch (error) {
        const message = handleApiError(error);
        setImproveAnswerError(message);
        return null;
    } finally {
        setIsImproving(false);
    }
  }, [showToast, handleApiError, updateCourses, statePath]);
  
  useEffect(() => {
    setEnrichError(null);
  }, [currentPrompt?.id]);

  useEffect(() => {
    const promptId = currentPrompt?.id;
    if (!currentPrompt || !currentCourse || !promptId) return;

    if (enrichmentAttempted.current.has(promptId)) return;
    if (enrichingRef.current.has(promptId)) return;

    const needsEnrichment = !currentPrompt.keywords?.length || !currentPrompt.scenario || !currentPrompt.linkedOutcomes?.length;

    if (!needsEnrichment) {
      enrichmentAttempted.current.add(promptId);
      return;
    }
    
    const enrich = async () => {
      enrichingRef.current.add(promptId);
      setIsEnriching(true);
      setEnrichError(null);
      
      try {
        const result = await gemini.enrichPromptDetails(currentPrompt, { name: currentCourse.name, outcomes: currentCourse.outcomes });
        
        if (result) {
            await AICache.set(`enrich:${promptId}`, result);
            updateCourses(draft => {
                findAndUpdateItem(draft, statePath, (p: Draft<Prompt>) => {
                    if (p.id === promptId) {
                        if (result.scenario && !p.scenario) p.scenario = result.scenario;
                        if (result.keywords && (!p.keywords || p.keywords.length === 0)) p.keywords = result.keywords;
                        if (result.linkedOutcomes && (!p.linkedOutcomes || p.linkedOutcomes.length === 0)) p.linkedOutcomes = result.linkedOutcomes;
                    }
                });
            });
        }
      } catch (error) {
          const message = handleApiError(error);
          if (isMounted.current && currentPrompt?.id === promptId) {
            setEnrichError(message);
          }
      } finally {
        enrichingRef.current.delete(promptId);
        enrichmentAttempted.current.add(promptId);
        
        if (enrichingRef.current.size === 0) {
            setIsEnriching(false);
        }
      }
    };
    enrich();
    
  }, [currentPrompt?.id, currentCourse?.id, updateCourses, handleApiError, statePath]);


  const handleGenerateScenario = useCallback(async () => {
    if (!currentPrompt) return;
    setIsGeneratingScenario(true);
    setGenerateScenarioError(null);
    try {
      const scenario = await gemini.generateScenarioForPrompt(currentPrompt);
      if (scenario) {
        await AICache.set(`scenario:${currentPrompt.id}`, scenario);
        updateCourses(draft => findAndUpdateItem(draft, statePath, (p: Draft<Prompt>) => { p.scenario = scenario; }));
        showToast("New scenario generated.", 'success');
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
          updateCourses(draft => findAndUpdateItem(draft, statePath, (p: Draft<Prompt>) => { p.keywords = keywords; }));
          showToast("Keywords have been regenerated.", 'success');
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
          updateCourses(draft => findAndUpdateItem(draft, statePath, (p: Draft<Prompt>) => { 
            const updatedKeywords = [...new Set([...(p.keywords || []), ...generated])];
            p.keywords = updatedKeywords;
          }));
          showToast("Suggested keywords added.", 'success');
        }
    } catch (error) {
        const message = handleApiError(error);
        setSuggestKeywordsError(message);
    } finally {
        setIsSuggestingKeywords(false);
    }
  }, [currentPrompt, statePath, updateCourses, showToast, handleApiError]);
  
  const generateDotPointsForSubTopic = useCallback(async (courseName: string, topicName: string, subTopicName: string) => {
    try {
        const result = await gemini.generateDotPointsForSubTopic(courseName, topicName, subTopicName);
        if(result) {
            showToast(`${result.length} dot points generated.`, 'success');
        }
        return result;
    } catch (error) {
        handleApiError(error);
        return null;
    }
  }, [showToast, handleApiError]);

  const handleStartFullSyllabusImport = useCallback(async (courseName: string, structure: PreviewNode[], outcomes: CourseOutcome[]) => {
    const taskId = generateId('task');
    const newCourse: Course = { id: generateId('course'), name: courseName, topics: [], outcomes };
    
    // 1. Convert structure to full Course object synchronously
    structure.forEach(topicNode => {
        const topic: Topic = {
            id: generateId('topic'),
            name: topicNode.name,
            subTopics: topicNode.subTopics.map(stNode => ({
                id: generateId('subTopic'),
                name: stNode.name,
                dotPoints: stNode.dotPoints.map(dpText => ({
                    id: generateId('dp'),
                    description: dpText,
                    prompts: []
                }))
            }))
        };
        newCourse.topics.push(topic);
    });

    updateCourses(draft => { draft.push(newCourse) });
    
    if (isMounted.current) {
        // Mock progress for immediate feedback
        setActiveBackgroundTask({ id: taskId, name: `Importing ${courseName}`, status: 'completed', progress: 100, message: `Imported successfully!`, courseId: newCourse.id });
        
        const stats = { 
            topics: newCourse.topics.length, 
            subTopics: newCourse.topics.reduce((a, t) => a + t.subTopics.length, 0),
            dotPoints: newCourse.topics.reduce((a, t) => a + t.subTopics.reduce((b, st) => b + st.dotPoints.length, 0), 0)
        };
        
        showToast(`Imported "${courseName}" with ${stats.topics} topics, ${stats.subTopics} sub-topics, and ${stats.dotPoints} dot points.`, 'success');

        cleanupTimeoutRef.current = window.setTimeout(() => {
            if(isMounted.current) {
                setActiveBackgroundTask(null)
            }
        }, 3000);
    }
    return newCourse;
  }, [updateCourses, showToast]);

  const handleFeedbackSubmit = useCallback((feedback: UserFeedback) => {
      setEvaluationResult(prev => {
          if (!prev) return null;
          return { ...prev, userFeedback: feedback };
      });
      // In a real app, you would also send this to the backend here.
      // e.g., await api.sendFeedback({ ...feedback, promptId, answerId });
      showToast("Thank you for your feedback!", "success");
  }, [showToast]);

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
    setOriginalAnswerForImprovement, // Now correctly exported
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
    generateDotPointsForSubTopic,
    handleStartFullSyllabusImport,
    handleFeedbackSubmit
  };
};