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

/** The ribbon's outermost box, ON TOP OF `PANEL_SURFACE` (`utils/panelStyles.ts`),
 *  which the call site adds. Painted on the page background.
 *
 *  The ribbon is a reference panel, the same kind of object as the accordions
 *  under the writing area — "What's assessed", "Syllabus terms", "Marking
 *  guide" — and until now it was the one that did not look like it. It had its
 *  own bar, its own hairlines above and below, a different title voice and a
 *  chevron in a circle, and when it opened its contents floated on the page
 *  with no surface behind them. Everything in a workspace that is reference
 *  material takes the one surface and the one header, so a new panel joins the
 *  set by importing a constant rather than by being drawn again.
 *
 *  What stays the ribbon's own is below the header: the verb brief, the tier
 *  ladder and the spectrum. They are the reason it is not an accordion. */
export const RIBBON_ROOT = 'relative animate-fade-in';

/** The header row, which is also the disclosure toggle. Painted on the panel.
 *
 *  It takes `PANEL_ROW_MIN_H` and the panel's open and closed header tones at
 *  the call site, so it stands on the same whole pixel as every accordion beside
 *  it — those rows read as a grid whether or not anyone designed one, and a
 *  60px bar among 61px rows was exactly the kind of break `panelStyles` records.
 *
 *  The height is still LOCKED, and it still takes both halves: `min-h` against
 *  shrinking, and `whitespace-nowrap` / `truncate` on the pieces below against
 *  growing. `tests/unit/commandVerbHierarchy.test.tsx` pins it. A long verb —
 *  DIFFERENTIATE is thirteen characters — must not widen the chip, squeeze the
 *  title and take it to a second line; nothing in the ribbon's chrome should move
 *  when the question changes. */
export const RIBBON_HEADER_BAR =
  'w-full py-3.5 px-4 sm:px-5 flex items-center justify-between gap-3 text-left relative ' +
  'transition-colors duration-300 group/header';

/** The 32px icon tile at the head of the bar — the accordions' tile, and where
 *  the tier colour lives while the panel is shut. Its fill is interpolated at the
 *  call site: the tier's `solidBg` and `solidText` when a verb is selected — the
 *  pairing `getBandConfig` exists to provide, and the reason it is not
 *  `text-white`, which tier 3's yellow reads at 1.9:1 — and the accordions'
 *  neutral well when none is. The border colour arrives with the fill, because
 *  `border-white/20` is right in both themes on a solid tier fill (§2) and wrong
 *  on the neutral one. Painted on the bar. */
export const RIBBON_HEADER_TILE =
  'w-8 h-8 shrink-0 rounded-xl flex items-center justify-center border shadow-sm transition-colors duration-500';

/** "HSC Command Verb Hierarchy" — the panel's NAME, so it takes the section
 *  voice every accordion title takes, with the open and closed tones at the call
 *  site. Truncates rather than wraps: an ellipsis on a title the reader already
 *  knows costs nothing, a second line costs the height lock. Painted on the
 *  bar.
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
export const RIBBON_HEADER_TITLE =
  't-section block truncate max-sm:!tracking-[0.06em] max-[379px]:!tracking-[0.02em]';

/** "Reference · 6 cognitive tiers", under the title. Painted on the bar. */
export const RIBBON_HEADER_SUBLABEL = 't-label block truncate text-slate-600 dark:text-slate-400';

/** The word "Selected:" before the chip. `whitespace-nowrap` is half of the
 *  height lock. Painted on the bar. */
export const RIBBON_SELECTED_LABEL = 't-label whitespace-nowrap text-slate-600 dark:text-slate-400';

/** The chip carrying the selected verb. `whitespace-nowrap` is the other half
 *  of the height lock — DIFFERENTIATE is thirteen characters.
 *
 *  Structure only: its fill, text and border come from the tier config at the
 *  call site, the same wash the detail card's tier chip wears. */
export const RIBBON_SELECTED_CHIP = 't-label px-2.5 py-0.5 rounded-lg whitespace-nowrap border';

/** The open panel's body, under the header's own rule. Painted on the panel.
 *  `p-5` and the `border-t` are the accordions' body, so the two kinds of panel
 *  open onto the same margin. The three blocks inside it are spaced by
 *  `space-y-5`, which is the one rhythm the ribbon needs now that it no longer
 *  has hairlines to separate them. */
export const RIBBON_BODY = 'p-4 sm:p-5 space-y-5 border-t border-slate-300 dark:border-white/10';

/** The active verb's brief. A quiet card, not a wash.
 *
 *  It used to be a slab of the tier's own colour — a `-100` pastel across the
 *  whole width in the light theme, with a blurred gradient blob, a mesh and a
 *  48px bevelled tile on it — which made it the loudest object on a page whose
 *  other cards are white. The tier is stated once, by the rule down its left
 *  edge, and that is the device the breadcrumb bar above it already uses
 *  (`SyllabusNavBar`: a 1.5-unit gradient stripe on the left). Everything else
 *  on it is the page's own ink on the page's own surface.
 *
 *  `pl-6` leaves the stripe its width and then some. Painted on the panel. */
