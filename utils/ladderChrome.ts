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
 *  class.
 *
 *  The edge is `ladder-ring` in `index.css`, an overlay inside the row, and not a
 *  border: a border ran round the outside of the solid gutter as well, and put a pale
 *  ring round it at the corners. The edge classes still set `border-color`, which the
 *  overlay takes. */
export const LADDER_ROW =
  'ladder-ring flex items-stretch rounded-xl overflow-hidden transition-[border-color,box-shadow] duration-300 ease-out';

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
 *  so every ink on it is `getBandConfig(band).solidText`. It is `relative z-[1]` so
 *  it covers the row's edge (`ladder-ring`), which runs only round the body. */
export const LADDER_GUTTER =
  'w-[4.5rem] sm:w-20 shrink-0 flex flex-col items-center justify-center gap-1 px-1 py-2 border-r relative z-[1]';

/** The big figure in the gutter: the mark, or a range of marks, with the question's
 *  total on its own line beneath ("5" over "/6"). Stacked, the mark has the gutter's
 *  whole width: on one line "11–12/12" had to drop to 12px to fit a phone's gutter,
 *  and still ran edge to edge. It is mono and tabular so the figures of a column line
 *  up digit for digit, and it is the loudest thing in the row. Its colour is the
 *  band's `solidText`, added at the call site, and it inherits that into its total.
 *  Painted on the gutter's solid fill. */
export const LADDER_GUTTER_MARK =
  'inline-flex flex-col items-center gap-0.5 font-mono tabular-nums text-xl font-bold leading-none text-center whitespace-nowrap';

/** The figure at its longest, a two-digit range ("10–12", five characters). One step
 *  down, so it fits the 64px the full gutter leaves inside its inset: at 18px it is
 *  54px, from the mono face's 0.6em advance. Painted on the gutter's solid fill. */
export const LADDER_GUTTER_MARK_MEDIUM =
  'inline-flex flex-col items-center gap-0.5 font-mono tabular-nums text-lg font-bold leading-none text-center whitespace-nowrap';

/** The "/6" under the mark: the question's total, smaller than the mark above it so
 *  the eye reads the mark first. It inherits the figure's colour. Painted on the
 *  gutter's solid fill. */
export const LADDER_GUTTER_TOTAL = 'text-sm font-medium';

/** The caption beneath the figure, "Band N": the `.t-label` size, weight and case,
 *  in the band's `solidText` at the call site. Painted on the gutter's solid fill. */
export const LADDER_GUTTER_CAPTION = 't-label text-center whitespace-nowrap';

/** A NARROW gutter, for a phone only: 56px, so a row's body (the exemplar's preview)
 *  gets the width the 72px gutter took. From `sm` it is `LADDER_GUTTER`'s width. The
 *  figure and caption are set smaller by the caller (`LadderRowGutter`'s `phoneGutter`).
 *  It is opt-in: only the Sample Answers panel asks for it, so the guide and the report
 *  keep the full gutter. Painted on the band's solid fill. */
export const LADDER_GUTTER_NARROW = `${LADDER_GUTTER} max-sm:w-14 max-sm:px-0.5`;

/** A STRIP gutter, for a phone only: 4px, the band's colour down the left edge of an open
 *  row that is full-bleed on a phone. Its figure and caption are read by a screen reader
 *  and not drawn. From `sm` it is `LADDER_GUTTER`'s width. Painted on the band's solid
 *  fill. */
export const LADDER_GUTTER_STRIP = `${LADDER_GUTTER} max-sm:w-1 max-sm:px-0`;

/** The inset of a row's text from its gutter, on a phone only. The row is full width
 *  on a phone, so the 16px a desktop row keeps is 8px there. At 6px the text sat tight
 *  against the gutter's divider at 390px. 8px clears the divider and costs only 4px of
 *  width on each side. The top and bottom keep `p-4`. From `sm` it is `p-4`. Shared by
 *  the guide's rows and the exemplar's shut disclosure, so the two read the same width. */
export const LADDER_ROW_PHONE_INSET = 'max-sm:px-2';

/** The body beside the gutter: the row's content. It takes `min-w-0` so a long
 *  unbroken word wraps rather than pushing the gutter out of the row. The inset is
 *  16px, the same as the disclosure and the pane below it, so the two halves of an
 *  open row start on one left edge. Painted on the row's band fill. The type inside
 *  it is the caller's to set, because the Marking Guide's criterion is serif reading
 *  text and the Sample Answers body is an interactive exemplar. */
export const LADDER_BODY = `flex-1 min-w-0 p-4 ${LADDER_ROW_PHONE_INSET}`;

