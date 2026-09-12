import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import type { CourseOutcome } from '../../types';

/**
 * The outcome briefing is now a sold feature (`outcomeBriefing`).
 *
 * Two things have to hold for that to be honest. The syllabus wording of the
 * outcome — published NESA content a student needs in order to know what is
 * being assessed — stays readable for everyone. And a locked briefing must not
 * fire the AI call: the proxy refuses it anyway, so a spinner that ends in a
 * 402 spends the student's patience to tell them a price the chip could have
 * told them for free.
 */

const explainOutcomeInContext = vi.fn(async () => 'The briefing text.');
vi.mock('../../services/geminiService', () => ({
  explainOutcomeInContext: (...args: unknown[]) =>
    explainOutcomeInContext(...(args as Parameters<typeof explainOutcomeInContext>)),
}));

const isFeatureLocked = vi.fn(() => true);
vi.mock('../../services/entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/entitlements')>();
  return { ...actual, isFeatureLocked: (...a: unknown[]) => isFeatureLocked(...(a as [])) };
});

import OutcomeDetailModal from '../../components/OutcomeDetailModal';

const outcome: CourseOutcome = {
  code: 'CT5-DAT-01',
  description: 'analyses how data is collected, stored and used by information systems',
} as CourseOutcome;

const renderModal = () =>
  render(
    <OutcomeDetailModal
      isOpen
      onClose={() => {}}
      outcomes={[outcome]}
      initialCode={outcome.code}
      question="Analyse the impact of automated data collection."
      tier={4}
      totalMarks={6}
    />
  );

beforeEach(() => {
  explainOutcomeInContext.mockClear();
  isFeatureLocked.mockReturnValue(true);
});
afterEach(cleanup);

describe('outcome briefing paywall', () => {
  it('never spends an AI call while the briefing is locked', async () => {
    renderModal();
    // Settled, not merely immediate. The unlocked path now reads a cache before
    // it calls, so the call lands a microtask late — and a synchronous "was not
    // called" would pass here even if the guard were gone entirely.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(explainOutcomeInContext).not.toHaveBeenCalled();
  });

  it('says the briefing is a paid feature, and offers a way to unlock it', () => {
    renderModal();
    expect(screen.getByText(/Outcome briefings are a Plus feature/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Unlock with/i })).toBeTruthy();
  });

  it('still shows the outcome’s own syllabus wording when locked', () => {
    renderModal();
    expect(screen.getByText(outcome.description)).toBeTruthy();
  });

  it('fetches the briefing once the feature is unlocked', async () => {
    isFeatureLocked.mockReturnValue(false);
    renderModal();
    // Awaited rather than asserted on the spot: the unlocked path reads the
    // briefing cache first, so the call is one microtask away from the render.
    // Asserting synchronously passed locally and failed in CI, where opening
    // IndexedDB took a beat longer — a race, not a rule.
    await waitFor(() => expect(explainOutcomeInContext).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/The briefing text\./)).toBeTruthy();
  });
});
