/**
 * Shared types for the handler "bundles" passed from App.tsx down into
 * AppModals and other consumers. Previously these props were typed as `any`
 * (QUAL-01), which removed type safety across the most critical boundaries of
 * the app.
 *
 * Each bundle is derived with `Pick` from the originating hook's return type,
 * so the signatures stay correct automatically and any drift between the hook
 * and a consumer is caught by the compiler.
 */
import type { useNavigation } from '../hooks/useNavigation';
import type { useModalManager } from '../hooks/useModalManager';
import type { useSyllabusData } from '../hooks/useSyllabusData';
import type { useGemini } from '../hooks/useGemini';

type NavigationHook = ReturnType<typeof useNavigation>;
type ModalManagerHook = ReturnType<typeof useModalManager>;
type SyllabusHook = ReturnType<typeof useSyllabusData>;
type GeminiHook = ReturnType<typeof useGemini>;

/** The current navigation selection passed to modals/workspace. */
export type CurrentSelection = Pick<
  NavigationHook,
  'currentCourse' | 'currentTopic' | 'currentSubTopic' | 'currentDotPoint' | 'currentPrompt'
>;

/** Modal lifecycle handlers (subset of useModalManager used by consumers). */
export type ModalHandlers = Pick<
  ModalManagerHook,
  | 'isModalOpen'
  | 'openModal'
  | 'closeModal'
  | 'showConfirmation'
  | 'requestRename'
  | 'requestDelete'
  | 'confirmRename'
  | 'cancelRename'
  | 'confirmDelete'
  | 'cancelDelete'
  | 'handleConfirmAction'
  | 'cancelConfirmation'
  | 'showQualityCheck'
>;

/** Syllabus data/CRUD handlers plus a small number of app-level additions. */
export type SyllabusHandlers = Pick<
  SyllabusHook,
  | 'handleCreateCourse'
  | 'handleCreateTopic'
  | 'handleCreateSubTopic'
  | 'handleAddDotPoints'
  | 'handleGeneratePrompt'
  | 'confirmRename'
  | 'confirmDelete'
  | 'handleUpdateOutcomes'
  | 'handleSampleAnswerGenerated'
  | 'handleUpdateSampleAnswer'
  | 'handleDeleteSampleAnswer'
  | 'handleImportCourses'
  | 'handleImportTopic'
  | 'handleClearAllData'
  | 'handleResetToDefault'
  | 'updateCourses'
  | 'discoveredDocs'
  | 'importDiscoveredDocs'
  | 'handleMoveTopic'
> & {
  onResetApiStats: () => void;
};

/** AI generation handlers (subset of useGemini used by consumers). */
export type GeminiHandlers = Pick<
  GeminiHook,
  | 'evaluationResult'
  | 'setEvaluationResult'
  | 'handleGenerateScenario'
  | 'handleRegenerateKeywords'
  | 'handleSuggestKeywords'
  | 'suggestOutcomesForPrompt'
  | 'improveAnswer'
  | 'improvedAnswer'
  | 'setImprovedAnswer'
  | 'originalAnswerForImprovement'
  | 'setOriginalAnswerForImprovement'
  | 'isGeneratingScenario'
  | 'generateScenarioError'
  | 'isRegeneratingKeywords'
  | 'regenerateKeywordsError'
  | 'isSuggestingKeywords'
  | 'suggestKeywordsError'
  | 'generateDotPointsForSubTopic'
  | 'handleStartFullSyllabusImport'
  | 'resetEvaluation'
  | 'handleFeedbackSubmit'
  | 'setEnrichError'
>;
