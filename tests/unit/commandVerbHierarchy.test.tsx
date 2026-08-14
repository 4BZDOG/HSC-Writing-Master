import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import CommandVerbHierarchy from '../../components/CommandVerbHierarchy';
import { PromptVerb } from '../../types';

/**
 * Behavioural contract for the command verb hierarchy ribbon: it renders the
 * selected verb's detail card, the header toggle collapses/expands with a
 * correct aria-expanded state, and clicking a verb chip refocuses the ribbon.
 */

beforeAll(() => {
  // jsdom doesn't implement scrollIntoView (used by the tier auto-scroll).
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

const getToggle = () => screen.getByRole('button', { name: /command verb hierarchy reference/i });

describe('CommandVerbHierarchy', () => {
  it('renders the header and all six tier groups without a selected verb', () => {
    render(<CommandVerbHierarchy />);
    expect(screen.getByText('HSC Command Verb Hierarchy')).toBeTruthy();
    expect(screen.getByText(/Reference • 6 cognitive tiers/i)).toBeTruthy();
    expect(getToggle().getAttribute('aria-expanded')).toBe('true');
  });

  it('shows the detail card (definition, band ceiling) for the current verb', () => {
    render(<CommandVerbHierarchy currentVerb={'EVALUATE' as PromptVerb} />);
    // Header chip + detail card heading both carry the verb.
    expect(screen.getAllByText('EVALUATE').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Band Cap')).toBeTruthy();
    expect(screen.getByText('Marks')).toBeTruthy();
  });

  it('collapses and re-expands via the header toggle with aria-expanded in sync', () => {
    render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);
    const toggle = getToggle();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('re-opens when the current verb changes, so a new question is explained', () => {
    const { rerender } = render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);
    expect(getToggle().getAttribute('aria-expanded')).toBe('true');
    rerender(<CommandVerbHierarchy currentVerb={'EVALUATE' as PromptVerb} />);
    expect(getToggle().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByText('EVALUATE').length).toBeGreaterThanOrEqual(2);
  });

  // …but a collapse is a decision, and it used to be undone by the very next
  // question. The selection still follows the question; only the fold stays.
  it('stays folded once collapsed by hand, and still follows the verb', () => {
    const { rerender } = render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);
    fireEvent.click(getToggle());
    expect(getToggle().getAttribute('aria-expanded')).toBe('false');

    rerender(<CommandVerbHierarchy currentVerb={'EVALUATE' as PromptVerb} />);
    expect(getToggle().getAttribute('aria-expanded')).toBe('false');

    // Re-opening by hand shows the new question's verb, not the stale one.
    fireEvent.click(getToggle());
    expect(getToggle().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByText('EVALUATE').length).toBeGreaterThanOrEqual(2);
  });

  /**
   * DesignSpec §3, "Keyboard Reach": a keyboard user must reach exactly what is
   * on screen. The ribbon folds to zero height, which is a visual collapse and
   * nothing more — fifty controls (six tier headers, thirty-eight verb chips,
   * six timeline steps) stayed in the tab order and in the accessibility tree
   * behind a panel the UI had told the reader was shut.
   */
  it('marks the shut panel inert, and lifts it when re-expanded', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);
    const inertPanel = () => container.querySelector('[inert]');
    const chip = screen.getByRole('button', { name: 'IDENTIFY' });

    // Open by default, so nothing inside it is out of reach.
    expect(inertPanel()).toBeNull();

    fireEvent.click(getToggle());
    expect(inertPanel()).not.toBeNull();
    expect(inertPanel()!.contains(chip)).toBe(true);

    fireEvent.click(getToggle());
    expect(inertPanel()).toBeNull();
  });

  it('points the toggle at the panel it opens', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);
    const panelId = getToggle().getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    // Attribute selector rather than `#id`: React's useId emits `«r0»`, which
    // is a valid id but not a valid bare CSS identifier.
    const panel = container.querySelector(`[id="${panelId}"]`);
    expect(panel).not.toBeNull();
    expect(panel!.contains(screen.getByRole('button', { name: 'IDENTIFY' }))).toBe(true);
  });

  it('lets a keyboard user select a tier from the card header', () => {
    render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);
    const header = screen.getByRole('button', { name: /Band 1 ceiling Remember & List/i });

    expect(header.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(header);
    // Tier 1's first verb (alphabetical) becomes the active detail card.
    expect(screen.getAllByText('CALCULATE').length).toBeGreaterThanOrEqual(2);
  });

  it('selecting a verb chip moves the detail card to that verb', () => {
    render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);
    fireEvent.click(screen.getByRole('button', { name: 'IDENTIFY' }));
    expect(screen.getAllByText('IDENTIFY').length).toBeGreaterThanOrEqual(2);
  });

  // The ribbon lives below the syllabus navigator, so it is usually off screen
  // when a question is picked. `scrollIntoView` cannot be told to leave the
  // page alone: it scrolled the WINDOW down to the ribbon, dragging the reader
  // away from the question they had just chosen. Only the strip may move.
  it('scrolls its own strip rather than the page when the tier changes', () => {
    const scrollIntoView = vi.fn();
    const scrollTo = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    (Element.prototype as unknown as { scrollTo: unknown }).scrollTo = scrollTo;

    render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);
    scrollTo.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'SYNTHESISE' }));

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(scrollTo).toHaveBeenCalled();
  });

  // Verbs arrive from model output and from stored prompts in whatever case
  // they were saved with, and an exact-case lookup answered `undefined` — which
  // in this component is not a wrong verb but no verb: no detail card, no tier
  // highlight, no progress.
  it('explains a verb that arrives in the wrong case', () => {
    render(<CommandVerbHierarchy currentVerb={'describe' as PromptVerb} />);
    expect(screen.getByText('Band Cap')).toBeTruthy();
    expect(screen.getAllByText('DESCRIBE').length).toBeGreaterThanOrEqual(2);
  });

  it('honours prefers-reduced-motion when it scrolls the strip', () => {
    const scrollTo = vi.fn();
    (Element.prototype as unknown as { scrollTo: unknown }).scrollTo = scrollTo;
    const matchMedia = vi.fn().mockReturnValue({ matches: true });
    const original = window.matchMedia;
    (window as unknown as { matchMedia: unknown }).matchMedia = matchMedia;

    try {
      render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);
      scrollTo.mockClear();
      fireEvent.click(screen.getByRole('button', { name: 'SYNTHESISE' }));

      expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }));
    } finally {
      (window as unknown as { matchMedia: unknown }).matchMedia = original;
    }
  });

  it('cognitive timeline steps are keyboard-reachable buttons that select the tier', () => {
    render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);
    const step = screen.getByRole('button', { name: /Show tier 6 verbs/i });
    fireEvent.click(step);
    // Tier 6's first verb (alphabetical) becomes the active detail card.
    expect(screen.getByText('Band Cap')).toBeTruthy();
    expect(step.getAttribute('aria-label')).toMatch(/Evaluate/i);
  });

  /**
   * The detail card used to state the same integer twice, six inches apart,
   * under two labels: `Band {tier}` on the chip and `Band Cap
   * {getTierTargetBand(tier)}` in the tray. They are provably the same number —
   * every tier's maxBand is its own number, and `bandColors.test.ts` pins that
   * as an invariant — so one of the two had to say something else.
   */
  it('says tier on the chip and band in the tray, not the same number twice', () => {
    render(<CommandVerbHierarchy currentVerb={'ANALYSE' as PromptVerb} />);

    const chip = screen.getByText(/^Tier 4 · Analyse$/);
    expect(chip).toBeTruthy();
    expect(chip.textContent).not.toMatch(/Band/i);

    // The band statement survives, in the one place that can explain it.
    expect(screen.getByText('Band Cap')).toBeTruthy();
    expect(screen.getByText(/ANALYSE questions cap a response at Band 4/i)).toBeTruthy();
  });

  /**
   * The footer's six step labels were a fourth hand-written copy of the tier
   * names, and had drifted at two of the six: tier 2 read "Describe" where
   * `tierShortLabel` derives "Define", and tier 5 read "Argue" where it derives
   * "Discuss". Tier 5 is the one to pin — "Argue" names nothing else in the
   * ladder, so the drift was invisible.
   */
  it('derives the timeline labels rather than keeping a fourth copy of them', () => {
    render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);

    const step = screen.getByRole('button', { name: /tier 5/i });
    expect(step.getAttribute('aria-label')).toMatch(/Discuss/i);
    expect(step.getAttribute('aria-label')).not.toMatch(/Argue/i);

    expect(screen.getByRole('button', { name: /tier 2/i }).getAttribute('aria-label')).toMatch(
      /Define/i
    );
  });

  /**
   * The ribbon header must be the same height for every verb.
   *
   * It was not: the terms run from three characters to thirteen
   * (DIFFERENTIATE), and neither the "Selected" chip nor the title beside it
   * could refuse to wrap — so a long term widened the chip, the wider chip
   * squeezed the title, and the title took a second line. The header is the one
   * block on the page meant to sit still, and it moved whenever the question
   * changed to a verb with a long name.
   *
   * Two halves hold the lock, so both are pinned: `min-h` against shrinking,
   * and no-wrap against growing.
   */
  describe('header height lock', () => {
    const header = () => getToggle();

    it('refuses to wrap the pieces whose width depends on the verb', () => {
      render(<CommandVerbHierarchy currentVerb={'DIFFERENTIATE' as PromptVerb} />);

      const chip = screen.getAllByText('DIFFERENTIATE').find((el) => el.tagName === 'DIV');
      expect(chip?.className).toContain('whitespace-nowrap');
      expect(screen.getByText('Selected:').className).toContain('whitespace-nowrap');
      // The title truncates instead — an ellipsis costs nothing, a second line
      // costs the lock.
      expect(screen.getByText('HSC Command Verb Hierarchy').className).toContain('truncate');
    });

    it('carries a floor height that no verb can shrink', () => {
      render(<CommandVerbHierarchy currentVerb={'STATE' as PromptVerb} />);
      expect(header().className).toMatch(/min-h-\[\d+px\]/);
    });

    /**
     * Geometry only. The header's GRADIENT is meant to change with the verb —
     * that is the tier colour, and the whole ribbon is built on it — so the
     * comparison drops colour tokens and keeps the ones that can move a box.
     */
    it('keeps identical geometry for the shortest and longest verbs', () => {
      const geometry = (cls: string) =>
        cls
          .split(/\s+/)
          .filter((t) =>
            /^(w-|px-|py-|min-h-|max-h-|h-|flex|items-|justify-|gap-|relative|overflow-|rounded)/.test(
              t
            )
          )
          .sort()
          .join(' ');

      const { unmount } = render(<CommandVerbHierarchy currentVerb={'STATE' as PromptVerb} />);
      const shortest = geometry(header().className);
      unmount();

      render(<CommandVerbHierarchy currentVerb={'DIFFERENTIATE' as PromptVerb} />);
      expect(geometry(header().className)).toBe(shortest);
      expect(shortest).toContain('min-h-[60px]');
    });
  });
});
