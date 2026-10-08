import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import CommandVerbHierarchy from '../../components/CommandVerbHierarchy';
import { getCommandTermInfo, TIER_GROUPS } from '../../data/commandTerms';
import {
  PANEL_HEADER_CLOSED,
  PANEL_HEADER_OPEN,
  PANEL_ROW_MIN_H,
  PANEL_SURFACE,
} from '../../utils/panelStyles';
import { PromptVerb } from '../../types';
import * as verbRibbonChrome from '../../utils/verbRibbonChrome';
import { BAND_HEX } from '../../utils/renderUtils';
import tailwindConfig from '../../tailwind.config.js';
import {
  RIBBON_BODY,
  RIBBON_DETAIL_CARD,
  RIBBON_DETAIL_RULE,
  RIBBON_DETAIL_TERM,
  RIBBON_HEADER_BAR,
  RIBBON_HEADER_TILE,
  RIBBON_HEADER_TITLE,
  RIBBON_ROOT,
  RIBBON_SPECTRUM_BOUNDARY,
  RIBBON_STAT_TRAY,
  RIBBON_STAT_VALUE,
  RIBBON_STRIP,
  RIBBON_TIER_CARD,
  RIBBON_TIER_CARD_RECEDED,
  RIBBON_TIER_CARD_CURRENT,
  RIBBON_TIER_CARD_IDLE,
  RIBBON_TIER_HEADER,
  RIBBON_TIER_HEADER_IDLE,
  RIBBON_TIER_ICON,
  RIBBON_TIER_HEADER_LABEL,
  RIBBON_TIER_HEADER_LABEL_IDLE,
  RIBBON_TIER_HEADER_TITLE,
  RIBBON_TIER_SUBTITLE_IDLE,
  RIBBON_SPECTRUM_SCALE_RAIL,
  RIBBON_SPECTRUM_SCALE_SPAN,
  RIBBON_TIMELINE_STEP_LABEL,
  RIBBON_TIMELINE_STEP_LABEL_IDLE,
  RIBBON_TIMELINE_THRESHOLD_CHIP,
  RIBBON_VERB_CHIP,
} from '../../utils/verbRibbonChrome';

/**
 * The ribbon is about to be redesigned in `utils/verbRibbonChrome.ts`, one
 * constant at a time. That only works if the constants are the thing the ribbon
 * actually wears — a class string left behind in the JSX would silently stop
 * tracking the redesign, and nothing else in the suite looks at this
 * component's chrome. `tests/unit/commandVerbHierarchy.test.tsx` is the
 * behavioural contract and asserts nothing about colour or theme.
 *
 * The mirror of `tests/unit/appHeaderChrome.test.tsx`, which pinned the header
 * the same way before the same treatment.
 */

beforeAll(() => {
  // jsdom implements neither, and the tier auto-scroll reaches for both.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

const getToggle = () => screen.getByRole('button', { name: /command verb hierarchy reference/i });

describe('the ribbon wears the shared vocabulary', () => {
  it('dresses its root and its header bar from verbRibbonChrome', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);

    expect((container.firstElementChild as HTMLElement).className).toContain(RIBBON_ROOT);
    expect(getToggle().className).toContain(RIBBON_HEADER_BAR);
  });

  it('dresses the detail card, its heading and its stat tray', () => {
    render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);

    const term = screen.getAllByText('DESCRIBE').find((el) => el.tagName === 'H4') as HTMLElement;
    expect(term.className).toContain(RIBBON_DETAIL_TERM);
    // The whole constant, walking up: its first token is `relative`, which half
    // the page's ancestors also carry, so a prefix match here proves nothing.
    let card: HTMLElement | null = term.parentElement;
    while (card && !card.className.includes(RIBBON_DETAIL_CARD)) card = card.parentElement;
    expect(card, 'the verb heading is not inside RIBBON_DETAIL_CARD').toBeTruthy();
    expect(screen.getByText('Band Cap').closest('div')?.parentElement?.className).toContain(
      RIBBON_STAT_TRAY
    );
  });

  it('dresses the strip, its tier cards and their headers', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);

    const strip = container.querySelector(`[class="${RIBBON_STRIP}"]`) as HTMLElement;
    expect(strip).toBeTruthy();
    expect(strip.children).toHaveLength(6);
    for (const card of Array.from(strip.children)) {
      expect(card.className).toContain(RIBBON_TIER_CARD);
    }

    // Name-then-ceiling: the header reads its tier's NAME first and the band
    // it caps at under it, so the accessible name follows that order too.
    const header = screen.getByRole('button', { name: /Remember & List Up to Band 1/i });
    expect(header.className).toContain(RIBBON_TIER_HEADER);
  });

  it('dresses every one of the thirty-eight verb chips', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);

    const chips = Array.from(container.querySelectorAll('button')).filter((button) =>
      button.className.includes(RIBBON_VERB_CHIP)
    );
    expect(chips).toHaveLength(38);
    expect(chips.map((chip) => chip.textContent)).toContain('IDENTIFY');
  });
});

/**
 * The ribbon is a panel like the accordions under the writing area, and it has
 * to be one in the way that can be checked: the same surface constant, the same
 * header row height and tones, the same title voice. It used to be the one
 * reference panel that was drawn separately — a glass bar of its own, two
 * gradient hairlines, a chevron in a circle, a sentence-case title — and
 * "looks out of place" was the whole bug report.
 *
 * Its colours on a theme surface still need a light value and a `dark:`
 * partner, which the sweep at the bottom of this block holds for every
 * constant in the file.
 */
