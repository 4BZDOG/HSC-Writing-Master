/**
 * Shared geometry for the two workspace cards ("Writing Prompt" and "Written
 * Response").
 *
 * The relationship between them is deliberately one-way: **the question prompt
 * dictates the height, and the writing area matches it.** The prompt grows to
 * fit its question and scenario so a student can read the whole thing without
 * scrolling — up to the point where growing further would push the writing
 * area off screen. Past that the prompt scrolls too. The response grows
 * without bound, so the writing area always scrolls when it needs to.
 *
 *  - MIN_CARD_HEIGHT   floor, so a one-line question still leaves a usable
 *                      writing area underneath it. It has to clear the
 *                      writing area's own chrome — header, strategy tip and
 *                      metrics footer run to ~375px — plus the 96px reserved
 *                      under the floating Evaluate button. Below this the
 *                      writing surface is shorter than its own padding and an
 *                      EMPTY editor renders a scrollbar with nothing to
 *                      scroll to.
 *  - MAX_CARD_HEIGHT   absolute ceiling, whatever the viewport.
 *  - VIEWPORT_RESERVE  room left for the app header, breadcrumb and the page
 *                      margins around the cards.
 */
export const MIN_CARD_HEIGHT = 620;
export const MAX_CARD_HEIGHT = 900;
const VIEWPORT_RESERVE = 180;

/**
 * The width at which the workspace becomes two columns — Tailwind's `xl`, the
 * breakpoint the grid itself uses.
 *
 * Every part of the cross-card sync (header, footer and total height) exists so
 * the two cards' chrome lines up when they sit SIDE BY SIDE. Stacked, there is
 * nothing to line up, and matching them actively hurts: a prompt footer that
 * wraps its outcome chips onto three rows on a phone was forcing the writing
 * area's 41px footer to 163px of empty space.
 *
 * It was `lg` (1024). Zooming the page shrinks the viewport in CSS pixels, so
 * the breakpoint is also what decides when a student who has zoomed in for
 * legibility drops to one column — and at 1024 the pair held on far too long:
 * two ~500px columns of large type, each wrapping every few words, with the
 * question's own chrome taking three rows. One column arrives a zoom step
 * earlier now.
 */
export const TWO_COLUMN_BREAKPOINT = 1280;

/**
 * How far a measured height must move before the sync acts on it.
 *
 * The two cards feed each other's chrome heights (each footer is floored at
 * the taller of the two, and so on). At fractional browser zoom the same
 * element measures 51.6px one frame and 52.4px the next, and those roundings
 * land on either side of the boundary — enough for the pair to trade heights
 * back and forth for as long as the zoom or drag continues, which reads as
 * violent flickering. Nothing the layout does needs sub-2px fidelity, so
 * movement that small is treated as no movement at all.
 */
export const HEIGHT_SYNC_TOLERANCE = 2;

/** Whether a freshly measured height is a real change, not zoom jitter. */
export const isMeaningfulHeightChange = (previous: number, next: number): boolean =>
  Math.abs(previous - next) > HEIGHT_SYNC_TOLERANCE;

/**
 * Natural height of a card's header or footer: the content it holds plus the
 * box's own padding.
 *
 * Deliberately NOT the rendered box. Both cards' chrome carries the synced
 * minimum, so measuring the box fed that inflated number straight back into
 * the sync and the chrome could only ever grow — a footer that wrapped to two
 * rows at a narrow width stayed tall after widening again.
 */
export const naturalChromeHeight = (
  box: HTMLElement | null,
  content: HTMLElement | null
): number => {
  if (!box || !content) return 0;
  const cs = getComputedStyle(box);
  return Math.round(
    content.offsetHeight + (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)
  );
};

export const isTwoColumnWidth = (viewportWidth: number): boolean =>
  viewportWidth >= TWO_COLUMN_BREAKPOINT;

/**
 * The tallest the pair may grow on this viewport. A fixed ceiling either wastes
 * a large display or, on a laptop, buries the writing area below the fold — so
 * it is derived from the window and then clamped. When the floor wins (a short
 * window), a long prompt scrolls at MIN_CARD_HEIGHT rather than the pair
 * collapsing to something unusable.
 */
export const cardHeightCap = (viewportHeight: number): number =>
  Math.max(MIN_CARD_HEIGHT, Math.min(MAX_CARD_HEIGHT, viewportHeight - VIEWPORT_RESERVE));

/**
 * Natural (content-driven) height of the prompt card — the single value the
 * writing area is sized from.
 *
 * It must not depend on anything derived from itself. The card carries a
 * `minHeight` floor, and that floor stretches the body inside it, so measuring
 * the rendered card made the sync a one-way ratchet: it reports its inflated
 * height, that becomes the next floor, and it can never shrink again.
 * Substituting the body's CONTENT height for its RENDERED height leaves the
 * height the card would have with nothing constraining it — including when the
 * content is taller than the cap and the body is scrolling.
 *
 * `card` is the outer element, so its borders are counted — the writing area
 * pins itself to this number exactly, and measuring inside the border left it
 * 4px short. The header and footer carry synced minimums too, but those are
 * symmetric (both cards are meant to have chrome of the same height) and that
 * inflation is real height this card occupies, so it stays in the total.
 */
export const naturalCardHeight = (
  card: HTMLElement | null,
  body: HTMLElement | null,
  bodyContent: HTMLElement | null
): number => {
  if (!card) return 0;
  if (!body || !bodyContent) return Math.round(card.offsetHeight);
  return Math.round(card.offsetHeight - body.offsetHeight + bodyContent.offsetHeight);
};
