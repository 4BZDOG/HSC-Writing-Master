import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { useState } from 'react';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import SyllabusNavBar from '../../components/SyllabusNavBar';
import Breadcrumb from '../../components/Breadcrumb';
import {
  useNavigatorFold,
  NAVIGATOR_COLLAPSED_MESSAGE,
  NAVIGATOR_EXPANDED_MESSAGE,
} from '../../hooks/useNavigatorFold';
import { Prompt } from '../../types';

/**
 * The fold — choosing a question folds the syllabus navigator down to a
 * breadcrumb bar and unmounts it — is deliberate and is not what these tests
 * are about. What they are about is that it used to happen in silence and take
 * the keyboard with it.
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const prompt = {
  id: 'p1',
  question: 'Assess the effect of temperature on enzyme activity.',
  totalMarks: 6,
  verb: 'ASSESS',
} as unknown as Prompt;

const crumbs = [
  { label: 'HSC Biology', onClick: vi.fn() },
  { label: 'Heredity', onClick: vi.fn() },
  { label: 'Polypeptide synthesis', onClick: vi.fn() },
  { label: 'Interpret models of DNA', onClick: vi.fn() },
];

describe('the collapsed bar a student lives with all session', () => {
  it('puts its crumb trail in a landmark with a name', () => {
    render(<SyllabusNavBar crumbs={crumbs} prompt={prompt} onExpand={vi.fn()} />);

    // `Breadcrumb`, its counterpart in the navigator's OTHER state, has been a
    // named `<nav>` all along; this — the more prominent of the two — was a
    // bare `<ol>` inside a `<div>`.
    const trail = screen.getByRole('navigation', { name: /syllabus path/i });
    expect(within(trail).getAllByRole('listitem')).toHaveLength(crumbs.length);
    expect(within(trail).getByRole('button', { name: /heredity/i })).toBeTruthy();
  });

  it('can be focused programmatically, which is what makes the handover work', () => {
    const { container } = render(
      <SyllabusNavBar crumbs={crumbs} prompt={prompt} onExpand={vi.fn()} />
    );

    const root = container.querySelector('#syllabus-nav-bar') as HTMLElement;
    expect(root.getAttribute('tabindex')).toBe('-1');

    root.focus();
    expect(document.activeElement).toBe(root);
  });
});

describe('the breadcrumb scrolls itself into view', () => {
  const stubScroll = () => {
    const scrollTo = vi.fn();
    // jsdom has no layout and therefore no `scrollTo` on an element.
    Element.prototype.scrollTo = scrollTo as unknown as Element['scrollTo'];
    return scrollTo;
  };

  const setReducedMotion = (reduce: boolean) => {
    // jsdom does not define `matchMedia` at all, so the guard has to be handed
    // one before it can report anything.
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: reduce }) as unknown as typeof matchMedia;
  };

  it('does not animate when the reader has asked for less motion', () => {
    const scrollTo = stubScroll();
    setReducedMotion(true);

    render(<Breadcrumb items={crumbs} />);

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }));
  });

  it('still glides when they have not', () => {
    const scrollTo = stubScroll();
    setReducedMotion(false);

    render(<Breadcrumb items={crumbs} />);

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }));
  });
});

/**
 * The harness renders exactly one of the two landmarks, the way the app does —
 * the point of the handover is that the element which had focus has just been
 * destroyed — plus an editor to prove the guard does not reach into it.
 */
const Harness: React.FC<{ collapsed: boolean }> = ({ collapsed }) => {
  const announcement = useNavigatorFold(collapsed, {
    collapsedId: 'bar',
    expandedId: 'nav',
  });
  const [answer, setAnswer] = useState('');

  return (
    <div>
      {collapsed ? (
        <div id="bar" tabIndex={-1} data-testid="bar" />
      ) : (
        <nav id="nav" tabIndex={-1} aria-label="Syllabus navigator" />
      )}
      <textarea
        aria-label="Answer"
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
      />
      <p role="status">{announcement}</p>
    </div>
  );
};

describe('handing the keyboard across the fold', () => {
  it('says nothing and moves nothing on the way in', () => {
    render(<Harness collapsed />);

    // Landing on a full path from an assignment link is not a fold.
    expect(document.activeElement).toBe(document.body);
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('follows the navigator down to the breadcrumb, and says so', () => {
    const { rerender } = render(<Harness collapsed={false} />);
    rerender(<Harness collapsed />);

    expect(document.activeElement).toBe(screen.getByTestId('bar'));
    expect(screen.getByRole('status').textContent).toBe(NAVIGATOR_COLLAPSED_MESSAGE);
  });

  it('follows it back up to the navigator when it reopens', () => {
    const { rerender } = render(<Harness collapsed={false} />);
    rerender(<Harness collapsed />);
    rerender(<Harness collapsed={false} />);

    // The landmark itself, not its first control — the region's name is worth
    // hearing before its contents.
    expect(document.activeElement).toBe(
      screen.getByRole('navigation', { name: /syllabus navigator/i })
    );
    expect(screen.getByRole('status').textContent).toBe(NAVIGATOR_EXPANDED_MESSAGE);
  });

  /**
   * The whole reason the guard is on the transition rather than the steady
   * state. `App` re-renders on every keystroke in the editor; a guard that
   * asked "is it collapsed?" instead of "did it just collapse?" would answer
   * yes every time and lift the cursor out of a half-written sentence.
   */
  it('does not touch the editor a reader is typing into', () => {
    const { rerender } = render(<Harness collapsed />);
    const editor = screen.getByLabelText('Answer') as HTMLTextAreaElement;

    editor.focus();
    fireEvent.change(editor, { target: { value: 'The enzyme denatures because' } });
    expect(document.activeElement).toBe(editor);

    fireEvent.change(editor, { target: { value: 'The enzyme denatures because the' } });
    rerender(<Harness collapsed />);
    rerender(<Harness collapsed />);

    expect(document.activeElement).toBe(editor);
    expect((document.activeElement as HTMLTextAreaElement).value).toBe(
      'The enzyme denatures because the'
    );
    expect(screen.getByRole('status').textContent).toBe('');
  });
});
