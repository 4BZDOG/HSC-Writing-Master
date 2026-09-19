/**
 * The one surface shared by every panel that sits under the workspace cards —
 * the reference rail's accordions, the exemplars, Live Insights and the live
 * writing metrics.
 *
 * They had drifted: the metrics strip carried a heavier border, a `shadow-xl`
 * and a near-black fill, so the panel a student looks at most read as a
 * different class of object from the ones either side of it. Everything below
 * the question and the writing area is reference material of the same weight,
 * and it should look it. Kept here rather than in a component so a new panel
 * joins the set by importing one constant.
 */
export const PANEL_SURFACE =
  'clip-stable rounded-panel border border-slate-300 dark:border-white/20 bg-white/60 dark:bg-[rgb(var(--color-bg-surface))]/30 light:bg-white shadow-sm overflow-hidden transition-all duration-300';

/** The tone a panel's header row takes while its body is open. */
export const PANEL_HEADER_OPEN = 'bg-slate-50/50 dark:bg-white/[0.03]';

/** …and while it is shut, where the whole row is the control. */
export const PANEL_HEADER_CLOSED = 'hover:bg-slate-50 dark:hover:bg-white/[0.02]';

/**
 * The height every panel header row stands at.
 *
 * All these panels sit in one column under the writing area, and in the
 * two-column layout they sit alongside the reference rail's panels in the
 * other column — so their rows read as a grid whether or not anyone designed
 * one. Four of the five reached 60px by coincidence: `py-3.5` either side of a
 * 32px icon tile. The live metrics strip had no tile, stacked its clock over a
 * caption instead, and stood at 82px — which put the third row of the right
 * column 23px below the third row of the left, the one visible break in an
 * otherwise aligned wall of panels.
 *
 * Stated once here, it is a contract rather than an accident: a panel whose
 * contents come out shorter is padded up to the line, and a panel that wants
 * to be taller has to say so on purpose.
 *
 * 61px rather than a round 60, because a 12px line at the 1.35 leading these
 * panels use is 16.2px tall and three of them stack a name over a caption:
 * 32.4px of text against a 32px icon tile. At 60 those panels overshot by
 * four tenths of a pixel, which is invisible on any one panel and is exactly
 * how the two columns' third rows ended up a pixel apart. A line the tallest
 * natural stack clears puts every panel on the same whole pixel.
 */
export const PANEL_ROW_MIN_H = 'min-h-[3.8125rem]';
