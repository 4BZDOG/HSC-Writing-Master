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

// Re-exported under this file's names rather than read into new constants: a
// constant built from an imported value is read at module init, which
// `npm run check:eager-reads` forbids (a chunk cycle can make that read undefined).
// The composed classes therefore live in ladderChrome.ts, and this file renames them.
export {
  LADDER_TOOL as SAMPLE_AI_BUTTON,
  LADDER_ROW_PREVIEW as SAMPLE_ROW_PREVIEW,
  LADDER_LINK_TRAILING as SAMPLE_CRITERION_LINK,
} from './ladderChrome';

/** The body's tools row: reading size on the left-hand side of it, the AI actions
 *  beside it, all pushed to the right. It is the Marking Guide's curator row in the
 *  same slim form, so the two bodies open with the same line. It wraps, so on a
 *  narrow panel the AI actions drop under the reading size rather than off the
 *  edge. Painted on the panel body, which is the page's tone. */
export const SAMPLE_TOOLS = 'flex flex-wrap items-center justify-end gap-1 sm:gap-2';

/** The reading-size group: the two zoom buttons with the size between them, in one
 *  small well from `sm`. On a phone it is the two buttons alone, with no well and no
 *  figure, so the toolbar stays one slim line of icons. Painted on the panel body, so it
 *  is a white well in the light theme and a black-tinted one in the dark. */
export const SAMPLE_ZOOM =
  'flex items-center gap-0 sm:gap-0.5 sm:rounded-lg sm:border sm:border-slate-300 sm:bg-white sm:p-0.5 sm:shadow-sm dark:sm:border-white/10 dark:sm:bg-black/20';

/** One zoom button. It is 44px on a phone, which is the touch target, and returns to
 *  its own size from `sm`. Painted on the zoom well. */
export const SAMPLE_ZOOM_BUTTON =
  'flex items-center justify-center min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 p-1.5 rounded-lg text-slate-600 dark:text-slate-300 can-hover:hover:bg-slate-900/5 dark:can-hover:hover:bg-white/10 transition-colors duration-200 touch-manipulation disabled:cursor-not-allowed disabled:text-slate-400 dark:disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900/40 dark:focus-visible:ring-white/60';

/** The current reading size between the zoom buttons. It is a figure, so it is mono
 *  and tabular and does not move its neighbours as it changes. Painted on the zoom well. */
export const SAMPLE_ZOOM_VALUE =
  'w-7 text-center font-mono text-xs font-bold tabular-nums text-slate-700 dark:text-slate-300 select-none max-sm:sr-only';

/** The disclosure of an OPEN row, which replaces the shut disclosure's padding. Desktop
 *  (from `sm`) it is a compact line of 28px or so, holding only the row's flag and its
 *  exemplar count with the chevron, so the paper starts close to the row's top. A phone
 *  gives it a 44px touch target and a 12px inset, and there it is the row's header: the
 *  summary line ("5/5 · Band 3 · 126 words") is its text. It is the whole line, so a press
 *  anywhere on it toggles the row. Painted on the row's band fill. */
export const SAMPLE_DISCLOSURE_OPEN =
  'flex flex-1 min-w-0 flex-col justify-center min-h-11 sm:min-h-0 px-3 sm:px-4 py-1 sm:py-1.5 text-left select-none touch-manipulation transition-colors duration-200 can-hover:hover:bg-slate-900/[0.04] dark:can-hover:hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900/40 dark:focus-visible:ring-white/60';

/** The summary line on a phone, in an open row's header: the mark, the band and the
 *  length. The desktop header shows the flag and the count instead, so this is hidden
 *  from `sm`. Painted on the row's band fill. */
export const SAMPLE_ROW_SUMMARY =
  'sm:hidden t-label tabular-nums text-slate-800 dark:text-slate-200';

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

/** The previous and next controls for a level with several exemplars, with the "N/M"
 *  between them. These sit beside the disclosure, as siblings of it, so they are
 *  never inside a button. They are on the open row's header line at every width, so a
 *  phone keeps them beside the row's summary, and each is a 44px target there. The
 *  picker on the same row also offers every exemplar as a chip. Painted on the row's
 *  band wash, so the group is a white
 *  well of its own, the same as the zoom well. */
