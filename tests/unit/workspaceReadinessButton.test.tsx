import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import WorkspaceRightPanel from '../../components/WorkspaceRightPanel';
import { Prompt, PromptVerb, StatePath, WritingMode } from '../../types';

/**
 * Step 4 of the live-readiness-hint plan: the Evaluate button's accent and the
 * ReadinessMeter that must always ride with it.
 *
 * The point of these tests is the honesty constraint, not the pixels: the
 * button may take palette colour only once there is real substance to mark, it
 * must never do so in Exam Mode (where nothing hints at scoring), and whenever
 * it is coloured the readiness label + percentage travel with it — here, via
 * the meter (role="progressbar") and the button's own accessible name.
 */

vi.mock('../../services/geminiService', () => ({
  explainOutcomeInContext: vi.fn(),
  generateRubricForPrompt: vi.fn(),
}));

vi.mock('../../services/entitlements', () => ({
  isFeatureLocked: () => false,
  requestUpgrade: vi.fn(),
  freeEvalsRemaining: () => Infinity,
  // useSyncExternalStore needs a real subscribe/unsubscribe pair.
  subscribeEvalCount: () => () => {},
}));

afterEach(cleanup);

const prompt = (over: Partial<Prompt> = {}): Prompt =>
  ({
    id: 'p1',
    question: 'Describe the key steps involved in DNA replication.',
    verb: 'DESCRIBE' as PromptVerb,
    totalMarks: 4,
    keywords: ['helicase'],
    sampleAnswers: [],
    ...over,
  }) as unknown as Prompt;

// A real, multi-sentence draft that clears the neutral (barely-started) floor:
// several sentences, a used keyword, enough length to score well above 12.
const SUBSTANTIAL_DRAFT =
  'DNA replication begins when helicase unwinds the double helix at the origin. ' +
  'Polymerase then reads each template strand and adds complementary nucleotides. ' +
  'The outcome is two identical daughter molecules, each carrying one original strand.';

const geminiHandlers = {
  improvement: null,
  showImprovementReview: false,
  improvementReviewLeadsToFeedback: false,
  resetEvaluation: vi.fn(),
  improveAnswer: vi.fn(),
  setShowImprovementReview: vi.fn(),
  handleFeedbackSubmit: vi.fn(),
} as unknown as React.ComponentProps<typeof WorkspaceRightPanel>['geminiHandlers'];

const syllabusHandlers = {
  handleSampleAnswerGenerated: vi.fn(),
} as unknown as React.ComponentProps<typeof WorkspaceRightPanel>['syllabusHandlers'];

const renderPanel = (
  over: Partial<React.ComponentProps<typeof WorkspaceRightPanel>> = {}
) => {
  const answer = over.userAnswer ?? '';
  return render(
    <WorkspaceRightPanel
      isFocusMode={false}
      userAnswer={answer}
      setUserAnswer={vi.fn()}
      debouncedUserAnswer={over.debouncedUserAnswer ?? answer}
      currentPrompt={prompt()}
      isEvaluating={false}
      evaluationResult={null}
      evaluationError={null}
      onEvaluate={vi.fn()}
      onSaveDraft={vi.fn()}
      isImproving={false}
      improveAnswerError={null}
      evaluatedAnswer=""
      geminiHandlers={geminiHandlers}
      syllabusHandlers={syllabusHandlers}
      statePath={{} as StatePath}
      breadcrumbItems={[{ label: 'Biology' }]}
      handleRunQualityCheck={vi.fn()}
      onToggleFocusMode={vi.fn()}
      promptFontSize={18}
      onPromptFontSizeChange={vi.fn()}
      writingMode={'coach' as WritingMode}
      onWritingModeChange={vi.fn()}
      {...over}
    />
  );
};

describe('the Evaluate button + readiness meter (step 4)', () => {
  it('mounts the readiness meter in the footer for a non-exam draft', () => {
    renderPanel({ userAnswer: SUBSTANTIAL_DRAFT });
    const meter = screen.getByRole('progressbar');
    expect(meter).toBeTruthy();
    // Colour never travels alone: the accessible name carries the label + %.
    expect(meter.getAttribute('aria-label')).toMatch(/draft readiness/i);
  });

  it('gives the button the honest readiness aria-label once there is substance', () => {
    renderPanel({ userAnswer: SUBSTANTIAL_DRAFT });
    // The button's accessible name speaks the same readiness the colour shows.
    const button = screen.getByRole('button', { name: /evaluate — draft readiness/i });
    expect(button.getAttribute('aria-label')).toMatch(/\d+%/);
  });

  it('keeps the button plainly labelled and neutral for an empty draft', () => {
    renderPanel({ userAnswer: '' });
    // No readiness in the accessible name — the empty box earns no palette hue.
    expect(screen.queryByRole('button', { name: /draft readiness/i })).toBeNull();
    // The plainly-labelled Evaluate button is still there (name is "Evaluate"
    // plus its ⌘↵ shortcut hint — never a readiness phrase).
    expect(screen.getByRole('button', { name: /evaluate/i })).toBeTruthy();
  });

  it('hides the meter and de-bands the button in Exam Mode', () => {
    renderPanel({ userAnswer: SUBSTANTIAL_DRAFT, writingMode: 'exam' as WritingMode });
    // Exam Mode must never hint at scoring: no meter, no readiness label.
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByRole('button', { name: /draft readiness/i })).toBeNull();
    expect(screen.getByRole('button', { name: /evaluate/i })).toBeTruthy();
  });
});
