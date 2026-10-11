/**
 * The Sample Answers placard's class vocabulary, in the same shape as
 * `utils/verbRibbonChrome.ts`.
 *
 * The placard is a reference panel, not the workspace's hero: DesignSpec §3 says
 * the verb ribbon is the ONE surface louder than the rest, and that "the
 * accordions, the tier cards and everything else stay calm so that this one does
 * not have to compete with them". So this file borrows the ribbon's vocabulary
 * for what it SAYS — the tier's colour, the tier tile, the scoreboard figures, the
 * band-edged card — and none of its stage: no dark palette, no aura, no mesh, no
 * sibling glow. Where a constant already exists in the ribbon's file it is reused
 * there and not restated here (`RIBBON_HEADER_TILE`, `RIBBON_HEADER_TITLE`,
 * `RIBBON_HEADER_SUBLABEL`, `RIBBON_MINI_STAIR`, `RIBBON_MINI_BAR_UNLIT`,
 * `RIBBON_TIER_CARD_IDLE`).
 *
 * The tier's colour is never written here. The panel and each row hand it to CSS
 * as `--band-rgb`, set from `getBandRgb` (and the text shade from `getBandConfig`),
 * and the `band-edge`, `band-edge-strong` and `band-wash` classes in `index.css`
 * draw it at their own alpha — one colour in both themes, which is why those
 * three carry no `dark:` partner, the same exemption the ribbon makes for its halo.
 *
 * Everything else is an ordinary themed surface: every colour is a light value
 * with a `dark:` partner, and no class names a `light:` variant. The Sample Answers
 * panel is a themed surface throughout, so there is no palette to switch.
 *
 * Each constant records what it is painted ON, because that is the question
 * DesignSpec §2 asks of every colour and it is not answerable from the class string.
 * `tests/unit/sampleAnswersPlacard.test.tsx` holds the rules that follow.
 */

/** The panel's header row: the disclosure and the tools, as one header. It WRAPS,
 *  by the width of the panel and not of the viewport: the Sample Answers placard
 *  sits in a 22rem margin beside the report at xl, and a 352px panel cannot hold
 *  the title and the reading-size, Generate and recalibrate controls on one line
 *  without the title going to "SAMPLE …". When it wraps, the tools take a second
 *  line, right-aligned, under the title, and the tint covers both lines so they
 *  still read as one header. Painted on the panel surface. The open tint is added
 *  at the call site (`PANEL_HEADER_OPEN`), so the shut header is the panel's own tone.
 *
 *  `transition-colors`, not `transition-all`: the only thing that animates here is
 *  the tint. Wrapping is not a transition; the browser lays out the lines. */
export const SAMPLE_PANEL_HEADER =
  'w-full flex flex-wrap items-stretch relative overflow-hidden transition-colors duration-300';

/** The disclosure button on the panel's header row. Painted on the header bar,
 *  which is the page's own tone: white in the light theme, and the panel's dark
 *  tint in the dark one. The open and shut tints come from `PANEL_HEADER_OPEN` and
 *  `PANEL_HEADER_CLOSED` in `utils/panelStyles.ts`, which the header wrapper takes.
 *
 *  `flex-[1_1_20rem]` rather than `flex-1`: it grows to take the rest of its line,
 *  but its basis is 20rem, so when the tools would not fit beside it the line breaks
 *  and the tools wrap under it. `flex-1` sets the basis to 0%, which would never
 *  wrap anything. The 20rem is measured: the sublabel ("4 levels · 5 exemplars · Band
 *  ceiling 3") is 208px, and the tile, padding, gaps and chevron take another 112px,
 *  so a toggle narrower than 320px ellipsises the sublabel. At 15rem it did, at a
 *  480px panel, where the tools took the line first. Wrapping at 20rem keeps the
 *  toggle at 320px or more, so the title and the sublabel both fit.
 *
 *  The row's height is NOT stated here: the call site adds `PANEL_ROW_MIN_H`, so the
 *  header stands on the same whole pixel as every other panel row. The focus ring
 *  is inset, in a pair, because the panel clips with `overflow-hidden` and an
 *  outside ring would be cut off on three sides. */
