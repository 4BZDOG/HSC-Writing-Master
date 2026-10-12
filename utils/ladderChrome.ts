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
 * `--band-rgb` (from `getBandRgb`), and takes its solid gutter and ink from
 * `getBandConfig(band)` at the call site. The fill, edge, wash and glow classes
 * in `index.css` draw the band at their own alphas in both themes, which is why
 * they carry no colour of their own.
 *
 * The three reference panels (Syllabus Terms, Marking Guide, Sample Answers) are
 * SECONDARY heroes: their headers and rows are louder than a calm accordion, and
 * the verb ribbon above them stays the loudest surface. DesignSpec §3 records
 * how, and the `HERO_*` constants at the end of this file are that treatment.
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
 *  band's fill is added at the call site as `LADDER_FILL`, and the band itself is
 *  handed down as `--band-rgb`, so the whole row reads as one band in both themes.
 *  Painted on the panel body.
 *
 *  `rounded-xl` is the control radius, and it is the same on both panels so the
 *  two sets of rows agree. `items-stretch` makes the gutter as tall as the body.
 *  Its transition names only the edge and the shadow it can change, never
 *  `transition-all`, as DesignSpec §3 asks of anything that animates. The resting
 *  shadow is part of `LADDER_FILL`, not here, so the fill and its depth are one
 *  class. */
export const LADDER_ROW =
  'flex items-stretch rounded-xl border overflow-hidden transition-[border-color,box-shadow] duration-300 ease-out';

/** A row's body fill: the band as a gradient, strongest at the gutter and fading
 *  into the panel to the right, with a faint top highlight and the resting shadow.
 *  It is a class in `index.css` (`.band-fill`) and not a Tailwind utility, because
 *  a gradient over `--band-rgb` needs a different alpha in each theme, which a
 *  utility cannot carry. Painted on the panel body, under the row's content. */
export const LADDER_FILL = 'band-fill';

/** A row's edge when it is at rest: the band at a whisper, 35% of its hue. Painted
 *  on the row's own border. */
export const LADDER_EDGE_SHUT = 'band-edge';

/** A row's edge when it is open or selected: the band at a statement, 85% of its
 *  hue. Painted on the row's own border. */
export const LADDER_EDGE_OPEN = 'band-edge-strong';

/** The mark gutter: a fixed-width column on the left of every row, so the mark
 *  numbers of both panels fall on the same vertical line. `w-[4.5rem]` is 72px on
 *  a phone and `sm:w-20` is 80px from `sm`. The step over the old 64/72px is for
 *  the figure "5/6", which carries a total as well as a mark, and a range "3–4/6"
 *  needs its room. It is one width in every panel, which is what keeps the two
 *  panels' figures on one vertical line.
 *
 *  The gutter is SOLID: the band's `solidBg`, added at the call site, with the
 *  divider on its right edge as the band edge. Painted on the band's solid fill,
 *  so every ink on it is `getBandConfig(band).solidText`. */
export const LADDER_GUTTER =
  'w-[4.5rem] sm:w-20 shrink-0 flex flex-col items-center justify-center gap-1 px-1 py-2 border-r';

/** The big figure in the gutter: the mark, or a range of marks, over the question's
 *  total ("5/6"). It is mono and tabular so the figures of a column line up digit
 *  for digit, and it is the loudest thing in the row. Its colour is the band's
 *  `solidText`, added at the call site, and it inherits that into its total.
 *  Painted on the gutter's solid fill. */
export const LADDER_GUTTER_MARK =
  'font-mono tabular-nums text-xl font-bold leading-none text-center whitespace-nowrap';

/** The figure at a middle length ("7–8/10", six characters). One step down from the
 *  usual size, so the figure and its total fit the gutter's usable width, which is 64px
 *  on a phone (72px less the 4px inset either side): at 16px the mark is 29px and the
 *  total 25px. Painted on the gutter's solid fill. */
export const LADDER_GUTTER_MARK_MEDIUM =
  'font-mono tabular-nums text-base font-bold leading-none text-center whitespace-nowrap';