export const SAMPLE_CAROUSEL =
  'flex shrink-0 items-center gap-0.5 self-center mr-2 sm:mr-3 rounded-lg border border-slate-300 bg-white p-0.5 shadow-sm dark:border-white/10 dark:bg-black/20';

/** One carousel arrow. It is 44px on a phone. Painted on the carousel's white well. */
export const SAMPLE_CAROUSEL_BUTTON =
  'flex items-center justify-center min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 p-1.5 rounded-lg text-slate-600 dark:text-slate-300 can-hover:hover:bg-slate-900/5 dark:can-hover:hover:bg-white/10 transition-colors duration-200 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900/40 dark:focus-visible:ring-white/60';

/** The "N/M" between the carousel arrows. Painted on the carousel's white well. */
export const SAMPLE_CAROUSEL_COUNT =
  'px-1 text-center font-mono text-xs font-bold tabular-nums text-slate-700 dark:text-slate-300';

/** The answer zone's selector row: the exemplar tablist and the "+N more" fold beside
 *  it, wrapping together. The fold is outside the tablist because a tablist owns only
 *  its tabs. Painted on the row's band wash. */
export const SAMPLE_PICKER_ROW = 'flex flex-wrap items-center gap-1.5';

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

/** The row's light-theme boost, a hook for `index.css` and nothing else: in the light
 *  theme it swaps the row's wash for a steeper band gradient, a firmer edge, a darker
 *  gutter seam and a deeper shadow, so a row stands off a white panel. It draws nothing
 *  in the dark theme, and it is on the Sample Answers rows only, so the Marking Guide's
 *  rows keep the shared wash. Painted on the panel body, over the row's own band fill. */
export const SAMPLE_ROW = 'sample-row';

/** The answer zone's paper: the sheet the exemplar is read on, the visual centre of the
 *  open row. In the light theme it is white running to a cool grey at its foot, with a
 *  slate edge and a lifted shadow (`sample-paper` in `index.css` adds the gradient and
 *  the firmer edge); in the dark theme it is the inset near-black with a brighter
 *  border. Its head is the band's solid bar, so it reads as the model answer's own
 *  sheet and the commentary below it, which has no sheet, as a note on it. Painted on
 *  the row's band wash; its top bar, its text and its foot sit inside it. */
export const SAMPLE_PAGE =
  'sample-paper overflow-hidden rounded-none border-0 bg-white shadow-none dark:bg-[rgb(var(--color-bg-surface-inset))] sm:rounded-xl sm:border sm:border-slate-500 sm:shadow-lg dark:sm:border-white/20 dark:sm:shadow-none';

/** The paper's head: "Model answer · 5/5" with the answer's length, its source and the
 *  jump to its criterion, on the band's solid fill (`LADDER_SOLID`, added at the call
 *  site), the same bold heading the criterion zone used to carry. The ink is the
 *  solid's own near-black, which holds AA on all six hues in both themes, so no colour
 *  is set here beyond the hairline beneath it. `sample-page-bar` in `index.css` shades
 *  its darkest corner less than the shared solid does, and makes the head a size
 *  container for the jump's label. Painted on the band's solid fill. */
export const SAMPLE_PAGE_BAR =
  'sample-page-bar flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-900/25 px-4 py-2.5 sm:px-6 dark:border-black/40';

/** A figure on the paper's head (the word count): a caption-sized tabular figure. It
 *  sets no colour, so it takes the solid's near-black ink. Painted on the band's solid
 *  fill. */
export const SAMPLE_PAGE_BAR_FIGURE = 't-label tabular-nums whitespace-nowrap';

/** A chip on the paper's head (the source, the lock): a white pill with slate ink and a
 *  slate edge, so it keeps its own contrast whichever of the six hues is beneath it. The
 *  head is the same solid in both themes, so the dark partners restate the light ones.
 *  Painted on the band's solid fill. */
