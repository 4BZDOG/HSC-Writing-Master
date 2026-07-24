import { describe, it, expect } from 'vitest';
import {
  naturalCardHeight,
  EDITOR_SYNC_CAP,
  MAX_CARD_HEIGHT,
  MIN_CARD_HEIGHT,
} from '../../utils/layoutConstants';

/**
 * The workspace's two cards are height-synced, and the sync is a feedback loop:
 * each card reports a height, the tallest becomes both cards' `minHeight`, and
 * that stretches the very element being measured. Everything here guards the
 * property that makes the loop terminate — a card's reported height must not
 * depend on the `minHeight` it was given.
 */

// Minimal stand-in for the three elements naturalCardHeight reads.
const el = (offsetHeight: number) => ({ offsetHeight }) as HTMLElement;

describe('naturalCardHeight', () => {
  it('reports content height, not the height the wrapper was stretched to', () => {
    // Wrapper stretched to 800 by the synced minHeight; chrome (header +
    // footer) is 250, so the scroll region rendered at 550 — but it only holds
    // 300px of content.
    expect(naturalCardHeight(el(800), el(550), el(300))).toBe(550);
  });

  it('shrinks again when the content shrinks under a stretched wrapper', () => {
    const stretched = el(800);
    const scrollRegion = el(550);
    const tall = naturalCardHeight(stretched, scrollRegion, el(3000));
    const short = naturalCardHeight(stretched, scrollRegion, el(120));
    expect(tall).toBeGreaterThan(short);
    // This is the ratchet regression: measuring the wrapper alone returned 800
    // in both cases, so the pair could only ever grow.
    expect(short).toBeLessThan(stretched.offsetHeight);
  });

  it('is unchanged by how far the wrapper was stretched', () => {
    const at620 = naturalCardHeight(el(620), el(370), el(300));
    const at800 = naturalCardHeight(el(800), el(550), el(300));
    expect(at620).toBe(at800);
  });

  it('falls back to the wrapper when the scroll region is not mounted yet', () => {
    expect(naturalCardHeight(el(430), null, null)).toBe(430);
    expect(naturalCardHeight(el(430), el(200), null)).toBe(430);
  });

  it('returns 0 with no wrapper, so the sync ignores it', () => {
    expect(naturalCardHeight(null, el(200), el(100))).toBe(0);
  });
});

describe('card height constants', () => {
  it('caps the editor below the overall ceiling', () => {
    // If the editor could push the shared height to the ceiling, a two-line
    // question would sit in a 800px card as soon as the student wrote at length.
    expect(EDITOR_SYNC_CAP).toBeLessThan(MAX_CARD_HEIGHT);
    expect(MIN_CARD_HEIGHT).toBeLessThan(EDITOR_SYNC_CAP);
  });
});