describe('the ribbon is a panel in the accordions’ family', () => {
  it('wears the shared panel surface, which carries the border in both themes', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);
    const root = container.firstElementChild as HTMLElement;

    expect(root.className).toContain(PANEL_SURFACE);
    // The box is closed by the panel's own 1px border, as a pair — the part the
    // old glass bar had to be given back after it shipped without one.
    expect(PANEL_SURFACE).toContain('border-slate-300');
    expect(PANEL_SURFACE).toContain('dark:border-white/20');
  });

  it('stands its header on the accordions’ row, in their open and closed tones', () => {
    render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);

    expect(getToggle().className).toContain(PANEL_ROW_MIN_H);
    expect(getToggle().className).toContain(PANEL_HEADER_OPEN);
    expect(getToggle().className).not.toContain(PANEL_HEADER_CLOSED);

    fireEvent.click(getToggle());
    expect(getToggle().className).toContain(PANEL_HEADER_CLOSED);
    expect(getToggle().className).not.toContain(PANEL_HEADER_OPEN);
  });

  it('names itself in the section voice, as every accordion does', () => {
    expect(RIBBON_HEADER_TITLE).toMatch(/(^|\s)t-section(\s|$)/);

    render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);
    const title = screen.getByText('HSC Command Verb Hierarchy');
    expect(title.className).toContain(RIBBON_HEADER_TITLE);
    // The accordions' own pair: quiet while shut, full ink while open.
    expect(title.className).toContain('text-slate-900 dark:text-white');
    fireEvent.click(getToggle());
    expect(title.className).toContain('text-slate-500 dark:text-slate-400');
  });

  it('is bounded by its own border, not by hairlines above and below', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);

    // The two gradient rules that used to mark where the reference began and
    // ended. With a surface of its own they are a second boundary beside the
    // first, and the one place in the workspace that drew a boundary twice.
    expect(container.querySelector('.h-px.bg-gradient-to-r')).toBeNull();
    expect((container.firstElementChild as HTMLElement).firstElementChild).toBe(getToggle());
    expect((container.firstElementChild as HTMLElement).lastElementChild).not.toBe(getToggle());
  });

  it('opens onto the accordions’ body, with the one rhythm between its three blocks', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);

    const body = container.querySelector(`[class="${RIBBON_BODY}"]`) as HTMLElement;
    expect(body).toBeTruthy();
    expect(RIBBON_BODY).toContain('border-t border-slate-300 dark:border-white/10');
    expect(RIBBON_BODY).toContain('space-y-5');
    // The brief, the ladder and the footer, and nothing outside it.
    expect(body.children).toHaveLength(3);
    expect(body.closest(`[id="${getToggle().getAttribute('aria-controls')}"]`)).toBeTruthy();
  });

  it('no longer hangs a full-bleed gradient across the whole bar', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);

    expect(container.querySelector('button > .absolute.inset-0.bg-gradient-to-r')).toBeNull();
    expect(getToggle().className).not.toContain('bg-gradient-to-r');
    // …or a 2px underline restating the tier a third time: the tile and the
    // chip carry it while the panel is shut, and the brief's rule once it is open.
    expect(getToggle().querySelector('.absolute')).toBeNull();
  });

  it('states the tier once on the brief, as a rule down its edge, and only when there is one', () => {
    const { container, unmount } = render(
      <CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />
    );

    const rule = container.querySelector(`[class*="${RIBBON_DETAIL_RULE}"]`) as HTMLElement;
    expect(rule).toBeTruthy();
    expect(rule.getAttribute('aria-hidden')).toBe('true');
    // Tier 3's gradient, from the config rather than from a literal here.
    expect(rule.className).toContain('from-yellow-500');
    unmount();

    // With no verb there is no tier to state, so there is no brief and no rule.
    const { container: neutral } = render(<CommandVerbHierarchy />);
    expect(neutral.querySelector(`[class*="${RIBBON_DETAIL_RULE}"]`)).toBeNull();
  });

  it('paints the brief on a neutral surface, not on a wash of the tier', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);

    const card = container.querySelector(`[class*="${RIBBON_DETAIL_CARD}"]`) as HTMLElement;
    expect(card).toBeTruthy();
    // Tier 2's wash, in both themes. It was the loudest object on a page whose
    // other cards are white.
    expect(card.className).not.toContain('bg-orange-500/10');
    expect(card.className).not.toContain('light:bg-orange-100');
    expect(card.className).not.toMatch(/border-orange/);
    expect(RIBBON_DETAIL_CARD).toContain('bg-slate-50');
    expect(RIBBON_DETAIL_CARD).toContain('dark:bg-white/[0.03]');
  });

  it('carries the tier on the icon tile, paired the way getBandConfig intends', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);
    const tile = container.querySelector(`[class*="${RIBBON_HEADER_TILE}"]`) as HTMLElement;

    // Tier 3's solid fill is yellow; `text-white` on it is 1.92:1, which is why
    // the tile wears the config's own `solidText`. `-950`, not `-900`: see the
    // note on `getBandConfig`'s band 3 and the pin in `bandColors.test.ts`.
    expect(tile.className).toContain('bg-yellow-500');
    expect(tile.className).toContain('text-yellow-950');
    expect(tile.className).not.toContain('text-white');
  });

  it('gives every colour on a theme surface a light value and a dark partner', () => {
    /** `hover:bg-slate-100` → `bg`; `text-lg` and `border-b` → null. */
    const colourProperty = (token: string): string | null => {
      const utility = token.split(':').pop() as string;
      const match = utility.match(/^(text|bg|border|from|via|to|shadow|ring|divide)-(.+)$/);
      if (!match) return null;
      const [, property, value] = match;
      // Theme-neutral keywords need no partner; sizes and gradient directions
      // are not colours at all.
      if (/^(transparent|current|inherit|none)$/.test(value)) return null;
      // The alpha may be an arbitrary value — `white/[0.03]` is a real tier-card
      // fill here, and the header's classifier never had to read one.
      const alpha = '(\\/(\\[[^\\]]+\\]|[\\d.]+))?';
      const isColour =
        new RegExp(`^(white|black)${alpha}$`).test(value) ||
        new RegExp(`^[a-z]+-\\d{2,3}${alpha}$`).test(value) ||
        value.startsWith('[rgb(');
      return isColour ? property : null;
    };

    for (const [name, value] of Object.entries(verbRibbonChrome)) {
      if (typeof value !== 'string') continue;

      const tokens = value.split(/\s+/).filter(Boolean);
      const themed = new Set(
        tokens
          .filter((t) => t.startsWith('dark:'))
          .map(colourProperty)
          .filter(Boolean)
      );

      for (const token of tokens) {
        if (token.startsWith('dark:')) continue;
        const property = colourProperty(token);
        if (!property) continue;
        expect(
          themed.has(property),
          `${name} sets \`${token}\` on a theme surface with no dark: partner`
        ).toBe(true);
      }
    }
  });

  it('is written in the new idiom throughout', () => {
    for (const [name, value] of Object.entries(verbRibbonChrome)) {
      if (typeof value !== 'string') continue;
      expect(value, `${name} still uses the legacy light: variant`).not.toContain('light:');
    }
  });
});

