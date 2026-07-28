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
import ReferenceMaterials, { AccordionSection } from './ReferenceMaterials';
import MarkingCriteriaManager from './MarkingCriteriaAccordion';
import { ListChecks, Lock } from 'lucide-react';
import CommandTermGuideModal from './CommandTermGuideModal';
import Breadcrumb from './Breadcrumb';
import { getBandForMark, getCommandTermInfo } from '../data/commandTerms';
import { findAndUpdateItem } from '../utils/stateUtils';
import { cardHeightCap, MIN_CARD_HEIGHT, isTwoColumnWidth } from '../utils/layoutConstants';
import WorkspaceRightPanel from './WorkspaceRightPanel';
import SampleAnswersAccordion from './SampleAnswersAccordion';
import { isCurriculumRemote } from '../services/curriculumService';
import { isOverlayOpen } from '../hooks/useEscapeKey';
import { isQuestionTierLocked, requestUpgrade } from '../services/entitlements';
import { freeTierLimits } from '../services/planPolicy';
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

/**
 * What a free-tier student sees where a Band 4–6 question would be.
 *
 * Deliberately not a blur over a working workspace: the question stem is shown
 * (there is nothing to protect in the wording, and knowing what you are being
 * offered is the point of a paywall) while the marking, the exemplars and the
 * writing surface are simply absent.
 */
