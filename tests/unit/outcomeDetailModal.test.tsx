import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type { CourseOutcome } from '../../types';

/**
 * The outcome brief, as a student meets it: an outcome with its tabs, a briefing
 * that is set as blocks, a calm note when the briefing does not load, and a
 * backdrop that only closes on a deliberate click.
 */

const explainOutcomeInContext =
  vi.fn<(question: string, outcome: CourseOutcome) => Promise<string>>();
vi.mock('../../services/geminiService', () => ({
  explainOutcomeInContext: (q: string, o: CourseOutcome) => explainOutcomeInContext(q, o),
}));

vi.mock('../../services/entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/entitlements')>();
  return { ...actual, isFeatureLocked: () => false };
});

import OutcomeDetailModal from '../../components/OutcomeDetailModal';
import { AICache } from '../../services/aiCache';

const EC02: CourseOutcome = {
  code: 'EC-02',
  description: 'analyses the impact of data collection on enterprise systems',
  year: 'year12',
} as CourseOutcome;
const EC04: CourseOutcome = {
  code: 'EC-04',
  description: 'evaluates the ethical use of data in an organisation',
  year: 'year12',
} as CourseOutcome;

const BRIEFING = `### What this outcome is asking for
You are asked to use the outcome's own vocabulary.

### What a marker looks for here
- A direct answer to each part of the question.

### How to show it in your answer
- Open by naming the thing being asked about.`;

const QUESTION = 'A tech company creates a data visualisation. Evaluate how bias affects it.';

const renderModal = (outcomes: CourseOutcome[] = [EC02, EC04], initialCode = 'EC-02') => {
  const onClose = vi.fn();
  const utils = render(
    <OutcomeDetailModal
      isOpen
      onClose={onClose}
      outcomes={outcomes}
      initialCode={initialCode}
      question={QUESTION}
      tier={6}
      verb="EVALUATE"
      totalMarks={6}
      breadcrumb={['Data visualisation']}
    />
  );
  return { ...utils, onClose };
};

beforeEach(() => {
  explainOutcomeInContext.mockReset();
  explainOutcomeInContext.mockResolvedValue(BRIEFING);
  // Each test starts with an empty briefing cache, so the AI mock is the source.
  vi.spyOn(AICache, 'get').mockResolvedValue(undefined as never);
  vi.spyOn(AICache, 'set').mockResolvedValue(undefined as never);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('OutcomeDetailModal', () => {
  it('is a dialog named for the outcome it is about', () => {
    renderModal();
    const dialog = screen.getByRole('dialog', { name: 'EC-02' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('names a panel only from the selected tab, because only that panel is in the page', () => {
    renderModal();
    const [first, second] = screen.getAllByRole('tab');
    expect(first.getAttribute('aria-selected')).toBe('true');
    expect(first.getAttribute('aria-controls')).toBe('outcome-panel-EC-02');
    expect(document.getElementById('outcome-panel-EC-02')).not.toBeNull();
    expect(second.getAttribute('aria-controls')).toBeNull();
    expect(document.getElementById('outcome-panel-EC-04')).toBeNull();
  });

  it('keeps every tab at least 44px tall on a phone', () => {
    renderModal();
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab.className).toMatch(/min-h-11/);
    }
  });

  it('sets the briefing as one block per heading the model wrote', async () => {
    renderModal();
    const heading = await screen.findByRole('heading', { name: 'What a marker looks for here' });
    expect(heading.tagName).toBe('H4');
    expect(screen.getByRole('heading', { name: 'How to show it in your answer' })).toBeTruthy();
  });

  it('says the briefing was written by AI, and from what', async () => {
    renderModal();
    expect(
      await screen.findByText(/Written by AI from the syllabus outcome and this question/)
    ).toBeTruthy();
  });

  it('shows the stage the outcome belongs to', () => {
    renderModal();
    expect(screen.getByText(/Outcome 1 of 2 · Year 12/)).toBeTruthy();
  });

  it('shows a calm, plain note when the briefing does not load, and never the raw error', async () => {
    explainOutcomeInContext.mockRejectedValue(
      new Error('HTTP 503 upstream: {"error":"model overloaded"} retry-after 12s')
    );
    renderModal();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('The briefing did not load this time.');
    expect(alert.textContent).toContain('The outcome above is unchanged.');
    expect(alert.textContent).not.toMatch(/503|upstream|overloaded|retry-after/);
    const retry = screen.getByRole('button', { name: 'Try again' });
    expect(retry.className).toMatch(/min-h-11/);
  });

  it('asks again through a 44px button that names what it does', async () => {
    renderModal();
    await screen.findByRole('heading', { name: 'What a marker looks for here' });
    const again = screen.getByRole('button', { name: /Ask again/i });
    expect(again.className).toMatch(/min-h-11/);
    fireEvent.click(again);
    await waitFor(() => expect(explainOutcomeInContext).toHaveBeenCalledTimes(2));
  });

  it('closes on a press that starts and ends on the backdrop', () => {
    const { onClose } = renderModal();
    const backdrop = screen.getByRole('dialog').parentElement as HTMLElement;
    fireEvent.mouseDown(backdrop);
    fireEvent.mouseUp(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open when a selection in the question is released over the backdrop', () => {
    const { onClose } = renderModal();
    const backdrop = screen.getByRole('dialog').parentElement as HTMLElement;
    fireEvent.mouseDown(screen.getByText(QUESTION));
    fireEvent.mouseUp(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('moves between outcomes with the footer buttons', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Next outcome' }));
    expect(screen.getAllByRole('tab')[1].getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('dialog', { name: 'EC-04' })).toBeTruthy();
  });

  describe('the verb sheet link', () => {
    const renderWithSheet = (onVerbSheet?: () => void) => {
      const onClose = vi.fn();
      render(
        <OutcomeDetailModal
          isOpen
          onClose={onClose}
          outcomes={[EC02]}
          initialCode="EC-02"
          question={QUESTION}
          tier={6}
          verb="EVALUATE"
          totalMarks={6}
          onVerbSheet={onVerbSheet}
        />
      );
      return { onClose };
    };

    it('asks what the question’s verb wants, as a link beside the verb', () => {
      renderWithSheet(vi.fn());
      expect(screen.getByRole('button', { name: 'What does EVALUATE ask for?' })).toBeTruthy();
    });

    it('opens the sheet over the brief, which stays open beneath it', () => {
      const onVerbSheet = vi.fn();
      const { onClose } = renderWithSheet(onVerbSheet);

      fireEvent.click(screen.getByRole('button', { name: 'What does EVALUATE ask for?' }));
      expect(onVerbSheet).toHaveBeenCalledTimes(1);
      // Stacked, not swapped: the brief is closed only by its own controls, so
      // focus and Escape stay with the sheet that opened over it.
      expect(onClose).not.toHaveBeenCalled();
    });

    it('is left out when there is no sheet to open', () => {
      renderWithSheet(undefined);
      expect(screen.queryByRole('button', { name: /ask for\?/ })).toBeNull();
    });
  });
});
