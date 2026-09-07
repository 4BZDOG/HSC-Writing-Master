import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import StarterQuestionsModal from '../../components/StarterQuestionsModal';
import * as geminiService from '../../services/geminiService';
import type { Course } from '../../types';

/**
 * The run lifecycle of the starter-questions step.
 *
 * `isRunning` was derived from `progress.isComplete`, which does not mean "the
 * run has ended" — it means "every task is accounted for". A stopped run, and a
 * run the provider halted (bad key, exhausted quota), both end with that false,
 * so this modal stayed convinced it was still running: close disabled, Stop
 * still on screen and inert, Done never offered. The only way out was to reload
 * the page, and this modal is offered to a teacher straight after an import.
 */

vi.mock('../../services/geminiService', async (importOriginal) => {
  const actual = await importOriginal<typeof geminiService>();
  return {
    ...actual,
    generateNewPrompt: vi.fn(),
  };
});

vi.mock('../../services/entitlements', async (importOriginal) => {
  const actual = await importOriginal<object>();
  return { ...actual, isFeatureLocked: () => false, requestUpgrade: vi.fn() };
});

const course = {
  id: 'c1',
  name: 'Starter Course',
  outcomes: [{ code: 'SC-1', description: 'An outcome' }],
  topics: [
    {
      id: 't1',
      name: 'Starter Topic',
      subTopics: [
        {
          id: 'st1',
          name: 'Starter SubTopic',
          dotPoints: [
            { id: 'dp1', description: 'describe the first idea', prompts: [] },
            { id: 'dp2', description: 'describe the second idea', prompts: [] },
            { id: 'dp3', description: 'describe the third idea', prompts: [] },
          ],
        },
      ],
    },
  ],
} as unknown as Course;

const renderModal = (onClose = vi.fn()) => {
  render(
    <StarterQuestionsModal
      isOpen
      onClose={onClose}
      course={course}
      updateCourses={vi.fn()}
      showToast={vi.fn()}
    />
  );
  return onClose;
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Starter questions — a run that ends can always be left', () => {
  it('re-enables Close and offers Done after the run is stopped part-way', async () => {
    // Slow enough that Stop lands while tasks are still queued.
    vi.mocked(geminiService.generateNewPrompt).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ id: 'p1', question: 'Q' } as never), 400)
        )
    );

    const onClose = renderModal();
    fireEvent.click(screen.getByRole('button', { name: /write 3 questions/i }));

    const stopBtn = await screen.findByRole('button', { name: /^stop$/i }, { timeout: 8000 });
    expect((screen.getByLabelText('Close') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(stopBtn);

    // The run ends: Stop goes, Done arrives, Close comes back.
    await waitFor(
      () => expect(screen.getByRole('button', { name: /^done$/i })).toBeTruthy(),
      { timeout: 15000 }
    );
    expect(screen.queryByRole('button', { name: /^stop$/i })).toBeNull();
    expect((screen.getByLabelText('Close') as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText('Stopped')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  }, 40000);

  it('re-enables Close when the provider halts the batch part-way', async () => {
    // A bad key is fatal and non-retryable: the runner halts with tasks left,
    // which is the other way `isComplete` stays false for ever.
    const { ApiKeyError } = await import('../../services/aiCore');
    vi.mocked(geminiService.generateNewPrompt).mockRejectedValue(new ApiKeyError('bad key'));

    const onClose = renderModal();
    fireEvent.click(screen.getByRole('button', { name: /write 3 questions/i }));

    await waitFor(
      () => expect(screen.getByRole('button', { name: /^done$/i })).toBeTruthy(),
      { timeout: 15000 }
    );
    expect((screen.getByLabelText('Close') as HTMLButtonElement).disabled).toBe(false);
    // The halt is explained rather than left as a stalled progress bar. It
    // appears twice — the banner, and the runner's own log line.
    expect(screen.getAllByText(/API key is invalid or expired/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /^done$/i }));
    expect(onClose).toHaveBeenCalled();
  }, 40000);

  it('locks the modal shut only while the run is genuinely in flight', async () => {
    vi.mocked(geminiService.generateNewPrompt).mockResolvedValue({
      id: 'p1',
      question: 'Q',
    } as never);

    const onClose = renderModal();
    // Before any run, closing is free.
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /write 3 questions/i }));
    await waitFor(
      () => expect(screen.getByRole('button', { name: /^done$/i })).toBeTruthy(),
      { timeout: 15000 }
    );
    expect(screen.getByText('Finished')).toBeTruthy();
  }, 40000);
});
