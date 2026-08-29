import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { QualityCheckResult } from '../../types';

/**
 * A failed quality check that is retried and SUCCEEDS must show the result, not
 * stay stuck on the error card. The regression: `runCheck` never cleared the
 * previous `error`, and the body renders `error` before `result`, so a
 * successful retry fell through to the error notice until the modal was reopened.
 */

const performQualityCheck = vi.fn();

vi.mock('../../services/geminiService', () => ({
  performQualityCheck: (...args: unknown[]) => performQualityCheck(...args),
}));

import QualityCheckModal from '../../components/QualityCheckModal';

const okResult: QualityCheckResult = {
  status: 'PASS',
  score: 92,
  summary: 'Reads as a well-formed question.',
  issues: [],
};

beforeEach(() => performQualityCheck.mockReset());
afterEach(cleanup);

describe('QualityCheckModal retry', () => {
  it('shows the result when a retry succeeds after a failure', async () => {
    performQualityCheck
      .mockRejectedValueOnce(new Error('Model unavailable'))
      .mockResolvedValueOnce(okResult);

    render(
      <QualityCheckModal isOpen onClose={vi.fn()} content="Explain photosynthesis." contentType="question" />
    );

    // First run fails → error card.
    await screen.findByText('Check failed');
    expect(screen.getByText('Model unavailable')).toBeTruthy();

    // Retry succeeds → result card, error gone.
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await screen.findByText('Quality Score');
    expect(screen.getByText('92')).toBeTruthy();
    expect(screen.queryByText('Check failed')).toBeNull();
  });

  it('still shows the error when a retry fails again', async () => {
    performQualityCheck
      .mockRejectedValueOnce(new Error('First failure'))
      .mockRejectedValueOnce(new Error('Second failure'));

    render(
      <QualityCheckModal isOpen onClose={vi.fn()} content="Explain photosynthesis." contentType="question" />
    );

    await screen.findByText('First failure');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await screen.findByText('Second failure');
    expect(screen.getByText('Check failed')).toBeTruthy();
  });

  it('does not close on a backdrop click while a check is in flight', async () => {
    // Hold the check open with a deferred promise so the modal stays in its
    // loading state for the assertion, then resolve it so cleanup is clean.
    let resolveCheck: (r: QualityCheckResult) => void = () => {};
    performQualityCheck.mockReturnValue(
      new Promise<QualityCheckResult>((r) => {
        resolveCheck = r;
      })
    );
    const onClose = vi.fn();

    render(
      <QualityCheckModal isOpen onClose={onClose} content="Explain photosynthesis." contentType="question" />
    );

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(dialog); // backdrop click while loading
    expect(onClose).not.toHaveBeenCalled();

    // Let the check settle so the component leaves its loading state cleanly.
    resolveCheck(okResult);
    await screen.findByText('Quality Score');
  });
});
