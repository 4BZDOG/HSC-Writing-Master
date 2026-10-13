import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { EvaluationResult, Prompt, PromptVerb } from '../../types';

/**
 * What the marking report says in each state a student can be in: below full
 * marks, at full marks, with a rewrite the marker kept edits for, and while a
 * regeneration is running.
 */
vi.mock('../../services/entitlements', () => ({
  isFeatureLocked: () => false,
  isFeedbackLocked: () => false,
  planLabelForFeature: () => 'Plus',
  requestUpgrade: vi.fn(),
}));
vi.mock('../../pdf', () => ({ exportEvaluationPdf: vi.fn() }));

import EvaluationDisplay from '../../components/EvaluationDisplay';
import { BandGoalCard } from '../../components/feedback/FeedbackPieces';

afterEach(cleanup);

const prompt = {
  id: 'p1',
  question: 'Explain the purposes of data visualisation.',
  totalMarks: 4,
  verb: 'EXPLAIN' as PromptVerb,
  keywords: ['purpose'],
  sampleAnswers: [],
} as unknown as Prompt;

const base = (over: Partial<EvaluationResult> = {}): EvaluationResult =>
  ({
    overallMark: 2,
    overallBand: 3,
    overallFeedback: 'Sound, with the second purpose still missing.',
    quickTip: 'Name a second, different purpose.',
    strengths: ['Names one purpose'],
    improvements: ['Add a second purpose'],
    criteria: [{ criterion: 'Purpose', mark: 2, maxMark: 4, feedback: 'One purpose named.' }],
    revisedAnswer: {
      text: 'Data visualisation helps people find patterns and tell a story.',
      mark: 3,
      band: 4,
      keyChanges: ['Named a second purpose'],
    },
    ...over,
  }) as unknown as EvaluationResult;

const renderReport = (
  result: EvaluationResult,
  extra: Partial<React.ComponentProps<typeof EvaluationDisplay>> = {}
) =>
  render(
    <EvaluationDisplay
      result={result}
      prompt={prompt}
      userAnswer="Data visualisation helps people see patterns."
      onImproveAnswer={vi.fn()}
      onCompareImprovement={vi.fn()}
      isImproving={false}
      improveAnswerError={null}
      {...extra}
    />
  );

describe('the goal card', () => {
  it('says the band reached and the marks to full, and does not say Achieved below full marks', () => {
    render(<BandGoalCard currentBand={1} maxBand={1} marksToFull={1} />);

    expect(screen.getByText(/Band 1 reached/)).toBeTruthy();
    expect(screen.getByText(/1 mark to full/)).toBeTruthy();
    expect(screen.queryByText(/Achieved/)).toBeNull();
  });

  it('says Achieved only at full marks', () => {
    render(<BandGoalCard currentBand={6} maxBand={6} marksToFull={0} />);

    expect(screen.getByText('Achieved')).toBeTruthy();
    expect(screen.queryByText(/to full/)).toBeNull();
  });
});

describe('the report below full marks', () => {
  it('puts the next step in the report, with the tip as its words', () => {
    renderReport(base());

    expect(screen.getByText('Your next step')).toBeTruthy();
    expect(screen.getByText(/Name a second, different/)).toBeTruthy();
  });

  it('offers the rewrite its controls, and says the mark once, in the placard', () => {
    renderReport(base());

    expect(screen.getByText('Improved response')).toBeTruthy();
    expect(screen.getByText('Regenerate')).toBeTruthy();
    expect(screen.getByText('See the edits')).toBeTruthy();
    // The improved header says "one mark higher" in words, not as 3/4 again.
    expect(screen.getByText(/one mark higher/)).toBeTruthy();
    expect(screen.queryByText(/3\/4/)).toBeNull();
  });

  it('lists the edits the marker made beneath the rewrite', () => {
    renderReport(base());

    expect(screen.getByText('What changed')).toBeTruthy();
    // The keyword "purpose" is wrapped in its own span, so the match is on the sentence's start.
    expect(screen.getByText(/Named a second/)).toBeTruthy();
  });

  it('draws the placard on the flat band, in its ink, with no white text on it', () => {
    const { container } = renderReport(base());

    const placard = container.querySelector('[data-report="placard"] > div') as HTMLElement;
    // The ground is the band's own colour, read from the --band-rgb the placard sets.
    expect(placard.className).toContain('--band-rgb');
    expect(placard.className).toContain('text-slate-950');
    expect(placard.innerHTML).not.toMatch(/\btext-white\b/);
  });

  it('keeps the regeneration veil inside the rewrite card, not over the report', () => {
    const { container } = renderReport(base(), { isImproving: true });

    const veil = container.querySelector('.cursor-wait') as HTMLElement;
    expect(veil).not.toBeNull();
    // The card is the bordered box the veil sits in, and it stops at that card's edge.
    const card = veil.parentElement as HTMLElement;
    expect(card.className).toContain('overflow-hidden');
    expect(card.className).toContain('rounded-panel');
    expect(card.contains(veil)).toBe(true);
  });
});

describe('the report at full marks', () => {
  const full = base({ overallMark: 4, overallBand: 6 });

  it('says already full marks and offers no regeneration or improve nudge', () => {
    renderReport(full);

    expect(screen.getAllByText(/Already full marks/).length).toBeGreaterThan(0);
    expect(screen.queryByText('Regenerate')).toBeNull();
    expect(screen.queryByText(/one mark higher/)).toBeNull();
  });

  it('names the rewrite the marker’s version, and offers the comparison only', () => {
    renderReport(full);

    expect(screen.getByText("Marker's version")).toBeTruthy();
    expect(screen.getByText('See the edits')).toBeTruthy();
    // "Use this version" is the modal footer's action, and at full marks there is none.
    expect(screen.queryByText('Use this version')).toBeNull();
  });

  it('draws the goal as achieved, and nothing below it is left to achieve', () => {
    renderReport(full);

    expect(screen.getByText('Achieved')).toBeTruthy();
  });

  it('shows no rewrite section at all when there is no rewrite to compare', () => {
    renderReport(base({ overallMark: 4, overallBand: 6, revisedAnswer: '' }));

    expect(screen.queryByText("Marker's version")).toBeNull();
    expect(screen.queryByText('Improved response')).toBeNull();
  });

  it('still offers the comparison when the marker has a version to show', () => {
    const onCompare = vi.fn();
    renderReport(full, { onCompareImprovement: onCompare });

    fireEvent.click(screen.getByText('See the edits'));
    expect(onCompare).toHaveBeenCalledTimes(1);
  });
});
