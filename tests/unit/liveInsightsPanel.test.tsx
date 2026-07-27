import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import LiveInsights from '../../components/LiveInsights';
import { useScrollLock } from '../../hooks/useScrollLock';
import type { WritingInsight } from '../../utils/writingAnalysis';

afterEach(cleanup);

const INSIGHTS: WritingInsight[] = [
  { id: 'length-short', tone: 'warning', message: 'About 40 more words to reach Band 5 length.' },
  { id: 'paragraphs', tone: 'info', message: 'Break this into paragraphs.' },
];

describe('LiveInsights', () => {
  it('folds and unfolds like the panels around it', () => {
    render(<LiveInsights insights={INSIGHTS} />);
    const header = screen.getByRole('button', { name: /Live Insights/i });
    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect(header.getAttribute('aria-controls')).toBeTruthy();

    fireEvent.click(header);
    expect(header.getAttribute('aria-expanded')).toBe('false');
  });

  it('says what is waiting inside while it is folded', () => {
    render(<LiveInsights insights={INSIGHTS} defaultCollapsed />);
    // One warning, one info — the header counts the things to act on.
    expect(screen.getByText(/1 to work on/i)).toBeTruthy();
  });

  it('renders nothing at all for a blank draft', () => {
    const { container } = render(<LiveInsights insights={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

const LockProbe: React.FC<{ active: boolean }> = ({ active }) => {
  useScrollLock(active);
  return null;
};

describe('useScrollLock', () => {
  it('freezes the page while an overlay is open and restores it after', () => {
    const { rerender, unmount } = render(<LockProbe active={false} />);
    expect(document.documentElement.style.overflow).toBe('');

    rerender(<LockProbe active={true} />);
    // <html> is what scrolls the viewport — locking <body> alone changed
    // nothing, which is how the background kept moving under the wheel.
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(document.body.style.position).toBe('fixed');

    rerender(<LockProbe active={false} />);
    expect(document.documentElement.style.overflow).toBe('');
    expect(document.body.style.position).toBe('');

    unmount();
  });

  it('refcounts, so closing the top layer does not unfreeze the page', () => {
    const Two: React.FC<{ second: boolean }> = ({ second }) => (
      <>
        <LockProbe active />
        {second && <LockProbe active />}
      </>
    );
    const { rerender, unmount } = render(<Two second={true} />);
    expect(document.documentElement.style.overflow).toBe('hidden');

    // The confirmation dialog closes; the modal underneath is still open.
    act(() => rerender(<Two second={false} />));
    expect(document.documentElement.style.overflow).toBe('hidden');

    unmount();
    expect(document.documentElement.style.overflow).toBe('');
  });
});
