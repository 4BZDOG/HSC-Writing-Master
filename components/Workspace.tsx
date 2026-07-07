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
import WorkspaceRightPanel from './WorkspaceRightPanel';
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
  const [promptFontSize, setPromptFontSize] = useState(18);

  // Layout Sync State
  const [promptHeaderHeight, setPromptHeaderHeight] = useState(0);
  const [editorHeaderHeight, setEditorHeaderHeight] = useState(0);
  const [syncedHeaderHeight, setSyncedHeaderHeight] = useState(0);
  const [promptTotalHeight, setPromptTotalHeight] = useState(0);

  useEffect(() => {
    const max = Math.max(promptHeaderHeight, editorHeaderHeight);
    if (max > 0) setSyncedHeaderHeight(max);
  }, [promptHeaderHeight, editorHeaderHeight]);

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

  const handleDevMockEvaluation = () => {
    const mockResult: EvaluationResult = {
      overallBand: 4,
      overallMark: Math.floor(currentPrompt ? currentPrompt.totalMarks * 0.7 : 10),
      overallFeedback:
        'Simulated evaluation for testing purposes. Shows strong grasp of theory with minor gaps in scenario application.',
      criteria: [
        { criterion: 'Concept Clarity', mark: 3, maxMark: 4, feedback: 'Sound understanding.' },
      ],
      strengths: ['Direct address of verb.', 'Correct terminology.'],
      improvements: ['Expand on consequences.'],
      userFeedback: undefined,
    };
    geminiHandlers.setEvaluationResult(mockResult);
  };

  const handleDevMockImprovement = () => {
    const currentText = userAnswer || 'Placeholder answer.';
    const mockImproved =
      currentText + '\n\n**Improved:** Added causal links and technical specifics.';
    geminiHandlers.setOriginalAnswerForImprovement(currentText);
    geminiHandlers.setImprovedAnswer(mockImproved);
  };

  if (!currentPrompt) return null;

  const breadcrumbItems = [
    { label: currentCourse?.name || 'Course' },
    { label: currentTopic?.name || 'Topic' },
    { label: currentSubTopic?.name || 'Sub-Topic' },
    { label: currentDotPoint?.description || 'Dot Point' },
  ];

  return (
    <div className="flex flex-col h-full gap-4">
      {!isFocusMode && showBreadcrumb && (
        <div className="w-full flex-shrink-0">
          <Breadcrumb items={breadcrumbItems} />
        </div>
      )}

      <div
        className={`grid grid-cols-1 ${isFocusMode ? 'w-full' : 'lg:grid-cols-12'} gap-6 flex-1 min-h-0 transition-all duration-500`}
      >
        {!isFocusMode && (
          <div className="lg:col-span-5 flex flex-col h-full overflow-y-auto pb-20 pt-0 scrollbar-hide gap-6">
            <div className="w-full flex-shrink-0">
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
              />
            </div>
            <div className={`flex-shrink-0 ${isExamMode ? 'hidden' : ''}`}>
              <ReferenceMaterials
                prompt={currentPrompt}
                topic={currentTopic}
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
              />
            </div>
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
          userRole={userRole}
          breadcrumbItems={breadcrumbItems}
          handleRunQualityCheck={handleRunQualityCheck}
          onToggleFocusMode={onToggleFocusMode}
          handleDevMockEvaluation={handleDevMockEvaluation}
          handleDevMockImprovement={handleDevMockImprovement}
          promptFontSize={promptFontSize}
          onHeaderResize={setEditorHeaderHeight}
          minHeaderHeight={syncedHeaderHeight}
          minEditorHeight={promptTotalHeight}
          writingMode={writingMode}
          onWritingModeChange={onWritingModeChange}
        />

        <CommandTermGuideModal
          isOpen={isGuideOpen}
          onClose={() => setIsGuideOpen(false)}
          termInfo={getCommandTermInfo(currentPrompt.verb)}
        />
      </div>
    </div>
  );
};

export default Workspace;
