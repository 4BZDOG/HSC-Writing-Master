import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react';
import ImprovementReviewModal from '../../components/ImprovementReviewModal';
import type { Prompt, PromptVerb } from '../../types';

/**
 * The "what changed" strip, the replay that watches the marker's edits go in,
 * the hover that links an edit in the margin to the same edit on the page, and
 * the three-zone layout that gives a wide screen its room.
 *
 * Timers are fake, so each edit's step is advanced by hand. The reduced-motion
 * path is pinned by stubbing `matchMedia`, which jsdom does not provide.
 */

const prompt: Prompt = {
  id: 'p1',
  question: 'Analyse the impact of caching on system performance.',
  totalMarks: 8,
  verb: 'Analyse' as PromptVerb,
  keywords: ['cache hit ratio', 'latency'],
  sampleAnswers: [],
} as unknown as Prompt;

const ORIGINAL = 'Caching stores data. It makes the system faster.';
const IMPROVED =
  'Caching stores frequently requested data. It makes the system faster by reducing latency.';

/** Three separate edits, two→alpha, seven→beta, twelve→gamma, with four kept words between. */
const THREE_ORIGINAL = 'one two three four five six seven eight nine ten eleven twelve';
const THREE_REVISED = 'one alpha three four five six beta eight nine ten eleven gamma';

const STEP = 1600;

const renderModal = (over: Partial<React.ComponentProps<typeof ImprovementReviewModal>> = {}) => {
  const onApply = vi.fn();
  const onClose = vi.fn();
  render(
    <ImprovementReviewModal
      isOpen
      onClose={onClose}
      improvedAnswer={IMPROVED}
      originalAnswer={ORIGINAL}
      originalPrompt={prompt}
      targetBand={4}
      targetMark={5}
      originalMark={4}
      onApply={onApply}
      {...over}
    />
  );
  return { onApply, onClose };
};

const threeEdits = {
  originalAnswer: THREE_ORIGINAL,
  improvedAnswer: THREE_REVISED,
};

/** Whether the reduced-motion query matches, for the component's own check. */
const stubReducedMotion = (reduce: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
};

/** The page's marks that wear the focus ring, by their text. */
const ringed = () =>
  Array.from(document.body.querySelectorAll('mark'))
    .filter((m) => m.className.includes('ring-2'))
    .map((m) => m.textContent?.trim());

const startReplay = () =>
  fireEvent.click(screen.getByRole('button', { name: /Watch the marker.s edits/ }));

/**
 * Lets the replay run for `steps` edits. Each step is its own `act`: a timer
 * schedules the next one only after React has re-rendered, as it does in a
 * browser, so one `act` around several steps would run only the first.
 */
