/**
 * The command verb ribbon's class vocabulary, in the same shape as
 * `utils/headerChrome.ts`, `utils/cardChrome.ts` and `utils/panelStyles.ts`.
 *
 * This file holds the ribbon's THEME-NEUTRAL CHROME only. Everything
 * tier-coloured stays interpolated from `getTierScaleConfig(tier)` at the call
 * site: baking six tiers into constants here would duplicate
 * `utils/renderUtils.ts`, which is pinned by `tests/unit/bandColors.test.ts` and
 * shared by a dozen other surfaces. So a rendered `className` in this component
 * is one of these constants plus a tier config's strings, and the tier config
 * is written in the older `light:` idiom on purpose — it is not being migrated.
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

/** The ribbon's outermost box. Painted on the page background, full page width
 *  and flush with the column — see the comment at the call site for why it
 *  carries no rail gutter. */
export const RIBBON_ROOT =
  'clip-stable relative overflow-hidden transition-all duration-700 ease-out animate-fade-in';

/** The header bar, which is also the disclosure toggle. Painted on the page
 *  background and `AnimatedBackground` beneath it.
 *
 *  It used to be a full-bleed tier gradient — a wall, in a glass app, and the
 *  reason everything on it had to be white: white text, a white-alpha tile, a
 *  white-alpha chip. On tier 3 that white text sat on yellow at 1.9:1. The tier
 *  still colours the ribbon; it does it from a 36px tile and a 2px underline
 *  instead, which is `HEADER_HAIRLINE`'s argument transposed — edge-lighting
 *  rather than a wall.
 *
 *  The height is LOCKED — `min-h` against shrinking, `whitespace-nowrap` and
 *  `truncate` on the pieces below against growing — and
 *  `tests/unit/commandVerbHierarchy.test.tsx` pins it. Every geometry token
 *  here is unchanged from the gradient version. */
export const RIBBON_HEADER_BAR =
  'w-full px-0 py-3 sm:py-3.5 min-h-[60px] sm:min-h-[64px] flex items-center justify-between gap-3 ' +
  'relative z-10 overflow-hidden rounded-xl transition-colors duration-500 group/header ' +
  'text-slate-900 dark:text-white ' +
  'bg-white/60 hover:bg-white/80 backdrop-blur-xl ' +
  'dark:bg-[rgb(var(--color-bg-surface))]/40 dark:hover:bg-[rgb(var(--color-bg-surface))]/60';

/** Edge-lighting under the bar, and where the tier colour went. Painted on the
 *  bar's own bottom edge; the gradient itself is the tier config's and is
 *  interpolated at the call site. Rendered only when a verb is selected — with
 *  none there is no tier to state. */
export const RIBBON_TIER_UNDERLINE =
  'absolute inset-x-0 bottom-0 h-0.5 pointer-events-none bg-gradient-to-r';

/** The 36px icon tile at the head of the bar, and the other half of where the
 *  tier colour went. Its fill is interpolated at the call site: the tier's
 *  `solidBg` and `solidText` when a verb is selected — the pairing
 *  `getBandConfig` exists to provide, and the reason it is not `text-white`,
 *  which tier 3's yellow reads at 1.9:1 — and a slate pair when none is. The
 *  border colour arrives with the fill, because `border-white/20` is right in
 *  both themes on a solid tier fill (§2) and wrong on the slate one. Painted on
 *  the bar. */
export const RIBBON_HEADER_TILE =
  'w-9 h-9 shrink-0 rounded-xl flex items-center justify-center border shadow-md group-hover/header:scale-110 transition-transform';

/** "HSC Command Verb Hierarchy". Truncates rather than wraps: an ellipsis on a
 *  title the reader already knows costs nothing, a second line costs the height
 *  lock. Painted on the bar. */
export const RIBBON_HEADER_TITLE =
  'text-sm sm:text-base font-black tracking-tight leading-none truncate';

