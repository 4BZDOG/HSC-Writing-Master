import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import Workspace from '../../components/Workspace';
import { isOverlayOpen } from '../../hooks/useEscapeKey';
import { Course, Prompt, PromptVerb, StatePath } from '../../types';
import { resetSupportEngagement } from '../../utils/supportEngagement';

/**
 * Two keyboard behaviours of Focus Mode, pinned at the workspace.
 *
 * Ctrl/⌘+Shift+F must not toggle Focus Mode from under an open dialog: the
 * toggle remounts the question card and would lose what was typed in a flag
 * dialog. And leaving Focus Mode from the keyboard must hand focus to the Focus
 * button, not drop it on <body>.
 */

vi.mock('../../hooks/useEscapeKey', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../hooks/useEscapeKey')>()),
  isOverlayOpen: vi.fn(() => false),
}));
vi.mock('../../services/geminiService', () => ({
  explainOutcomeInContext: vi.fn(),
  generateRubricForPrompt: vi.fn(),
}));
vi.mock('../../services/entitlements', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/entitlements')>()),
  isFeatureLocked: () => false,
  isQuestionTierLocked: () => false,
  isSampleAnswerLocked: () => false,
  isFeedbackLocked: () => false,
  freeEvalsRemaining: () => Infinity,
  requestUpgrade: vi.fn(),
}));
vi.mock('../../services/curriculumService', () => ({ isCurriculumRemote: () => false }));

beforeEach(() => {
  resetSupportEngagement();
  vi.mocked(isOverlayOpen).mockReturnValue(false);
});
afterEach(cleanup);
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

const prompt = (): Prompt =>
  ({
    id: 'p-focus',
    question: 'Outline three benefits of developing secure software.',
    verb: 'OUTLINE' as PromptVerb,
    totalMarks: 3,
    keywords: ['security', 'testing'],
    sampleAnswers: [],
  }) as unknown as Prompt;

const statePath = {
  courseId: 'c1',
  topicId: 't1',
  subTopicId: 's1',
  dotPointId: 'd1',
  promptId: 'p-focus',
} as unknown as StatePath;

const ui = (isFocusMode: boolean, onToggleFocusMode = vi.fn()) => (
  <Workspace
    courses={[] as Course[]}
    statePath={statePath}
    currentSelection={{ currentPrompt: prompt() }}
    userAnswer=""
    debouncedUserAnswer=""
    setUserAnswer={vi.fn()}
    evaluationResult={null}
    isEvaluating={false}
    evaluationError={null}
    isEnriching={false}
    enrichError={null}
    isImproving={false}
    improveAnswerError={null}
    evaluatedAnswer=""
    handleEvaluate={vi.fn()}
    geminiHandlers={{} as never}
    modalHandlers={{} as never}
    syllabusHandlers={{ updateCourses: vi.fn() } as never}
    userRole={'user' as never}
    isFocusMode={isFocusMode}
    onToggleFocusMode={onToggleFocusMode}
    writingMode="coach"
    onWritingModeChange={vi.fn()}
    showBreadcrumb={false}
    crumbs={[]}
  />
);

describe('Ctrl/⌘ + Shift + F', () => {
  it('toggles Focus Mode on the chord', () => {
    const onToggle = vi.fn();
    render(ui(false, onToggle));

    fireEvent.keyDown(window, { key: 'F', ctrlKey: true, shiftKey: true });

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('does not toggle Focus Mode from under an open dialog', () => {
    vi.mocked(isOverlayOpen).mockReturnValue(true);
    const onToggle = vi.fn();
    render(ui(false, onToggle));

    fireEvent.keyDown(window, { key: 'F', metaKey: true, shiftKey: true });

    expect(onToggle).not.toHaveBeenCalled();
  });
});

describe('leaving Focus Mode from the keyboard', () => {
  it('hands focus to the Focus button when focus would otherwise fall to the page', () => {
    const { rerender } = render(ui(true));

    rerender(ui(false));

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Focus mode' }));
  });

  it('leaves focus where it is when it is still on something on the page', () => {
    const outside = document.createElement('input');
    document.body.appendChild(outside);
    try {
      const { rerender } = render(ui(true));
      outside.focus();

      rerender(ui(false));

      expect(document.activeElement).toBe(outside);
    } finally {
      outside.remove();
    }
  });
});
