import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ImprovementReviewModal from '../../components/ImprovementReviewModal';
import type { Prompt, PromptVerb } from '../../types';

/**
 * Marking returns the student's own answer lifted one mark, and the diff is the
 * one screen that names what the extra mark was for. Behind a "Compare with
 * mine" button on the feedback summary most students never opened it, so the
 * comparison now comes FIRST and the summary waits behind it.
 *
 * The mechanics live in two places, and both are covered here:
 *  - the modal grows a labelled way forward (`continueLabel`) so its exit reads
 *    as "continue", not "dismiss";
 *  - closing it is what reveals the feedback, so close must be the ONLY thing
 *    the button does — nothing may discard the result on the way through.
 */
afterEach(cleanup);

const prompt: Prompt = {
  id: 'p1',
  question: 'Analyse the impact of caching.',
  totalMarks: 8,
  verb: 'Analyse' as PromptVerb,
  keywords: ['latency'],
  sampleAnswers: [],
} as unknown as Prompt;

const renderReview = (over: Partial<React.ComponentProps<typeof ImprovementReviewModal>> = {}) => {
  const onClose = vi.fn();
  const onApply = vi.fn();
  render(
    <ImprovementReviewModal
      isOpen
      onClose={onClose}
      improvedAnswer="Caching keeps frequently requested data in memory, cutting latency."
      originalAnswer="Caching keeps data in memory."
      originalPrompt={prompt}
      targetBand={4}
      targetMark={5}
      originalMark={4}
      onApply={onApply}
      {...over}
    />
  );
  return { onClose, onApply };
};

describe('the comparison shown before the feedback summary', () => {
  it('offers a labelled way forward instead of only an X', () => {
    renderReview({ continueLabel: 'See my full feedback' });

    expect(screen.getByText('See my full feedback')).toBeTruthy();
  });

  it('continues by closing, which is what reveals the feedback behind it', () => {
    const { onClose, onApply } = renderReview({ continueLabel: 'See my full feedback' });

    fireEvent.click(screen.getByText('See my full feedback'));

    expect(onClose).toHaveBeenCalledTimes(1);
    // Carrying on must not quietly overwrite what the student wrote.
    expect(onApply).not.toHaveBeenCalled();
  });

  it('says what is coming next rather than where the samples were filed', () => {
    renderReview({ continueLabel: 'See my full feedback' });

    expect(screen.getByText(/come next/)).toBeTruthy();
    expect(screen.queryByText(/saved to this question/)).toBeNull();
  });

  it('still lets the student take the rewrite before moving on', () => {
    const { onApply, onClose } = renderReview({ continueLabel: 'See my full feedback' });

    fireEvent.click(screen.getByText('Use this version'));

    expect(onApply).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the old footer when opened FROM the feedback summary', () => {
    // No continueLabel: this is a detour off the summary, so "Use this version"
    // is the primary action and there is nothing to continue to.
    renderReview();

    expect(screen.queryByText('See my full feedback')).toBeNull();
    expect(screen.getByText(/saved to this question/)).toBeTruthy();
    expect(screen.getByText('Use this version')).toBeTruthy();
  });
});