/** "Reference • 6 cognitive tiers", under the title. Painted on the bar. */
export const RIBBON_HEADER_SUBLABEL = 't-label block truncate text-slate-500 dark:text-slate-400';

/** The word "Selected:" before the chip. `whitespace-nowrap` is half of the
 *  height lock. Painted on the bar. */
export const RIBBON_SELECTED_LABEL = 't-label whitespace-nowrap text-slate-500 dark:text-slate-400';

/** The chip carrying the selected verb. `whitespace-nowrap` is the other half
 *  of the height lock — DIFFERENTIATE is thirteen characters.
 *
 *  Structure only now. Its `bg-white/20 border-white/30` was correct while the
 *  bar was a gradient and would be a smudge on glass, so the colour comes from
 *  the tier config at the call site — the same wash the detail card wears. */
export const RIBBON_SELECTED_CHIP =
  't-label px-2.5 py-0.5 rounded-lg whitespace-nowrap border shadow-sm';

/** The chevron's round chip at the far end of the bar. Already a pair, because
 *  it is the one thing in the bar that has to read on both a tier gradient and
 *  the neutral no-verb fill. */
export const RIBBON_CHEVRON_CHIP =
  'w-7 h-7 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center border border-slate-900/10 dark:border-white/10 transition-transform duration-500';

/** The active verb's detail card. Its `border` and `bg` come from the tier
 *  config at the call site. Painted on the page background. */
export const RIBBON_DETAIL_CARD =
  'clip-stable relative overflow-hidden rounded-2xl p-5 border shadow-lg animate-fade-in-up transition-all duration-500 group/hero';

/** The verb itself, in the house display treatment. Painted on the detail
 *  card's tier wash. */
export const RIBBON_DETAIL_TERM =
  'text-3xl font-black tracking-normal uppercase italic leading-none text-slate-900 dark:text-white';

/** The tier chip beside the verb. Its colours come from the tier config.
 *  Painted on the detail card. */
export const RIBBON_DETAIL_TIER_CHIP = 't-label px-3 py-0.5 rounded-full border shadow-sm';

/** The verb's definition. Painted on the detail card. The `opacity-90` it used
 *  to carry was softening white-on-gradient text; on a tier wash it only cost
 *  contrast. */
export const RIBBON_DETAIL_DEFINITION =
  'text-sm font-bold max-w-xl leading-relaxed text-slate-700 dark:text-[rgb(var(--color-text-secondary))]';

/** The `StrategyTip`'s accent under the definition — its bullet markers and its
 *  term chips. Painted on the detail card's tier wash, and on the pale chip fill
 *  inside it, which is why it is `slate-600` and not the `slate-500` it was: on
 *  `slate-100` over a tier wash, `slate-500` is within a tenth of the floor. */
export const RIBBON_DETAIL_TIP_ACCENT = 'text-slate-600 dark:text-[rgb(var(--color-text-muted))]';

/** The four-stat tray on the right of the detail card. Painted on the detail
 *  card's tier wash. */
export const RIBBON_STAT_TRAY =
  'flex items-center gap-4 px-5 py-3 rounded-2xl backdrop-blur-md self-stretch md:self-auto ' +
  'justify-center shadow-inner flex-wrap ' +
  'bg-slate-100 border border-slate-200 dark:bg-black/20 dark:border-white/10';

/** "Marks", "Band Cap", "Time", "Terms". Painted on the tray. */
export const RIBBON_STAT_LABEL = 't-label mb-0.5 text-slate-600 dark:text-slate-400';

/** The number under each label; its colour is the tier's. Painted on the
 *  tray.
 *
 *  Mono, because these four are telemetry: DesignSpec §4 gives `JetBrains Mono`
 *  to "marks, token counts, and system logs", and marks are the first example in
 *  that sentence. `tabular-nums` because the four sit in a fixed-width tray and
 *  a two-digit mark range must not shove its neighbours along. */
