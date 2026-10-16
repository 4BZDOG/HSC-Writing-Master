/**
 * The shared chrome of the staff tools (Data Vault, Content Audit Studio, the
 * usage and key dashboards), so their heads, rails and section titles are drawn
 * the same way in one place and not restated at each call site.
 *
 * Every constant names what it is painted ON, the question DesignSpec §2 asks of
 * every colour. The ladder tokens (`bg-surface`, `bg-surface-elevated`,
 * `bg-surface-inset`) flip with the theme by themselves, so a class built from
 * them needs no `light:` partner.
 */

/** A tool's head band: the paper, with a faint primary wash that starts at the
 *  left and is gone by two thirds across. It is the quiet tinted head the Marking
 *  Guide's rows use, in the admin palette, so a head is never a flat white slab on
 *  the paper it sits in. The wash ends at the primary hue at zero alpha rather than
 *  `transparent`, which Safari takes through grey on a gradient (DesignSpec §3).
 *  Painted on the paper of the shell it is the top of. */
export const TOOL_HEAD =
  'bg-[rgb(var(--color-bg-surface))] bg-[linear-gradient(90deg,rgb(var(--color-primary)/0.10)_0%,rgb(var(--color-primary)/0)_65%)]';

/** A rail or sidebar: a strip lying ON the paper, so it is the elevated rung. In
 *  the light theme that rung is darker than paper, which is what makes a rail read
 *  as a rail rather than as one more white panel (DesignSpec §2 rule 0). */
export const TOOL_RAIL = 'bg-surface-elevated';

/** A well cut INTO the paper: the metric tiles in a head, and a body that holds
 *  cards. Painted on the paper of the head or shell it sits in. */
export const TOOL_WELL = 'bg-surface-inset';

/** A section's title. It is the `.t-section` voice (Inter 900 italic, the display
 *  face and weight that divide a panel into named parts), but in sentence case
 *  with no tracking, because a section title here is a sentence the reader reads
 *  and not a caption to shout over the panel. Sentence case at the 12px of the
 *  caps voice reads as a caption, so the size is 14px. `!` is needed because
 *  `.t-section` is declared after the Tailwind utilities in `index.css` and would
 *  otherwise win on case, tracking and size. Painted on whatever panel the section
 *  is in. */
export const SECTION_TITLE =
  't-section !normal-case !tracking-normal !text-sm text-slate-900 dark:text-white';

/**
 * A rail tab. Below `md` the rail is a row of equal columns and each tab is its icon
 * above its label, as the Data Manager tabs are, so the longest label ("Data Browser")
 * fits a 390px phone without a strip to scroll. From `md` the rail is a column and the
 * icon sits beside the label. `tone` is the active tab's own tint; the inactive tabs share
 * one quiet treatment.
 */
export const railTabClass = (active: boolean, tone: string): string =>
  `min-w-0 flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 px-2 md:px-4 py-2.5 md:py-3 rounded-xl text-xs md:text-sm font-bold whitespace-nowrap transition-all duration-200 ${
    active
      ? tone
      : 'text-[rgb(var(--color-text-secondary))] light:text-slate-600 hover:bg-[rgb(var(--color-bg-surface-light))] light:hover:bg-slate-200'
  }`;
