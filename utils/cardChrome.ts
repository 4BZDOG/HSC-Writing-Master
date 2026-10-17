import { getBandInkRgb } from './renderUtils';

/**
 * The header shared by the workspace's two cards — "Writing Prompt" and
 * "Written Response".
 *
 * They are a pair, and they have to read as one: same padding, same icon tile,
 * same title size, same meta line under it, and the same dark pill bar docked
 * in the bottom-right corner (the question's stat pills on one side, the
 * writing tools on the other). Held apart in two files, they drifted every
 * time either was touched — different paddings, different title sizes, a
 * toolbar beside the heading on one card and a pill bar under the corner on
 * the other. One vocabulary, imported by both, is what stops that.
 *
 * The heights are deliberately tight. The old header ran to ~95px on a laptop
 * for a title, a six-word meta line and a row of pills, most of it air.
 */

/**
 * The strip along the foot of each card: the word count and Evaluate on the
 * writing card, the outcome chips and zoom controls on the prompt. Both take
 * this one ground and rule, so the pair closes the way it opens.
 *
 * The ground is the writing well's own token, not a translucent inset laid over
 * the paper. At 60% over a white card the prompt's footer came out as a grey
 * that was almost, not quite, the card's white, and nothing else in the card
 * used that tone. As a ladder token it is the same recess in both themes.
 *
 * The rule is the alpha carrier (`--color-border-secondary`, see index.css) at
 * /15: a whisper, rather than white/10 on dark and slate-300 on light.
 */
export const CARD_FOOTER_BOX =
  'flex-shrink-0 rounded-b-surface-inner px-4 sm:px-6 py-3 border-t border-[rgb(var(--color-border-secondary))]/15 bg-[rgb(var(--color-bg-surface-inset))]';

/**
 * The ground under a card header's title, for the band the card is drawn in.
 *
 * The header used to take the band's `-500` fill, and the title is white on
 * it. That fails at the bright end of the gradient: white measured 2.2:1 on
 * the dark theme's yellow and 3.8:1 on red, and the title is 18-24px at weight
 * 900 — there is no size at which it is large text in both themes.
 *
 * So the ground is the band's `-700` step (`BAND_HEX_INK`, the pinned set for
 * text on a pale surface), and white clears 4.5:1 on it for all six hues, the
 * palest — yellow — at 4.9:1. It is flat at the left and darkens towards the
 * right, so the depth stays and the worst pixel is the flat one. Not
 * `band-solid`: its white sheen takes the top corner back under 3.5:1.
 *
 * It is the same in both themes. The dark theme's progress veil only darkens
 * it further, so nothing here depends on the theme.
 */
export const cardHeaderWash = (band: number): string =>
  `linear-gradient(90deg, rgb(0 0 0 / 0) 40%, rgb(0 0 0 / 0.2) 100%), rgb(${getBandInkRgb(band)})`;

/** The header box itself. Each card adds its own background — the band wash
 *  from `cardHeaderWash` on both cards, or the surface on the writing area in
 *  Exam Mode.
 *
 *  `items-stretch`, not `items-start`: the row inside has to fill the shared
 *  minimum height, or each corner bar sits at the bottom of ITS OWN row and the
 *  two cards' bars land wherever their different content happens to end. It used
 *  to work because both rows came out the same height; the question card's corner
 *  gained a reading size above its bar, the rows differed, and the bars were 4px
 *  apart. The headings stay top-aligned either way (see `CARD_HEADER_ROW`). */
export const CARD_HEADER_BOX =
  'px-4 sm:px-6 py-3 text-white flex justify-between items-stretch relative overflow-hidden flex-shrink-0 rounded-t-surface-inner';

/**
 * The row inside it. TOP-aligned, and it must stay that way: the two headers
 * are stretched to a shared height but hold different things, so centring
 * aligns each heading against a different content height — an offset that then
 * moves with zoom and with every width at which the chrome wraps. Pinned to the
 * top, both headings sit exactly one padding step below the top of their card.
 */
export const CARD_HEADER_ROW =
  'relative z-10 w-full flex flex-wrap justify-between items-start gap-x-3 gap-y-2';

/** Icon tile + title block. */
export const CARD_HEADER_IDENTITY = 'flex items-start gap-3 min-w-0';

export const CARD_HEADER_ICON =
  'w-10 h-10 rounded-xl bg-white/20 backdrop-blur-xl flex items-center justify-center border border-white/30 shadow-lg group flex-shrink-0';

/** `pt-0.5` on both, so the two headings start on the same line. */
export const CARD_HEADER_TITLE_BLOCK = 'min-w-0 pt-0.5';

/**
 * `min-h-7` with the text centred in it, rather than a bare line of type. The
 * question card hangs status chips off its heading (enhancing, flagged, the
 * paper it came from) and a chip is taller than the line it sits on, so an
 * unconstrained heading grew by a few pixels exactly when one appeared —
 * taking the whole title block, and with it the bar docked at the bottom of
 * the row, out of step with the other card. A floor the chips fit inside keeps
 * the two rows identical whatever is in them.
 *
 * The size steps up twice, and the second step waits for room.
 *
 * These are the names of the two things the whole workspace is: the question
 * and the answer. At the `text-base sm:text-lg` they were, they sat below the
 * 40px icon tile beside them and level with the chips underneath, so each card
 * read as a strip of chrome with a caption rather than as a titled surface.
 * 24px puts the name back in proportion to its own tile.
 *
 * But the heading and the corner bar share one wrapping row, and 24px takes
 * 63px more of it on the response card than 18px did. Measured across widths:
 * below 1360px the response card's bar drops to its own line while the
 * question card's — which is narrower — stays up beside the heading, and the
 * two bars end up 44px apart. That is the pair coming apart, which is the one
 * thing this file exists to stop, and `workspace-chrome.spec.ts` catches it at
 * 1280.
 *
 * So the full step is held until there is width for it. 1360 is not a round
 * number because it is not a guess: it is where the bar stops fitting. Below
 * it the heading takes `text-xl`, which is still a step up from before and
 * holds the bars level at every width down to the two-column breakpoint.
 */