export const RIBBON_STAT_VALUE = 'font-mono text-lg font-black tabular-nums';

/** The one line under the tray, saying in words what "Band Cap" means. Painted
 *  on the detail card's tier wash, not on the tray.
 *
 *  It was a `title` on a `<div>` with no `tabindex`, so the explanation of the
 *  one label a student will not already know was unreachable by keyboard and
 *  absent on touch. */
export const RIBBON_STAT_CAPTION =
  'text-[10px] font-bold leading-snug text-center md:text-right text-slate-600 dark:text-slate-400';

/** The hairline between two stats. Painted on the tray. */
export const RIBBON_STAT_DIVIDER = 'w-px h-8 bg-slate-300 dark:bg-white/10';

/** The horizontal tier strip. Six 260px cards plus gaps is ~1580px, so it
 *  overflows at nearly every width. Painted on the page background.
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
  'flex overflow-x-auto gap-4 pb-4 pt-2 snap-x snap-proximity scrollbar-hide';

/** The two edge fades over the strip, one per side, in the wrapper that until
 *  now held nothing but a `relative`. `scrollbar-hide` takes away the only
 *  signal that there is more to the right, and nothing replaced it — no fade,
 *  no arrows, no count — on a strip that overflows at nearly every width.
 *
 *  Unconditional rather than tracking `scrollLeft`: a scroll listener on a
 *  strip that is also scrolled programmatically is more machinery than eight
 *  pixels of gradient is worth, and a fade at an edge that happens to be flush
 *  costs nothing to look at.
 *
 *  `slate-50` is not a guess at "white": the page behind the strip measures
 *  rgb(248, 250, 252) in the light theme, which is `--color-bg-base` exactly,
 *  and a white fade on it would read as a pale smear rather than as depth. The
 *  dark side takes the token directly.
 *
 *  `z-10` puts them over the five idle cards but under the current one, which
 *  carries `z-20` — fading out the card the reader is being pointed at would
 *  be the wrong way round. Painted on the page background. */
const RIBBON_STRIP_FADE =
  'absolute top-0 bottom-4 w-8 z-10 pointer-events-none to-transparent ' +
  'from-slate-50 dark:from-[rgb(var(--color-bg-base))]';
export const RIBBON_STRIP_FADE_LEFT = `${RIBBON_STRIP_FADE} left-0 bg-gradient-to-r`;
export const RIBBON_STRIP_FADE_RIGHT = `${RIBBON_STRIP_FADE} right-0 bg-gradient-to-l`;

/** One tier card. Its border and fill come from the two constants below plus
 *  the tier config. Painted on the strip.
 *
 *  No fixed height: at a hard 256px the biggest tier had its last row of chips
 *  sliced by the card edge. The strip is a flex row, so leaving the height to
 *  the content makes every card as tall as the tallest for free. */
export const RIBBON_TIER_CARD =
  'clip-stable flex-shrink-0 w-[260px] min-h-[256px] snap-center relative overflow-hidden rounded-2xl border transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] flex flex-col group/card';

/** A tier card with no verb selected anywhere, or one that is not the selected
 *  verb's tier. Painted on the page background. */
export const RIBBON_TIER_CARD_IDLE =
  'bg-white border-slate-300 shadow-sm dark:bg-white/[0.03] dark:border-white/5 dark:shadow-none';

/** Added to the card whose tier the selected verb belongs to. Lifts it out of
 *  the strip; the tier's own border and wash arrive from the tier config. */
export const RIBBON_TIER_CARD_CURRENT =
  'scale-110 z-20 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.5)] opacity-100 ring-4 ring-slate-900/10 dark:ring-white/5';

