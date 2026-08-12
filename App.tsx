import React, { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import PromptSelector from './components/PromptSelector';
import Workspace from './components/Workspace';
import Toast from './components/Toast';
import ApiHealthIndicator from './components/ApiHealthIndicator';
import ApiStatusIndicator from './components/ApiStatusIndicator';
import BackgroundTaskIndicator from './components/BackgroundTaskIndicator';
import GlobalLoadingOverlay from './components/GlobalLoadingOverlay';
import AppModals from './components/AppModals';
import UpgradeModal from './components/UpgradeModal';
import CourseRequestModal from './components/CourseRequestModal';
import LoginPage from './components/LoginPage';
import ResetPasswordPage from './components/ResetPasswordPage';
import UserAgreementModal from './components/UserAgreementModal';
import { useNavigation } from './hooks/useNavigation';
import { activeSyllabusYear, resolveSyllabusYear, yearShortLabel } from './utils/syllabusYear';
import { useSyllabusData } from './hooks/useSyllabusData';
import { useGemini } from './hooks/useGemini';
import { useModalManager } from './hooks/useModalManager';
import { useToast } from './hooks/useToast';
import { useDebounce } from './hooks/useDebounce';
import { useApiStatus } from './hooks/useApiStatus';
import { authService } from './services/authService';
import { subscribeQuotaWarnings, subscribeAiNotices } from './services/quotaNotifier';
import {
  acceptAgreement,
  isAgreementBlocking,
  markQuickStartSeen,
  needsAgreement,
  needsQuickStart,
} from './services/agreementService';
import { AGREEMENT_VERSION } from './data/legalContent';
import { isCurriculumRemote } from './services/curriculumService';
import { savePromptContribution } from './services/contributionService';
import { screenContentQuality } from './services/geminiService';
import { User, WritingMode } from './types';
import {
  canCreateCurriculum,
  canCurateContent,
  canModerate,
  isSystemAdmin,
} from './utils/permissions';
import { isCourseDemandAvailable } from './services/courseDemandService';
import {
  isEvalLimitReached,
  freeEvalLimit,
  refreshFreeEvalCount,
  requestUpgrade,
  PLAN_LABELS,
} from './services/entitlements';
import {
  Compass,
  Sparkles,
  Database,
  Layers,
  Sun,
  Moon,
  HardDrive,
  Activity,
  ShieldCheck,
  UploadCloud,
  Gauge,
  KeyRound,
  BarChart3,
  LineChart,
  Minimize,
  ChevronUp,
  LifeBuoy,
} from 'lucide-react';
import { apiMonitor, ApiStatus } from './services/geminiService';
import CommandVerbHierarchy from './components/CommandVerbHierarchy';
import BillingAlertBanner from './components/BillingAlertBanner';
import SyllabusNavBar from './components/SyllabusNavBar';
import { loadUserProfile } from './utils/storageUtils';
import {
  ASSIGNMENT_PARAM,
  buildAssignmentLink,
  parseAssignmentParam,
  resolveAssignmentPath,
} from './utils/assignmentLink';
import { getDotPointLabel, parseSubItemsFromDescription } from './utils/dataManagerUtils';

const AnimatedBackground: React.FC = () => {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
      {/* The `blob` keyframes live in index.css — see the note there. */}
      <div className="absolute inset-0 bg-[rgb(var(--color-bg-base))]" />
      <div className="absolute inset-0 light:hidden">
        <div
          className="absolute top-0 -left-4 w-96 h-96 bg-purple-500 rounded-full mix-blend-screen filter blur-[80px] opacity-30"
          style={{ animation: 'blob 10s infinite ease-in-out' }}
        />
        <div
          className="absolute top-0 -right-4 w-96 h-96 bg-indigo-500 rounded-full mix-blend-screen filter blur-[80px] opacity-30"
          style={{ animation: 'blob 10s infinite ease-in-out', animationDelay: '2s' }}
        />
        <div
          className="absolute -bottom-32 -left-20 w-96 h-96 bg-blue-600 rounded-full mix-blend-screen filter blur-[80px] opacity-30"
          style={{ animation: 'blob 10s infinite ease-in-out', animationDelay: '4s' }}
        />
        <div
          className="absolute -bottom-40 -right-20 w-80 h-80 bg-pink-600 rounded-full mix-blend-screen filter blur-[80px] opacity-20"
          style={{ animation: 'blob 10s infinite ease-in-out', animationDelay: '6s' }}
        />
      </div>
      <div className="absolute inset-0 hidden light:block">
        <div
          className="absolute top-0 -left-4 w-96 h-96 bg-indigo-200 rounded-full mix-blend-multiply filter blur-[100px] opacity-40"
          style={{ animation: 'blob 10s infinite ease-in-out' }}
        />
        <div
          className="absolute top-0 -right-4 w-96 h-96 bg-sky-200 rounded-full mix-blend-multiply filter blur-[100px] opacity-40"
          style={{ animation: 'blob 10s infinite ease-in-out', animationDelay: '2s' }}
        />
        <div
          className="absolute -bottom-32 left-20 w-96 h-96 bg-violet-200 rounded-full mix-blend-multiply filter blur-[100px] opacity-30"
          style={{ animation: 'blob 10s infinite ease-in-out', animationDelay: '4s' }}
        />
      </div>
      <div
        className="absolute inset-0 opacity-[0.03] light:opacity-[0.02] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='1'/%3E%3C/svg%3E")`,
        }}
      />
      {/* Focus Mode ambience: fades in via the `body.focus-mode` class (see
          index.css). Sits above the opaque base here, below all app content. */}
      <div className="focus-ambient absolute inset-0" />
    </div>
  );
};

const MeshOverlay = ({ opacity = 'opacity-[0.03]' }: { opacity?: string }) => (
  <div
    className={`absolute inset-0 ${opacity} pointer-events-none mix-blend-overlay z-0 transition-opacity duration-500`}
    style={{
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 10 10' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v10M0 1h10' stroke='%23ffffff' stroke-width='0.5' fill='none'/%3E%3C/svg%3E")`,
    }}
  />
);

interface AuthenticatedAppProps {
  user: User;
  onUpdateUser: (user: User) => void;
  handleLogout: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
  apiStatus: ApiStatus;
}

