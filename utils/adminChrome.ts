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

/** A tool's icon tile: a small square the tool's hue is tinted into, not a gradient.
 *  Each dashboard keeps the hue its gradient had, so the tools stay told apart at a
 *  glance, but the hue is a quiet fill and a border the icon sits on. A gradient
 *  tile was the template tell the design review named (finding 11). The tile is
 *  40px and `shrink-0`, so it keeps its shape when the title beside it wraps on a
 *  phone. `tone` is the light-base pair with its `dark:` partner, written at the
 *  call site so Tailwind sees each class, for example
 *  `toolIconTile('bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30')`.
 *  Light text is the -700/-800 step on a -100 fill, and the dark text is the
 *  lighter step, so the pair runs the direction DesignSpec §2 asks for. Painted on
 *  the head it sits in. Call it while rendering, never at module scope
 *  (`npm run check:eager-reads`). */
export const toolIconTile = (tone: string): string =>
  `w-10 h-10 rounded-tile flex items-center justify-center shrink-0 border ${tone}`;

/** The close button of a staff tool's head. The same 44px target as CREATOR_CLOSE
 *  in creatorChrome.ts, at every width, restated here and not imported so the staff
 *  tools' chrome does not move when a content dialog's close does. */
export const TOOL_CLOSE =
  'flex-shrink-0 flex items-center justify-center min-h-11 min-w-11 rounded-lg text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text-primary))] hover:bg-[rgb(var(--color-bg-surface-inset))] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

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
