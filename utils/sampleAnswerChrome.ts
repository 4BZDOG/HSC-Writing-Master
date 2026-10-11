/**
 * The Sample Answers panel's class vocabulary, on top of the mark ladder's.
 *
 * The panel is a `AccordionSection`, the same chrome as the Marking Guide, and each
 * of its rows is a ladder row (`utils/ladderChrome.ts`): the gutter, the edge, the
 * band wash and the rhythm are the guide's, and are not restated here. What is
 * here is what only the exemplar needs: the tools row, the header line of a row,
 * the picker, the page the exemplar is read on, the actions beneath it, the notes
 * and the locked card.
 *
 * Nothing here names a band colour. A band's fill, ink and edge come from
 * `getBandConfig` and `band-edge` at the call site, and the semantic accents that
 * are not bands (a source's tone, a flag, the upgrade lock) live with their
 * component, so this file stays a neutral set that a theme can be read from.
 *
 * Every colour is a light value with a `dark:` partner, and each constant records
 * what it is painted ON, because that is the question DesignSpec §2 asks of every
 * colour and the class string alone does not answer it.
 * `tests/unit/sampleAnswersPlacard.test.tsx` holds the rules that follow.
 */

/** The body's tools row: reading size on the left-hand side of it, the AI actions
 *  beside it, all pushed to the right. It is the Marking Guide's curator row in the
 *  same slim form, so the two bodies open with the same line. It wraps, so on a
 *  narrow panel the AI actions drop under the reading size rather than off the
 *  edge. Painted on the panel body, which is the page's tone. */
export const SAMPLE_TOOLS = 'flex flex-wrap items-center justify-end gap-2';

/** The reading-size group: the two zoom buttons with the size between them, in one
 *  small well. Painted on the panel body, so it is a white well in the light theme
 *  and a black-tinted one in the dark. */
export const SAMPLE_ZOOM =
  'flex items-center gap-0.5 rounded-lg border border-slate-300 bg-white p-0.5 shadow-sm dark:border-white/10 dark:bg-black/20';

/** One zoom button. It is 44px on a phone, which is the touch target, and returns to
 *  its own size from `sm`. Painted on the zoom well. */
export const SAMPLE_ZOOM_BUTTON =
  'flex items-center justify-center min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 p-1.5 rounded-lg text-slate-600 dark:text-slate-300 can-hover:hover:bg-slate-900/5 dark:can-hover:hover:bg-white/10 transition-colors duration-200 touch-manipulation disabled:cursor-not-allowed disabled:text-slate-400 dark:disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900/40 dark:focus-visible:ring-white/60';

/** The current reading size between the zoom buttons. It is a figure, so it is mono
 *  and tabular and does not move its neighbours as it changes. Painted on the zoom well. */
export const SAMPLE_ZOOM_VALUE =
  'w-7 text-center font-mono text-xs font-bold tabular-nums text-slate-700 dark:text-slate-300 select-none';

/** The AI actions ("Generate", "Recalibrate") in their shut form. It is the Marking
 *  Guide's AI Draft button in shape, so the two AI controls read the same way on
 *  either panel. Painted on the panel body. */
export const SAMPLE_AI_BUTTON =
  'flex items-center gap-2 min-h-11 sm:min-h-0 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-200 can-hover:hover:shadow-lg can-hover:hover:border-slate-400 dark:can-hover:hover:border-white/25 t-label transition-[box-shadow,border-color] duration-200 touch-manipulation active:scale-[0.98] disabled:cursor-not-allowed disabled:text-slate-400 dark:disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900/40 dark:focus-visible:ring-white/60';

/** The header line of a row: the badges and figures on the left, the chevron on the
 *  right. The chevron is its own column, so it stays on the first line when the badges
 *  wrap rather than dropping to a line of its own. It is inside the disclosure, so it
 *  is the part of the row a press lands on. Painted on the row's band wash. */
export const SAMPLE_ROW_HEAD = 'flex items-start gap-3 min-w-0';

/** The badges and figures in a row's header, which wrap among themselves on a narrow
 *  row. Painted on the row's band wash. */
export const SAMPLE_ROW_META = 'flex flex-1 min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5';

/** A figure in the header line: the word count and the exemplar count. The `t-label`
 *  size is what it is set in. Painted on the row's band wash. */
