import { describe, it, expect, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, cleanup, act } from '@testing-library/react';
import BootSplash from '../../components/BootSplash';

/**
 * The screen a saved session restores behind (#407). It replaced a blank
 * `null`, and the one thing it must not do is flash: a fast restore never
 * shows the mark, and a slow one says what is happening to a screen reader.
 */

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('BootSplash', () => {
  it('shows nothing for a fast restore', () => {
    vi.useFakeTimers();
    render(<BootSplash />);
    act(() => void vi.advanceTimersByTime(399));
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('shows the band ladder and a status line once the restore is slow', () => {
    vi.useFakeTimers();
    render(<BootSplash />);
    act(() => void vi.advanceTimersByTime(400));
    expect(screen.getByRole('status').textContent).toBe('Opening Band 6…');
    expect(screen.getByRole('img', { name: /band ladder/i })).toBeTruthy();
  });

  it('leaves no timer behind when the restore finishes first', () => {
    vi.useFakeTimers();
    const { unmount } = render(<BootSplash />);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
