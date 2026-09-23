import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import Workspace from '../../components/Workspace';
import { Course, Prompt, PromptVerb, StatePath } from '../../types';
import { readSupportUsage, resetSupportEngagement } from '../../utils/supportEngagement';

/**
 * Focus Mode has no reference rail, so the workspace builds its own Marking
 * Guide panel under the writing card. That copy had drifted from the rail's:
 * it read "Top level: Band 2" over an empty guide, and it carried no
 * `supportId`, so a student who read the guide in Focus Mode was told in their
 * report that they had written without opening it.
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
    id: 'p-focus',
    question: 'Describe the key steps involved in DNA replication.',
    verb: 'DESCRIBE' as PromptVerb,
    totalMarks: 4,
    keywords: [],
    sampleAnswers: [],
    ...over,
  }) as unknown as Prompt;

const statePath = {
  courseId: 'c1',
  topicId: 't1',
  subTopicId: 's1',
  dotPointId: 'd1',
  promptId: 'p-focus',
} as unknown as StatePath;

const renderFocused = (current: Prompt) =>
  render(
    <Workspace
      courses={[] as Course[]}
      statePath={statePath}
      currentSelection={{ currentPrompt: current }}
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
      userRole="user"
      isFocusMode
      onToggleFocusMode={vi.fn()}
      writingMode="coach"
      onWritingModeChange={vi.fn()}
      showBreadcrumb={false}
      crumbs={[]}
    />
  );

const guideToggle = () => screen.getByRole('button', { name: /marking guide/i });

describe('the Marking Guide in Focus Mode', () => {
  it('says there is no guide yet, rather than naming a band it tops out at', () => {
    renderFocused(prompt());
    expect(guideToggle().textContent).toMatch(/not written yet/i);
    expect(guideToggle().textContent).not.toMatch(/top level/i);
  });

  it('names the band a written guide reaches', () => {
    renderFocused(prompt({ markingCriteria: 'Band 2: describes the steps.' }));
    expect(guideToggle().textContent).toMatch(/written to band 2/i);
  });

  it('counts as opened in the report when the student opens it here', () => {
    renderFocused(prompt());
    fireEvent.click(guideToggle());
    expect(readSupportUsage('p-focus').opened).toContain('markingGuide');
  });
});
