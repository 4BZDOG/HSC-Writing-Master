import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { Prompt } from '../../types';

/**
 * The AI Content Studio has to be locked EVERYWHERE or nowhere.
 *
 * It used to be neither. Four calls out of a dozen carried the plan gate, and
 * the UI matched: an author looking at one question saw "Generate question"
 * behind an amber lock chip and "AI Draft" (the marking guide), "Suggest with
 * AI" (keywords) and "Generate Context" (the scenario) sitting open beside it.
 * Same feature, same plan, three different answers on one screen — and the
 * three open ones had no server gate behind them at all.
 *
 * These tests pin the surfaces that were missed, because a half-locked paywall
 * is worse than either alternative: it tells the user the product is confused
 * about what they bought.
 */

let locked = true;

vi.mock('../../services/entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/entitlements')>();
  return {
    ...actual,
    isFeatureLocked: () => locked,
    requestUpgrade: (...args: unknown[]) => requestUpgradeMock(...args),
  };
});

const requestUpgradeMock = vi.fn();
const generateRubricMock = vi.fn();

vi.mock('../../services/geminiService', () => ({
  generateRubricForPrompt: (...args: unknown[]) => generateRubricMock(...args),
}));

import MarkingCriteriaAccordion from '../../components/MarkingCriteriaAccordion';
import KeywordEditor from '../../components/KeywordEditor';
import { PlusLockChip } from '../../components/UpgradeModal';

const prompt: Prompt = {
  id: 'p1',
  question: 'Analyse the impact of automation on employment.',
  verb: 'Analyse',
  totalMarks: 8,
  scenario: '',
  markingCriteria: '8 marks: A sustained analysis.',
  keywords: ['automation'],
  linkedOutcomes: [],
  sampleAnswers: [],
} as unknown as Prompt;

beforeEach(() => {
  locked = true;
  requestUpgradeMock.mockReset();
  generateRubricMock.mockReset();
});
afterEach(cleanup);

describe('marking-guide drafting carries the studio lock', () => {
  const renderAccordion = () =>
    render(
      <MarkingCriteriaAccordion
        prompt={prompt}
        markingCriteria={prompt.markingCriteria}
        onCriteriaChange={vi.fn()}
        userRole="teacher"
      />
    );

  it('sells the plan instead of spending the AI call when locked', () => {
    renderAccordion();
    fireEvent.click(screen.getByText(/AI Draft/i).closest('button')!);

    expect(requestUpgradeMock).toHaveBeenCalledWith('aiContentStudio');
    expect(generateRubricMock).not.toHaveBeenCalled();
  });

  it('does the work once the plan includes it', () => {
    locked = false;
    renderAccordion();
    fireEvent.click(screen.getByText(/AI Draft/i).closest('button')!);

    expect(requestUpgradeMock).not.toHaveBeenCalled();
    expect(generateRubricMock).toHaveBeenCalledTimes(1);
  });
});

describe('keyword suggestion carries the studio lock', () => {
  const renderEditor = () =>
    render(
      <KeywordEditor
        prompt={prompt}
        onKeywordsChange={vi.fn()}
        isEnriching={false}
        onRegenerate={vi.fn()}
        onSuggest={onSuggest}
        userRole="teacher"
      />
    );
  const onSuggest = vi.fn();

  beforeEach(() => onSuggest.mockReset());

  it('sends a locked author to the upgrade prompt', () => {
    renderEditor();
    fireEvent.click(screen.getByTitle(/Suggest with AI/i));

    expect(requestUpgradeMock).toHaveBeenCalledWith('aiContentStudio');
    expect(onSuggest).not.toHaveBeenCalled();
  });

  it('runs normally when unlocked', () => {
    locked = false;
    renderEditor();
    fireEvent.click(screen.getByTitle(/Suggest with AI/i));

    expect(onSuggest).toHaveBeenCalledTimes(1);
  });
});

describe('lock chips name the plan that actually unlocks the feature', () => {
  it('says Plus for a Plus feature', () => {
    render(<PlusLockChip feature="fullFeedback" />);
    expect(screen.getByText('Plus')).toBeTruthy();
  });

  it('says School when a deployment prices a feature at School', async () => {
    // A chip reading "Plus" beside a School-only control sends the user to a
    // prompt selling something else — and tells a teacher who already holds
    // Plus that they have a feature the app is refusing them.
    vi.resetModules();
    vi.doMock('../../services/entitlements', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../services/entitlements')>();
      return { ...actual, lowestPlanForFeature: () => 'school' };
    });
    const { PlusLockChip: Chip } = await import('../../components/UpgradeModal');
    render(<Chip feature="aiContentStudio" />);
    expect(screen.getByText('School')).toBeTruthy();
    vi.doUnmock('../../services/entitlements');
  });
});
