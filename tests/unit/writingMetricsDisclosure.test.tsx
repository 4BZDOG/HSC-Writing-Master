import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WritingMetricsDashboard } from '../../components/WritingMetricsDashboard';
import type { Prompt } from '../../types';

/**
 * The live writing stats panel opens from its whole header row, not from its
 * small "Terms and structure" pill.
 *
 * The clock and the word count are the big thing on the row, and a student who
 * presses them expects the panel to open, as every other panel below the
 * writing area does. The disclosure is a real button laid over the row as a
 * SIBLING of the timer and the controls. These tests pin the structure that
 * makes that safe: the timer keeps its role and is not inside a button, Pause
 * and Reset are not inside the disclosure, and pressing them does not open the
 * panel.
 *
 * Which pixel the stretched button sits under is a layout fact jsdom cannot
 * compute, so the hit-test (a press on the clock lands on the disclosure) is
 * pinned in Playwright, in `tests/e2e/workspace-chrome.spec.ts`.
 */

vi.mock('../../services/geminiService', () => ({
  explainOutcomeInContext: vi.fn(),
  generateRubricForPrompt: vi.fn(),
}));

afterEach(cleanup);

const prompt = (): Prompt =>
  ({
    id: 'p1',
    question: 'Describe the process of mitosis.',
    verb: 'DESCRIBE',
    totalMarks: 4,
    keywords: ['mitosis', 'chromosome'],
    markingCriteria: [],
  }) as unknown as Prompt;

const renderStrip = (props: Partial<React.ComponentProps<typeof WritingMetricsDashboard>> = {}) =>
  render(
    <WritingMetricsDashboard
      userAnswer="Mitosis begins"
      prompt={prompt()}
      onAddWord={vi.fn()}
      {...props}
    />
  );

/** The disclosure: the one button that names the writing metrics panel. */
const disclosure = () => screen.getByRole('button', { name: /writing metrics/i });
const pause = () => screen.getByRole('button', { name: /pause timer|start timer/i });
const reset = () => screen.getByRole('button', { name: /reset timer/i });

