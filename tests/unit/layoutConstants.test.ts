import { describe, it, expect } from 'vitest';
import {
  naturalCardHeight,
  cardHeightCap,
  MAX_CARD_HEIGHT,
  MIN_CARD_HEIGHT,
} from '../../utils/layoutConstants';

/**
 * The workspace's two cards are height-linked one way: the question prompt
 * sets the height and the writing area matches it. The prompt still carries a
 * `minHeight` (the floor for a one-line question), and that `minHeight`
 * stretches the very element its own height is measured from — so the property
 * below is what stops the sync becoming a one-way ratchet.
 */

// Minimal stand-in for the three elements naturalCardHeight reads.
const el = (offsetHeight: number) => ({ offsetHeight }) as HTMLElement;

describe('naturalCardHeight', () => {
  it('reports content height, not the height the wrapper was stretched to', () => {
    // Wrapper stretched to 800 by the floor; chrome (header + footer) is 250,
    // so the body rendered at 550 — but it only holds 300px of content.
    expect(naturalCardHeight(el(800), el(550), el(300))).toBe(550);
  });

  it('shrinks again when the content shrinks under a stretched wrapper', () => {
    const stretched = el(800);
    const body = el(550);
    const tall = naturalCardHeight(stretched, body, el(3000));
    const short = naturalCardHeight(stretched, body, el(120));
    expect(tall).toBeGreaterThan(short);
    // The ratchet regression: measuring the wrapper alone returned 800 in both
    // cases, so the card could only ever grow.
    expect(short).toBeLessThan(stretched.offsetHeight);
  });

  it('is unchanged by how far the wrapper was stretched', () => {
    const at620 = naturalCardHeight(el(620), el(370), el(300));
    const at800 = naturalCardHeight(el(800), el(550), el(300));
    expect(at620).toBe(at800);
  });

  it('reports the full content height even when the body is already scrolling', () => {
    // Past the viewport cap the body scrolls, but this must still report what
    // the card WANTS — the clamp belongs to the caller, not the measurement.
    expect(naturalCardHeight(el(600), el(400), el(4000))).toBe(4200);
  });

  it('falls back to the wrapper when the body is not mounted yet', () => {
    expect(naturalCardHeight(el(430), null, null)).toBe(430);
    expect(naturalCardHeight(el(430), el(200), null)).toBe(430);
  });

  it('returns 0 with no wrapper, so the sync ignores it', () => {
    expect(naturalCardHeight(null, el(200), el(100))).toBe(0);
  });
});

describe('cardHeightCap', () => {
  it('leaves room for the app chrome on a typical window', () => {
    const cap = cardHeightCap(1000);
    expect(cap).toBeLessThan(1000);
    expect(cap).toBeGreaterThanOrEqual(MIN_CARD_HEIGHT);
  });

  it('never exceeds the absolute ceiling on a very tall window', () => {
    expect(cardHeightCap(4000)).toBe(MAX_CARD_HEIGHT);
  });

  it('holds the floor on a short window rather than collapsing the pair', () => {
    // A laptop in a small window: the prompt scrolls at the floor instead of
    // the writing area being squeezed to nothing.
    expect(cardHeightCap(600)).toBe(MIN_CARD_HEIGHT);
    expect(cardHeightCap(200)).toBe(MIN_CARD_HEIGHT);
  });

  it('grows with the window between the floor and the ceiling', () => {
    expect(cardHeightCap(1000)).toBeGreaterThan(cardHeightCap(850));
  });

  it('keeps the floor below the ceiling', () => {
    expect(MIN_CARD_HEIGHT).toBeLessThan(MAX_CARD_HEIGHT);
  });
});
