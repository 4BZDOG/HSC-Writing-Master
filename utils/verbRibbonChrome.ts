/**
 * The command verb ribbon's class vocabulary, in the same shape as
 * `utils/headerChrome.ts`, `utils/cardChrome.ts` and `utils/panelStyles.ts`.
 *
 * The ribbon is the workspace's one HERO, and this file is where that is
 * written down. It has two zones, and the difference between them is the whole
 * design:
 *
 * - The STAGE — the header row, the verb at poster scale, the scoreboard and the
 *   ceiling staircase — is dark in BOTH themes. A page of white and slate panels
 *   in the light theme is a calm page, and one lit slab on it is what makes the
 *   ribbon the thing the eye goes to; in the dark theme the same slab reads as
 *   a spotlit stage, lit in the tier's own colour. Every constant painted on it
 *   is named `RIBBON_INK_*`, and `tests/unit/verbRibbonChrome.test.tsx` holds
 *   the two rules that follow from that: nothing named INK carries a `dark:` or
 *   `light:` partner (it has one ground, so a partner is a second guess at it),
 *   and nothing named INK reads a theme token (`--color-text-*` resolves to
 *   dark ink under the light theme, which is exactly wrong on a dark ground).
 * - The DRAWER beneath it — the six tier cards and their thirty-eight verb
 *   chips — is an ordinary themed surface, so every colour on it is a
 *   light/`dark:` pair and the tier colours come from the tier config.
 *
 * This file holds the ribbon's THEME-NEUTRAL CHROME only. Everything
 * tier-coloured on the drawer stays interpolated from `getTierScaleConfig(tier)`
 * at the call site: baking six tiers into constants here would duplicate
 * `utils/renderUtils.ts`, which is pinned by `tests/unit/bandColors.test.ts` and
 * shared by a dozen other surfaces. The stage takes its hue another way — the
 * stage root sets `--band-rgb` once, from `getBandRgb`, and everything on it
 * draws from that at whatever alpha it needs — so the palette is still written
 * down in one place.
 *
 * Each constant records what it is painted ON, because that is the question
 * DesignSpec §2 asks of every colour and it is not answerable from the class
 * string alone.
 *
 * New code here is `dark:`-first: light is the base, `dark:` carries the
 * override (DesignSpec §2, "Which variant to write in new code"). The project's
 * own `light:` variant stays valid elsewhere and the tier config keeps it, so a
 * rendered `className` in this component legitimately contains both idioms —
 * but nothing in THIS file may, and `tests/unit/verbRibbonChrome.test.tsx`
 * pins that.
 */

/** The ribbon's outermost box, and the stage's ground. Painted on the page.
 *
 *  It is a workspace CARD in rank — `rounded-surface`, the 32px of the Writing
 *  Prompt and Written Response cards — where it used to be a 20px panel beside
 *  the accordions. The accordions are reference material of equal weight; this
 *  is the thing that explains the one fact that sets a student's ceiling, and
 *  the radius says so.
 *
 *  `bg-[#070b14]` is a deliberate literal. It is the dark theme's deep-sea navy
 *  (DesignSpec §3, `#0a0f1a`) taken one step down, so the slab reads as a stage
 *  with its lights lowered rather than as a second page background. It cannot be
 *  a token: the surface tokens flip under the light theme, and the whole point
 *  of the stage is that it does not. The tier-lit border and the glow beneath it
 *  are inline at the call site, because they come from `--band-rgb`.
 *
 *  `isolate` so the aura and the mesh, which sit behind the content at `z-0`,
 *  cannot be reordered against anything outside the ribbon. */
export const RIBBON_ROOT =
  'clip-stable relative isolate overflow-hidden rounded-surface border border-white/15 bg-[#070b14] text-white animate-fade-in';

/** The light that falls on the stage, in the tier's own hue. Painted on the
 *  stage's ground; its gradient is inline at the call site and is built from
 *  `--band-rgb`, so it re-tints with the question.
 *
 *  A SOURCE of light, not a wash: one pool at the top left, where the verb is,
 *  and a fainter one low on the right, under the staircase. It is keyed by tier
 *  at the call site, so changing to a verb of another tier cross-fades the
 *  light rather than snapping it, and it ends at rest — `animate-fade-in` is a
 *  one-shot, so nothing here moves between question changes.
 *
 *  It is a SIBLING of the content and never an ancestor of any text. That is
 *  deliberate: `tests/e2e/support/contrast.ts` returns `unassessable` for any
 *  text whose background chain meets a gradient, so a text node inside a
 *  gradient-painted element would be taken out of the light-theme audit — the
 *  blind spot that let this component's first three contrast defects ship. With
 *  the aura beside the content, every text node's nearest background is the
 *  flat ground. */
export const RIBBON_INK_AURA = 'absolute inset-0 z-0 pointer-events-none animate-fade-in';

