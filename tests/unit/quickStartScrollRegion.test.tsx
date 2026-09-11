import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import QuickStartModal from '../../components/QuickStartModal';
import type { User } from '../../types';

/**
 * The guide every new account reads first has to be readable by keyboard.
 *
 * Its body scrolls, and the "Getting started" tab is a list of steps with
 * nothing interactive in it — the tabs sit above the scroller and the buttons
 * below it. So a keyboard user could reach everything AROUND the guide and
 * never scroll the guide itself (axe: `scrollable-region-focusable`).
 *
 * The e2e sweep catches this too, but only by opening the modal in a browser
 * and running axe over it. This one names the requirement directly, and does
 * not depend on a trigger button keeping its label.
 */

vi.mock('../../services/geminiService', () => ({}));

afterEach(cleanup);

const user = {
  id: 'u1',
  username: 'student',
  displayName: 'Student',
  role: 'user',
} as unknown as User;

const open = () =>
  render(<QuickStartModal isOpen onClose={() => {}} user={user} onOpenLegal={() => {}} />);

/** The scrolling panel: the one element carrying `overflow-y-auto`. */
const scrollPanel = (): HTMLElement => {
  const panel = document.querySelector('.overflow-y-auto');
  if (!panel) throw new Error('no scrolling panel rendered');
  return panel as HTMLElement;
};

describe('the quick start guide’s scrolling body', () => {
  it('takes keyboard focus, so the arrow keys can scroll it', () => {
    open();
    expect(scrollPanel().tabIndex).toBe(0);
  });

  it('says which panel has focus, since three tabs share one container', () => {
    open();
    expect(scrollPanel().getAttribute('role')).toBe('region');
    expect(scrollPanel().getAttribute('aria-label')).toMatch(/getting started/i);

    // Switching tabs relabels it rather than leaving the old name behind.
    fireEvent.click(screen.getByRole('button', { name: /free vs plus/i }));
    expect(scrollPanel().getAttribute('aria-label')).toMatch(/free vs plus/i);
  });

  it('still has nothing focusable of its own on the guide tab', () => {
    // The reason the panel needs a tabindex at all. If this ever stops being
    // true — a link lands in the steps — the tabindex becomes belt-and-braces
    // rather than the only way in, and this test is the record of why.
    open();
    expect(scrollPanel().querySelectorAll('button, a[href], input, select, textarea').length).toBe(
      0
    );
  });
});