/** The figure at its longest, a two-digit range over a two-digit total ("10–12/12"),
 *  which is eight characters and is the widest the column is ever asked to hold. At
 *  14px and with the total at `LADDER_GUTTER_TOTAL_LONG`, it is 63.6px across the 64px
 *  the gutter leaves inside its inset, measured from the mono face's 0.6em advance.
 *  Painted on the gutter's solid fill. */
export const LADDER_GUTTER_MARK_LONG =
  'font-mono tabular-nums text-sm font-bold leading-none text-center whitespace-nowrap';

/** The "/6" after the mark: the question's total, smaller than the mark it follows
 *  so the eye reads the mark first. It inherits the figure's colour. Painted on the
 *  gutter's solid fill. */
export const LADDER_GUTTER_TOTAL = 'text-sm font-medium';

/** The total beside a `LADDER_GUTTER_MARK_LONG` figure, one step smaller again, so the
 *  two-digit range and its two-digit total both fit the gutter. Painted on the
 *  gutter's solid fill. */
export const LADDER_GUTTER_TOTAL_LONG = 'text-xs font-medium';

/** The caption beneath the figure, "Band N": the `.t-label` size, weight and case,
 *  in the band's `solidText` at the call site. Painted on the gutter's solid fill. */
export const LADDER_GUTTER_CAPTION = 't-label text-center whitespace-nowrap';

/** The body beside the gutter: the row's content. It takes `min-w-0` so a long
 *  unbroken word wraps rather than pushing the gutter out of the row. The inset is
 *  16px, the same as the disclosure and the pane below it, so the two halves of an
 *  open row start on one left edge. Painted on the row's band fill. The type inside
 *  it is the caller's to set, because the Marking Guide's criterion is serif reading
 *  text and the Sample Answers body is an interactive exemplar. */
export const LADDER_BODY = 'flex-1 min-w-0 p-4';

/** The footer under a body's content, where a row puts a control such as "Model
 *  answer". It wraps, so a row on a narrow phone keeps its control whole. Painted
 *  on the row's band fill. */
export const LADDER_FOOTER = 'mt-3 flex flex-wrap items-center gap-2';

/** The "Model answer" control: a pill that sits on the band fill as a light (or,
 *  in the dark theme, a smoked) chip, so it reads as an action on the row and not
 *  as part of the fill. The white is the chip's ground in the light theme and the
 *  black its ground in the dark, which is what keeps it legible on a band that is
 *  strong at its left edge.
 *
 *  `min-h-11` (44px) on a phone is the touch target. From `sm` the pill goes back
 *  to its own height. Hover is `can-hover:`, as everywhere in the app: a tap on a
 *  phone leaves `:hover` on the element. Press feedback is `active:` on `transform`.
 *  Painted on the row's band fill, so its ground is the white or black beneath it
 *  and its ink is the slate pair on that ground. */
export const LADDER_MODEL_ANSWER =
  't-label inline-flex items-center gap-1.5 min-h-11 sm:min-h-0 px-3 py-1.5 rounded-full border border-slate-500 bg-white/80 text-slate-800 shadow-sm dark:border-white/30 dark:bg-black/30 dark:text-slate-100 can-hover:hover:bg-white dark:can-hover:hover:bg-black/50 transition-colors duration-200 touch-manipulation active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/40 dark:focus-visible:ring-white/60';

/** The body's whole-area disclosure, for a row whose body is one control while it
 *  is shut. It takes the same 16px inset as `LADDER_BODY`, and it sits INSIDE that
 *  inset, so the control is the whole body and not a button floating in it. Its
 *  hover is a shade over the band fill, which reads on both themes without a band
 *  colour of its own. Painted on the row's band fill.
 *
 *  `can-hover:` for the same reason as everywhere: a tap leaves `:hover` stuck on
 *  a phone. The focus ring is inset because the row clips with `overflow-hidden`. */
export const LADDER_DISCLOSURE =
  'block min-w-0 p-4 text-left touch-manipulation select-none transition-colors duration-200 ' +
  'can-hover:hover:bg-slate-900/[0.04] dark:can-hover:hover:bg-white/[0.05] ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900/40 dark:focus-visible:ring-white/60';