export const SAMPLE_ROW_FIGURE =
  't-label tabular-nums whitespace-nowrap text-slate-700 dark:text-slate-300';

/** The exemplar's opening, shown on a shut row so a student can tell two exemplars
 *  apart before opening either. It is the reading face, clamped to two lines, and it
 *  is not drawn for a locked exemplar. Painted on the row's band wash. */
export const SAMPLE_ROW_PREVIEW =
  'mt-2 line-clamp-2 font-serif text-sm leading-relaxed text-slate-700 dark:text-slate-300 break-words';

/** The previous and next controls for a level with several exemplars, with the "N/M"
 *  between them. These sit beside the disclosure, as siblings of it, so they are
 *  never inside a button. They are hidden below `sm`: the picker on the same row
 *  offers every exemplar as a 44px chip, so the arrows would only take the width the
 *  header needs on a phone. Painted on the row's band wash, so the group is a white
 *  well of its own, the same as the zoom well. */
export const SAMPLE_CAROUSEL =
  'hidden sm:flex shrink-0 items-center gap-0.5 self-center mr-3 rounded-lg border border-slate-300 bg-white p-0.5 shadow-sm dark:border-white/10 dark:bg-black/20';

/** One carousel arrow. It is 44px on a phone. Painted on the carousel's white well. */
export const SAMPLE_CAROUSEL_BUTTON =
  'flex items-center justify-center min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 p-1.5 rounded-lg text-slate-600 dark:text-slate-300 can-hover:hover:bg-slate-900/5 dark:can-hover:hover:bg-white/10 transition-colors duration-200 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900/40 dark:focus-visible:ring-white/60';

/** The "N/M" between the carousel arrows. Painted on the carousel's white well. */
export const SAMPLE_CAROUSEL_COUNT =
  'px-1 text-center font-mono text-xs font-bold tabular-nums text-slate-700 dark:text-slate-300';

/** The picker: the row of exemplar chips at a level that has several. It wraps, so
 *  the chips take as many lines as the row needs. Painted on the row's band wash. */
export const SAMPLE_PICKER = 'flex flex-wrap gap-1.5';

/** One exemplar chip in the picker. It is 44px tall on a phone, which is the touch
 *  target, and its shape is a pill. The chosen chip takes the band's solid fill at the
 *  call site, and the others take `SAMPLE_PICKER_TAB_IDLE`. Painted on the row's band
 *  wash, so an idle chip is transparent and lets the wash through. */
export const SAMPLE_PICKER_TAB =
  't-label inline-flex items-center gap-1 min-h-11 sm:min-h-0 px-3 py-1.5 rounded-full border transition-colors duration-200 touch-manipulation active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900/40 dark:focus-visible:ring-white/60';

/** An idle picker chip: transparent over the band wash, with a neutral edge that is
 *  visible on both themes. Painted on the row's band wash. */
export const SAMPLE_PICKER_TAB_IDLE =
  'border-slate-400 bg-transparent text-slate-700 dark:border-white/25 dark:text-slate-300 can-hover:hover:border-slate-600 dark:can-hover:hover:border-white/50';

/** The "+N more" chip that opens the rest of a long picker. It is dashed, so it reads
 *  as a fold and not as an exemplar. Painted on the row's band wash. */
export const SAMPLE_PICKER_MORE =
  't-label inline-flex items-center min-h-11 sm:min-h-0 px-3 py-1.5 rounded-full border border-dashed border-slate-500 bg-transparent text-slate-700 dark:border-white/30 dark:text-slate-300 can-hover:hover:text-slate-900 dark:can-hover:hover:text-white transition-colors duration-200 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900/40 dark:focus-visible:ring-white/60';

/** The page the exemplar is read on: a sheet, set into the row. It is white in the
 *  light theme, the paper the writing surface sits on, and the inset well in the
 *  dark one, which is the same job in the other theme's ground. Painted on the
 *  row's band wash, so the page is the one bright thing in the row and reads as the
 *  exemplar itself. */
export const SAMPLE_PAGE =
  'overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm dark:border-white/10 dark:bg-[rgb(var(--color-bg-surface-inset))]';

/** The exemplar's text on the page: the reading face, at the reading size. The size
 *  is set inline from the zoom control, so it is not in this class. Painted on the
 *  page. */