export const SAMPLE_PANEL_TOGGLE =
  'flex-[1_1_20rem] min-w-0 py-3.5 pl-5 pr-3 flex items-center gap-4 text-left relative z-10 touch-manipulation select-none transition-colors duration-300 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900/40 dark:focus-visible:ring-white/60';

/** The panel's tools: the mini ladder, the reading size and the AI actions. They
 *  sit at the right end of the header row, `ml-auto`, so they are right-aligned
 *  both on the title's line and, when the header wraps, on the line beneath it.
 *  `py-2` is what holds them clear of the top and bottom of the row without making
 *  it taller: the row is `PANEL_ROW_MIN_H` already, and the tools are shorter than
 *  that. Painted on the panel surface. */
export const SAMPLE_PANEL_TOOLS =
  'ml-auto flex items-center gap-2 py-2 pl-2 pr-4 relative z-10 shrink-0';

/** The tier's edge on the OPEN panel, as an inline `borderColor`. Painted on the
 *  panel's own border, in place of the neutral `border-slate-300`.
 *
 *  Half strength, the same as the ribbon's root edge: a statement without being a
 *  frame. It is a style value and not a class because it is drawn from the panel's
 *  own `--band-rgb`, and the panel's class string is `PANEL_SURFACE`, which is shared. */
export const SAMPLE_PANEL_LIT_EDGE = 'rgb(var(--band-rgb) / 0.5)';

/** The tier's glow beneath the OPEN panel, as an inline `boxShadow`: a hairline in
 *  the tier's colour and a soft fall-off below it. Painted outside the panel's box,
 *  so `overflow-hidden` does not clip it.
 *
 *  A band glow is a coloured shadow by design — DesignSpec §3 keeps
 *  `getBandConfig().glow` outside the elevation scale for exactly this. It is a box
 *  shadow and not a sibling layer because the panel's root is `PANEL_SURFACE`, and
 *  `tests/unit/workspacePanelChrome.test.tsx` pins that root as the panel's surface,
 *  so a wrapper to hold a sibling would move that contract. The shadow is applied
 *  once, when the body mounts: the height changes in one step, not on a transition.
 *  The panel's `transition-all` tweens it for its 300ms, which is accepted here. */
export const SAMPLE_PANEL_LIT_GLOW =
  '0 0 0 1px rgb(var(--band-rgb) / 0.12), 0 22px 44px -28px rgb(var(--band-rgb) / 0.6)';

/** The body of the open panel: the mark-level rows, stacked as cards with a gap
 *  between them. Painted on the panel surface, which is the page's tone. */
export const SAMPLE_PANEL_BODY = 'relative flex flex-col gap-3 p-3 sm:p-4';

/** A mark-level row, as a tier card: its shape and its fill. The fill is
 *  `RIBBON_TIER_CARD_IDLE` at the call site, so it is the ribbon's own card fill.
 *  Painted on the panel body.
 *
 *  `rounded-2xl`, the ribbon's card radius, under a 20px panel: a card inside a
 *  panel is one step smaller than the panel, and this is the step the ribbon's
 *  drawer takes for its tier cards. No fixed height — the card is as tall as its
 *  header and its open body. */
export const SAMPLE_ROW =
  'relative isolate overflow-hidden flex flex-col rounded-2xl border transition-[border-color] duration-300 ease-out';

/** A row's edge when shut: the tier at a whisper. `band-edge` in `index.css`, at
 *  35%. Painted on the card border, the same as the ribbon's idle cards. */
export const SAMPLE_ROW_EDGE_SHUT = 'band-edge';

/** A row's edge when open: the tier at a statement, the same as the ribbon's
 *  selected card. `band-edge-strong` in `index.css`, at 85%. Painted on the card border. */
export const SAMPLE_ROW_EDGE_OPEN = 'band-edge-strong';

