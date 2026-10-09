import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import { render, screen, cleanup, fireEvent, act, within } from '@testing-library/react';
import CommandVerbHierarchy from '../../components/CommandVerbHierarchy';
import StrategyBrief from '../../components/StrategyBrief';
import { commandTerms, getCommandTermInfo, TIER_GROUPS } from '../../data/commandTerms';
import { PANEL_ROW_MIN_H } from '../../utils/panelStyles';
import { PromptVerb } from '../../types';
import * as verbRibbonChrome from '../../utils/verbRibbonChrome';
import {
  BAND_HEX,
  BAND_HEX_INK,
  getBandInkRgb,
  getBandRgb,
  getTierScaleConfig,
} from '../../utils/renderUtils';
import tailwindConfig from '../../tailwind.config.js';
import {
  RIBBON_DRAWER,
  RIBBON_FRAME,
  RIBBON_HEADER_BAR,
  RIBBON_HEADER_CHEVRON_OPEN,
  RIBBON_HEADER_CHEVRON_SHUT,
  RIBBON_HEADER_SUBLABEL,
  RIBBON_HEADER_TILE,
  RIBBON_HEADER_TILE_NEUTRAL,
  RIBBON_HEADER_TITLE,
  RIBBON_INK_AURA,
  RIBBON_INK_AURA_LEAVING,
  RIBBON_INK_CEILING,
  RIBBON_INK_GLOW,
  RIBBON_INK_GLOW_LEAVING,
  RIBBON_INK_HERO,
  RIBBON_INK_SCALE_RAIL,
  RIBBON_INK_SCALE_SPAN,
  RIBBON_INK_SCOREBOARD,
  RIBBON_INK_STAIR,
  RIBBON_INK_STAIR_COLUMN,
  RIBBON_INK_STAIR_IGNITION,
  RIBBON_INK_STAIR_NUMERAL,
  RIBBON_INK_STAIR_STEP,
  RIBBON_INK_STAT_VALUE,
  RIBBON_INK_STEP_LABEL,
  RIBBON_INK_STEP_LABEL_IDLE,
  RIBBON_INK_THRESHOLD_CHIP,
  RIBBON_INK_THRESHOLD_RULE,
  RIBBON_INK_VERB,
  RIBBON_INK_VERB_GLOW,
  RIBBON_INK_VERB_RULE,
  RIBBON_INK_VERB_STAGE,
  RIBBON_MINI_BAR_UNLIT,
  RIBBON_MINI_STAIR,
  RIBBON_PANEL,
  RIBBON_ROOT,
  RIBBON_SELECTED_CHIP,
  RIBBON_SELECTED_LABEL,
  RIBBON_STRIP,
  RIBBON_STRIP_FADE_END,
  RIBBON_STRIP_FADE_START,
  RIBBON_STRIP_FRAME,
  RIBBON_TIER_CARD,
  RIBBON_TIER_CARD_RECEDED,
  RIBBON_TIER_CARD_CURRENT,
  RIBBON_TIER_CARD_IDLE,
  RIBBON_TIER_HALO,
  RIBBON_TIER_SLOT,
  RIBBON_TIER_HEADER,
  RIBBON_TIER_HEADER_IDLE,
  RIBBON_TIER_ICON,
  RIBBON_TIER_HEADER_LABEL,
  RIBBON_TIER_HEADER_LABEL_IDLE,
  RIBBON_TIER_HEADER_TITLE,
  RIBBON_TIER_SUBTITLE_IDLE,
  RIBBON_VERB_CHIP,
  ribbonVerbSize,
} from '../../utils/verbRibbonChrome';

/**
 * The ribbon is the workspace's hero, and `utils/verbRibbonChrome.ts` is where
 * that is written down. That only works if the constants are the thing the
 * ribbon actually wears — a class string left behind in the JSX would silently
 * stop tracking the design, and nothing else in the suite looks at this
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

/** The ribbon's outermost box: the wrapper the stage and its glow sit in. */
const frameOf = (container: HTMLElement): HTMLElement => container.firstElementChild as HTMLElement;

/** The stage itself: the frame's last child, after the glow siblings. */
const rootOf = (container: HTMLElement): HTMLElement =>
  frameOf(container).lastElementChild as HTMLElement;

/** `#rrggbb` as the `rgb(r, g, b)` string jsdom reports a colour back as. */
const asRgb = (hex: string): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

describe('the ribbon wears the shared vocabulary', () => {
  it('dresses its root and its header bar from verbRibbonChrome', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);

    expect(frameOf(container).className).toBe(RIBBON_FRAME);
    expect(rootOf(container).className).toContain(RIBBON_ROOT);
    expect(getToggle().className).toContain(RIBBON_HEADER_BAR);
    // Still on the accordions' row height: a 61px row among 61px rows is what
    // keeps the page's rhythm, hero or not.
    expect(getToggle().className).toContain(PANEL_ROW_MIN_H);
  });

  it('dresses the verb, the hero and the scoreboard', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);

    const term = screen.getAllByText('DESCRIBE').find((el) => el.tagName === 'H4') as HTMLElement;
    expect(term.className).toContain(RIBBON_INK_VERB);
    expect(term.closest(`[class="${RIBBON_INK_HERO}"]`)).toBeTruthy();
    // The cell's parent is the scoreboard, which is what holds the hairlines.
    expect(screen.getByText('Band Cap').closest('div')?.parentElement?.className).toContain(
      RIBBON_INK_SCOREBOARD
    );
    expect(container.querySelectorAll(`[class="${RIBBON_INK_SCOREBOARD}"]`)).toHaveLength(1);
  });

  it('dresses the strip, its tier cards and their headers', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);

    const strip = container.querySelector(`[class="${RIBBON_STRIP}"]`) as HTMLElement;
    expect(strip).toBeTruthy();
    expect(strip.children).toHaveLength(6);
    // Six cells, each holding a card and the halo that marks it. The cell owns
    // the width and the snap point; the card owns the clip and the content.
    for (const slot of Array.from(strip.children)) {
      expect(slot.className).toBe(RIBBON_TIER_SLOT);
      expect(slot.children).toHaveLength(2);
      expect((slot.children[0] as HTMLElement).className).toContain(RIBBON_TIER_CARD);
      expect((slot.children[1] as HTMLElement).className).toContain(RIBBON_TIER_HALO);
    }

    // Name-then-ceiling: the header reads its tier's NAME first and the band
    // it caps at under it, so the accessible name follows that order too.
    const header = screen.getByRole('button', { name: /Remember & List Up to Band 1/i });
    expect(header.className).toContain(RIBBON_TIER_HEADER);
  });

  it('puts the strip in the drawer, under the stage and not inside it', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);

    const drawer = container.querySelector(`[class="${RIBBON_DRAWER}"]`) as HTMLElement;
    expect(drawer).toBeTruthy();
    expect(drawer.querySelector(`[class="${RIBBON_STRIP}"]`)).toBeTruthy();
    const hero = container.querySelector(`[class="${RIBBON_INK_HERO}"]`) as HTMLElement;
    expect(hero.contains(drawer)).toBe(false);
    expect(drawer.contains(hero)).toBe(false);
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
 * The ribbon is a hero, and a hero stands out by being a different object from
 * what is around it. The stage is the part of it under the banner: the verb at
 * poster scale, the staircase and the scoreboard, standing on an ordinary themed
 * drawer.
 *
 * It used to be a near-black slab in BOTH themes, which in the light theme was a
 * 440px block of the page's darkest colour between a white banner and a white
 * drawer, and read as abrasive. It now has a palette for each theme — a soft light
 * ground with dark ink in the light theme, the near-black stage unchanged in the
 * dark — and every colour on it is drawn from that palette, so the two cannot
 * drift apart. The palette is a table of custom properties in `index.css`
 * (`.ribbon-stage`), the class strings in `utils/verbRibbonChrome.ts` name no
 * colour of their own, and the block below reads the table back and measures it.
 *
 * Why not simply lighten the dark ground: the tier hues are the `-500` steps and
 * stop clearing 4.5:1 beyond about #0f172a, so the stage could only ever have been
 * a shade less black. Why not leave the ink as it was: white on a light ground is
 * nothing. Both are held below.
 */
