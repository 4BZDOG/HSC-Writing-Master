/**
 * The marking report's class vocabulary, in the shape of `utils/ladderChrome.ts`.
 *
 * Every colour a band paints comes from the band (`ladderBandVars` on the root
 * of the surface, and the `band-*` classes in `index.css`). What is written here
 * is structure and ink, and each constant says what it is painted ON, because
 * that is the question DesignSpec §2 asks of every colour.
 *
 * The rule the placard and its actions are built on: NO white text on a band.
 * `band-solid` draws the band at full strength with near-black ink, which holds
 * AA on all six bands in both themes; white on bands 2–4 measures 1.9–2.8:1.
 * `tests/unit/feedbackChrome.test.ts` measures every pair against the tokens.
 */

/** A report section's surface: the paper a card lies on in the light theme, and
 *  a lifted card in the dark. The edge does the separating on the desk, so the
 *  card is not a bare white slab on a near-white ground. Painted on the desk. */
export const FEEDBACK_CARD =
  'rounded-panel bg-surface border border-slate-300 dark:border-white/10 shadow-sm';

/** A section heading. Sentence case and bold, in primary ink: the caps and italics
 *  of `.t-section` are a boundary marker, and a report with seven of them read as
 *  seven boundaries at once. The tone a section carries lives in its icon tile.
 *  Painted on the desk or the card it heads. */
export const FEEDBACK_HEADING =
  'font-bold text-base leading-snug tracking-tight text-slate-900 dark:text-white';

/** The icon tile beside a heading. Its colour is the section's tone, passed in. */
export const FEEDBACK_TILE = 'p-1.5 rounded-lg shrink-0';

/** A secondary action: a quiet button on the card. It is 44px on a phone, the
 *  touch target, and returns to its own height from `sm`. Painted on the card. */
export const SECONDARY_ACTION =
  't-label inline-flex items-center justify-center gap-2 min-h-11 sm:min-h-0 px-4 py-2.5 rounded-xl border border-slate-300 bg-surface-elevated text-slate-800 shadow-sm hover:bg-surface-inset dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10 transition-colors duration-200 touch-manipulation active:scale-[0.98] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/40 dark:focus-visible:ring-white/60';

/** The primary action on a band: the band's flat ground (`BAND_GROUND`) with its ink,
 *  and no white anywhere on it. Set the band's `--band-rgb`
 *  (`ladderBandVars`) at the call site. Painted on the card. */
export const PRIMARY_ACTION =
  'text-xs inline-flex items-center justify-center gap-2 min-h-11 sm:min-h-0 px-5 py-2.5 rounded-xl font-bold shadow-sm hover:brightness-105 transition-[filter] duration-200 touch-manipulation active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950/50';

/** A chip or pill drawn in the band's ink, on the band's flat ground (`BAND_GROUND`).
 *  Its own ground is a light wash over the band, not a dark one: ink on a band
 *  darkened by ink measured 3.7–4.4:1, and the wash raises the ground instead. */
export const INK_CHIP = 'border border-white/40 bg-white/25 text-slate-950';

/**
 * The band as a flat ground, with the ink on it, for any control that carries text.
 *
 * `band-solid` also shades its bottom-right corner with black at 8%, and on band 6
 * that shade takes the ink to 4.41:1, under AA for the report's 12px labels. The
 * flat band measures 5.1:1 there and clears AA on all six, so the report draws its
 * text grounds flat. A caller sets `--band-rgb` on the element or an ancestor
 * (`ladderBandVars`).
 */
export const BAND_GROUND = 'bg-[rgb(var(--band-rgb))] text-slate-950';

/** A control on the band's solid fill, in its ink. It is 44px on a phone. */
export const INK_BUTTON =
  'inline-flex items-center gap-2 min-h-11 sm:min-h-0 px-4 py-2.5 sm:py-2 rounded-xl border border-white/40 bg-white/25 text-slate-950 text-xs font-bold transition-colors duration-200 touch-manipulation hover:bg-white/35 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950/60';

/** The rule under a placard's caption, a footer note on the surface. */
export const FOOTNOTE = 'text-xs leading-relaxed text-slate-600 dark:text-slate-400';

/** The checkbox a growth item is ticked against, drawn as the PDF draws it: an
 *  empty square in the item's own colour. Painted on the card. */
export const GROWTH_BOX =
  'mt-0.5 w-4 h-4 shrink-0 rounded-none border-2 border-rose-700 dark:border-rose-400';