/**
 * Three defects in the tier strip, none of which any test could have found: the
 * e2e contrast suite has never rendered this component, and the two worst sites
 * sit on gradients it returns `unassessable` for.
 */
describe('the tier strip is legible and reachable', () => {
  // The system emoji was the one thing in the workspace's chrome drawn by the
  // operating system, not by the app: a different picture on a Chromebook, a
  // Mac and a Windows laptop, in colours that belong to none of the six tiers.
  // TIER_GROUPS keeps its emoji — the generator modal uses it — so the ribbon
  // is pinned not to read it.
  it('draws each tier’s icon from the app, not from the operating system', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);

    for (const group of TIER_GROUPS) {
      expect(container.textContent, `tier ${group.tier} still shows ${group.emoji}`).not.toContain(
        group.emoji
      );
    }

    const tiles = Array.from(container.querySelectorAll(`[class*="${RIBBON_TIER_ICON}"]`));
    expect(tiles).toHaveLength(6);
    for (const tile of tiles) {
      expect(tile.querySelector('svg')).toBeTruthy();
      expect(tile.getAttribute('aria-hidden')).toBe('true');
    }
    // Six tiers, six different glyphs.
    expect(new Set(tiles.map((t) => t.querySelector('svg')!.getAttribute('class'))).size).toBe(6);
  });

  // Six `-100` pastels side by side read as a sweet shop beside a page of white
  // panels. The hue stays on every card — in the tint, the title, the chips and
  // the border — and the saturated fill is left to the one card being read.
  it('tints the five idle headers rather than filling them, and saturates only the selected', () => {
    render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);

    const idle = screen.getByRole('button', { name: /Analyse & Apply Up to Band 4/i });
    expect(idle.className).toContain(RIBBON_TIER_HEADER_IDLE);
    expect(RIBBON_TIER_HEADER_IDLE).toContain('band-wash');
    // Tier 4's own config fill, in either theme.
    expect(idle.className).not.toContain('bg-green-500/10');
    expect(idle.className).not.toContain('light:bg-green-100');

    const current = screen.getByRole('button', { name: /Define & Describe Up to Band 2/i });
    expect(current.className).toContain('bg-gradient-to-r');
    expect(current.className).not.toContain('band-wash');

    // The tint is a property of the card's own `--band-rgb`, so it comes off the
    // one band palette and cannot be a second copy of it.
    const css = readFileSync('index.css', 'utf8');
    expect(css).toMatch(
      /\.band-wash\s*\{\s*background-color:\s*rgb\(var\(--band-rgb\) \/ [\d.]+\);/
    );
  });

  it('pairs every solid tier fill with the config’s own solidText', () => {
    render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);

    // Tier 3 is the one that exposes it: white on yellow-500 is 1.92:1, and
    // `getBandConfig` answers `text-yellow-950` when asked.
    const header = screen.getByRole('button', { name: /Explain & Compare Up to Band 3/i });
    expect(header.className).toContain('text-yellow-950');
    expect(header.className).not.toContain('text-white');

    // By query rather than by text: the timeline footer says "Explain &
    // Compare" as well, and that one is not on a tier fill.
    const title = header.querySelector('h4') as HTMLElement;
    expect(title.textContent).toBe('Explain & Compare');
    expect(title.className).toContain('text-yellow-950');

    const chip = screen.getAllByRole('button', { name: 'EXPLAIN' })[0];
    expect(chip.className).toContain('bg-yellow-500');
    expect(chip.className).toContain('text-yellow-950');
    expect(chip.className).not.toContain('text-white');
  });

  it('leaves no hard text-white anywhere in the strip', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);
    const strip = container.querySelector(`[class="${RIBBON_STRIP}"]`) as HTMLElement;

    expect(strip.innerHTML).not.toContain('text-white');
  });

  // DesignSpec §2, rule 2: white alpha on a theme surface disappears. The ring
  // sat on `light:bg-amber-100` and friends, so a keyboard user in the light
  // theme could not see which tier card had focus.
  it('draws a focus ring that exists in both themes', () => {
    expect(RIBBON_TIER_HEADER).not.toContain('ring-white/50');
    expect(RIBBON_TIER_HEADER).toContain('focus-visible:ring-slate-900/40');
    expect(RIBBON_TIER_HEADER).toContain('dark:focus-visible:ring-white/60');
    // Inset, because the tier card around it is `overflow-hidden` and the
    // global outline is drawn 2px OUTSIDE the button.
    expect(RIBBON_TIER_HEADER).toContain('focus-visible:ring-inset');
    expect(RIBBON_TIER_CARD).toContain('overflow-hidden');
  });

  // Those five cards hold 32 of the 38 verb buttons, and this assertion has
  // now been through three shapes. It pinned `opacity-90` because the two
  // values before it — `opacity-50 light:opacity-70` — measured the subtitles
  // at 2.72:1 against a 4.5 floor, and 90 was the value that got them back to
  // the floor. To the floor, not past it: the sibling assertion below had to
  // darken the text as well, because opacity composites towards the background
  // rather than scaling the ratio.
  //
  // What justified spending any contrast at all was the claim that the real
  // de-emphasis came from `scale-90` and the tier border. Half of that was
  // never true. `scale-90` has never applied — `.clip-stable` claims
  // `transform` at equal specificity and is declared later, so all six cards
  // computed the identity matrix in Chromium — which left `opacity-90` as the
  // only de-emphasis on the strip, paid in the one currency this component has
  // spent three separate fixes learning not to spend.
  //
  // So the dimming is gone entirely, and the pin is inverted: nothing on a
  // receded card may cost contrast. De-emphasis is carried by weight and
  // colour instead — 1px against the current card's 2px, and no ring, glow or
  // shadow — none of which composites into a text reading.
  it('de-emphasises the receded cards without spending contrast', () => {
    expect(RIBBON_TIER_CARD_RECEDED).not.toMatch(/(^|\s)opacity-/);
    expect(RIBBON_TIER_CARD_RECEDED).not.toContain('light:');
    // The lift is a composed transform in `index.css`, not a `scale-*`
    // utility, because `.clip-stable` on the same element would silently win.
    // A `scale-*` here would be the dead class this replaced.
    expect(RIBBON_TIER_CARD_RECEDED).toContain('tier-lift');
    expect(RIBBON_TIER_CARD_RECEDED).not.toMatch(/(^|\s)(hover:)?scale-/);
    expect(RIBBON_TIER_CARD_CURRENT).not.toMatch(/(^|\s)(hover:)?scale-/);
    // Weight marks the selection rather than contradicting it: the current
    // card is the thick one. It used to be the only 1px card in the row.
    expect(RIBBON_TIER_CARD_CURRENT).toContain('border-2');
    expect(RIBBON_TIER_CARD_RECEDED).not.toContain('border-2');
    // The neutral border that outranked the tier's in the dark theme is gone,
    // so all six cards can show their own tier at rest.
    expect(RIBBON_TIER_CARD_IDLE).not.toMatch(/(^|\s)(dark:)?border-/);
  });

  // …and back when the cards WERE dimmed, the dimming alone was not enough.
  // Opacity composites text TOWARDS the background rather than scaling the
  // ratio, so `slate-500` under `opacity-90` measured 3.91:1 in the browser —
  // better than 2.72:1 and still short, where `slate-600` measured 5.83:1.
  // The dimming is gone now (see above), which only widens the margin: the
  // same tint on an undimmed card reads at its full 5.8:1. The pin stays
  // because the tint is the half of that fix worth keeping — it is the tone
  // this text should be at whether or not anything is compositing over it.
  it('darkens the text those cards dim, not just the dimming', () => {
    expect(RIBBON_TIER_SUBTITLE_IDLE).toContain('text-slate-600');
    expect(RIBBON_TIER_SUBTITLE_IDLE).not.toContain('text-slate-500');
  });

  // DesignSpec §4: JetBrains Mono is for "marks, token counts, and system
  // logs". Marks are the first example in that sentence, and the tray's four
  // numbers — the mark range, the band cap, the time range and the syllabus
  // term count — were all set in the body face.
  it('sets the tray numbers in the telemetry face', () => {
    expect(RIBBON_STAT_VALUE).toContain('font-mono');
    // The tray is fixed-width, so a two-digit range must not shove its
    // neighbours along as the verb changes.
    expect(RIBBON_STAT_VALUE).toContain('tabular-nums');
  });
});