describe('the stage draws every colour from one palette, for both themes', () => {
  const inkExports = Object.entries(verbRibbonChrome).filter(
    ([name, value]) => name.startsWith('RIBBON_INK_') && typeof value === 'string'
  ) as [string, string][];

  it('has constants to hold to it', () => {
    // A guard on the guard: a rename that drops the prefix would leave the two
    // sweeps below passing over an empty list.
    expect(inkExports.length).toBeGreaterThanOrEqual(25);
  });

  it('carries no light: or dark: partner on anything painted on it', () => {
    // The theme lives in the palette, in one place, and not in the class strings:
    // a variant here would be a second place to decide what the light stage is.
    for (const [name, value] of inkExports) {
      expect(value, `${name} has a theme variant; the palette switches the theme`).not.toMatch(
        /(^|\s)[^\s]*(light|dark):/
      );
    }
    // The root is the ground itself, so the same applies to it — with ONE
    // exception, and it is not about the ground. When the ribbon is shut, or no
    // verb is chosen, the root's edge is on the PAGE: white/15 is invisible on a
    // white page, so its neutral border is a themed pair. Everything else on the
    // root is the stage's own.
    const rootThemed = RIBBON_ROOT.split(/\s+/).filter((t) => /^(light|dark):/.test(t));
    expect(rootThemed).toEqual(['dark:border-white/15']);
  });

  it('reads no theme token', () => {
    for (const [name, value] of [...inkExports, ['RIBBON_ROOT', RIBBON_ROOT]]) {
      expect(value, `${name} reads a theme colour token`).not.toContain('--color-');
    }
    // The ground and the ink are the palette's, not a colour named here.
    expect(RIBBON_ROOT).toContain('bg-[rgb(var(--stage-ground))]');
    expect(RIBBON_ROOT).toContain('text-[rgb(var(--stage-ink))]');
    expect(RIBBON_ROOT).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  it('names no ground, ink or hairline colour of its own', () => {
    // A literal `text-white` or `bg-[#0b1322]` here would be correct in one theme
    // and invisible in the other, and no test of a class string would know.
    for (const [name, value] of inkExports) {
      if (name === 'RIBBON_INK_STAIR_IGNITION') continue;
      expect(value, `${name} names a hex colour`).not.toMatch(/#[0-9a-f]{3,8}/i);
      expect(value, `${name} names a ground, ink or hairline colour`).not.toMatch(
        /(^|[\s:])(text|bg|border|ring|ring-offset)-(white|black|slate-\d+)(\/[\d.[\]]+)?(\s|$)/
      );
    }
  });

  it('names no tone the ground cannot carry, and dims nothing with opacity', () => {
    for (const [name, value] of inkExports) {
      // The one exemption, and it is not a dim: the flare's `opacity-0` is its
      // RESTING state. It fires after a delay, `tier-ignite` fills forwards only,
      // and without a resting opacity the overlay would sit at full strength in
      // the tier's hex for the length of that delay. It carries no text.
      if (name === 'RIBBON_INK_STAIR_IGNITION') continue;
      // `slate-500` is 4.1:1 on this ground, measured; 600 and darker are worse.
      expect(value, `${name} sets text in a tone too dark for the ground`).not.toMatch(
        /text-slate-[5-9]00/
      );
      // DesignSpec §2 rule 3: de-emphasis is a colour, never an opacity.
      expect(value, `${name} dims with opacity`).not.toMatch(/(^|\s)opacity-/);
    }
  });

  it('puts no theme variant in anything the stage renders', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);

    const drawer = container.querySelector(`[class="${RIBBON_DRAWER}"]`) as HTMLElement;
    // The banner is NOT the stage: it is a themed bar (see RIBBON_HEADER_BAR),
    // held to the opposite rule by the block below. So it is skipped here, as the
    // drawer is — the stage is what is between them.
    const banner = getToggle();
    const themed = /(^|\s)[^\s]*(light|dark):|--color-/;
    const offenders = Array.from(container.querySelectorAll('*'))
      .filter((el) => !drawer.contains(el) && el !== drawer)
      .filter((el) => !banner.contains(el) && el !== banner)
      // The root's neutral edge is a themed pair, because on a shut ribbon it
      // sits on the page rather than on the stage — pinned above.
      .filter((el) => el !== rootOf(container))
      // The mesh's strokes are white, which paint nothing on the light stage, so
      // it is switched off there (`darkOnly`) and not left as an invisible layer.
      // A text-free decoration, with no colour of its own to get wrong.
      .filter((el) => !(el.className.toString().includes('dark:block') && !el.textContent))
      .map((el) => `${el.tagName}.${el.getAttribute('class')}`)
      .filter((described) => themed.test(described.slice(described.indexOf('.') + 1)));
    expect(offenders, `theme variants on the stage:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('sets the brief in colours it names, and the surface tone still uses the tokens', () => {
    render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);

    // The checks on the verb's method — the stage's smallest, palest text.
    const check = document.querySelector(
      'div.border-l-2 p.font-serif.leading-relaxed'
    ) as HTMLElement;
    expect(check).toBeTruthy();
    // The stage's own secondary ink, from the palette: slate-300 on the dark
    // stage and slate-600 on the light one.
    expect(check.className).toContain('text-[rgb(var(--stage-ink-3))]');
    expect(check.className).not.toContain('--color-text');
    cleanup();

    // …and the default is untouched: the same brief on a themed surface reads
    // the muted token, which `light:text-slate-500` once overrode into a
    // lighter tone than the light theme had asked for (4.15:1 on a tier wash).
    const { container } = render(<StrategyBrief verb={'DESCRIBE' as PromptVerb} />);
    const surfaceCheck = container.querySelector(
      'div.border-l-2 p.font-serif.leading-relaxed'
    ) as HTMLElement;
    expect(surfaceCheck.className).toContain('text-[rgb(var(--color-text-muted))]');
    expect(surfaceCheck.className).not.toContain('light:text-slate-500');
  });

  it('is lit from one custom property, drawn from the one band palette', () => {
    for (const [verb, tier] of [
      ['IDENTIFY', 1],
      ['EXPLAIN', 3],
      ['EVALUATE', 6],
    ] as const) {
      const { container, unmount } = render(
        <CommandVerbHierarchy currentVerb={verb as PromptVerb} />
      );
      expect(rootOf(container).style.getPropertyValue('--band-rgb')).toBe(getBandRgb(tier));
      // The edge is drawn from the same property, not from a literal…
      expect(rootOf(container).style.borderColor).toContain('var(--band-rgb)');
      // …and so is the glow beneath it, which is a sibling layer in the frame
      // and not a shadow on the stage (see `RIBBON_INK_GLOW`).
      const glow = container.querySelector(`[class="${RIBBON_INK_GLOW}"]`) as HTMLElement;
      expect(glow, 'no glow under a tier-lit stage').toBeTruthy();
      expect(glow.style.getPropertyValue('--band-rgb')).toBe(getBandRgb(tier));
      expect(rootOf(container).style.boxShadow).toBe('');
      unmount();
    }
  });

  it('keeps a neutral light, and no glow, when no verb is chosen', () => {
    const { container } = render(<CommandVerbHierarchy />);

    // A cool slate — nobody's tier. Red would say "Band 1" to a student who has
    // chosen nothing.
    expect(rootOf(container).style.getPropertyValue('--band-rgb')).toBe('100 116 139');
    expect(rootOf(container).style.borderColor).toBe('');
    expect(container.querySelector(`[class="${RIBBON_INK_GLOW}"]`)).toBeNull();
  });

  // The aura is the one gradient on the stage, and `tests/e2e/support/
  // contrast.ts` returns `unassessable` for any text whose background chain
  // meets a gradient. So it is a SIBLING of the content: with it beside the
  // text rather than behind it in the tree, every text node's nearest
  // background is the flat ground and the light-theme audit can measure it.
  it('is a sibling of the content, never an ancestor of any text', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);

    const aura = container.querySelector(`[class*="${RIBBON_INK_AURA}"]`) as HTMLElement;
    expect(aura).toBeTruthy();
    expect(aura.getAttribute('aria-hidden')).toBe('true');
    expect(aura.textContent).toBe('');
    expect(aura.children).toHaveLength(0);
    expect(aura.parentElement).toBe(rootOf(container));
    // …and nothing with text in it has the aura as an ancestor.
    expect(container.querySelector(`[class*="${RIBBON_INK_AURA}"] *`)).toBeNull();
  });

  it('re-lights on a change of tier, and stays put on a change within one', () => {
    const { container, rerender } = render(
      <CommandVerbHierarchy currentVerb={'IDENTIFY' as PromptVerb} />
    );
    const first = container.querySelector(`[class*="${RIBBON_INK_AURA}"]`);

    // Same tier: the same light, and nothing leaving.
    fireEvent.click(screen.getByRole('button', { name: 'RECALL' }));
    expect(container.querySelector(`[class*="${RIBBON_INK_AURA}"]`)).toBe(first);
    expect(container.querySelector(`[class*="${RIBBON_INK_AURA_LEAVING}"]`)).toBeNull();

    // A verb of another tier: a new element, which is what replays the fade.
    rerender(<CommandVerbHierarchy currentVerb={'EVALUATE' as PromptVerb} />);
    expect(container.querySelector(`[class*="${RIBBON_INK_AURA}"]`)).not.toBe(first);
  });

  // The aura used to be re-keyed and nothing more, which takes the old light
  // away on the same frame the new one starts from nothing: every change of tier
  // dipped the stage to bare black and came back up. It is a cross-fade now — the
  // light the stage is leaving stays under the new one, fading out as it fades in,
  // and is removed once it is gone.
  describe('cross-fades the light between tiers instead of dipping to black', () => {
    it('keeps the outgoing light, in the outgoing tier’s colour, until the fade is done', () => {
      vi.useFakeTimers();
      try {
        const { container, rerender } = render(
          <CommandVerbHierarchy currentVerb={'IDENTIFY' as PromptVerb} />
        );
        expect(container.querySelector(`[class*="${RIBBON_INK_AURA_LEAVING}"]`)).toBeNull();
        expect(container.querySelector(`[class="${RIBBON_INK_GLOW_LEAVING}"]`)).toBeNull();

        rerender(<CommandVerbHierarchy currentVerb={'EVALUATE' as PromptVerb} />);

        const leaving = container.querySelector(
          `[class*="${RIBBON_INK_AURA_LEAVING}"]`
        ) as HTMLElement;
        expect(leaving, 'the outgoing light was removed on the same frame').toBeTruthy();
        expect(leaving.style.getPropertyValue('--band-rgb')).toBe(getBandRgb(1));
        // …under the incoming one, which is the stage's own colour.
        const incoming = container.querySelector(`[class*="${RIBBON_INK_AURA}"]`) as HTMLElement;
        expect(rootOf(container).style.getPropertyValue('--band-rgb')).toBe(getBandRgb(6));
        expect(incoming).not.toBe(leaving);
        // Nothing with text in it, and a sibling of the stage's content like the aura.
        expect(leaving.textContent).toBe('');
        expect(leaving.getAttribute('aria-hidden')).toBe('true');
        expect(leaving.parentElement).toBe(rootOf(container));
        // The glow under the stage hands over the same way.
        expect(container.querySelector(`[class="${RIBBON_INK_GLOW_LEAVING}"]`)).toBeTruthy();

        act(() => {
          vi.advanceTimersByTime(1000);
        });
        expect(container.querySelector(`[class*="${RIBBON_INK_AURA_LEAVING}"]`)).toBeNull();
        expect(container.querySelector(`[class="${RIBBON_INK_GLOW_LEAVING}"]`)).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('fades the two layers on one duration and one curve, so they sum to one', () => {
      const { animation } = tailwindConfig.theme.extend as {
        animation: Record<string, string>;
      };
      const timing = (value: string) => value.split(' ').slice(1, 3).join(' ');
      expect(timing(animation['fade-out'])).toBe(timing(animation['fade-in']));
      // The outgoing layer ends at nothing; it is unmounted, never left behind.
      expect(animation['fade-out']).toContain('forwards');
      expect(RIBBON_INK_AURA_LEAVING).toContain('animate-fade-out');
      expect(RIBBON_INK_AURA).toContain('animate-fade-in');
    });
  });
});

describe('the header carries the tier while the ribbon is shut', () => {
  it('names itself in the section voice, and refuses to wrap', () => {
    expect(RIBBON_HEADER_TITLE).toMatch(/(^|\s)t-section(\s|$)/);

    render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);
    const title = screen.getByText('HSC Command Verb Hierarchy');
    expect(title.className).toContain(RIBBON_HEADER_TITLE);
    expect(title.className).toContain('truncate');
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

  // Open, the verb is set at poster scale a few inches below, and a chip
  // repeating it in the bar is the same fact twice on one screen. It stays in
  // the document — the height lock and the tests both depend on it — and only
  // its display changes, which is a class and so is pinned here.
  it('shows the selected chip only while the ribbon is shut, and only from sm', () => {
    render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);

    const chip = screen.getAllByText('EXPLAIN').find((el) => el.tagName === 'DIV') as HTMLElement;
    const wrapper = chip.parentElement as HTMLElement;
    expect(wrapper.className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(wrapper.className).toContain('sm:group-aria-[expanded=false]/header:flex');
    expect(getToggle().className).toContain('group/header');
  });

  it('draws the ceiling in miniature: six bars, lit to the tier, from sm', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);

    const mini = container.querySelector(`[class="${RIBBON_MINI_STAIR}"]`) as HTMLElement;
    expect(mini).toBeTruthy();
    expect(mini.getAttribute('aria-hidden')).toBe('true');
    expect(RIBBON_MINI_STAIR).toMatch(/(^|\s)hidden sm:flex/);

    const bars = Array.from(mini.children) as HTMLElement[];
    expect(bars).toHaveLength(6);
    // Tier 3: three lit in their own hues, three unlit. The unlit ones are a
    // CLASS, because the colour that reads on the dark bar (white alpha) is
    // invisible on the white one.
    bars.forEach((bar, index) => {
      if (index < 3) {
        expect(bar.style.backgroundColor).toBe(
          `rgb(${getBandRgb(index + 1)
            .split(' ')
            .join(', ')})`
        );
        expect(bar.className).not.toContain(RIBBON_MINI_BAR_UNLIT);
      } else {
        expect(bar.style.backgroundColor).toBe('');
        expect(bar.className).toContain(RIBBON_MINI_BAR_UNLIT);
      }
    });
    // Rising, not flat.
    const heights = bars.map((bar) => parseFloat(bar.style.height));
    expect([...heights].sort((a, b) => a - b)).toEqual(heights);
    expect(new Set(heights).size).toBe(6);
  });

  it('draws no miniature when there is no tier to light it to', () => {
    const { container } = render(<CommandVerbHierarchy />);
    expect(container.querySelector(`[class="${RIBBON_MINI_STAIR}"]`)).toBeNull();
  });
});

/**
 * The verb is the hero element: Inter 900 italic caps at up to 96px. That only
 * holds if every one of the thirty-eight fits where it is put, and the longest of
 * them — DIFFERENTIATE, and the two-word CRITICALLY ANALYSE and CRITICALLY
 * EVALUATE — do not fit where IDENTIFY does. `tests/e2e` cannot run this at six
 * widths in a unit suite, so the rule that chooses the size is pinned here and
 * the geometry is measured in the browser.
 */
describe('the verb is set at poster scale, sized to the word', () => {
  /** The largest size a verb can reach, which only the short ones may. */
  const LARGEST = 'min-[1440px]:text-8xl';

  it('wears the display voice, lit from behind by the tier', () => {
    expect(RIBBON_INK_VERB).toMatch(/(^|\s)t-display(\s|$)/);
    expect(RIBBON_INK_VERB).toContain('uppercase');
    expect(RIBBON_INK_VERB).toContain('italic');
    expect(RIBBON_INK_VERB).not.toMatch(/text-\[#/);
  });

  // A 48px `text-shadow` on a 96px glyph is a Gaussian pass over a bitmap about a
  // thousand pixels wide at 3x, redone from scratch every time the word is
  // re-created — which is every chip tap — and on iOS it was the hitch at the
  // start of each swap. The glow is a radial gradient in a sibling instead.
  it('lights the verb from a gradient behind it, not from a blurred text-shadow', () => {
    expect(RIBBON_INK_VERB).not.toContain('text-shadow');
    // Drawn from the stage's one hue, falling to the same colour at zero alpha
    // (`transparent` is rgba(0,0,0,0), which Safari interpolates through grey).
    expect(RIBBON_INK_VERB_GLOW).toContain('radial-gradient(');
    expect(RIBBON_INK_VERB_GLOW).toContain('rgb(var(--band-rgb)/var(--verb-glow))');
    expect(RIBBON_INK_VERB_GLOW).toContain('rgb(var(--band-rgb)/0))');
    expect(RIBBON_INK_VERB_GLOW).not.toContain('transparent');

    render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);
    const term = screen.getAllByText('DESCRIBE').find((el) => el.tagName === 'H4') as HTMLElement;
    const stage = term.parentElement as HTMLElement;
    expect(stage.className).toBe(RIBBON_INK_VERB_STAGE);
    const glow = stage.querySelector(`[class="${RIBBON_INK_VERB_GLOW}"]`) as HTMLElement;
    expect(glow).toBeTruthy();
    // A sibling behind the word and never an ancestor of any text, like the aura.
    expect(glow.textContent).toBe('');
    expect(glow.getAttribute('aria-hidden')).toBe('true');
    expect(glow.compareDocumentPosition(term) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('gives only the short single-word verbs the largest size', () => {
    expect(ribbonVerbSize('IDENTIFY')).toContain(LARGEST);
    expect(ribbonVerbSize('DESCRIBE')).toContain(LARGEST);

    for (const long of [
      'DIFFERENTIATE',
      'DEMONSTRATE',
      'CRITICALLY ANALYSE',
      'CRITICALLY EVALUATE',
    ]) {
      expect(ribbonVerbSize(long), `${long} would not fit at the largest size`).not.toContain(
        LARGEST
      );
    }
  });

  it('never sets a two-word verb above the smallest steps, because it wraps', () => {
    const two = ribbonVerbSize('CRITICALLY EVALUATE');
    expect(two).toBe(ribbonVerbSize('DIFFERENTIATE'));
    expect(two).toContain('text-3xl');
  });

  it('steps down as the word gets longer, and never up', () => {
    const rank = (term: string): number =>
      ribbonVerbSize(term).includes('text-5xl')
        ? 3
        : ribbonVerbSize(term).includes('text-4xl')
          ? 2
          : 1;
    const byLength = Array.from(commandTerms.keys())
      .map((term) => String(term))
      .sort((a, b) => a.length - b.length);

    let previous = Infinity;
    for (const term of byLength.filter((t) => !t.includes(' '))) {
      expect(rank(term), `${term} is larger than a shorter verb`).toBeLessThanOrEqual(previous);
      previous = rank(term);
    }
  });

  it('sizes every one of the thirty-eight to one of exactly three steps', () => {
    const sizes = new Set(
      Array.from(commandTerms.keys()).map((term) => ribbonVerbSize(String(term)))
    );
    expect(sizes.size).toBe(3);
  });

  it('wears its size on the heading, beside the voice', () => {
    render(<CommandVerbHierarchy currentVerb={'DIFFERENTIATE' as PromptVerb} />);

    const term = screen
      .getAllByText('DIFFERENTIATE')
      .find((el) => el.tagName === 'H4') as HTMLElement;
    expect(term.className).toContain(RIBBON_INK_VERB);
    expect(term.className).toContain(ribbonVerbSize('DIFFERENTIATE'));
  });

  // It is drawn from the left on a change of verb, in the same gesture as the
  // dotted underline the question card puts under the verb in the prompt.
  it('underlines the verb with a rule that draws itself in, and replays on a new verb', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);

    const rule = container.querySelector(`[class="${RIBBON_INK_VERB_RULE}"]`) as HTMLElement;
    expect(rule).toBeTruthy();
    expect(rule.getAttribute('aria-hidden')).toBe('true');
    expect(RIBBON_INK_VERB_RULE).toContain('animate-rule-draw');
    expect(RIBBON_INK_VERB_RULE).toContain('origin-left');

    // The block is keyed on the verb, so choosing another remounts the heading
    // and its rule — which is what replays the one-shot.
    const heading = screen.getAllByText('DESCRIBE').find((el) => el.tagName === 'H4');
    fireEvent.click(screen.getByRole('button', { name: 'CLARIFY' }));
    expect(screen.getAllByText('CLARIFY').find((el) => el.tagName === 'H4')).toBeTruthy();
    expect(heading!.isConnected).toBe(false);
  });

  it('says what is missing, and what closes the gap, when no verb is chosen', () => {
    const { container } = render(<CommandVerbHierarchy />);

    expect(screen.getByRole('heading', { name: 'Choose a verb' })).toBeTruthy();
    expect(screen.getByText(/Pick one below to see what it asks for/)).toBeTruthy();
    // It claims nothing about any tier, and draws nothing that depends on one.
    expect(container.querySelector(`[class="${RIBBON_INK_VERB_RULE}"]`)).toBeNull();
    expect(container.querySelector(`[class="${RIBBON_INK_SCOREBOARD}"]`)).toBeNull();
    expect(screen.queryByText(/questions cap a response/)).toBeNull();
  });
});

describe('the scoreboard states what the verb is worth, in telemetry', () => {
  // DesignSpec §4: JetBrains Mono is for "marks, token counts, and system
  // logs". Marks are the first example in that sentence, and the scoreboard's
  // four numbers — the mark range, the band cap, the time range and the
  // syllabus term count — are the app's clearest case of it.
  it('sets the figures in the telemetry face, tabular, and refuses to wrap', () => {
    expect(RIBBON_INK_STAT_VALUE).toContain('font-mono');
    // A two-digit range must not shove its neighbours along as the verb
    // changes.
    expect(RIBBON_INK_STAT_VALUE).toContain('tabular-nums');
    // "4–7 min" was wider than its cell at four across, and wrapped.
    expect(RIBBON_INK_STAT_VALUE).toContain('whitespace-nowrap');
  });

  it('shows all four stats, including on a phone where the old tray hid one', () => {
    render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);

    const info = getCommandTermInfo('DESCRIBE' as PromptVerb);
    for (const label of ['Marks', 'Band Cap', 'Time', 'Terms']) {
      const cell = screen.getByText(label).closest('div') as HTMLElement;
      expect(cell.className).not.toMatch(/(^|\s)hidden(\s|$)/);
      expect(cell.className).not.toContain('sm:flex');
    }
    expect(screen.getByText(info.markRange.join('–'))).toBeTruthy();
    expect(screen.getByText(info.syllabusTerms.join('–'))).toBeTruthy();
    // Two columns on a phone so all four fit; four from `sm`.
    expect(RIBBON_INK_SCOREBOARD).toContain('grid-cols-2');
    expect(RIBBON_INK_SCOREBOARD).toContain('sm:grid-cols-4');
  });

  it('keeps the unit a size down, so the figure holds the scoreboard’s scale', () => {
    render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);

    const info = getCommandTermInfo('DESCRIBE' as PromptVerb);
    const unit = screen.getByText('min');
    expect(unit.className).toContain('text-sm');
    expect((unit.parentElement as HTMLElement).textContent).toBe(`${info.timeRange.join('–')}min`);
  });

  it('draws its hairlines from a one-pixel gap over a lighter ground', () => {
    expect(RIBBON_INK_SCOREBOARD).toContain('gap-px');
    expect(RIBBON_INK_SCOREBOARD).toContain('bg-[rgb(var(--stage-line)/0.1)]');
  });
});

/**
 * The staircase, and the four things about the old bar that were not design
 * decisions but arithmetic.
 *
 * The fill ran to `tier / 6` while the dots were laid out by `justify-between` —
 * so the two halves of the same diagram were on different scales, and below
 * `sm`, where five of the six labels are `hidden`, the dots moved depending on
 * which tier was current. The four "measurement ticks" sat at 16/38.7/61.3/84%
 * and marked none of the five boundaries. The fill was one tier's own gradient
 * stretched across the lit portion, so the bar was monochrome. And the current
 * dot carried `animate-ping`, which is `1s infinite`, on a strip that is mounted
 * for the whole session.
 *
 * The staircase keeps every one of those guarantees in its new shape, and they
 * are decidable from the DOM, which is why they are pinned here rather than left
 * to a screenshot this project has no baseline for.
 */
describe('the staircase lights one geometry from one palette', () => {
  const steps = (): HTMLElement[] =>
    [1, 2, 3, 4, 5, 6].map((tier) =>
      screen.getByRole('button', { name: new RegExp(`Show tier ${tier} verbs`, 'i') })
    );

  const columnOf = (step: HTMLElement): HTMLElement =>
    step.querySelector(`[class*="${RIBBON_INK_STAIR_COLUMN}"]`) as HTMLElement;

  it('is a control, six wide: each step is the column, its numeral and its name', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);

    const stair = container.querySelector(`[class="${RIBBON_INK_STAIR}"]`) as HTMLElement;
    expect(stair).toBeTruthy();
    for (const step of steps()) {
      expect(step.parentElement).toBe(stair);
      expect(step.className).toContain(RIBBON_INK_STAIR_STEP);
      expect(columnOf(step)).toBeTruthy();
    }
  });

  it('names each step by tier, from the one derived label', () => {
    render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);

    const labels = steps().map((step) => step.getAttribute('aria-label'));
    expect(labels[1]).toMatch(/Define/i);
    // "Argue" was a hand-written fourth copy of this label, and named nothing
    // else in the ladder, so the drift was invisible.
    expect(labels[4]).toMatch(/Discuss/i);
    expect(labels.join(' ')).not.toMatch(/Argue/i);
  });

  it('puts each step at the centre of its own band', () => {
    render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);

    // Band 1 owns [0, 16.667]; its centre is 8.333. Band 6 owns
    // [83.333, 100]; its centre is 91.667. Under `justify-between` the first
    // dot sat at 0 and the last at 100 — neither inside the band it names.
    const [first, , , , , last] = steps();
    expect(first.style.left).toBe('8.333%');
    expect(last.style.left).toBe('91.667%');
    // Every step is one sixth wide less a gutter, so neighbours never touch.
    for (const step of steps()) expect(step.style.width).toBe('calc(16.667% - 0.5rem)');
  });

  it('lights exactly the tiers the verb’s ceiling lets through, and hatches the rest', () => {
    render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);

    steps().forEach((step, index) => {
      const column = columnOf(step);
      if (index < 3) {
        // Tier 1–3: a fill in the tier's own hue.
        expect(column.style.backgroundImage, `column ${index + 1}`).toMatch(/^linear-gradient/);
        expect(column.style.backgroundImage).toContain('var(--tier-rgb)');
        expect(column.style.border).toBe('');
      } else {
        // Tier 4–6: present and out of reach — hatched, with a dashed edge.
        expect(column.style.backgroundImage, `column ${index + 1}`).toMatch(
          /^repeating-linear-gradient/
        );
        expect(column.style.border).toContain('dashed');
      }
    });
  });

  it('lights nothing when no verb is chosen — every column is out of reach', () => {
    render(<CommandVerbHierarchy />);

    for (const step of steps()) {
      expect(columnOf(step).style.backgroundImage).toMatch(/^repeating-linear-gradient/);
    }
  });

  it('stands the columns in even steps from a first rung that can be hit', () => {
    render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);

    const fractions = steps().map((step) =>
      parseFloat(columnOf(step).style.height.replace('calc(var(--plot) * ', ''))
    );
    // Tier 1 is 28%, not a sixth: a sliver cannot carry its numeral or be hit
    // with a thumb.
    expect(fractions[0]).toBeCloseTo(0.28, 5);
    expect(fractions[5]).toBeCloseTo(1, 5);
    for (let i = 1; i < fractions.length; i += 1) {
      expect(fractions[i]).toBeGreaterThan(fractions[i - 1]);
    }
    const gaps = fractions.slice(1).map((f, i) => f - fractions[i]);
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0], 5);
  });

  // The drift guard. `components/CognitiveSpectrum.tsx` — deleted with an earlier
  // redesign — held a hard-coded fourth copy of these six values in a `switch`,
  // which is the class of mistake `bandColors.test.ts` exists to prevent. The
  // staircase has to be readable as "the band palette, as six steps".
  it('paints every step from the band palette, never from a literal', () => {
    render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);

    steps().forEach((step, index) => {
      expect(step.style.getPropertyValue('--tier-rgb')).toBe(getBandRgb(index + 1));
    });

    // The one flare is the tier's own hex, which `BAND_HEX` stays the only copy of.
    const flare = document.querySelector(`[class*="${RIBBON_INK_STAIR_IGNITION}"]`) as HTMLElement;
    expect(flare.style.backgroundColor).toBe(asRgb(BAND_HEX[3]));
  });

  it('draws the ceiling once, at the verb’s own tier, in that tier’s colour', () => {
    const { container, rerender } = render(
      <CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />
    );

    const ceilings = container.querySelectorAll(`[class="${RIBBON_INK_CEILING}"]`);
    expect(ceilings).toHaveLength(1);
    const line = ceilings[0] as HTMLElement;
    expect(line.getAttribute('aria-hidden')).toBe('true');
    // At the height of tier 3's column: its fraction of the plot, above the
    // row of names.
    expect(line.style.bottom).toBe('calc(var(--label) + var(--plot) * 0.568)');
    // The tier's hue AS TEXT-GRADE LINE: the bright `-500` on the dark stage and
    // the `-700` on the light one, which `--band-text` resolves per theme.
    expect(line.style.borderColor).toBe('rgb(var(--band-text))');

    // A verb of another tier moves it, and remounts it, which is what replays
    // the draw-in.
    rerender(<CommandVerbHierarchy currentVerb={'EVALUATE' as PromptVerb} />);
    const moved = container.querySelector(`[class="${RIBBON_INK_CEILING}"]`) as HTMLElement;
    expect(moved).not.toBe(line);
    expect(moved.style.bottom).toBe('calc(var(--label) + var(--plot) * 1)');
  });

  it('draws no ceiling when there is nothing to cap', () => {
    const { container } = render(<CommandVerbHierarchy />);
    expect(container.querySelector(`[class="${RIBBON_INK_CEILING}"]`)).toBeNull();
  });

  it('flares only the column the reader has just reached', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);

    const flares = container.querySelectorAll(`[class*="${RIBBON_INK_STAIR_IGNITION}"]`);
    expect(flares).toHaveLength(1);
    expect(steps()[2].contains(flares[0])).toBe(true);
    expect(flares[0].getAttribute('aria-hidden')).toBe('true');
  });

  // The one orchestrated moment this surface has is the staircase building
  // itself, a beat per column from the left, and it is written down as a delay
  // per column — so the stagger is a fact about the column's position, and
  // moving the first column moves nothing else.
  it('builds itself from the left, each column a beat after the one before', () => {
    render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);

    expect(RIBBON_INK_STAIR_COLUMN).toContain('animate-stair-rise');
    // Growing from the foot, not the middle.
    expect(RIBBON_INK_STAIR_COLUMN).toContain('origin-bottom');

    const delays = steps().map((step) => parseFloat(columnOf(step).style.animationDelay));
    // The first column waits for the panel to be mostly open (see
    // STAIR_OPEN_OFFSET_MS): started on the frame the panel begins to unfold it
    // is two-thirds up before anyone can see it.
    expect(delays[0]).toBeGreaterThan(0);
    for (let i = 1; i < delays.length; i += 1) {
      expect(delays[i], `column ${i + 1} does not wait for column ${i}`).toBeGreaterThan(
        delays[i - 1]
      );
    }
    const gaps = delays.slice(1).map((delay, i) => delay - delays[i]);
    for (const gap of gaps) expect(gap).toBe(gaps[0]);
  });

  it('flares after its own column has finished rising, and not before', () => {
    render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);

    const flare = document.querySelector(`[class*="${RIBBON_INK_STAIR_IGNITION}"]`) as HTMLElement;
    const own = parseFloat(columnOf(steps()[2]).style.animationDelay);
    expect(parseFloat(flare.style.animationDelay)).toBeGreaterThan(own);
    // Hidden until its turn: `tier-ignite` fills forwards only, so the overlay
    // would otherwise be a solid block of the tier's hex for the whole delay.
    expect(RIBBON_INK_STAIR_IGNITION).toContain('opacity-0');
  });

  // The reveal belongs to the moment the reader can SEE it. It used to be keyed
  // on the verb alone, which fires it when a question loads — and beneath the
  // breadcrumb the ribbon is shut at that moment, so every one-shot finished
  // unseen and the reader opened a page that was already at rest.
  describe('replays its reveal when the ribbon is opened', () => {
    const ceilingOf = (container: HTMLElement) =>
      container.querySelector(`[class="${RIBBON_INK_CEILING}"]`) as HTMLElement;
    const headingOf = (verb: string) =>
      screen.getAllByText(verb).find((el) => el.tagName === 'H4') as HTMLElement;

    it('remounts the staircase, the ceiling and the verb on opening', () => {
      const { container } = render(
        <CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} defaultOpen={false} />
      );
      const stairBefore = container.querySelector(`[class="${RIBBON_INK_STAIR}"]`);
      const ceilingBefore = ceilingOf(container);
      const headingBefore = headingOf('EXPLAIN');

      fireEvent.click(getToggle());

      expect(container.querySelector(`[class="${RIBBON_INK_STAIR}"]`)).not.toBe(stairBefore);
      expect(ceilingOf(container)).not.toBe(ceilingBefore);
      expect(headingBefore.isConnected).toBe(false);
    });

    it('does not replay on closing — content fading in while the panel folds away', () => {
      const { container } = render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);
      const stairBefore = container.querySelector(`[class="${RIBBON_INK_STAIR}"]`);
      const ceilingBefore = ceilingOf(container);

      fireEvent.click(getToggle());
      expect(getToggle().getAttribute('aria-expanded')).toBe('false');

      expect(container.querySelector(`[class="${RIBBON_INK_STAIR}"]`)).toBe(stairBefore);
      expect(ceilingOf(container)).toBe(ceilingBefore);
    });

    it('does not replay at mount when it starts open, and replays on each later opening', () => {
      const { container } = render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);
      const first = container.querySelector(`[class="${RIBBON_INK_STAIR}"]`);
      // Nothing has changed, so a second look at the DOM is the same node.
      expect(container.querySelector(`[class="${RIBBON_INK_STAIR}"]`)).toBe(first);

      fireEvent.click(getToggle());
      fireEvent.click(getToggle());
      const second = container.querySelector(`[class="${RIBBON_INK_STAIR}"]`);
      expect(second).not.toBe(first);

      fireEvent.click(getToggle());
      fireEvent.click(getToggle());
      expect(container.querySelector(`[class="${RIBBON_INK_STAIR}"]`)).not.toBe(second);
    });
  });

  // `animate-ping` is `1s … infinite` and this component is never unmounted: it
  // ran behind every student for as long as they wrote. The staircase is a
  // one-shot flare and a one-shot line, both replayed by `key`.
  it('runs nothing forever in a surface that is always mounted', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);

    expect(container.innerHTML).not.toContain('animate-ping');
    expect(container.innerHTML).not.toContain('animate-pulse');
    expect(container.innerHTML).toContain('animate-tier-ignite');
    expect(container.innerHTML).toContain('animate-rule-draw');
  });

  // Not `aria-hidden`: `contrast.ts` skips everything inside an `aria-hidden`
  // subtree, and hiding a new block of text from the audit is the blind spot that
  // let this component's first three contrast defects ship. The step's
  // `aria-label` is the name a screen reader gets, so the numeral costs it
  // nothing — but the audit can still see it.
  it('leaves its numerals and names inside the contrast audit', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);

    const numerals = Array.from(
      container.querySelectorAll(`[class*="${RIBBON_INK_STAIR_NUMERAL}"]`)
    );
    expect(numerals.map((n) => n.textContent)).toEqual(['1', '2', '3', '4', '5', '6']);
    for (const numeral of numerals) {
      expect(numeral.closest('[aria-hidden="true"]')).toBeNull();
      expect(numeral.className).toMatch(/text-\[rgb\(var\(--stage-ink(-3)?\)\)\]/);
    }
    for (const label of Array.from(
      container.querySelectorAll(`[class*="${RIBBON_INK_STEP_LABEL}"]`)
    )) {
      expect(label.closest('[aria-hidden="true"]')).toBeNull();
    }
    // The idle names lift on hover by COLOUR — the rule this component spent
    // three fixes learning — and are never dimmed.
    expect(RIBBON_INK_STEP_LABEL_IDLE).toContain('text-[rgb(var(--stage-ink-3))]');
    expect(RIBBON_INK_STEP_LABEL_IDLE).toContain('group-hover/step:text-[rgb(var(--stage-ink))]');
    expect(RIBBON_INK_STEP_LABEL_IDLE).not.toContain('opacity-');
    expect(RIBBON_INK_STEP_LABEL).not.toContain('opacity-');
  });

  it('keeps the scale rail inside the contrast audit, and undimmed', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);

    expect(RIBBON_INK_SCALE_RAIL).not.toContain('opacity-');
    expect(RIBBON_INK_SCALE_SPAN).not.toContain('opacity-');
    expect(RIBBON_INK_SCALE_SPAN).toContain('text-[rgb(var(--stage-ink-3))]');

    const rail = container.querySelector(`[class="${RIBBON_INK_SCALE_RAIL}"]`) as HTMLElement;
    expect(rail).toBeTruthy();
    expect(rail.getAttribute('aria-hidden')).toBeNull();
    expect(rail.closest('[aria-hidden="true"]')).toBeNull();
  });

  // The rail's chip, the dashed rule and (above the ceiling) the gate between
  // tier 3 and tier 4 are one object, and they have to agree.
  it('puts the threshold rule and its chip on the same 50%', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);

    const rule = container.querySelector(`[class="${RIBBON_INK_THRESHOLD_RULE}"]`) as HTMLElement;
    expect(rule).toBeTruthy();
    expect(rule.style.left).toBe('50%');
    expect(RIBBON_INK_THRESHOLD_RULE).toContain('border-dashed');
    // The chip is positioned, but inside the rail and at the same 50%.
    expect(RIBBON_INK_THRESHOLD_CHIP).toContain('left-1/2');
    // Under the columns, so it is a gate between them and not a line through one.
    expect(RIBBON_INK_THRESHOLD_RULE).toContain('z-0');
    expect(RIBBON_INK_STAIR_STEP).toContain('z-10');
  });

  it('sits the stair on custom properties that a phone can step down', () => {
    expect(RIBBON_INK_STAIR).toContain('[--plot:6.5rem]');
    expect(RIBBON_INK_STAIR).toContain('sm:[--plot:8.5rem]');
    expect(RIBBON_INK_STAIR).toContain('[--label:2.25rem]');
    // Its height is a sum of those, never a number of its own.
    expect(RIBBON_INK_STAIR).toContain('h-[calc(var(--plot)+1.5rem+var(--label))]');
  });

  // `index.css` neutralises animation under `prefers-reduced-motion` with
  // `animation-duration: 0.01ms` and `animation-iteration-count: 1`, which does
  // not skip the animation — it runs it once, instantly, and LANDS ON ITS FINAL
  // FRAME. A flare whose last frame were `opacity: 0.85` would burn a permanent
  // bloom into the stage for exactly the readers who asked for no motion; a line
  // that ended at `scaleX(0)` would be missing for them altogether.
  it('ends every one-shot at rest, so reduced motion leaves nothing burned in or missing', () => {
    const keyframes = tailwindConfig.theme.extend.keyframes as Record<
      string,
      Record<string, Record<string, string>>
    >;

    expect(keyframes.tierIgnite).toBeTruthy();
    expect(keyframes.tierIgnite['100%'].opacity).toBe('0');
    expect(keyframes.tierIgnite['100%'].transform).toBe('scaleX(1) scaleY(1)');

    expect(keyframes.ruleDraw).toBeTruthy();
    expect(keyframes.ruleDraw['100%'].transform).toBe('scaleX(1)');
    expect(keyframes.ruleDraw['0%'].transform).toBe('scaleX(0)');

    // …and the staircase's rise ends full height, for the same reason.
    expect(keyframes.stairRise).toBeTruthy();
    expect(keyframes.stairRise['0%'].transform).toBe('scaleY(0)');
    expect(keyframes.stairRise['100%'].transform).toBe('scaleY(1)');

    // Transform and opacity only, so they stay on the compositor — the rule the
    // comment above `keyframes` in tailwind.config.js states for all of them.
    for (const name of ['tierIgnite', 'ruleDraw', 'stairRise']) {
      for (const frame of Object.values(keyframes[name])) {
        for (const property of Object.keys(frame)) {
          expect(['opacity', 'transform']).toContain(property);
        }
      }
    }
  });

  // The global reduced-motion rule shortens every animation's DURATION and leaves
  // its DELAY alone. The staircase staggers by delay, with `both` fill, so each
  // column holds at its first frame until its turn — left as it was, a reader who
  // asked for no motion would still wait a third of a second for the last column
  // to appear. No motion should also mean no waiting.
  it('lets a reader who asked for no motion see the whole staircase at once', () => {
    const css = readFileSync('index.css', 'utf8');
    const block = css.match(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[^@]*?animation-duration: 0\.01ms !important;[\s\S]*?\n\}\n/
    );
    expect(block, 'the global reduced-motion block is not where it was').toBeTruthy();
    expect(block![0]).toMatch(/\.animate-stair-rise\s*\{\s*animation-delay: 0ms !important;/);
  });

  // The dot is gone, and so is its halo. A keyframe nothing uses is a keyframe
  // the next person has to read to find that out.
  it('no longer carries the dot bloom it replaced', () => {
    const keyframes = tailwindConfig.theme.extend.keyframes as Record<string, unknown>;
    const animation = tailwindConfig.theme.extend.animation as Record<string, unknown>;
    expect(keyframes.dotBloom).toBeUndefined();
    expect(animation['dot-bloom']).toBeUndefined();
  });
});