/** A row's header: the band-tinted strip across the top of the card, holding the
 *  disclosure and the line beneath it. It is a WRAPPER and not a control — a
 *  button cannot hold the carousel's buttons, which is what used to make a
 *  `<button>` a descendant of a `<button>` — so the interactive parts are the
 *  disclosure (`SAMPLE_ROW_DISCLOSURE`) and the carousel group, which sit inside it
 *  as siblings. Its tint is the tier's own `band-wash` (10% of the tier, the ribbon's
 *  idle header tint), so a row says its tier without becoming a wall of it, and the
 *  saturation is left for the open edge. Painted on the card. */
export const SAMPLE_ROW_HEADER = 'band-wash relative px-4 sm:px-5 pt-3 pb-3 flex flex-col gap-3';

/** The row's disclosure: the control that opens and shuts it. It covers the
 *  scoreboard and the chevron, so the figures and the arrow are both a target. It
 *  does NOT cover the source line, because the carousel's previous and next
 *  controls share that line and a control cannot sit inside another control. Painted
 *  on the header's tier tint.
 *
 *  Hover is `can-hover:`, as everywhere on the ribbon: a tap on a phone leaves
 *  `:hover` stuck on the element. The focus ring is inset, in a pair, for the same
 *  reason as `SAMPLE_PANEL_TOGGLE`. */
export const SAMPLE_ROW_DISCLOSURE =
  'w-full text-left flex items-center gap-3 min-w-0 rounded-xl cursor-pointer touch-manipulation select-none transition-[filter] duration-300 ' +
  'can-hover:hover:brightness-95 dark:can-hover:hover:brightness-110 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900/40 dark:focus-visible:ring-white/60';

/** The scoreboard's own column inside the disclosure, which takes the width the
 *  chevron does not. Painted on the header's tier tint. */
export const SAMPLE_ROW_SCOREBOARD = 'flex-1 min-w-0';

/** The chevron at the end of the disclosure, in its shut and open state by the
 *  call site. Painted on the header's tier tint. */
export const SAMPLE_ROW_CHEVRON = 'w-4 h-4 shrink-0 transition-transform duration-500';

/** The line beneath the disclosure: the source badge and the flag on the left, the
 *  carousel's controls on the right when a level has several exemplars. Its
 *  controls are siblings of the disclosure, so this line is not a control in its
 *  own right. It wraps, so on a narrow card the carousel drops under the badge
 *  rather than pushing either out of the card. Painted on the header's tier tint. */
export const SAMPLE_ROW_LINE = 'flex flex-wrap items-center justify-between gap-3 min-w-0';

/** The carousel's previous and next controls, with the "N/M" between them. The
 *  buttons are siblings of the disclosure and handle their own clicks, so pressing
 *  them neither toggles the row nor needs to stop an event. Painted on the header's
 *  tier tint, so the group is a white well with its own border and shadow, the
 *  same as the panel's own controls. */
export const SAMPLE_ROW_CAROUSEL =
  'ml-auto flex items-center gap-1 rounded-lg p-0.5 border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-black/20';

/** The scoreboard across a row's header: the mark, the band, the length and the
 *  exemplar count, in cells. A flex-wrap row, not a grid, because a grid of four
 *  columns left an empty grey slot whenever a level had three cells (no Exemplars
 *  cell), and at a phone width the second row's second slot was empty for the same
 *  reason. The cells are sized to their row instead (`SAMPLE_STAT_CELL`), so the
 *  number of cells never leaves a gap. The hairlines are the `gap-px` showing the
 *  ground through the cells, including between wrapped rows. Painted on the row
 *  header's tier tint. */
export const SAMPLE_STAT_GRID =
  'flex flex-wrap gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 dark:border-white/10 dark:bg-white/10';