const AuthenticatedApp: React.FC<AuthenticatedAppProps> = ({
  user,
  onUpdateUser,
  handleLogout,
  showToast,
  apiStatus,
}) => {
  const {
    courses,
    updateCourses,
    storageStatus,
    discoveredDocs,
    isReady,
    isDiscoveryInProgress,
    importDiscoveredDocs,
    handleCreateCourse,
    handleCreateTopic,
    handleCreateTopicWithContent,
    handleCreateSubTopic,
    handleAddDotPoints,
    handleUpdateFocusAreas,
    handleGeneratePrompt,
    confirmRename,
    confirmDelete,
    handleUpdateOutcomes,
    handleSampleAnswerGenerated,
    handleUpdateSampleAnswer,
    handleDeleteSampleAnswer,
    handleContributeSampleAnswer,
    handleImportCourses,
    handleImportTopic,
    handleClearAllData,
    handleResetToDefault,
    handlePublishToLibrary,
    handleImportFromLibrary,
    handleDeleteFromLibrary,
    handleMoveTopic,
  } = useSyllabusData({ showToast });

  const {
    statePath,
    setStatePath,
    handlePathChange,
    currentCourse,
    currentTopic,
    currentSubTopic,
    currentDotPoint,
    currentPrompt,
  } = useNavigation(courses, isReady);
  const currentSelection = useMemo(
    () => ({
      currentCourse,
      currentTopic,
      currentSubTopic,
      currentDotPoint,
      currentPrompt,
    }),
    [currentCourse, currentTopic, currentSubTopic, currentDotPoint, currentPrompt]
  );

  const [isFocusMode, setIsFocusMode] = useState(false);
  // Writing experience: 'coach' surfaces live feedback (highlighting, insights,
  // exemplars); 'exam' simulates HSC exam conditions (no assistance, timed).
  const [writingMode, setWritingMode] = useState<WritingMode>('coach');
  // The syllabus navigator folds into a breadcrumb once a question is chosen so
  // the screen belongs to the writing; "Change" re-opens it.
  const [isNavExpanded, setIsNavExpanded] = useState(true);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isReviewQueueOpen, setIsReviewQueueOpen] = useState(false);
  const [isUsageDashboardOpen, setIsUsageDashboardOpen] = useState(false);
  const [isRuntimeKeyOpen, setIsRuntimeKeyOpen] = useState(false);
  const [isClassInsightsOpen, setIsClassInsightsOpen] = useState(false);
  const [isStudentProgressOpen, setIsStudentProgressOpen] = useState(false);
  const [isSubmittingPrompt, setIsSubmittingPrompt] = useState(false);

  // Shared-library contribution is only meaningful when Supabase is configured
  // and the caller has a real account (guests have no session to attribute to).
  const canContribute = isCurriculumRemote() && user.role !== 'guest';

  const handleSubmitPromptToLibrary = async () => {
    if (!currentPrompt || !statePath.dotPointId) return;
    setIsSubmittingPrompt(true);
    try {
      // AI pre-screen: score the question so reviewers can triage the queue.
      // A failed screen doesn't block submission — the score rides along and a
      // reviewer makes the final call — but we surface it to the author.
      const quality = await screenContentQuality(currentPrompt.question, 'question');

      await savePromptContribution(statePath.dotPointId, currentPrompt, 'pending', quality);

      if (quality && quality.score < 50) {
        showToast(
          `Submitted for review — AI quality score ${quality.score}/100, so a reviewer will take a close look.`,
          'info'
        );
      } else if (quality) {
        showToast(`Submitted for review (AI quality score ${quality.score}/100).`, 'success');
      } else {
        showToast('Submitted to the shared library for review.', 'success');
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Submission failed.', 'error');
    } finally {
      setIsSubmittingPrompt(false);
    }
  };

  const {
    activeModals,
    modalProps,
    openModal,
    closeModal,
    isModalOpen,
    requestRename,
    confirmRename: onConfirmRename,
    cancelRename,
    requestDelete,
    confirmDelete: onConfirmDelete,
    cancelDelete,
    showConfirmation,
    handleConfirmAction,
    cancelConfirmation,
    showQualityCheck,
    closeQualityCheck,
  } = useModalManager({
    /**
     * Rename, then drop any Active Focus the new wording no longer offers.
     *
     * A dot point's focus areas are read from its description, so editing the
     * wording can delete the very phrase the current selection narrows
     * generated questions to. Left alone the app kept briefing the AI on a
     * focus area that no longer exists anywhere in the syllabus, with nothing
     * on screen saying so — the same guard FocusAreaEditorModal already applies
     * when the list is edited directly.
     */
    onRename: useCallback(
      (target: { type: string; id: string }, newName: string) => {
        confirmRename(target, newName);
        if (target.type !== 'dotPoint' || target.id !== statePath.dotPointId) return;
        const selected = statePath.selectedSubItems;
        if (!selected?.length) return;
        // The teacher may have pinned the old list (RenameModal's "keep"), in
        // which case the override wins and nothing here needs to change.
        const dotPoint = courses
          .flatMap((c) => c.topics)
          .flatMap((t) => t.subTopics)
          .flatMap((st) => st.dotPoints)
          .find((dp) => dp.id === target.id);
        if (dotPoint?.focusAreas) return;
        const next = parseSubItemsFromDescription(newName);
        const stillValid = selected.filter((item) => next.includes(item));
        if (stillValid.length !== selected.length) {
          handlePathChange({ selectedSubItems: stillValid.length ? stillValid : undefined });
        }
      },
      [confirmRename, statePath, courses, handlePathChange]
    ),
    // Stable reference: an inline arrow here would be recreated on every App
    // render, cascading through useModalManager's confirmDelete into the
    // memoised handler bags and defeating Workspace's React.memo.
    onDelete: useCallback(
      (target: { type: string; id: string; name: string }) => {
        const newPath = confirmDelete(statePath, target);
        setStatePath(newPath);
      },
      [confirmDelete, statePath, setStatePath]
    ),
  });

  useEffect(() => {
    if (isReady && !isDiscoveryInProgress && courses.length === 0 && discoveredDocs.length > 0) {
      openModal('manifestImport');
    }
  }, [isReady, isDiscoveryInProgress, courses.length, discoveredDocs.length, openModal]);

  // First run: open the quick-start guide once — for a genuinely new account,
  // or after the guide is re-versioned. It is marked as seen on OPEN rather
  // than on close, so someone who dismisses it immediately is not greeted by
  // it again on the next render.
  const quickStartShownRef = useRef(false);
  useEffect(() => {
    if (quickStartShownRef.current || !needsQuickStart(user)) return;
    quickStartShownRef.current = true;
    openModal('quickStart');
    markQuickStartSeen(user)
      .then(onUpdateUser)
      .catch(() => {
        /* Non-critical — the guide simply greets them once more. */
      });
  }, [user, openModal, onUpdateUser]);

  const {
    evaluationResult,
    setEvaluationResult,
    isEvaluating,
    evaluationError,
    evaluate,
    isEnriching,
    enrichError,
    setEnrichError,
    isImproving,
    improveAnswerError,
    improveAnswer,
    improvement,
    setImprovement,
    showImprovementReview,
    setShowImprovementReview,
    improvementReviewLeadsToFeedback,
    activeBackgroundTask,
    handleGenerateScenario,
    isGeneratingScenario,
    generateScenarioError,
    handleRegenerateKeywords,
    isRegeneratingKeywords,
    regenerateKeywordsError,
    recalibrateSamples,
    handleSuggestKeywords,
    isSuggestingKeywords,
    suggestKeywordsError,
    suggestOutcomesForPrompt,
    generateDotPointsForSubTopic,
    handleStartFullSyllabusImport,
    resetEvaluation,
    handleFeedbackSubmit,
  } = useGemini({
    showToast,
    updateCourses,
    statePath,
    currentPrompt,
    currentCourse,
    // Stable reference — an inline arrow here destabilised handleApiError and,
    // through it, every generation handler in useGemini on each App render,
    // defeating Workspace's React.memo.
    onApiKeyInvalid: useCallback(
      () => showToast('API key mismatch detected.', 'error'),
      [showToast]
    ),
    user,
    onUpdateUser,
  });

  const globalLoadingMessage = useMemo(() => {
    // NOTE: `isEvaluating` and `isImproving` are deliberately NOT here either.
    // Both already have a wait of their own, in the place the work is
    // happening: the marking veil sits over the writing card and reports the
    // real phases the request goes through (EvaluationProgressBar), and the
    // upgrade veil sits over the report it is rewriting (EvaluationDisplay).
    // Adding the whole-screen card on top meant two different blurred panes
    // for one action, one of them hiding the other's progress.
    // NOTE: `isEnriching` is deliberately NOT here. Enrichment (fetching a
    // prompt's missing scenario / keywords / outcomes) is a *background* task
    // that fires automatically on prompt selection — blocking the whole screen
    // with a modal for it froze the UI whenever the AI was slow or unreachable.
    // It now surfaces as a subtle, non-blocking inline indicator in the prompt
    // header instead (PromptDisplay `isEnriching`).
    if (isGeneratingScenario) return 'Modelling environment...';
    if (isRegeneratingKeywords) return 'Analysing syllabus keywords...';
    if (isSuggestingKeywords) return 'Discovering terminology...';
    return null;
  }, [isGeneratingScenario, isRegeneratingKeywords, isSuggestingKeywords]);

  const quotaError = useMemo(() => {
    const errors = [
      evaluationError,
      enrichError,
      improveAnswerError,
      generateScenarioError,
      regenerateKeywordsError,
      suggestKeywordsError,
    ];
    return errors.find((e) => e && e.includes('Usage Limit Reached')) || null;
  }, [
    evaluationError,
    enrichError,
    improveAnswerError,
    generateScenarioError,
    regenerateKeywordsError,
    suggestKeywordsError,
  ]);

  // The course name a "request this course" click arrived with, if any.
  const [courseRequestPrefill, setCourseRequestPrefill] = useState('');
  const [userAnswer, setUserAnswer] = useState('');
  const debouncedUserAnswer = useDebounce(userAnswer, 1000);
  const [newlyAddedIds, setNewlyAddedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (newlyAddedIds.size === 0) return;
    const timer = setTimeout(() => setNewlyAddedIds(new Set()), 5000);
    return () => clearTimeout(timer);
  }, [newlyAddedIds]);

  const handleEvaluate = useCallback(() => {
    if (!currentPrompt || !userAnswer.trim()) return;
    if (isEvalLimitReached(user)) {
      showToast(
        // The live figure — a deployment override, or the limit the server
        // itself last reported — not the number compiled into this bundle.
        `You've used all ${freeEvalLimit()} free evaluations for today. Upgrade to Plus for unlimited marking.`,
        'info'
      );
      // `fullFeedback` because marking has no feature key of its own (it is
      // metered by count, not gated by plan); the reason is what makes the
      // prompt describe the limit rather than the criterion breakdown.
      requestUpgrade('fullFeedback', 'dailyLimit');
      return;
    }
    evaluate(userAnswer, currentPrompt);
  }, [currentPrompt, userAnswer, user, showToast, evaluate]);

  // The local free-evaluation mirror is spent inside useGemini, at the point
  // the marking call returns. It is deliberately NOT an effect on
  // `evaluationResult`: that object is replaced when the user rates the
  // feedback, and the effect charged them a second evaluation for it.

  useEffect(() => {
    const isLight = user.preferences.theme === 'light';
    const html = document.documentElement;

    if (isLight) {
      html.setAttribute('data-theme', 'light');
      html.classList.remove('dark');
    } else {
      html.removeAttribute('data-theme');
      html.classList.add('dark');
    }
  }, [user.preferences.theme]);

  // Paint a calm ambient gradient on the page background while writing in Focus
  // Mode, so the mode reads as a distinct, immersive space (see index.css).
  useEffect(() => {
    document.body.classList.toggle('focus-mode', isFocusMode);
    return () => document.body.classList.remove('focus-mode');
  }, [isFocusMode]);

  // Entering or leaving Focus Mode adds/removes whole columns of the workspace.
  // Everything that sizes itself from a measurement — the two-column card sync
  // (ResizeObserver) and the viewport-derived height cap (a `resize` listener) —
  // has to re-run against the new layout, and a stale reading leaves cards
  // sized for a layout that is no longer on screen. Nudge both once the new
  // layout has been laid out (two frames: one to commit, one to measure).
  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    });
    return () => {
      cancelAnimationFrame(first);
      if (second) cancelAnimationFrame(second);
    };
  }, [isFocusMode]);

  // Fold the syllabus navigator down to a breadcrumb the moment a question is
  // chosen, and re-open it whenever the selection is cleared. Keyed on the
  // selected prompt id only, so pressing "Change" (which just expands) is never
  // fought by this effect until the student actually picks a different question.
  useEffect(() => {
    setIsNavExpanded(!currentPrompt);
  }, [currentPrompt?.id]);

  const onResetApiStats = useCallback(() => apiMonitor.resetAll(), []);
  const onToggleFocusMode = useCallback(() => setIsFocusMode((f) => !f), []);

  // --- Teacher assignment links -------------------------------------------
  // Teachers copy a link to the selected question; students opening it land
  // directly on that question (see utils/assignmentLink.ts).

  const handleShareAssignment = useCallback(async () => {
    const link = buildAssignmentLink(statePath);
    if (!link) {
      showToast('Select a question first, then copy its assignment link.', 'info');
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      showToast('Assignment link copied — share it with your class.', 'success');
    } catch {
      // Clipboard API can be unavailable (http, permissions) — show the link
      // via prompt() as a copyable fallback rather than failing silently.
      window.prompt('Copy this assignment link:', link);
    }
  }, [statePath, showToast]);

  // Open an incoming assignment link once the course library is ready.
  const assignmentHandledRef = useRef(false);
  useEffect(() => {
    if (!isReady || assignmentHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get(ASSIGNMENT_PARAM);
    if (!raw) return;
    assignmentHandledRef.current = true;
    window.history.replaceState({}, '', window.location.pathname);

    const resolved = resolveAssignmentPath(courses, parseAssignmentParam(raw));
    if (resolved) {
      setStatePath(resolved.path);
      const preview =
        resolved.question.length > 80 ? `${resolved.question.slice(0, 80)}…` : resolved.question;
      showToast(`Assignment loaded: "${preview}"`, 'success');
    } else {
      showToast(
        "This assignment isn't in your course library yet — ask your teacher to check the link, or load the curriculum library first.",
        'error'
      );
    }
  }, [isReady, courses, setStatePath, showToast]);

  // These handler bags are passed to the memoised Workspace. Wrapping each in
  // useMemo (with every member as a dep) keeps its reference stable except when
  // a member actually changes — so merely opening or closing a modal (which only
  // touches activeModals) no longer re-renders the whole writing area. Note:
  // `isModalOpen` is deliberately NOT in modalHandlers — nothing reads it via the
  // bag, and it changes on every modal toggle, which would defeat the memo.
  const modalHandlers = useMemo(
    () => ({
      openModal,
      closeModal,
      showConfirmation,
      requestRename,
      requestDelete,
      confirmRename: onConfirmRename,
      cancelRename,
      confirmDelete: onConfirmDelete,
      cancelDelete,
      handleConfirmAction,
      cancelConfirmation,
      showQualityCheck,
      closeQualityCheck,
    }),
    [
      openModal,
      closeModal,
      showConfirmation,
      requestRename,
      requestDelete,
      onConfirmRename,
      cancelRename,
      onConfirmDelete,
      cancelDelete,
      handleConfirmAction,
      cancelConfirmation,
      showQualityCheck,
      closeQualityCheck,
    ]
  );
  const syllabusHandlers = useMemo(
    () => ({
      handleCreateCourse,
      handleCreateTopic,
      handleCreateSubTopic,
      handleAddDotPoints,
      handleGeneratePrompt,
      confirmRename,
      confirmDelete,
      handleUpdateOutcomes,
      handleSampleAnswerGenerated,
      handleUpdateSampleAnswer,
      handleDeleteSampleAnswer,
      handleContributeSampleAnswer,
      handleImportCourses,
      handleImportTopic,
      handleClearAllData,
      handleResetToDefault,
      updateCourses,
      discoveredDocs,
      importDiscoveredDocs,
      handleMoveTopic,
      onResetApiStats,
    }),
    [
      handleCreateCourse,
      handleCreateTopic,
      handleCreateSubTopic,
      handleAddDotPoints,
      handleGeneratePrompt,
      confirmRename,
      confirmDelete,
      handleUpdateOutcomes,
      handleSampleAnswerGenerated,
      handleUpdateSampleAnswer,
      handleDeleteSampleAnswer,
      handleContributeSampleAnswer,
      handleImportCourses,
      handleImportTopic,
      handleClearAllData,
      handleResetToDefault,
      updateCourses,
      discoveredDocs,
      importDiscoveredDocs,
      handleMoveTopic,
      onResetApiStats,
    ]
  );
  const geminiHandlers = useMemo(
    () => ({
      evaluationResult,
      setEvaluationResult,
      handleGenerateScenario,
      handleRegenerateKeywords,
      recalibrateSamples,
      handleSuggestKeywords,
      suggestOutcomesForPrompt,
      improveAnswer,
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
      generateDotPointsForSubTopic,
      handleStartFullSyllabusImport,
      resetEvaluation,
      handleFeedbackSubmit,
      setEnrichError,
    }),
    [
      evaluationResult,
      setEvaluationResult,
      handleGenerateScenario,
      handleRegenerateKeywords,
      recalibrateSamples,
      handleSuggestKeywords,
      suggestOutcomesForPrompt,
      improveAnswer,
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
      generateDotPointsForSubTopic,
      handleStartFullSyllabusImport,
      resetEvaluation,
      handleFeedbackSubmit,
      setEnrichError,
    ]
  );

  // The navigator is "collapsed" (shown as a breadcrumb bar) when a question is
  // selected and the student hasn't re-opened it to change their choice.
  const isNavCollapsed = !!currentPrompt && !isNavExpanded;

  return (
    <>
      {isFocusMode && (
        <button
          onClick={() => setIsFocusMode(false)}
          title="Exit focus mode (Esc)"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2.5 pl-3 pr-4 py-2 rounded-full bg-black/40 light:bg-white/70 backdrop-blur-xl border border-white/15 light:border-slate-300 text-white light:text-slate-700 shadow-2xl hover:bg-black/60 light:hover:bg-white transition-all animate-fade-in group"
        >
          <span className="w-6 h-6 rounded-full bg-amber-500/90 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
            <Minimize className="w-3.5 h-3.5 text-white" />
          </span>
          <span className="text-[11px] font-black uppercase tracking-[0.2em] whitespace-nowrap">
            Focus Mode
          </span>
          <kbd className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/10 light:bg-slate-200 border border-white/10 light:border-slate-300 tracking-widest">
            ESC
          </kbd>
        </button>
      )}

      {/* Full-bleed banner: lives outside the max-width content container so it
          always spans the whole viewport and sits flush against the top edge
          (the old in-container version stopped 32px short on >1600px screens
          and floated below the container's top padding). */}
      {!isFocusMode && (
        <header className="sticky top-0 z-[60] min-h-20 flex items-center shadow-2xl shadow-indigo-900/20">
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-sky-500 opacity-100" />
          {/* Wraps below sm so admin/moderator tool buttons drop onto their own
              row instead of overlapping the title on narrow screens. */}
          <div className="relative z-10 px-4 sm:px-6 lg:px-8 py-3 sm:py-0 w-full max-w-[1600px] mx-auto flex flex-wrap sm:flex-nowrap items-center justify-between gap-x-3 gap-y-2">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-2xl bg-white/20 backdrop-blur-xl border border-white/20 flex items-center justify-center shadow-2xl group transition-all">
                <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-2xl font-black text-white tracking-tighter leading-none italic uppercase whitespace-nowrap">
                  Band 6
                </h1>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] sm:tracking-[0.4em] text-white/70 block mt-1 whitespace-nowrap">
                  HSC Writing Coach
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-4 ml-auto">
              {(isSystemAdmin(user.role) || canModerate(user.role)) && (
                <div className="flex flex-wrap items-center justify-end gap-2 sm:mr-2">
                  {isSystemAdmin(user.role) && (
                    <>
                      <button
                        onClick={() => openModal('dataManager')}
                        className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all shadow-lg border border-white/10"
                        title="Data Vault (Import/Export/Reorder)"
                        aria-label="Data Vault (Import/Export/Reorder)"
                      >
                        <Database className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setIsAuditModalOpen(true)}
                        className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all shadow-lg border border-white/10"
                        title="Syllabus Audit Studio"
                        aria-label="Syllabus Audit Studio"
                      >
                        <Activity className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  {canModerate(user.role) && isCurriculumRemote() && (
                    <>
                      <button
                        onClick={() => setIsReviewQueueOpen(true)}
                        className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all shadow-lg border border-white/10"
                        title="Review Queue (approve/reject contributions)"
                        aria-label="Review Queue (approve/reject contributions)"
                      >
                        <ShieldCheck className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setIsClassInsightsOpen(true)}
                        className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all shadow-lg border border-white/10"
                        title="Class Insights (where the cohort is struggling)"
                        aria-label="Class Insights (where the cohort is struggling)"
                      >
                        <BarChart3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setIsStudentProgressOpen(true)}
                        className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all shadow-lg border border-white/10"
                        title="Student Progress (one student across verb groups)"
                        aria-label="Student Progress (one student across verb groups)"
                      >
                        <LineChart className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  {isSystemAdmin(user.role) && (
                    <>
                      <button
                        onClick={() => openModal('databaseDashboard')}
                        className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all shadow-lg border border-white/10"
                        title="Internal Database Health"
                        aria-label="Internal Database Health"
                      >
                        <HardDrive className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setIsUsageDashboardOpen(true)}
                        className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all shadow-lg border border-white/10"
                        title="AI Usage Dashboard (monitor & adjust quotas)"
                        aria-label="AI Usage Dashboard (monitor & adjust quotas)"
                      >
                        <Gauge className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setIsRuntimeKeyOpen(true)}
                        className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all shadow-lg border border-white/10"
                        title="Runtime AI Keys (paste a key to test models)"
                        aria-label="Runtime AI Keys (paste a key to test models)"
                      >
                        <KeyRound className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              )}
              <div className="hidden lg:flex items-center gap-6 px-5 py-2 rounded-2xl bg-black/20 backdrop-blur-md border border-white/10">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${apiStatus.state === 'HEALTHY' ? 'bg-emerald-400' : 'bg-red-400'} animate-pulse`}
                  />
                  <span className="text-[10px] font-black uppercase tracking-wider text-white/80">
                    API {apiStatus.state}
                  </span>
                </div>
                <div className="w-px h-4 bg-white/10" />
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-sky-400" />
                  <span className="text-[10px] font-black uppercase tracking-wider text-white/80">
                    {storageStatus} Active
                  </span>
                </div>
              </div>
              <button
                onClick={() => openModal('quickStart')}
                title="Quick start guide, plans and the fine print"
                aria-label="Quick start guide, plans and the fine print"
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all"
              >
                <LifeBuoy className="w-5 h-5" />
              </button>
              <button
                onClick={() => {
                  const next = user.preferences.theme === 'light' ? 'dark' : 'light';
                  const updatedUser: User = {
                    ...user,
                    preferences: { ...user.preferences, theme: next },
                  };
                  onUpdateUser(updatedUser);
                  authService.updateUser(updatedUser);
                }}
                title={
                  user.preferences.theme === 'light'
                    ? 'Switch to dark theme'
                    : 'Switch to light theme'
                }
                aria-label={
                  user.preferences.theme === 'light'
                    ? 'Switch to dark theme'
                    : 'Switch to light theme'
                }
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all"
              >
                {user.preferences.theme === 'light' ? (
                  <Moon className="w-5 h-5" />
                ) : (
                  <Sun className="w-5 h-5" />
                )}
              </button>
              <button
                onClick={() => openModal('userProfile')}
                title="Open your profile"
                aria-label="Open your profile"
                className="flex items-center gap-3 pl-3 pr-1.5 h-11 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/10 transition-all"
              >
                <span className="text-xs font-bold text-white hidden sm:block">
                  {user.displayName}
                </span>
                <div className="w-8 h-8 rounded-xl bg-indigo-500 flex items-center justify-center text-white font-black text-xs shadow-lg">
                  {user.displayName.charAt(0)}
                </div>
              </button>
            </div>
          </div>
        </header>
      )}

      {/* Only the padding actually changes when Focus Mode toggles. `transition-all`
          here also animated properties that keep every composited card in the
          workspace moving for half a second while the grid re-flows underneath
          them — the window in which stale tiles were being left behind. */}
      <div
        className={`relative max-w-[1600px] mx-auto ${isFocusMode ? 'p-2 sm:p-4 pt-16 sm:pt-16' : 'p-4 sm:p-6 lg:p-8'} flex flex-col gap-6 transition-[padding] duration-500`}
      >
        {!isFocusMode && <BillingAlertBanner />}

        {!isFocusMode && isNavCollapsed && currentPrompt && (
          <SyllabusNavBar
            crumbs={[
              {
                // The year rides on the course crumb rather than taking a step
                // of its own: it is which syllabus this course name means, not
                // a level between the course and its topics. Named only when it
                // is not the Year 12 default, so the common case stays quiet.
                label:
                  resolveSyllabusYear(currentCourse, statePath.syllabusYear) === 'year12'
                    ? currentCourse?.name || 'Course'
                    : `${currentCourse?.name || 'Course'} · ${yearShortLabel(
                        resolveSyllabusYear(currentCourse, statePath.syllabusYear)
                      )}`,
                onClick: () =>
                  handlePathChange({
                    topicId: undefined,
                    subTopicId: undefined,
                    dotPointId: undefined,
                    promptId: undefined,
                  }),
              },
              {
                label: currentTopic?.name || 'Topic',
                onClick: () =>
                  handlePathChange({
                    subTopicId: undefined,
                    dotPointId: undefined,
                    promptId: undefined,
                  }),
              },
              {
                label: currentSubTopic?.name || 'Sub-Topic',
                onClick: () => handlePathChange({ dotPointId: undefined, promptId: undefined }),
              },
              {
                label: getDotPointLabel(currentDotPoint) || 'Dot Point',
                onClick: () => handlePathChange({ promptId: undefined }),
              },
            ]}
            prompt={currentPrompt}
            onExpand={() => setIsNavExpanded(true)}
            onShareAssignment={canCurateContent(user.role) ? handleShareAssignment : undefined}
          />
        )}

        {!isFocusMode && !isNavCollapsed && (
          <>
            <div className="relative z-50">
              <PromptSelector
                courses={courses}
                statePath={statePath}
                onPathChange={handlePathChange}
                onAddCourse={() => openModal('courseCreator')}
                onRequestCourse={(prefill) => {
                  // Carries the text they searched for, so the request form
                  // opens on their own words rather than an empty field.
                  setCourseRequestPrefill(prefill ?? '');
                  openModal('courseRequest');
                }}
                onAddSubTopic={() => openModal('subTopicCreator')}
                onGeneratePrompt={() => openModal('promptGenerator')}
                onManualEntry={() => openModal('manualPrompt')}
                onEditOutcomes={() => openModal('outcomesEditor')}
                onOpenDataManager={() => openModal('dataManager')}
                onRenameItem={requestRename}
                onDeleteItem={requestDelete}
                onUpdateFocusAreas={
                  canCurateContent(user.role) ? handleUpdateFocusAreas : undefined
                }
                onAddTopicFromSyllabus={() => openModal('topicSyllabusImport')}
                onAddTopicWithContent={(topicName, subTopics) => {
                  if (!statePath.courseId) return;
                  const newTopic = handleCreateTopicWithContent(
                    statePath.courseId,
                    topicName,
                    subTopics,
                    // The year the navigator is showing — resolved the same way
                    // IT resolves, `allowEmpty` and all. Without that, a topic
                    // created while standing in an empty Year 11 resolved to
                    // Year 12 and appeared in the HSC list instead.
                    activeSyllabusYear(
                      currentCourse,
                      statePath.syllabusYear,
                      canCurateContent(user.role)
                    )
                  );
                  setNewlyAddedIds((prev) => new Set(prev).add(newTopic.id));
                  handlePathChange({
                    topicId: newTopic.id,
                    subTopicId: undefined,
                    dotPointId: undefined,
                    promptId: undefined,
                  });
                }}
                onGenerateDotPoints={() => openModal('dotPointGenerator')}
                onImportTopic={() => openModal('topicImport')}
                onImportSyllabus={() => openModal('fullSyllabusImport')}
                onShareAssignment={canCurateContent(user.role) ? handleShareAssignment : undefined}
                newlyAddedIds={newlyAddedIds}
                userRole={user.role}
              />
            </div>

            {currentPrompt && (
              <div className="-mt-2 flex justify-end">
                <button
                  onClick={() => setIsNavExpanded(false)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 light:bg-slate-100 text-[rgb(var(--color-text-secondary))] border border-white/10 light:border-slate-300 hover:bg-white/10 light:hover:bg-slate-200 hover:text-[rgb(var(--color-text-primary))] transition-all text-xs font-bold"
                  title="Collapse the navigator and focus on your response"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                  Collapse to breadcrumb
                </button>
              </div>
            )}

            <CommandVerbHierarchy currentVerb={currentPrompt?.verb} />
          </>
        )}

        {currentPrompt && canContribute && !isFocusMode && (
          <div className="-mt-2 flex justify-end">
            <button
              onClick={handleSubmitPromptToLibrary}
              disabled={isSubmittingPrompt}
              title="Submit this question to the shared library for reviewer approval"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 hover:bg-emerald-500/20 transition-all text-xs font-bold disabled:opacity-50"
            >
              <UploadCloud className={`w-3.5 h-3.5 ${isSubmittingPrompt ? 'animate-pulse' : ''}`} />
              {isSubmittingPrompt ? 'Submitting…' : 'Submit to shared library'}
            </button>
          </div>
        )}

        {currentPrompt ? (
          <Workspace
            courses={courses}
            statePath={statePath}
            currentSelection={currentSelection}
            userAnswer={userAnswer}
            debouncedUserAnswer={debouncedUserAnswer}
            setUserAnswer={setUserAnswer}
            evaluationResult={evaluationResult}
            isEvaluating={isEvaluating}
            evaluationError={evaluationError}
            isEnriching={isEnriching}
            enrichError={enrichError}
            isImproving={isImproving}
            improveAnswerError={improveAnswerError}
            evaluatedAnswer={userAnswer}
            handleEvaluate={handleEvaluate}
            geminiHandlers={geminiHandlers}
            modalHandlers={modalHandlers}
            syllabusHandlers={syllabusHandlers}
            userRole={user.role}
            isFocusMode={isFocusMode}
            onToggleFocusMode={onToggleFocusMode}
            writingMode={writingMode}
            onWritingModeChange={setWritingMode}
            showBreadcrumb={!isNavCollapsed}
          />
        ) : (
          <div className="min-h-[50vh] flex flex-col items-center justify-center animate-fade-in">
            <div className="text-center p-12 rounded-[48px] bg-[rgb(var(--color-bg-surface))]/40 light:bg-white border border-white/5 light:border-slate-300 relative group overflow-hidden">
              <MeshOverlay opacity="opacity-[0.05]" />
              <Compass className="w-20 h-20 text-indigo-500 mx-auto mb-8 opacity-40 group-hover:rotate-45 transition-transform duration-700" />
              <h3 className="text-3xl font-black text-white light:text-slate-900 mb-4 tracking-tighter uppercase italic">
                Ready to Write
              </h3>
              <p className="text-[rgb(var(--color-text-secondary))] light:text-slate-500 max-w-sm mx-auto font-medium">
                Choose a course, topic and question in the navigator above — your writing space will
                open here.
              </p>
              {courses.length === 0 && (
                <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
                  <button
                    onClick={() => openModal('manifestImport')}
                    className="px-8 py-3 rounded-2xl bg-indigo-600 text-white font-black text-xs uppercase tracking-widest shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
                  >
                    <Sparkles className="w-4 h-4" /> Load Curriculum Library
                  </button>
                  {/* Building a course from syllabus text is course CREATION,
                      so it is admin-only here exactly as it is in the navigator
                      (canCreateCurriculum). "Load Curriculum Library" above
                      stays open to everyone: it installs the courses this build
                      ships with rather than authoring a new one, and it is the
                      only way a first-run user gets anything to write about. */}
                  {canCreateCurriculum(user.role) && (
                    <button
                      onClick={() => openModal('fullSyllabusImport')}
                      title="Build a course by pasting NESA syllabus text or fetching a syllabus URL"
                      className="px-8 py-3 rounded-2xl bg-white/5 light:bg-white text-[rgb(var(--color-text-secondary))] light:text-slate-700 border border-white/10 light:border-slate-300 font-black text-xs uppercase tracking-widest shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
                    >
                      <UploadCloud className="w-4 h-4" /> Import a Syllabus
                    </button>
                  )}
                  {/* Nobody is left stranded: someone who cannot create a
                      course can still say which one they need. */}
                  {!canCreateCurriculum(user.role) && isCourseDemandAvailable(user.role) && (
                    <button
                      onClick={() => {
                        setCourseRequestPrefill('');
                        openModal('courseRequest');
                      }}
                      className="px-8 py-3 rounded-2xl bg-white/5 light:bg-white text-[rgb(var(--color-text-secondary))] light:text-slate-700 border border-white/10 light:border-slate-300 font-black text-xs uppercase tracking-widest shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
                    >
                      <Compass className="w-4 h-4" /> Request a Course
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <AppModals
          activeModals={activeModals}
          modalProps={modalProps}
          modalHandlers={modalHandlers}
          syllabusHandlers={syllabusHandlers}
          geminiHandlers={geminiHandlers}
          currentSelection={currentSelection}
          statePath={statePath}
          courses={courses}
          setStatePath={setStatePath}
          showToast={showToast}
          setNewlyAddedIds={setNewlyAddedIds}
          user={user}
          onUpdateUser={onUpdateUser}
          onLogout={handleLogout}
        />
        <UpgradeModal showToast={showToast} user={user} />
        <CourseRequestModal
          isOpen={isModalOpen('courseRequest')}
          onClose={() => closeModal('courseRequest')}
          initialName={courseRequestPrefill}
          showToast={showToast}
        />
        <GlobalLoadingOverlay message={globalLoadingMessage} error={quotaError} />
        <BackgroundTaskIndicator task={activeBackgroundTask} />
        {isSystemAdmin(user.role) && (
          <Suspense fallback={null}>
            <ApiMonitorDisplay />
          </Suspense>
        )}
        {/* fallback={null}: these all render their own portal/backdrop, so a
            spinner here would paint behind nothing. The gap is one network
            round trip on an admin's first open. */}
        <Suspense fallback={null}>
          {isSystemAdmin(user.role) && isAuditModalOpen && (
            <ContentAuditModal
              isOpen={isAuditModalOpen}
              onClose={() => setIsAuditModalOpen(false)}
              courses={courses}
              updateCourses={updateCourses}
              showToast={showToast}
            />
          )}
          {canModerate(user.role) && (
            <ReviewQueueModal
              isOpen={isReviewQueueOpen}
              onClose={() => setIsReviewQueueOpen(false)}
              showToast={showToast}
            />
          )}
          {canModerate(user.role) && (
            <ClassInsightsModal
              isOpen={isClassInsightsOpen}
              onClose={() => setIsClassInsightsOpen(false)}
              showToast={showToast}
            />
          )}
          {canModerate(user.role) && (
            <StudentProgressModal
              isOpen={isStudentProgressOpen}
              onClose={() => setIsStudentProgressOpen(false)}
              showToast={showToast}
            />
          )}
          {isSystemAdmin(user.role) && (
            <UsageDashboard
              isOpen={isUsageDashboardOpen}
              onClose={() => setIsUsageDashboardOpen(false)}
              showToast={showToast}
            />
          )}
          {isSystemAdmin(user.role) && (
            <RuntimeKeyModal
              isOpen={isRuntimeKeyOpen}
              onClose={() => setIsRuntimeKeyOpen(false)}
              showToast={showToast}
            />
          )}
        </Suspense>
      </div>
    </>
  );
};

// Lazy, all six: these are the reviewer and system-admin surfaces, and a
// student — most of the people who ever load this app, often on school wifi —
// renders none of them. Imported statically they still travelled in the eager
// preload graph, so every student paid ~38 kB gzipped for tools they cannot
// open. The render conditions below are unchanged; only the fetch moves.
// Rendered only for system admins, but a static import kept its AI-engine
// selector — and so the whole admin chunk — in everyone's eager graph.
const ApiMonitorDisplay = lazy(() => import('./components/ApiMonitorDisplay'));
const ContentAuditModal = lazy(() => import('./components/admin/ContentAuditModal'));
const ReviewQueueModal = lazy(() => import('./components/admin/ReviewQueueModal'));
const UsageDashboard = lazy(() => import('./components/admin/UsageDashboard'));
const RuntimeKeyModal = lazy(() => import('./components/admin/RuntimeKeyModal'));
const ClassInsightsModal = lazy(() => import('./components/admin/ClassInsightsModal'));
const StudentProgressModal = lazy(() => import('./components/admin/StudentProgressModal'));

const App: React.FC = () => {
  const { toast, showToast, hideToast } = useToast();
  const apiStatus = useApiStatus();
  const [user, setUser] = useState<User | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  // Guests are shown the charter as a courtesy notice they can wave away; this
  // remembers that they did, for the session. Signed-in users are gated
  // instead, and their acceptance is recorded on the account.
  const [guestNoticeDismissed, setGuestNoticeDismissed] = useState(false);
  const [isAcceptingAgreement, setIsAcceptingAgreement] = useState(false);

  const handleAcceptAgreement = useCallback(async () => {
    if (!user) return;
    setIsAcceptingAgreement(true);
    try {
      setUser(await acceptAgreement(user));
    } catch {
      // acceptAgreement swallows storage failures itself, so reaching here
      // means something unexpected — let the user through rather than
      // stranding them, since the agreement was shown and consented to.
      setUser({ ...user, agreement: { version: AGREEMENT_VERSION, acceptedAt: Date.now() } });
    } finally {
      setIsAcceptingAgreement(false);
    }
  }, [user]);

  const handleLogout = useCallback(() => {
    authService.logout();
    setUser(null);
    setGuestNoticeDismissed(false);
  }, []);

  // Surface daily-AI-quota warnings (80% / 100%) as toasts. The proxy feeds
  // usage back through aiCore → quotaNotifier on every call; dedupe is handled
  // there so this fires at most once per threshold per UTC day.
  useEffect(
    () =>
      subscribeQuotaWarnings((w) => showToast(w.message, w.level === 'reached' ? 'error' : 'info')),
    [showToast]
  );

  // One-off AI notices (e.g. automatic fallback to Gemini Flash when the
  // selected model has no free-tier quota). Fired at most once per condition.
  useEffect(() => subscribeAiNotices((message) => showToast(message, 'info')), [showToast]);

  // Reconcile the free-tier evaluation counter with the server as soon as
  // there is an account to reconcile it for. The local copy is per-browser, so
  // without this a second device — or a cleared cache — offers a full
  // allowance the server has already spent, and the student only finds out
  // after writing an answer and waiting out the marking call. Runs once per
  // sign-in; the counter's own daily rollover handles the rest.
  useEffect(() => {
    if (!user || user.role === 'guest') return;
    void refreshFreeEvalCount();
  }, [user?.username, user?.role]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    // Strip only our own params — wiping the whole query string would eat an
    // assignment link (?a=…) that hasn't been handled yet, and drop the hash.
    const clearCheckoutParams = () => {
      const next = new URLSearchParams(window.location.search);
      next.delete('checkout');
      next.delete('session_id');
      const query = next.toString();
      window.history.replaceState(
        {},
        '',
        `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
      );
    };
    if (checkout === 'success') {
      clearCheckoutParams();
      showToast('Payment received — activating your subscription…', 'info');
      // Stripe redirects back faster than its webhook fires, so the profile is
      // usually still 'free' on this first load. Poll until the webhook has
      // written the plan (typically 2-10s), then unlock live — no re-login.
      let cancelled = false;
      (async () => {
        for (let attempt = 0; attempt < 10 && !cancelled; attempt++) {
          const current = authService.getCurrentUser();
          if (current && current.role !== 'guest') {
            try {
              const refreshed = await authService.refreshSession(current);
              if (cancelled) return;
              if (refreshed?.stripePlan && refreshed.stripePlan !== 'free') {
                setUser(refreshed);
                showToast(
                  `Subscription active — welcome to ${PLAN_LABELS[refreshed.stripePlan]}!`,
                  'success'
                );
                return;
              }
            } catch {
              /* transient — keep polling */
            }
          }
          await new Promise((r) => setTimeout(r, 3000));
        }
        if (!cancelled) {
          showToast(
            'Payment received. Your plan will unlock within a minute — refresh if features stay locked.',
            'info'
          );
        }
      })();
      return () => {
        cancelled = true;
      };
    } else if (checkout === 'cancelled') {
      showToast('Checkout cancelled — no changes were made.', 'info');
      clearCheckoutParams();
    }
  }, [showToast]);

  useEffect(() => {
    // A password-recovery return is checked FIRST, ahead of both branches
    // below. The link signs the user in before they choose anything, so a
    // cached session would send them into the app and a `?code=` would be
    // consumed as an OAuth sign-in — either way they would never see the form
    // they asked for, and the reset would appear to do nothing.
    if (authService.isPasswordRecovery()) {
      setIsPasswordRecovery(true);
      setIsLoadingAuth(false);
      return;
    }

    const storedUser = authService.getCurrentUser();
    if (storedUser) {
      loadUserProfile(storedUser.username)
        .then((fullProfile) => authService.refreshSession(fullProfile || storedUser))
        .then((refreshedUser) => {
          // null means a cached Supabase session is no longer valid
          // (expired/revoked) — send the user back to the login screen
          // instead of trusting stale local data.
          if (!refreshedUser) {
            authService.logout();
            setUser(null);
          } else {
            setUser(refreshedUser);
          }
        })
        .catch(() => {
          // Never get stuck on a blank screen: if the profile load or session
          // refresh throws (IndexedDB/network error), fall back to login.
          authService.logout();
          setUser(null);
        })
        .finally(() => setIsLoadingAuth(false));
    } else {
      // No cached user — check for an OAuth redirect that just completed.
      authService
        .handleOAuthCallback()
        .then((oauthUser) => {
          if (oauthUser) {
            setUser(oauthUser);
            showToast(`Signed in as ${oauthUser.displayName}`, 'success');
          }
        })
        // A rejected sign-in must SAY so. This used to swallow everything,
        // which was survivable while the only failures were transient — but
        // the domain gate refuses deliberately, and being bounced back to the
        // login page with no message is indistinguishable from a broken app.
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : '';
          if (message) showToast(message, 'error');
        })
        .finally(() => setIsLoadingAuth(false));
    }
  }, []);

  if (isLoadingAuth) return null;

  if (isPasswordRecovery) {
    return (
      <div className="min-h-screen relative z-10 selection:bg-indigo-500/30 selection:text-white">
        <AnimatedBackground />
        <ResetPasswordPage
          onComplete={(u) => {
            setIsPasswordRecovery(false);
            setUser(u);
            showToast('Password updated. You are signed in.', 'success');
          }}
          onCancel={() => {
            void authService.cancelPasswordRecovery();
            setIsPasswordRecovery(false);
            setUser(null);
          }}
        />
      </div>
    );
  }

  // The agreement gate. A signed-in user who has not accepted the current
  // version sees ONLY the agreement — the workspace is not rendered at all,
  // so there is nothing behind the dialog to reach around it to. Guests are
  // never blocked: they get the same charter as a dismissible notice over the
  // app they are already browsing.
  const isBlockedByAgreement = !!user && needsAgreement(user) && isAgreementBlocking(user);
  const showGuestNotice =
    !!user && needsAgreement(user) && !isAgreementBlocking(user) && !guestNoticeDismissed;

  return (
    <div className="min-h-screen relative z-10 selection:bg-indigo-500/30 selection:text-white">
      <AnimatedBackground />
      {!user ? (
        <LoginPage
          onLogin={(u) => {
            setUser(u);
            showToast(`Auth session active: ${u.displayName}`, 'success');
          }}
        />
      ) : isBlockedByAgreement ? null : (
        <AuthenticatedApp
          user={user}
          onUpdateUser={setUser}
          handleLogout={handleLogout}
          showToast={showToast}
          apiStatus={apiStatus}
        />
      )}
      {user && (isBlockedByAgreement || showGuestNotice) && (
        <UserAgreementModal
          user={user}
          onAccept={handleAcceptAgreement}
          onDismiss={() => setGuestNoticeDismissed(true)}
          onLogout={handleLogout}
          isSaving={isAcceptingAgreement}
        />
      )}
      {toast && (
        <div className="fixed top-24 right-4 z-[1000] animate-slide-in">
          <Toast message={toast.message} type={toast.type} onClose={hideToast} />
        </div>
      )}
      <ApiStatusIndicator />
      <ApiHealthIndicator />
    </div>
  );
};

export default App;