/** The header row, which is also the disclosure toggle. Painted on the stage.
 *
 *  It takes `PANEL_ROW_MIN_H` at the call site, so it stands on the same whole
 *  pixel as every accordion's row — the ribbon is no longer one of them, but a
 *  61px row among 61px rows is still what keeps the page's rhythm.
 *
 *  The height is LOCKED, and it takes both halves: `min-h` against shrinking, and
 *  `whitespace-nowrap` / `truncate` on the pieces below against growing.
 *  `tests/unit/commandVerbHierarchy.test.tsx` pins it. A long verb —
 *  DIFFERENTIATE is thirteen characters — must not widen the chip, squeeze the
 *  title and take it to a second line; nothing in the ribbon's chrome should move
 *  when the question changes.
 *
 *  The focus ring is a white inset ring, which is the only one that reads on a
 *  dark ground and is not clipped by the root's `overflow-hidden`. */
export const RIBBON_INK_HEADER_BAR =
  'relative z-10 w-full py-3.5 px-4 sm:px-6 flex items-center justify-between gap-3 text-left ' +
  'transition-colors duration-300 group/header hover:bg-white/[0.04] ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70';

/** The 32px icon tile at the head of the bar, where the tier colour lives while
 *  the ribbon is shut. Its fill is interpolated at the call site: the tier's
 *  `solidBg` and `solidText` when a verb is selected — the pairing
 *  `getBandConfig` exists to provide, and the reason it is not `text-white`,
 *  which tier 3's yellow reads at 1.9:1 — and a quiet white-alpha well when none
 *  is. Painted on the stage. */
export const RIBBON_INK_HEADER_TILE =
  'w-8 h-8 shrink-0 rounded-xl flex items-center justify-center border shadow-sm transition-colors duration-500';

/** "HSC Command Verb Hierarchy" — the panel's NAME, in the section voice every
 *  title in the workspace takes. Truncates rather than wraps: an ellipsis on a
 *  title the reader already knows costs nothing, a second line costs the height
 *  lock. Painted on the stage.
 *
 *  The tracking comes in below `sm`. At the section voice's 0.16em the title is
 *  about 50px wider than at 0.06em, and on a 390px phone — a 32px tile, a
 *  chevron and the bar's padding already spoken for — that was the difference
 *  between the whole name and "HSC COMMAND VERB HIERAR…". It is `!important`
 *  because `.t-section` sets its own tracking and is declared after the
 *  utilities, so a plain utility would lose to it. Below 380px — a 360px Android
 *  is the common case — it comes in a second step, to 0.02em, which is what a
 *  218px title box needs; a 320px screen still ellipsises, and is the one width
 *  this does not try to save. */
export const RIBBON_INK_HEADER_TITLE =
  't-section block truncate text-white max-sm:!tracking-[0.06em] max-[379px]:!tracking-[0.02em]';

/** "Reference · 6 cognitive tiers", under the title. `slate-300`, not
 *  `slate-500`: 13.3:1 against 4.1:1 on this ground, measured. Painted on the
 *  stage. */
export const RIBBON_INK_HEADER_SUBLABEL = 't-label block truncate text-slate-300';

/** The word "Selected:" before the chip. `whitespace-nowrap` is half of the
 *  height lock. Painted on the stage. */
export const RIBBON_INK_SELECTED_LABEL = 't-label whitespace-nowrap text-slate-300';

/** The chip carrying the selected verb. `whitespace-nowrap` is the other half
 *  of the height lock — DIFFERENTIATE is thirteen characters. White text on a
 *  wash of the tier, so it reads the same on all six hues, including the yellow
 *  that white-on-fill fails. Painted on the stage. */
export const RIBBON_INK_SELECTED_CHIP =
  't-label px-2.5 py-0.5 rounded-lg whitespace-nowrap border text-white ' +
  'bg-[rgb(var(--band-rgb)/0.22)] border-[rgb(var(--band-rgb)/0.65)]';

/** The ceiling in miniature, in the header: six ascending bars, lit to the
 *  tier. It is what the staircase below says, small enough to say it while the
 *  ribbon is shut — which is when most students see this surface. The bars are
 *  drawn at the call site. Decorative, so `aria-hidden` there; the chip beside it
 *  and the live region say the same thing in words. Painted on the stage.
 *
 *  Not below `sm`. On a 390px phone the bars cost the title about 30px, which is
 *  the difference between the whole name and "HSC COMMAND VERB HIER…" — and the
 *  tile beside the title is already the tier's colour there, which is the part
 *  of this glyph a phone has room for. */
export const RIBBON_INK_MINI_STAIR = 'hidden sm:flex items-end gap-[3px] h-4 shrink-0';

/** The stage's body: the verb and its brief on the left, the staircase on the
 *  right, the scoreboard across the foot. Painted on the stage.
 *
 *  `z-10` over the aura and the mesh. One column below `lg`, where the
 *  staircase takes the full width and so keeps six columns wide enough to touch;
 *  the left column gets slightly more than half from `lg`, because it carries a
 *  96px verb. */
export const RIBBON_INK_HERO =
  'relative z-10 grid gap-8 lg:gap-10 px-5 sm:px-8 pt-4 pb-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start';

/** The tier chip above the verb. Its words are the tier's, derived at the call
 *  site. Painted on the stage. */
export const RIBBON_INK_TIER_CHIP =
  't-label inline-flex items-center rounded-full border px-3 py-1 whitespace-nowrap text-white ' +
  'bg-[rgb(var(--band-rgb)/0.22)] border-[rgb(var(--band-rgb)/0.65)]';

