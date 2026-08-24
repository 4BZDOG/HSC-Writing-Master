/**
 * Typed shapes for the handler "bags" App assembles (via `useMemo`) and threads
 * down into AppModals, Workspace and WorkspaceRightPanel. These used to cross
 * those boundaries as `any`, so a missing or renamed handler only surfaced as a
 * runtime crash when the button was clicked (and did — `handleUpdateFocusAreas`
 * was consumed by AppModals but absent from the bag).
 *
 * Each bag is derived from the hook that actually produces its members, so the
 * types stay in lock-step with the hooks instead of drifting as a hand-written
 * mirror would. The one exception is `onResetApiStats`, a small App-local
 * callback, spelled out explicitly.
 */
import type { useModalManager } from './useModalManager';
import type { useSyllabusData } from './useSyllabusData';
import type { useGemini } from './useGemini';
import type { useNavigation } from './useNavigation';

type ModalManager = ReturnType<typeof useModalManager>;
type SyllabusData = ReturnType<typeof useSyllabusData>;
type GeminiData = ReturnType<typeof useGemini>;
type Navigation = ReturnType<typeof useNavigation>;

/** The modal-orchestration props bag (targets + validation state). */
export type AppModalProps = ModalManager['modalProps'];

/** Open/close and confirm/cancel orchestration for every modal surface. */
export type AppModalHandlers = Pick<
  ModalManager,
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
  | 'closeQualityCheck'
>;

/** Syllabus-tree mutations plus import/reset/library orchestration. */
export type AppSyllabusHandlers = Pick<
  SyllabusData,
  | 'handleCreateCourse'
  | 'handleCreateTopic'
  | 'handleCreateSubTopic'
  | 'handleAddDotPoints'
  | 'handleGeneratePrompt'
  | 'confirmRename'
  | 'confirmDelete'
  | 'handleUpdateOutcomes'
  | 'handleUpdateFocusAreas'
  | 'handleSampleAnswerGenerated'
  | 'handleUpdateSampleAnswer'
  | 'handleDeleteSampleAnswer'
  | 'handleContributeSampleAnswer'
  | 'handleImportCourses'
  | 'handleImportTopic'
  | 'handleClearAllData'
  | 'handleResetToDefault'
  | 'updateCourses'
  | 'discoveredDocs'
  | 'importDiscoveredDocs'
  | 'handleMoveTopic'
> & {
  /** App-local: clears the API monitor's counters. */
  onResetApiStats: () => void;
};

/** AI-backed generation/evaluation handlers and their in-flight state. */
export type AppGeminiHandlers = Pick<
  GeminiData,
  | 'evaluationResult'
  | 'setEvaluationResult'
  | 'handleGenerateScenario'
  | 'handleRegenerateKeywords'
  | 'recalibrateSamples'
  | 'handleSuggestKeywords'
  | 'suggestOutcomesForPrompt'
  | 'improveAnswer'
  | 'improvement'
  | 'setImprovement'
  | 'showImprovementReview'
  | 'setShowImprovementReview'
  | 'improvementReviewLeadsToFeedback'
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

/** The currently-selected syllabus nodes, resolved from the state path. */
export type AppCurrentSelection = Pick<
  Navigation,
  'currentCourse' | 'currentTopic' | 'currentSubTopic' | 'currentDotPoint' | 'currentPrompt'
>;