export const CARD_HEADER_TITLE =
  'flex flex-wrap items-center gap-2 min-h-7 text-lg sm:text-xl min-[1360px]:text-2xl t-display tracking-normal uppercase italic leading-none drop-shadow-sm';

/** The one line under the title — "Band 2 ceiling", the band + progress meter.
 *  Floored for the same reason: both cards put a chip on this line. */
export const CARD_HEADER_META_ROW = 'flex flex-wrap items-center gap-2 min-h-6 mt-1';

/**
 * The meta line under a title ("No assistance", a band chip). Solid white, not
 * `white/60`: a translucent white composites towards the band's ink, and on
 * the six washes that put it at 2.6-3.4:1 in both themes. Clearing 4.5:1 on
 * yellow, the palest, takes about 95% white, so the hierarchy comes from the
 * `t-label` size and weight rather than from opacity.
 * `tests/unit/cardHeaderWashContrast.test.ts` pins it on all six bands.
 */
export const CARD_HEADER_META = 't-label text-white leading-none';

/**
 * The bottom-right corner of the header, where each card docks its controls.
 * `self-stretch` + `items-end` is what puts them on the floor of the row rather
 * than up beside the heading.
 */
export const CARD_HEADER_TRAY =
  // `shrink-0` at `sm` and up, where it is what stops a long heading squeezing
  // the controls. Below `sm` it is what made them unreachable: the tray refused
  // to shrink, so the bar inside it stayed at its content width — a constant
  // 347px on the response card at every viewport from 320 to 1280 — and simply
  // ran off the edge of a 320px screen. Allowed to shrink, the bar becomes
  // bounded and can scroll (see CARD_HEADER_BAR). `min-w-0` is the half that
  // makes shrinking actually possible: a flex item will not go below its
  // content's intrinsic width without it.
  'self-stretch flex flex-wrap items-end justify-end gap-x-3 gap-y-2 ml-auto min-w-0 shrink sm:shrink-0';

/**
 * The question card's corner: the reading size across the top and the stat bar on
 * the floor, one column right-aligned. It is `CARD_HEADER_TRAY` with a second
 * thing in it, so it keeps the tray's job (top-aligned row, bar level with the
 * writing card's across the gap) and its shrink rules.
 *
 * Two rows cost a header 28px + 4px + the bar's 36px = 68px, inside the 72px the
 * heading block already occupies, so the header stays at its ~92px and under the
 * 96px ceiling `workspace-chrome.spec.ts` holds. On a phone the corner is a full
 * row of its own (the title block has no room beside it) and runs as one line,
 * reading size at the left and the bar at the right, rather than two 44px rows.
 */
export const CARD_HEADER_CORNER =
  'self-stretch flex flex-col items-end justify-between gap-1 ml-auto min-w-0 shrink sm:shrink-0 max-sm:w-full max-sm:flex-row max-sm:items-center max-sm:justify-between max-sm:gap-3';

/**
 * The reading size control in that corner. The bar's own fill and border, one step
 * smaller (28px against the bar's 36px, so the pair stack inside the heading's
 * height), and 44px on a phone where its buttons are touch targets.
 */
export const CARD_HEADER_ZOOM =
  'flex items-center gap-0.5 h-7 max-sm:h-11 px-0.5 rounded-xl bg-black/20 backdrop-blur-xl border border-white/10 shadow-inner';

/** One of its two buttons. White on the band wash, like everything else in the
 *  header; disabled at the end of the range, which WCAG 1.4.3 exempts. */
export const CARD_HEADER_ZOOM_BUTTON =
  'flex items-center justify-center h-6 w-7 max-sm:h-11 max-sm:w-11 rounded-lg text-white hover:bg-white/15 active:scale-[0.98] transition-colors touch-manipulation disabled:cursor-not-allowed disabled:text-white/50 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70';

/**
 * The dark pill bar in that corner: stat pills on the question card, the
 * writing tools on the response card. Same height, same fill, same border on
 * both — it is the clearest signal that the two cards belong together.
 */
export const CARD_HEADER_BAR =
  // Scrolls only below `sm`, and only when it has to: above that the tray is
  // `shrink-0`, so the bar is never bounded, `scrollWidth === clientWidth` and
  // no scroll container is created at all. The fill and border are the same
  // at every width; the height is 44px below `sm`, where the writing tools are
  // 44px touch targets. Both cards take the same step, so the pair still matches.
  'flex items-center h-9 max-sm:h-11 px-2 rounded-xl bg-black/20 backdrop-blur-xl border border-white/10 shadow-inner min-w-0 max-sm:overflow-x-auto max-sm:scrollbar-hide';
