import { describe, it, expect } from 'vitest';
import {
  TAB_STRIP_FADE_PX,
  scrollLeftToReveal,
  tabStripEdgeMask,
  tabStripEdges,
} from '../../utils/tabStrip';

/** A 300px-wide row holding 600px of tabs, so 300px lies beyond the viewport. */
const row = (scrollLeft: number) => ({ scrollLeft, scrollWidth: 600, clientWidth: 300 });

describe('tabStripEdges', () => {
  it('shows only the trailing edge when the row is at its start', () => {
    expect(tabStripEdges(row(0))).toEqual({ start: false, end: true });
  });

  it('shows only the leading edge when the row is at its end', () => {
    expect(tabStripEdges(row(300))).toEqual({ start: true, end: false });
  });

  it('shows both edges when the row is scrolled into the middle', () => {
    expect(tabStripEdges(row(150))).toEqual({ start: true, end: true });
  });

  it('shows no edge at all when every tab fits', () => {
    expect(tabStripEdges({ scrollLeft: 0, scrollWidth: 300, clientWidth: 300 })).toEqual({
      start: false,
      end: false,
    });
  });

  it('ignores a sub-pixel gap at either end, which rounding leaves behind', () => {
    expect(tabStripEdges(row(0.4))).toEqual({ start: false, end: true });
    expect(tabStripEdges(row(299.6))).toEqual({ start: true, end: false });
  });
});

describe('tabStripEdgeMask', () => {
  it('is undefined when there is nothing to hide, so the row is drawn unmasked', () => {
    expect(tabStripEdgeMask({ start: false, end: false })).toBeUndefined();
  });

  it('fades only the trailing edge when only more tabs lie beyond it', () => {
    const mask = tabStripEdgeMask({ start: false, end: true });
    expect(mask).toContain(`calc(100% - ${TAB_STRIP_FADE_PX}px)`);
    expect(mask).toContain('transparent 100%');
    expect(mask).not.toMatch(/transparent 0/);
  });

  it('fades only the leading edge when only more tabs lie before it', () => {
    const mask = tabStripEdgeMask({ start: true, end: false });
    expect(mask).toContain(`transparent 0, #000 ${TAB_STRIP_FADE_PX}px`);
    expect(mask).not.toContain('calc(100%');
  });

  it('fades both edges with the same width', () => {
    const mask = tabStripEdgeMask({ start: true, end: true }) ?? '';
    expect(mask).toContain(`transparent 0, #000 ${TAB_STRIP_FADE_PX}px`);
    expect(mask).toContain(`#000 calc(100% - ${TAB_STRIP_FADE_PX}px), transparent 100%`);
  });

  it('is built from opacity stops alone, so it takes no colour from either theme', () => {
    const mask = tabStripEdgeMask({ start: true, end: true }) ?? '';
    // Only black and transparent: the mask decides how much shows, not what colour it is.
    expect(mask).not.toMatch(/rgb|hsl|var\(/);
  });
});

describe('scrollLeftToReveal', () => {
  const viewport = { scrollLeft: 0, clientWidth: 300 };

  it('leaves the row where it is when the tab is already clear of both edges', () => {
    expect(scrollLeftToReveal({ offsetLeft: 100, offsetWidth: 80 }, viewport)).toBe(0);
  });

  it('brings a tab beyond the trailing edge into view, clear of the fade', () => {
    // Right edge at 480 + 24 of fade, against a 300px viewport.
    expect(scrollLeftToReveal({ offsetLeft: 420, offsetWidth: 60 }, viewport)).toBe(
      420 + 60 + TAB_STRIP_FADE_PX - 300
    );
  });

  it('brings a tab before the leading edge into view, clear of the fade', () => {
    expect(
      scrollLeftToReveal(
        { offsetLeft: 200, offsetWidth: 60 },
        { scrollLeft: 400, clientWidth: 300 }
      )
    ).toBe(200 - TAB_STRIP_FADE_PX);
  });

  it('never scrolls to a negative position for the first tab', () => {
    expect(
      scrollLeftToReveal({ offsetLeft: 0, offsetWidth: 60 }, { scrollLeft: 40, clientWidth: 300 })
    ).toBe(0);
  });
});
