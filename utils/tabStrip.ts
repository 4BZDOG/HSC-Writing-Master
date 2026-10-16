/**
 * Edge cues for a horizontally scrolling tab row.
 *
 * A row of tabs that runs off the side of a phone gives no sign that it does:
 * at 390px the outcome dialog's EC-05 tab was simply not there. The cue is a
 * fade on the edge that has more behind it. It is a mask, not a painted
 * overlay, so it carries no colour of its own and reads the same over the light
 * and dark heads, whatever gradient sits behind the tabs.
 */

/** How far the fade reaches in from each edge, and the margin the active tab is
 *  kept clear of when it is scrolled into view, so it never sits under the fade. */
export const TAB_STRIP_FADE_PX = 24;

/** Sub-pixel rounding makes scrollWidth - clientWidth - scrollLeft land on 0.5 at
 *  the far end; a one-pixel slack keeps the cue from flickering there. */
const EDGE_TOLERANCE_PX = 1;

export interface TabStripMetrics {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

export interface TabStripEdges {
  /** More tabs lie before the first one visible. */
  start: boolean;
  /** More tabs lie after the last one visible. */
  end: boolean;
}

export const tabStripEdges = ({
  scrollLeft,
  scrollWidth,
  clientWidth,
}: TabStripMetrics): TabStripEdges => ({
  start: scrollLeft > EDGE_TOLERANCE_PX,
  end: scrollWidth - clientWidth - scrollLeft > EDGE_TOLERANCE_PX,
});

/**
 * The CSS mask for those edges, or `undefined` when there is nothing to hide.
 * Both edges use the same length, so the fade is symmetrical when the row is
 * scrolled to the middle.
 */
export const tabStripEdgeMask = ({ start, end }: TabStripEdges): string | undefined => {
  if (!start && !end) return undefined;
  const fade = `${TAB_STRIP_FADE_PX}px`;
  const from = start ? `transparent 0, #000 ${fade}` : `#000 0`;
  const to = end ? `#000 calc(100% - ${fade}), transparent 100%` : `#000 100%`;
  return `linear-gradient(to right, ${from}, ${to})`;
};

/**
 * The scrollLeft that brings a tab fully into view, keeping the fade clear of it.
 * Returns the current position when the tab is already clear, so the caller can
 * skip the write. Offsets are relative to the start of the row.
 */
export const scrollLeftToReveal = (
  tab: { offsetLeft: number; offsetWidth: number },
  viewport: { scrollLeft: number; clientWidth: number }
): number => {
  const left = tab.offsetLeft - TAB_STRIP_FADE_PX;
  const right = tab.offsetLeft + tab.offsetWidth + TAB_STRIP_FADE_PX;
  if (left < viewport.scrollLeft) return Math.max(0, left);
  if (right > viewport.scrollLeft + viewport.clientWidth) {
    return right - viewport.clientWidth;
  }
  return viewport.scrollLeft;
};
