/**
 * The application header's class vocabulary, in the same shape as
 * `utils/cardChrome.ts` and `utils/panelStyles.ts`.
 *
 * The bar used to be a full-bleed indigo→sky gradient wall, which is why every
 * value in here was once white-alpha: on a gradient that never changes with the
 * theme, white-alpha is correct in both. That wall is gone. The bar is now a
 * translucent token surface, so the same white-alpha values would be invisible
 * in the light theme — the failure DesignSpec §2 rule 2 describes.
 *
 * Each constant therefore records what it is painted ON, because that is the
 * question §2 asks of every colour and it is not answerable from the class
 * string alone.
 *
 * New code here is `dark:`-first: light is the base, `dark:` carries the
 * override (see DesignSpec §2, "Which variant to write in new code").
 */

/** The bar itself. Dark keeps the glass: a near-black rail at 70% with a blur, so
 *  scrolled content softens behind it rather than meeting an opaque wall, which
 *  is the point of §1's glassmorphism. Painted on the page background and
 *  `AnimatedBackground` beneath it.
 *
 *  Light is paper. It was `bg-white/80` with the same blur, and over scrolled
 *  content that let the verb ribbon's type ghost through the wordmark: 20% of
 *  whatever sits beneath, blurred, is still enough to read as a second line of
 *  "BAND 6". So the light rail is the paper rung itself, opaque, with the
 *  hairline and `shadow-sm` doing the separating a translucent edge used to do.
 *  It also drops the blur in light, which is one fewer backdrop layer repainting
 *  under the reader's thumb on iOS (see the WebKit notes in `index.css`).
 *
 *  `border-slate-300`, where it was `slate-200`. Its dark partner is white at
 *  10% over a near-black page, which is the edge the rail is actually read by
 *  when it floats over scrolled content; slate-200 over the light page was the
 *  same declaration doing none of that work, and the bar's bottom edge simply
 *  was not there. See the light token block in `index.css` for why an alpha
 *  tuned on one ground cannot be carried to the other unchanged. */
export const HEADER_BAR =
  'sticky top-0 z-header h-16 flex items-center ' +
  'bg-surface dark:bg-[rgb(var(--color-bg-surface))]/70 dark:backdrop-blur-2xl ' +
  'border-b border-slate-300 dark:border-white/10 ' +
  'shadow-sm dark:shadow-lg dark:shadow-black/20';

/** The content row, above the mesh and the hairline on `z-10`. It never wraps:
 *  the eight admin buttons that used to force a second row now live behind one
 *  control, so there are four rail controls at every width and nothing left to
 *  push down. That is what lets `HEADER_BAR` state a height instead of a
 *  minimum — a sticky bar whose height depends on the viewport and the
 *  signed-in role reflows everything beneath it. Vertical centring comes from
 *  `items-center` on the fixed-height box, so there is no padding to tune. */
export const HEADER_INNER =
  'relative z-10 px-4 sm:px-6 lg:px-8 h-full w-full max-w-[1600px] mx-auto ' +
  'flex flex-nowrap items-center justify-between gap-x-3';

/** The brand block at the rail's left: the scale-and-wordmark stack, then the
 *  sub-label set against its foot. `items-end` so the sub-label sits on the
 *  wordmark's line rather than centred on the whole stack.
 *
 *  It replaced `HEADER_MARK_TILE`, a 48px ink tile holding the scale at 32px
 *  across. Six rungs in 32px are four pixels wide and eight tall, so the scale
 *  stood up as bars, tallest last, and read as a signal meter: the trap the
 *  design review records for this mark (finding 8). The tile also put the one
 *  heavy black block on the white light-theme rail. The favicon keeps a tile,
 *  because a browser tab needs a square. */
export const HEADER_LOCKUP = 'flex items-end gap-3 min-w-0';

/** The scale over the wordmark. The scale is `fluid`, so it takes this box's
 *  width, which is the wordmark's: the two are one object. `min-w-14` holds the
 *  scale at 56px when the wordmark is visually hidden under 360px. */
export const HEADER_LOCKUP_STACK = 'flex flex-col gap-1.5 min-w-14';