export const SAMPLE_PAGE_TEXT =
  'px-5 py-4 sm:px-6 font-serif leading-[1.6] whitespace-pre-wrap break-words text-slate-800 dark:text-slate-200';

/** The toolbar beneath the page: the word and keyword figures on the left and the
 *  actions on the right, wrapping as two lines on a phone. Painted on the row's band
 *  wash, beneath the page. */
export const SAMPLE_ACTIONS = 'flex flex-wrap items-center justify-between gap-x-3 gap-y-2';

/** The group of actions on the toolbar, right-aligned on the line they land on. It
 *  wraps within itself, so every action is reachable at 390px. Painted on the
 *  row's band wash. */
export const SAMPLE_ACTION_GROUP = 'ml-auto flex flex-wrap items-center justify-end gap-1.5';

/** A labelled action: "Use", "Copy", "Submit". It is a neutral button, so the actions
 *  are quiet and the exemplar is what the eye lands on. It is 44px on a phone. Painted
 *  on the row's band wash. */
export const SAMPLE_ACTION =
  't-label inline-flex items-center gap-1.5 min-h-11 sm:min-h-0 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-200 can-hover:hover:bg-slate-100 dark:can-hover:hover:bg-white/10 transition-colors duration-200 touch-manipulation active:scale-[0.98] disabled:cursor-not-allowed disabled:text-slate-400 dark:disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900/40 dark:focus-visible:ring-white/60';

/** An icon-only action: "Flag", "Revise", "Edit", "Delete". It is 44px on a phone, which
 *  is the touch target, and it names itself through its `title`. Painted on the row's
 *  band wash. */
export const SAMPLE_ACTION_ICON =
  'flex items-center justify-center min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 p-2 sm:p-1.5 rounded-lg text-slate-600 dark:text-slate-300 can-hover:hover:bg-slate-900/5 dark:can-hover:hover:bg-white/10 transition-colors duration-200 touch-manipulation active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900/40 dark:focus-visible:ring-white/60';

/** The divider between the student's actions and a curator's, a hairline. Painted on
 *  the row's band wash. */
export const SAMPLE_ACTION_DIVIDER = 'mx-1 h-4 w-px bg-slate-400 dark:bg-white/20';

/** The toggle that folds the Coach's Tip and the Feedback away. It is a caption-sized
 *  text control, 44px tall on a phone. Painted on the row's band wash. */
export const SAMPLE_NOTE_TOGGLE =
  't-label inline-flex items-center gap-1.5 min-h-11 sm:min-h-0 text-slate-700 dark:text-slate-300 can-hover:hover:text-slate-900 dark:can-hover:hover:text-white transition-colors duration-200 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900/40 dark:focus-visible:ring-white/60';

/** The prose of a Coach's Tip or Feedback note: the sentence the note says, read as
 *  running text. Painted on the row's band wash, beside the note's rule. */
export const SAMPLE_NOTE_TEXT =
  'text-sm leading-relaxed text-pretty text-slate-700 dark:text-slate-300';

/** The card that stands in for a locked exemplar: a dashed frame with the lock, what
 *  the exemplar is, and the upgrade. It has no amber fill, because the lock is a state
 *  of the exemplar and not a band. Painted on the row's band wash. */
export const SAMPLE_LOCKED =
  'flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-500 bg-white px-5 py-6 text-center dark:border-white/25 dark:bg-[rgb(var(--color-bg-surface-inset))]';

/** The upgrade button on the locked card: its shape and its size, with the amber fill
 *  and its ink added at the call site (`LOCK_CTA`). It is 44px on a phone. Painted
 *  on the locked card. */
export const SAMPLE_LOCKED_CTA =
  't-label min-h-11 sm:min-h-0 inline-flex items-center px-4 py-2 rounded-xl text-slate-900 dark:text-slate-900 can-hover:hover:scale-105 active:scale-[0.98] transition-transform duration-200 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900/60 dark:focus-visible:ring-slate-900/60';

/** The empty state of the panel, when a question has no exemplars yet: a dashed well
 *  with what is missing. Painted on the panel body. */
export const SAMPLE_EMPTY =
  'flex flex-col items-center gap-1 rounded-xl border-2 border-dashed border-slate-300 px-4 py-8 text-center dark:border-white/10';
