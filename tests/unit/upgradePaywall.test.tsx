import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { EvaluationResult, Prompt, PromptVerb } from '../../types';

/**
 * The rewritten answer, the diff review built on it, and the PDF's change list
 * are ONE feature: `answerUpgrades`. The server withholds the text from a plan
 * that does not include it, so this pins the client half — the part that
 * decides what an exported file carries, and what a stale session can still
 * open after a downgrade.
 */
const isFeatureLocked = vi.fn();

vi.mock('../../services/entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/entitlements')>();
  return {
    ...actual,
    isFeedbackLocked: vi.fn(() => false),
    isFeatureLocked: (feature: string) => isFeatureLocked(feature),
    requestUpgrade: vi.fn(),
  };
});

const exportEvaluationPdf = vi.fn();
vi.mock('../../pdf', () => ({ exportEvaluationPdf: (opts: unknown) => exportEvaluationPdf(opts) }));

import EvaluationDisplay from '../../components/EvaluationDisplay';

afterEach(cleanup);

const prompt = {
  id: 'p1',
  question: 'Analyse the impact of caching.',
  totalMarks: 8,
  verb: 'ANALYSE' as PromptVerb,
  keywords: [],
  sampleAnswers: [],
} as unknown as Prompt;

const result: EvaluationResult = {
  overallMark: 5,
  overallBand: 4,
  overallFeedback: 'Sound.',
  strengths: [],
  improvements: [],
  criteria: [],
  revisedAnswer: 'Caching stores frequently requested data, reducing latency.',
};

const renderDisplay = () =>
  render(
    <EvaluationDisplay
      result={result}
      prompt={prompt}
      userAnswer="Caching stores data."
      onUseRevisedAnswer={vi.fn()}
      onImproveAnswer={vi.fn()}
      onCompareImprovement={vi.fn()}
      isImproving={false}
      improveAnswerError={null}
    />
  );

describe('the answer upgrade is paywalled end to end', () => {
  beforeEach(() => {
    isFeatureLocked.mockReset();
    exportEvaluationPdf.mockReset();
    exportEvaluationPdf.mockResolvedValue({ pages: 1, copies: 1 });
  });

  it('keeps the rewrite and its change list out of the exported PDF when locked', async () => {
    // A client whose plan does not cover upgrades but which still holds a
    // rewrite — a stale cached result, or a deployment mid-downgrade.
    isFeatureLocked.mockImplementation((f: string) => f === 'answerUpgrades');
    renderDisplay();

    fireEvent.click(screen.getByText(/Export PDF|Download/i));

    await waitFor(() => expect(exportEvaluationPdf).toHaveBeenCalled());
    const { data } = exportEvaluationPdf.mock.calls[0][0];
    // No rewrite means buildEvaluationBlocks emits neither the improved
    // response nor the change list built from it. An exported file outlives
    // the session, so this is not a check to leave to the server alone.
    expect(data.revisedAnswer).toBeUndefined();
    // The student's own answer still travels with their feedback.
    expect(data.studentAnswer).toBe('Caching stores data.');
  });

  it('exports the rewrite when the plan covers it', async () => {
    isFeatureLocked.mockReturnValue(false);
    renderDisplay();

    fireEvent.click(screen.getByText(/Export PDF|Download/i));

    await waitFor(() => expect(exportEvaluationPdf).toHaveBeenCalled());
    const { data } = exportEvaluationPdf.mock.calls[0][0];
    expect(data.revisedAnswer).toBe(result.revisedAnswer);
  });

  it('hides the comparison but keeps a way to buy the feature', () => {
    isFeatureLocked.mockImplementation((f: string) => f === 'answerUpgrades');
    renderDisplay();

    // The exemplar text is a paid asset — it is not rendered while locked…
    expect(screen.queryByText(/reducing latency/)).toBeNull();
    expect(screen.queryByText('Compare with mine')).toBeNull();
    expect(screen.queryByText('Use This Answer')).toBeNull();
    // …but the section itself stays, so the upgrade is reachable.
    expect(screen.getByText('Improved Response')).toBeTruthy();
    expect(screen.getByText('See what Plus unlocks')).toBeTruthy();
  });
});