export const RIBBON_DETAIL_CARD =
  'relative overflow-hidden rounded-2xl border pl-6 pr-4 sm:pr-5 py-5 animate-fade-in-up ' +
  'border-slate-300 bg-slate-50 dark:border-white/10 dark:bg-white/[0.03]';

/** The tier rule down the brief's left edge. The gradient itself is the tier
 *  config's and is interpolated at the call site. Painted on the brief. */
export const RIBBON_DETAIL_RULE = 'absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b';

/** The verb itself, in the house display treatment. Painted on the brief. */
export const RIBBON_DETAIL_TERM =
  'text-3xl font-black tracking-normal uppercase italic leading-none text-slate-900 dark:text-white';

/** The tier chip beside the verb. Its colours come from the tier config.
 *  Painted on the brief. */
export const RIBBON_DETAIL_TIER_CHIP =
  // `whitespace-nowrap`: on a phone "Tier 2 · Define" broke after the dot.
  't-label px-3 py-0.5 rounded-full border whitespace-nowrap';

/**
 * How the prose in this file is allowed to break is `utils/prose`'s decision —
 * `PROSE_BLOCK` for a short declarative block read as one unit, `PROSE_FLOW`
 * for running text, and neither on the tier NAME, which is clamped. The
 * measurements that produced the rule were taken here; the reasoning is
 * recorded there rather than repeated at each use.
 *
 * Applied at the CALL SITE rather than baked in here, which is the same rule
 * this file already follows for anything tier-coloured. Not only for
 * consistency: a constant here interpolating an imported value would be
 * reading it at module-init time, and `npm run check:eager-reads` rejects
 * that — it is the crash class where a bundler puts reader and definer in
 * chunks that import each other and the reader hits a temporal dead zone.
 * `utils/prose` imports nothing and so could not actually cycle, but that
 * script's exemption list is keyed by the READING file, so taking one would
 * have blanket-accepted every future eager read in this file too. A
 * render-time read costs nothing and keeps the guard honest.
 */
/** The verb's definition. Painted on the brief. It used to carry an `opacity-90`
 *  that softened white-on-gradient text, and later sat on a tier wash where the
 *  opacity only cost contrast; it is plain slate ink on a plain surface now. */
export const RIBBON_DETAIL_DEFINITION =
  'text-sm font-bold max-w-xl leading-relaxed text-slate-700 dark:text-[rgb(var(--color-text-secondary))]';

/* RIBBON_DETAIL_TIP_ACCENT is gone with `StrategyTip`, which it dressed.
 *
 * Its reason is worth keeping, because it still binds whatever is painted
 * here: on `slate-100` over a tier wash, `slate-500` sits within a tenth of
 * the contrast floor, which is why that token was `slate-600`. `StrategyBrief`
 * sets its checks in `--color-text-muted`, which resolves to slate-600 under
 * `[data-theme="light"]` — the same step, arrived at from the token system
 * rather than spelled out. `tests/e2e/light-theme.spec.ts` measures it.
 */

/** The four-stat tray on the right of the brief. Painted on the brief.
 *
 *  A well cut into it — `bg-surface-inset`, the token DesignSpec §3 gives to
 *  recessed wells — and `rounded-xl`, one step tighter than the 16px card it
 *  sits in, because a box at its container's radius reads as a second card
 *  rather than as something inside the first. It had been `rounded-2xl` on a
 *  `rounded-2xl` card, with a backdrop blur and an inner shadow on top: three
 *  effects for a box that holds four numbers. */
export const RIBBON_STAT_TRAY =
  'flex items-center gap-4 px-5 py-3 rounded-xl self-stretch sm:self-start lg:self-auto justify-center flex-wrap ' +
  'bg-surface-inset border border-slate-300 dark:border-white/10';

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
 *  on the brief, not on the tray.
 *
 *  It was a `title` on a `<div>` with no `tabindex`, so the explanation of the
 *  one label a student will not already know was unreachable by keyboard and
 *  absent on touch. */
export const RIBBON_STAT_CAPTION =
  'text-[10px] font-bold leading-snug text-center sm:text-left lg:text-right text-slate-600 dark:text-slate-400';

/** The hairline between two stats. Painted on the tray. */
export const RIBBON_STAT_DIVIDER = 'w-px h-8 bg-slate-400 dark:bg-white/10';

/** The horizontal tier strip. Six 260px cards plus gaps is ~1580px, so it
 *  overflows at nearly every width. Painted on the panel.
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
 *  the tier config. Painted on the strip, which is painted on the panel.
 *
 *  No fixed height: at a hard 256px the biggest tier had its last row of chips
 *  sliced by the card edge. The strip is a flex row, so leaving the height to
 *  the content makes every card as tall as the tallest for free. */
export const RIBBON_TIER_CARD =
  'clip-stable flex-shrink-0 w-[260px] xl:w-auto xl:min-w-0 min-h-[256px] snap-center relative overflow-hidden rounded-2xl border transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] flex flex-col group/card';