const runSteps = (steps: number) => {
  for (let i = 0; i < steps; i++) {
    act(() => {
      vi.advanceTimersByTime(STEP);
    });
  }
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe('what changed strip', () => {
  const region = () => screen.getByRole('region', { name: 'What changed' });

  it('states the words added, cut and kept from the diff', () => {
    renderModal();

    // Five words added, none cut, every original word kept: 8 → 13 words.
    expect(within(region()).getByText('+5')).toBeTruthy();
    expect(within(region()).getByText('0')).toBeTruthy();
    expect(within(region()).getByText('100%')).toBeTruthy();
    expect(within(region()).getByText('of your words kept')).toBeTruthy();
    expect(within(region()).getByText('words added')).toBeTruthy();
    expect(within(region()).getByText('words cut')).toBeTruthy();
    expect(within(region()).getByText('8 → 13 words')).toBeTruthy();
  });

  it('counts cut words as minus, and keeps the share of the student’s words', () => {
    renderModal(threeEdits);

    // Three cut and three added, with nine of the twelve words kept: 75%.
    expect(within(region()).getByText('−3')).toBeTruthy();
    expect(within(region()).getByText('+3')).toBeTruthy();
    expect(within(region()).getByText('75%')).toBeTruthy();
    expect(within(region()).getByText(/Most of this is still your answer/)).toBeTruthy();
  });

  it('asks the student to check each edit when most of the wording is new', () => {
    renderModal({
      originalAnswer: 'alpha beta gamma delta',
      improvedAnswer: 'one two three four',
    });

    expect(within(region()).getByText(/Most of the wording is new/)).toBeTruthy();
  });

  it('reassures a student when most of their own words survive', () => {
    renderModal();

    expect(within(region()).getByText(/Most of this is still your answer/)).toBeTruthy();
  });

  it('lists the syllabus terms the revision brought in, as chips', () => {
    renderModal();

    const chip = within(region()).getByText('latency');
    expect(chip.tagName).toBe('SPAN');
    // A term the student already used is not listed as gained.
    expect(within(region()).queryByText('cache hit ratio')).toBeNull();
  });

  it('keeps every term chip lit when the page is not replaying', () => {
    renderModal();

    const chip = within(region()).getByText('latency');
    expect(chip.className).not.toContain('border-dashed');
  });

  it('lights a term only once the edit that brings it in is on the page', () => {
    vi.useFakeTimers();
    renderModal();

    // "latency" arrives with the second edit, so it stays dark through the first.
    startReplay();
    const chip = () => within(region()).getByText('latency');
    expect(chip().className).toContain('border-dashed');

    act(() => {
      vi.advanceTimersByTime(STEP);
    });
    expect(chip().className).toContain('border-dashed');

    act(() => {
      vi.advanceTimersByTime(STEP);
    });
    expect(chip().className).not.toContain('border-dashed');
  });
});

describe('watching the marker’s edits', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('starts from the student’s own answer, with the edits not yet drawn', () => {
    renderModal(threeEdits);

    startReplay();

    expect(screen.getByText('Your answer')).toBeTruthy();
    // Nothing has been added yet: the page is the student's own words, cut ones included.
    // The edit numbers sit in the text too, so the words are read around them.
    expect(screen.queryAllByTitle('Added by the marker')).toHaveLength(0);
    const page = document.querySelector('p.font-serif')!.textContent ?? '';
    expect(page).toContain('two three four five six');
    expect(page).toContain('seven eight');
    expect(page).not.toContain('alpha');
  });

  it('advances one edit per step while it plays', () => {
    renderModal(threeEdits);

    startReplay();
    act(() => {
      vi.advanceTimersByTime(STEP);
    });
    expect(screen.getByText('Edit 1 of 3')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('1');

    act(() => {
      vi.advanceTimersByTime(STEP);
    });
    expect(screen.getByText('Edit 2 of 3')).toBeTruthy();
    // The first edit has landed: its added word is on the page.
    expect(screen.getAllByTitle('Added by the marker').map((m) => m.textContent)).toContain(
      'alpha'
    );
  });

  it('stops on its own at the last edit, and offers to replay from the start', () => {
    renderModal(threeEdits);

    startReplay();
    runSteps(5);

    expect(screen.getByText('All 3 edits')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Replay from the start' })).toBeTruthy();
    expect(screen.getAllByTitle('Added by the marker')).toHaveLength(3);
  });

  it('pauses and resumes from the same button, which keeps its place', () => {
    renderModal(threeEdits);

    startReplay();
    act(() => {
      vi.advanceTimersByTime(STEP);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pause the replay' }));
    act(() => {
      vi.advanceTimersByTime(STEP * 3);
    });
    expect(screen.getByText('Edit 1 of 3')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Play the replay' }));
    act(() => {
      vi.advanceTimersByTime(STEP);
    });
    expect(screen.getByText('Edit 2 of 3')).toBeTruthy();
  });

  it('skips to the end, where the page shows every edit as the marked view does', () => {
    renderModal(threeEdits);

    startReplay();
    fireEvent.click(screen.getByRole('button', { name: 'Skip to the end' }));

    expect(screen.getByText('All 3 edits')).toBeTruthy();
    expect(screen.getAllByTitle('Cut by the marker').map((m) => m.textContent)).toEqual([
      'two',
      'seven',
      'twelve',
    ]);
    expect(screen.getAllByTitle('Added by the marker').map((m) => m.textContent)).toEqual([
      'alpha',
      'beta',
      'gamma',
    ]);
  });

  it('steps back and forward one edit, and pauses while it does', () => {
    renderModal(threeEdits);

    startReplay();
    fireEvent.click(screen.getByRole('button', { name: 'Next edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next edit' }));
    expect(screen.getByText('Edit 2 of 3')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Previous edit' }));
    expect(screen.getByText('Edit 1 of 3')).toBeTruthy();
    // Stepping does not start the clock: nothing moves on without a press.
    act(() => {
      vi.advanceTimersByTime(STEP * 4);
    });
    expect(screen.getByText('Edit 1 of 3')).toBeTruthy();
  });

  it('puts the current edit on the ring in both the page and the margin', () => {
    renderModal(threeEdits);

    startReplay();
    runSteps(2);

    expect(ringed()).toEqual(['seven', 'beta']);
    const margin = screen.getByRole('complementary', { name: 'The edits' });
    const current = within(margin).getAllByRole('button')[1];
    expect(current.getAttribute('aria-current')).toBe('true');
  });

  it('announces each edit once, in a polite live region, and not every word', () => {
    renderModal(threeEdits);

    startReplay();
    act(() => {
      vi.advanceTimersByTime(STEP);
    });

    const live = document.body.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain('Edit 1 of 3');
    expect(live?.textContent).toContain('two');
    expect(live?.textContent).toContain('alpha');
  });

  it('names the replay controls, so the buttons read by their labels', () => {
    renderModal(threeEdits);

    startReplay();
    for (const name of ['Previous edit', 'Next edit', 'Skip to the end']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    expect(screen.getByRole('progressbar', { name: 'Replay progress' })).toBeTruthy();
  });

  it('ends the replay when the reader leaves the marked view, and offers it again on return', () => {
    renderModal(threeEdits);

    startReplay();
    runSteps(1);
    fireEvent.click(screen.getByText('Clean copy'));

    // The replay is a view of the marked page, so its controls are not on the clean copy.
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByRole('button', { name: /Watch the marker.s edits/ })).toBeNull();

    fireEvent.click(screen.getByText('Edits marked'));
    expect(screen.getByRole('button', { name: /Watch the marker.s edits/ })).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('leaves the replay off until it is asked for', () => {
    renderModal(threeEdits);

    act(() => {
      vi.advanceTimersByTime(STEP * 5);
    });
    expect(screen.queryAllByTitle('Added by the marker')).toHaveLength(3);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('does not show the replay where there is nothing to replay', () => {
    renderModal({ improvedAnswer: ORIGINAL });

    expect(screen.queryByRole('button', { name: /Watch the marker.s edits/ })).toBeNull();
  });

  it('does not show the replay without the student’s original to play from', () => {
    renderModal({ originalAnswer: null });

    expect(screen.queryByRole('button', { name: /Watch the marker.s edits/ })).toBeNull();
    expect(screen.queryByRole('region', { name: 'What changed' })).toBeNull();
  });

  it('keeps the page reachable while it replays: the version still applies', () => {
    const { onApply } = renderModal(threeEdits);

    startReplay();
    act(() => {
      vi.advanceTimersByTime(STEP);
    });
    fireEvent.click(screen.getByText('Use this version'));

    expect(onApply).toHaveBeenCalledWith(THREE_REVISED);
  });

  it('counts the mark up to the target as the replay finishes', () => {
    // Stubs the frame clock to the fake clock, so the count can be advanced by hand.
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    // Node's timers return an object where the browser's return a number, so the
    // stub hands back a number and reads it again as one.
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
      (cb) => globalThis.setTimeout(() => cb(Date.now()), 16) as unknown as number
    );
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) =>
      globalThis.clearTimeout(id as unknown as ReturnType<typeof setTimeout>)
    );
    renderModal(threeEdits);
    // The figure the header sets large: the target mark, not the "from" one.
    const figure = () =>
      screen.getByRole('dialog').querySelector('[data-mark-figure="target"]')?.textContent;

    startReplay();
    // The student's own score until the last edit is on the page.
    expect(figure()).toBe('4');

    fireEvent.click(screen.getByRole('button', { name: 'Skip to the end' }));
    // The first frame of the count: still the student's own mark.
    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(figure()).toBe('4');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(figure()).toBe('5');
  });

  it('fills the band rule as the replay reaches each edit', () => {
    renderModal(threeEdits);

    const rule = document.querySelector('[role="dialog"] > div.h-1 > div') as HTMLElement;
    expect(rule.style.transform).toBe('scaleX(1)');

    startReplay();
    expect(rule.style.transform).toBe('scaleX(0)');
    act(() => {
      vi.advanceTimersByTime(STEP);
    });
    expect(rule.style.transform).toBe('scaleX(0.3333333333333333)');
  });
});

describe('reduced motion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubReducedMotion(true);
  });

  it('steps through the edits without animating the page', () => {
    renderModal(threeEdits);

    startReplay();
    act(() => {
      vi.advanceTimersByTime(STEP);
    });
    expect(screen.getByText('Edit 1 of 3')).toBeTruthy();
    // Every animated part of the page is switched off for this reader.
    const animated = Array.from(document.body.querySelectorAll('[class*="animate-"]'));
    expect(animated.length).toBeGreaterThan(0);
    for (const el of animated) {
      expect(el.className).toContain('motion-reduce:animate-none');
    }
  });

  it('scrolls without smooth behaviour', () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    try {
      renderModal(threeEdits);
      startReplay();
      expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }));
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  it('shows the final mark at once, with no count', () => {
    renderModal(threeEdits);

    startReplay();
    fireEvent.click(screen.getByRole('button', { name: 'Skip to the end' }));

    expect(
      screen.getByRole('dialog').querySelector('[data-mark-figure="target"]')?.textContent
    ).toBe('5');
  });

  it('is off for the motion-reduce variants on every transition the page adds', () => {
    renderModal(threeEdits);

    startReplay();
    const band = document.querySelector('[role="dialog"] > div.h-1 > div') as HTMLElement;
    expect(band.className).toContain('motion-reduce:transition-none');
    expect(screen.getByRole('progressbar').firstElementChild?.className).toContain(
      'motion-reduce:transition-none'
    );
  });
});

describe('linking an edit in the margin to the page', () => {
  it('rings the edit under the pointer in both places, and lets go when it leaves', () => {
    renderModal(threeEdits);
    const margin = screen.getByRole('complementary', { name: 'The edits' });
    const second = within(margin).getAllByRole('button')[1];

    fireEvent.mouseEnter(second);
    expect(ringed()).toEqual(['seven', 'beta']);
    expect(second.className).toContain('band-edge-strong');

    fireEvent.mouseLeave(second);
    expect(ringed()).toEqual(['two', 'alpha']);
  });

  it('does the same for an edit under the pointer on the page', () => {
    renderModal(threeEdits);

    fireEvent.mouseEnter(screen.getByLabelText('Edit 3'));
    expect(ringed()).toEqual(['twelve', 'gamma']);
  });

  it('follows the keyboard focus as well as the pointer', () => {
    renderModal(threeEdits);
    const margin = screen.getByRole('complementary', { name: 'The edits' });

    act(() => {
      within(margin).getAllByRole('button')[2].focus();
    });
    expect(ringed()).toEqual(['twelve', 'gamma']);
  });
});

describe('three-zone layout', () => {
  const asideNamed = (name: string) =>
    document.body.querySelector<HTMLElement>(`aside[aria-label="${name}"]`);

  it('puts the why on the left of the page and the edits on the right, from xl', () => {
    renderModal({ markerAsked: ['Name the effect on latency.'], keyChanges: ['Named the cause'] });

    const why = asideNamed('What changed and why')!;
    const where = asideNamed('The edits')!;
    const page = screen
      .getByText(/everything unmarked is your own writing/)
      .closest('div')!.parentElement!;

    expect(why.className).toMatch(/xl:col-start-1/);
    expect(where.className).toMatch(/xl:col-start-3/);
    expect(page.className).toMatch(/xl:col-start-2/);
    // The margin is one column below xl, and only a grid cell of its own from xl.
    expect(where.parentElement!.className).toMatch(/xl:contents/);
  });

  it('gives the page its place in a two-zone grid when there is no why to show', () => {
    renderModal();

    expect(asideNamed('What changed and why')).toBeNull();
    const where = asideNamed('The edits')!;
    expect(where.className).toMatch(/xl:col-start-2/);
    const body = where.parentElement!.parentElement!;
    expect(body.className).toMatch(/xl:grid-cols-\[minmax\(0,1fr\)_19rem\]/);
  });

  it('widens the dialog to use a wide screen, and sets the three columns on the body', () => {
    renderModal({ markerAsked: ['Name the effect on latency.'] });

    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('xl:max-w-[min(94vw,1500px)]');
    const body = asideNamed('The edits')!.parentElement!.parentElement!;
    expect(body.className).toContain('xl:grid-cols-[15rem_minmax(0,1fr)_19rem]');
    expect(body.className).toContain('2xl:grid-cols-[17rem_minmax(0,1fr)_21rem]');
  });

  it('stacks the margins under a full-width side-by-side view', () => {
    renderModal({ markerAsked: ['Name the effect on latency.'], ...threeEdits });

    fireEvent.click(screen.getByText('Side by side'));

    const where = asideNamed('The edits')!;
    const margin = where.parentElement!;
    expect(margin.className).toContain('md:grid-cols-2');
    // The side-by-side body is not the three-zone grid: the page takes the width.
    expect(margin.parentElement!.className).not.toContain('lg:grid');
  });
});