/** Added to the five cards that are NOT the selected verb's tier. These cards
 *  still hold 32 of the ribbon's 38 verb buttons, so whatever this dims stays
 *  clickable and stays in the tab order — and a control a keyboard user can
 *  reach and click has to be legible.
 *
 *  It was `opacity-50 light:opacity-70`, which took the card subtitle
 *  (`slate-500` on white, 4.76:1 at rest) to a measured 2.72:1. `opacity-90`
 *  costs about 5% of contrast and leaves it at the floor; the de-emphasis is
 *  carried by `scale-90` and the tier border, which are already here. One
 *  value for both themes — the split was the wrong shape of fix. */
export const RIBBON_TIER_CARD_DIMMED =
  'scale-90 opacity-90 hover:opacity-100 hover:scale-95 border-2';

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
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900/40 dark:focus-visible:ring-white/60';

/** "Band 3 ceiling", above the tier's title. Painted on the tier card header,
 *  in the tier's own `text` colour — or, on the current card, in the `solidText`
 *  it inherits from the header itself.
 *
 *  It used to add `opacity-60` on the five idle cards, and that was the whole
 *  of its contrast problem: `text-purple-900` on `bg-purple-100` is about 9:1
 *  and measured **2.97:1** through the opacity, on a card that is also dimmed to
 *  90%. The tier `text` tokens are already the darkest step the shared config
 *  offers (`-900`), so there was nothing left to darken — the opacity had to go.
 *  The eyebrow still reads as an eyebrow: ten pixels against the title's
 *  fourteen, with 0.2em of tracking doing the rest. */
export const RIBBON_TIER_HEADER_LABEL = 't-label block mb-0.5 truncate';

/** The tier's title. Painted on the tier card header. */
export const RIBBON_TIER_HEADER_TITLE = 'text-sm font-black truncate tracking-tight';

/** What the tier asks of the writer, under its header. Painted on the tier
 *  card body. */
export const RIBBON_TIER_SUBTITLE = 'px-6 pt-3 text-[11px] font-medium leading-snug relative z-10';

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

/** The one line of text above the spectrum, which says in words what the
 *  spectrum says in colour (DesignSpec §2: colour is never the only signal).
 *  Painted on the page background.
 *
 *  This is the whole line and the box the height lock sits on; the live region
 *  inside it is the lede only (the tier and its band cap), because a `status`
 *  re-announces its entire content on every change.
 *
 *  Two earlier statements here have since stopped being true and are corrected
 *  rather than deleted, because the reasoning still matters:
 *
 *  1. This constant used to record four hand-written labels — `Basic Recall`,
 *     `Explain & Compare`, `Analyse & Apply`, `Evaluate & Create` — as
 *     "span labels … none of them derivable". They were not span labels. Two
 *     are byte-identical to `TIER_GROUPS[2].title` and `TIER_GROUPS[3].title`
 *     and the other two are paraphrases of `TIER_GROUPS[0].title` and
 *     `TIER_GROUPS[5].title`, so the row was four TIER titles — tiers 1, 3, 4
 *     and 6 — laid out by `justify-between`, which put none of them over the
 *     tier it named. They are derivable, and `RIBBON_SPECTRUM_SCALE_RAIL` now
 *     derives them: those four tiers are the floor, the two sides of the Deep
 *     Learning Threshold and the ceiling, so the rail names the two SPANS they
 *     bound rather than the four rungs.
 *
 *  2. The line no longer carries the tier's prose subtitle. Its tail is
 *     `RIBBON_TIMELINE_CUE_SIDE` — which side of the threshold the reader's
 *     tier falls on, 32 characters of structure in place of 44–96 of prose.
 *     The subtitle was never the only copy: `RIBBON_TIER_SUBTITLE` renders it
 *     on the tier card, a sibling under the same `inert`-gated panel.
 *
 *  Height-locked all the same. `line-clamp-2` and a two-line floor are what
 *  keep the footer from stepping up and down between questions, and the cue
 *  still wraps to two lines at narrow widths.
 *
 *  `mb-7` and not `mb-5`: the Deep Learning Threshold chip hangs ABOVE the dot
 *  row, into the space this margin opens, and between roughly 640px and 900px
 *  the cue is two full lines while the chip is already visible (it is
 *  `hidden sm:block`). At `mb-5` the chip's pill overlapped the cue's box by
 *  4px and cleared its second line of text by 8px, which is close enough that
 *  the chip read as the end of the sentence. Measured at 640/720/800/900:
 *  `mb-6` leaves 12px of clear air under the text, `mb-7` leaves 16px, and at
 *  1400px — where the cue is one line — neither shows as slack, because the
 *  height lock has already reserved the second line.
 *
 *  `text-slate-600`, not `slate-500`: measured on this background, `slate-500`
 *  is 4.66:1 — the narrowest margin anywhere in this component. */
