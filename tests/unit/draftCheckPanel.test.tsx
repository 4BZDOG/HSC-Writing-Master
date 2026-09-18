import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import DraftCheck from '../../components/DraftCheck';
import { useScrollLock } from '../../hooks/useScrollLock';
import type { WritingInsight } from '../../utils/writingAnalysis';

afterEach(cleanup);

const INSIGHTS: WritingInsight[] = [
  { id: 'length-short', tone: 'warning', message: 'About 40 more words to reach Band 5 length.' },
  { id: 'paragraphs', tone: 'info', message: 'Break this into paragraphs.' },
];

describe('DraftCheck', () => {
  // Shut on arrival, like every panel under the writing area, and opened by a
  // deliberate click.
  it('folds and unfolds like the panels around it', () => {
    render(<DraftCheck insights={INSIGHTS} />);
    const header = screen.getByRole('button', { name: /Draft check/i });
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(header.getAttribute('aria-controls')).toBeTruthy();

    fireEvent.click(header);
    expect(header.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(header);
    expect(header.getAttribute('aria-expanded')).toBe('false');
  });

  // Closed panels all look alike, so one a student has already been through
  // says so — that is the only thing distinguishing "not read yet" from
  // "read and put away".
  it('marks itself read once it has been opened and shut again', () => {
    render(<DraftCheck insights={INSIGHTS} />);
    const header = screen.getByRole('button', { name: /Draft check/i });

    expect(screen.queryByText(/^Read$/i)).toBeNull();

    fireEvent.click(header);
    // Not while it is open — the content itself is the feedback.
    expect(screen.queryByText(/^Read$/i)).toBeNull();

    fireEvent.click(header);
    expect(screen.getByText(/^Read$/i)).toBeTruthy();
  });

  it('says what is waiting inside while it is folded', () => {
    render(<DraftCheck insights={INSIGHTS} defaultCollapsed />);
    // One warning and one info are two things to do. Counting warnings alone
    // used to report "1 to work on" over a list of two.
    expect(screen.getByText(/2 to work on/i)).toBeTruthy();
  });

  it('counts praise as nothing to work on', () => {
    render(
      <DraftCheck
        insights={[{ id: 'all-good', tone: 'positive', message: 'Looking strong.' }]}
        defaultCollapsed
      />
    );
    expect(screen.getByText(/Nothing to fix yet/i)).toBeTruthy();
  });

  // The tinted cards each note used to sit in were amber, emerald and sky —
  // Tiers 3, 4 and 5 — directly under a writing surface painted in the
  // question's own tier hue. Colour as fill belongs to the band system.
  it('marks tone with a rule and a glyph, never a fill', () => {
    const { container } = render(<DraftCheck insights={INSIGHTS} defaultCollapsed={false} />);
    const notes = Array.from(container.querySelectorAll('li'));
    expect(notes.length).toBe(2);
    for (const note of notes) {
      expect(note.className).toContain('border-l-2');
      expect(note.className).not.toMatch(/\bbg-(amber|emerald|sky)-/);
    }
  });

  it('renders nothing at all for a blank draft', () => {
    const { container } = render(<DraftCheck insights={[]} />);
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