/** A tier card with no verb selected anywhere, or one that is not the selected
 *  verb's tier. Painted on the panel.
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
 *  the call site — the same way the spectrum's leading edge takes its glow, so
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
 *  logs", and the ribbon's own stat tray already sets its four numbers in it —
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

/** The timeline's progress track — the unlit ground the spectrum is painted
 *  on, and the box that clips it. Painted on the panel.
 *
 *  `h-3`, not `h-2`: eight pixels is too thin to read a six-colour spectrum in.
 *  A visual judgement, stated as one. `mb-4` moved to the wrapper, which is
 *  what the leading edge and the ignition flare are positioned against — both
 *  must be free of this box's `overflow-hidden` or the clip eats the very bloom
 *  they exist to draw.
 *
 *  `slate-300` in light, where it was `slate-200`. It was painted on the page,
 *  and the page in the light theme is slate-200 — so the unlit ground of the
 *  spectrum was the one colour it could not be, and the bar vanished wherever
 *  the dormant gradient over it is faintest. It sits on a white panel now, where
 *  slate-200 would show; the step stays, because the dormant gradient is at
 *  25% in this theme and the unlit track is what a reader sees through it. */
export const RIBBON_TIMELINE_TRACK =
  'relative h-3 bg-slate-300 dark:bg-white/10 rounded-full overflow-hidden';

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
  'absolute inset-y-0 rounded-lg pointer-events-none z-10 origin-center';

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
 *  Painted in the PANEL's own surface on top of the track, so they read as
 *  physical gaps cut into the spectrum rather than as lines drawn over it. Width
 *  comes from the call site: the 3/4 boundary is wider, because it is the
 *  threshold.
 *
 *  "The surface the track sits on" is the whole mechanism, so it is named as
 *  tokens and never as a copy of their values: `bg-surface` in the light theme,
 *  where the panel is the paper, and `dark:bg-base` in the dark one, where the
 *  panel is a 30% wash of the surface over the page and the page is the nearest
 *  solid there is. The gaps used to be plain `bg-base`, which was the page's own
 *  colour while the ribbon sat on the page; on a white panel in the light theme
 *  that would be five grey slots down the middle of the spectrum. A gap that is
 *  not the colour of what it is cut through is not a gap. */
export const RIBBON_SPECTRUM_BOUNDARY =
  'absolute inset-y-0 -translate-x-1/2 pointer-events-none bg-surface dark:bg-base';

/** The scale rail above the spectrum — the two sides the Deep Learning
 *  Threshold divides the ladder into, and the chip that names the gate.
 *  Painted on the panel.
 *
 *  A row in the flow, which it was not. It used to be `absolute -top-6`, and
 *  the chip beside it `-top-11`, both hanging in air that belonged to a
 *  DIFFERENT element: the cue line's `mb-7`. The comment here called that
 *  "the whole vertical budget" and treated costing the footer no height as the
 *  feature. It was a dependency. Measured in Chromium, the rail sat 4px below
 *  the cue's box and the chip 0.91px below it, so deleting the cue dropped
 *  both of them 64px — 8px and 11px ABOVE the footer's own divider hairline,
 *  through it and into the tier strip's padding.
 *
 *  Both offsets are gone. The rail occupies its own row and the chip is
 *  positioned inside it, so the only thing either depends on is this element.
 *  The two `-top-` values that had been measured to 0.2px against each other
 *  are not retuned — there is nothing left to tune them against.
 *
 *  `hidden sm:flex`, the same floor the chip had: below `sm` there is no room
 *  for two captions and a pill across a 360px bar, and the dot row has already
 *  dropped five of its six labels at that width for the same reason.
 *
 *  Flush to the track's own edges, so the captions start and end where the
 *  spectrum does and the chip's 50% is the threshold's 50%. */
export const RIBBON_SPECTRUM_SCALE_RAIL =
  'hidden sm:flex relative items-center justify-between mb-2 pointer-events-none';

/** One span's caption. Painted on the panel, in the tone
 *  `RIBBON_TIMELINE_STEP_LABEL_IDLE`'s contrast fix measured at 7.24:1 — this
 *  is the same text on the same background at nearly the same size, so it takes
 *  the same pair rather than a fresh guess. Not `aria-hidden`: `contrast.ts`
 *  skips everything inside an `aria-hidden` subtree, and hiding a new block of
 *  text from the audit is the blind spot that let this component's three
 *  contrast defects ship in the first place. */
export const RIBBON_SPECTRUM_SCALE_SPAN =
  't-label inline-flex items-center whitespace-nowrap ' + 'text-slate-600 dark:text-slate-400';

/** One step's dot on the timeline. Its fill is the tier's `solidBg` once the
 *  reader has reached that step. Painted on the panel. */
export const RIBBON_TIMELINE_DOT =
  'w-4 h-4 rounded-full border-2 transition-all duration-500 relative';

/** A timeline step's label, under its dot. Painted on the panel. */
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
  't-label absolute left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full ' +
  'border shadow-sm whitespace-nowrap ' +
  'bg-white text-slate-600 border-slate-400 ' +
  'dark:bg-[rgb(var(--color-bg-surface))] dark:text-slate-400 dark:border-white/10';
