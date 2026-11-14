import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { WritingMetricsDashboard } from '../../components/WritingMetricsDashboard';
import { getExamClock, publishExamClock } from '../../utils/examClockStore';
import type { Prompt } from '../../types';

/**
 * The strip publishes its clock for the footer only in Exam Mode, and the footer
 * copy is the strip's own string, not a second formatting of it.
 */

const prompt = (): Prompt =>
  ({
    id: 'p-clock',
    question: 'Describe the process of mitosis.',
    verb: 'DESCRIBE',
    totalMarks: 4,
    keywords: ['mitosis'],
    markingCriteria: [],
  }) as unknown as Prompt;

const strip = (writingMode: 'coach' | 'exam') => (
  <WritingMetricsDashboard
    userAnswer=""
    prompt={prompt()}
    onAddWord={vi.fn()}
    writingMode={writingMode}
    elapsedSeconds={0}
  />
);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
  publishExamClock(null);
  cleanup();
});

describe('WritingMetricsDashboard publishes the exam clock', () => {
  it('publishes the strip’s own figure and caption in Exam Mode', () => {
    render(strip('exam'));

    const reading = getExamClock();
    expect(reading).not.toBeNull();
    expect(reading?.text).toBe(screen.getByRole('timer').textContent);
    expect(reading?.caption).toBe(screen.getByText(/left of|guide for|over|paused/).textContent);
    expect(reading?.over).toBe(false);
  });

  it('publishes nothing in Coach Mode', () => {
    render(strip('coach'));

    expect(getExamClock()).toBeNull();
  });

  it('clears a published clock when the strip switches to Coach Mode', () => {
    const { rerender } = render(strip('exam'));
    expect(getExamClock()).not.toBeNull();

    rerender(strip('coach'));

    expect(getExamClock()).toBeNull();
  });

  it('clears the clock when the strip leaves the page', () => {
    const { unmount } = render(strip('exam'));
    expect(getExamClock()).not.toBeNull();

    unmount();

    expect(getExamClock()).toBeNull();
  });
});