const LockedQuestionNotice: React.FC<{ verb: string; marks: number; question: string }> = ({
  verb,
  marks,
  question,
}) => (
  <div className="flex flex-col items-center justify-center min-h-[50vh] animate-fade-in px-4">
    <div className="clip-stable max-w-xl w-full text-center p-10 rounded-[32px] bg-white/70 dark:bg-[rgb(var(--color-bg-surface))]/60 border border-amber-400/30 shadow-2xl">
      <div className="w-14 h-14 mx-auto mb-6 rounded-2xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center">
        <Lock className="w-7 h-7 text-amber-500" />
      </div>
      <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-500 mb-3">
        {verb} · {marks} {marks === 1 ? 'mark' : 'marks'} · Band 6 Plus
      </p>
      <h3 className="text-lg font-serif leading-relaxed text-slate-800 dark:text-slate-200 mb-6">
        {question}
      </h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
        Higher-order questions — Analyse, Evaluate, Discuss — are part of Band 6 Plus. Your free
        plan covers every question up to tier {freeTierLimits().maxQuestionTier}.
      </p>
      <button
        onClick={() => requestUpgrade('advancedQuestions')}
        className="px-6 py-3 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 text-white font-black text-[11px] uppercase tracking-widest shadow-lg hover:scale-105 active:scale-95 transition-all"
      >
        Unlock with Plus
      </button>
    </div>
  </div>
);

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
  // Seeded at the floor rather than 0. Measuring happens in effects after the
  // first commit, so starting from "unknown" meant the writing area painted at
  // its own natural height — around 430px — and then snapped to the prompt's
  // 620px a frame or two later, which read as the pair resizing on load. Both
  // cards are floored at MIN_CARD_HEIGHT anyway, so starting there is the
  // answer for every prompt that does not exceed it, and a much smaller step
  // for the ones that do.
  const [syncedTotalHeight, setSyncedTotalHeight] = useState(MIN_CARD_HEIGHT);
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
  // Whether the two cards are actually side by side. Below `lg` the grid stacks
  // them, and in Focus Mode there is only ever one column, so in both cases the
  // cross-card sync has nothing to align and is suppressed entirely.
  const [isSideBySide, setIsSideBySide] = useState(() =>
    typeof window === 'undefined' ? true : isTwoColumnWidth(window.innerWidth)
  );
  useEffect(() => {
    const update = () => {
      setHeightCap(cardHeightCap(window.innerHeight));
      setIsSideBySide(isTwoColumnWidth(window.innerWidth));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const syncChrome = isSideBySide && !isFocusMode;
  // `undefined` rather than 0 so each card falls back to its own natural
  // sizing: content-height chrome, and a writing area free to grow to its cap.
  const syncedHeader = syncChrome ? syncedHeaderHeight : undefined;
  const syncedFooter = syncChrome ? syncedFooterHeight : undefined;
  const syncedTotal = syncChrome ? syncedTotalHeight : undefined;

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
  // Focus Mode swaps the full prompt card for the condensed one, which reports
  // neither a total nor a footer height. Its observers disconnect on unmount,
  // so these stale readings are cleared; the synced values themselves are
  // suppressed by `syncChrome` below rather than zeroed, so returning to the
  // two-column view restores the last good sizing instead of flashing through
  // the fallback.
  useEffect(() => {
    if (isFocusMode) {
      setPromptTotalHeight(0);
      setPromptFooterHeight(0);
    }
  }, [isFocusMode]);

  const courseOutcomes = currentCourse?.outcomes || [];

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
    // universal "exit fullscreen" gesture. It yields to anything layered above
    // it: with the outcome brief open, one press used to close the brief AND
    // drop the student out of Focus Mode, because both handlers sit on
    // `window` and neither can stop the other.
    Escape: () => {
      if (isFocusMode && !isOverlayOpen()) onToggleFocusMode();
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

  // The question picker disables locked tiers, but it is not the only way into
  // a question: a teacher's assignment link sets the path directly, and so
  // does a restored session from when the student still held Plus. The gate
  // belongs on the workspace itself, where every route ends up.
  if (isQuestionTierLocked(getCommandTermInfo(currentPrompt.verb).tier)) {
    return (
      <LockedQuestionNotice
        verb={getCommandTermInfo(currentPrompt.verb).term}
        marks={currentPrompt.totalMarks}
        question={currentPrompt.question}
      />
    );
  }

  const breadcrumbItems = [
    { label: currentCourse?.name || 'Course' },
    { label: currentTopic?.name || 'Topic' },
    { label: currentSubTopic?.name || 'Sub-Topic' },
    { label: currentDotPoint?.description || 'Dot Point' },
  ];

  // The exemplars live under the student's own writing, in every layout.
  //
  // They spent a release in the left rail, filed under the Marking Guide on the
  // theory that criteria and models are read together. In practice a student
  // compares a model answer with the one they have just written, and in the
  // rail that comparison was a diagonal across the page — or, on a laptop, a
  // scroll to a column that had already ended. Directly beneath the writing
  // card the two sit in one vertical line, and Focus Mode no longer needs a
  // special case: the card is already where it belongs.
  const markingGuideCard = (
    <AccordionSection
      title="Marking Guide"
      subtitle={`Top level: Band ${getBandForMark(currentPrompt.totalMarks, currentPrompt.totalMarks, getCommandTermInfo(currentPrompt.verb).tier)}`}
      icon={<ListChecks />}
      band={5}
    >
      <MarkingCriteriaManager
        prompt={currentPrompt}
        markingCriteria={currentPrompt.markingCriteria || ''}
        onSave={(mc) =>
          syllabusHandlers.updateCourses((d) =>
            findAndUpdateItem(d, statePath, (p) => (p.markingCriteria = mc))
          )
        }
        band={5}
        userRole={userRole}
        courseOutcomes={courseOutcomes}
        embedded
      />
    </AccordionSection>
  );

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
        // No transition on this grid: `grid-template-columns` cannot interpolate
        // between `none` and a 12-column track list, so `transition-all` animated
        // nothing useful here — it only kept the composited cards in motion while
        // Focus Mode added or removed whole columns, leaving stale paint behind.
        className={`grid grid-cols-1 ${isFocusMode ? 'w-full' : 'lg:grid-cols-12 lg:grid-rows-[auto,1fr]'} gap-6 flex-1 min-h-0`}
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
              minHeaderHeight={syncedHeader}
              onTotalHeightChange={setPromptTotalHeight}
              onFooterResize={setPromptFooterHeight}
              minFooterHeight={syncedFooter}
              minTotalHeight={syncedTotal}
              breadcrumb={breadcrumbItems.map((b) => b.label)}
              examMode={isExamMode}
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
              minHeaderHeight={syncedHeader}
              condensed
              breadcrumb={breadcrumbItems.map((b) => b.label)}
              examMode={isExamMode}
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
          minHeaderHeight={syncedHeader}
          minEditorHeight={syncedTotal}
          onFooterResize={setEditorFooterHeight}
          minFooterHeight={syncedFooter}
          writingMode={writingMode}
          onWritingModeChange={onWritingModeChange}
          // The exemplars always ride under the writing card. Focus Mode has no
          // left rail, so it also gets the Marking Guide — the other placard a
          // student reaches for mid-answer — folded shut above them.
          referenceSlot={
            isExamMode ? undefined : (
              <>
                {isFocusMode && markingGuideCard}
                {sampleAnswersCard}
              </>
            )
          }
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
