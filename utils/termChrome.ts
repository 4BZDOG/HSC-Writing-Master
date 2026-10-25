/**
 * The syllabus-term chip, in the same shape as `utils/panelStyles.ts` and
 * `utils/cardChrome.ts`.
 *
 * One word of the syllabus that a student has not used yet. It appears on the
 * prompt card's "syllabus terms to weave in" and the draft check's term pills,
 * which share `TERM_CHIP_RESTING` and `TERM_CHIP_HOVER`. Each had hand-written
 * its own copy, and by the time they were put side by side they had drifted:
 *
 *     bg-slate-100    text-slate-700  border-slate-300   (draft check)
 *     bg-slate-100/50 text-slate-600  border-slate-200   (prompt card)
 *
 * The prompt card's chips are the faintest of the two, and a half-strength
 * slate-100 on the white prompt card is a 1.05:1 fill behind a 1.17:1 border, so
 * the chip had neither a face nor an edge. So the resting tone is stated once here.
 *
 * The Syllabus Terms panel draws its chips as PILLS on the mark ladder instead
 * (`TERM_PILL_*` below), because the panel is a ladder of rows and its chips sit
 * on a band's fill, not on a card. Those take their band from `getBandConfig` at
 * the call site: a term already used is the band's own colour, and that is
 * `utils/renderUtils.ts`'s to decide (DesignSpec §2).
 */

/** Fill, ink and edge for a term the draft has not reached yet. */
export const TERM_CHIP_RESTING =
  'bg-slate-100 dark:bg-white/[0.03] ' +
  'text-slate-700 dark:text-slate-400 ' +
  'border-slate-300 dark:border-white/10';

/** …and the edge it takes under the pointer, where the chip is a control. */
export const TERM_CHIP_HOVER =
  'hover:border-slate-400 dark:hover:border-white/20 ' +
  'hover:bg-slate-200 dark:hover:bg-white/[0.06]';

/*
 * The Syllabus Terms pill. A pill is two controls side by side inside one frame:
 * the term itself (which inserts it, for a student) and, for a curator, a remove
 * control. It is never a button inside a button, because a control inside a control
 * is reached by neither a keyboard nor a screen reader.
 */

/** The frame: the pill's shape and edge. Its ground and ink come from the state
 *  classes below. */
export const TERM_PILL_FRAME =
  'inline-flex items-stretch max-w-full rounded-full border transition-[background-color,border-color,color] duration-200';

/*
 * The four pill states, in pastel. Each is a class in `index.css` (`.term-pill-*`)
 * that reads the row's `--band-rgb` and `--band-ink-deep-rgb`, so a pill is a soft
 * tint of the question's own band rather than a second palette. The band's solid
 * pair stays where it is (the ladder's gutter); a chip drawn at full strength beside
 * it, once per term, made the panel the loudest thing on the page.
 *
 * - A key term is the band's tint with the band's `-800` ink, so it reads as the
 *   question's own word before it is used; used, the tint deepens and takes a tick.
 * - A supporting term is near-white with a faint band edge and neutral ink, a step
 *   quieter than a key term; used, it takes a light tint and the band's ink.
 *
 * Every ink clears 4.5:1 on its own ground in both themes, for all six bands.
 */
export const TERM_PILL_KEY_OPEN = 'term-pill-key';
export const TERM_PILL_KEY_USED = 'term-pill-key-used';
export const TERM_PILL_SUPPORT_OPEN = 'term-pill-support';
export const TERM_PILL_SUPPORT_USED = 'term-pill-support-used';

/** The term button: the touch target. It is 44px tall on a phone, the size a finger
 *  can hit, and returns to 32px from `sm`. Its ink is the frame's, so the solid and
 *  neutral pills share it. Press feedback is `active:` on `transform`. */
export const TERM_PILL_MAIN =
  'inline-flex items-center gap-1.5 min-h-11 sm:min-h-8 min-w-0 px-3 sm:px-2.5 py-1 rounded-full t-label text-left ' +
  'touch-manipulation select-none transition-transform duration-150 active:scale-[0.98] ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset ' +
  'focus-visible:ring-slate-900/40 dark:focus-visible:ring-white/60';

/** A curator's remove control on a pill: a 44px target on a phone (width and
 *  height), and the pill's own size from `sm`. Its hover is a shade over the
 *  pill, so it reads on the neutral and the solid pill alike. */
export const TERM_PILL_REMOVE =
  'inline-flex items-center justify-center min-w-11 sm:min-w-6 min-h-11 sm:min-h-8 pl-1 pr-2.5 sm:pr-2 rounded-full ' +
  'touch-manipulation transition-colors duration-150 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset ' +
  'focus-visible:ring-slate-900/40 dark:focus-visible:ring-white/60 ' +
  'can-hover:hover:bg-black/10 dark:can-hover:hover:bg-white/10';

/** The dot a term not yet used carries in place of a tick: decorative, in the band's
 *  own hue (`.term-pill-dot`), at a size that does not compete with the word. */
export const TERM_PILL_DOT = 'term-pill-dot w-1.5 h-1.5 rounded-full shrink-0';