/**
 * What the e2e contrast suite found the moment it could reach this component —
 * which, until the ribbon rendered beside the breadcrumb, it never had. Seven
 * text nodes on a plain background fell below the 4.5 floor, and every one of
 * them was an opacity laid over a colour that was fine without it.
 *
 * The numbers below are measured in Chromium at 1400×900 with animations
 * frozen, the way `tests/e2e/support/contrast.ts` measures them: ancestor
 * opacity composited into the reading, not multiplied against the ratio.
 */
describe('nothing in the ribbon is dimmed below the floor', () => {
  // 2.66:1 as `slate-500` under `opacity-70`; 7.24:1 now. Both halves had to
  // move — `slate-500` at full strength is 4.66:1 here, and `slate-600` through
  // `opacity-70` is about 3.4:1, because opacity pulls text towards its
  // background instead of scaling the ratio.
  it('leaves the timeline step labels their contrast', () => {
    expect(RIBBON_TIMELINE_STEP_LABEL_IDLE).toContain('text-slate-600');
    expect(RIBBON_TIMELINE_STEP_LABEL_IDLE).not.toContain('text-slate-500');
    expect(RIBBON_TIMELINE_STEP_LABEL_IDLE).not.toContain('opacity-');
    expect(RIBBON_TIMELINE_STEP_LABEL).not.toContain('opacity-');
  });

  // 2.56:1 — `slate-400`, a dark-theme tone, on a white pill.
  it('gives the threshold marker a light-theme tone', () => {
    expect(RIBBON_TIMELINE_THRESHOLD_CHIP).toContain('text-slate-600');
    expect(RIBBON_TIMELINE_THRESHOLD_CHIP).toContain('dark:text-slate-400');
    expect(RIBBON_TIMELINE_THRESHOLD_CHIP).not.toMatch(/(^|\s)text-slate-400/);
  });

  // The rail is a new block of text on the page background, and the cheap way
  // to make new text stop failing a contrast audit is to `aria-hidden` it:
  // `tests/e2e/support/contrast.ts` skips every node inside an
  // `[aria-hidden="true"]` subtree. That blind spot is exactly what let three
  // contrast defects ship in this component, so the rail is pinned as visible
  // to the audit — and as undimmed, since the other half of every one of those
  // three defects was an `opacity-` laid over a colour that was fine without
  // it.
  it('keeps the scale rail inside the contrast audit', () => {
    expect(RIBBON_SPECTRUM_SCALE_RAIL).not.toContain('opacity-');
    expect(RIBBON_SPECTRUM_SCALE_SPAN).not.toContain('opacity-');
    expect(RIBBON_SPECTRUM_SCALE_SPAN).toContain('text-slate-600');
    expect(RIBBON_SPECTRUM_SCALE_SPAN).toContain('dark:text-slate-400');

    const { container } = render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);
    const rail = container.querySelector(`[class="${RIBBON_SPECTRUM_SCALE_RAIL}"]`) as HTMLElement;
    expect(rail).toBeTruthy();
    expect(rail.getAttribute('aria-hidden')).toBeNull();
    expect(rail.closest('[aria-hidden="true"]')).toBeNull();
  });

  /**
   * The ceiling IS dimmed now — it is an annotation under the tier's name, not
   * a second heading — and the whole point is that it is dimmed the way the
   * rest of this file dims things.
   *
   * It used to carry `opacity-60` over the tier's own `text` colour, which
   * measured 2.97:1 on tier 6 and worse below it: the tier tokens are already
   * the darkest step `getBandConfig` offers, so there was nothing left to
   * darken and the opacity was the whole defect. The step down is a COLOUR now,
   * to the same `slate-600` pair the card's subtitle two lines below uses —
   * measured on this card at 5.8:1, where `slate-500` reads 3.91:1 under the
   * card's own `opacity-90`. Same shape as the three tests above it.
   */
  it('dims each card’s band ceiling by colour, never by opacity', () => {
    render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);

    const header = screen.getByRole('button', { name: /Up to Band 6/i });
    const label = header.querySelector('span') as HTMLElement;
    expect(label.textContent).toBe('Up to Band 6');
    expect(label.className).toContain(RIBBON_TIER_HEADER_LABEL_IDLE);
    expect(RIBBON_TIER_HEADER_LABEL_IDLE).toContain('text-slate-600');
    expect(RIBBON_TIER_HEADER_LABEL_IDLE).not.toMatch(/(^|\s)text-slate-500/);
    expect(label.className).not.toMatch(/opacity-\d/);
  });

  /**
   * …and the card the reader is actually on is NOT dimmed.
   *
   * Its header is a saturated tier gradient. The only steps down from
   * `solidText` there are an alpha that reads differently on each of the six
   * fills — tier 3's yellow has caught this codebase twice — and an opacity
   * DesignSpec §2 rule 3 keeps off readings. On that card the mono face and the
   * weight separate the annotation from the name on their own.
   */
  it('leaves the selected card’s ceiling at full strength', () => {
    render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);

    const header = screen.getByRole('button', { name: /Define & Describe Up to Band 2/i });
    const label = header.querySelector('span') as HTMLElement;
    expect(label.className).not.toContain(RIBBON_TIER_HEADER_LABEL_IDLE);
    expect(label.className).not.toMatch(/opacity-\d/);
  });

  /**
   * The name and the annotation have to be told apart by more than colour, for
   * the selected card where they share one, and for anyone who cannot use hue.
   * Two lines both set in the app's tracked caps read as one two-line title.
   */
  it('sets the tier name and its ceiling in different faces', () => {
    // The name is the app's caps-italic display voice — asserted by what it
    // IS rather than by which token spells it, because it is built from
    // `.t-display` plus the three utilities now that this row wants its own
    // size and tracking. `.t-section` would say the same thing at a fixed 12px
    // and 0.16em, and could not be adjusted from the call site.
    expect(RIBBON_TIER_HEADER_TITLE).toMatch(/(^|\s)t-display(\s|$)/);
    expect(RIBBON_TIER_HEADER_TITLE).toContain('uppercase');
    expect(RIBBON_TIER_HEADER_TITLE).toContain('italic');

    // …and the annotation is none of those, in the mono face.
    expect(RIBBON_TIER_HEADER_LABEL).toContain('font-mono');
    for (const caps of ['t-display', 't-section', 'uppercase', 'italic']) {
      expect(RIBBON_TIER_HEADER_LABEL, `the ceiling must not borrow \`${caps}\``).not.toContain(
        caps
      );
    }
  });

  /**
   * The measurement this test was written for: 4.15:1 on the tier-2 wash the
   * ribbon paints behind the tip, because a `light:text-slate-500` override
   * was making the light theme lighter than the theme had asked for —
   * `--color-text-muted` already resolves to slate-600 under
   * `[data-theme="light"]`.
   *
   * The component it guarded (`StrategyTip`) is gone; the ribbon now renders
   * `StrategyBrief`, the same brief the writing page and the strategy row use.
   * The measurement still binds whatever is painted here, so the assertion
   * follows the content rather than retiring with the component.
   */
  it('lets the muted token be the muted colour in the strategy brief', () => {
    render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);

    // The checks on the verb's method — the ribbon's smallest, palest text.
    const check = document.querySelector(
      'div.border-l-2 p.font-serif.leading-relaxed'
    ) as HTMLElement;
    expect(check).toBeTruthy();
    expect(check.className).toContain('text-[rgb(var(--color-text-muted))]');
    expect(check.className).not.toContain('light:text-slate-500');
  });

  // Headless on this surface: the term is already a heading beside its tier
  // chip and the definition is the line above, so the brief must not say
  // either of them a second time.
  it('does not repeat the verb and its definition the ribbon already states', () => {
    render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);

    const info = getCommandTermInfo('DESCRIBE' as PromptVerb);
    expect(screen.getAllByText(info.definition)).toHaveLength(1);
  });
});

