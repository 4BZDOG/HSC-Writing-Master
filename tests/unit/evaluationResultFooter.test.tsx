import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { EvaluationResult, Prompt, PromptVerb } from '../../types';

/**
 * The feedback's way out. "Use this version" takes the rewrite into the draft and
 * closes the feedback, so the student is back at their own response. It used to
 * replace the draft and leave the report open under a toast.
 */
const lock = vi.hoisted(() => ({ answerUpgrades: false }));

vi.mock('../../services/entitlements', () => ({
  isFeatureLocked: (feature: string) =>
    feature === 'answerUpgrades' ? lock.answerUpgrades : false,
  isFeedbackLocked: () => false,
  planLabelForFeature: () => 'Plus',
  // The lock chip now names its feature, so it asks which plan unlocks it.
  lowestPlanForFeature: () => 'plus',
  requestUpgrade: vi.fn(),
}));
vi.mock('../../pdf', () => ({ exportEvaluationPdf: vi.fn() }));

import EvaluationResultModal from '../../components/EvaluationResultModal';

afterEach(() => {
  cleanup();
  lock.answerUpgrades = false;
});

const prompt = {
  id: 'p1',
  question: 'Explain the purposes of data visualisation.',
  totalMarks: 4,
  verb: 'EXPLAIN' as PromptVerb,
  keywords: [],
  sampleAnswers: [],
} as unknown as Prompt;

const base = (over: Partial<EvaluationResult> = {}): EvaluationResult =>
  ({
    overallMark: 2,
    overallBand: 3,
    overallFeedback: 'Sound.',
    quickTip: 'Name a second purpose.',
    strengths: [],
    improvements: [],
    criteria: [],
    revisedAnswer: {
      text: '<p>Data visualisation helps people find patterns.</p>',
      mark: 3,
      band: 4,
      keyChanges: [],
    },
    ...over,
  }) as unknown as EvaluationResult;

const renderModal = (
  result: EvaluationResult,
  over: Partial<React.ComponentProps<typeof EvaluationResultModal>> = {}
) => {
  const handlers = {
    onClose: vi.fn(),
    onUseRevisedAnswer: vi.fn(),
  };
  render(
    <EvaluationResultModal
      isOpen
      result={result}
      prompt={prompt}
      userAnswer="Data visualisation helps people see patterns."
      onImproveAnswer={vi.fn()}
      onCompareImprovement={vi.fn()}
      isImproving={false}
      improveAnswerError={null}
      onSaveToSamples={vi.fn()}
      onFeedbackSubmit={vi.fn()}
      {...handlers}
      {...over}
    />
  );
  return handlers;
};

describe('the feedback footer', () => {
  it('"Use this version" puts the rewrite in the draft and closes the feedback', () => {
    const { onClose, onUseRevisedAnswer } = renderModal(base());

    fireEvent.click(screen.getByRole('button', { name: /Use this version/ }));

    // The rewrite is the words of the answer, not the markup it arrived in.
    expect(onUseRevisedAnswer).toHaveBeenCalledWith(
      'Data visualisation helps people find patterns.'
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    // The draft is replaced before the report goes, so the student lands on the new text.
    expect(onUseRevisedAnswer.mock.invocationCallOrder[0]).toBeLessThan(
      onClose.mock.invocationCallOrder[0]
    );
  });

  it('"Back to my response" leaves the draft as it was', () => {
    const { onClose, onUseRevisedAnswer } = renderModal(base());

    fireEvent.click(screen.getByRole('button', { name: 'Back to my response' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onUseRevisedAnswer).not.toHaveBeenCalled();
  });

  it('is the primary action only when there is a rewrite to use', () => {
    renderModal(base({ revisedAnswer: '' }));

    expect(screen.queryByRole('button', { name: /Use this version/ })).toBeNull();
    // Without a rewrite, going back is the one thing to do, so it is the primary action.
    // The primary action is the band's flat ground, in its ink.
    const back = screen.getByRole('button', { name: 'Back to my response' });
    expect(back.className).toContain('--band-rgb');
    expect(back.className).toContain('text-slate-950');
  });

  it('offers no "Use this version" at full marks, where there is nothing to improve', () => {
    renderModal(base({ overallMark: 4, overallBand: 6 }));

    expect(screen.queryByRole('button', { name: /Use this version/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Back to my response' })).toBeTruthy();
  });

  it('offers no "Use this version" when the plan withholds the rewrite', () => {
    lock.answerUpgrades = true;
    const { onUseRevisedAnswer } = renderModal(base());

    expect(screen.queryByRole('button', { name: /Use this version/ })).toBeNull();
    expect(onUseRevisedAnswer).not.toHaveBeenCalled();
  });

  it('holds both actions while a regeneration is running, so the text cannot change under them', () => {
    renderModal(base(), { isImproving: true });

    expect(
      (screen.getByRole('button', { name: /Use this version/ }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Back to my response' }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  describe('the footer on a phone', () => {
    // The footer was a wrapping row, so the caption took a band of its own and
    // the two buttons stacked beneath it: about a sixth of a phone screen.
    it('keeps both actions on one row that does not wrap', () => {
      renderModal(base());

      const back = screen.getByRole('button', { name: 'Back to my response' });
      const use = screen.getByRole('button', { name: /Use this version/ });
      const row = back.parentElement as HTMLElement;

      expect(back.parentElement).toBe(use.parentElement);
      expect(row.className).toContain('flex-nowrap');
      expect(row.className).not.toContain('flex-wrap');
      // Both share the row's width, and can shrink to it.
      for (const button of [back, use]) {
        expect(button.className).toContain('flex-1');
        expect(button.className).toContain('min-w-0');
      }
    });

    it('names what "Use this version" does through the button, not a separate line', () => {
      renderModal(base());

      const use = screen.getByRole('button', { name: /Use this version/ });
      const describedBy = use.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      expect(document.getElementById(describedBy!)?.textContent).toBe('Replaces your draft.');
      // The button's own name stays the action, with the note as its description.
      expect(use.textContent).toContain('Replaces your draft.');
      expect(use.getAttribute('aria-label')).toBeNull();
    });

    it('shows the note as a line of its own only at the width where the footer has room', () => {
      renderModal(base());

      const note = document.getElementById(
        screen.getByRole('button', { name: /Use this version/ }).getAttribute('aria-describedby')!
      )!;
      expect(note.className).toContain('hidden');
      expect(note.className).toContain('sm:block');
    });

    it('has no note, and no description to point at, when there is no rewrite', () => {
      renderModal(base({ revisedAnswer: '' }));

      expect(screen.queryByText('Replaces your draft.')).toBeNull();
      expect(screen.getByRole('button', { name: 'Back to my response' })).toBeTruthy();
    });
  });
});
