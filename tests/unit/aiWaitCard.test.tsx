import { describe, it, expect, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, cleanup, act } from '@testing-library/react';
import LoadingIndicator from '../../components/LoadingIndicator';
import EvaluationProgressBar from '../../components/EvaluationProgressBar';
import AiWaitGlyph, { WAIT_INK } from '../../components/AiWaitGlyph';
import WaitNoteFigure from '../../components/WaitNoteFigure';
import { emitEvalProgress } from '../../services/aiCore';
import { VERB_TIPS, WAIT_TIPS, waitNotes } from '../../utils/waitTips';
import type { AiTaskType } from '../../components/LoadingIndicator';
import { HSC_RESULTS_FACTS } from '../../data/hscResultsFacts';
import { acquireAiBusy } from '../../utils/aiBusySignal';

/**
 * The AI wait card, as a reader meets it.
 *
 * It used to show the same three spinning rings for every task, a list of
 * invented pipeline steps ("Optimising heuristic constraints…"), and a bar
 * that crept to 98% and sat there. What these pin is what replaced that:
 * a drawing per task, a note worth reading, and a clock that only states an
 * expected time when someone actually gave one.
 */

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.classList.remove('ai-busy');
});

const tipShown = (task: AiTaskType): boolean =>
  waitNotes(task).some((note) => screen.queryByText(note.text) !== null);

const CHART_TITLE = 'How 2025 HSC results fell';

describe('LoadingIndicator', () => {
  it('shows a note chosen for the task being waited on', () => {
    render(<LoadingIndicator task="evaluation" message="Marking your response" />);
    expect(tipShown('evaluation')).toBe(true);
  });

  it('rotates HSC numbers in with the advice, labelled with their year', () => {
    vi.useFakeTimers();
    // Start the rotation on the first note, so the next one is known.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { container } = render(<LoadingIndicator task="evaluation" message="Marking" />);
    const first = waitNotes('evaluation')[0];
    const second = waitNotes('evaluation')[1];
    expect(second.kind).toBe('fact');
    expect(container.querySelector('blockquote')?.textContent).toBe(first.text);
    act(() => void vi.advanceTimersByTime(9_000));
    expect(container.querySelector('blockquote')?.textContent).toBe(second.text);
    expect(screen.getByText('HSC in numbers, 2025')).toBeTruthy();
    expect(HSC_RESULTS_FACTS.map((f) => f.text)).toContain(second.text);
  });

  it('shows the 2025 results chart on a reading wait', () => {
    render(<LoadingIndicator task="enrichment" message="Reading the syllabus" />);
    expect(screen.getByRole('figure', { name: CHART_TITLE })).toBeTruthy();
  });

  it('shows the chart on a default AI wait, not on a plain data load', () => {
    const { unmount } = render(<LoadingIndicator message="Discovering terminology..." />);
    expect(screen.getByText(CHART_TITLE)).toBeTruthy();
    unmount();
    render(<LoadingIndicator messages={['Loading usage data…']} duration={2} />);
    expect(screen.queryByText(CHART_TITLE)).toBeNull();
  });

  it('never shows the chart while a student’s response is being marked', () => {
    render(<LoadingIndicator task="evaluation" message="Marking your response" />);
    expect(screen.queryByText(CHART_TITLE)).toBeNull();
  });

  it('never shows the chart on a generation wait', () => {
    render(<LoadingIndicator task="generation" message="Writing" />);
    expect(screen.queryByText(CHART_TITLE)).toBeNull();
  });

  it('keeps the note out of the live region, so it is not announced on its own clock', () => {
    const { container } = render(<LoadingIndicator task="generation" message="Writing" />);
    const region = screen.getByRole('status');
    const note = container.querySelector('blockquote');
    expect(note).not.toBeNull();
    expect(region.contains(note)).toBe(false);
  });

  it('gives a plain data load no note and no engine line', () => {
    render(<LoadingIndicator messages={['Loading usage data…']} duration={2} />);
    expect(document.querySelector('blockquote')).toBeNull();
    expect(screen.queryByText(/working with/i)).toBeNull();
  });

  it('only states an expected time when the caller gave one', () => {
    vi.useFakeTimers();
    render(<LoadingIndicator task="evaluation" message="Marking" duration={20} />);
    act(() => void vi.advanceTimersByTime(3000));
    expect(screen.getByText(/usually about 20s/i)).toBeTruthy();
    cleanup();

    render(<LoadingIndicator task="evaluation" message="Marking" />);
    act(() => void vi.advanceTimersByTime(3000));
    expect(screen.queryByText(/usually about/i)).toBeNull();
  });

  it('says when a wait has run past its estimate instead of sitting at 98%', () => {
    vi.useFakeTimers();
    render(<LoadingIndicator task="generation" message="Writing" duration={4} />);
    act(() => void vi.advanceTimersByTime(10_000));
    expect(screen.getByText(/taking longer than usual/i)).toBeTruthy();
  });

  it('draws the task, not a generic spinner: six band rungs for marking', () => {
    const { container } = render(<LoadingIndicator task="evaluation" message="Marking" />);
    // The ladder's rungs are coloured by band; the old rings had none.
    const rungs = Array.from(container.querySelectorAll('span')).filter((el) =>
      (el as HTMLElement).style.backgroundColor.startsWith('rgb')
    );
    expect(rungs.length).toBeGreaterThanOrEqual(6);
    expect(container.querySelector('.animate-spin-slow')).toBeNull();
  });

  it('says what failed in plain words', () => {
    render(<LoadingIndicator isError error="The AI service did not reply in time." />);
    expect(screen.getByText('The AI request did not finish')).toBeTruthy();
    expect(screen.getByText('The AI service did not reply in time.')).toBeTruthy();
  });

  it('leans the background in while it is on screen, and lets go after', () => {
    const { unmount } = render(<LoadingIndicator task="evaluation" message="Marking" />);
    expect(document.body.classList.contains('ai-busy')).toBe(true);
    unmount();
    expect(document.body.classList.contains('ai-busy')).toBe(false);
  });
});