/** The open part of a row, under its disclosure: the note, the picker and the
 *  exemplar. It takes the same 16px inset as the disclosure above it, so the
 *  content of the two halves of an open row starts on one left edge. Painted on
 *  the row's band fill. */
export const LADDER_PANE = 'px-2.5 sm:px-4 pb-4 flex flex-col gap-3';

/** A quiet note inside a row: a rule down its left edge and a glyph, with no fill.
 *  This is the family `components/DraftCheck.tsx` uses for its notes. The rule is
 *  NEUTRAL, not a tone, because colour as a fill or a rule belongs to the band
 *  system and a note under a band fill must not claim a band. Painted on the row's
 *  band fill, so the rule is a slate pair that reads on both grounds. */
export const LADDER_NOTE =
  'flex items-start gap-2.5 border-l-2 border-slate-500 pl-3 py-0.5 dark:border-white/30';

/** The glyph at the head of a `LADDER_NOTE`. Painted on the row's band fill, so
 *  its ink is the same slate pair as the note's label. */
export const LADDER_NOTE_GLYPH = 'w-4 h-4 mt-0.5 shrink-0 text-slate-600 dark:text-slate-300';

/** The label that names a note: "What earns this mark", "Coach's Tip". It is a
 *  caption, so it takes `.t-label` and sets only its colour. Painted on the row's
 *  band fill. */
export const LADDER_NOTE_LABEL = 't-label text-slate-600 dark:text-slate-300';

/** The guide's criterion, as the reading text of a row. The Marking Guide draws its
 *  criteria with this, and the "What earns this mark" note draws the same criterion
 *  with it, so the two are one text face, one size and one ink. `.t-body` is the
 *  size prose is read at. Painted on the row's band fill, which is strongest at the
 *  gutter, so the ink is checked there (see DesignSpec §2 and the e2e contrast
 *  sweep). */
export const LADDER_CRITERION = 't-body font-serif text-slate-600 dark:text-slate-300';

/** The unparsed-guide fallback: a guide that did not split into rows, shown as one
 *  block of reading text. It is a single row's shape with no gutter, so it takes the
 *  row's radius, border and fill and reads as the ladder's own, not as a stray box.
 *  The caller adds `LADDER_EDGE_SHUT` and `LADDER_FILL` and hands over `--band-rgb`.
 *  Painted on the panel body, with its fill from the band. */
export const LADDER_FALLBACK =
  'rounded-xl border p-4 shadow-sm t-body font-serif text-slate-600 dark:text-slate-300';

/** The empty guide: no criteria yet, and a line that says what closes the gap. It is
 *  a dashed well in the band's edge, not a grey box, so an empty panel still reads
 *  as part of the ladder. The caller adds `LADDER_EDGE_SHUT` for the dashed edge.
 *  Painted on the panel body. */
export const LADDER_EMPTY = 'py-8 px-4 text-center rounded-xl border-2 border-dashed';

/** A panel tool in the Marking Guide's curator row ("AI Draft"): the shape the
 *  Sample Answers panel's "Generate" uses, so the two AI controls read the same way
 *  on either panel. It is 44px on a phone, which is the touch target, and returns to
 *  its own height from `sm`. Painted on the panel body, which is the page's tone, so
 *  it is a white button in the light theme and a dark one in the dark. */
export const LADDER_TOOL =
  't-label inline-flex items-center gap-2 min-h-11 sm:min-h-0 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-200 can-hover:hover:shadow-lg can-hover:hover:border-slate-400 dark:can-hover:hover:border-white/25 transition-[box-shadow,border-color] duration-200 touch-manipulation active:scale-[0.98] disabled:cursor-not-allowed disabled:text-slate-400 dark:disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900/40 dark:focus-visible:ring-white/60';

/** An icon-only panel tool: "Edit", "Save", "Cancel", the notice's dismiss. It is
 *  44px on a phone, where a 24px icon is too small to hit, and returns to its own
 *  size from `sm`. The ink is the caller's, so a destructive or a confirming icon can
 *  take its own colour. Painted on the panel body. */
