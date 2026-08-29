import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import type { EvaluationResult, Prompt, PromptVerb } from '../../types';

/**
 * The evaluation view must EXPLAIN the Verb-Gate band ceiling, not just show it.
 *
 * `getBandForMark` clamps the achievable band to the verb's cognitive tier — an
 * "Explain" (tier 3) question can never exceed Band 3, however flawless the
 * response. `EvaluationDisplay` renders a "Band N Goal" reflecting that ceiling
 * but, before this, never said WHY it was capped, so the number could read as a
 * harsh marker rather than the verb's own limit.
 *
 * The explainer is shown only when the cap actually binds (below Band 6): a
 * tier-6 verb (Evaluate…) leaves the full range open and needs no caveat.
 */

// EvaluationDisplay pulls in the PDF exporter transitively; stub it so the
// component renders in isolation without the real generation stack. The marking
// service (services/geminiService) is never called from this component, so
// there is no live AI path to reach in this test.
vi.mock('../../pdf/exportEvaluation', () => ({ exportEvaluationPdf: vi.fn() }));
vi.mock('../../services/geminiService', () => ({}));

import EvaluationDisplay from '../../components/EvaluationDisplay';

const buildPrompt = (verb: PromptVerb, totalMarks: number): Prompt =>
  ({
    id: 'p1',
    question: `${verb} the thing.`,
    totalMarks,
    verb,
    sampleAnswers: [],
    keywords: [],
    scenario: '',
    linkedOutcomes: [],
    markingCriteria: '',
    isPastHSC: false,
  }) as unknown as Prompt;

const result: EvaluationResult = {
  overallMark: 2,
  overallBand: 2,
  overallFeedback: 'A sound response.',
  quickTip: 'Push the reasoning further.',
  strengths: ['Clear opening'],
  improvements: ['Add a linking sentence'],
  criteria: [
    { criterion: 'Reasoning', mark: 2, maxMark: 6, feedback: 'Developing.' },
  ] as EvaluationResult['criteria'],
  revisedAnswer: '',
};

const renderDisplay = (verb: PromptVerb, totalMarks: number) =>
  render(
    <EvaluationDisplay
      result={result}
      prompt={buildPrompt(verb, totalMarks)}
      onUseRevisedAnswer={vi.fn()}
      onImproveAnswer={vi.fn()}
      isImproving={false}
      improveAnswerError={null}
    />
  );

afterEach(cleanup);

describe('Verb-Gate band cap explainer', () => {
  it('explains the binding ceiling for a low-tier verb, naming the right band', () => {
    // EXPLAIN is tier 3 → the ceiling is Band 3 at full marks.
    renderDisplay('EXPLAIN' as PromptVerb, 6);

    const note = screen.getByText(/even a flawless response tops out here/i);
    expect(note.textContent).toMatch(/Tier 3/);
    expect(note.textContent).toMatch(/Band 3/);
    // The verb the cap comes from is named in the text, not conveyed by colour.
    expect(note.textContent).toMatch(/EXPLAIN/);
  });

  it('caps an IDENTIFY (tier 1) question at Band 1', () => {
    renderDisplay('IDENTIFY' as PromptVerb, 2);

    const note = screen.getByText(/even a flawless response tops out here/i);
    expect(note.textContent).toMatch(/Tier 1/);
    expect(note.textContent).toMatch(/Band 1/);
  });

  it('shows no explainer for a tier-6 verb, where the cap does not bind', () => {
    // EVALUATE is tier 6 → the full range is open, so there is nothing to caveat.
    renderDisplay('EVALUATE' as PromptVerb, 8);

    expect(screen.queryByText(/even a flawless response tops out here/i)).toBeNull();
  });
});
