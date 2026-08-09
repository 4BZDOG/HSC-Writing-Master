import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import type { EvaluationResult, Prompt, PromptVerb } from '../../types';
import { LOCKED_FEEDBACK_PLACEHOLDER } from '../../api/_lib/entitlements';

/**
 * Everything the server REDACTS must be presented as locked by the client.
 *
 * `redactPaidFeedback` (api/_lib/entitlements.ts) strips three things out of a
 * free-tier marking result before it leaves the server: the per-criterion
 * prose, the improvement path, and the rewritten answer. Each is replaced with
 * `LOCKED_FEEDBACK_PLACEHOLDER` rather than deleted, because the client's Zod
 * schema requires the fields to exist.
 *
 * That makes the pairing load-bearing. The Criteria Breakdown had the lock
 * treatment; "Areas for Growth" did not, so a free student read
 * "Upgrade to see this feedback." as the marker's actual advice, in a panel
 * with no lock chip, no overlay and nothing to click. The placeholder is only
 * honest when something next to it says why it is there.
 */

vi.mock('../../services/entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/entitlements')>();
  return {
    ...actual,
    isFeedbackLocked: vi.fn(() => true),
    isFeatureLocked: vi.fn(() => true),
  };
});

vi.mock('../../pdf/exportEvaluation', () => ({ exportEvaluationPdf: vi.fn() }));

import EvaluationDisplay from '../../components/EvaluationDisplay';

const prompt = {
  id: 'p1',
  question: 'Describe X.',
  totalMarks: 4,
  verb: 'DESCRIBE' as PromptVerb,
  sampleAnswers: [],
  keywords: [],
  scenario: '',
  linkedOutcomes: [],
  markingCriteria: '',
  isPastHSC: false,
} as unknown as Prompt;

/** A marking result exactly as the proxy sends it to a free-tier caller. */
const redactedResult: EvaluationResult = {
  overallMark: 3,
  overallBand: 2,
  overallFeedback: 'A sound response that stays descriptive.',
  quickTip: 'Name the mechanism.',
  strengths: ['Correctly identifies the two components'],
  improvements: [LOCKED_FEEDBACK_PLACEHOLDER],
  criteria: [
    { criterion: 'Knowledge', mark: 3, maxMark: 4, feedback: LOCKED_FEEDBACK_PLACEHOLDER },
  ] as EvaluationResult['criteria'],
  revisedAnswer: '',
};

const renderDisplay = () =>
  render(
    <EvaluationDisplay
      result={redactedResult}
      prompt={prompt}
      onUseRevisedAnswer={vi.fn()}
      onImproveAnswer={vi.fn()}
      isImproving={false}
      improveAnswerError={null}
    />
  );

afterEach(cleanup);

describe('redacted free-tier feedback is presented as locked', () => {
  /**
   * One ContentLockOverlay renders one "Unlock with Plus" button, so counting
   * them counts the panels that actually carry the lock. Both redacted panels
   * are on screen here, so both overlays must be.
   */
  it('draws an unlock affordance for each redacted panel, not just one', () => {
    renderDisplay();

    expect(screen.getAllByRole('button', { name: /unlock with plus/i })).toHaveLength(2);
  });

  it('locks the improvement path, not only the criteria breakdown', () => {
    renderDisplay();

    // Anchored to the <section>, not to "the nearest div". The heading now
    // lives inside its own row element, so a `closest('div')` walk stops at the
    // heading and finds neither the redacted list nor the overlay over it —
    // which says nothing about whether the panel is locked.
    const growth = screen.getByText(/Areas for Growth/i).closest('section');
    expect(growth, 'the Areas for Growth panel should be findable').not.toBeNull();

    // The placeholder is inside it…
    expect(growth?.textContent).toContain(LOCKED_FEEDBACK_PLACEHOLDER);
    // …and so is the reason it is there, with something to click.
    expect(growth?.textContent).toMatch(/Plus/i);
    expect(growth?.querySelector('button')).not.toBeNull();
  });

  it('leaves the free tier its promised summary untouched', () => {
    renderDisplay();

    // Marks, band, verdict and strengths are never redacted — the summary the
    // free plan is sold on, and every stat built on it, must keep working.
    expect(screen.getByText(/A sound response that stays descriptive/)).toBeTruthy();
    expect(screen.getByText(/Correctly identifies the two components/)).toBeTruthy();
  });
});