export const RIBBON_TIMELINE_CUE =
  'min-h-[2.25rem] line-clamp-2 px-1 mb-7 text-[11px] font-medium leading-snug ' +
  'text-slate-600 dark:text-[rgb(var(--color-text-muted))]';

/** The tier fragment of the cue line. Carries no colour of its own — the tier's
 *  `text` token is interpolated at the call site, the way everything
 *  tier-coloured in this component is. Painted on the page background. */
export const RIBBON_TIMELINE_CUE_TIER = 't-label';

/** The band-cap fragment of the cue line. Set in the telemetry face per
 *  DesignSpec §4 — a band number is a mark, and `RIBBON_STAT_VALUE` already
 *  sets the same number in mono six inches above. Painted on the page
 *  background. */
export const RIBBON_TIMELINE_CUE_BAND =
  't-label font-mono tabular-nums' + 'text-slate-700 dark:text-slate-300';

/** The timeline's progress track — the unlit ground the spectrum is painted
 *  on, and the box that clips it. Painted on the page background.
 *
 *  `h-3`, not `h-2`: eight pixels is too thin to read a six-colour spectrum in.
 *  A visual judgement, stated as one. `mb-4` moved to the wrapper, which is
 *  what the leading edge and the ignition flare are positioned against — both
 *  must be free of this box's `overflow-hidden` or the clip eats the very bloom
 *  they exist to draw. */
export const RIBBON_TIMELINE_TRACK =
  'relative h-3 bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden';

/** The whole cognitive journey, unlit — every tier's colour at low opacity
 *  across the full width, so the tiers a reader has not reached yet read as
 *  *ahead of them* rather than as empty track. Its gradient is built from
 *  `getBandHex(1…6)` in the component, never from literals: the band palette is
 *  a single source of truth (`bandColors.test.ts`) and a fourth hard copy of it
 *  is exactly what this redesign deleted. Painted on the track. */
export const RIBBON_SPECTRUM_DORMANT =
  'absolute inset-0 opacity-25 dark:opacity-40 pointer-events-none';

/** The same spectrum at full strength, revealed as far as the reader's tier.
 *
 *  Revealed with `clip-path: inset()`, never with `width`. A percentage width
 *  on a gradient element rescales the gradient into that width, so at tier 3
 *  all six colours would be squeezed into half a bar and every colour would
 *  move as the tier changed. `inset()` clips a full-width gradient: a given
 *  colour sits at a given x for every tier. Animatable and GPU-composited.
 *  Painted on the track, over the dormant layer. */
export const RIBBON_SPECTRUM_LIT =
  'absolute inset-0 pointer-events-none ' +
  'transition-[clip-path] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]';

/** The lit edge — the playhead that turns "a coloured bar" into "lit this far".
 *  Its glow is the tier's own hex, inline, so it stays derived from the band
 *  palette. Painted over the track, and deliberately outside it: `clip-path`
 *  and `overflow-hidden` both clip a box-shadow.
 *
 *  A theme pair rather than `bg-white/90`: white alpha over the pale light-theme
 *  spectrum is DesignSpec §2 rule 2, and it disappears. `left` is not
 *  compositor-promoted; accepted for one 2px element that transitions once per
 *  question change, and written down rather than hidden. */