describe('the live writing stats disclosure', () => {
  it('is a real button that starts shut, and says so', () => {
    renderStrip();

    expect(disclosure().tagName).toBe('BUTTON');
    expect(disclosure().getAttribute('aria-expanded')).toBe('false');
    expect(disclosure().getAttribute('aria-label')).toBe('Expand writing metrics');
  });

  it('flips aria-expanded and its name each time it is pressed', async () => {
    const user = userEvent.setup();
    renderStrip();

    await user.click(disclosure());
    expect(disclosure().getAttribute('aria-expanded')).toBe('true');
    expect(disclosure().getAttribute('aria-label')).toBe('Collapse writing metrics');

    await user.click(disclosure());
    expect(disclosure().getAttribute('aria-expanded')).toBe('false');
    expect(disclosure().getAttribute('aria-label')).toBe('Expand writing metrics');
  });

  it('controls the body it names, so the link is real and not just attributed', () => {
    const { container } = renderStrip();

    const body = document.getElementById(disclosure().getAttribute('aria-controls') ?? '');
    expect(body).toBeTruthy();
    expect(container.contains(body!)).toBe(true);
  });

  it('opens and shuts from the keyboard: Enter and Space on the focused disclosure', async () => {
    const user = userEvent.setup();
    renderStrip();

    disclosure().focus();
    await user.keyboard('{Enter}');
    expect(disclosure().getAttribute('aria-expanded')).toBe('true');

    await user.keyboard(' ');
    expect(disclosure().getAttribute('aria-expanded')).toBe('false');
  });

  it('comes before the timer controls in reading order, and the controls are not inside it', () => {
    renderStrip();

    expect(disclosure().contains(pause())).toBe(false);
    expect(disclosure().contains(reset())).toBe(false);
    expect(
      disclosure().compareDocumentPosition(pause()) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(pause().closest('button')).toBe(pause());
    expect(reset().closest('button')).toBe(reset());
  });

  it('keeps the timer as a timer, not as a child of a button', () => {
    renderStrip();

    const timer = screen.getByRole('timer');
    expect(timer.closest('button')).toBeNull();
    expect(disclosure().contains(timer)).toBe(false);
  });

  it('does not open the panel when Pause is pressed', async () => {
    const user = userEvent.setup();
    renderStrip();

    await user.click(pause());

    expect(disclosure().getAttribute('aria-expanded')).toBe('false');
  });

  it('does not open the panel when Reset is pressed', async () => {
    const user = userEvent.setup();
    renderStrip();

    await user.click(reset());

    expect(disclosure().getAttribute('aria-expanded')).toBe('false');
  });

  it('does not shut an open panel when Pause is pressed', async () => {
    const user = userEvent.setup();
    renderStrip();

    await user.click(disclosure());
    expect(disclosure().getAttribute('aria-expanded')).toBe('true');

    await user.click(pause());
    expect(disclosure().getAttribute('aria-expanded')).toBe('true');
  });

  it('is not a control in Exam Mode: there is no disclosure, and the panel never opens', () => {
    renderStrip({ writingMode: 'exam' });

    expect(screen.queryByRole('button', { name: /writing metrics/i })).toBeNull();
    expect(document.querySelector('[aria-expanded]')).toBeNull();
    // The clock is still there; Pause and Reset are not (see writingTimer).
    expect(screen.getByRole('timer')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /pause timer|start timer/i })).toBeNull();
  });

  it('keeps the pill as a visual label, not a second tab stop with its own name', () => {
    renderStrip();

    const pill = screen.getByText('Terms and structure').closest('span[aria-hidden="true"]');
    expect(pill).toBeTruthy();
    expect(screen.queryByRole('button', { name: /terms and structure/i })).toBeNull();
  });

  // The panel keeps its name open or shut, and its chevron turns like every
  // other panel's: down when shut, up when open.
  it('names the panel the same whether it is shut or open', async () => {
    const user = userEvent.setup();
    renderStrip();

    expect(screen.getByText('Terms and structure')).toBeTruthy();
    await user.click(disclosure());
    expect(screen.getByText('Terms and structure')).toBeTruthy();
    expect(screen.queryByText('Hide')).toBeNull();
  });

  it('points its chevron down when shut and turns it up when open', async () => {
    const user = userEvent.setup();
    renderStrip();
    // The chevron is the last icon in the aria-hidden pill beside the button.
    const chevron = () =>
      screen
        .getByText('Terms and structure')
        .closest('span[aria-hidden="true"]')
        ?.querySelector('svg:last-of-type') ?? null;

    expect(chevron()?.getAttribute('class')).not.toContain('rotate-180');
    expect(chevron()?.getAttribute('class')).not.toContain('-rotate-90');

    await user.click(disclosure());
    expect(chevron()?.getAttribute('class')).toContain('rotate-180');
  });

  // The target block was a third progress figure under a header that already
  // states words against target, so it is gone.
  it('has no target standard or capacity figure in the open panel', async () => {
    const user = userEvent.setup();
    renderStrip();
    await user.click(disclosure());

    expect(screen.queryByText(/Target Standard/i)).toBeNull();
    expect(screen.queryByText(/Capacity/)).toBeNull();
  });

  it('counts key and supporting terms, not "more"', async () => {
    const user = userEvent.setup();
    renderStrip({ userAnswer: 'Mitosis begins' });
    await user.click(disclosure());

    // "mitosis" is named by the question and is in the draft; "chromosome" is
    // a supporting term and is not. The chip says so in the panel's vocabulary.
    expect(screen.getByText('1/1 key · 0/1 supporting')).toBeTruthy();
  });

  it('labels the words-per-sentence tile in full and keeps the helper text readable', async () => {
    const user = userEvent.setup();
    renderStrip({ userAnswer: 'Mitosis begins. It divides the nucleus.' });
    await user.click(disclosure());

    expect(screen.getByText('Words per sentence')).toBeTruthy();
    expect(screen.queryByText('Avg Words')).toBeNull();
    expect(screen.getByText(/Longest sentence:/).className).not.toContain('text-[10px]');
    expect(screen.getByText(/Longest sentence:/).className).toContain('text-xs');
  });

  it('keeps section heads in the neutral ink, not emerald or sky', async () => {
    const user = userEvent.setup();
    const { container } = renderStrip();
    await user.click(disclosure());

    const heads = Array.from(container.querySelectorAll('h4')).map((h) => h.parentElement);
    expect(heads.length).toBe(2);
    for (const head of heads) {
      const icon = head!.querySelector('svg');
      expect(icon?.getAttribute('class')).toContain('text-slate-600');
      expect(icon?.getAttribute('class')).not.toMatch(/emerald|sky/);
    }
  });
});