export const SAMPLE_PAGE_BAR_CHIP =
  'border-slate-900/40 bg-white/75 text-slate-900 dark:border-slate-900/40 dark:bg-white/75 dark:text-slate-900';

/** The full visible label of the criterion jump, shown above 480px of head. The button's
 *  `aria-label` names it in full for every width, so a screen reader is not given the
 *  short label. Painted on the white pill. */
export const SAMPLE_CRITERION_LABEL_FULL = 'sample-criterion-full';

/** The short visible label, shown when the head is 480px or narrower (`index.css`
 *  swaps the two in a container query, which a viewport breakpoint cannot do for a
 *  column that sits in a rail). It is the word the label names, so it stays in the
 *  full accessible name. Painted on the white pill. */
export const SAMPLE_CRITERION_LABEL_SHORT = 'sample-criterion-short';

/** The paper's foot: the keyword figure and the actions, on a strip attached to the
 *  paper's bottom edge, so the toolbar belongs to the answer and not to the commentary
 *  beneath it. A 2px rule above it in the light theme (and a band-tinted wash from
 *  `sample-paper-foot` in `index.css`) so the actions read as a separate strip from
 *  the text. Painted on the paper. */
export const SAMPLE_PAGE_FOOT =
  'sample-paper-foot border-t-2 border-slate-300 bg-slate-50 px-3 py-2.5 sm:px-6 dark:border-white/10 dark:bg-white/[0.03]';

/** The exemplar's text on the page: the reading face, at the reading size. The size
 *  is set inline from the zoom control, so it is not in this class. Painted on the
 *  page. */
export const SAMPLE_PAGE_TEXT =
  'px-3 py-4 sm:px-6 font-serif leading-[1.6] whitespace-pre-wrap break-words text-slate-800 dark:text-slate-200';

/** The toolbar beneath the page: the word and keyword figures on the left and the
 *  actions on the right, wrapping as two lines on a phone. Painted on the row's band
 *  wash, beneath the page. */
export const SAMPLE_ACTIONS = 'flex flex-wrap items-center justify-between gap-x-3 gap-y-2';

/** The group of actions on the toolbar, right-aligned on the line they land on. It
 *  wraps within itself, so every action is reachable at 390px. Painted on the
 *  row's band wash. */
export const SAMPLE_ACTION_GROUP =
  'flex flex-wrap items-center justify-end gap-1 sm:w-auto sm:gap-1.5 sm:ml-auto';

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

/** The phone form of an action that is also a word on a wider screen ("Use", "Copy",
 *  "Submit"): a 44px square with the icon centred, and the word hidden. The word stays in
 *  the button's accessible name through `aria-label`. From `sm` the button is its
 *  labelled self. Painted on the row's band wash, as the labelled action is. */
export const SAMPLE_ACTION_PHONE_ICON = 'max-sm:w-11 max-sm:justify-center max-sm:px-0';

/** The divider between the student's actions and a curator's, a hairline. Painted on
 *  the row's band wash. */
export const SAMPLE_ACTION_DIVIDER = 'mx-1 h-4 w-px bg-slate-400 dark:bg-white/20 max-sm:hidden';

/** The toggle that folds the Coach's Tip and the Feedback away. It is a caption-sized
 *  text control, 44px tall on a phone. Painted on the row's band wash. */
export const SAMPLE_NOTE_TOGGLE =
  't-label inline-flex items-center gap-1.5 whitespace-nowrap min-h-11 sm:min-h-0 text-slate-700 dark:text-slate-300 can-hover:hover:text-slate-900 dark:can-hover:hover:text-white transition-colors duration-200 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900/40 dark:focus-visible:ring-white/60';

/** The prose of the marker's commentary and of the Coach's Tip: the sentence the note
 *  says, in italics, which is the voice of a marker's margin note and sets it apart from
 *  the exemplar's upright prose. It stays in the sans face on purpose: Inter carries a
 *  real italic at every weight, so a highlighted term (semibold) and the command verb
 *  (black) keep their weight inside it, where the serif has only a regular italic and
 *  would lose it. Painted on the row's band wash, beside the note's rule. */
