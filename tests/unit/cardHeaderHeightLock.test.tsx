import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { Prompt, PromptVerb } from '../../types';
import {
  CARD_HEADER_META_ROW,
  CARD_HEADER_TITLE,
} from '../../utils/cardChrome';

/**
 * The workspace's two card headers — "Writing Prompt" and "Written Response" —
 * are a matched pair, and they are height-COUPLED: each measures its own chrome
 * through `useChromeHeightReporter` and the taller one sets `minHeaderHeight`
 * for the other. So anything that grows one header grows both cards.
 *
 * `cardChrome` already defends the shrinking direction with `min-h-7` / `min-h-6`
 * floors. It could not defend the growing direction, because a chip whose TEXT
 * wraps takes a second line inside a floor that only sets a minimum — and the
 * question card's chip carries the command verb, which runs from five
 * characters to thirteen (DIFFERENTIATE). A long verb wrapped, the meta row
 * grew, and both cards resized on nothing but the choice of question.
 *
 * Chips wrapping onto a second ROW is deliberate (`flex-wrap`, for narrow
 * viewports). A single chip wrapping inside itself never is.
 */

vi.mock('../../services/entitlements', () => ({
  isFeatureLocked: () => false,
  isQuestionTierLocked: () => false,
  requestUpgrade: vi.fn(),
}));
vi.mock('../../services/geminiService', () => ({
  explainOutcomeInContext: vi.fn(),
}));

import PromptDisplay from '../../components/PromptDisplay';
import Editor from '../../components/Editor';

afterEach(cleanup);

const prompt = (verb: string): Prompt =>
  ({
    id: 'p1',
    question: 'Explain the roles of mRNA and tRNA in polypeptide synthesis.',
    verb: verb as PromptVerb,
    totalMarks: 6,
    keywords: [],
    linkedOutcomes: [],
    sampleAnswers: [],
    markingCriteria: '',
    scenario: '',
  }) as unknown as Prompt;

const renderPrompt = (verb: string) =>
  render(
    <PromptDisplay
      prompt={prompt(verb)}
      isEnriching={false}
      enrichError={null}
      onVerbClick={vi.fn()}
      onGenerateScenario={vi.fn()}
      onUpdatePrompt={vi.fn()}
      isGeneratingScenario={false}
      generateScenarioError={null}
      courseOutcomes={[]}
      onOutcomeClick={vi.fn()}
      userRole="student"
      onDismissEnrichError={vi.fn()}
      onRunQualityCheck={vi.fn()}
      onSuggestOutcomes={vi.fn()}
      isSuggestingOutcomes={false}
      fontSize={18}
      onFontSizeChange={vi.fn()}
    />
  );

describe('card header height lock', () => {
  it('keeps the command verb chip on one line, however long the verb', () => {
    renderPrompt('DIFFERENTIATE');

    const chip = screen.getByRole('button', { name: /command verb guide for DIFFERENTIATE/i });
    expect(chip.className).toContain('whitespace-nowrap');
  });

  it('keeps the writing card’s band chip on one line too', () => {
    render(<Editor value="" onChange={vi.fn()} verb={'EXPLAIN' as PromptVerb} maxBand={6} />);

    const chip = screen.getByText(/^Band \d$/);
    expect(chip.className).toContain('whitespace-nowrap');
  });

  it('still allows the chips to wrap onto a second row on a narrow viewport', () => {
    // The floor guards shrinking; `flex-wrap` is the intended responsive
    // behaviour and must survive the no-wrap fix, which applies to chip TEXT.
    expect(CARD_HEADER_META_ROW).toContain('flex-wrap');
    expect(CARD_HEADER_META_ROW).toContain('min-h-6');
    expect(CARD_HEADER_TITLE).toContain('min-h-7');
  });
});