/** The verb itself, at poster scale. THE hero element, and the only one that is
 *  allowed to be this loud: Inter 900 italic caps — the display voice that names
 *  the product and the two workspace cards — lit from behind by the tier's own
 *  hue, so it reads as a sign rather than as a heading.
 *
 *  The size is not here: it depends on how long the verb is, and CRITICALLY
 *  EVALUATE does not fit where IDENTIFY sets at 96px. `ribbonVerbSize` below
 *  chooses it, and `tests/e2e/verb-ribbon.spec.ts` measures all thirty-eight
 *  against the column at six widths.
 *
 *  `text-shadow` is the glow, and it is drawn from `--band-rgb`, so it is the
 *  tier's colour at 55% and not a second copy of anything. Painted on the stage. */
export const RIBBON_INK_VERB =
  't-display uppercase italic leading-[0.92] tracking-tighter text-white break-words ' +
  '[text-shadow:0_0_48px_rgb(var(--band-rgb)/0.55)]';

/** The type size for a verb, by what the verb is.
 *
 *  A function, not a constant, because the size is a property of the word. The
 *  steps are set from Inter 900 italic caps measuring about 0.72em an
 *  advance, against the left column's width at each breakpoint: the single-word
 *  verbs of up to eight letters set at the full 96px only from 1440px, and the
 *  long ones — DIFFERENTIATE, and the two-word CRITICALLY ANALYSE and CRITICALLY
 *  EVALUATE, which wrap — step down so none of them is ever wider than its
 *  column. */
export const ribbonVerbSize = (term: string): string => {
  const length = term.length;
  if (!term.includes(' ') && length <= 8) {
    return 'text-5xl sm:text-6xl xl:text-7xl min-[1440px]:text-8xl';
  }
  if (!term.includes(' ') && length <= 11) {
    return 'text-4xl sm:text-5xl xl:text-6xl min-[1440px]:text-7xl';
  }
  return 'text-3xl sm:text-4xl xl:text-5xl min-[1440px]:text-6xl';
};

/** The tier-lit rule under the verb — the same device as the dotted underline
 *  the question card puts under the verb in the prompt, so a student sees one
 *  gesture in two places. It draws in from the left (`animate-rule-draw`, a
 *  one-shot that ends at rest) when the verb changes. Painted on the stage. */
export const RIBBON_INK_VERB_RULE =
  'mt-4 h-1.5 w-24 rounded-full origin-left animate-rule-draw bg-[rgb(var(--band-rgb))] ' +
  'shadow-[0_0_18px_rgb(var(--band-rgb)/0.7)]';

/** The verb's definition. Painted on the stage. Plain `slate-100` at full
 *  strength: 18:1 here, and nothing on this ground is dimmed with `opacity`. */
export const RIBBON_INK_DEFINITION =
  'mt-5 max-w-xl text-lg font-semibold leading-snug text-slate-100';

/* RIBBON_DETAIL_TIP_ACCENT is gone with `StrategyTip`, which it dressed. The brief
 * itself is `StrategyBrief tone="ink"`, which takes its colours from a table of
 * its own rather than from theme tokens — see the note on `tone` there.
 */

/** The scoreboard across the foot of the stage: marks, band cap, time, terms.
 *  Painted on the stage.
 *
 *  Hairlines are the `gap-px` showing a `bg-white/10` ground between opaque
 *  cells, which is why each cell is a flat fill and not a wash: the lines cost no
 *  elements and cannot misalign with the cells they divide. Two columns below
 *  `sm` — all four stats fit a phone this way, where the old tray hid "Terms"
 *  to make room — and four from there. */
export const RIBBON_INK_SCOREBOARD =
  'grid grid-cols-2 sm:grid-cols-4 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10';

/** One scoreboard cell. A flat fill, a step lighter than the stage, so the
 *  hairlines between cells show. Painted on the stage. */
export const RIBBON_INK_STAT_CELL = 'flex flex-col px-4 sm:px-5 py-3.5 bg-[#0b1322]';

/** "Marks", "Band Cap", "Time", "Terms". Painted on the cell. */
export const RIBBON_INK_STAT_LABEL = 't-label mb-1.5 text-slate-300';

/** The number under each label; its colour is the tier's. Painted on the cell.
 *
 *  Mono, because these four are telemetry: DesignSpec §4 gives `JetBrains Mono`
 *  to "marks, token counts, and system logs", and marks are the first example in
 *  that sentence. `tabular-nums` because a two-digit mark range must not shove
 *  its neighbours along as the verb changes. Large type, so the tier hue's
 *  4.65–10:1 on this ground clears the 3:1 that big text asks for with room. */
export const RIBBON_INK_STAT_VALUE =
  'whitespace-nowrap font-mono text-2xl sm:text-3xl font-black tabular-nums leading-none text-[rgb(var(--band-rgb))]';

/** The sentence that says what the staircase means: the verb's ceiling, in
 *  words. It is the staircase's headline — the one line of the whole ribbon that
 *  is the point of it — and it used to be a 10px caption under a tray.
 *
 *  Plural rather than "A {TERM} question": eleven of the thirty-eight verbs begin
 *  with a vowel, and "A EXPLAIN question" is what that sentence renders for every
 *  one of them. Painted on the stage. */
