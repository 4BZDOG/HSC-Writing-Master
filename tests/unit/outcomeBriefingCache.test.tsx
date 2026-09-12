import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import type { CourseOutcome } from '../../types';

/**
 * A briefing is bought once, not once per opening.
 *
 * It is a function of the question and the outcome and nothing else, so the
 * same pair always deserves the same answer — but the modal cleared its state
 * on every open, which meant shutting the panel and opening it again fired the
 * call afresh. That is a second wait for identical text, and a second unit of a
 * student's daily allowance, for a feature they are already paying for.
 *
 * The in-memory reset stays: the modal can re-open on a DIFFERENT question, and
 * stale text under a new heading is worse than a spinner. What changed is that
 * the answer now outlives the modal on disk.
 */

const explainOutcomeInContext = vi.fn(async () => 'The briefing text.');
vi.mock('../../services/geminiService', () => ({
  explainOutcomeInContext: (...args: unknown[]) =>
    explainOutcomeInContext(...(args as Parameters<typeof explainOutcomeInContext>)),
}));

// Unlocked: the paywall is another test's subject (outcomeBriefingGate), and a
// locked briefing fires no call at all, which would make every assertion here
// pass for the wrong reason.
vi.mock('../../services/entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/entitlements')>();
  return { ...actual, isFeatureLocked: () => false };
});

/** A stand-in for the IndexedDB cache, so the test needs no browser storage. */
const store = new Map<string, unknown>();
vi.mock('../../services/aiCache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/aiCache')>();
  return {
    AICache: {
      generateOutcomeBriefingKey: actual.AICache.generateOutcomeBriefingKey.bind(actual.AICache),
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      set: vi.fn(async (key: string, value: unknown) => {
        store.set(key, value);
      }),
    },
  };
});

import OutcomeDetailModal from '../../components/OutcomeDetailModal';
import { AICache } from '../../services/aiCache';

const outcome: CourseOutcome = {
  code: 'SE-12-06',
  description: 'justifies the selection of a data structure for a problem',
} as CourseOutcome;

const QUESTION = 'Explain how packets are routed across the internet.';

const renderModal = (question = QUESTION) =>
  render(
    <OutcomeDetailModal
      isOpen
      onClose={() => {}}
      outcomes={[outcome]}
      initialCode={outcome.code}
      question={question}
      tier={4}
      totalMarks={6}
    />
  );

beforeEach(() => {
  store.clear();
  explainOutcomeInContext.mockClear();
  explainOutcomeInContext.mockResolvedValue('The briefing text.');
});
afterEach(cleanup);

describe('the outcome briefing is cached', () => {
  it('asks the model once, then reads the same briefing back on re-open', async () => {
    const first = renderModal();
    await screen.findByText(/the briefing text/i);
    expect(explainOutcomeInContext).toHaveBeenCalledTimes(1);

    // Shut it and open it again on the same question, as a student rereading
    // the standards would.
    first.unmount();
    renderModal();

    await screen.findByText(/the briefing text/i);
    // The text is back and nothing was bought to put it there.
    expect(explainOutcomeInContext).toHaveBeenCalledTimes(1);
  });

  it('keys on the question, so a different one is briefed on its own terms', async () => {
    const first = renderModal();
    await screen.findByText(/the briefing text/i);
    expect(explainOutcomeInContext).toHaveBeenCalledTimes(1);

    first.unmount();
    explainOutcomeInContext.mockResolvedValue('A different briefing.');
    renderModal('Evaluate the trade-offs of a hash table for this problem.');

    await screen.findByText(/a different briefing/i);
    // A cache keyed only on the outcome code would have served the first
    // question's briefing under the second question's heading.
    expect(explainOutcomeInContext).toHaveBeenCalledTimes(2);
  });

  it('lets a regenerate skip the cache, and stores what it gets', async () => {
    renderModal();
    await screen.findByText(/the briefing text/i);

    explainOutcomeInContext.mockResolvedValue('A second opinion.');
    fireEvent.click(screen.getByRole('button', { name: /regenerate|try again/i }));

    await screen.findByText(/a second opinion/i);
    expect(explainOutcomeInContext).toHaveBeenCalledTimes(2);

    // The opinion they just paid for is the one they get next time.
    await waitFor(() =>
      expect(store.get(AICache.generateOutcomeBriefingKey(QUESTION, outcome.code))).toBe(
        'A second opinion.'
      )
    );
  });

  it('still shows the briefing when the cache cannot be written', async () => {
    vi.mocked(AICache.set).mockRejectedValueOnce(new Error('storage full'));
    renderModal();
    // A failed write is not the student's problem — the text they already have
    // must stay on screen.
    await screen.findByText(/the briefing text/i);
  });
});
