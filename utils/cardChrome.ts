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

/** The header box itself. Each card adds its own background — a band gradient
 *  on the question, the progress-driven colour on the writing area. */
export const CARD_HEADER_BOX =
  'px-4 sm:px-6 py-3 text-white flex justify-between items-start relative overflow-hidden flex-shrink-0 rounded-t-surface-inner';

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
 */
export const CARD_HEADER_TITLE =
  'flex flex-wrap items-center gap-2 min-h-7 text-base sm:text-lg font-black tracking-normal uppercase italic leading-none drop-shadow-sm';

/** The one line under the title — "Band 2 ceiling", the band + progress meter.
 *  Floored for the same reason: both cards put a chip on this line. */
export const CARD_HEADER_META_ROW = 'flex flex-wrap items-center gap-2 min-h-6 mt-1';

export const CARD_HEADER_META = 't-label text-white/60 leading-none';

/**
 * The bottom-right corner of the header, where each card docks its controls.
 * `self-stretch` + `items-end` is what puts them on the floor of the row rather
 * than up beside the heading.
 */
export const CARD_HEADER_TRAY =
  'self-stretch flex flex-wrap items-end justify-end gap-x-3 gap-y-2 ml-auto flex-shrink-0';

/**
 * The dark pill bar in that corner: stat pills on the question card, the
 * writing tools on the response card. Same height, same fill, same border on
 * both — it is the clearest signal that the two cards belong together.
 */
export const CARD_HEADER_BAR =
  'flex items-center h-9 px-2 rounded-xl bg-black/20 backdrop-blur-xl border border-white/10 shadow-inner';