export const RIBBON_INK_CAPTION = 'text-lg sm:text-xl font-bold leading-snug text-white';

/** The staircase itself: the ribbon's second centre of gravity, and the picture
 *  of what the verb costs. Six columns rising from tier 1 to tier 6; the ones a
 *  student can reach with this verb are lit in their tiers' hues, the ones above
 *  the ceiling are hatched and dashed — present, and out of reach. Painted on
 *  the stage.
 *
 *  Geometry is ONE scale, which is what the old bar's own comment records as the
 *  thing it kept getting wrong. Band `i` owns `[(i-1)/6, i/6]` of the width; its
 *  step button is centred on that band and is one sixth wide less a gutter, so
 *  the column, its numeral, its label and the Deep Learning Threshold at 50% all
 *  agree by construction.
 *
 *  The three custom properties are the whole of its vertical rhythm: `--plot`
 *  is the tallest column (tier 6), `--label` the row of tier names beneath, and
 *  the `1.5rem` between them is the numeral that sits on every column. They
 *  step down on a phone, where the strip is a third of the width. */
export const RIBBON_INK_STAIR =
  'relative [--plot:6.5rem] sm:[--plot:8.5rem] lg:[--plot:9.5rem] [--label:2.25rem] h-[calc(var(--plot)+1.5rem+var(--label))]';

/** One step: a button that is the column, its band numeral and its tier name
 *  at once, so the target a student aims at is the thing they are looking at —
 *  a column 50px wide and 100px tall, where the old dot was 16px. It is centred
 *  on its band (`left` at the call site, with the translate) and sized by a
 *  `calc` from the band's width.
 *
 *  `group/step` so the column and the label can answer the hover and the focus
 *  of the one control. The focus ring is white and sits on the button's own
 *  rounded top. Painted on the stage. */
export const RIBBON_INK_STAIR_STEP =
  'absolute inset-y-0 z-10 -translate-x-1/2 flex flex-col justify-end cursor-pointer rounded-t-lg group/step ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070b14]';

/** A column's band numeral, above it: mono, because it is a figure, and
 *  `slate-300` or white because the column it names is ghosted or lit. These are
 *  NOT `aria-hidden`: `contrast.ts` skips everything inside an `aria-hidden`
 *  subtree, and hiding a new block of text from the audit is the blind spot that
 *  let this component's first three contrast defects ship. The button's
 *  `aria-label` is the name a screen reader gets, so the numeral costs it
 *  nothing. Painted on the stage. */
export const RIBBON_INK_STAIR_NUMERAL =
  'block pb-1.5 text-center font-mono text-xs font-bold tabular-nums transition-colors duration-300';

/** The column. Fill, glow and hatch are inline at the call site, because they
 *  come from the tier's `--tier-rgb` and from whether the column is reachable;
 *  this is the shape and the response. `brightness` on hover is a filter and so
 *  paints on the compositor; nothing here is `opacity` over text. Painted on the
 *  stage.
 *
 *  It RISES from its foot when the ribbon is opened, each column a beat after
 *  the one to its left — the staircase builds itself. That is the one
 *  orchestrated moment this surface has, and it is written down as a delay per
 *  column at the call site, so the stagger belongs to the column's position and
 *  not to a class. `transform` only, so it stays on the compositor, and the last
 *  frame is full height, so a reader who has asked for no motion is left with the
 *  whole staircase (and no wait: `index.css` zeroes this one delay for them). */
export const RIBBON_INK_STAIR_COLUMN =
  'relative block w-full rounded-t-lg origin-bottom animate-stair-rise transition-[filter] duration-300 group-hover/step:brightness-125';

/** The one-shot flare up the column the reader has just reached, keyed on the
 *  tier at the call site so it replays when the question changes. It is the
 *  bar's `tier-ignite`, growing from the foot of the column. Its fill is the
 *  tier's own hex, inline. Painted over the column.
 *
 *  `opacity-0` is its RESTING state, not a dim: the flare has a delay, so that it
 *  fires after its column has finished rising, and `tier-ignite` fills forwards
 *  only, so without this the overlay would sit at full strength in the tier's
 *  hex for the length of the delay. It carries no text. */
export const RIBBON_INK_STAIR_IGNITION =
  'absolute inset-0 rounded-t-lg pointer-events-none origin-bottom opacity-0 animate-tier-ignite';

/** The ceiling: a dashed line across the whole staircase at the height of the
 *  verb's tier. Everything lit is at or below it; the columns that climb through
 *  it are the ones this verb will not let you reach. It draws in from the left
 *  when the tier changes. Painted on the stage, over the columns. */
export const RIBBON_INK_CEILING =
  'absolute inset-x-0 z-20 h-0 border-t-2 border-dashed pointer-events-none origin-left animate-rule-draw';

/** The Deep Learning Threshold, as a dashed rule down the middle of the
 *  staircase — between tier 3 and tier 4, where a Band 3 cap stops being the
 *  ceiling. Its chip is on the rail above, and the rule reaches up to it.
 *  Painted on the stage, under the columns. */
export const RIBBON_INK_THRESHOLD_RULE =
  'absolute -top-2 bottom-0 z-0 w-px -translate-x-1/2 border-r-2 border-dashed border-white/35 pointer-events-none';

