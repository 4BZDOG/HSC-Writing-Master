import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import OutcomeDetailModal from '../../components/OutcomeDetailModal';
import { AICache } from '../../services/aiCache';
import { CourseOutcome, PromptVerb } from '../../types';

/**
 * A question can be linked to more outcomes than a phone can show in one row of
 * tabs, and the row scrolls sideways. These pin the cue that it does: the edge
 * with tabs behind it fades, and the selected tab is brought into view.
 *
 * jsdom has no layout, so the row's metrics are set by hand: scrollWidth,
 * clientWidth and the tabs' offsets are the numbers a browser would report at a
 * 390px width.
 */

vi.mock('../../services/geminiService', () => ({
  explainOutcomeInContext: vi.fn(() => new Promise(() => {})),
}));

const codes = ['EC-01', 'EC-02', 'EC-03', 'EC-04', 'EC-05', 'EC-06', 'EC-07', 'EC-08'];
const outcomes: CourseOutcome[] = codes.map((code) => ({
  code,
  description: `Outcome ${code}`,
}));

const renderModal = (initialCode = 'EC-01') =>
  render(
    <OutcomeDetailModal
      isOpen
      onClose={vi.fn()}
      outcomes={outcomes}
      initialCode={initialCode}
      question="Assess the impact of emerging technologies."
      verb={'ASSESS' as PromptVerb}
      totalMarks={8}
    />
  );

/** Give the row the geometry of a narrow screen: 300px of tabs in view, 600px in all. */
const setRowMetrics = (strip: HTMLElement, scrollLeft: number, scrollWidth = 600) => {
  Object.defineProperty(strip, 'clientWidth', { configurable: true, value: 300 });
  Object.defineProperty(strip, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(strip, 'scrollLeft', {
    configurable: true,
    writable: true,
    value: scrollLeft,
  });
};

/** Place each tab the way a row of 80px tabs lays out: left to right, 8px apart. */
const placeTabs = (strip: HTMLElement) => {
  strip.querySelectorAll<HTMLElement>('[role="tab"]').forEach((tab, i) => {
    Object.defineProperty(tab, 'offsetLeft', { configurable: true, value: i * 88 });
    Object.defineProperty(tab, 'offsetWidth', { configurable: true, value: 80 });
  });
};

const stripOf = () => screen.getByRole('tablist') as HTMLElement;

beforeEach(() => {
  vi.spyOn(AICache, 'get').mockResolvedValue(undefined as never);
  vi.spyOn(AICache, 'set').mockResolvedValue(undefined as never);
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe('the outcome tab row says when it runs on', () => {
  it('fades the trailing edge while tabs lie beyond the screen', () => {
    renderModal();
    const strip = stripOf();
    setRowMetrics(strip, 0);
    fireEvent.scroll(strip);

    expect(strip.style.maskImage).toContain('calc(100% - 24px)');
    expect(strip.style.maskImage).not.toMatch(/transparent 0,/);
  });

  it('fades the leading edge once the row has been scrolled along', () => {
    renderModal();
    const strip = stripOf();
    setRowMetrics(strip, 300);
    fireEvent.scroll(strip);

    expect(strip.style.maskImage).toContain('transparent 0, #000 24px');
    expect(strip.style.maskImage).not.toContain('calc(100%');
  });

  it('draws no fade when every tab fits', () => {
    renderModal();
    const strip = stripOf();
    setRowMetrics(strip, 0, 300);
    fireEvent.scroll(strip);

    expect(strip.style.maskImage).toBeFalsy();
  });

  it('takes the fade away again when the row is scrolled to its far end', () => {
    renderModal();
    const strip = stripOf();
    setRowMetrics(strip, 0);
    fireEvent.scroll(strip);
    expect(strip.style.maskImage).toContain('calc(100% - 24px)');

    setRowMetrics(strip, 300);
    fireEvent.scroll(strip);
    expect(strip.style.maskImage).not.toContain('calc(100%');
  });
});

describe('the selected tab is kept in view', () => {
  it('scrolls the row to a tab that the screen has not reached, when it is selected', () => {
    renderModal('EC-01');
    const strip = stripOf();
    setRowMetrics(strip, 0);
    placeTabs(strip);

    // EC-08 sits at 616px, well past the 300px in view.
    fireEvent.click(screen.getByRole('tab', { name: /EC-08/ }));

    // Its right edge plus the fade's width, less the viewport: 616 + 80 + 24 - 300.
    expect(strip.scrollLeft).toBe(420);
  });

  it('leaves the row alone when the selected tab is already in view', () => {
    renderModal('EC-01');
    const strip = stripOf();
    setRowMetrics(strip, 0);
    placeTabs(strip);

    fireEvent.click(screen.getByRole('tab', { name: /EC-02/ }));

    expect(strip.scrollLeft).toBe(0);
  });
});
