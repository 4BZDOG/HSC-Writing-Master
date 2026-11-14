import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { marksLabel } from '../../utils/marksLabel';
import type { EvaluationResult, Prompt, PromptVerb } from '../../types';

describe('marksLabel', () => {
  it('pluralises by count, in lower case', () => {
    expect(marksLabel(0)).toBe('0 marks');
    expect(marksLabel(1)).toBe('1 mark');
    expect(marksLabel(4)).toBe('4 marks');
  });
});

vi.mock('../../services/entitlements', () => ({
  isFeatureLocked: () => false,
  isFeedbackLocked: () => false,
  planLabelForFeature: () => 'Plus',
  lowestPlanForFeature: () => 'plus',
  PLAN_SHORT_LABELS: { free: 'Free', plus: 'Plus', school: 'School' },
  requestUpgrade: vi.fn(),
  describeAccess: () => ({
    state: 'locked',
    cta: 'upgrade',
    ctaLabel: 'Upgrade',
    explanation: 'Plus includes it.',
  }),
}));
vi.mock('../../pdf', () => ({ exportEvaluationPdf: vi.fn() }));

import EvaluationResultModal from '../../components/EvaluationResultModal';
import EvaluationDisplay from '../../components/EvaluationDisplay';

afterEach(() => {
  cleanup();
});

const prompt = {
  id: 'p1',
  question: 'State one purpose of a label.',
  totalMarks: 1,
  verb: 'IDENTIFY' as PromptVerb,
  keywords: [],
  sampleAnswers: [],
} as unknown as Prompt;

const result = {
  overallMark: 1,
  overallBand: 6,
  overallFeedback: 'Correct.',
  quickTip: 'Well done.',
  strengths: [],
  improvements: [],
  criteria: [],
  revisedAnswer: { text: '<p>A label names the thing.</p>', mark: 1, band: 6, keyChanges: [] },
} as unknown as EvaluationResult;

describe('the marks chip on the marking report says "1 mark"', () => {
  it('EvaluationResultModal', () => {
    render(
      <EvaluationResultModal
        isOpen
        result={result}
        prompt={prompt}
        userAnswer="A label names the thing."
        onClose={vi.fn()}
        onUseRevisedAnswer={vi.fn()}
        onImproveAnswer={vi.fn()}
        isImproving={false}
        improveAnswerError={null}
        onSaveToSamples={vi.fn()}
        onFeedbackSubmit={vi.fn()}
      />
    );

    // The modal renders the report, so the chip is one of several "1 mark" texts.
    expect(screen.getAllByText('1 mark').length).toBeGreaterThan(0);
    expect(screen.queryByText('1 Marks')).toBeNull();
    expect(screen.queryByText('1 marks')).toBeNull();
  });

  it('EvaluationDisplay', () => {
    render(
      <EvaluationDisplay
        result={result}
        prompt={prompt}
        onImproveAnswer={vi.fn()}
        isImproving={false}
        improveAnswerError={null}
        userAnswer="A label names the thing."
      />
    );

    expect(screen.getAllByText('1 mark').length).toBeGreaterThan(0);
    expect(screen.queryByText('1 Marks')).toBeNull();
  });
});