/** The scale rail above the staircase — the two sides the Deep Learning
 *  Threshold divides the ladder into, and the chip that names the gate.
 *  Painted on the stage.
 *
 *  A row in the flow, which it was not for a long time: it used to hang in air
 *  that belonged to a different element's margin, and deleting that element
 *  dropped it 64px through the footer's divider. The rail occupies its own row
 *  and the chip is positioned inside it, so the only thing either depends on is
 *  this element.
 *
 *  `hidden sm:flex`, the same floor the chip had: below `sm` there is no room for
 *  two captions and a pill across a 360px stage.
 *
 *  Flush to the staircase's own edges, so the captions start and end where the
 *  columns do and the chip's 50% is the threshold's 50%. */
export const RIBBON_INK_SCALE_RAIL =
  'hidden sm:flex relative items-center justify-between mb-2 pointer-events-none';

/** One span's caption. `slate-300` on this ground, 13.3:1. Not `aria-hidden`,
 *  for the reason on `RIBBON_INK_STAIR_NUMERAL`. Painted on the stage. */
export const RIBBON_INK_SCALE_SPAN =
  't-label inline-flex items-center whitespace-nowrap text-slate-300';

/** The "Deep Learning Threshold" marker on the rail. Painted on the stage, in a
 *  pill that is the stage's own lighter fill, so it sits on the dashed rule
 *  rather than being crossed by it. */
export const RIBBON_INK_THRESHOLD_CHIP =
  't-label absolute left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full border whitespace-nowrap ' +
  'bg-[#0b1322] text-slate-100 border-white/25';

/** A step's tier name, under its column. Painted on the stage. */
export const RIBBON_INK_STEP_LABEL =
  't-label flex h-[var(--label)] items-center justify-center sm:tracking-widest transition-colors duration-300';

/** The five names that are not the reader's current tier. On phones six tracked
 *  labels collide, so only the current one keeps its name below `sm`. The hover
 *  lift is colour, not opacity — the rule this component spent three fixes
 *  learning. */
export const RIBBON_INK_STEP_LABEL_IDLE =
  'hidden sm:flex text-slate-300 group-hover/step:text-white';

/** The drawer: the six tier cards. A themed surface under the stage — paper in
 *  the light theme, the surface token in the dark one — so the hero is a slab
 *  sitting on a sheet, and the sheet is the ordinary workspace. Opaque in both,
 *  because the aura is `inset-0` over the whole root and would otherwise show
 *  through a translucent fill in one theme and not the other. */
export const RIBBON_DRAWER =
  'relative z-10 p-4 sm:p-6 border-t border-slate-300 bg-white ' +
  'dark:border-white/10 dark:bg-[rgb(var(--color-bg-surface))]';

/** The horizontal tier strip. Six 260px cards plus gaps is ~1580px, so it
 *  overflows at nearly every width. Painted on the drawer.
 *
 *  `snap-proximity`, not `snap-mandatory`. Three things move this strip: the
 *  reader, the auto-scroll that centres the active tier, and the browser's own
 *  scroll-into-view when Tab takes focus into a card that is off screen.
 *  Mandatory snapping contests the last two — it is the right setting for a
 *  pager, and this is a ladder you read along. Proximity keeps the settling
 *  without the argument.
 *
 *  It carries `role="group"` and a name at the call site. Deliberately NOT
 *  `tabIndex={0}`: WCAG 2.1.1 is already satisfied because the 44 controls
 *  inside it are focusable, and a 51st tab stop in front of them buys nothing.
 *  Do not add one. */
export const RIBBON_STRIP =
  // `relative`, so the cards' `offsetLeft` — which the auto-scroll that centres
  // the selected tier is built on — is measured from THIS box in every browser.
  // A `relative` wrapper used to do it by accident; with the wrapper gone, an
  // unpositioned strip leaves the offset parent to the nearest positioned
  // ancestor, which is the panel, whose left edge is not the strip's.
  'relative flex overflow-x-auto gap-4 px-4 pb-4 pt-2 snap-x snap-proximity scrollbar-hide ' +
  // From `xl` the six tiers sit side by side. The strip scrolled at every
  // width, so on a 1280px laptop — the width the page is mostly used at —
  // Evaluate, the top of the ladder, was off-screen and Discuss was cut in
  // half: the two rungs the ladder is there to show a student they are
  // climbing toward. At 1216px of content, six columns are 189px each, which
  // holds the longest verb chip (DIFFERENTIATE) with room to spare.
  'xl:grid xl:grid-cols-6 xl:overflow-visible xl:gap-3 xl:px-0 ' +
  // The edge fades, as a mask on the strip itself (`index.css`). `scrollbar-hide`
  // takes away the only signal that there is more to the right, and nothing
  // replaced it. This used to be two gradient overlays that ended in the PAGE's
  // colour — correct while the strip sat on the page, and a grey smear at each
  // end once it sat on a white panel in the light theme. A mask fades the cards
  // themselves into whatever is behind them, so it has no colour to get wrong in
  // either theme.
  //
  // `px-4` is the 1rem the mask ramps over, so at rest the first card sits just
  // past the left ramp at scroll 0 and the last just before the right one at the
  // far end: the selected tier is never faded out by the very device that is
  // there to say "there is more". It is also what gives the selected card's 4px
  // ring somewhere to be drawn — an `overflow-x-auto` box clips at its padding
  // edge, and at zero padding the ring was cut off along the card's left side.
  //
  // Unconditional rather than tracking `scrollLeft`, which is more machinery than
  // 1rem of gradient is worth on a strip that is also scrolled programmatically;
  // and switched off from `xl`, where nothing scrolls.
  'strip-edge-mask';

