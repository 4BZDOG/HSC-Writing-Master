import { describe, it, expect } from 'vitest';
import {
  naturalCardHeight,
  naturalChromeHeight,
  cardHeightCap,
  isMeaningfulHeightChange,
  isTwoColumnWidth,
  HEIGHT_SYNC_TOLERANCE,
  MAX_CARD_HEIGHT,
  MIN_CARD_HEIGHT,
  TWO_COLUMN_BREAKPOINT,
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

  /**
   * The floor exists to leave a usable writing area under a one-line question,
   * and nothing more. Set too high — as 620 was, once the Evaluate button
   * stopped floating and the headers were rebuilt — it holds a short question
   * in a card far taller than anything in it, with the empty space mirrored on
   * the writing side.
   */
  it('clears the writing card chrome with a usable surface left over', () => {
    // Measured chrome: 82px header + 35px strategy row + 73px metrics footer.
    const CHROME = 190;
    expect(MIN_CARD_HEIGHT - CHROME).toBeGreaterThanOrEqual(240);
  });

  it('does not hold a short question in a card of empty space', () => {
    // A one-line question with no scenario is ~200px of card. The floor may
    // add breathing room; it may not add a screenful.
    expect(MIN_CARD_HEIGHT).toBeLessThanOrEqual(480);
  });
});

/**
 * The two cards size each other, so every measurement is also an input to the
 * next one. At fractional browser zoom the same box measures a hair taller or
 * shorter frame to frame; without a dead-band those roundings chase each other
 * and the pair flickers for as long as the zoom or drag continues.
 */
describe('isMeaningfulHeightChange', () => {
  it('ignores the sub-pixel drift a zoomed browser reports', () => {
    expect(isMeaningfulHeightChange(52, 52)).toBe(false);
    expect(isMeaningfulHeightChange(52, 53)).toBe(false);
    expect(isMeaningfulHeightChange(52, 50.4)).toBe(false);
  });

  it('still acts on a real layout change', () => {
    // A footer wrapping to a second row, a header gaining a chip: tens of
    // pixels, never one or two.
    expect(isMeaningfulHeightChange(52, 104)).toBe(true);
    expect(isMeaningfulHeightChange(163, 41)).toBe(true);
  });

  it('is symmetric — growing and shrinking are judged the same', () => {
    expect(isMeaningfulHeightChange(100, 100 + HEIGHT_SYNC_TOLERANCE + 1)).toBe(true);
    expect(isMeaningfulHeightChange(100, 100 - HEIGHT_SYNC_TOLERANCE - 1)).toBe(true);
  });

  it('reports the first measurement, taken against a zero start', () => {
    expect(isMeaningfulHeightChange(0, 52)).toBe(true);
  });
});

describe('naturalChromeHeight', () => {
  const chrome = (contentHeight: number, padding: string) => {
    const box = document.createElement('div');
    box.style.padding = padding;
    const content = document.createElement('div');
    Object.defineProperty(content, 'offsetHeight', { value: contentHeight });
    box.appendChild(content);
    return { box, content };
  };

  it('adds the box own padding to the content it holds', () => {
    const { box, content } = chrome(30, '12px 8px');
    expect(naturalChromeHeight(box, content)).toBe(54);
  });

  it('is unaffected by the synced minimum stretching the box', () => {
    // The whole point: the rendered box carries the OTHER card's height, so
    // measuring it would ratchet the pair upward and never let it back down.
    const { box, content } = chrome(30, '12px');
    box.style.minHeight = '400px';
    expect(naturalChromeHeight(box, content)).toBe(54);
  });

  it('reports nothing before either element is mounted', () => {
    const { box, content } = chrome(30, '12px');
    expect(naturalChromeHeight(null, content)).toBe(0);
    expect(naturalChromeHeight(box, null)).toBe(0);
  });
});

describe('the single-column switch', () => {
  it('happens at xl, so a zoomed-in page drops to one column a step sooner', () => {
    expect(TWO_COLUMN_BREAKPOINT).toBe(1280);
    // A 1440px window at 125% zoom reports 1152 CSS pixels. It used to keep
    // two columns of large type, each wrapping every few words.
    expect(isTwoColumnWidth(1440 / 1.25)).toBe(false);
    // The same window unzoomed still gets its two columns.
    expect(isTwoColumnWidth(1440)).toBe(true);
  });
});