/**
 * The strip is the part of this component a reader is most likely to see half
 * of. It overflows at nearly every width, `scrollbar-hide` removes the only
 * signal that it does, and until now nothing replaced that signal and nothing
 * told a screen-reader user that the 44 buttons in front of them were one
 * ladder.
 */
describe('the tier strip says what it is and where it ends', () => {
  it('is a named group, so 44 buttons read as one ladder', () => {
    render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);

    const strip = screen.getByRole('group', { name: /tier ladder/i });
    expect(strip.className).toBe(RIBBON_STRIP);
    // The name has to say which way it runs; "group" alone says nothing.
    expect(strip.getAttribute('aria-label')).toMatch(/tier 1 to tier 6/i);
  });

  // The edge fades are a MASK on the strip, not two overlays that end in a
  // colour. An overlay has to end in whatever is behind it — it ended in the
  // page's own `from-base` while the strip sat on the page, and once the strip
  // sat on a white panel in the light theme that was a grey smear at each end.
  // A mask fades the cards themselves, so there is no colour to get wrong, and
  // no scroll listener to keep it honest.
  it('fades both edges with a mask, so there is no colour to get wrong', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);

    expect(RIBBON_STRIP).toContain('strip-edge-mask');
    const strip = screen.getByRole('group', { name: /tier ladder/i });
    expect(strip.className).toContain('strip-edge-mask');

    // …and nothing is laid over the strip any more, in the page's colour or
    // anyone else's.
    expect(container.querySelector('[class*="from-base"]')).toBeNull();
    expect(container.querySelector('.pointer-events-none.bg-gradient-to-l')).toBeNull();

    const css = readFileSync('index.css', 'utf8');
    const rule = css.match(/\.strip-edge-mask\s*\{([^}]*)\}/);
    expect(rule, '.strip-edge-mask is not defined in index.css').toBeTruthy();
    expect(rule![1]).toContain('mask-image: linear-gradient(');
    expect(rule![1]).toContain('-webkit-mask-image');
    // Transparent at both ends and opaque between them: a fade in, a fade out.
    expect(rule![1]).toMatch(
      /transparent,\s*#000 [\d.]+rem,\s*#000 calc\(100% - [\d.]+rem\),\s*transparent/
    );
  });

  /**
   * The same rule, for the five gaps cut into the spectrum. They are the surface
   * the track sits on showing through, so they are that surface's TOKENS — a
   * literal here is a gap that stops matching the thing it is cut through.
   *
   * Two tokens, because the surface is two things: in the light theme the panel
   * is the paper (`--color-bg-surface`, which is white), and in the dark one it
   * is a 30% wash of the surface over the page, for which the page is the
   * nearest solid. Plain `bg-base` was right while the ribbon sat on the page;
   * on a white panel it would be five grey slots down the middle of the bar.
   */
  it('cuts its spectrum gaps in the panel’s own surface tokens, not a copy of their values', () => {
    expect(RIBBON_SPECTRUM_BOUNDARY).toMatch(/(^|\s)bg-surface(\s|$)/);
    expect(RIBBON_SPECTRUM_BOUNDARY).toMatch(/(^|\s)dark:bg-base(\s|$)/);
    expect(RIBBON_SPECTRUM_BOUNDARY).not.toMatch(/bg-(slate|white|gray|zinc)-?\d*/);
    // The light value really is the panel's: both are the surface token.
    expect(PANEL_SURFACE).toContain('bg-white');
  });

  it('snaps proximately, because three things scroll this strip', () => {
    expect(RIBBON_STRIP).toContain('snap-proximity');
    expect(RIBBON_STRIP).not.toContain('snap-mandatory');
  });

  // WCAG 2.1.1 is satisfied by the focusable children. A tab stop on the
  // scroller would be a 51st one in front of the fifty already there.
  it('does not put a tab stop on the scroller itself', () => {
    render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);
    const strip = screen.getByRole('group', { name: /tier ladder/i });
    expect(strip.getAttribute('tabindex')).toBeNull();
  });
});