/** One tier card. Its border and fill come from the two constants below plus
 *  the tier config. Painted on the strip, which is painted on the drawer.
 *
 *  No fixed height: at a hard 256px the biggest tier had its last row of chips
 *  sliced by the card edge. The strip is a flex row, so leaving the height to
 *  the content makes every card as tall as the tallest for free. */
export const RIBBON_TIER_CARD =
  'clip-stable flex-shrink-0 w-[260px] xl:w-auto xl:min-w-0 min-h-[256px] snap-center relative overflow-hidden rounded-2xl border transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] flex flex-col group/card';

/** A tier card with no verb selected anywhere, or one that is not the selected
 *  verb's tier. Painted on the drawer.
 *
 *  It states a FILL and a shadow and no border colour, which is a change. It
 *  used to carry `border-slate-300 dark:border-white/5`, and the call site
 *  also applied the tier's own `border` on the five non-current cards — the
 *  "coloured border specific to the tier for visual cue" the render comment
 *  describes. Only one of those can win, and in the dark theme it was never
 *  the tier: `dark:border-white/5` compiles to `.dark .dark\:border-white\/5`
 *  at (0,2,0) and `border-red-500/50` is (0,1,0). Measured in Chromium, all
 *  five idle cards painted `rgba(255,255,255,0.05)` — one grey, six tiers. In
 *  the LIGHT theme the tier colour landed all along, because the config's
 *  `light:border-red-600` and the neutral `border-slate-300` are both (0,1,0)
 *  and the tier one is written later.
 *
 *  So the neutral goes rather than the tier, and the call site now applies the
 *  tier's border on every card in every state. The tier config supplies both
 *  themes itself (`border-red-500/50 light:border-red-600`), which is why
 *  removing the pair from here does not leave a colour with no partner. */
export const RIBBON_TIER_CARD_IDLE = 'bg-white shadow-sm dark:bg-white/[0.03] dark:shadow-none';

/** Added to the card whose tier the selected verb belongs to. Lifts it out of
 *  the strip; the tier's own border and wash arrive from the tier config, and
 *  its ring and glow arrive as one inline `box-shadow` in the tier's hex at
 *  the call site — the same way the staircase's lit column takes its glow, so
 *  the band palette stays the single source of the colour.
 *
 *  `tier-lift-current` and not a `scale-*` utility: `transform` is one property
 *  and `.clip-stable` on this card already claims it, so the utility would
 *  silently lose. The class holds the composed transform — and, since the
 *  measurement below, holds it at scale 1: a 5% lift overhung 6.5px each side
 *  and took the selected card's adjacent gaps to 9.5px against the row's 16px.
 *  See `index.css` for that, and for why the class stays rather than being
 *  deleted.
 *
 *  `border-2` here, 1px on the cards that are not current. That is the reverse
 *  of what shipped: `border-2` used to live on the five OTHER cards, so the
 *  selected card was the thin one and its header sat 1px higher than every
 *  other header in the row. Weight now marks the selection instead of
 *  contradicting it.
 *
 *  With the scale gone, the ring and the glow are the whole of the emphasis,
 *  which is what makes them worth drawing as a `box-shadow`: it paints outside
 *  the border box without displacing a single neighbour, so the row stays on
 *  one line.
 *
 *  It no longer carries `ring-4 ring-slate-900/10 dark:ring-white/5` or a 40px
 *  black drop shadow. The ring said "selected" without saying which tier — on
 *  a strip whose entire subject is six colour-coded tiers — and stacking a
 *  heavy black shadow under a coloured glow is two depth cues competing for
 *  one card. One tier-hued shadow lifts it and names it at the same time. */
export const RIBBON_TIER_CARD_CURRENT = 'tier-lift-current border-2 z-20';

/** Added to a card that is NOT the selected verb's tier, and to all six when
 *  no verb is selected. These cards hold 32 of the ribbon's 38 verb buttons,
 *  so everything on them stays clickable and stays in the tab order — and a
 *  control a keyboard user can reach has to be legible.
 *
 *  Nothing here dims any more, which is why it is no longer called DIMMED.
 *  The history is worth keeping because it took three passes to land:
 *  `opacity-50 light:opacity-70` took the card subtitle to a measured 2.72:1;
 *  `opacity-90` cost about 5% and left it AT the floor rather than above it,
 *  and the comment that shipped it said the real de-emphasis was carried by
 *  `scale-90` and the tier border. Half of that was untrue — `scale-90` never
 *  applied (see `.tier-lift` in `index.css`) — so `opacity-90` was in practice
 *  the only de-emphasis, doing it in the one currency this component has spent
 *  three fixes learning not to spend.
 *
 *  It is now carried entirely by colour and weight: the current card takes the
 *  tier's ring, glow and 2px border, and these take 1px and no shadow. Every
 *  reading inside them is at its own full contrast, so the e2e sweep no longer
 *  composites an ancestor opacity into 32 buttons' worth of text.
 *
 *  `tier-lift` gives them the hover the old `hover:scale-95` was written to
 *  give and, being the one scale utility that actually fired, delivered
 *  backwards: with idle cards at 1 rather than 0.9 it shrank a hovered card
 *  and dropped its top 7.88px. */
