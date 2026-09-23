import { describe, it, expect, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, cleanup, act } from '@testing-library/react';
import LoadingIndicator from '../../components/LoadingIndicator';
import EvaluationProgressBar from '../../components/EvaluationProgressBar';
import { emitEvalProgress } from '../../services/aiCore';
import { WAIT_TIPS } from '../../utils/waitTips';
import { acquireAiBusy } from '../../utils/aiBusySignal';

/**
 * The AI wait card, as a reader meets it.
 *
 * It used to show the same three spinning rings for every task, a list of
 * invented pipeline steps ("Optimising heuristic constraints…"), and a bar
 * that crept to 98% and sat there. What these pin is what replaced that:
 * a drawing per task, a note worth reading, and a clock that only states an
 * expected time when someone actually gave one.
 */

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.body.classList.remove('ai-busy');
});

const tipShown = (task: keyof typeof WAIT_TIPS): boolean =>
  WAIT_TIPS[task].some((tip) => screen.queryByText(tip) !== null);

describe('LoadingIndicator', () => {
  it('shows a note chosen for the task being waited on', () => {
    render(<LoadingIndicator task="evaluation" message="Marking your response" />);
    expect(tipShown('evaluation')).toBe(true);
  });

  it('keeps the note out of the live region, so it is not announced on its own clock', () => {
    const { container } = render(<LoadingIndicator task="generation" message="Writing" />);
    const region = screen.getByRole('status');
    const note = container.querySelector('blockquote');
    expect(note).not.toBeNull();
    expect(region.contains(note)).toBe(false);
  });

  it('gives a plain data load no note and no engine line', () => {
    render(<LoadingIndicator messages={['Loading usage data…']} duration={2} />);
    expect(document.querySelector('blockquote')).toBeNull();
    expect(screen.queryByText(/working with/i)).toBeNull();
  });

  it('only states an expected time when the caller gave one', () => {
    vi.useFakeTimers();
    render(<LoadingIndicator task="evaluation" message="Marking" duration={20} />);
    act(() => void vi.advanceTimersByTime(3000));
    expect(screen.getByText(/usually about 20s/i)).toBeTruthy();
    cleanup();

    render(<LoadingIndicator task="evaluation" message="Marking" />);
    act(() => void vi.advanceTimersByTime(3000));
    expect(screen.queryByText(/usually about/i)).toBeNull();
  });

  it('says when a wait has run past its estimate instead of sitting at 98%', () => {
    vi.useFakeTimers();
    render(<LoadingIndicator task="generation" message="Writing" duration={4} />);
    act(() => void vi.advanceTimersByTime(10_000));
    expect(screen.getByText(/taking longer than usual/i)).toBeTruthy();
  });

  it('draws the task, not a generic spinner: six band rungs for marking', () => {
    const { container } = render(<LoadingIndicator task="evaluation" message="Marking" />);
    // The ladder's rungs are coloured by band; the old rings had none.
    const rungs = Array.from(container.querySelectorAll('span')).filter((el) =>
      (el as HTMLElement).style.backgroundColor.startsWith('rgb')
    );
    expect(rungs.length).toBeGreaterThanOrEqual(6);
    expect(container.querySelector('.animate-spin-slow')).toBeNull();
  });

  it('says what failed in plain words', () => {
    render(<LoadingIndicator isError error="The AI service did not reply in time." />);
    expect(screen.getByText('The AI request did not finish')).toBeTruthy();
    expect(screen.getByText('The AI service did not reply in time.')).toBeTruthy();
  });

  it('leans the background in while it is on screen, and lets go after', () => {
    const { unmount } = render(<LoadingIndicator task="evaluation" message="Marking" />);
    expect(document.body.classList.contains('ai-busy')).toBe(true);
    unmount();
    expect(document.body.classList.contains('ai-busy')).toBe(false);
  });
});

describe('aiBusySignal', () => {
  it('stays busy until the last of two overlapping waits ends', () => {
    const releaseA = acquireAiBusy();
    const releaseB = acquireAiBusy();
    releaseA();
    expect(document.body.classList.contains('ai-busy')).toBe(true);
    releaseA(); // a second release of the same wait must not end the other
    expect(document.body.classList.contains('ai-busy')).toBe(true);
    releaseB();
    expect(document.body.classList.contains('ai-busy')).toBe(false);
  });
});

describe('EvaluationProgressBar', () => {
  it('reports the real fallback, naming the model it switched to', () => {
    render(<EvaluationProgressBar />);
    act(() =>
      emitEvalProgress({ phase: 'fallback', message: 'Switching to Gemini Flash (high demand)...' })
    );
    expect(screen.getByRole('status').textContent).toMatch(
      /switching to gemini flash \(high demand\)/i
    );
  });

  it('shows a marking note while it waits', () => {
    render(<EvaluationProgressBar />);
    expect(tipShown('evaluation')).toBe(true);
  });
});
