import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import BandLadderMark from '../../components/BandLadderMark';
import { getBandHex } from '../../utils/renderUtils';

/**
 * The brand mark is the band scale with the caret on Band 6. Its colours have to
 * be the product's band colours, read from `getBandHex`, and its caret has to sit
 * over the last rung: a mark whose rungs and marker disagree is the wrong mark.
 */

afterEach(cleanup);

/** `#a855f7` as the `rgb(...)` string jsdom reports for an inline colour. */
const hexToRgb = (hex: string): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

const rungs = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-band]'));

describe('BandLadderMark', () => {
  it('is one labelled image that says the scale is marked at Band 6', () => {
    render(<BandLadderMark />);

    expect(screen.getByRole('img', { name: 'The NESA band scale, marked at Band 6' })).toBeTruthy();
  });

  it('renders six rungs, one per band, in the six band colours', () => {
    const { container } = render(<BandLadderMark />);
    const bands = rungs(container);

    expect(bands.map((el) => el.getAttribute('data-band'))).toEqual(['1', '2', '3', '4', '5', '6']);
    bands.forEach((el, i) => {
      expect(el.style.backgroundColor).toBe(hexToRgb(getBandHex(i + 1)));
    });
  });

  it('draws the rungs at full colour, not dimmed', () => {
    const { container } = render(<BandLadderMark />);

    for (const el of rungs(container)) {
      expect(el.style.opacity).toBe('');
    }
  });

  it('keeps rungs square, with no radius', () => {
    const { container } = render(<BandLadderMark />);

    for (const el of rungs(container)) {
      expect(el.className).not.toMatch(/rounded/);
      expect(el.style.borderRadius).toBe('');
    }
  });

  it('makes rung 6 taller than the rest, as the lit rung is in the marking glyph', () => {
    const { container } = render(<BandLadderMark />);
    const [first, , , , , sixth] = rungs(container);

    expect(parseFloat(sixth.style.height)).toBeGreaterThan(parseFloat(first.style.height));
  });

  it('draws one caret, above rung 6, in the page ink', () => {
    const { container } = render(<BandLadderMark />);
    const carets = container.querySelectorAll('svg');

    expect(carets.length).toBe(1);
    // Light-first, like AuthBrand: `dark:` keys on a class the signed-out screens
    // never set, so a dark partner would not apply there.
    expect(carets[0].getAttribute('class')).toContain('text-white');
    expect(carets[0].getAttribute('class')).toContain('light:text-slate-900');
    // The caret's dot is the Band 6 colour, as in the marking glyph.
    const dot = carets[0].querySelector('circle');
    expect(dot?.getAttribute('fill')).toBe(getBandHex(6));
  });

  it('keeps the caret white on the ink tile in both themes', () => {
    const { container } = render(<BandLadderMark size="mark" onInk />);
    const caret = container.querySelector('svg') as SVGElement;

    expect(caret.getAttribute('class')).toContain('text-white');
    expect(caret.getAttribute('class')).not.toContain('light:text-slate-900');
  });

  it('sets the caret over the last rung by sharing the rung row’s geometry', () => {
    const { container } = render(<BandLadderMark size="hero" />);
    const lane = container.querySelector('svg')?.parentElement?.parentElement as HTMLElement;
    const rungRow = rungs(container)[0].parentElement as HTMLElement;

    // Both rows are six flex slots with the same gap, so the caret's slot is
    // rung 6's slot by construction.
    expect(lane.children.length).toBe(6);
    expect(rungRow.children.length).toBe(6);
    expect(lane.style.gap).toBe(rungRow.style.gap);
    expect(container.querySelector('svg')?.parentElement?.parentElement).toBe(lane);
  });

  it('climbs the scale when animated, and drops once when it is the entrance', () => {
    const climbing = render(<BandLadderMark animated />);
    expect(climbing.container.querySelector('svg')?.getAttribute('class')).toContain(
      'ladder-climb'
    );
    climbing.unmount();

    const entering = render(<BandLadderMark entrance />);
    expect(entering.container.querySelector('svg')?.getAttribute('class')).toContain('ladder-drop');
    entering.unmount();

    const still = render(<BandLadderMark />);
    const caret = still.container.querySelector('svg')?.getAttribute('class') ?? '';
    expect(caret).not.toContain('ladder-');
  });

  it('hands the climb its distances as variables, so one stylesheet serves every size', () => {
    const { container } = render(<BandLadderMark animated size="compact" />);
    const caret = container.querySelector('svg') as SVGElement;
    const style = caret.getAttribute('style') ?? '';

    expect(style).toContain('--ladder-step');
    expect(style).toContain('--ladder-hop');
  });

  it('takes the width of its box when fluid, and its own width otherwise', () => {
    const fluid = render(<BandLadderMark fluid />);
    expect((fluid.container.firstElementChild as HTMLElement).style.width).toBe('100%');
    fluid.unmount();

    const fixed = render(<BandLadderMark />);
    expect((fixed.container.firstElementChild as HTMLElement).style.width).not.toBe('100%');
  });

  // The header's copy of the scale sits beside a heading that already names the
  // app, so it is decoration: no image role for a screen reader to announce twice.
  it('can be decorative, with no image role or label and hidden from assistive technology', () => {
    const { container } = render(<BandLadderMark decorative />);
    const root = container.firstElementChild as HTMLElement;

    expect(screen.queryByRole('img', { hidden: true })).toBeNull();
    expect(root.hasAttribute('aria-label')).toBe(false);
    expect(root.getAttribute('aria-hidden')).toBe('true');
  });

  // The lockup is the rail's scale, so its rungs are thinner than the sign-in
  // hero's. The rung proportions still hold: the lit rung stays the tallest.
  it('draws the lockup with thinner rungs than the hero, and rung 6 still tallest', () => {
    const hero = render(<BandLadderMark size="hero" />);
    const heroHeight = parseFloat(rungs(hero.container)[0].style.height);
    hero.unmount();

    const lockup = render(<BandLadderMark size="lockup" />);
    const [first, , , , , sixth] = rungs(lockup.container);

    expect(parseFloat(first.style.height)).toBeLessThan(heroHeight);
    expect(parseFloat(sixth.style.height)).toBeGreaterThan(parseFloat(first.style.height));
  });

  // `.ladder-drop` waits 280ms and holds its first frame, so the drop lands on a
  // mark that has faded in. The global reduced-motion rule shortens durations but
  // not delays, so the class has to be named in the block that zeroes them, or a
  // reader who asked for no motion would wait out the 280ms for nothing.
  it('waits for the sign-in fade before it drops, and not when the reader asked for no motion', () => {
    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');
    expect(css).toMatch(/\.ladder-drop\s*\{\s*animation:[^;]*280ms both;/);

    const blocks: string[] =
      css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}\n/g) ?? [];
    const reduced = blocks.find((block) => block.includes('.ladder-drop'));
    expect(reduced, 'no reduced-motion block names .ladder-drop').toBeTruthy();
    expect(reduced).toMatch(/\.ladder-drop\s*\{\s*animation-delay: 0ms !important;/);
  });
});