export const RIBBON_TIER_CARD_RECEDED = 'tier-lift z-0';

/** A tier card's header, which is the "select this tier" control. The card
 *  cannot be a button itself — the verb chips inside it are buttons already —
 *  so the shortcut lives on the header. Painted on the tier's own fill, or on
 *  the tier gradient when it is the current tier.
 *
 *  It used to end `focus-visible:outline-none focus-visible:ring-white/50`,
 *  which suppressed the app-wide accent outline and replaced it with white
 *  alpha on `light:bg-amber-100`, `light:bg-green-100` and so on — white on
 *  amber-100 is not a ring, it is nothing, so a keyboard user in the light
 *  theme could not see which tier card had focus. The ring is now drawn inset,
 *  in a pair: the global outline (`index.css`) is the app's one focus
 *  treatment, but it is drawn OUTSIDE the button with a 2px offset, and the
 *  tier card that holds this header is `overflow-hidden` — it would be clipped
 *  away on three sides. Inset is the shape this particular button can wear. */
export const RIBBON_TIER_HEADER =
  'w-full text-left px-6 py-4 border-b relative flex items-center gap-4 flex-shrink-0 cursor-pointer transition-[filter] hover:brightness-110 ' +
  // From `xl`, where the six cards share the row at about 189px each, the
  // emoji stands above the name instead of beside it. Side by side, the name
  // had 90px — less than "REMEMBER" set in the display face — and a word that
  // cannot wrap was clipped mid-letter.
  'xl:flex-col xl:items-start xl:gap-2 xl:px-4 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900/40 dark:focus-visible:ring-white/60';

/** The header's fill on the five cards that are not the selected tier — a faint
 *  tint of the tier's own hue, from the `--band-rgb` property each card already
 *  carries (`.band-wash` in `index.css`).
 *
 *  It was the tier config's `bg`: `-100` in the light theme, which is a solid
 *  pastel. Six of them side by side, over a pink brief and under a saturated
 *  selected card, is what made the ladder read as a sweet shop beside a page of
 *  white panels. The hue is still on every card — in the tint, the title, the
 *  chips and the border — and the saturated fill is left to the ONE card the
 *  reader is meant to be looking at. Painted on the card. The rule beneath it is
 *  a pair because the card is a theme surface. */
export const RIBBON_TIER_HEADER_IDLE = 'band-wash border-slate-200 dark:border-white/5';

/** The icon tile in a tier card's header. It replaced a system emoji, which is
 *  the one thing in the workspace's chrome that is drawn by the operating system
 *  rather than by the app — a different picture on a school Chromebook, on a
 *  Mac and on a Windows laptop, in colours that belong to none of the six tiers.
 *  Every other panel in the workspace puts a line icon in a tile; the ladder now
 *  does too.
 *
 *  Structure only. The fill is `bg-white/25 border-white/30` on the selected
 *  card, which is a saturated tier gradient (the same colour in both themes, so
 *  white alpha is right as written — DesignSpec §2), and a pair on the others,
 *  which are theme surfaces; both arrive at the call site. */
export const RIBBON_TIER_ICON =
  'w-9 h-9 xl:w-8 xl:h-8 shrink-0 rounded-xl border flex items-center justify-center ' +
  'transition-transform duration-500 group-hover/card:scale-110';

/** "Band 3 ceiling", UNDER the tier's title.
 *
 *  It sat above the title as an eyebrow, which put the consequence before the
 *  thing it is a consequence OF: a reader scanning six cards met "Band 1
 *  ceiling", "Band 2 ceiling", "Band 3 ceiling" down the row before any of the
 *  names that tell those numbers apart. The name leads now and the ceiling
 *  follows it, which is also the order the card is spoken in — "Define &
 *  Describe, Band 2 ceiling".
 *
 *  MONO, because it is the only thing in this header that is a figure.
 *  DesignSpec §4 gives JetBrains Mono to "marks, token counts, and system
 *  logs", and the ribbon's own scoreboard already sets its four numbers in it —
 *  so the face is not a new idea here, it is the one the ribbon uses whenever
 *  it states a number. It also puts the widest possible daylight between this
 *  line and the tracked-out Inter caps directly above it: different family,
 *  different weight, different case, no slant. Two lines that were both set in
 *  the same caps read as one two-line title rather than as a name and its
 *  annotation.
 *
 *  It used to add `opacity-60` on the five idle cards, and that was the whole
 *  of its contrast problem: `text-purple-900` on `bg-purple-100` is about 9:1
 *  and measured **2.97:1** through the opacity, on a card that is also dimmed
 *  to 90%. Dimming is a colour decision here rather than an opacity one — see
 *  `RIBBON_TIER_HEADER_LABEL_IDLE`. */
export const RIBBON_TIER_HEADER_LABEL =
  'font-mono text-xs font-medium tracking-tight block mt-1 truncate';