/**
 * The cognitive spectrum, and the four things about the old bar that were not
 * design decisions but arithmetic.
 *
 * The fill ran to `tier / 6` while the dots were laid out by `justify-between`
 * — so the two halves of the same diagram were on different scales, and below
 * `sm`, where five of the six labels are `hidden`, the dots moved depending on
 * which tier was current. The four "measurement ticks" sat at 16/38.7/61.3/84%
 * and marked none of the five boundaries. The fill was one tier's own gradient
 * stretched across the lit portion, so the bar was monochrome. And the current
 * dot carried `animate-ping`, which is `1s infinite`, on a strip that is
 * mounted for the whole session.
 *
 * All four are decidable from the DOM, which is why they are pinned here rather
 * than left to a screenshot this project has no baseline for.
 */
describe('the cognitive spectrum lights one geometry from one palette', () => {
  /** The two gradient layers, found the way they are drawn: the only inline
   *  `linear-gradient` in the component. `MeshOverlay`'s inline background is a
   *  `url(...)`, so it does not answer here. */
  const spectrumLayers = (container: HTMLElement): HTMLElement[] =>
    Array.from(container.querySelectorAll('div')).filter((el) =>
      el.style.backgroundImage.startsWith('linear-gradient')
    );

  const dormantLayer = (container: HTMLElement): HTMLElement =>
    spectrumLayers(container).filter((el) => !el.style.clipPath)[0];

  const litLayer = (container: HTMLElement): HTMLElement =>
    spectrumLayers(container).filter((el) => el.style.clipPath)[0];

  // The drift guard. `components/CognitiveSpectrum.tsx` — deleted with this
  // redesign — held a hard-coded fourth copy of these six values in a `switch`,
  // which is the class of mistake `bandColors.test.ts` exists to prevent. The
  // spectrum has to be readable as "the band palette, laid end to end".
  it('paints the spectrum from BAND_HEX rather than from literals', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);
    const wash = dormantLayer(container).style.backgroundImage;

    let cursor = -1;
    for (const tier of [1, 2, 3, 4, 5, 6]) {
      const at = wash.indexOf(BAND_HEX[tier], cursor + 1);
      expect(
        at,
        `BAND_HEX[${tier}] (${BAND_HEX[tier]}) is missing or out of tier order`
      ).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it('lights the spectrum to the tier’s share of six', () => {
    const { container: first } = render(
      <CommandVerbHierarchy currentVerb={'IDENTIFY' as PromptVerb} />
    );
    // Tier 1: one sixth lit, five sixths clipped away from the right.
    expect(litLayer(first).style.clipPath).toBe('inset(0 83.333% 0 0)');

    cleanup();
    const { container: last } = render(
      <CommandVerbHierarchy currentVerb={'EVALUATE' as PromptVerb} />
    );
    expect(litLayer(last).style.clipPath).toBe('inset(0 0% 0 0)');
  });

  // `width: 50%` on a gradient element does not reveal half a gradient — it
  // rescales the whole gradient into half the width, so at tier 3 all six
  // colours are crushed into the lit portion and every colour moves as the tier
  // changes. `inset()` clips a full-width gradient and nothing moves.
  it('clips the lit layer rather than resizing it', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);
    const lit = litLayer(container);

    expect(lit.style.width).toBe('');
    expect(lit.getAttribute('style')).not.toMatch(/(^|;)\s*width\s*:/);
    expect(lit.className).toContain('inset-0');
  });

  // `animate-ping` is `1s … infinite` and this component is never unmounted:
  // it ran behind every student for as long as they wrote. The replacement is
  // a 900ms one-shot that replays by `key`, so the net budget is one infinite
  // animation removed and one one-shot added.
  it('runs nothing forever in a strip that is always mounted', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);

    expect(container.innerHTML).not.toContain('animate-ping');
    expect(container.innerHTML).not.toContain('animate-pulse');
    // And the one-shot is actually there, keyed so it can replay.
    expect(container.innerHTML).toContain('animate-tier-ignite');
  });

  it('puts each dot at the centre of its own band', () => {
    render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);

    // Band 1 owns [0, 16.667]; its centre is 8.333. Band 6 owns
    // [83.333, 100]; its centre is 91.667. Under `justify-between` the first
    // dot sat at 0 and the last at 100 — neither inside the band it names.
    expect(screen.getByRole('button', { name: /Show tier 1 verbs/i }).style.left).toBe('8.333%');
    expect(screen.getByRole('button', { name: /Show tier 6 verbs/i }).style.left).toBe('91.667%');
  });

  // Four hairlines and one slot. The spectrum runs continuously through four
  // boundaries and is CUT at the fifth, which is the only language a bar has
  // for "a step up in kind, not degree" — and the boundary it is cut at is the
  // one `getTierTargetBand` stops returning 3 across. Keyed off the inline
  // `left` rather than off array order, so this holds whatever order the
  // notches are emitted in.
  it('cuts the deep-learning boundary wider than the four ordinary ones', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);

    const notches = Array.from(
      container.querySelectorAll(`[class*="${RIBBON_SPECTRUM_BOUNDARY}"]`)
    ) as HTMLElement[];
    expect(notches).toHaveLength(5);

    const threshold = notches.filter((el) => el.style.left === '50%');
    expect(threshold).toHaveLength(1);
    expect(threshold[0].className).toContain('w-2');

    for (const other of notches.filter((el) => el.style.left !== '50%')) {
      expect(other.className).toContain('w-0.5');
      expect(other.className).not.toContain('w-2');
    }
  });

  // `index.css` neutralises animation under `prefers-reduced-motion` with
  // `animation-duration: 0.01ms` and `animation-iteration-count: 1`, which does
  // not skip the animation — it runs it once, instantly, and LANDS ON ITS FINAL
  // FRAME. A flare whose last frame were `opacity: 0.85` would burn a permanent
  // bloom into the bar for exactly the readers who asked for no motion.
  it('ends its ignition keyframe at rest, so reduced motion leaves nothing burned in', () => {
    const keyframes = tailwindConfig.theme.extend.keyframes as Record<
      string,
      Record<string, Record<string, string>>
    >;

    expect(keyframes.tierIgnite).toBeTruthy();
    expect(keyframes.tierIgnite['100%'].opacity).toBe('0');
    expect(keyframes.tierIgnite['100%'].transform).toBe('scaleX(1) scaleY(1)');
    // Transform and opacity only, so it stays on the compositor — the rule the
    // comment above `keyframes` in tailwind.config.js states for all of them.
    for (const frame of Object.values(keyframes.tierIgnite)) {
      expect(Object.keys(frame).sort()).toEqual(['opacity', 'transform']);
    }

    // The dot's bloom is a second keyframe and the same rule binds it.
    expect(keyframes.dotBloom).toBeTruthy();
    expect(keyframes.dotBloom['100%'].opacity).toBe('0');
    for (const frame of Object.values(keyframes.dotBloom)) {
      expect(Object.keys(frame).sort()).toEqual(['opacity', 'transform']);
    }
  });

  // `tierIgnite` is shaped for a bar segment: `scaleY(2.4)` with no matching
  // `scaleX`. On a `rounded-full` child that is not a halo, it is a vertical
  // teardrop, held for 900ms every time the question changes. The dot's own
  // bloom scales uniformly, so a circle stays a circle.
  it('blooms the current dot as a circle, not with the bar’s flare', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);

    const halo = container.querySelector('.animate-dot-bloom') as HTMLElement;
    expect(halo).toBeTruthy();
    expect(halo.className).toContain('rounded-full');
    expect(halo.className).not.toContain('animate-tier-ignite');

    const keyframes = tailwindConfig.theme.extend.keyframes as Record<
      string,
      Record<string, Record<string, string>>
    >;
    // Uniform `scale(n)` — never `scaleX`/`scaleY`, which is what made the
    // teardrop.
    for (const frame of Object.values(keyframes.dotBloom)) {
      expect(frame.transform).toMatch(/^scale\([\d.]+\)$/);
    }
  });
});

describe('the six tiers at laptop width', () => {
  // The strip scrolled at every width, so on a 1280px laptop the top of the
  // ladder — Evaluate — was off-screen and Discuss was cut in half.
  it('lays the six tiers side by side from xl, with no fade over edges that do not scroll', () => {
    expect(RIBBON_STRIP).toContain('xl:grid');
    expect(RIBBON_STRIP).toContain('xl:grid-cols-6');
    expect(RIBBON_STRIP).toContain('xl:overflow-visible');

    // The mask is switched off at the same width the grid takes over. Tailwind's
    // `xl` is 1280px and this config does not override the screens.
    expect((tailwindConfig.theme as { screens?: unknown }).screens).toBeUndefined();
    const css = readFileSync('index.css', 'utf8');
    const off = css.match(/@media \(min-width: 1280px\)\s*\{\s*\.strip-edge-mask\s*\{([^}]*)\}/);
    expect(off, 'the mask is never switched off at xl').toBeTruthy();
    expect(off![1]).toContain('mask-image: none');
  });
});
