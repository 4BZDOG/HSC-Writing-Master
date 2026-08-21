import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import Breadcrumb from '../../components/Breadcrumb';
import type { SyllabusCrumb } from '../../types';

/**
 * The app used to draw its syllabus path twice — a live one in the collapsed
 * navigator bar and an entirely inert one above the workspace — from two
 * separately built arrays. They printed different names for the same course,
 * and the inert one re-scrolled itself on every keystroke. This is the one
 * implementation both now render, so these are the promises it has to keep.
 */

beforeAll(() => {
  // jsdom has no layout: `scrollTo` is not implemented on Element at all, and
  // the highlight's scrollIntoView is a no-op stub.
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.scrollTo = vi.fn();
});

const scrollSpy = () => Element.prototype.scrollTo as unknown as ReturnType<typeof vi.fn>;

const realMatchMedia = window.matchMedia;

beforeEach(() => {
  scrollSpy().mockClear();
});

afterEach(() => {
  cleanup();
  window.matchMedia = realMatchMedia;
});

const path = (over: Partial<SyllabusCrumb>[] = []): SyllabusCrumb[] =>
  [
    { label: 'Business Studies', onClick: vi.fn() },
    { label: 'Nature and Practice of Business', onClick: vi.fn() },
    { label: 'Role of business', onClick: vi.fn() },
    { label: 'the role of business in the economy', onClick: vi.fn() },
  ].map((c, i) => ({ ...c, ...(over[i] ?? {}) }));

const crumbButtons = () => within(screen.getByRole('navigation')).getAllByRole('button');

describe('the syllabus breadcrumb', () => {
  it('is a named navigation landmark with exactly one current place', () => {
    const { container } = render(<Breadcrumb items={path()} />);

    expect(screen.getByRole('navigation').getAttribute('aria-label')).toBe('Breadcrumb');
    const current = container.querySelectorAll('[aria-current]');
    expect(current).toHaveLength(1);
    // `location`, not `page`: the deepest crumb names a place in the path, but
    // the page the student is on is the question below it.
    expect(current[0].getAttribute('aria-current')).toBe('location');
    expect(current[0].textContent).toContain('the role of business in the economy');
  });

  /**
   * The regression that made the whole thing pointless: `disabled={isLast || …}`
   * meant the workspace's crumbs — which carried no handlers at all — rendered
   * as four dead controls, announced to a screen reader as unavailable.
   */
  it('makes a crumb with a handler a live button, and only one without inert', () => {
    const onClick = vi.fn();
    render(<Breadcrumb items={path([{ onClick }, {}, {}, { onClick: undefined }])} />);

    const buttons = crumbButtons() as HTMLButtonElement[];
    expect(buttons[0].disabled).toBe(false);
    fireEvent.click(buttons[0]);
    expect(onClick).toHaveBeenCalledTimes(1);

    expect(buttons[3].disabled).toBe(true);
    cleanup();

    // …and the last crumb is a legitimate jump target when it carries a
    // handler: the current page is the question, which is not in this list.
    render(<Breadcrumb items={path()} />);
    expect((crumbButtons()[3] as HTMLButtonElement).disabled).toBe(false);
  });

  /**
   * The year is a qualifier on the course's name, not part of it. It has to
   * render as its own element, because `crumbs.map((c) => c.label)` is what the
   * PDF export and the AI hierarchy context consume — folding "· Yr 11" into
   * `label` would quietly rewrite the course name in both.
   */
  it('renders a badge outside the label, never inside it', () => {
    render(<Breadcrumb items={path([{ badge: 'Yr 11' }])} />);

    const label = screen.getByText('Business Studies');
    expect(label.textContent).toBe('Business Studies');

    const badge = screen.getByText('Yr 11');
    expect(badge).not.toBe(label);
    expect(label.contains(badge)).toBe(false);
    // Both still live in the same crumb.
    expect(crumbButtons()[0].contains(badge)).toBe(true);
  });

  /**
   * `items` is a fresh array literal on every parent render, and the parent
   * re-renders on every keystroke. Keyed on the array's identity this scrolled
   * the list to its right-hand end while a student typed, hiding the course
   * crumb on a narrow viewport. Keyed on the path's content it does not.
   */
  it('does not re-scroll when the path is rebuilt but unchanged', () => {
    const { rerender } = render(<Breadcrumb items={path()} />);
    expect(scrollSpy()).toHaveBeenCalledTimes(1);

    rerender(<Breadcrumb items={path()} />);
    rerender(<Breadcrumb items={path()} />);
    expect(scrollSpy()).toHaveBeenCalledTimes(1);

    // …but a genuinely different path still brings its deepest crumb into view.
    rerender(<Breadcrumb items={path([{ label: 'Legal Studies' }])} />);
    expect(scrollSpy()).toHaveBeenCalledTimes(2);
  });

  /**
   * The global `scroll-behavior: auto !important` is a CSS declaration and
   * cannot override an explicit `behavior` in a `scrollTo` options bag, so the
   * preference has to be read in the effect.
   */
  it('honours a reduced-motion preference', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;
    render(<Breadcrumb items={path()} />);
    expect(scrollSpy()).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }));

    cleanup();
    scrollSpy().mockClear();
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never;
    render(<Breadcrumb items={path()} />);
    expect(scrollSpy()).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }));
  });

  it('reads identically at either density — only the type scale differs', () => {
    const shape = (size: 'default' | 'dense') => {
      const { container, unmount } = render(
        <Breadcrumb items={path()} size={size} label="Syllabus path" />
      );
      const result = {
        crumbs: crumbButtons().map((b) => b.textContent),
        label: screen.getByRole('navigation').getAttribute('aria-label'),
        current: container.querySelectorAll('[aria-current]').length,
        // The separators are decoration; the path is already in the button text.
        chevrons: container.querySelectorAll('[aria-hidden="true"]').length,
      };
      unmount();
      return result;
    };

    expect(shape('dense')).toEqual(shape('default'));
    expect(shape('dense').crumbs).toHaveLength(4);
    expect(shape('dense').label).toBe('Syllabus path');
  });
});