export const RIBBON_SPECTRUM_EDGE =
  'absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full pointer-events-none z-10 ' +
  'transition-[left] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ' +
  'bg-slate-900/70 dark:bg-white';

/** The one-shot bloom over the band just reached, keyed on the tier so React
 *  remounts it and it replays. Its fill is the tier's own hex, inline. Painted
 *  over the track, outside its clip so the flare can bloom past the bar. */
export const RIBBON_SPECTRUM_IGNITION =
  'absolute inset-y-0 rounded-sm pointer-events-none z-10 origin-center';

/** The same ignition on the current step's dot, one bloom out of the circle.
 *  Its fill is the tier's `solidBg` at the call site, and it is keyed on the
 *  tier so it replays with the band's flare. Painted over the dot.
 *
 *  It carries `animate-dot-bloom` and not the spectrum's `animate-tier-ignite`:
 *  that flare stretches 2.4x vertically and not at all horizontally, which is
 *  right for a bar segment and draws a vertical teardrop on anything
 *  `rounded-full`. `dotBloom` scales uniformly, so the halo stays a circle.
 *  It replaces an `animate-ping`, which was `1s … infinite` on a strip that is
 *  mounted for the whole session. */
export const RIBBON_SPECTRUM_DOT_BLOOM =
  'absolute inset-0 rounded-full pointer-events-none animate-dot-bloom';

/** One of the five boundaries between six tiers, at `i/6`. These replace four
 *  "measurement ticks" that sat at 16/38.7/61.3/84% — a `justify-between` with
 *  `px-[16%]` — and so marked nothing at all, with no tick at the 50% the Deep
 *  Learning Threshold crosses.
 *
 *  Painted in the page's own background colour on top of the track, so they
 *  read as physical gaps cut into the spectrum rather than as lines drawn over
 *  it. Width comes from the call site: the 3/4 boundary is wider, because it is
 *  the threshold. */
export const RIBBON_SPECTRUM_BOUNDARY =
  'absolute inset-y-0 -translate-x-1/2 pointer-events-none ' +
  'bg-slate-50 dark:bg-[rgb(var(--color-bg-base))]';

/** The scale rail above the spectrum — the two spans the Deep Learning
 *  Threshold divides the ladder into. Painted on the page background.
 *
 *  `absolute`, and that is the whole vertical budget: the threshold chip hangs
 *  from the dot row at `-top-11`, which puts it about 16px above the track —
 *  inside the air `RIBBON_TIMELINE_CUE`'s `mb-7` already reserves for it. The
 *  chip occupies the middle of that band and the two ends of it are empty, so
 *  this row costs the footer no height at all.
 *
 *  `-top-6` and not `-top-5`, measured rather than reasoned: at `-top-5` the
 *  captions' centre line sat 4.3px below the chip's at every width from 640 to
 *  1400, which is enough to read as two rows rather than one. `-top-6` brings
 *  it to 0.2px.
 *
 *  `hidden sm:flex`, the same floor as the chip it sits beside and as
 *  `RIBBON_TIMELINE_STEP_LABEL_IDLE`: below `sm` there is no room for either,
 *  and naming a threshold whose marker is hidden points at nothing.
 *
 *  Flush to the track's own edges (`inset-x-0`, no padding), so the left
 *  caption starts where the spectrum starts. */
export const RIBBON_SPECTRUM_SCALE_RAIL =
  'hidden sm:flex absolute inset-x-0 -top-6 items-baseline justify-between ' +
  'pointer-events-none';

/** One span's caption. Painted on the page background, in the tone
 *  `RIBBON_TIMELINE_STEP_LABEL_IDLE`'s contrast fix measured at 7.24:1 — this
 *  is the same text on the same background at nearly the same size, so it takes
 *  the same pair rather than a fresh guess. Not `aria-hidden`: `contrast.ts`
 *  skips everything inside an `aria-hidden` subtree, and hiding a new block of
 *  text from the audit is the blind spot that let this component's three
 *  contrast defects ship in the first place. */