/** "Band 6". The house display treatment — `italic uppercase` over
 *  `font-black tracking-tight`. On the rail, so it needs the pair.
 *
 *  Two corrections to what this comment used to say. It claimed the pairing is
 *  "used in twenty-odd other files"; counted, `tracking-tighter` appears 17
 *  times across 11 files, two of them in this one. And the tracking is applied
 *  per site rather than baked into `.t-display`, which sets only the family
 *  and the weight — so there is no single token to change and no twenty-file
 *  blast radius either way.
 *
 *  `tracking-tight` (-0.025em) and not `tracking-tighter` (-0.05em), here
 *  only. At the 24px this rendered at, -1.2px closed the gap between the D and
 *  the 6 enough to read as one glyph pair; -0.6px did not. The sign-in
 *  wordmark (AuthBrand) had the same fault at 36px and takes the same answer
 *  now: `tracking-tight` is a property of this name, not of a size. The smaller sizes
 *  the rest of the house treatment runs at do not have that problem, so they
 *  keep the tighter value and this is a stated exception rather than a
 *  re-tracking of the brand.
 *
 *  `truncate` rather than the bare `whitespace-nowrap` it replaced: nowrap stops
 *  a label breaking in half, it does not stop it painting straight out of its
 *  box, and a row that no longer wraps hands the brand block whatever width the
 *  controls leave. Flexbox was already sizing the two clusters so they did not
 *  overlap; only the ink escaped. Clipped, the worst case degrades to a short
 *  wordmark instead of a wordmark printed underneath the buttons.
 *
 *  Below 360px, though, the clipped case was the only case. Measured at 320px
 *  with an admin's four controls, the rail leaves the wordmark about 30px and it
 *  painted "B…" — a letter and an ellipsis, not a brand. So under 360px it is
 *  visually hidden (`max-[359px]:sr-only`) and stays the page's `<h1>` for a
 *  screen reader; the scale above it carries the brand alone at that width.
 *  360px is where "BAND 6" fits whole.
 *
 *  `sm:text-2xl` (24px). It was 26px for presence beside the 48px tile; with
 *  the scale stacked over it the lockup is 44px tall, and 26px left the caret
 *  four pixels from the top of a 64px bar. */
export const HEADER_WORDMARK =
  't-display text-lg sm:text-2xl tracking-tight leading-none italic uppercase ' +
  'truncate text-slate-900 dark:text-white max-[359px]:sr-only';

/** "HSC Writing Coach". On the rail. The tracking no longer jumps at `sm` —
 *  it was the only responsive tracking in the codebase, and it made the label
 *  read as a different label at different widths.
 *
 *  It sits beside the wordmark rather than under it, against a 1px rule on the
 *  wordmark's foot: the stack above already holds the scale and the name, and a
 *  third line would not fit the 64px bar.
 *
 *  It does step aside below `sm`, though. That decision was measured back when
 *  the label carried 0.2em of tracking and painted 164px against the roughly
 *  128px a 360px rail can give it; `.t-label` sets `letter-spacing: normal`
 *  now, so the overflow is smaller than the number here implies — but the rail
 *  still cannot wrap and the label still does not fit, so the call stands and
 *  the measurement is kept as the record of why. It was painting straight
 *  through the action buttons — `whitespace-nowrap`
 *  keeps a label from breaking in half, it does not keep it inside its box. The
 *  scale and the wordmark still say whose app this is at that width; the gloss
 *  beside them is the part a phone can spare, which is the same call the profile
 *  control's display name and the storage chip's text already make. */
export const HEADER_SUBLABEL =
  't-label hidden sm:block truncate pl-3 mb-[3px] leading-none border-l ' +
  'text-slate-500 border-slate-300 dark:text-slate-400 dark:border-white/15';

/** The square controls that stay on the rail whatever the role: the tools
 *  trigger, help and the theme toggle. On the rail, so they carry the pair; the
 *  resting fill is gone because a glass surface does not need a chip behind
 *  every icon.
 *
 *  44px on a phone, which is the touch target; it was 40px everywhere, and a
 *  thumb is the only input there. From `sm` up the pointer is precise and 40px
 *  stays, so the rail is no taller or wider on a laptop than it was. The bar is
 *  a fixed 64px, so the 44px square fits with ten pixels either side and does
 *  not change the header's height at any width. */
export const HEADER_ACTION =
  'w-11 h-11 sm:w-10 sm:h-10 flex items-center justify-center rounded-xl transition-colors ' +
  'text-slate-500 hover:text-slate-900 hover:bg-slate-100 ' +
  'dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/10';

/** Appended to `HEADER_ACTION` on the tools trigger while its popover is open.
 *  A toggle that looks the same open and shut is a toggle nobody trusts, and
 *  `aria-expanded` alone says it only to a screen reader. On the rail. */
export const HEADER_ACTION_OPEN = 'bg-slate-100 text-slate-900 dark:bg-white/10 dark:text-white';

/** The tools popover itself. Not on the rail: it floats over the page in a
 *  portal, so it paints an opaque surface of its own rather than borrowing the
 *  bar's glass, because a translucent menu over live content is unreadable.
 *
 *  It is a strip lying on the paper, which is the ladder's `surface-elevated`
 *  (248) rather than a second white. On a white card that step is too small to
 *  carry the menu's edge, so the edge is `slate-300` and the shadow is the lifted
 *  step, `shadow-lg`, which is what says it floats. */
export const HEADER_MENU_PANEL =
  'fixed z-popover w-64 p-1.5 rounded-2xl shadow-lg animate-fade-in text-left ' +
  'bg-surface-elevated border border-slate-300 ' +
  'dark:border-white/10';

