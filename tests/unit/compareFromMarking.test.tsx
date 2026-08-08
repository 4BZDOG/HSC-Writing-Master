import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import EvaluationDisplay from '../../components/EvaluationDisplay';
import type { EvaluationResult, Prompt, PromptVerb } from '../../types';

/**
 * Two paths produce a rewrite: pressing "Improve my answer", and ordinary
 * marking — `evaluateAnswer` is briefed to return the student's answer lifted
 * one mark. Only the first could open the comparison, which left the diff
 * missing from the path almost every student actually takes.
 */
vi.mock('../../services/entitlements', () => ({
  isFeatureLocked: () => false,
  isFeedbackLocked: () => false,
  requestUpgrade: vi.fn(),
}));

vi.mock('../../pdf', () => ({ exportEvaluationPdf: vi.fn() }));

afterEach(cleanup);

const prompt: Prompt = {
  id: 'p1',
  question: 'Analyse the impact of caching.',
  totalMarks: 8,
  verb: 'Analyse' as PromptVerb,
  keywords: [],
  sampleAnswers: [],
} as unknown as Prompt;

const result = (over: Partial<EvaluationResult> = {}): EvaluationResult => ({
  overallMark: 4,
  overallBand: 3,
  overallFeedback: 'Sound.',
  quickTip: 'Link cause and effect.',
  strengths: ['Defines caching'],
  improvements: ['Explain the effect on latency'],
  criteria: [],
  revisedAnswer: 'Caching keeps frequently requested data in memory, reducing latency.',
  ...over,
});

const renderDisplay = (
  over: Partial<React.ComponentProps<typeof EvaluationDisplay>> = {},
  evaluation = result()
) => {
  const onCompareImprovement = vi.fn();
  render(
    <EvaluationDisplay
      result={evaluation}
      prompt={prompt}
      userAnswer="Caching keeps data in memory."
      onUseRevisedAnswer={vi.fn()}
      onImproveAnswer={vi.fn()}
      onCompareImprovement={onCompareImprovement}
      isImproving={false}
      improveAnswerError={null}
      {...over}
    />
  );
  return { onCompareImprovement };
};

describe('comparing the marking rewrite', () => {
  it('offers the comparison for a rewrite that came from marking', () => {
    const { onCompareImprovement } = renderDisplay();

    fireEvent.click(screen.getByText('Compare with mine'));

    expect(onCompareImprovement).toHaveBeenCalled();
  });

  it('hides the comparison when there is no rewrite to compare', () => {
    renderDisplay({}, result({ revisedAnswer: '' }));

    expect(screen.queryByText('Compare with mine')).toBeNull();
  });

  it('hides it when the caller supplies no handler', () => {
    renderDisplay({ onCompareImprovement: undefined });

    expect(screen.queryByText('Compare with mine')).toBeNull();
    // The rest of the section is still there — only the control goes.
    expect(screen.getByText('Use This Answer')).toBeTruthy();
  });
});
