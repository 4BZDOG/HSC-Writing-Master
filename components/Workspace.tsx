import React, { useState, useEffect } from 'react';
import {
  Course,
  StatePath,
  EvaluationResult,
  Prompt,
  UserRole,
  Topic,
  SubTopic,
  DotPoint,
  WritingMode,
} from '../types';
import PromptDisplay from './PromptDisplay';
import ReferenceMaterials from './ReferenceMaterials';
import CommandTermGuideModal from './CommandTermGuideModal';
import Breadcrumb from './Breadcrumb';
import { getCommandTermInfo } from '../data/commandTerms';
import { findAndUpdateItem } from '../utils/stateUtils';
import { cardHeightCap, MIN_CARD_HEIGHT } from '../utils/layoutConstants';
import WorkspaceRightPanel from './WorkspaceRightPanel';
import SampleAnswersAccordion from './SampleAnswersAccordion';
import { isCurriculumRemote } from '../services/curriculumService';
import type { WorkspaceSyllabusHandlers } from '../hooks/useSyllabusData';

const useKeyboardShortcuts = (shortcuts: { [key: string]: (e: KeyboardEvent) => void }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      // Focus-mode toggle is strictly the Ctrl/⌘ + Shift + F chord — a bare
      // Shift+F must never hijack the keyboard, in or out of an input.
      if (e.key.toLowerCase() === 'f' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        shortcuts['F']?.(e);
        return;
      }
      // The Enter handler checks Ctrl/⌘ itself; Escape must always reach the
      // focus-mode exit, even while the student is typing.
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !isInput) {
        shortcuts['Enter']?.(e);
        return;
      }
      if (e.key === 'Escape') shortcuts['Escape']?.(e);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
};

interface WorkspaceProps {
  courses: Course[];
  statePath: StatePath;
  currentSelection: {
    currentCourse?: Course;
    currentTopic?: Topic;
    currentSubTopic?: SubTopic;
    currentDotPoint?: DotPoint;
    currentPrompt?: Prompt;
  };
  userAnswer: string;
  debouncedUserAnswer: string;
  setUserAnswer: (val: string) => void;
  evaluationResult: EvaluationResult | null;
  isEvaluating: boolean;
  evaluationError: string | null;
  isEnriching: boolean;
  enrichError: string | null;
  isImproving: boolean;
  improveAnswerError: string | null;
  evaluatedAnswer: string;
  handleEvaluate: () => void;
  geminiHandlers: any;
  modalHandlers: any;
  syllabusHandlers: WorkspaceSyllabusHandlers;
  userRole: UserRole;
  isFocusMode: boolean;
  onToggleFocusMode: () => void;
  writingMode: WritingMode;
  onWritingModeChange: (mode: WritingMode) => void;
  showBreadcrumb?: boolean;
}