export const LADDER_TOOL_ICON =
  'flex items-center justify-center min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 p-1.5 rounded-lg transition-colors duration-200 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900/40 dark:focus-visible:ring-white/60 can-hover:hover:bg-slate-900/5 dark:can-hover:hover:bg-white/10';

/** A hero panel's header: the band at 16% fading to nothing from left to right,
 *  over the header row. It reads `--band-rgb` (set on the panel root) and the
 *  fading stop keeps the band's hue at zero alpha rather than `transparent`, which
 *  Safari takes through grey. Painted on the header row, under its title. */
export const HERO_HEAD_WASH = 'band-header-wash';

/** A hero panel's icon tile: 40px, a rounded tile, the band's solid fill (added at
 *  the call site) and the soft band glow. A tile is the one place the hero is
 *  solid, so it is the first thing the eye lands on in the header. Painted on the
 *  header's band wash. */
export const HERO_TILE =
  'w-10 h-10 rounded-tile flex items-center justify-center shrink-0 border border-white/20 band-glow';

/** A hero panel while it is OPEN: a lit edge (the band at 50%) and a soft tier glow
 *  beneath the panel. It is on the panel root, and `PANEL_SURFACE` stays the root's
 *  class, so this only adds to it. Painted on the panel's own border and shadow. */
export const HERO_LIT = 'band-lit';

/** The solid band fill, in the verb ribbon's own tier hue. `band-solid` in `index.css`
 *  draws `--band-rgb` (the `-500` step the ribbon's columns and stage use, from
 *  `getBandRgb`) with near-black ink, which holds AA on all six hues: white on the
 *  same fills is 3.7:1 on red, blue and purple and 1.9:1 on yellow. It replaces
 *  `getBandConfig().solidBg`, which is a darker step per band (green-700, orange-700)
 *  and so read as a different palette beside the ribbon. Painted on the gutter and on
 *  a hero panel's icon tile; the owner sets `--band-rgb`. */
export const LADDER_SOLID = 'band-solid';

/*
 * The Syllabus Terms panel's additions to the vocabulary above. They sit in their
 * own block so the terms panel's rules can be read in one place, and so nothing
 * above them had to move.
 */

/** A QUIET row: the band at its wash (`.band-wash`, 10%), where `LADDER_FILL` is
 *  the band at a real strength. The Syllabus Terms panel draws its supporting
 *  terms as one of these, under the key terms' solid rows, so the two groups are
 *  one ladder at two strengths and not two different devices. Painted on the panel
 *  body. */
export const LADDER_FILL_QUIET = 'band-wash';

/** The toolbar's text input ("Add new term…"): the shape `LADDER_TOOL` gives a
 *  button, so the input and the buttons beside it sit on one line of one height.
 *  It is 16px on a phone, where a smaller field makes iOS Safari zoom on focus, and
 *  returns to the label size from `sm`. It is 44px on a phone, the touch target.
 *  Painted on the panel body. */
export const LADDER_TOOL_INPUT =
  'w-full min-w-0 min-h-11 sm:min-h-0 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-base sm:text-xs text-slate-900 shadow-sm placeholder:text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-slate-400 outline-none transition-[border-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900/40 dark:focus-visible:ring-white/60';

/** The plan's lock on a panel tool: the amber of a control the plan withholds, in the
 *  same shape as `LADDER_TOOL`, so a locked tool reads as part of the same family.
 *  Painted on the panel body. */
export const LADDER_TOOL_LOCKED =
  't-label inline-flex items-center gap-2 min-h-11 sm:min-h-0 px-3 py-1.5 rounded-lg border border-amber-500/50 bg-amber-50 text-amber-800 shadow-sm dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-300 touch-manipulation active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-600/50 dark:focus-visible:ring-amber-300/60';

/** The icon-only version of `LADDER_TOOL_LOCKED`, combined with `LADDER_TOOL_ICON`
 *  for a locked icon tool ("AI Suggest" and "Regenerate" without the plan). */
export const LADDER_TOOL_LOCKED_ICON =
  'rounded-lg border border-amber-500/50 bg-amber-50 text-amber-800 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-300';
