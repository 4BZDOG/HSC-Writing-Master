import { describe, it, expect, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, cleanup, act } from '@testing-library/react';
import DataLoading from '../../components/DataLoading';

/**
 * The wait for a local data read, as an admin meets it.
 *
 * A read that finishes inside a quarter of a second shows nothing, so a fast
 * fetch never flashes a mark. A slower one shows the mark and its one line. The
 * wrapper holds its height from the first frame, so the panel does not jump.
 */

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('DataLoading', () => {
  it('says nothing for the first 250ms, then the label, in one live region', () => {
    vi.useFakeTimers();
    render(<DataLoading label="Loading usage" />);

    // The region is there from the first frame, empty: a live region inserted
    // already holding its text is often not announced.
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('');

    act(() => {
      vi.advanceTimersByTime(249);
    });
    expect(screen.getByRole('status').textContent).toBe('');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole('status')).toBe(status);
    expect(status.textContent).toContain('Loading usage');
  });

  it('keeps its minimum height from the first frame, before the label shows', () => {
    vi.useFakeTimers();
    render(<DataLoading label="Reading backups" />);
    expect(screen.getByRole('status').className).toContain('min-h-[8rem]');
  });

  it('leaves no timer behind when unmounted before the 250ms delay', () => {
    vi.useFakeTimers();
    const { unmount } = render(<DataLoading label="Reading records" />);
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);

    // Running the clock past the delay must not set state on an unmounted tree.
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(errors).not.toHaveBeenCalled();
  });
});
