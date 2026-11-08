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
  'clip-stable rounded-panel border border-slate-400 dark:border-white/20 bg-white/60 dark:bg-[rgb(var(--color-bg-surface))]/30 light:bg-white shadow-sm overflow-hidden transition-all duration-300';

/** The tone a panel's header row takes while its body is open.
 *
 *  `slate-100` at full strength, where it was `slate-50/50`. The panel it sits
 *  on is white, so that was a half-strength wash of a tone already within 2% of
 *  its own background: the row said nothing about whether the panel was open,
 *  which is the single thing it exists to say. Its dark partner is unchanged —
 *  `white/[0.03]` on a near-black panel is a step you can see, and that is the
 *  asymmetry, not an oversight. */
export const PANEL_HEADER_OPEN = 'bg-slate-100 dark:bg-white/[0.03]';

/** …and while it is shut, where the whole row is the control. Same move, same
 *  reason: a hover a mouse cannot see is not feedback. */
export const PANEL_HEADER_CLOSED = 'hover:bg-slate-100 dark:hover:bg-white/[0.02]';

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

/**
 * Exam Mode's booklet edge: the one neutral boundary every exam surface wears, the
 * writing card, the timer placard and the exam conditions placard beside the
 * prompt. A band hue here would hint at scoring, and a light slate-300 edge measured
 * 1.5:1 on the page (the 3:1 floor is for region boundaries).
 *
 * Measured with the WCAG relative-luminance formula, on the rendered pixels:
 * - dark ground (#0a0f1a, and the card surface beside it): slate-500 is 3.7 to 4.0:1.
 * - light ground (slate-200): slate-500 is 3.9:1 on the bare page, but the writing
 *   card's shadow darkens the ground beside it to about 3.0:1, too close to the floor.
 *   slate-600 holds 4.8:1 through that shadow, so the light edge steps up one tone.
 */
export const EXAM_BOOKLET_BORDER = 'border-slate-500 light:border-slate-600';

/** The same edge as a full 2px border, for the panels that are not the writing card. */
export const EXAM_BOOKLET_EDGE = `border-2 ${EXAM_BOOKLET_BORDER}`;

/**
 * The panel surface of `PANEL_SURFACE` with the exam booklet edge in place of its
 * 1px band-less slate-400 edge. Everything else is the shared panel recipe, so the
 * exam placards keep the rail's radius, fill and shadow.
 */
export const EXAM_PANEL_SURFACE = `clip-stable rounded-panel ${EXAM_BOOKLET_EDGE} bg-white/60 dark:bg-[rgb(var(--color-bg-surface))]/30 light:bg-white shadow-sm overflow-hidden transition-all duration-300`;