export const SAMPLE_NOTE_TEXT =
  'text-sm italic leading-relaxed text-pretty text-slate-700 dark:text-slate-300';

/** The card that stands in for a locked exemplar: a dashed frame with the lock, what
 *  the exemplar is, and the upgrade. It has no amber fill, because the lock is a state
 *  of the exemplar and not a band. Painted on the row's band wash. */
export const SAMPLE_LOCKED =
  // A well cut into the card, not a white slab: on the ladder, a locked exemplar
  // sits in the same inset tone as the rest of the panel's wells.
  'flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-500 bg-surface-inset px-5 py-6 text-center dark:border-white/25 dark:bg-[rgb(var(--color-bg-surface-inset))]';

/** The upgrade button on the locked card: its shape and its size, with the amber fill
 *  and its ink added at the call site (`LOCK_CTA`). It is 44px on a phone. Painted
 *  on the locked card. */
export const SAMPLE_LOCKED_CTA =
  't-label min-h-11 sm:min-h-0 inline-flex items-center px-4 py-2 rounded-xl text-slate-900 dark:text-slate-900 active:scale-[0.98] transition-transform duration-200 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900/60 dark:focus-visible:ring-slate-900/60';

/** The empty state of the panel, when a question has no exemplars yet: a dashed well
 *  with what is missing. Painted on the panel body. */
export const SAMPLE_EMPTY =
  'flex flex-col items-center gap-1 rounded-xl border-2 border-dashed border-slate-300 px-4 py-8 text-center dark:border-white/10';

/** The two zones of an open row, one above the other: the answer and the commentary
 *  (the marking criterion lives in the Marking Guide, one jump away from the paper's
 *  head). Sixteen pixels between them, so the reading order runs across a gap the eye
 *  can see and not a rule it has to find. Painted on the row's band wash. */
export const SAMPLE_ZONES = 'flex flex-col gap-4';

/** The answer zone: the exemplar selector above the paper, and the paper. A column, so
 *  the selector is always the paper's own label line and never beside it. Painted on
 *  the row's band wash. */
export const SAMPLE_ANSWER = 'flex flex-col gap-2';

/** A zone's label, in the boundary voice (`.t-section`): it marks where a zone starts,
 *  which is what DesignSpec §4 keeps the caps for. It sets no colour, so it takes the
 *  ink of the head or the bar it sits on. Painted on the paper's solid head, or on the
 *  commentary's head, whichever holds it. */
export const ZONE_LABEL = 't-section leading-none';

/** The figure after a zone's label ("4/6"): mono and tabular, so it lines up with the
 *  gutter's figure. It sets no colour. Painted on the band's solid fill, in its ink. */
export const ZONE_FIGURE = 'font-mono text-xs font-bold tabular-nums';

/** The commentary zone: a desk set off from the paper by a solid band bar down its
 *  left edge (the band's strong edge, added at the call site), and by the spacing above
 *  it. It is the margin the paper is annotated in, so it reads as commentary about the
 *  answer and not as part of it. In the dark theme it has no fill; in the light theme
 *  `sample-commentary` in `index.css` gives it a band-tinted wash and a hairline above
 *  and below, so it holds its own against a white panel. Painted on the row's band
 *  wash. */
export const SAMPLE_COMMENTARY =
  'sample-commentary flex flex-col gap-3 rounded-none border-l-4 py-2 pl-3 pr-3 sm:rounded-r-xl sm:pl-4';

/** The commentary's head: its one label on the left and the fold on the right, wrapping
 *  on a phone so the fold keeps its 44px target. It is the only label the commentary
 *  carries, since the feedback beneath it is the commentary itself; the Coach's Tip
 *  keeps its own, as a different thing. `sample-commentary-head` in `index.css` draws a
 *  hairline under it in the light theme. Painted on the row's band wash, so its ink is
 *  the slate pair beside the notes. */
export const SAMPLE_COMMENTARY_HEAD =
  'sample-commentary-head flex flex-wrap max-sm:flex-nowrap items-center justify-between gap-x-2 sm:gap-x-3 gap-y-1 text-slate-800 dark:text-slate-100';