/** The footer under a body's content, where a row puts a control such as "Model
 *  answer". It wraps, so a row on a narrow phone keeps its control whole. Painted
 *  on the row's band fill. */
export const LADDER_FOOTER = 'mt-3 flex flex-wrap items-center gap-2';

/** The jump between a guide row and its exemplar, in both directions: the guide's
 *  "Model answer" and the exemplar's "View marking criterion". The two are one link, so
 *  they share this token and differ only in their icon and wording.
 *
 *  From `sm` it is a white pill with slate ink, the same in both themes, so it reads on
 *  the band's wash and on the solid head alike. On a phone it is a small underlined text
 *  link, 44px tall as the touch target. Its ink is slate-900, which is right on the solid
 *  head in both themes; a caller on a band's wash in the dark theme adds its own light
 *  ink for the phone (see `MarkingCriteriaAccordion`). `ml-auto` and the like are the
 *  caller's. Hover is `can-hover:`, as everywhere: a tap leaves `:hover` stuck on a phone.
 *  Painted on the band's fill, or on its solid head. */
export const LADDER_LINK =
  't-label inline-flex items-center gap-1.5 min-h-11 sm:min-h-0 text-slate-900 dark:text-slate-900 underline underline-offset-2 sm:no-underline sm:rounded-full sm:border sm:border-slate-900/45 sm:bg-white/80 dark:sm:border-slate-900/45 dark:sm:bg-white/80 sm:px-3 sm:py-1.5 sm:shadow-sm sm:can-hover:hover:bg-white transition-colors duration-200 touch-manipulation active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900/70 dark:focus-visible:ring-white/70';

/** The link token pushed to the right edge of a bar: the exemplar paper's "View marking
 *  criterion" (re-exported as `SAMPLE_CRITERION_LINK`). Painted on the band's solid fill. */
export const LADDER_LINK_TRAILING = `${LADDER_LINK} ml-auto`;

/** A guide row while it is LINKED to the exemplar the student has open in the Sample
 *  Answers panel: the row's outline in the band's full hue, a halo round it and a lift
 *  of shadow, with a single settling pulse the moment it is linked, and again each time
 *  the exemplar's "View marking criterion" brings it into view (`ladder-linked` in
 *  `index.css`, which is where the band alpha lives; the pulse is neutralised by the
 *  reduced-motion rule there). It is added to the row alongside its own fill and edge,
 *  and it is gone the moment the exemplar closes. Painted on the row's own border and
 *  shadow. */
export const LADDER_LINKED = 'ladder-linked';

/** The badge that says why a linked row is lit: "Matches the model answer you are
 *  reading". A white pill with slate ink in the light theme and a smoked one in the
 *  dark, the same chip ground `LADDER_LINK` uses, so it reads as a label on the
 *  row and not as part of its fill. Painted on the row's band fill, which is strongest
 *  at the gutter, so the ground is the white or black beneath it and the ink is the
 *  slate pair on that ground. */
export const LADDER_LINKED_BADGE =
  't-label mb-2 inline-flex items-center gap-1.5 rounded-full border border-slate-500 bg-white/85 px-2.5 py-1 text-slate-900 dark:border-white/30 dark:bg-black/40 dark:text-white';

/** The body's whole-area disclosure, for a row whose body is one control while it
 *  is shut. It takes the same 16px inset as `LADDER_BODY`, and it sits INSIDE that
 *  inset, so the control is the whole body and not a button floating in it. Its
 *  hover is a shade over the band fill, which reads on both themes without a band
 *  colour of its own. Painted on the row's band fill.
 *
 *  `can-hover:` for the same reason as everywhere: a tap leaves `:hover` stuck on
 *  a phone. The focus ring is inset because the row clips with `overflow-hidden`. */
export const LADDER_DISCLOSURE =
  `block min-w-0 p-4 ${LADDER_ROW_PHONE_INSET} text-left touch-manipulation select-none transition-colors duration-200 ` +
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

/** The reading text of a ladder row: a Marking Guide criterion and an exemplar's preview.
 *  Both are the same serif, size, leading and ink, so a guide row and an exemplar row
 *  read as one ladder. 15px: the guide's criteria are text a student reads, not a
 *  caption, and at 14px they read small beside the question; at the guide's old 16px
 *  an exemplar's two-line preview held too little of the answer. Painted on the row's
 *  band fill, which is strongest at the gutter, so the ink is checked there (see
 *  DesignSpec §2 and the e2e contrast sweep). */
