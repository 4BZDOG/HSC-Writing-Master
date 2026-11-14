import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import Workspace from '../../components/Workspace';
import { Course, Prompt, PromptVerb, StatePath, WritingMode } from '../../types';
import { resetSupportEngagement } from '../../utils/supportEngagement';

/**
 * Exam Mode puts the reference rail away. The rail's place now holds a placard
 * that says why the space is empty and offers the way back to Coach Mode, so a
 * student who came out of Focus Mode with Exam on does not think the panels were
 * lost.
 */

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

beforeEach(resetSupportEngagement);
afterEach(cleanup);
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

const prompt = (over: Partial<Prompt> = {}): Prompt =>
  ({
    id: 'p-exam',
    question: 'Outline three benefits of developing secure software.',
    verb: 'OUTLINE' as PromptVerb,
    totalMarks: 3,
    keywords: ['security', 'testing'],
    sampleAnswers: [],
    ...over,
  }) as unknown as Prompt;

const statePath = {
  courseId: 'c1',
  topicId: 't1',
  subTopicId: 's1',
  dotPointId: 'd1',
  promptId: 'p-exam',
} as unknown as StatePath;

const renderWorkspace = (writingMode: WritingMode, onWritingModeChange = vi.fn()) =>
  render(
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
      isFocusMode={false}
      onToggleFocusMode={vi.fn()}
      writingMode={writingMode}
      onWritingModeChange={onWritingModeChange}
      showBreadcrumb={false}
      crumbs={[]}
    />
  );

const placard = () => screen.queryByRole('region', { name: /exam conditions/i });

describe('the exam conditions placard', () => {
  it('renders in Exam Mode, in the rail’s place, and says what is put away', () => {
    renderWorkspace('exam');
    const region = placard();
    expect(region).not.toBeNull();
    expect(within(region!).getByText(/put away until you submit/i).textContent).toMatch(
      /syllabus terms, the marking guide, sample answers and the draft check are put away until you submit your response for marking or go back to Coach mode/i
    );
    // The reference panels themselves are not drawn under exam conditions.
    expect(screen.queryByRole('button', { name: /^syllabus terms/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /marking guide/i })).toBeNull();
  });

  it('does not render in Coach Mode, where the rail is shown', () => {
    renderWorkspace('coach');
    expect(placard()).toBeNull();
    expect(screen.getByRole('button', { name: /^syllabus terms/i })).toBeTruthy();
  });

  it('offers a named button that switches the workspace back to Coach Mode', () => {
    const onWritingModeChange = vi.fn();
    renderWorkspace('exam', onWritingModeChange);
    fireEvent.click(within(placard()!).getByRole('button', { name: 'Back to Coach mode' }));
    expect(onWritingModeChange).toHaveBeenCalledTimes(1);
    expect(onWritingModeChange).toHaveBeenCalledWith('coach');
  });

  it('keeps the timer on the exam booklet edge, not the band-tinted surface', () => {
    renderWorkspace('exam');
    // The timer's own region is the nearest panel around its clock.
    const timer = screen.getByRole('timer');
    const panel = timer.closest('.rounded-panel') as HTMLElement | null;
    expect(panel).not.toBeNull();
    expect(panel!.className).toMatch(/\bborder-2\b/);
    expect(panel!.className).toMatch(/border-slate-500/);
    expect(panel!.className).not.toMatch(/band-surface/);
  });
});
