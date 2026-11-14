import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, act } from '@testing-library/react';
import { ExamClockChip } from '../../components/ExamClockChip';
import { publishExamClock } from '../../utils/examClockStore';

/**
 * The footer's copy of the Exam clock. It renders what the strip publishes, and
 * nothing when the strip has published nothing. It is a second visual copy, so it
 * is hidden from assistive technology.
 */

afterEach(() => {
  publishExamClock(null);
  cleanup();
});

describe('ExamClockChip', () => {
  it('renders nothing while no clock is published', () => {
    const { container } = render(<ExamClockChip />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the published figure and its caption', () => {
    publishExamClock({ text: '05:07', caption: 'left of 6 min', over: false });
    render(<ExamClockChip />);

    expect(screen.getByText('05:07')).toBeTruthy();
    expect(screen.getByText('left of 6 min')).toBeTruthy();
  });

  it('is hidden from assistive technology', () => {
    publishExamClock({ text: '05:07', caption: 'left of 6 min', over: false });
    render(<ExamClockChip />);

    const figure = screen.getByText('05:07').closest('[aria-hidden="true"]');
    expect(figure).not.toBeNull();
  });

  it('takes the overrun tone past the budget', () => {
    publishExamClock({ text: '+00:42', caption: 'over 6 min', over: true });
    render(<ExamClockChip />);

    const chip = screen.getByText('+00:42').closest('span[aria-hidden]') as HTMLElement;
    expect(chip.className).toContain('text-red-600');
    expect(chip.className).toContain('dark:text-red-400');
  });

  it('follows the store as it changes, and clears when it is cleared', () => {
    publishExamClock({ text: '05:07', caption: 'left of 6 min', over: false });
    render(<ExamClockChip />);

    act(() => publishExamClock({ text: '05:06', caption: 'left of 6 min', over: false }));
    expect(screen.getByText('05:06')).toBeTruthy();

    act(() => publishExamClock(null));
    expect(screen.queryByText('05:06')).toBeNull();
  });
});
