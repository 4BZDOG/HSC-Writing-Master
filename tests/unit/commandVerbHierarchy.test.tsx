import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import CommandVerbHierarchy from '../../components/CommandVerbHierarchy';
import { PromptVerb } from '../../types';
import { TIER_GROUPS } from '../../data/commandTerms';
import {
  RIBBON_SPECTRUM_SCALE_RAIL,
  RIBBON_TIER_SUBTITLE,
  RIBBON_TIMELINE_THRESHOLD_CHIP,
} from '../../utils/verbRibbonChrome';

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

/** The scale rail, matched by its exact class so a stray utility appended at
 *  the call site fails here rather than quietly widening what these assert. */
const rail = (container: HTMLElement): HTMLElement => {
  const found = container.querySelector(
    `[class="${RIBBON_SPECTRUM_SCALE_RAIL}"]`
  ) as HTMLElement | null;
  expect(found, 'the scale rail is not wearing RIBBON_SPECTRUM_SCALE_RAIL').toBeTruthy();
  return found as HTMLElement;
};

describe('CommandVerbHierarchy', () => {
  it('renders the header and all six tier groups without a selected verb', () => {
    render(<CommandVerbHierarchy />);
    expect(screen.getByText('HSC Command Verb Hierarchy')).toBeTruthy();
    expect(screen.getByText(/Reference · 6 cognitive tiers/i)).toBeTruthy();
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
   * Beneath the breadcrumb the ribbon is a shut disclosure, and it has to stay
   * shut when the question changes. It used to be unmounted in that state
   * altogether; now that it renders there, an unfolding seven-hundred-pixel
   * reference on every new question would be worse than the absence was.
   */
  describe('when the navigator is folded to a breadcrumb', () => {
    it('starts shut, and a new question does not unfold it', () => {
      const { rerender } = render(
        <CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} defaultOpen={false} />
      );
      expect(getToggle().getAttribute('aria-expanded')).toBe('false');

      rerender(<CommandVerbHierarchy currentVerb={'EVALUATE' as PromptVerb} defaultOpen={false} />);
      expect(getToggle().getAttribute('aria-expanded')).toBe('false');

      // The selection still followed the question, so opening it by hand shows
      // the verb that is actually on screen rather than the previous one.
      fireEvent.click(getToggle());
      expect(getToggle().getAttribute('aria-expanded')).toBe('true');
      expect(screen.getAllByText('EVALUATE').length).toBeGreaterThanOrEqual(2);
    });

    it('opens and shuts with the navigator, rather than only sampling it at mount', () => {
      const { rerender } = render(
        <CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} defaultOpen />
      );
      expect(getToggle().getAttribute('aria-expanded')).toBe('true');

      rerender(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} defaultOpen={false} />);
      expect(getToggle().getAttribute('aria-expanded')).toBe('false');

      rerender(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} defaultOpen />);
      expect(getToggle().getAttribute('aria-expanded')).toBe('true');
    });
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

  // The case fix above came from `getCommandTermInfo`, which also answers an
  // unrecognised verb with an EXPLAIN stub. That half was deliberately not
  // taken, and this pins it: everywhere else the fallback degrades something
  // incidental, but this component's whole content is the claim "your verb is
  // X, it caps you at Band N, spend this long on it". Rendering that in full
  // about a verb nobody asked for — styled, tier-highlighted, progress bar at
  // halfway, with nothing marking it a guess — is worse than rendering nothing.
  // A one-line change back to `getCommandTermInfo` would silently reverse it.
  it('says nothing at all about a verb it does not recognise', () => {
    render(<CommandVerbHierarchy currentVerb={'FLIBBERTIGIBBET' as PromptVerb} />);

    // No detail card: these three only exist inside it.
    expect(screen.queryByText('Band Cap')).toBeNull();
    expect(screen.queryByText('Marks')).toBeNull();
    expect(screen.queryByText(/^Selected:$/)).toBeNull();
    // And emphatically not the tier-3 fallback the helper would have supplied.
    expect(screen.queryByText(/Tier 3/)).toBeNull();

    // The ladder itself still renders — the reference is intact, it just makes
    // no claim about this particular verb.
    expect(screen.getByText(/Reference · 6 cognitive tiers/i)).toBeTruthy();
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

/**
 * The cue line — the words the spectrum's colour is not allowed to carry alone.
 *
 * It replaced four hand-written span labels that named spans of the ladder
 * rather than tiers, so `tierShortLabel` could not derive them and two of the
 * four had drifted from the `TIER_GROUPS` title they paraphrased. Everything
 * the cue says is sourced from the tier's own group, `getTierTargetBand` and
 * `getBandName`, and it says it in words because DesignSpec §2 does not let
 * colour be the only signal — a reader who cannot separate the yellow band
 * from the green one still has the sentence.
 */
describe('the spectrum says its level in words', () => {
  it('announces the level politely, in words', () => {
    render(<CommandVerbHierarchy currentVerb={'ANALYSE' as PromptVerb} />);

    const cue = screen.getByRole('status');
    expect(cue.textContent).toContain('Tier 4');
    expect(cue.textContent).toContain('Analyse');
    // The band name (not "Band Cap 4" — `getTierTargetBand(tier) === tier`
    // always, so that would restate "Tier 4" under a second label).
    expect(cue.textContent).toContain('Sound');
    expect(cue.textContent).not.toContain('Band Cap');

    // Polite. `PromptSelector` states the house reasoning: assertive interrupts
    // a student mid-sentence, and changing question is ordinary navigation.
    expect(cue.getAttribute('aria-live')).not.toBe('assertive');

    // And SHORT. A `status` region re-announces its whole content every time
    // that content changes, and the whole cue runs to ~140 characters: with
    // the subtitle inside the region, a screen-reader user heard a full prose
    // sentence read out on every question change, on top of the tier and band
    // name that are the part they asked for. The lede is what is announced —
    // "Tier 4 · Analyse & Apply · Sound".
    expect(cue.textContent!.length).toBeLessThan(80);
    expect(cue.textContent).not.toContain('Break things apart');
  });

  // The cue's tail used to be the tier's full prose subtitle, and the comment
  // beside it claimed the cue held "the only copy of it while the tier strip
  // above is shut". The strip has no shut state of its own — it and the footer
  // are siblings under the same `inert`-gated panel — so `RIBBON_TIER_SUBTITLE`
  // renders the subtitle whenever the cue is on screen at all. Deleting the
  // footer's copy therefore loses nothing, and this test is what says so: one
  // copy survives, and it is the tier card's.
  it('moves the tier’s prose subtitle off the footer without losing it', () => {
    render(<CommandVerbHierarchy currentVerb={'ANALYSE' as PromptVerb} />);

    const copies = screen.getAllByText(/Break things apart and use knowledge/);
    expect(copies).toHaveLength(1);

    const survivor = copies[0];
    // The survivor is the tier card's subtitle, not the cue's line.
    expect(survivor.className).toContain(RIBBON_TIER_SUBTITLE);
    expect(screen.getByRole('status').parentElement!.contains(survivor)).toBe(false);
    expect(survivor.closest('[aria-hidden="true"]')).toBeNull();
  });

  // A live region has to be in the document BEFORE it changes, or the first
  // change is the mount and nothing is announced. So the cue renders in the
  // no-verb state too — and in that state it must still say nothing about a
  // tier, which is the same contract as "says nothing at all about a verb it
  // does not recognise" above.
  it('keeps the live region mounted when no verb is chosen, and names no tier', () => {
    render(<CommandVerbHierarchy />);

    const cue = screen.getByRole('status');
    expect(cue.textContent).toBe('Choose a command verb to light the spectrum.');
    expect(cue.textContent).not.toMatch(/Tier \d/);
    expect(cue.textContent).not.toMatch(/Band/);
  });

  // What the threshold MEANS, which is now stated once on the rail rather than
  // per-tier in a sentence. The old line said "Above/Below the Deep Learning
  // Threshold" and recomputed it from the reader's tier on every question;
  // this is a property of the ladder, not of where the reader stands on it, so
  // it is said once and always, on the two sides it describes.
  //
  // Both captions render whatever tier is selected, and that is the point: a
  // student below the gate can see what is on the other side of it.
  it('names what each side of the threshold asks of the writer', () => {
    const { container, unmount } = render(
      <CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />
    );
    expect(rail(container).textContent).toContain('Show what you know');
    expect(rail(container).textContent).toContain('Use what you know');
    unmount();

    const { container: above } = render(
      <CommandVerbHierarchy currentVerb={'ANALYSE' as PromptVerb} />
    );
    expect(rail(above).textContent).toContain('Show what you know');
    expect(rail(above).textContent).toContain('Use what you know');
  });

  // …and the threshold stays OUT of the announcement, which is the one thing
  // that has not changed. A `status` re-announces its whole content on every
  // change, so a region carrying the gate would replay it on every move
  // between tiers 4, 5 and 6 — speech that carries no news. The `< 80` pin
  // travels with it: tier 6 is the longest lede in the ladder.
  it('keeps the announcement to the lede', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'EVALUATE' as PromptVerb} />);

    const cue = screen.getByRole('status');
    expect(cue.textContent).not.toContain('Deep Learning');
    expect(cue.textContent!.length).toBeLessThan(80);
    // And it is on the rail, unhidden — out of the announcement, not out of
    // reach. `aria-hidden` there would take the caption out of the contrast
    // sweep as well, which is the fault the CSS arrows exist to avoid.
    expect(rail(container).textContent).toContain('Deep Learning Threshold');
    expect(rail(container).closest('[aria-hidden="true"]')).toBeNull();
  });

  // The no-verb state names no tier, and it must not name the threshold either:
  // there is nothing on the bar for the words to point at, and the cue is the
  // one string a reader meets before they have chosen anything.
  it('says nothing about a threshold when no verb is chosen', () => {
    const { container } = render(<CommandVerbHierarchy />);

    const cue = screen.getByRole('status');
    expect(cue.textContent).toBe('Choose a command verb to light the spectrum.');
    // The rail still names the gate and its two sides — those describe the
    // ladder, which exists before anything is picked. What must not appear is
    // a claim about where the reader stands on it, which is exactly what the
    // deleted "Above/Below" clause was.
    expect(container.textContent).not.toMatch(/(Above|Below) the Deep Learning Threshold/);
    expect(rail(container).textContent).toContain('Deep Learning Threshold');
  });

  // The footer used to step between questions because the cue line wrapped:
  // the six tier subtitles run 44 to 96 characters, one line for tier 4 and
  // two for tier 6. The answer was a `min-h-[2.25rem] line-clamp-2` box — a
  // reserved two lines, of which the second was empty at every width measured.
  //
  // The line is gone, so the lock is not tuned, it is unnecessary: an
  // `sr-only` region is removed from the flow and contributes no height at any
  // tier, at any width, in any language. That is what this now pins — that the
  // announcement never comes back into the layout — because a visible cue
  // WITHOUT the clamp is how the footer started stepping in the first place.
  it('locks the footer’s height across every tier', () => {
    render(<CommandVerbHierarchy currentVerb={'ANALYSE' as PromptVerb} />);
    const cue = screen.getByRole('status');

    expect(cue.className).toContain('sr-only');
    expect(cue.className).not.toMatch(/min-h-\[/);

    // And the dot row no longer depends on which labels render: five of the six
    // are `hidden` below `sm`, so a row sized by its content was a different
    // height — and put its dots in different places — at every tier.
    const row = screen.getByRole('button', { name: /Show tier 1 verbs/i })
      .parentElement as HTMLElement;
    expect(row.className).toMatch(/(^|\s)h-\d+/);
  });
});
/**
 * The scale rail — the arc the four deleted labels drew, derived.
 *
 * `Basic Recall`, `Explain & Compare`, `Analyse & Apply` and `Evaluate &
 * Create` were never span labels. Two are byte-identical to a `TIER_GROUPS`
 * title and two are paraphrases of one, so the row was four TIER titles —
 * tiers 1, 3, 4 and 6 — with tiers 2 and 5 dropped. Those four tiers are the
 * floor, the two sides of the Deep Learning Threshold, and the ceiling, so the
 * rail names the two spans they bound rather than the four rungs: naming the
 * rungs again is what the dot row already does from `tierShortLabel`.
 *
 * jsdom applies no media queries, so both the `xl:hidden` short copy and the
 * `hidden xl:inline` long copy are in the tree at once. Every assertion here is
 * scoped to the rail and matched by regex for that reason.
 */
describe('the scale rail restores the arc, derived', () => {
  it('names what the gate means rather than naming the tiers a fourth time', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'ANALYSE' as PromptVerb} />);

    expect(rail(container).textContent).toContain('Show what you know');
    expect(rail(container).textContent).toContain('Use what you know');

    // The rail used to carry the two tier SPANS, derived — `Remember & List –
    // Explain & Compare` and `Analyse & Apply – Evaluate, Synthesise &
    // Create`. Deriving them was the right answer to the question being asked
    // then, which was how to stop four hand-written labels drifting from the
    // tier data. The better answer is not to ask: the dot row below names all
    // six tiers and the six card headers name them again, so the rail was the
    // third statement of the same vocabulary on one screen. It now says the
    // one thing none of them do.
    expect(rail(container).textContent).not.toContain(TIER_GROUPS[0].title);
    expect(rail(container).textContent).not.toContain(TIER_GROUPS[5].title);

    // The drift pin stays, and still holds app-wide: neither paraphrase may
    // reappear anywhere, on the rail or off it.
    expect(container.textContent).not.toContain('Basic Recall');
    expect(container.textContent).not.toContain('Evaluate & Create');
  });

  // Positionally: recalling is on the left of the gate and thinking on the
  // right, because that is the direction the spectrum runs. Swapping them
  // would read as a ladder that gets easier, and nothing else on the screen
  // would contradict it.
  it('puts recalling before the gate and thinking after it', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'ANALYSE' as PromptVerb} />);
    const [left, chip, right] = Array.from(rail(container).children) as HTMLElement[];

    expect(left.textContent).toContain('Show what you know');
    expect(chip.textContent).toBe('Deep Learning Threshold');
    expect(right.textContent).toContain('Use what you know');

    // Each caption's arrow points away from the gate, and each is hidden from
    // assistive tech on its own — a bordered box with no text node, so the
    // caption around it stays inside the contrast sweep.
    expect(left.querySelector('.scale-arrow-left')).toBeTruthy();
    expect(right.querySelector('.scale-arrow-right')).toBeTruthy();
    expect(left.querySelector('.scale-arrow-left')!.textContent).toBe('');
  });

  // The rail used to also carry "Band Caps 1–3" / "Band Caps 4–6" on each
  // span. That was dropped when the cue line still existed, on the grounds
  // that the cue stated the exact cap for the active tier; the cue has since
  // gone too, and the answer is the same for a different reason — the stat
  // tray above states the cap, and a band number is not what a threshold
  // marker is for.
  it('keeps band numbers off the rail', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'ANALYSE' as PromptVerb} />);

    expect(rail(container).textContent).not.toContain('Band Cap');
    expect(rail(container).textContent).not.toMatch(/Band \d/);
  });

  // The rail used to buy its row for free: `absolute -top-6`, hanging in air
  // that the cue line's `mb-7` was paying for, with the chip at `-top-11` in
  // the same borrowed space. The old assertion pinned that arrangement — the
  // rail must be `absolute`, and the cue must keep the `min-h` and clamp the
  // rail was parasitic on — which is a fair description of a dependency
  // between two elements that share no parent.
  //
  // Measured before it was removed: the rail sat 4px below the cue's box and
  // the chip 0.91px below it, so deleting the cue dropped both 64px, 8px and
  // 11px above the footer's own divider hairline. Free was never free; it was
  // owed.
  //
  // So the pin is inverted. The rail is in the flow and the chip is placed
  // against the rail, which means the only element either depends on is one it
  // is inside. A future `-top-` on this row is the regression to catch.
  it("owns its own row rather than hanging in another element's margin", () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'ANALYSE' as PromptVerb} />);

    expect(rail(container).className).not.toContain('absolute');
    expect(rail(container).className).not.toMatch(/-top-/);
    expect(RIBBON_SPECTRUM_SCALE_RAIL).not.toMatch(/-top-/);
    // The chip is positioned, but inside the rail and at the same 50% the
    // spectrum's threshold notch and the dashed rule both take from
    // DEEP_LEARNING_TIER — so the three cannot drift apart.
    expect(RIBBON_TIMELINE_THRESHOLD_CHIP).toContain('absolute');
    expect(RIBBON_TIMELINE_THRESHOLD_CHIP).toContain('left-1/2');
    expect(RIBBON_TIMELINE_THRESHOLD_CHIP).not.toMatch(/-top-/);
  });
});
