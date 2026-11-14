import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { WritingMetricsDashboard } from '../../components/WritingMetricsDashboard';
import { getRecommendedTime, getCommandTermInfo } from '../../data/commandTerms';
import type { Prompt } from '../../types';

/**
 * The clock on the live stats strip.
 *
 * It used to count a remaining figure down from a per-verb, per-mark budget
 * and stop dead at 00:00, where it sat red for the rest of the session — and
 * in Coach Mode it never started at all unless a student pressed Play, which
 * meant the one figure on the strip with a consequence was usually frozen at
 * its starting value. It now measures time spent: it starts itself on the
 * first keystroke, runs past the budget rather than into a wall, and stops
 * itself when nobody is writing so an abandoned tab cannot report a student
 * eight hours over a six-mark question.
 */

const prompt = (): Prompt =>
  ({
    id: 'p1',
    question: 'Describe the process of mitosis.',
    verb: 'DESCRIBE',
    totalMarks: 4,
    keywords: ['mitosis', 'chromosome'],
    markingCriteria: [],
  }) as unknown as Prompt;

const BUDGET = getRecommendedTime(4, getCommandTermInfo('DESCRIBE'));

const renderStrip = (props: Partial<React.ComponentProps<typeof WritingMetricsDashboard>> = {}) =>
  render(
    <WritingMetricsDashboard userAnswer="" prompt={prompt()} onAddWord={vi.fn()} {...props} />
  );

const clock = () => screen.getByRole('timer');

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const tick = (seconds: number) =>
  act(() => {
    vi.advanceTimersByTime(seconds * 1000);
  });

/**
 * Time passing WITH a student writing through it.
 *
 * Bare `tick` is a student who has walked away, and past three minutes the
 * clock parks itself — correctly. Anything testing the running clock over a
 * longer span has to keep typing, so this re-renders with a longer draft each
 * minute, which is what a keystroke looks like from this component.
 */
const writeFor = (rerender: (ui: React.ReactElement) => void, seconds: number) => {
  for (let elapsed = 0, words = 1; elapsed < seconds; words += 1) {
    const chunk = Math.min(60, seconds - elapsed);
    tick(chunk);
    elapsed += chunk;
    rerender(
      <WritingMetricsDashboard
        userAnswer={'mitosis '.repeat(words)}
        prompt={prompt()}
        onAddWord={vi.fn()}
      />
    );
  }
};