/**
 * The drawer is an ordinary themed surface, so every colour on it needs a light
 * value and a `dark:` partner — DesignSpec §2's question, "what is it painted
 * on?", answered by what is NOT the stage. The stage constants are held to the
 * opposite rule above, and are skipped here on purpose: a partner on a ground
 * with one theme is a second guess at it.
 */
describe('the drawer carries both themes', () => {
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

  it('gives every colour on a theme surface a light value and a dark partner', () => {
    for (const [name, value] of Object.entries(verbRibbonChrome)) {
      if (typeof value !== 'string') continue;
      if (name.startsWith('RIBBON_INK_') || name === 'RIBBON_ROOT') continue;
      // The halo is painted in the tier's own hue from `--band-rgb`, which is one
      // colour in both themes — the same argument `.band-edge` makes in index.css
      // — on an overlay that has no fill of its own. There is no ground for it to
      // get wrong, so a `dark:` partner would only be a second guess at the hue.
      if (name === 'RIBBON_TIER_HALO') continue;

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
    // The lift is a class in `index.css`, not a `scale-*` utility, so it can be
    // gated to devices that can hover. A `scale-*` here would be the dead class
    // this replaced.
    expect(RIBBON_TIER_CARD_RECEDED).toContain('tier-lift');
    expect(RIBBON_TIER_CARD_RECEDED).not.toMatch(/(^|\s)(hover:)?scale-/);
    expect(RIBBON_TIER_CARD_CURRENT).not.toMatch(/(^|\s)(hover:)?scale-/);
    // Weight marks the selection — but it is drawn on the halo overlay now, not
    // by widening the card's own border, so the card is the same box in every
    // state and selecting a tier re-lays out nothing inside it.
    expect(RIBBON_TIER_CARD_CURRENT).not.toContain('border-2');
    expect(RIBBON_TIER_CARD_RECEDED).not.toContain('border-2');
    expect(RIBBON_TIER_HALO).toContain('border-2');
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
});

/**
 * What the e2e contrast suite found the moment it could reach this component —
 * which, until the ribbon rendered beside the breadcrumb, it never had. Seven
 * text nodes on a plain background fell below the 4.5 floor, and every one of
 * them was an opacity laid over a colour that was fine without it.
 *
 * The cards in the drawer are where that history lives, and these pins hold it.
 * The stage's own version of the same rule is in the first block of this file.
 */
describe('nothing in the drawer is dimmed below the floor', () => {
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

  // The edge fades are two small overlays that end in the DRAWER's own colour,
  // and NOT a mask on the strip. A `mask-image` on a scroller makes Safari render
  // the whole scrolling content through a mask layer, which is what a swipe felt
  // like on an iPhone: a stutter under the thumb. They are safe where the old
  // overlays were not because the drawer is opaque in both themes and its fill is
  // the surface token, so there is no page colour to get wrong.
  it('fades both edges with overlays in the drawer’s colour, not a mask on the scroller', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);

    expect(RIBBON_STRIP).not.toContain('strip-edge-mask');
    const strip = screen.getByRole('group', { name: /tier ladder/i });
    expect(strip.className).not.toContain('strip-edge-mask');

    // The strip's parent is the frame the fades are positioned against, and the
    // fades are siblings of the strip — never children, never inside the scroll.
    const frame = strip.parentElement as HTMLElement;
    expect(frame.className).toBe(RIBBON_STRIP_FRAME);
    const start = frame.querySelector(`[class="${RIBBON_STRIP_FADE_START}"]`) as HTMLElement;
    const end = frame.querySelector(`[class="${RIBBON_STRIP_FADE_END}"]`) as HTMLElement;
    for (const fade of [start, end]) {
      expect(fade).toBeTruthy();
      expect(fade.parentElement).toBe(frame);
      expect(fade.getAttribute('aria-hidden')).toBe('true');
      expect(fade.textContent).toBe('');
    }

    expect(container.querySelector('[class*="from-base"]')).toBeNull();

    const css = readFileSync('index.css', 'utf8');
    expect(css, 'a mask-image on the strip is back').not.toMatch(/\.strip-edge-mask/);
    const rule = (name: string) => {
      const match = css.match(new RegExp(`\\.${name}\\s*\\{([^}]*)\\}`));
      expect(match, `.${name} is not defined in index.css`).toBeTruthy();
      return match![1];
    };
    // Opaque at the edge and gone at the far end, in the surface token — and the
    // far stop is the SAME colour at zero alpha, because `transparent` is
    // rgba(0,0,0,0) and Safari interpolates through grey.
    for (const [name, direction] of [
      ['strip-fade-start', 'to right'],
      ['strip-fade-end', 'to left'],
    ]) {
      const body = rule(name);
      expect(body).toContain(`linear-gradient(`);
      expect(body).toContain(direction);
      expect(body).toContain('rgb(var(--color-bg-surface))');
      expect(body).toContain('rgb(var(--color-bg-surface) / 0)');
      expect(body).not.toContain('transparent');
      expect(body).not.toContain('mask');
    }
    // Pinned to the strip's two ends, above the cards, and inert.
    const base = rule('strip-fade');
    expect(base).toContain('position: absolute');
    expect(base).toContain('pointer-events: none');
  });

  // `overscroll-x-contain`: a flick that reaches either end bounces here and
  // stops, rather than chaining to the page or, at the screen edge in Safari,
  // starting the browser's swipe-back.
  it('keeps a flick at the end of the strip from chaining to the page', () => {
    expect(RIBBON_STRIP).toContain('overscroll-x-contain');
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

describe('the six tiers at laptop width', () => {
  // The strip scrolled at every width, so on a 1280px laptop the top of the
  // ladder — Evaluate — was off-screen and Discuss was cut in half.
  it('lays the six tiers side by side from xl, with no fade over edges that do not scroll', () => {
    expect(RIBBON_STRIP).toContain('xl:grid');
    expect(RIBBON_STRIP).toContain('xl:grid-cols-6');
    expect(RIBBON_STRIP).toContain('xl:overflow-visible');

    // The fades are switched off at the same width the grid takes over. Tailwind's
    // `xl` is 1280px and this config does not override the screens.
    expect((tailwindConfig.theme as { screens?: unknown }).screens).toBeUndefined();
    const css = readFileSync('index.css', 'utf8');
    const off = css.match(/@media \(min-width: 1280px\)\s*\{\s*\.strip-fade\s*\{([^}]*)\}/);
    expect(off, 'the fades are never switched off at xl').toBeTruthy();
    expect(off![1]).toContain('display: none');
  });
});

/**
 * Smoothness on a phone.
 *
 * The ribbon was reported glitchy on an iPhone 15 in Safari, and none of it
 * could be seen from a desktop browser. These pin what was changed, because every
 * item here is a thing that looks harmless in a class string and costs frames in
 * WebKit: a blend mode, a mask on a scroller, `transition-all` with an overshoot,
 * a `:hover` that a tap leaves stuck on. They are about what the ribbon is
 * allowed to ask the browser to do, not about how it looks.
 */
describe('the ribbon asks nothing of a phone that it cannot afford', () => {
  /** Every string the chrome module exports that the ribbon wears. */
  const chromeStrings = Object.entries(verbRibbonChrome).filter(
    ([, value]) => typeof value === 'string'
  ) as [string, string][];

  it('lets no :hover through on a device that cannot hover', () => {
    // On a touch screen a tap leaves `:hover` on the element until the next tap
    // elsewhere, so a hover style is a state the control is left in. iOS kept
    // cards enlarged and columns at 125% brightness after a tap, and animated them
    // back when the selection moved. `can-hover:` wraps the rule in
    // `@media (hover: hover)`, which an iPhone reports false.
    for (const [name, value] of chromeStrings) {
      for (const token of value.split(/\s+/)) {
        if (!/(^|:)(group-)?hover([/:]|$)/.test(token)) continue;
        // `can-hover:` may sit behind a theme variant — `dark:can-hover:hover:*`.
        expect(token, `${name} has an ungated hover: ${token}`).toMatch(/(^|:)can-hover:/);
      }
    }
  });

  it('defines can-hover as a media query, and gates the card lift the same way', () => {
    const variants: Record<string, string> = {};
    const plugin = (tailwindConfig.plugins as Array<(api: unknown) => void>)[0];
    plugin({ addVariant: (name: string, query: string) => (variants[name] = query) });
    expect(variants['can-hover']).toBe('@media (hover: hover)');

    // The card lift is a CSS class, so it is gated in the stylesheet.
    const css = readFileSync('index.css', 'utf8');
    const lifts = css.match(/[^{}]*\.tier-lift:hover[^{]*\{[^}]*\}/g) ?? [];
    expect(lifts).toHaveLength(1);
    expect(css).toMatch(/@media \(hover: hover\)\s*\{\s*\.tier-lift:hover\s*\{/);
  });

  it('answers the finger on the first frame, and does not mistake two taps for a zoom', () => {
    // `touch-manipulation` removes double-tap-to-zoom. Chips and steps are tapped
    // in quick succession, and a second tap inside ~300ms was read as a zoom
    // gesture: the page lurched instead of the selection moving.
    for (const [name, value] of [
      ['RIBBON_ROOT', RIBBON_ROOT],
      ['RIBBON_VERB_CHIP', RIBBON_VERB_CHIP],
      ['RIBBON_INK_STAIR_STEP', RIBBON_INK_STAIR_STEP],
      ['RIBBON_TIER_HEADER', RIBBON_TIER_HEADER],
    ]) {
      expect(value, `${name} can be double-tap-zoomed`).toContain('touch-manipulation');
    }
    // A long press on a control selects its label and shows the callout.
    for (const value of [RIBBON_VERB_CHIP, RIBBON_INK_STAIR_STEP, RIBBON_TIER_HEADER]) {
      expect(value).toContain('select-none');
    }
    // A press that sinks, on `transform` only, which the compositor owns.
    expect(RIBBON_VERB_CHIP).toContain('active:scale-95');
    expect(RIBBON_INK_STAIR_STEP).toContain('active:scale-[0.96]');
    expect(RIBBON_INK_STAIR_STEP).toContain('transition-transform');
    expect(RIBBON_HEADER_BAR).toContain('active:bg-slate-200');
    expect(RIBBON_HEADER_BAR).toContain('dark:active:bg-white/[0.07]');
  });

  it('transitions only the properties it names, on curves that do not overshoot', () => {
    for (const [name, value] of chromeStrings) {
      expect(value, `${name} transitions \`all\``).not.toMatch(/(^|\s)transition-all(\s|$)/);
      // `cubic-bezier(0.34, 1.56, 0.64, 1)` pushes the end value past its end
      // and back; on a card's border width and shadow that read as a stutter.
      expect(value, `${name} overshoots`).not.toMatch(/cubic-bezier\(0\.34,\s*1\.56/);
    }
    expect(RIBBON_VERB_CHIP).toContain(
      'transition-[transform,background-color,border-color,color]'
    );
  });

  it('opens and closes on two named properties, on the iOS sheet curve', () => {
    expect(RIBBON_PANEL).toContain('grid-template-rows_420ms_cubic-bezier(0.32,0.72,0,1)');
    expect(RIBBON_PANEL).toMatch(/opacity_320ms_ease-out/);
    expect(RIBBON_PANEL).not.toContain('transition-all');

    const { container } = render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);
    const panel = document.getElementById(
      getToggle().getAttribute('aria-controls')!
    ) as HTMLElement;
    expect(panel.className).toContain(RIBBON_PANEL);
    expect(panel.className).toContain('grid-rows-[1fr]');
    fireEvent.click(getToggle());
    expect(panel.className).toContain('grid-rows-[0fr]');
    expect(panel.className).toContain('opacity-0');
    expect(container).toBeTruthy();
  });

  it('paints no mask, no blend and no permanent layer on the stage or the cards', () => {
    // `.clip-stable` is a permanent compositing layer plus an opaque
    // `-webkit-mask-image`. On the root of a panel that fades, resizes and
    // re-lights itself, and on six cards running a 700ms transition, it asked
    // Safari to re-mask the stage on every frame.
    expect(RIBBON_ROOT).not.toContain('clip-stable');
    expect(RIBBON_TIER_CARD).not.toContain('clip-stable');
    expect(RIBBON_ROOT).toContain('isolate');
    expect(RIBBON_ROOT).toContain('overflow-hidden');
    expect(RIBBON_TIER_CARD).toContain('overflow-hidden');

    const { container } = render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);
    // `mix-blend-mode` renders everything under it offscreen and blends it back,
    // every frame anything under it changes. The ribbon's mesh is plain.
    expect(container.querySelectorAll('[class*="mix-blend"]')).toHaveLength(0);
    expect(container.querySelectorAll('[class*="clip-stable"]')).toHaveLength(0);
    expect(container.querySelectorAll('[class*="backdrop-"]')).toHaveLength(0);
    // The two full-bleed children that could show a square corner for a frame
    // now that the root is not masked round themselves.
    const aura = container.querySelector(`[class*="${RIBBON_INK_AURA}"]`) as HTMLElement;
    expect(aura.className).toContain('rounded-[inherit]');
    const mesh = container.querySelector('[class*="opacity-[0.035]"]') as HTMLElement;
    expect(mesh, 'the stage has no mesh').toBeTruthy();
    expect(mesh.className).toContain('rounded-[inherit]');
  });

  it('sizes the aura and the mesh to a fixed box, not to a stage that is resizing', () => {
    // A layer that tracks a resizing box is re-painted on every frame of the
    // resize. The stage changes height on every frame of the panel's open and
    // close; the aura and the mesh are fixed-height and top-anchored, so the
    // stage clips them and they are painted once.
    for (const value of [RIBBON_INK_AURA, RIBBON_INK_AURA_LEAVING]) {
      expect(value).toContain('h-[80rem]');
      expect(value).toContain('top-0');
      expect(value).not.toMatch(/(^|\s)inset-0(\s|$)/);
    }
    expect(verbRibbonChrome.RIBBON_INK_MESH_BOX).toContain('h-[80rem]');
    // Nor a shadow on the stage: a 70px blur re-rastered per frame was the
    // largest single paint in the move.
    const { container } = render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);
    expect(rootOf(container).style.boxShadow).toBe('');
  });

  it('marks the selected tier with a halo that fades, and moves it on selection', () => {
    // The ring, the 2px edge and the glow are one overlay faded with `opacity`
    // — compositor work — where they were a `transition-all` on the card that
    // re-painted its border width, a blurred shadow and its fill together.
    expect(RIBBON_TIER_HALO).toContain('transition-opacity');
    expect(RIBBON_TIER_HALO).toContain('pointer-events-none');
    expect(RIBBON_TIER_HALO).toContain('border-2');
    expect(RIBBON_TIER_HALO).toContain('shadow-[0_0_0_4px_rgb(var(--band-rgb)/0.18)');

    const { container } = render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);
    const strip = screen.getByRole('group', { name: /tier ladder/i });
    const haloOf = (index: number) => strip.children[index].lastElementChild as HTMLElement;
    const lit = () =>
      Array.from(strip.children)
        .map((_, i) => i)
        .filter((i) => haloOf(i).className.includes('opacity-100'));

    // DESCRIBE is tier 2: exactly its halo is up.
    expect(lit()).toEqual([1]);
    for (let i = 0; i < 6; i += 1) {
      expect(haloOf(i).getAttribute('aria-hidden')).toBe('true');
      expect(haloOf(i).textContent).toBe('');
    }
    fireEvent.click(within(container).getByRole('button', { name: 'SYNTHESISE' }));
    expect(lit()).toEqual([5]);
  });

  it('draws the card from one box in every state', () => {
    // `border-2` used to be added to the selected card, so selecting a tier
    // re-laid out the card's contents by a pixel while it was transitioning.
    const { container } = render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);
    const strip = screen.getByRole('group', { name: /tier ladder/i });
    const cards = Array.from(strip.children).map((slot) => slot.firstElementChild as HTMLElement);
    for (const card of cards) {
      expect(card.className).toContain('border');
      expect(card.className).not.toContain('border-2');
      expect(card.className).toContain('band-edge');
      expect(card.className).not.toContain('band-edge-strong');
      expect(card.style.boxShadow).toBe('');
    }
    expect(container).toBeTruthy();
  });
});

/**
 * The banner is light in the light theme.
 *
 * The ribbon's header was part of the dark stage in BOTH themes, which in the
 * light theme made it a dark slab above a page of white panels whose headers are
 * all light — the accordions, the question card, the navigator. Its text was
 * perfectly legible, so no contrast check could say so: `light-theme.spec.ts`
 * says as much itself, "a header that reads as a dark slab beside its light twin
 * has fine contrast and is still wrong". Only the stage below it is dark in both
 * themes now, because that is the hero; the banner is an ordinary themed bar.
 *
 * jsdom has no stylesheet, so what is pinned here is the class vocabulary and its
 * pairing; `tests/e2e/verb-ribbon.spec.ts` reads the computed colours in a real
 * browser in both themes.
 */
describe('the banner is a themed bar, light in the light theme', () => {
  it('is opaque and white in the light theme, and lets the stage’s light through in the dark', () => {
    // Opaque in the light theme, which also hides the part of the aura and mesh
    // that would otherwise tint it; see-through in the dark one, where the aura
    // falling through the bar is the look.
    expect(RIBBON_HEADER_BAR).toMatch(/(^|\s)bg-white(\s|$)/);
    expect(RIBBON_HEADER_BAR).toContain('dark:bg-white/0');
    // A hover and a press that exist in both themes, on a device that can hover.
    expect(RIBBON_HEADER_BAR).toContain('can-hover:hover:bg-slate-100');
    expect(RIBBON_HEADER_BAR).toContain('dark:can-hover:hover:bg-white/[0.04]');
    // A focus ring that exists in both themes: slate on white, white on dark.
    expect(RIBBON_HEADER_BAR).toContain('focus-visible:ring-slate-900/40');
    expect(RIBBON_HEADER_BAR).toContain('dark:focus-visible:ring-white/70');
  });

  it('is not a stage constant, and so is not held to the stage’s one ground', () => {
    // The stage rule is "no theme variant". The banner is the opposite, and a
    // rename back to `RIBBON_INK_*` would put a themed bar under a rule that
    // forbids themes — so the names are pinned, in both directions.
    for (const name of [
      'RIBBON_HEADER_BAR',
      'RIBBON_HEADER_TITLE',
      'RIBBON_HEADER_SUBLABEL',
      'RIBBON_SELECTED_LABEL',
      'RIBBON_SELECTED_CHIP',
      'RIBBON_MINI_BAR_UNLIT',
    ]) {
      expect(name.startsWith('RIBBON_INK_')).toBe(false);
      expect(
        (verbRibbonChrome as Record<string, unknown>)[name],
        `${name} is not exported`
      ).toBeTypeOf('string');
      expect(
        (verbRibbonChrome as unknown as Record<string, string>)[name],
        `${name} has no dark: partner`
      ).toMatch(/(^|\s)dark:/);
    }
    for (const stale of [
      'RIBBON_INK_HEADER_BAR',
      'RIBBON_INK_HEADER_TILE',
      'RIBBON_INK_HEADER_TITLE',
      'RIBBON_INK_HEADER_SUBLABEL',
      'RIBBON_INK_SELECTED_LABEL',
      'RIBBON_INK_SELECTED_CHIP',
      'RIBBON_INK_MINI_STAIR',
    ]) {
      expect(stale in verbRibbonChrome, `${stale} is back as a one-ground constant`).toBe(false);
    }
  });

  it('inks every word in the banner with a colour of its own, in a pair', () => {
    // The root is `text-white` for the stage below, so any banner text that names
    // no colour inherits white — which on the white banner is invisible. Every one
    // of them says dark ink for the light theme and white or slate-300 for the dark.
    expect(RIBBON_HEADER_TITLE).toContain('text-slate-900');
    expect(RIBBON_HEADER_TITLE).toContain('dark:text-white');
    for (const value of [RIBBON_HEADER_SUBLABEL, RIBBON_SELECTED_LABEL]) {
      expect(value).toContain('text-slate-600');
      expect(value).toContain('dark:text-slate-300');
    }
    expect(RIBBON_SELECTED_CHIP).toContain('text-slate-900');
    expect(RIBBON_SELECTED_CHIP).toContain('dark:text-white');
    // The chip's wash is a lighter one of the tier's hue on white and the deeper
    // one on the dark bar, each from the same `--band-rgb`.
    expect(RIBBON_SELECTED_CHIP).toContain('bg-[rgb(var(--band-rgb)/0.2)]');
    expect(RIBBON_SELECTED_CHIP).toContain('dark:bg-[rgb(var(--band-rgb)/0.22)]');
    for (const value of [RIBBON_HEADER_CHEVRON_OPEN, RIBBON_HEADER_CHEVRON_SHUT]) {
      expect(value).toMatch(/(^|\s)text-slate-\d00(\s|$)/);
      expect(value).toMatch(/(^|\s)dark:text-/);
    }

    render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);
    const banner = getToggle();
    const words = [
      screen.getByText('HSC Command Verb Hierarchy'),
      screen.getByText(/Reference · 6 cognitive tiers/),
      screen.getByText('Selected:'),
      screen.getAllByText('EXPLAIN').find((el) => el.tagName === 'DIV' && banner.contains(el))!,
    ];
    for (const word of words) {
      expect(banner.contains(word)).toBe(true);
      expect(word.className, `"${word.textContent}" names no colour`).toMatch(
        /(^|\s)text-(slate|white)/
      );
      expect(word.className).toMatch(/(^|\s)dark:text-/);
    }
  });

  it('draws the unlit bars and the neutral tile from a themed pair', () => {
    // White alpha reads on the dark bar and is invisible on the white one, so the
    // two things that used it are classes with a partner now.
    expect(RIBBON_MINI_BAR_UNLIT).toContain('bg-slate-300');
    expect(RIBBON_MINI_BAR_UNLIT).toContain('dark:bg-white/20');
    for (const token of ['bg-slate-100', 'text-slate-600', 'border-slate-300']) {
      expect(RIBBON_HEADER_TILE_NEUTRAL).toContain(token);
    }
    for (const token of ['dark:bg-white/10', 'dark:text-slate-300', 'dark:border-white/15']) {
      expect(RIBBON_HEADER_TILE_NEUTRAL).toContain(token);
    }

    // With no verb chosen the tile is neutral; with one it is the tier's solid
    // pair — which reads the same on either bar — and the neutral is gone.
    const { container, unmount } = render(<CommandVerbHierarchy />);
    const neutral = container.querySelector(`[class*="${RIBBON_HEADER_TILE}"]`) as HTMLElement;
    expect(neutral.className).toContain(RIBBON_HEADER_TILE_NEUTRAL);
    unmount();

    const lit = render(<CommandVerbHierarchy currentVerb={'IDENTIFY' as PromptVerb} />);
    const tile = lit.container.querySelector(`[class*="${RIBBON_HEADER_TILE}"]`) as HTMLElement;
    expect(tile.className).not.toContain(RIBBON_HEADER_TILE_NEUTRAL);
    expect(tile.className).toContain(getTierScaleConfig(1).solidBg);
  });

  it('turns the chevron over, and re-inks it, with the state', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);
    const chevron = () => getToggle().querySelector('svg.lucide-chevron-down') as SVGElement;
    expect(chevron().getAttribute('class')).toContain('rotate-180');
    expect(chevron().getAttribute('class')).toContain(RIBBON_HEADER_CHEVRON_OPEN);

    fireEvent.click(getToggle());
    expect(chevron().getAttribute('class')).not.toContain('rotate-180');
    expect(chevron().getAttribute('class')).toContain(RIBBON_HEADER_CHEVRON_SHUT);
    expect(container).toBeTruthy();
  });

  it('leaves the dark stage exactly as it was, and gives the light one a soft ground', () => {
    // The dark palette is the stage as it shipped: the same near-black ground and
    // the same cell, so this change cannot have moved a pixel of the dark theme.
    const dark = stagePalette('dark');
    expect(dark['--stage-ground']).toBe('7 11 20');
    expect(dark['--stage-cell']).toBe('11 19 34');
    expect(dark['--stage-ink']).toBe('255 255 255');
    // The light ground is soft — a tint of slate, not a second near-black — and the
    // ink on it is dark. The point of the change is that it is not a slab.
    const light = stagePalette('light');
    expect(luminance(light['--stage-ground'])).toBeGreaterThan(0.9);
    expect(luminance(light['--stage-ink'])).toBeLessThan(0.05);
    expect(luminance(light['--stage-ground'])).toBeLessThan(1);
    // …and distinct from the white banner above it and the white drawer below, or
    // the stage would have no edge.
    expect(light['--stage-ground']).not.toBe('255 255 255');
  });

  it('defines every property in both themes, so neither can be left on the other’s value', () => {
    const dark = stagePalette('dark');
    const light = stagePalette('light');
    expect(Object.keys(light).sort()).toEqual(Object.keys(dark).sort());
    // And the hue: `--band-text` is the bright hue on the dark stage and the
    // `-700` ink on the light one.
    const css = readFileSync('index.css', 'utf8');
    expect(css).toMatch(/\.ribbon-stage-hue\s*\{[^}]*--band-text:\s*var\(--band-rgb\);/);
    expect(css).toMatch(
      /\[data-theme='light'\]\s*\.ribbon-stage-hue\s*\{[^}]*--band-text:\s*var\(--band-ink\);/
    );
    // The edge under the banner reads `--band-rgb`, so it is declared with the hue
    // and not in the static table: tier-coloured on the light stage, nothing on the
    // dark one, where the banner is the stage.
    expect(css).toMatch(/\.ribbon-stage-hue\s*\{[^}]*--stage-rule:\s*transparent;/);
    expect(css).toMatch(
      /\[data-theme='light'\]\s*\.ribbon-stage-hue\s*\{[^}]*--stage-rule:\s*rgb\(var\(--band-rgb\)\s*\/\s*0\.85\);/
    );
  });

  // The thing a class-string test cannot say, and the one that matters: whether
  // the words are legible. Every ink on every ground it can sit on, in both
  // themes, at the strength the palette draws it.
  describe('is legible in both themes', () => {
    const TIERS = [1, 2, 3, 4, 5, 6];
    /** The tier's text hue on the stage, the way `--band-text` resolves it. */
    const hueOf = (theme: 'dark' | 'light', tier: number) =>
      theme === 'dark' ? getBandRgb(tier) : getBandInkRgb(tier);

    for (const theme of ['dark', 'light'] as const) {
      it(`${theme}: the neutral inks clear 4.5:1 on the ground and on a scoreboard cell`, () => {
        const palette = stagePalette(theme);
        for (const ink of ['--stage-ink', '--stage-ink-2', '--stage-ink-3']) {
          for (const ground of ['--stage-ground', '--stage-cell']) {
            const ratio = contrast(palette[ink], palette[ground]);
            expect(
              ratio,
              `${theme}: ${ink} on ${ground} is ${ratio.toFixed(2)}:1`
            ).toBeGreaterThanOrEqual(4.5);
          }
        }
      });

      it(`${theme}: all six tier hues clear 4.5:1 as text on the ground and on a cell`, () => {
        const palette = stagePalette(theme);
        for (const tier of TIERS) {
          for (const ground of ['--stage-ground', '--stage-cell']) {
            const ratio = contrast(hueOf(theme, tier), palette[ground]);
            expect(
              ratio,
              `${theme}: tier ${tier} text on ${ground} is ${ratio.toFixed(2)}:1`
            ).toBeGreaterThanOrEqual(4.5);
          }
        }
      });

      it(`${theme}: the ink on the tier chip clears 4.5:1 over the tint it sits on`, () => {
        const palette = stagePalette(theme);
        const alpha = Number(palette['--chip-fill']);
        for (const tier of TIERS) {
          // The chip's own fill, composited over the ground the way the browser does.
          const tint = mix(getBandRgb(tier), palette['--stage-ground'], alpha);
          const ratio = contrast(palette['--stage-ink'], tint);
          expect(
            ratio,
            `${theme}: tier ${tier} chip is ${ratio.toFixed(2)}:1 against its own tint`
          ).toBeGreaterThanOrEqual(4.5);
        }
      });
    }

    // The light stage is lit in the tier's colour, and the colour is strong enough
    // to stop it reading as washed out. That is a trade against legibility, and
    // this is the half that holds it: the neutral inks over the pool of light at
    // its brightest, on top of the whole-stage tint, for every tier.
    for (const theme of ['dark', 'light'] as const) {
      it(`${theme}: the neutral inks clear 4.5:1 over the tier’s light at its strongest`, () => {
        const palette = stagePalette(theme);
        for (const tier of TIERS) {
          const washed = mix(
            getBandRgb(tier),
            palette['--stage-ground'],
            Number(palette['--aura-wash'])
          );
          const peak = mix(getBandRgb(tier), washed, Number(palette['--aura-1']));
          for (const ink of ['--stage-ink', '--stage-ink-2', '--stage-ink-3']) {
            const ratio = contrast(palette[ink], peak);
            expect(
              ratio,
              `${theme}: ${ink} over tier ${tier}'s pool is ${ratio.toFixed(2)}:1`
            ).toBeGreaterThanOrEqual(4.5);
          }
        }
      });
    }

    it('light: the tier’s text hue clears 4.5:1 over the whole-stage tint and its second pool', () => {
      // The figures sit on white cells, but the current step's name sits on the
      // stage itself — on the tint everywhere, and on the second pool's falloff on a
      // phone. Held at the pool's PEAK, which is stricter than anywhere it is drawn.
      const palette = stagePalette('light');
      for (const tier of TIERS) {
        const washed = mix(
          getBandRgb(tier),
          palette['--stage-ground'],
          Number(palette['--aura-wash'])
        );
        const pool = mix(getBandRgb(tier), washed, Number(palette['--aura-2']));
        for (const [where, ground] of [
          ['tint', washed],
          ['second pool', pool],
        ]) {
          const ratio = contrast(getBandInkRgb(tier), ground);
          expect(
            ratio,
            `tier ${tier} text over the ${where} is ${ratio.toFixed(2)}:1`
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    });

    it('the light ink shades are the -700 steps, derived from one map', () => {
      for (const tier of TIERS) {
        const hex = BAND_HEX_INK[tier];
        expect(getBandInkRgb(tier)).toBe(
          [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ')
        );
        // A different colour from the fill hue, or there would be nothing to switch.
        expect(getBandInkRgb(tier)).not.toBe(getBandRgb(tier));
      }
    });
  });
});

/** The stage palette for one theme, read back out of `index.css`. */
const stagePalette = (theme: 'dark' | 'light'): Record<string, string> => {
  const css = readFileSync('index.css', 'utf8');
  const selector =
    theme === 'dark' ? '\\.ribbon-stage' : "\\[data-theme='light'\\] \\.ribbon-stage";
  const block = css.match(new RegExp(`(?:^|\\n)${selector}\\s*\\{([^}]*)\\}`));
  expect(block, `the ${theme} stage palette is not in index.css`).toBeTruthy();
  return Object.fromEntries(
    Array.from(block![1].matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)).map((m) => [m[1], m[2].trim()])
  );
};

/** WCAG relative luminance of an `r g b` triplet. */
const luminance = (triplet: string): number => {
  const [r, g, b] = triplet.split(' ').map((v) => {
    const c = Number(v) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG contrast ratio between two `r g b` triplets. */
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** `top` over `bottom` at `alpha`, as an `r g b` triplet. */
const mix = (top: string, bottom: string, alpha: number): string => {
  const t = top.split(' ').map(Number);
  const u = bottom.split(' ').map(Number);
  return t.map((v, i) => Math.round(v * alpha + u[i] * (1 - alpha))).join(' ');
};