export const RIBBON_SPECTRUM_SCALE_SPAN =
  't-label whitespace-nowrap' + 'text-slate-600 dark:text-slate-400';

/** The band-cap fragment of a span caption — the number the leap across the
 *  threshold is measured in. Set in the telemetry face per DesignSpec §4, like
 *  `RIBBON_TIMELINE_CUE_BAND` and `RIBBON_STAT_VALUE`. Its colour is the
 *  adjoining tier's and is interpolated at the call site, the way everything
 *  tier-coloured in this component is. Shown from `md`: measured in Chromium,
 *  the captions grow from 131px to 245px when this fragment appears, which at
 *  768px still leaves 21px and 24px of air either side of the threshold chip.
 *  Painted on the page background. */
export const RIBBON_SPECTRUM_SCALE_BAND = 'hidden md:inline font-mono font-black tabular-nums';

/** The cue's tail — which side of the Deep Learning Threshold the reader's tier
 *  falls on. It replaces the tier's full prose subtitle, which ran 44–96
 *  characters; this is 32. Carries no colour, so it inherits the cue's own.
 *  Painted on the page background, and deliberately OUTSIDE the live region,
 *  like the subtitle it replaces: it is the same string for three tiers running
 *  and a `status` re-announces everything it contains. */
export const RIBBON_TIMELINE_CUE_SIDE = 'hidden sm:inline font-normal';

/** One step's dot on the timeline. Its fill is the tier's `solidBg` once the
 *  reader has reached that step. Painted on the page background. */
export const RIBBON_TIMELINE_DOT =
  'w-4 h-4 rounded-full border-2 transition-all duration-500 relative';

/** A timeline step's label, under its dot. Painted on the page background. */
export const RIBBON_TIMELINE_STEP_LABEL = 't-label sm:tracking-widest transition-all duration-300';

/** The five steps that are not the reader's current tier. On phones six tracked
 *  labels collide, so only the current one keeps its label below `sm`.
 *
 *  It was `text-slate-500 … opacity-70`, measured at **2.66:1** on the page
 *  background against a 4.5 floor. Both halves had to move: `slate-500` at full
 *  strength is only 4.66:1 here — the least margin anywhere in this component —
 *  and `slate-600` still composites to about 3.4:1 through `opacity-70`, because
 *  opacity pulls the text towards its background rather than scaling the ratio.
 *  So the opacity goes and the tint darkens, and the hover lift that the opacity
 *  used to provide is done with colour instead. */
export const RIBBON_TIMELINE_STEP_LABEL_IDLE =
  'hidden sm:block text-slate-600 dark:text-slate-400 ' +
  'group-hover/step:text-slate-900 dark:group-hover/step:text-white';

/** The "Deep Learning Threshold" marker between tiers 3 and 4. Painted on the
 *  page background, in its own surface-coloured pill.
 *
 *  Its `text-slate-400` measured **2.56:1** on that pill in the light theme — a
 *  dark-theme tone reused on white, which is the exact mistake the light-theme
 *  suite exists to catch, and it went unseen because until now the suite had
 *  never rendered this component.
 *
 *  The fill is written as the pair it has always resolved to rather than as the
 *  bare token it used to be: `--color-bg-surface` is `255 255 255` under
 *  `[data-theme="light"]`, so `bg-white` is the same white it was already
 *  painting, and saying it out loud is what lets the parity sweep read this
 *  constant at all. */
export const RIBBON_TIMELINE_THRESHOLD_CHIP =
  't-label hidden sm:block px-2 py-0.5 rounded-full' +
  'border shadow-sm whitespace-nowrap mb-2 transform -translate-y-1/2 ' +
  'bg-white text-slate-600 border-slate-300 ' +
  'dark:bg-[rgb(var(--color-bg-surface))] dark:text-slate-400 dark:border-white/10';