const Workspace: React.FC<WorkspaceProps> = ({
  courses,
  statePath,
  currentSelection,
  userAnswer,
  debouncedUserAnswer,
  setUserAnswer,
  evaluationResult,
  isEvaluating,
  evaluationError,
  isEnriching,
  enrichError,
  isImproving,
  improveAnswerError,
  evaluatedAnswer,
  handleEvaluate,
  geminiHandlers,
  modalHandlers,
  syllabusHandlers,
  userRole,
  isFocusMode,
  onToggleFocusMode,
  writingMode,
  onWritingModeChange,
  showBreadcrumb = true,
}) => {
  const { currentCourse, currentTopic, currentSubTopic, currentDotPoint, currentPrompt } =
    currentSelection;

  // In Exam Mode the reference materials (syllabus terms, marking guide, grade
  // standards) are hidden — a student sitting an exam can't see the marking key.
  const isExamMode = writingMode === 'exam';

  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isSuggestingOutcomes, setIsSuggestingOutcomes] = useState(false);
  // ONE reading size for the whole workspace — question, writing surface and
  // exemplars. Every zoom control in the workspace writes to this value, so
  // there is a single setting rather than three that drift apart.
  const [promptFontSize, setPromptFontSize] = useState(18);

  // Layout Sync State. Headers and footers are matched in both directions so
  // the chrome lines up, but the CARD height is one-way: the question prompt
  // sets it and the writing area follows. The prompt grows to fit its question
  // and scenario, so most of the time it reads without scrolling; only when it
  // outruns the viewport cap does it scroll too. The response has no natural
  // limit, so the writing area scrolls whenever it overflows.
  const [promptHeaderHeight, setPromptHeaderHeight] = useState(0);
  const [editorHeaderHeight, setEditorHeaderHeight] = useState(0);
  const [syncedHeaderHeight, setSyncedHeaderHeight] = useState(0);
  const [promptTotalHeight, setPromptTotalHeight] = useState(0);
  const [syncedTotalHeight, setSyncedTotalHeight] = useState(0);
  const [promptFooterHeight, setPromptFooterHeight] = useState(0);
  const [editorFooterHeight, setEditorFooterHeight] = useState(0);
  const [syncedFooterHeight, setSyncedFooterHeight] = useState(0);

  useEffect(() => {
    const max = Math.max(promptHeaderHeight, editorHeaderHeight);
    if (max > 0) setSyncedHeaderHeight(max);
  }, [promptHeaderHeight, editorHeaderHeight]);

  // The viewport ceiling, refreshed on resize: how tall the pair may grow
  // before a longer prompt would start pushing the writing area off screen.
  const [heightCap, setHeightCap] = useState(() =>
    cardHeightCap(typeof window === 'undefined' ? 900 : window.innerHeight)
  );
  useEffect(() => {
    const update = () => setHeightCap(cardHeightCap(window.innerHeight));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // The prompt's own content height, floored so a one-line question still
  // leaves somewhere to write and capped so a very long scenario scrolls
  // inside its card instead of pushing the writing area below the fold.
  // Nothing the student types feeds back into this.
  useEffect(() => {
    if (promptTotalHeight > 0) {
      setSyncedTotalHeight(Math.min(heightCap, Math.max(MIN_CARD_HEIGHT, promptTotalHeight)));
    }
  }, [promptTotalHeight, heightCap]);

  useEffect(() => {
    const max = Math.max(promptFooterHeight, editorFooterHeight);
    if (max > 0) setSyncedFooterHeight(max);
  }, [promptFooterHeight, editorFooterHeight]);

  // Focus Mode swaps the full prompt card for the condensed one, which reports
  // neither a total nor a footer height. Its observers disconnect on unmount,
  // so without this the writing area would keep being sized — and its footer
  // padded — by the last measurements of a card no longer on screen.
  // Zeroing promptTotalHeight alone was not enough: the effect that derives
  // syncedTotalHeight ignores 0 (a legitimate "not measured yet" reading), so
  // the writing area stayed pinned to the height of the full prompt card that
  // is no longer on screen. Clearing the synced value too lets the editor fall
  // back to its own cap and actually use the space Focus Mode frees up.
  useEffect(() => {
    if (isFocusMode) {
      setPromptTotalHeight(0);
      setPromptFooterHeight(0);
      setSyncedTotalHeight(0);
    }
  }, [isFocusMode]);

  const courseOutcomes = currentCourse?.outcomes || [];

  useEffect(() => {
    if (evaluationResult) {
      const el = document.getElementById('evaluation-results');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [evaluationResult]);

  const handleSaveDraft = () => {
    if (!currentPrompt) return;
    if (userAnswer !== currentPrompt.userDraft) {
      syllabusHandlers.updateCourses((draft: any) => {
        findAndUpdateItem(draft, statePath, (p: any) => {
          p.userDraft = userAnswer;
        });
      });
    }
  };

  const handleSuggestOutcomes = async () => {
    if (!currentPrompt || !currentCourse || isSuggestingOutcomes) return;
    setIsSuggestingOutcomes(true);
    try {
      const outcomes = await geminiHandlers.suggestOutcomesForPrompt(
        currentPrompt.question,
        currentCourse.outcomes,
        currentPrompt.totalMarks
      );
      if (outcomes) {
        syllabusHandlers.updateCourses((draft: any) => {
          findAndUpdateItem(draft, statePath, (p: any) => {
            p.linkedOutcomes = outcomes;
          });
        });
      }
    } finally {
      setIsSuggestingOutcomes(false);
    }
  };

  const onInternalEvaluate = () => {
    handleSaveDraft();
    handleEvaluate();
  };

  useKeyboardShortcuts({
    Enter: (e: KeyboardEvent) => {
      if (!isEvaluating && userAnswer.trim() && (e.ctrlKey || e.metaKey)) onInternalEvaluate();
    },
    F: () => onToggleFocusMode(),
    // Pressing Escape while in Focus Mode returns to the full workspace — the
    // universal "exit fullscreen" gesture. It never fires outside Focus Mode,
    // so it won't interfere with other Escape handlers (modals, menus).
    Escape: () => {
      if (isFocusMode) onToggleFocusMode();
    },
  });

  const handleRunQualityCheck = (content: string, type: 'question' | 'code') => {
    modalHandlers.showQualityCheck({
      content,
      type,
      onUpdate: (newContent: string) => {
        syllabusHandlers.updateCourses((draft: any) => {
          findAndUpdateItem(draft, statePath, (p: any) => {
            if (type === 'question') p.question = newContent;
          });
        });
      },
    });
  };

  useEffect(() => {
    setUserAnswer(currentPrompt?.userDraft || '');
  }, [currentPrompt?.id, setUserAnswer]);

  if (!currentPrompt) return null;

  const breadcrumbItems = [
    { label: currentCourse?.name || 'Course' },
    { label: currentTopic?.name || 'Topic' },
    { label: currentSubTopic?.name || 'Sub-Topic' },
    { label: currentDotPoint?.description || 'Dot Point' },
  ];

  // One card, two homes. In the two-column layout the exemplars belong in the
  // left rail directly under the Marking Guide — criteria and models are read
  // together. Focus Mode has no left rail, so the same card is handed to the
  // writing column instead, collapsed, so it is reachable without competing
  // with the page the student is writing on.
  const sampleAnswersCard = (
    <SampleAnswersAccordion
      prompt={currentPrompt}
      onSampleAnswerGenerated={(answer) =>
        syllabusHandlers.handleSampleAnswerGenerated(statePath, answer)
      }
      onUseSampleAnswer={(text) => setUserAnswer(text)}
      onDeleteSampleAnswer={(id) => syllabusHandlers.handleDeleteSampleAnswer(statePath, id)}
      onUpdateSampleAnswer={(answer) =>
        syllabusHandlers.handleUpdateSampleAnswer(statePath, answer)
      }
      onContributeSampleAnswer={
        isCurriculumRemote() && userRole !== 'guest'
          ? (answer) => syllabusHandlers.handleContributeSampleAnswer(statePath, answer)
          : undefined
      }
      userRole={userRole}
      onRecalibrate={() => geminiHandlers.recalibrateSamples(currentPrompt)}
      collapsible={isFocusMode}
      fontSize={promptFontSize}
      onFontSizeChange={setPromptFontSize}
    />
  );

  return (
    <div className="flex flex-col h-full gap-4">
      {!isFocusMode && showBreadcrumb && (
        <div className="w-full flex-shrink-0">
          <Breadcrumb items={breadcrumbItems} />
        </div>
      )}

      {/* Two explicit rows on lg so the right panel spans beside both the
          prompt (row 1) and the reference material (row 2). On mobile the DOM
          order follows the student's journey — question → writing area →
          reference material — instead of burying the editor beneath the
          reference accordions. */}
      <div
        className={`grid grid-cols-1 ${isFocusMode ? 'w-full' : 'lg:grid-cols-12 lg:grid-rows-[auto,1fr]'} gap-6 flex-1 min-h-0 transition-all duration-500`}
      >
        {!isFocusMode && (
          <div
            className={`${isExamMode ? 'lg:col-span-4' : 'lg:col-span-5'} lg:col-start-1 lg:row-start-1`}
          >
            <PromptDisplay
              prompt={currentPrompt}
              isEnriching={isEnriching}
              enrichError={enrichError}
              onVerbClick={() => setIsGuideOpen(true)}
              onGenerateScenario={geminiHandlers.handleGenerateScenario}
              onUpdatePrompt={(updates) =>
                syllabusHandlers.updateCourses((draft: any) => {
                  findAndUpdateItem(draft, statePath, (p: any) => Object.assign(p, updates));
                })
              }
              isGeneratingScenario={geminiHandlers.isGeneratingScenario}
              generateScenarioError={geminiHandlers.generateScenarioError}
              courseOutcomes={courseOutcomes}
              onOutcomeClick={() => {}}
              userRole={userRole}
              onDismissEnrichError={() => geminiHandlers.setEnrichError(null)}
              onRunQualityCheck={handleRunQualityCheck}
              onSuggestOutcomes={handleSuggestOutcomes}
              isSuggestingOutcomes={isSuggestingOutcomes}
              fontSize={promptFontSize}
              onFontSizeChange={setPromptFontSize}
              onHeaderResize={setPromptHeaderHeight}
              minHeaderHeight={syncedHeaderHeight}
              onTotalHeightChange={setPromptTotalHeight}
              onFooterResize={setPromptFooterHeight}
              minFooterHeight={syncedFooterHeight}
              minTotalHeight={syncedTotalHeight}
              breadcrumb={breadcrumbItems.map((b) => b.label)}
            />
          </div>
        )}

        {isFocusMode && (
          <div className="animate-fade-in max-w-5xl mx-auto w-full mb-4">
            <PromptDisplay
              prompt={currentPrompt}
              isEnriching={isEnriching}
              enrichError={enrichError}
              onVerbClick={() => setIsGuideOpen(true)}
              onGenerateScenario={geminiHandlers.handleGenerateScenario}
              onUpdatePrompt={(updates) =>
                syllabusHandlers.updateCourses((d) =>
                  findAndUpdateItem(d, statePath, (p) => Object.assign(p, updates))
                )
              }
              isGeneratingScenario={geminiHandlers.isGeneratingScenario}
              generateScenarioError={geminiHandlers.generateScenarioError}
              courseOutcomes={courseOutcomes}
              onOutcomeClick={() => {}}
              userRole={userRole}
              onDismissEnrichError={() => geminiHandlers.setEnrichError(null)}
              onRunQualityCheck={handleRunQualityCheck}
              onSuggestOutcomes={handleSuggestOutcomes}
              isSuggestingOutcomes={isSuggestingOutcomes}
              fontSize={promptFontSize}
              onFontSizeChange={setPromptFontSize}
              onHeaderResize={setPromptHeaderHeight}
              minHeaderHeight={syncedHeaderHeight}
              condensed
              breadcrumb={breadcrumbItems.map((b) => b.label)}
            />
          </div>
        )}

        <WorkspaceRightPanel
          isFocusMode={isFocusMode}
          userAnswer={userAnswer}
          setUserAnswer={setUserAnswer}
          debouncedUserAnswer={debouncedUserAnswer}
          currentPrompt={currentPrompt}
          isEvaluating={isEvaluating}
          evaluationResult={evaluationResult}
          evaluationError={evaluationError}
          onEvaluate={onInternalEvaluate}
          onSaveDraft={handleSaveDraft}
          isImproving={isImproving}
          improveAnswerError={improveAnswerError}
          evaluatedAnswer={evaluatedAnswer}
          geminiHandlers={geminiHandlers}
          syllabusHandlers={syllabusHandlers}
          statePath={statePath}
          breadcrumbItems={breadcrumbItems}
          handleRunQualityCheck={handleRunQualityCheck}
          onToggleFocusMode={onToggleFocusMode}
          promptFontSize={promptFontSize}
          onPromptFontSizeChange={setPromptFontSize}
          onHeaderResize={setEditorHeaderHeight}
          minHeaderHeight={syncedHeaderHeight}
          minEditorHeight={syncedTotalHeight}
          onFooterResize={setEditorFooterHeight}
          minFooterHeight={syncedFooterHeight}
          writingMode={writingMode}
          onWritingModeChange={onWritingModeChange}
          sampleAnswersSlot={isFocusMode && !isExamMode ? sampleAnswersCard : undefined}
        />

        {!isFocusMode && (
          <div
            className={`lg:col-span-5 lg:col-start-1 lg:row-start-2 self-start ${isExamMode ? 'hidden' : ''}`}
          >
            <ReferenceMaterials
              prompt={currentPrompt}
              topic={currentTopic}
              dotPointText={currentDotPoint?.description}
              userRole={userRole}
              onKeywordsChange={(kw) =>
                syllabusHandlers.updateCourses((d) =>
                  findAndUpdateItem(d, statePath, (p) => (p.keywords = kw))
                )
              }
              onMarkingCriteriaChange={(mc) =>
                syllabusHandlers.updateCourses((d) =>
                  findAndUpdateItem(d, statePath, (p) => (p.markingCriteria = mc))
                )
              }
              isEnriching={isEnriching}
              onRegenerateKeywords={geminiHandlers.handleRegenerateKeywords}
              isRegeneratingKeywords={geminiHandlers.isRegeneratingKeywords}
              regenerateError={geminiHandlers.regenerateKeywordsError}
              onSuggestKeywords={geminiHandlers.handleSuggestKeywords}
              isSuggestingKeywords={geminiHandlers.isSuggestingKeywords}
              suggestError={geminiHandlers.suggestKeywordsError}
              userAnswer={userAnswer}
              onAddWord={(word) =>
                window.dispatchEvent(new CustomEvent('insert-text', { detail: word }))
              }
              courseOutcomes={courseOutcomes}
              breadcrumb={breadcrumbItems.map((b) => b.label)}
              sampleAnswersSlot={sampleAnswersCard}
            />
          </div>
        )}

        <CommandTermGuideModal
          isOpen={isGuideOpen}
          onClose={() => setIsGuideOpen(false)}
          termInfo={getCommandTermInfo(currentPrompt.verb)}
        />
      </div>
    </div>
  );
};

// Memoised so that opening or closing a modal — which re-renders App but leaves
// every Workspace prop referentially unchanged (see the useMemo'd handler bags
// in App.tsx) — no longer re-renders the entire writing area. This is what makes
// heavy modals feel instant to close.
export default React.memo(Workspace);
