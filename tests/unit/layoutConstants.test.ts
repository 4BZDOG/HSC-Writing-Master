import { describe, it, expect } from 'vitest';
import {
  naturalCardHeight,
  FALLBACK_CARD_HEIGHT,
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

  it('grows without bound with the content, since the prompt never scrolls', () => {
    // A long scenario must lengthen the card rather than being clipped into a
    // scroll region, so nothing here clamps the result.
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

describe('card height constants', () => {
  it('floors below the pre-measurement fallback', () => {
    expect(MIN_CARD_HEIGHT).toBeLessThan(FALLBACK_CARD_HEIGHT);
  });
});
