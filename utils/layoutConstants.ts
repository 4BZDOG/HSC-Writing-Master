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
 *                      writing area underneath it — derived below rather than
 *                      chosen.
 *  - MAX_CARD_HEIGHT   absolute ceiling, whatever the viewport.
 *  - VIEWPORT_RESERVE  room left for everything above the cards (the app
 *                      header, the breadcrumb and the verb ribbon) and a margin
 *                      under them, so the pair ends on screen.
 */

/**
 * The writing card's own chrome, measured in Chromium at 1600×1000 with the
 * strategy row folded: an 82px header, a 35px strategy row and a 73px metrics
 * footer.
 *
 * Worth keeping as a measurement rather than a feeling, because it has moved
 * twice: the Evaluate button used to float over the writing surface and needed
 * 96px reserved beneath it, and the two headers ran to ~130px before they were
 * rebuilt from one shared vocabulary.
 */
const WRITING_CARD_CHROME = 190;

/**
 * The smallest writing surface worth offering — roughly six lines of 18px
 * serif plus the surface's own 64px of padding. Below its own padding the
 * empty editor renders a scrollbar with nothing to scroll to, which is the
 * failure this floor exists to prevent.
 */
const MIN_WRITING_SURFACE = 240;

/**
 * 430, not the 620 it was.
 *
 * That number was derived when the writing card's chrome ran to ~375px and the
 * floating Evaluate button needed 96px of clearance under it. Both are gone —
 * the chrome is now 190px — so the floor was holding a one-line question in a
 * card two hundred pixels taller than anything in it, with the empty space
 * mirrored on the writing side. It is derived from the parts now, so trimming
 * the chrome again trims the floor with it.
 */
export const MIN_CARD_HEIGHT = WRITING_CARD_CHROME + MIN_WRITING_SURFACE;
export const MAX_CARD_HEIGHT = 900;
/**
 * 296: the cards start 273px down the page at every two-column width (measured
 * in Chromium at 1280px and 1440px: a 64px header, the breadcrumb and the folded
 * verb ribbon, with their margins), plus 23px under them.
 *
 * It was 180, from before the verb ribbon sat above the cards. The cap then let
 * the pair run about 90px past the bottom of the window, so a long question put
 * the Evaluate button below the fold, and on a laptop even a short one did.
 */
const VIEWPORT_RESERVE = 296;

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
 * The height both cards are pinned to: the prompt's own height, capped by the
 * viewport.
 *
 * The cap is the tallest the pair may grow on this window. A fixed ceiling
 * either wastes a large display or, on a laptop, buries the writing area below
 * the fold — so it is derived from the window and then clamped. When the floor
 * wins (a short window), a long prompt scrolls at MIN_CARD_HEIGHT rather than
 * the pair collapsing to something unusable.
 *
 * In CSS, not in state, because the cap has to move with the window in the
 * same frame. As state it arrived through a resize listener, a render and then
 * an effect's second render, so while the cards were at the cap (a prompt
 * longer than the window has room for) every step of a window drag painted
 * them at the previous height first and corrected a frame later: the bottom of
 * the pair shuddered whenever it reached the bottom of the window. `100vh` is
 * the same measure as `window.innerHeight`, scrollbars included.
 */
export const cappedCardHeight = (naturalHeight: number): string =>
  `min(${naturalHeight}px, clamp(${MIN_CARD_HEIGHT}px, 100vh - ${VIEWPORT_RESERVE}px, ${MAX_CARD_HEIGHT}px))`;

/** The sticky app header (h-16) plus a 2rem margin under the card. */
const FREE_CARD_RESERVE = 96;
export const FREE_CARD_FLOOR = 300;

/**
 * The writing card's ceiling when the cards are not side by side (Focus Mode,
 * or one column below the two-column breakpoint). Nothing pins the writing
 * card to the question there, and a flat 900px ceiling let it grow past the
 * bottom of an 800px window, so every new line scrolled the page. It now stops
 * at the window, less the sticky header, and scrolls inside itself, as the
 * paired cards do.
 */
export const freeCardMaxHeight = `min(${MAX_CARD_HEIGHT}px, max(${FREE_CARD_FLOOR}px, 100vh - ${FREE_CARD_RESERVE}px))`;

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