/** One tool inside the popover. Painted on `HEADER_MENU_PANEL`.
 *
 *  Its hover is `surface-inset`, one rung into the panel, because a hover on
 *  the 248 panel that is itself a step of 241 was not visible at all. Hover is
 *  `can-hover:` so a tap on a phone does not leave the row highlighted, and the
 *  row is 44px on a phone, which is the touch target.
 *
 *  `text-left` here as well as on the panel: a `<button>` does not inherit
 *  `text-align` — the user-agent sheet sets it to `center` — so the panel's
 *  own `text-left` never reached the rows, and every two-line tool name sat
 *  centred under a left-aligned group label. */
export const HEADER_MENU_ITEM =
  'w-full flex items-center gap-3 px-3 py-2 min-h-11 sm:min-h-0 rounded-xl text-left text-xs font-bold transition-colors ' +
  'text-slate-700 can-hover:hover:bg-surface-inset dark:text-slate-200 dark:can-hover:hover:bg-white/10 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900/40 dark:focus-visible:ring-white/60';

/** The parenthetical half of a tool's name, carried as a second line so the
 *  full string can stay the `title` and the accessible name without the panel
 *  having to be wide enough to show it in one. Painted on the panel, and on the
 *  item's hover, so it is `slate-600`: `slate-500` was 4.1:1 on that hover, and
 *  this is 11px text. */
export const HEADER_MENU_ITEM_HINT =
  'block mt-0.5 text-[11px] font-medium leading-snug text-slate-600 dark:text-slate-400';

/** The storage-mode row at the foot of the popover, and the rule above it.
 *  Painted on the panel. */
export const HEADER_MENU_FOOTER =
  'mt-1 pt-2 px-3 pb-1 border-t border-slate-300 dark:border-white/10';

/** Storage mode, in the popover's footer. Mono because DesignSpec §4 gives
 *  system state to JetBrains Mono, and this is the one fact the deleted status
 *  pill carried that was worth keeping: which store the work is going to.
 *  Painted on the panel. */
export const HEADER_TELEMETRY = 't-label font-mono text-slate-600 dark:text-slate-400';

/** A tool's live state ("Running"), on its row. Painted on the panel. The light
 *  side is a tint one step deeper than the dark side's alpha wash, because a
 *  `/10` wash of indigo is invisible on white (DesignSpec §2 rule 1). */
export const HEADER_MENU_STATUS =
  't-label ml-auto shrink-0 flex items-center gap-1.5 px-2 py-0.5 rounded-lg whitespace-nowrap ' +
  'bg-indigo-100 border border-indigo-200 text-indigo-800 ' +
  'dark:bg-indigo-500/10 dark:border-indigo-500/30 dark:text-indigo-300';

/** The storage alarm, and the only thing in this file that renders
 *  conditionally. Storage is where a student's work lives; if it has failed,
 *  everything typed since is going nowhere, and that is the worst thing this
 *  app can do quietly. So it sits on the rail at EVERY width — no `hidden lg:`,
 *  which is exactly the fault the old status pill had — and it costs nothing
 *  when storage is well, because then it does not exist. Mono, per §4: it is
 *  telemetry.
 *
 *  With its label the chip measures 147px, which is more than the rail can
 *  spare below `lg` now that the rail cannot wrap: the chip would have broken
 *  the header in precisely the failure it exists to announce. So the TEXT goes
 *  and the chip stays, down to a red triangle in a red pill — still unmissable,
 *  and the sentence it dropped moves to the chip's `aria-label`, so a screen
 *  reader hears the same thing at every width. `lg` and not `sm`: measured at
 *  640px the 147px chip pushed the wordmark's sub-label 52px into the action
 *  buttons, so `sm` would only have moved the fault rather than fixed it.
 *  On the rail, so it carries the pair. */
export const HEADER_STORAGE_ALERT =
  't-label flex items-center gap-2 px-2 lg:px-3 h-9 rounded-xl font-mono ' +
  'border ' +
  'bg-red-100 text-red-700 border-red-200 ' +
  'dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30';

/** Library / Moderation / AI. Painted on the panel.
 *
 *  Its pair used to be the wrong way round — `text-slate-400
 *  dark:text-slate-500`, which is the two values of every other label in this
 *  file swapped. The consequence was not symmetrical: slate-400 on the white
 *  menu panel measured 2.56:1, so in the light theme the three words that say
 *  what the menu is grouped BY were the least legible thing in it. */
export const HEADER_MENU_GROUP_LABEL =
  't-label px-3 pt-2 pb-1 ' + 'text-slate-600 dark:text-slate-400';

/** The profile control at the far right — name plus avatar chip. On the rail.
 *  The chip's own `bg-indigo-500` is brand-solid by intent and is not part of
 *  this constant. */
export const HEADER_PROFILE =
  'flex items-center gap-3 pl-3 pr-1.5 h-11 rounded-2xl transition-colors ' +
  'border border-slate-200 hover:bg-slate-100 ' +
  'dark:border-white/10 dark:hover:bg-white/10';