export const LADDER_READING =
  'font-serif text-[15px] leading-relaxed text-slate-700 dark:text-slate-300';

/** An exemplar's opening on a shut Sample Answers row: the reading face, clamped to two
 *  lines, so a student can tell two exemplars apart before opening either. Composed here
 *  (and re-exported as `SAMPLE_ROW_PREVIEW`) so it is built from `LADDER_READING` in the
 *  same module, not read across an import at init. Painted on the row's band wash. */
export const LADDER_ROW_PREVIEW = `mt-2 line-clamp-2 break-words ${LADDER_READING}`;

/** The command-term guide's criterion lines, a glossary on a card rather than a ladder
 *  row. Kept at `.t-body`, the size prose is read at there. The ladder rows read
 *  `LADDER_READING`. */
export const LADDER_CRITERION = 't-body font-serif text-slate-600 dark:text-slate-300';

/** The unparsed-guide fallback: a guide that did not split into rows, shown as one
 *  block of reading text. It is a single row's shape with no gutter, so it takes the
 *  row's radius, border and fill and reads as the ladder's own, not as a stray box.
 *  The caller adds `LADDER_EDGE_SHUT` and `LADDER_FILL` and hands over `--band-rgb`.
 *  Painted on the panel body, with its fill from the band. */
export const LADDER_FALLBACK = `rounded-xl border p-4 shadow-sm ${LADDER_READING}`;

/** The empty guide: no criteria yet, and a line that says what closes the gap. It is
 *  a dashed well in the band's edge, not a grey box, so an empty panel still reads
 *  as part of the ladder. The caller adds `LADDER_EDGE_SHUT` for the dashed edge.
 *  Painted on the panel body. */
export const LADDER_EMPTY = 'py-8 px-4 text-center rounded-xl border-2 border-dashed';

/** A panel tool in the Marking Guide's curator row ("AI Draft"), and the AI action on the
 *  Sample Answers panel ("Generate", "Recalibrate"), which is the same control. On a phone
 *  it is a plain 44px icon with no box, so a toolbar is one slim line of icons; from `sm`
 *  it is a bordered button with its label. A caller whose label is a word on a phone hides
 *  it with `max-sm:sr-only`, so the name stays. Painted on the panel body, which is the
 *  page's tone, so it is a white button in the light theme and a dark one in the dark. */
export const LADDER_TOOL =
  't-label inline-flex items-center justify-center gap-2 min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 sm:px-3 sm:py-1.5 sm:rounded-lg sm:border sm:border-slate-300 sm:bg-white sm:shadow-sm dark:sm:border-white/10 dark:sm:bg-white/5 text-slate-700 dark:text-slate-200 can-hover:hover:shadow-lg can-hover:hover:border-slate-400 dark:can-hover:hover:border-white/25 transition-[box-shadow,border-color] duration-200 touch-manipulation active:scale-[0.98] disabled:cursor-not-allowed disabled:text-slate-400 dark:disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900/40 dark:focus-visible:ring-white/60';

/** An icon-only panel tool: "Edit", "Save", "Cancel", the notice's dismiss, the syllabus
 *  terms' add and AI actions. It is 44px on a phone, where a 24px icon is too small to
 *  hit. From `sm` it is 30px square, the height of `LADDER_TOOL` beside it: a 28px icon
 *  button sat a couple of pixels short of the pill tools in the same toolbar. The ink is
 *  the caller's, so a destructive or a confirming icon can take its own colour. Painted
 *  on the panel body. */
export const LADDER_TOOL_ICON =
  'flex items-center justify-center min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 sm:h-[30px] sm:w-[30px] p-1.5 rounded-lg transition-colors duration-200 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900/40 dark:focus-visible:ring-white/60 can-hover:hover:bg-slate-900/5 dark:can-hover:hover:bg-white/10';

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
  't-label inline-flex items-center justify-center gap-2 min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 sm:px-3 sm:py-1.5 sm:rounded-lg sm:border sm:border-amber-500/50 sm:bg-amber-50 sm:shadow-sm dark:sm:border-amber-400/40 dark:sm:bg-amber-400/10 text-amber-800 dark:text-amber-300 touch-manipulation active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-600/50 dark:focus-visible:ring-amber-300/60';

/** The icon-only version of `LADDER_TOOL_LOCKED`, combined with `LADDER_TOOL_ICON`
 *  for a locked icon tool ("AI Suggest" and "Regenerate" without the plan). */
export const LADDER_TOOL_LOCKED_ICON =
  'rounded-lg border border-amber-500/50 bg-amber-50 text-amber-800 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-300';
