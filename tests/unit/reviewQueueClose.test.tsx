import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import ReviewQueueModal from '../../components/admin/ReviewQueueModal';
import * as contributionService from '../../services/contributionService';

/**
 * Approve All publishes to the shared library one item at a time and cannot be
 * stopped. Escape was guarded against leaving it; the close button and the
 * backdrop were not, so a click on either walked away from a run that then kept
 * publishing with nothing on screen to show it. Same defect the audit studio
 * had, in the surface the studio pushes into.
 */

let releaseApprove: (() => void) | undefined;

vi.mock('../../services/contributionService', async (importOriginal) => {
  const actual = await importOriginal<typeof contributionService>();
  return {
    ...actual,
    fetchModerationQueue: vi.fn(),
    approvePrompt: vi.fn(),
    rejectPrompt: vi.fn(),
    approveSampleAnswer: vi.fn(),
    rejectSampleAnswer: vi.fn(),
    moderateStructure: vi.fn(),
  };
});

const queue = [
  {
    kind: 'prompt' as const,
    id: 'p1',
    title: 'A pending question',
    fullText: 'A pending question in full.',
    context: null,
    createdAt: null,
    qualityScore: null,
  },
  {
    kind: 'prompt' as const,
    id: 'p2',
    title: 'Another pending question',
    fullText: 'Another pending question in full.',
    context: null,
    createdAt: null,
    qualityScore: null,
  },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  releaseApprove = undefined;
});

describe('Review queue — a bulk approve cannot be walked away from', () => {
  it('blocks the close button and the backdrop while Approve All is running', async () => {
    vi.mocked(contributionService.fetchModerationQueue).mockResolvedValue(queue);
    vi.mocked(contributionService.approvePrompt).mockImplementation(
      () => new Promise<void>((resolve) => (releaseApprove = resolve))
    );

    const onClose = vi.fn();
    render(<ReviewQueueModal isOpen onClose={onClose} showToast={vi.fn()} />);

    const approveAll = await screen.findByRole('button', { name: /approve all \(2\)/i });
    fireEvent.click(approveAll);
    // The action is behind a confirmation.
    fireEvent.click(await screen.findByRole('button', { name: /approve & publish/i }));

    await waitFor(() =>
      expect((screen.getByLabelText('Close') as HTMLButtonElement).disabled).toBe(true)
    );

    // Held in the modal, so the modal says how far the run has got rather than
    // an indefinite "Approving…".
    expect(screen.getByText(/Approving… 0 of 2/)).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).not.toHaveBeenCalled();

    // The backdrop is the other unguarded way out.
    fireEvent.click(screen.getByRole('dialog', { name: /review queue/i }));
    expect(onClose).not.toHaveBeenCalled();

    releaseApprove?.();
  }, 20000);

  it('lets the reviewer leave once nothing is in flight', async () => {
    vi.mocked(contributionService.fetchModerationQueue).mockResolvedValue(queue);

    const onClose = vi.fn();
    render(<ReviewQueueModal isOpen onClose={onClose} showToast={vi.fn()} />);

    await screen.findByRole('button', { name: /approve all \(2\)/i });
    const close = screen.getByLabelText('Close') as HTMLButtonElement;
    expect(close.disabled).toBe(false);
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  }, 20000);
});
