import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import WorkspaceRightPanel from '../../components/WorkspaceRightPanel';
import { Prompt, PromptVerb, StatePath, WritingMode } from '../../types';

/**
 * The state of the draft as the writing card's right-hand panel shows it.
 *
 * - Evaluate on an empty draft is `aria-disabled`, not `disabled`: it stays in the
 *   focus order, and its reason is what it is described by. It does nothing when
 *   pressed, and so does Ctrl + Enter.
 * - The readiness meter and the Evaluate accent read the answer on screen, not the
 *   debounced copy, for the second after a question switch.
 * - The footer's save claim follows the storage flag handed down from App.
 */

vi.mock('../../services/geminiService', () => ({
  explainOutcomeInContext: vi.fn(),
  generateRubricForPrompt: vi.fn(),
}));

vi.mock('../../services/entitlements', () => ({
  isFeatureLocked: () => false,
  requestUpgrade: vi.fn(),
  freeEvalsRemaining: () => Infinity,
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

type Panel = React.ComponentProps<typeof WorkspaceRightPanel>;

const panelProps = (over: Partial<Panel> = {}): Panel => ({
  isFocusMode: false,
  userAnswer: '',
  setUserAnswer: vi.fn(),
  debouncedUserAnswer: '',
  currentPrompt: prompt(),
  isEvaluating: false,
  evaluationResult: null,
  evaluationError: null,
  onEvaluate: vi.fn(),
  onSaveDraft: vi.fn(),
  isImproving: false,
  improveAnswerError: null,
  evaluatedAnswer: '',
  geminiHandlers,
  syllabusHandlers,
  statePath: {} as StatePath,
  breadcrumbItems: [{ label: 'Biology' }],
  handleRunQualityCheck: vi.fn(),
  onToggleFocusMode: vi.fn(),
  promptFontSize: 18,
  onPromptFontSizeChange: vi.fn(),
  writingMode: 'coach' as WritingMode,
  onWritingModeChange: vi.fn(),
  ...over,
});

const evaluateButton = () => screen.getByRole('button', { name: /^evaluate|^evaluating/i });

describe('Evaluate on an empty draft', () => {
  it('is aria-disabled rather than disabled, so it stays focusable', () => {
    render(<WorkspaceRightPanel {...panelProps({ userAnswer: '' })} />);

    const button = evaluateButton() as HTMLButtonElement;
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.disabled).toBe(false);
  });

  it('is described by the reason it cannot be pressed', () => {
    render(<WorkspaceRightPanel {...panelProps({ userAnswer: '' })} />);

    const describedBy = evaluateButton().getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toBe(
      'Write a response first, then evaluate'
    );
  });

  it('does nothing when pressed', () => {
    const onEvaluate = vi.fn();
    render(<WorkspaceRightPanel {...panelProps({ userAnswer: '', onEvaluate })} />);

    fireEvent.click(evaluateButton());

    expect(onEvaluate).not.toHaveBeenCalled();
  });

  it('does nothing on Ctrl + Enter in the empty writing surface', () => {
    const onEvaluate = vi.fn();
    render(<WorkspaceRightPanel {...panelProps({ userAnswer: '', onEvaluate })} />);

    fireEvent.keyDown(document.querySelector('textarea')!, { key: 'Enter', ctrlKey: true });

    expect(onEvaluate).not.toHaveBeenCalled();
  });

  it('is still a real disabled button while a marking is in flight', () => {
    render(
      <WorkspaceRightPanel {...panelProps({ userAnswer: SUBSTANTIAL_DRAFT, isEvaluating: true })} />
    );

    const button = screen.getByRole('button', { name: /evaluating/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-disabled')).toBeNull();
  });

  it('is an ordinary enabled button for a written draft', () => {
    const onEvaluate = vi.fn();
    render(
      <WorkspaceRightPanel
        {...panelProps({
          userAnswer: SUBSTANTIAL_DRAFT,
          debouncedUserAnswer: SUBSTANTIAL_DRAFT,
          onEvaluate,
        })}
      />
    );

    const button = evaluateButton() as HTMLButtonElement;
    expect(button.getAttribute('aria-disabled')).toBeNull();
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(onEvaluate).toHaveBeenCalledTimes(1);
  });
});

describe('readiness on a question switch', () => {
  it('reads the answer on screen, not the stale debounced one, until the debounce catches up', () => {
    const view = render(
      <WorkspaceRightPanel
        {...panelProps({
          currentPrompt: prompt({ id: 'p1' }),
          userAnswer: SUBSTANTIAL_DRAFT,
          debouncedUserAnswer: SUBSTANTIAL_DRAFT,
        })}
      />
    );
    expect(screen.getByRole('progressbar').getAttribute('aria-label')).not.toMatch(/Start writing/);

    // Question 2 is selected and its answer is empty. The debounced text still holds
    // question 1's words for a second.
    view.rerender(
      <WorkspaceRightPanel
        {...panelProps({
          currentPrompt: prompt({ id: 'p2' }),
          userAnswer: '',
          debouncedUserAnswer: SUBSTANTIAL_DRAFT,
        })}
      />
    );
    expect(screen.getByRole('progressbar').getAttribute('aria-label')).toMatch(/Start writing/);
    expect(screen.queryByRole('button', { name: /draft readiness/i })).toBeNull();

    // The debounce catches up with question 2's empty answer, and it stays neutral.
    view.rerender(
      <WorkspaceRightPanel
        {...panelProps({
          currentPrompt: prompt({ id: 'p2' }),
          userAnswer: '',
          debouncedUserAnswer: '',
        })}
      />
    );
    expect(screen.getByRole('progressbar').getAttribute('aria-label')).toMatch(/Start writing/);
  });

  it('a question switch keeps the readiness of the answer that is there', () => {
    const view = render(
      <WorkspaceRightPanel
        {...panelProps({
          currentPrompt: prompt({ id: 'p1' }),
          userAnswer: SUBSTANTIAL_DRAFT,
          debouncedUserAnswer: SUBSTANTIAL_DRAFT,
        })}
      />
    );

    // Question 2 has its own substantial answer on screen, and the debounce agrees.
    view.rerender(
      <WorkspaceRightPanel
        {...panelProps({
          currentPrompt: prompt({ id: 'p2' }),
          userAnswer: SUBSTANTIAL_DRAFT,
          debouncedUserAnswer: SUBSTANTIAL_DRAFT,
        })}
      />
    );

    expect(screen.getByRole('button', { name: /draft readiness/i })).toBeTruthy();
  });
});

describe('the footer save claim', () => {
  it('says "Not saved" when the storage layer has failed', () => {
    render(
      <WorkspaceRightPanel
        {...panelProps({
          userAnswer: SUBSTANTIAL_DRAFT,
          debouncedUserAnswer: SUBSTANTIAL_DRAFT,
          draftSaved: true,
          draftSaveFailed: true,
        })}
      />
    );

    expect(screen.getByText('Not saved')).toBeTruthy();
    expect(screen.queryByText('Saved')).toBeNull();
  });
});