describe('aiBusySignal', () => {
  it('stays busy until the last of two overlapping waits ends', () => {
    const releaseA = acquireAiBusy();
    const releaseB = acquireAiBusy();
    releaseA();
    expect(document.body.classList.contains('ai-busy')).toBe(true);
    releaseA(); // a second release of the same wait must not end the other
    expect(document.body.classList.contains('ai-busy')).toBe(true);
    releaseB();
    expect(document.body.classList.contains('ai-busy')).toBe(false);
  });
});

describe('EvaluationProgressBar', () => {
  it('reports the real fallback, naming the model it switched to', () => {
    render(<EvaluationProgressBar />);
    act(() =>
      emitEvalProgress({ phase: 'fallback', message: 'Switching to Gemini Flash (high demand)...' })
    );
    expect(screen.getByRole('status').textContent).toMatch(
      /switching to gemini flash \(high demand\)/i
    );
  });

  it('shows a marking note while it waits', () => {
    render(<EvaluationProgressBar />);
    expect(tipShown('evaluation')).toBe(true);
  });

  it('is the shared veil, with the writing card inner radius at its bottom corners', () => {
    render(<EvaluationProgressBar />);
    const veil = screen.getByRole('status').closest('[role="presentation"]') as HTMLElement;

    // The same recipe as every other AI wait: a near-opaque surface sheet, with
    // no blur, and the card's inner radius, not the outer one. A bare white here
    // is the seam that used to show on the card.
    expect(veil.className).toContain('absolute inset-0');
    expect(veil.className).toContain('rounded-b-surface-inner');
    expect(veil.className).not.toContain('backdrop-blur');
    expect(veil.className).toContain('bg-surface/95');
    expect(veil.className).not.toMatch(/(^|\s)bg-white(\s|$)/);
    expect(veil.className).not.toContain('rounded-[inherit]');
  });

  it('draws its bar and its glyph in the accent token, not the indigo literal', () => {
    const { container } = render(<EvaluationProgressBar />);

    const bar = container.querySelector('.animate-progress-indeterminate') as HTMLElement;
    expect(bar.className).toContain('bg-[rgb(var(--color-accent))]');
    expect(bar.className).not.toContain('indigo');
    expect(container.innerHTML).not.toMatch(/6366f1|99,\s*102,\s*241/i);
  });
});