describe('the writing clock', () => {
  it('opens on the budget, and says where the budget comes from', () => {
    renderStrip();

    expect(clock().textContent).toBe(
      `${String(Math.floor(BUDGET / 60)).padStart(2, '0')}:${String(BUDGET % 60).padStart(2, '0')}`
    );
    // Before it starts, the caption explains the figure rather than repeating
    // it. It said `7 min for 4 marks` while it sat UNDER a clock reading 07:00;
    // now the two are set on one line, where saying the figure again would be
    // a plain repetition. The marks are the half the clock cannot say.
    expect(screen.getByText(/^guide for 4 marks$/i)).toBeTruthy();
  });

  // The Play button was the only way in, and almost nobody presses it.
  it('starts itself on the first keystroke', () => {
    const { rerender } = renderStrip();
    tick(3);
    expect(clock().textContent).toBe(
      `${String(Math.floor(BUDGET / 60)).padStart(2, '0')}:${String(BUDGET % 60).padStart(2, '0')}`
    );

    rerender(
      <WritingMetricsDashboard userAnswer="Mitosis begins" prompt={prompt()} onAddWord={vi.fn()} />
    );
    tick(3);
    expect(clock().textContent).not.toBe(
      `${String(Math.floor(BUDGET / 60)).padStart(2, '0')}:${String(BUDGET % 60).padStart(2, '0')}`
    );
    expect(screen.getByText(/left of/i)).toBeTruthy();
  });

  // A cliff at 00:00 is exactly where "you are two minutes over" starts being
  // the useful reading.
  it('runs past the budget instead of stopping at zero', () => {
    const { rerender } = renderStrip();
    rerender(
      <WritingMetricsDashboard userAnswer="Mitosis begins" prompt={prompt()} onAddWord={vi.fn()} />
    );

    writeFor(rerender, BUDGET + 65);

    expect(clock().textContent).toMatch(/^\+/);
    expect(screen.getByText(/^over \d+ min$/i)).toBeTruthy();
  });

  // Starting itself means it has to stop itself.
  it('stops for an abandoned draft in Coach Mode', () => {
    const { rerender } = renderStrip();
    rerender(
      <WritingMetricsDashboard userAnswer="Mitosis begins" prompt={prompt()} onAddWord={vi.fn()} />
    );

    tick(10);
    const running = clock().textContent;

    // Three minutes without a keystroke.
    tick(4 * 60);
    const parked = clock().textContent;
    expect(parked).not.toBe(running);
    expect(screen.getByText(/^paused$/i)).toBeTruthy();

    // And it stays parked rather than drifting on.
    tick(10 * 60);
    expect(clock().textContent).toBe(parked);
  });

  // Under exam conditions the clock does not stop while you think.
  it('never pauses itself in Exam Mode', () => {
    renderStrip({ userAnswer: 'Mitosis begins', writingMode: 'exam' });

    tick(30);
    const before = clock().textContent;
    tick(5 * 60);

    expect(clock().textContent).not.toBe(before);
    expect(screen.queryByText(/^paused$/i)).toBeNull();
  });

  // A deliberate pause is a decision, not an idle state.
  it('keeps a student-pressed pause across the next keystroke', () => {
    const { rerender } = renderStrip({ userAnswer: 'Mitosis' });
    tick(5);

    fireEvent.click(screen.getByRole('button', { name: /pause timer/i }));
    const parked = clock().textContent;

    rerender(
      <WritingMetricsDashboard
        userAnswer="Mitosis begins with prophase"
        prompt={prompt()}
        onAddWord={vi.fn()}
      />
    );
    tick(20);

    expect(clock().textContent).toBe(parked);
  });

  it('reads out as words, since a ticking display is not readable as digits', () => {
    renderStrip();
    // A whole-minute budget is spoken without a zero-second part.
    expect(clock().getAttribute('aria-label')).toMatch(/minutes.*left of.*guide/i);
  });

  // DesignSpec §2 rule 3: de-emphasis and urgency are jobs for tone, never for
  // an opacity animation sitting on a reading.
  it('marks urgency with tone, not a pulse', () => {
    const { rerender } = renderStrip();
    rerender(
      <WritingMetricsDashboard userAnswer="Mitosis begins" prompt={prompt()} onAddWord={vi.fn()} />
    );

    writeFor(rerender, BUDGET - 30);
    expect(clock().className).toMatch(/text-amber-/);
    expect(clock().className).not.toContain('animate-pulse');

    writeFor(rerender, 60);
    expect(clock().className).toMatch(/text-red-/);
    expect(clock().className).not.toContain('animate-pulse');
  });

  // DesignSpec §4: figures are telemetry and take the mono face. They also no
  // longer borrow band hues — sky and emerald meant Tiers 5 and 4 on a strip
  // where neither meant a band.
  it('sets the figure as telemetry', () => {
    renderStrip();
    expect(clock().className).toContain('font-mono');
    expect(clock().className).toContain('tabular-nums');
  });

  /**
   * Time spent survives a reload, because the draft does.
   *
   * The app already promises to remember a student's words across a refresh.
   * Handing back the full budget as though no time had passed made the lead
   * figure on this strip the one thing on the page that forgot.
   */
  describe('restored from the saved draft', () => {
    it('opens where the last session left off', () => {
      renderStrip({ elapsedSeconds: 120 });

      const remaining = BUDGET - 120;
      expect(clock().textContent).toBe(
        `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`
      );
      // Restored, not running: it waits for the next keystroke like any other
      // question, and says so rather than implying a clock nobody started.
      expect(screen.getByText(/^paused$/i)).toBeTruthy();
    });

    it('restores past the budget too', () => {
      renderStrip({ elapsedSeconds: BUDGET + 90 });

      expect(clock().textContent).toBe('+01:30');
      expect(screen.getByText(/^over \d+ min$/i)).toBeTruthy();
    });

    it('reports the running total upward for the draft to save', () => {
      const onElapsedChange = vi.fn();
      const { rerender } = renderStrip({ elapsedSeconds: 30, onElapsedChange });

      rerender(
        <WritingMetricsDashboard
          userAnswer="Mitosis begins"
          prompt={prompt()}
          onAddWord={vi.fn()}
          elapsedSeconds={30}
          onElapsedChange={onElapsedChange}
        />
      );
      tick(5);

      expect(onElapsedChange).toHaveBeenLastCalledWith(35);
    });

    // Switching INTO Exam Mode is a fresh attempt under exam conditions, and
    // starting it part-spent would make the simulation a lie. Arriving at the
    // question is the opposite case, which is why the two are told apart.
    it('starts clean when the student switches into Exam Mode', () => {
      const { rerender } = renderStrip({ elapsedSeconds: 120 });

      rerender(
        <WritingMetricsDashboard
          userAnswer=""
          prompt={prompt()}
          onAddWord={vi.fn()}
          elapsedSeconds={120}
          writingMode="exam"
        />
      );

      expect(clock().textContent).toBe(
        `${String(Math.floor(BUDGET / 60)).padStart(2, '0')}:${String(BUDGET % 60).padStart(2, '0')}`
      );
    });

    // …but a reload mid-exam is an arrival, not a switch, and the exam clock is
    // the one where the elapsed time matters most.
    it('restores an exam clock that was already running', () => {
      renderStrip({ elapsedSeconds: 60, writingMode: 'exam' });

      const remaining = BUDGET - 60;
      expect(clock().textContent).toBe(
        `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`
      );
    });
  });
});

