import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { useEscapeKey, isOverlayOpen } from '../../hooks/useEscapeKey';

/**
 * Escape dismisses the TOPMOST surface and nothing else.
 *
 * Every dismissible overlay listens on `window`, so they share a target and
 * `stopPropagation` cannot arbitrate between them — one press used to close the
 * improvement diff AND the feedback modal underneath it in a single keystroke.
 * The hook keeps its own stack instead.
 */
afterEach(cleanup);

const Overlay: React.FC<{ active?: boolean; onEscape: () => void }> = ({
  active = true,
  onEscape,
}) => {
  useEscapeKey(active, onEscape);
  return null;
};

const pressEscape = () => fireEvent.keyDown(window, { key: 'Escape' });

describe('Escape is a stack', () => {
  it('dismisses only the surface opened last', () => {
    const outer = vi.fn();
    const inner = vi.fn();

    render(
      <>
        <Overlay onEscape={outer} />
        <Overlay onEscape={inner} />
      </>
    );

    pressEscape();

    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });

  it('hands control back to the surface beneath once the top one closes', () => {
    const outer = vi.fn();
    const inner = vi.fn();

    const { rerender } = render(
      <>
        <Overlay onEscape={outer} />
        <Overlay onEscape={inner} />
      </>
    );
    rerender(
      <>
        <Overlay onEscape={outer} />
      </>
    );

    pressEscape();

    expect(outer).toHaveBeenCalledTimes(1);
    expect(inner).not.toHaveBeenCalled();
  });

  it('falls through a dialog that has detached its handler mid-operation', () => {
    // A modal sets `active: false` while an AI call is in flight so Escape
    // cannot abandon it. The surface beneath should still answer.
    const outer = vi.fn();
    const busy = vi.fn();

    render(
      <>
        <Overlay onEscape={outer} />
        <Overlay active={false} onEscape={busy} />
      </>
    );

    pressEscape();

    expect(busy).not.toHaveBeenCalled();
    expect(outer).toHaveBeenCalledTimes(1);
  });

  it('does not fire a stale callback after a re-render', () => {
    const first = vi.fn();
    const second = vi.fn();

    const { rerender } = render(<Overlay onEscape={first} />);
    rerender(<Overlay onEscape={second} />);

    pressEscape();

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('reports whether anything is layered above the page', () => {
    expect(isOverlayOpen()).toBe(false);
    const { unmount } = render(<Overlay onEscape={vi.fn()} />);
    expect(isOverlayOpen()).toBe(true);
    unmount();
    expect(isOverlayOpen()).toBe(false);
  });
});
