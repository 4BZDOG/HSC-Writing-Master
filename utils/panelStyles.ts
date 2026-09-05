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