/** The dimmed step for the ceiling on the five cards that are not selected.
 *
 *  It carried the tier's own `text` colour, the same one the title above it
 *  carries, so the name and its annotation were the same hue at the same
 *  strength and only the face told them apart. This drops it to the muted pair
 *  the card's own subtitle already uses two lines below — `slate-600` rather
 *  than `slate-500` for the reason recorded on `RIBBON_TIER_SUBTITLE_IDLE`:
 *  measured in the browser, slate-500 reads 3.91:1 under the card's `opacity-90`
 *  and slate-600 reads 5.8:1.
 *
 *  The CURRENT card is deliberately not dimmed. Its header is a saturated tier
 *  gradient, where the only ways down from `solidText` are an alpha that reads
 *  differently on every one of the six fills and an opacity DesignSpec §2 rule 3
 *  keeps off readings — and tier 3's yellow has already caught this codebase
 *  twice. It is also the one card the reader is meant to be reading. There, the
 *  mono face and the weight do the separating on their own. */
export const RIBBON_TIER_HEADER_LABEL_IDLE =
  'text-slate-600 dark:text-[rgb(var(--color-text-muted))]';

/** The tier's title — the names the six cards are actually told apart by, so it
 *  leads the header, in the tracked-out caps the app gives a section's name
 *  everywhere else. The card IS a section of the ladder, and the six names are
 *  its headings.
 *
 *  Built from `.t-display` and the three utilities rather than from
 *  `.t-section`, which is the same voice at a fixed 12px and 0.16em. Those two
 *  numbers are right for a panel's name sitting alone on a row; here the line
 *  is a heading in a 260px card with an annotation under it, and at 0.16em the
 *  tracking was spending on air the width the WORDS needed — four of the six
 *  names went to two lines and "Remember & List" only just held one.
 *  `.t-section` sets its own size and wins the cascade over a `text-*` utility
 *  (see the note above `.t-label` in index.css), so it cannot be adjusted from
 *  a call site; `.t-display` carries only the face and the 900 weight, which is
 *  exactly the half worth sharing. Same voice, sized for this row.
 *
 *  It WRAPS, where it once truncated: most of the six do not fit on one line at
 *  260px however it is set, and the strip used to show "Discuss, Assess & Jus…"
 *  and "Evaluate, Synthesise &…" — the one line that tells these six cards
 *  apart, ellipsised, at the top of the card.
 *
 *  Clamped at THREE, which is what the longest actually needs. Two was measured
 *  at the 12px this line used to be and kept when the size went up, where it
 *  put the ellipsis straight back on "Evaluate, Synthesise & Create" — and the
 *  check that should have caught it only compared `scrollWidth`, which a
 *  vertical clamp never trips. Tracking cannot buy the line back either: the
 *  break is word-driven, and 0.02em through 0.06em all need the same three
 *  lines. So the block's floor takes the third line instead, which the cards
 *  can afford — they already end in empty space below their chips. */
export const RIBBON_TIER_HEADER_TITLE =
  't-display uppercase italic text-sm tracking-[0.06em] leading-tight line-clamp-3';

/** The floor under the title-and-ceiling block, so a tier whose name wraps does
 *  not stand its header — and with it the subtitle and every chip below — out
 *  of step with the five beside it.
 *
 *  Three title lines, the gap, and the ceiling: 4.6rem. It is sized to the
 *  LONGEST name rather than the common case, because the whole job of this
 *  floor is that one card cannot push its own header out of line — and a floor
 *  that only fits five of the six names is a floor that does not do it. */
export const RIBBON_TIER_HEADER_TEXT =
  'min-w-0 min-h-[4.6rem] xl:min-h-[5rem] xl:w-full flex flex-col justify-center';

/** What the tier asks of the writer, under its header. Painted on the tier
 *  card body. */
export const RIBBON_TIER_SUBTITLE =
  'px-6 xl:px-4 pt-3 text-[11px] font-medium leading-snug relative z-10';

/** The subtitle on the current tier's card, which is the one card the reader is
 *  meant to be reading. */
export const RIBBON_TIER_SUBTITLE_CURRENT =
  'text-slate-700 dark:text-[rgb(var(--color-text-primary))]';

/** The subtitle on the other five cards — the text A2 measured at 2.72:1.
 *
 *  `slate-600` rather than the `slate-500` it was, because opacity does not
 *  cost contrast the way the plan's arithmetic assumed: it composites the text
 *  TOWARDS the background, and the loss is far from linear. Measured in the
 *  browser: `slate-500` on the card reads 4.81:1 at rest and **3.91:1** under
 *  `opacity-90`, still under the 4.5 floor — `opacity-95` would only reach
 *  4.34:1. `slate-600` under the same dimming measures 5.8:1. The dark theme
 *  keeps its muted token, which is not dimmed against a near-black card in the
 *  same way. */
export const RIBBON_TIER_SUBTITLE_IDLE = 'text-slate-600 dark:text-[rgb(var(--color-text-muted))]';

/** One verb chip. The selected/unselected fills are the tier config's, at the
 *  call site. Painted on the tier card body. */
export const RIBBON_VERB_CHIP = 't-label px-3 py-1.5 rounded-xl border transition-all duration-300';
