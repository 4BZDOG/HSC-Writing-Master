import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import CommandVerbHierarchy from '../../components/CommandVerbHierarchy';
import { PromptVerb } from '../../types';
import * as verbRibbonChrome from '../../utils/verbRibbonChrome';
import {
  RIBBON_DETAIL_CARD,
  RIBBON_DETAIL_TERM,
  RIBBON_HEADER_BAR,
  RIBBON_HEADER_TILE,
  RIBBON_ROOT,
  RIBBON_STAT_TRAY,
  RIBBON_STAT_VALUE,
  RIBBON_STRIP,
  RIBBON_TIER_CARD,
  RIBBON_TIER_CARD_DIMMED,
  RIBBON_TIER_HEADER,
  RIBBON_TIER_SUBTITLE_IDLE,
  RIBBON_TIER_UNDERLINE,
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
    expect(term.closest(`[class*="${RIBBON_DETAIL_CARD.split(' ')[0]}"]`)).toBeTruthy();
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

    const header = screen.getByRole('button', { name: /Band 1 ceiling Remember & List/i });
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
 * The bar stopped being a full-bleed tier gradient and became glass, which is
 * the moment every white-alpha value on it changed meaning. DesignSpec §2 asks
 * "what is it painted on?", and the honest answer for anything on the bar is
 * now "a theme colour" — so it needs a light value and a `dark:` partner. The
 * tier survives on a 36px tile and a 2px underline, both of which are solid
 * tier fills and take their colours from the tier config at the call site.
 */
describe('the bar carries both themes', () => {
  it('paints its own background in light and in dark', () => {
    expect(RIBBON_HEADER_BAR).toContain('bg-white/60');
    expect(RIBBON_HEADER_BAR).toContain('dark:bg-[rgb(var(--color-bg-surface))]/40');
    expect(RIBBON_HEADER_BAR).toContain('backdrop-blur-xl');
    expect(RIBBON_HEADER_BAR).toContain('text-slate-900 dark:text-white');
  });

  it('no longer hangs a full-bleed gradient across the whole bar', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);

    expect(container.querySelector('button > .absolute.inset-0.bg-gradient-to-r')).toBeNull();
    expect(getToggle().className).not.toContain('bg-gradient-to-r');
  });

  it('states the tier on a 2px underline instead, and only when there is one', () => {
    const { container, unmount } = render(
      <CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />
    );

    const underline = container.querySelector(`[class*="${RIBBON_TIER_UNDERLINE}"]`) as HTMLElement;
    expect(underline).toBeTruthy();
    expect(underline.getAttribute('aria-hidden')).toBe('true');
    // Tier 3's gradient, from the config rather than from a literal here.
    expect(underline.className).toContain('from-yellow-500');
    unmount();

    // With no verb there is no tier to state, so there is no underline.
    const { container: neutral } = render(<CommandVerbHierarchy />);
    expect(neutral.querySelector(`[class*="${RIBBON_TIER_UNDERLINE}"]`)).toBeNull();
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
  it('pairs every solid tier fill with the config’s own solidText', () => {
    render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);

    // Tier 3 is the one that exposes it: white on yellow-500 is 1.92:1, and
    // `getBandConfig` answers `text-yellow-950` when asked.
    const header = screen.getByRole('button', { name: /Band 3 ceiling Explain & Compare/i });
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

  // Those five cards hold 32 of the 38 verb buttons. At `opacity-70` their
  // subtitles measured 2.72:1 against a 4.5 floor.
  it('stops dimming the cards below the contrast floor', () => {
    expect(RIBBON_TIER_CARD_DIMMED).toContain('opacity-90');
    expect(RIBBON_TIER_CARD_DIMMED).not.toContain('opacity-50');
    expect(RIBBON_TIER_CARD_DIMMED).not.toContain('light:');
  });

  // …and the dimming alone was not enough. Opacity composites text TOWARDS the
  // background rather than scaling the ratio, so `slate-500` under `opacity-90`
  // measured 3.91:1 in the browser — better than 2.72:1 and still short.
  // `slate-600` under the same dimming measures 5.83:1.
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