describe('the command verb tip', () => {
  const adviceTexts = (task: AiTaskType, verb?: string): string[] =>
    waitNotes(task, verb)
      .filter((note) => note.kind === 'advice')
      .map((note) => note.text);

  it('shows the describe tip first, and no other verb’s tip', () => {
    render(<EvaluationProgressBar verb="DESCRIBE" />);
    expect(document.querySelector('blockquote')?.textContent).toBe(VERB_TIPS.describe);

    const texts = adviceTexts('evaluation', 'DESCRIBE');
    expect(texts[0]).toBe(VERB_TIPS.describe);
    const otherVerbTips = Object.entries(VERB_TIPS)
      .filter(([verb]) => verb !== 'describe')
      .map(([, tip]) => tip);
    for (const tip of otherVerbTips) expect(texts).not.toContain(tip);
  });

  it('gives an unknown verb only the general tips', () => {
    expect(adviceTexts('evaluation', 'FROBNICATE')).toEqual(WAIT_TIPS.evaluation);
    expect(adviceTexts('evaluation')).toEqual(WAIT_TIPS.evaluation);
    const texts = adviceTexts('evaluation', 'FROBNICATE');
    for (const tip of Object.values(VERB_TIPS)) expect(texts).not.toContain(tip);
  });

  it('matches the verb case-insensitively and ignores surrounding space', () => {
    expect(adviceTexts('evaluation', '  describe ')[0]).toBe(VERB_TIPS.describe);
    expect(adviceTexts('evaluation', 'Justify')[0]).toBe(VERB_TIPS.justify);
    expect(adviceTexts('evaluation', 'CRITICALLY   ANALYSE')[0]).toBe(
      VERB_TIPS['critically analyse']
    );
  });

  it('does not match keys inherited from the object prototype', () => {
    expect(adviceTexts('evaluation', 'constructor')).toEqual(WAIT_TIPS.evaluation);
    expect(adviceTexts('evaluation', 'toString')).toEqual(WAIT_TIPS.evaluation);
  });

  it('leaves the other tasks’ notes alone whatever verb is passed', () => {
    expect(waitNotes('generation', 'DESCRIBE')).toEqual(waitNotes('generation'));
    expect(waitNotes('enrichment', 'DESCRIBE')).toEqual(waitNotes('enrichment'));
  });

  it('keeps the advice and HSC numbers interleaved with a verb tip leading', () => {
    const notes = waitNotes('evaluation', 'IDENTIFY');
    expect(notes[0].kind).toBe('advice');
    expect(notes[1].kind).toBe('fact');
    expect(notes[2].kind).toBe('advice');
  });

  it('keys every verb tip in lower case, so lookups have one spelling', () => {
    for (const key of Object.keys(VERB_TIPS)) expect(key).toBe(key.toLowerCase());
  });

  it('gives each verb its own tip text, so one verb’s wording never appears under another', () => {
    // 'account' and 'account for' are the same verb under two spellings, so they
    // share one tip; every other key has its own sentence.
    const tips = Object.entries(VERB_TIPS).filter(([verb]) => verb !== 'account for');
    const unique = new Set(tips.map(([, tip]) => tip));
    expect(unique.size).toBe(tips.length);
  });
});

describe('EvaluationProgressBar on a phone', () => {
  const originalScrollIntoView = Element.prototype.scrollIntoView;
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView;
    window.matchMedia = originalMatchMedia;
  });

  /** Gives the content block (and every other element) one fixed viewport rect. */
  const placeOnScreen = (top: number, bottom: number): void => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top,
      bottom,
      left: 0,
      right: 390,
      width: 390,
      height: bottom - top,
      x: 0,
      y: top,
      toJSON: () => ({}),
    } as DOMRect);
  };

  it('brings its heading out from under the header, centring the content block', () => {
    placeOnScreen(-300, 200);
    const seen: Element[] = [];
    Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
      seen.push(this);
    });

    render(<EvaluationProgressBar />);

    expect(seen).toHaveLength(1);
    // The content block holds the heading and bar; the veil does not, so
    // centring the veil (taller than the screen) would not show the heading.
    expect(seen[0].contains(screen.getByText('Marking your response'))).toBe(true);
    expect(seen[0].getAttribute('role')).toBeNull();
  });

  it('scrolls smoothly, unless the reader asks for reduced motion', () => {
    placeOnScreen(-300, 200);
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;

    const { unmount } = render(<EvaluationProgressBar />);
    expect(scroll).toHaveBeenLastCalledWith({ block: 'center', behavior: 'smooth' });
    unmount();

    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    render(<EvaluationProgressBar />);
    expect(scroll).toHaveBeenLastCalledWith({ block: 'center', behavior: 'auto' });
  });

  it('leaves a loader that is already clear of the header where it is', () => {
    placeOnScreen(200, 600);
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;

    render(<EvaluationProgressBar />);
    expect(scroll).not.toHaveBeenCalled();
  });

  it('does not throw where scrollIntoView is missing', () => {
    placeOnScreen(-300, 200);
    Element.prototype.scrollIntoView =
      undefined as unknown as typeof Element.prototype.scrollIntoView;
    expect(() => render(<EvaluationProgressBar />)).not.toThrow();
  });
});

describe('the wait ink', () => {
  it('is the app accent token, so both themes move it with the rest of the chrome', () => {
    expect(WAIT_INK).toBe('rgb(var(--color-accent))');
  });

  it('sets the glyph ink through style, because a presentation attribute cannot read var()', () => {
    const { container } = render(<AiWaitGlyph task="generation" accent={WAIT_INK} />);

    const stroked = container.querySelector('path') as SVGPathElement;
    expect(stroked).toBeTruthy();
    expect(stroked.getAttribute('stroke')).toBeNull();
    expect(stroked.style.stroke).toBe(WAIT_INK);
  });

  it('mixes the margin rule from the ink rather than appending an alpha to it', () => {
    const { container } = render(
      <WaitNoteFigure
        note={{ kind: 'advice', text: 'Name the claim before the evidence.' }}
        accent={WAIT_INK}
      />
    );

    const figure = container.querySelector('figure') as HTMLElement;
    expect(figure.style.borderColor).toContain('color-mix(in srgb, rgb(var(--color-accent)) 40%');
  });
});
