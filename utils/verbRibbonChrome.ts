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

/** "Reference • 6 Bands", under the title. Painted on the bar. */
export const RIBBON_HEADER_SUBLABEL =
  'block truncate text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400';

/** The word "Selected:" before the chip. `whitespace-nowrap` is half of the
 *  height lock. Painted on the bar. */
export const RIBBON_SELECTED_LABEL =
  'text-[10px] font-black uppercase tracking-widest whitespace-nowrap text-slate-500 dark:text-slate-400';

/** The chip carrying the selected verb. `whitespace-nowrap` is the other half
 *  of the height lock — DIFFERENTIATE is thirteen characters.
 *
 *  Structure only now. Its `bg-white/20 border-white/30` was correct while the
 *  bar was a gradient and would be a smudge on glass, so the colour comes from
 *  the tier config at the call site — the same wash the detail card wears. */
export const RIBBON_SELECTED_CHIP =
  'px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap border shadow-sm';

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
  'text-3xl font-black tracking-tighter uppercase italic leading-none text-slate-900 dark:text-white';

/** The tier chip beside the verb. Its colours come from the tier config.
 *  Painted on the detail card. */
export const RIBBON_DETAIL_TIER_CHIP =
  'px-3 py-0.5 rounded-full border font-black text-[9px] uppercase tracking-widest shadow-sm';

/** The verb's definition. Painted on the detail card. The `opacity-90` it used
 *  to carry was softening white-on-gradient text; on a tier wash it only cost
 *  contrast. */
export const RIBBON_DETAIL_DEFINITION =
  'text-sm font-bold max-w-xl leading-relaxed text-slate-700 dark:text-[rgb(var(--color-text-secondary))]';

/** The `StrategyTip`'s accent under the definition. Painted on the detail
 *  card. */
export const RIBBON_DETAIL_TIP_ACCENT = 'text-slate-500 dark:text-[rgb(var(--color-text-muted))]';

/** The four-stat tray on the right of the detail card. Painted on the detail
 *  card's tier wash. */
export const RIBBON_STAT_TRAY =
  'flex items-center gap-4 px-5 py-3 rounded-2xl backdrop-blur-md self-stretch md:self-auto ' +
  'justify-center shadow-inner flex-wrap ' +
  'bg-slate-100 border border-slate-200 dark:bg-black/20 dark:border-white/10';

/** "Marks", "Band Cap", "Time", "Terms". Painted on the tray. */
export const RIBBON_STAT_LABEL =
  'text-[9px] uppercase tracking-widest font-black mb-0.5 text-slate-600 dark:text-slate-400';

/** The number under each label; its colour is the tier's. Painted on the
 *  tray. */
export const RIBBON_STAT_VALUE = 'text-lg font-black';

/** The hairline between two stats. Painted on the tray. */
export const RIBBON_STAT_DIVIDER = 'w-px h-8 bg-slate-300 dark:bg-white/10';

/** The horizontal tier strip. Six 260px cards plus gaps is ~1580px, so it
 *  overflows at nearly every width. Painted on the page background. */
export const RIBBON_STRIP =
  'flex overflow-x-auto gap-4 pb-4 pt-2 snap-x snap-mandatory scrollbar-hide';

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
 *  clickable and stays in the tab order. */
export const RIBBON_TIER_CARD_DIMMED =
  'scale-90 opacity-50 light:opacity-70 hover:opacity-100 hover:scale-95 border-2';

/** A tier card's header, which is the "select this tier" control. The card
 *  cannot be a button itself — the verb chips inside it are buttons already —
 *  so the shortcut lives on the header. Painted on the tier's own fill, or on
 *  the tier gradient when it is the current tier. */
export const RIBBON_TIER_HEADER =
  'w-full text-left px-6 py-4 border-b relative flex items-center gap-4 flex-shrink-0 cursor-pointer transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50';

/** "Band 3 ceiling", above the tier's title. Painted on the tier card header. */
export const RIBBON_TIER_HEADER_LABEL =
  'text-[10px] font-black uppercase tracking-[0.2em] block mb-0.5 truncate';

/** The tier's title. Painted on the tier card header. */
export const RIBBON_TIER_HEADER_TITLE = 'text-sm font-black truncate tracking-tight';

/** What the tier asks of the writer, under its header. Painted on the tier
 *  card body. */
export const RIBBON_TIER_SUBTITLE = 'px-6 pt-3 text-[11px] font-medium leading-snug relative z-10';

/** The subtitle on the current tier's card, which is the one card the reader is
 *  meant to be reading. */
export const RIBBON_TIER_SUBTITLE_CURRENT =
  'text-slate-700 dark:text-[rgb(var(--color-text-primary))]';

/** The subtitle on the other five cards. */
export const RIBBON_TIER_SUBTITLE_IDLE = 'text-slate-500 dark:text-[rgb(var(--color-text-muted))]';

/** One verb chip. The selected/unselected fills are the tier config's, at the
 *  call site. Painted on the tier card body. */
export const RIBBON_VERB_CHIP =
  'px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all duration-300';

/** The four span labels above the cognitive timeline. Painted on the page
 *  background. */
export const RIBBON_TIMELINE_LABEL =
  'text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest sm:tracking-[0.2em]';

/** The timeline's progress track. Painted on the page background. */
export const RIBBON_TIMELINE_TRACK =
  'relative h-2 bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden mb-4';

/** One gradation on the track. White-on-white in the light theme meant the
 *  track had no gradations there at all, so the same bar read as a measured
 *  scale in dark and a plain pill in light. Painted on the track. */
export const RIBBON_TIMELINE_TICK = 'w-px h-full bg-slate-400/50 dark:bg-white/20';

/** One step's dot on the timeline. Its fill is the tier's `solidBg` once the
 *  reader has reached that step. Painted on the page background. */
export const RIBBON_TIMELINE_DOT =
  'w-4 h-4 rounded-full border-2 transition-all duration-500 relative';
