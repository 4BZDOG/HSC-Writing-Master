import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import CommandVerbHierarchy from '../../components/CommandVerbHierarchy';
import StrategyBrief from '../../components/StrategyBrief';
import { commandTerms, getCommandTermInfo, TIER_GROUPS } from '../../data/commandTerms';
import { PANEL_ROW_MIN_H } from '../../utils/panelStyles';
import { PromptVerb } from '../../types';
import * as verbRibbonChrome from '../../utils/verbRibbonChrome';
import { BAND_HEX, getBandRgb } from '../../utils/renderUtils';
import tailwindConfig from '../../tailwind.config.js';
import {
  RIBBON_DRAWER,
  RIBBON_INK_AURA,
  RIBBON_INK_CEILING,
  RIBBON_INK_HEADER_BAR,
  RIBBON_INK_HEADER_TILE,
  RIBBON_INK_HEADER_TITLE,
  RIBBON_INK_HERO,
  RIBBON_INK_MINI_STAIR,
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
  RIBBON_INK_VERB_RULE,
  RIBBON_ROOT,
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

/** The stage's root: the ribbon's outermost box. */
const rootOf = (container: HTMLElement): HTMLElement => container.firstElementChild as HTMLElement;

/** `#rrggbb` as the `rgb(r, g, b)` string jsdom reports a colour back as. */
const asRgb = (hex: string): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

describe('the ribbon wears the shared vocabulary', () => {
  it('dresses its root and its header bar from verbRibbonChrome', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);

    expect(rootOf(container).className).toContain(RIBBON_ROOT);
    expect(getToggle().className).toContain(RIBBON_INK_HEADER_BAR);
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
    for (const card of Array.from(strip.children)) {
      expect(card.className).toContain(RIBBON_TIER_CARD);
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
 * what is around it. This one is a stage — dark in BOTH themes, lit in the
 * tier's own colour — standing on an ordinary themed drawer.
 *
 * "Dark in both themes" is a claim that has to be held, because the failure
 * mode is silent. The theme tokens flip under the light theme: `--color-text-
 * muted` resolves to slate-600, and the tier's `text` class swaps to its `-900`
 * step, which is dark ink on a dark ground. Nothing throws; the light theme is
 * simply unreadable on the stage. So everything painted on it is pinned to name
 * its colours outright, and to carry no partner for a ground that has only one.
 */
describe('the stage is dark in both themes, and says so', () => {
  const inkExports = Object.entries(verbRibbonChrome).filter(
    ([name, value]) => name.startsWith('RIBBON_INK_') && typeof value === 'string'
  ) as [string, string][];

  it('has constants to hold to it', () => {
    // A guard on the guard: a rename that drops the prefix would leave the two
    // sweeps below passing over an empty list.
    expect(inkExports.length).toBeGreaterThanOrEqual(25);
  });

  it('carries no light: or dark: partner on anything painted on it', () => {
    for (const [name, value] of inkExports) {
      expect(value, `${name} has a theme variant on a ground with one theme`).not.toMatch(
        /(^|\s)[^\s]*(light|dark):/
      );
    }
    // The root is the ground itself, so the same applies to it.
    expect(RIBBON_ROOT).not.toMatch(/(^|\s)[^\s]*(light|dark):/);
  });

  it('reads no theme token', () => {
    for (const [name, value] of [...inkExports, ['RIBBON_ROOT', RIBBON_ROOT]]) {
      expect(value, `${name} reads a theme colour token`).not.toContain('--color-');
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
    const themed = /(^|\s)[^\s]*(light|dark):|--color-/;
    const offenders = Array.from(container.querySelectorAll('*'))
      .filter((el) => !drawer.contains(el) && el !== drawer)
      .filter((el) => themed.test(el.getAttribute('class') ?? ''))
      // Two exemptions, each with its reason. The icon tile wears the tier
      // config's `solidBg` and `solidText` — a solid fill and the text paired to
      // it, which is `getBandConfig`'s own contrast pairing and reads the same
      // on either ground. And the mesh is a decorative, text-free overlay whose
      // shared component bakes a `light:` opacity a call site cannot override
      // (recorded on MeshOverlay itself): it cannot touch legibility.
      .filter((el) => !el.className.toString().includes(RIBBON_INK_HEADER_TILE))
      .filter((el) => !(el.className.toString().includes('mix-blend-overlay') && !el.textContent))
      .map((el) => `${el.tagName}.${el.getAttribute('class')}`);
    expect(offenders, `theme variants on the stage:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('sets the brief in colours it names, and the surface tone still uses the tokens', () => {
    render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);

    // The checks on the verb's method — the stage's smallest, palest text.
    const check = document.querySelector(
      'div.border-l-2 p.font-serif.leading-relaxed'
    ) as HTMLElement;
    expect(check).toBeTruthy();
    expect(check.className).toContain('text-slate-300');
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
      // The glow beneath it is drawn from the same property, not from a literal.
      expect(rootOf(container).style.boxShadow).toContain('var(--band-rgb)');
      unmount();
    }
  });

  it('keeps a neutral light, and no glow, when no verb is chosen', () => {
    const { container } = render(<CommandVerbHierarchy />);

    // A cool slate — nobody's tier. Red would say "Band 1" to a student who has
    // chosen nothing.
    expect(rootOf(container).style.getPropertyValue('--band-rgb')).toBe('100 116 139');
    expect(rootOf(container).style.boxShadow).toBe('');
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

    // Same tier: the same light.
    fireEvent.click(screen.getByRole('button', { name: 'RECALL' }));
    expect(container.querySelector(`[class*="${RIBBON_INK_AURA}"]`)).toBe(first);

    // A verb of another tier: a new element, which is what replays the fade.
    rerender(<CommandVerbHierarchy currentVerb={'EVALUATE' as PromptVerb} />);
    expect(container.querySelector(`[class*="${RIBBON_INK_AURA}"]`)).not.toBe(first);
  });
});

describe('the header carries the tier while the ribbon is shut', () => {
  it('names itself in the section voice, and refuses to wrap', () => {
    expect(RIBBON_INK_HEADER_TITLE).toMatch(/(^|\s)t-section(\s|$)/);

    render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);
    const title = screen.getByText('HSC Command Verb Hierarchy');
    expect(title.className).toContain(RIBBON_INK_HEADER_TITLE);
    expect(title.className).toContain('truncate');
  });

  it('carries the tier on the icon tile, paired the way getBandConfig intends', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);
    const tile = container.querySelector(`[class*="${RIBBON_INK_HEADER_TILE}"]`) as HTMLElement;

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

    const mini = container.querySelector(`[class="${RIBBON_INK_MINI_STAIR}"]`) as HTMLElement;
    expect(mini).toBeTruthy();
    expect(mini.getAttribute('aria-hidden')).toBe('true');
    expect(RIBBON_INK_MINI_STAIR).toMatch(/(^|\s)hidden sm:flex/);

    const bars = Array.from(mini.children) as HTMLElement[];
    expect(bars).toHaveLength(6);
    // Tier 3: three lit in their own hues, three unlit.
    bars.forEach((bar, index) => {
      expect(bar.style.backgroundColor).toBe(
        index < 3
          ? `rgb(${getBandRgb(index + 1)
              .split(' ')
              .join(', ')})`
          : 'rgba(255, 255, 255, 0.2)'
      );
    });
    // Rising, not flat.
    const heights = bars.map((bar) => parseFloat(bar.style.height));
    expect([...heights].sort((a, b) => a - b)).toEqual(heights);
    expect(new Set(heights).size).toBe(6);
  });

  it('draws no miniature when there is no tier to light it to', () => {
    const { container } = render(<CommandVerbHierarchy />);
    expect(container.querySelector(`[class="${RIBBON_INK_MINI_STAIR}"]`)).toBeNull();
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
    // The glow is drawn from the stage's one hue, not from a copy of it.
    expect(RIBBON_INK_VERB).toContain('rgb(var(--band-rgb)/0.55)');
    expect(RIBBON_INK_VERB).not.toMatch(/text-\[#/);
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
    expect(RIBBON_INK_SCOREBOARD).toMatch(/bg-white\/10/);
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
    expect(line.style.borderColor).toBe(`rgb(${getBandRgb(3).split(' ').join(', ')})`);

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
    expect(delays[0]).toBe(0);
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
      expect(numeral.className).toMatch(/text-(white|slate-300)/);
    }
    for (const label of Array.from(
      container.querySelectorAll(`[class*="${RIBBON_INK_STEP_LABEL}"]`)
    )) {
      expect(label.closest('[aria-hidden="true"]')).toBeNull();
    }
    // The idle names lift on hover by COLOUR — the rule this component spent
    // three fixes learning — and are never dimmed.
    expect(RIBBON_INK_STEP_LABEL_IDLE).toContain('text-slate-300');
    expect(RIBBON_INK_STEP_LABEL_IDLE).toContain('group-hover/step:text-white');
    expect(RIBBON_INK_STEP_LABEL_IDLE).not.toContain('opacity-');
    expect(RIBBON_INK_STEP_LABEL).not.toContain('opacity-');
  });

  it('keeps the scale rail inside the contrast audit, and undimmed', () => {
    const { container } = render(<CommandVerbHierarchy currentVerb={'EXPLAIN' as PromptVerb} />);

    expect(RIBBON_INK_SCALE_RAIL).not.toContain('opacity-');
    expect(RIBBON_INK_SCALE_SPAN).not.toContain('opacity-');
    expect(RIBBON_INK_SCALE_SPAN).toContain('text-slate-300');

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

    // The mask is switched off at the same width the grid takes over. Tailwind's
    // `xl` is 1280px and this config does not override the screens.
    expect((tailwindConfig.theme as { screens?: unknown }).screens).toBeUndefined();
    const css = readFileSync('index.css', 'utf8');
    const off = css.match(/@media \(min-width: 1280px\)\s*\{\s*\.strip-edge-mask\s*\{([^}]*)\}/);
    expect(off, 'the mask is never switched off at xl').toBeTruthy();
    expect(off![1]).toContain('mask-image: none');
  });
});
