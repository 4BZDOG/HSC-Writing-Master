import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import ConfirmationModal from '../../components/ConfirmationModal';
import ReviewQueueModal from '../../components/admin/ReviewQueueModal';
import * as contributionService from '../../services/contributionService';

/**
 * UX contracts for the admin surfaces: Escape closes idle modals, dangerous
 * actions confirm through the app's own dialog (not window.confirm), and the
 * review queue is filterable by contribution kind with live counts.
 */

vi.mock('../../services/contributionService', async (importOriginal) => {
  const actual = await importOriginal<typeof contributionService>();
  return {
    ...actual,
    fetchModerationQueue: vi.fn(),
    approvePrompt: vi.fn().mockResolvedValue(undefined),
    rejectPrompt: vi.fn().mockResolvedValue(undefined),
    approveSampleAnswer: vi.fn().mockResolvedValue(undefined),
    rejectSampleAnswer: vi.fn().mockResolvedValue(undefined),
  };
});

const queueFixture: contributionService.ModerationItem[] = [
  {
    kind: 'prompt',
    id: 'p1',
    title: 'A pending question',
    fullText: 'A pending question',
    createdAt: null,
    qualityScore: 40,
  },
  {
    kind: 'sample_answer',
    id: 'a1',
    title: 'A pending sample answer',
    fullText: 'A pending sample answer',
    createdAt: null,
    qualityScore: 80,
  },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ConfirmationModal', () => {
  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <ConfirmationModal
        isOpen={true}
        onClose={onClose}
        onConfirm={vi.fn()}
        title="Sure?"
        message="Really?"
      />
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not listen when closed', () => {
    const onClose = vi.fn();
    render(
      <ConfirmationModal
        isOpen={false}
        onClose={onClose}
        onConfirm={vi.fn()}
        title="Sure?"
        message="Really?"
      />
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('ReviewQueueModal UX', () => {
  beforeEach(() => {
    vi.mocked(contributionService.fetchModerationQueue).mockResolvedValue(queueFixture);
  });

  const renderQueue = (onClose = vi.fn()) => {
    render(<ReviewQueueModal isOpen={true} onClose={onClose} showToast={vi.fn()} />);
    return onClose;
  };

  it('shows the pending count and kind filters with counts', async () => {
    renderQueue();
    await waitFor(() => expect(screen.getByText('2 pending')).toBeTruthy());
    expect(screen.getByText('All (2)')).toBeTruthy();
    expect(screen.getByText('Questions (1)')).toBeTruthy();
    expect(screen.getByText('Sample Answers (1)')).toBeTruthy();
  });

  it('filters the list by kind', async () => {
    renderQueue();
    await waitFor(() => expect(screen.getByText('A pending question')).toBeTruthy());

    fireEvent.click(screen.getByText('Questions (1)'));
    expect(screen.getByText('A pending question')).toBeTruthy();
    expect(screen.queryByText('A pending sample answer')).toBeNull();

    fireEvent.click(screen.getByText('Sample Answers (1)'));
    expect(screen.queryByText('A pending question')).toBeNull();
    expect(screen.getByText('A pending sample answer')).toBeTruthy();
  });

  it('rejects through the in-app confirmation dialog, not window.confirm', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    renderQueue();
    await waitFor(() => expect(screen.getByText('A pending question')).toBeTruthy());

    fireEvent.click(screen.getAllByRole('button', { name: /reject/i })[0]);
    // The styled dialog appears with context…
    const dialogTitle = screen.getByText(/Reject this question\?/);
    expect(dialogTitle).toBeTruthy();
    expect(contributionService.rejectPrompt).not.toHaveBeenCalled();

    // …and only the explicit confirm (inside the dialog) fires the RPC.
    const dialog = dialogTitle.closest('.z-\\[2200\\]') as HTMLElement;
    fireEvent.click(within(dialog).getByRole('button', { name: /^Reject$/ }));
    await waitFor(() => expect(contributionService.rejectPrompt).toHaveBeenCalledWith('p1'));
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('closes on Escape when idle, but not while the reject dialog is open', async () => {
    const onClose = renderQueue();
    await waitFor(() => expect(screen.getByText('A pending question')).toBeTruthy());

    // Open the reject dialog: Escape must close the DIALOG, not the queue.
    fireEvent.click(screen.getAllByRole('button', { name: /reject/i })[0]);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText(/Reject this question\?/)).toBeNull(); // dialog closed

    // Now idle: Escape closes the queue.
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
