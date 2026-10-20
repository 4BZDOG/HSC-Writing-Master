import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
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
});
