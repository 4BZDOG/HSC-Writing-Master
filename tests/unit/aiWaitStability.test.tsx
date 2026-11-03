import { describe, it, expect, afterEach, vi } from 'vitest';
import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import LoadingIndicator from '../../components/LoadingIndicator';

/**
 * The wait card's drawing must not restart while the clock runs.
 *
 * The clock ticks once a second and re-renders the card. Before the stage was
 * contained, each change of the clock's text restarted the drawing's own
 * animations: the marking page faded out and its read-sweeps started again,
 * once a second, so the bars flickered. These pin the fix: the stage keeps its
 * DOM node and its containment across ticks, and the page drawing keeps its
 * node too, so an animation on it is not rebuilt by the clock.
 */

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const clockText = (container: HTMLElement): string | null =>
  container.querySelector('.ai-wait-clock p')?.textContent ?? null;

describe('AI wait stage across clock ticks', () => {
  it('keeps the same stage and drawing nodes while the clock runs', () => {
    vi.useFakeTimers();
    // A fixed random draw keeps the marking page from turning inside the window.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { container } = render(<LoadingIndicator task="evaluation" message="Marking" quiz />);

    const stage = container.querySelector('.ai-wait-glyph');
    const page = container.querySelector('.ai-wait-glyph svg.absolute');
    expect(stage).not.toBeNull();
    expect(page).not.toBeNull();
    expect(clockText(container)).toBe('0:00');

    // Three seconds: the clock moves on each second, and the page does not turn
    // (its first turn is no earlier than 4.2 seconds).
    act(() => void vi.advanceTimersByTime(3_000));

    expect(clockText(container)).toBe('0:03');
    expect(container.querySelector('.ai-wait-glyph')).toBe(stage);
    expect(container.querySelector('.ai-wait-glyph svg.absolute')).toBe(page);
  });

  it('contains layout and paint, so the clock beside it cannot restart its animations', () => {
    const { container } = render(<LoadingIndicator task="evaluation" message="Marking" quiz />);
    const stage = container.querySelector<HTMLElement>('.ai-wait-glyph');
    expect(stage?.style.contain).toBe('layout paint');
  });

  it('does not put an entrance animation on the marking page itself', () => {
    // The page's own entrance was the element that faded out. Page turns are now a
    // plain cut, so nothing on the drawing is left to restart.
    const { container } = render(<LoadingIndicator task="evaluation" message="Marking" quiz />);
    const page = container.querySelector<SVGElement>('.ai-wait-glyph svg.absolute');
    expect(page?.getAttribute('style')).toBeNull();
    expect(container.querySelector('.ai-wait-glyph [style*="glyph-settle"]')).toBeNull();
  });
});