const formatted = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

/** The most recent total the clock reported upward. */
const lastReported = (fn: ReturnType<typeof vi.fn>) =>
  (fn.mock.calls.at(-1) as [number] | undefined)?.[0];

describe('the writing clock, measured against the wall clock', () => {
  // Exam Mode has no Pause, Play or Reset: the clock does not stop while you think.
  it('has no Pause, Play or Reset control in Exam Mode', () => {
    renderStrip({ writingMode: 'exam' });

    expect(screen.queryByRole('button', { name: /pause timer|start timer/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /reset timer/i })).toBeNull();
  });

  it('keeps Start and Reset in Coach Mode', () => {
    renderStrip();

    expect(screen.getByRole('button', { name: /start timer/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /reset timer/i })).toBeTruthy();
  });

  // A hidden tab is throttled, and a sleeping laptop stops its timers. The
  // interval fires once for a minute that really passed, and the clock must
  // still say a minute.
  it('counts real time in Exam Mode when the ticks are throttled', () => {
    const onElapsedChange = vi.fn();
    renderStrip({ writingMode: 'exam', onElapsedChange });

    vi.setSystemTime(Date.now() + 60_000);
    tick(1);

    expect(lastReported(onElapsedChange)).toBeGreaterThanOrEqual(60);
  });

  it('catches up the moment a hidden tab is shown again', () => {
    const onElapsedChange = vi.fn();
    renderStrip({ writingMode: 'exam', onElapsedChange });

    vi.setSystemTime(Date.now() + 90_000);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(lastReported(onElapsedChange)).toBeGreaterThanOrEqual(90);
    delete (document as { visibilityState?: unknown }).visibilityState;
  });

  // A laptop asleep for an hour is not an hour of writing: the clock stops at
  // the moment the idle limit began.
  it('parks at the idle limit in Coach Mode, not at the hour it slept through', () => {
    const onElapsedChange = vi.fn();
    const { rerender } = renderStrip({ onElapsedChange });
    rerender(
      <WritingMetricsDashboard
        userAnswer="Mitosis begins"
        prompt={prompt()}
        onAddWord={vi.fn()}
        onElapsedChange={onElapsedChange}
      />
    );

    vi.setSystemTime(Date.now() + 60 * 60 * 1000);
    tick(1);

    // Within a second of the three-minute limit, and nowhere near the hour.
    expect(lastReported(onElapsedChange)).toBeGreaterThanOrEqual(179);
    expect(lastReported(onElapsedChange)).toBeLessThanOrEqual(180);
    expect(screen.getByText(/^paused$/i)).toBeTruthy();
  });

  // The workspace hands over its answer a second late. For that second after a
  // question switch it still holds the previous question's words, and those are
  // not writing on the new question.
  it('does not start on a new question that is still holding the last question’s words', () => {
    const first = { ...prompt(), userDraft: 'Mitosis begins' } as Prompt;
    const second = { ...prompt(), id: 'p2', userDraft: '' } as Prompt;
    const { rerender } = render(
      <WritingMetricsDashboard userAnswer="Mitosis begins" prompt={first} onAddWord={vi.fn()} />
    );

    rerender(
      <WritingMetricsDashboard userAnswer="Mitosis begins" prompt={second} onAddWord={vi.fn()} />
    );
    tick(30);
    expect(screen.getByText(/^guide for 4 marks$/i)).toBeTruthy();

    rerender(
      <WritingMetricsDashboard
        userAnswer="Mitosis begins again"
        prompt={second}
        onAddWord={vi.fn()}
      />
    );
    tick(3);
    expect(screen.getByText(/^left of/i)).toBeTruthy();
  });

  // Leaving Exam is not a fresh start: the total the exam reached carries back
  // into Coach, where the draft will save it.
  it('hands the exam total back when the student leaves Exam Mode', () => {
    const onElapsedChange = vi.fn();
    const { rerender } = renderStrip({ writingMode: 'exam', onElapsedChange });

    tick(90);
    rerender(
      <WritingMetricsDashboard
        userAnswer=""
        prompt={prompt()}
        onAddWord={vi.fn()}
        onElapsedChange={onElapsedChange}
      />
    );

    expect(clock().textContent).toBe(formatted(BUDGET - 90));
    expect(screen.getByText(/^paused$/i)).toBeTruthy();
    expect(lastReported(onElapsedChange)).toBe(90);
  });

  // Spoken clock grammar: both units pluralise, and a zero unit is not spoken.
  it('pluralises both units when it reads the time out', () => {
    renderStrip({ elapsedSeconds: BUDGET - 61 });

    expect(clock().getAttribute('aria-label')).toMatch(/^1 minute 1 second left of/);
  });

  it('reads a time under a minute without a zero minute', () => {
    renderStrip({ elapsedSeconds: BUDGET - 45 });

    expect(clock().getAttribute('aria-label')).toMatch(/^45 seconds left of/);
  });

  it('reads an overrun in the same grammar', () => {
    renderStrip({ elapsedSeconds: BUDGET + 60 });

    expect(clock().getAttribute('aria-label')).toMatch(/^1 minute over/);
  });
});

describe('the budget announcement', () => {
  it('is said once, when a Coach Mode answer reaches the budget', () => {
    const { rerender } = renderStrip();
    const status = () => screen.getByRole('status');
    rerender(
      <WritingMetricsDashboard userAnswer="Mitosis begins" prompt={prompt()} onAddWord={vi.fn()} />
    );

    writeFor(rerender, BUDGET - 10);
    expect(status().textContent).toBe('');

    writeFor(rerender, 30);
    expect(status().textContent).toBe('Suggested time reached.');

    writeFor(rerender, 120);
    expect(status().textContent).toBe('Suggested time reached.');
  });

  it('uses the exam wording in Exam Mode, and clears when the mode changes', () => {
    const { rerender } = renderStrip({ writingMode: 'exam' });

    tick(BUDGET + 1);
    expect(screen.getByRole('status').textContent).toBe('Time is up for this question.');

    rerender(<WritingMetricsDashboard userAnswer="" prompt={prompt()} onAddWord={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('does not announce a total that was already past the budget when the question opened', () => {
    renderStrip({ elapsedSeconds: BUDGET + 90 });

    expect(screen.getByRole('status').textContent).toBe('');
  });
});
