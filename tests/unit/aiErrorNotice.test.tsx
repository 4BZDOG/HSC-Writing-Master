import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import AiErrorNotice from '../../components/AiErrorNotice';
import PromptGeneratorModal from '../../components/PromptGeneratorModal';

/**
 * The shared AI error card must actually announce failures (F1): a rejected
 * generation used to hide the busy overlay and leave the modal silently empty.
 * These tests cover the presentational card in isolation and the modal wiring
 * that now surfaces it.
 */

const generateNewPrompt = vi.fn();
vi.mock('../../services/geminiService', () => ({
  generateNewPrompt: (...args: unknown[]) => generateNewPrompt(...args),
}));

describe('AiErrorNotice', () => {
  afterEach(cleanup);

  it('renders the default title and the supplied message with an assertive alert role', () => {
    render(<AiErrorNotice message="The colour service was unavailable." />);

    const alert = screen.getByRole('alert');
    expect(alert.getAttribute('aria-live')).toBe('assertive');
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText('The colour service was unavailable.')).toBeTruthy();
  });

  it('shows retry/dismiss buttons only when their handlers are provided', () => {
    const onRetry = vi.fn();
    const onDismiss = vi.fn();
    render(
      <AiErrorNotice
        title="Generation failed"
        message="Something broke."
        onRetry={onRetry}
        onDismiss={onDismiss}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('omits the action buttons when no handlers are given', () => {
    render(<AiErrorNotice message="No actions here." />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('PromptGeneratorModal surfaces generation failures', () => {
  beforeEach(() => {
    generateNewPrompt.mockReset();
  });
  afterEach(cleanup);

  it('renders the error card when generation rejects', async () => {
    generateNewPrompt.mockRejectedValueOnce(new Error('Model overloaded — try again.'));

    render(
      <PromptGeneratorModal
        isOpen={true}
        onClose={vi.fn()}
        onPromptGenerated={vi.fn()}
        courseName="Test Course"
        topicName="Test Topic"
        dotPoint="describe the features of a relational database"
        marks={5}
        courseOutcomes={[]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
    expect(screen.getByText('Model overloaded — try again.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