/** One scoreboard cell: an opaque fill, so the hairlines between cells show and
 *  the figures are never read through the tier tint.
 *
 *  It GROWS to fill its row (`grow`) from a basis of 7.5rem (120px), which is wide
 *  enough for "127 words" and "6/6 marks" at the figure size with their padding.
 *  The basis is set with `basis-[…]` and not `flex-1`, because `flex-1` is
 *  `flex: 1 1 0%`: a zero basis fits everything on one line and the cells would
 *  never wrap. So a row of two cells on a phone is two cells each half the width,
 *  a third cell wraps onto a line of its own and takes the whole width, and there
 *  is never a slot left empty. Painted on the header. */
export const SAMPLE_STAT_CELL =
  'flex flex-col grow basis-[7.5rem] min-w-0 px-3 py-2.5 sm:px-4 bg-white dark:bg-[rgb(var(--color-bg-surface))]';

/** "Mark", "Band", "Length", "Exemplars": the caption over a figure. `t-label`
 *  sets the size, weight and case, as everywhere else. `slate-600` is 7.6:1 on the
 *  white cell and `slate-300` is 13.3:1 on the dark one; `slate-500` would be
 *  4.1:1 on the dark one and fails. Painted on the cell. */
export const SAMPLE_STAT_LABEL = 't-label text-slate-600 dark:text-slate-300';

/** The figure under a label. Mono and tabular, because these are telemetry
 *  (DesignSpec §4: "marks, token counts"), so a two-digit range does not shove its
 *  neighbours along. `font-bold` rather than `font-black`: a figure at this size
 *  takes 700 on the weight ladder. `whitespace-nowrap` and NO truncate: a figure
 *  that does not fit its cell is a defect, and an ellipsis on "6/6 marks" hides the
 *  mark. The cell's basis is what makes the figure fit (`SAMPLE_STAT_CELL`).
 *  The colour is NOT here — a band's figure takes the tier's text shade from
 *  `getBandConfig` and the others take the ink, at the call site, the way the
 *  ribbon's scoreboard does. Painted on the cell. */
export const SAMPLE_STAT_VALUE =
  'mt-1 font-mono text-sm font-bold tabular-nums leading-none whitespace-nowrap';

/** The controls bar at the head of an open exemplar: the word and keyword chips on
 *  the left, the actions on the right. It WRAPS, at every width, because the
 *  exemplar box clips with `overflow-hidden`: an unwrapped row of seven actions was
 *  cut off at the box's edge (Delete was 17px out of view at 390px, 35px at 500px),
 *  and a control that cannot be reached is worse than one that sits on a second
 *  line. `gap-x` and `gap-y` are named separately so the wrapped lines keep their
 *  rhythm. Painted on the exemplar box's slate-100 strip. */
export const SAMPLE_EXEMPLAR_TOOLBAR =
  'flex flex-wrap items-center gap-x-4 gap-y-3 p-4 border-b border-slate-300 bg-slate-100 dark:border-white/10 dark:bg-white/[0.02]';

/** The actions on the exemplar toolbar, right-aligned on the line they land on, and
 *  wrapping within themselves for the same reason as `SAMPLE_EXEMPLAR_TOOLBAR`.
 *  Painted on the toolbar's strip. */
export const SAMPLE_EXEMPLAR_ACTIONS = 'ml-auto flex flex-wrap items-center justify-end gap-2';

/** The row's body, under its header: the exemplar, its controls and the feedback.
 *  Painted on the card, below the tinted header. */
export const SAMPLE_ROW_BODY = 'relative px-4 sm:px-5 pb-4';

/** The line under a row's scoreboard: the source badge and the flag, wrapping as
 *  one unit on a narrow screen. Painted on the row header's tier tint. */
export const SAMPLE_ROW_META = 'flex flex-wrap items-center gap-2 min-w-0';

/** One bar of the header's mini ladder. The lit and faint bars take their colour
 *  inline from `getBandRgb`, and the grey ones take `RIBBON_MINI_BAR_UNLIT`. Shaped
 *  as the ribbon's miniature is shaped. Painted on the panel header bar. */
export const SAMPLE_MINI_BAR = 'w-1 rounded-full';
