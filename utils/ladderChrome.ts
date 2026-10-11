/**
 * The mark ladder's shared class vocabulary, in the same shape as
 * `utils/sampleAnswerChrome.ts` and `utils/verbRibbonChrome.ts`.
 *
 * A ladder row is a MARK GUTTER on the left and a BODY on the right. The Marking
 * Guide draws one row per mark level (`components/MarkingCriteriaAccordion.tsx`)
 * and the Sample Answers panel draws one per level with an exemplar in it. The
 * two panels line up when they are open side by side only because every row in
 * both is built from these constants, so the gutter width, the radius, the type
 * and the spacing are stated here once and not restated at either call site.
 *
 * The band's COLOUR is never written here. A row hands its band to CSS as
 * `--band-rgb` (from `getBandRgb`), and takes its fill and ink from
 * `getBandConfig(band)` at the call site. The three edge and wash classes in
 * `index.css` draw the band at their own alpha in both themes, which is why they
 * carry no `dark:` partner.
 *
 * Each constant records what it is painted ON, because that is the question
 * DesignSpec §2 asks of every colour and it is not answerable from the class
 * string alone. `tests/unit/ladderRow.test.tsx` holds the shape of these classes.
 */

/** The list of rows. Painted on the panel body, which is the page's tone. Rows
 *  in both panels take this same gap, so their rhythm matches when they sit
 *  side by side. */
export const LADDER_STACK = 'space-y-2';

/** A row's outer box: the rounded card the gutter and the body sit inside. The
 *  band's fill is added at the call site from `getBandConfig(band).bg`, so the
 *  whole row reads as one band in both themes. Painted on the panel body.
 *
 *  `rounded-xl` is the control radius, and it is the same on both panels so the
 *  two sets of rows agree. `items-stretch` makes the gutter as tall as the body.
 *  Its transition names only the edge and the shadow it can change, never
 *  `transition-all`, as DesignSpec §3 asks of anything that animates. */
export const LADDER_ROW =
  'flex items-stretch rounded-xl border overflow-hidden shadow-sm transition-[border-color,box-shadow] duration-300 ease-out';

/** A row's edge when it is at rest: the band at a whisper, 35% of its hue. Painted
 *  on the row's own border. */
export const LADDER_EDGE_SHUT = 'band-edge';

/** A row's edge when it is open or selected: the band at a statement, 85% of its
 *  hue. Painted on the row's own border. */
export const LADDER_EDGE_OPEN = 'band-edge-strong';

/** The mark gutter: a fixed-width column on the left of every row, so the mark
 *  numbers of both panels fall on the same vertical line. `w-16` is 64px on a
 *  phone and `sm:w-[4.5rem]` is 72px from `sm`; the wider step gives a two-digit
 *  range ("7–8") its room without pushing the body narrower than it needs.
 *
 *  It carries the band's wash (added at the call site from `getBandConfig`) and
 *  the divider on its right edge, which is the band edge. Painted on the row's
 *  own band wash. */
export const LADDER_GUTTER =
  'w-16 sm:w-[4.5rem] shrink-0 flex flex-col items-center justify-center gap-1 px-1.5 py-2 border-r';

/** The mark label in the gutter at its usual size. Its colour is the band's text
 *  shade from `getBandConfig(band).text`, added at the call site. Painted on the
 *  gutter's band wash. */
export const LADDER_GUTTER_MARK = 'text-lg font-bold leading-none text-center whitespace-nowrap';

/** The mark label when it is longer than a mark number, which is a band-labelled
 *  row ("Band 3"). At the usual size "Band 3" would not fit the gutter on one line.
 *  Painted on the gutter's band wash. */
export const LADDER_GUTTER_MARK_LONG =
  'text-sm font-bold leading-none text-center whitespace-nowrap';

/** The caption beneath the mark label, "Band N": the `.t-label` size, weight and
 *  case, with the band's text shade from `getBandConfig` at the call site. Painted
 *  on the gutter's band wash. */
export const LADDER_GUTTER_CAPTION = 't-label text-center whitespace-nowrap';

/** The body beside the gutter: the row's content. It takes `min-w-0` so a long
 *  unbroken word wraps rather than pushing the gutter out of the row. Painted on
 *  the row's band wash. The type inside it is the caller's to set, because the
 *  Marking Guide's criterion is serif reading text and the Sample Answers body is
 *  an interactive exemplar. */
export const LADDER_BODY = 'flex-1 min-w-0 p-3';

/** The footer under a body's content, where a row puts a control such as "Model
 *  answer". It wraps, so a row on a narrow phone keeps its control whole. Painted
 *  on the row's band wash. */
export const LADDER_FOOTER = 'mt-2 flex flex-wrap items-center gap-2';

/** The "Model answer" control: a tertiary outline pill, the least loud control in
 *  a row. It is transparent so the band wash shows through, and its edge is the
 *  neutral slate, not the band, so it is not mistaken for part of the ladder.
 *
 *  `min-h-11` (44px) on a phone is the touch target. From `sm` the pill goes back
 *  to its own height, because a 44px pill beside 12px text is too heavy on a
 *  desktop. The padding and the `t-label` size are what give it its shape.
 *
 *  Hover is `can-hover:`, as everywhere in the app: a tap on a phone leaves
 *  `:hover` on the element. Press feedback is `active:` on `transform`.
 *  Painted on the row's band wash, so its ink is the neutral slate pair. */
export const LADDER_MODEL_ANSWER =
  't-label inline-flex items-center gap-1.5 min-h-11 sm:min-h-0 px-3 py-1.5 rounded-full border border-slate-400 bg-transparent text-slate-700 dark:border-white/25 dark:text-slate-200 can-hover:hover:border-slate-600 can-hover:hover:bg-slate-900/5 dark:can-hover:hover:border-white/50 dark:can-hover:hover:bg-white/10 transition-colors duration-200 touch-manipulation active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/40 dark:focus-visible:ring-white/60';
