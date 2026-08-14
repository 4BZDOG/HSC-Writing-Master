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
 * string alone. The brand gradient survives on the 40px wordmark tile, and the
 * values sitting on *it* are still white-alpha and still correct.
 *
 * New code here is `dark:`-first: light is the base, `dark:` carries the
 * override (see DesignSpec §2, "Which variant to write in new code").
 */

/** The bar itself — a glass rail. Content scrolls under a translucent surface
 *  rather than behind an opaque wall, which is the point of §1's glassmorphism.
 *  Painted on the page background and `AnimatedBackground` beneath it. */
export const HEADER_BAR =
  'sticky top-0 z-[60] min-h-20 flex items-center ' +
  'bg-white/80 dark:bg-[rgb(var(--color-bg-surface))]/70 backdrop-blur-2xl ' +
  'border-b border-slate-200 dark:border-white/10 ' +
  'shadow-sm dark:shadow-lg dark:shadow-black/20';

/** Edge-lighting on the glass. Static by design — the tier colour is already
 *  stated by the editor's chroma and by SyllabusNavBar's stripe; a third
 *  simultaneous statement is noise, and a header that changes colour is a
 *  header that moves. Painted on the bar's own bottom edge. */
export const HEADER_HAIRLINE =
  'absolute inset-x-0 bottom-0 h-px pointer-events-none ' +
  'bg-gradient-to-r from-transparent via-indigo-500/40 dark:via-indigo-400/30 to-transparent';

/** The content row, above the mesh and the hairline on `z-10`. It wraps below
 *  `sm` so the admin/moderator tool buttons drop onto their own row instead of
 *  overlapping the title on a narrow screen — which is what makes the header's
 *  height depend on the viewport and the signed-in role. */
export const HEADER_INNER =
  'relative z-10 px-4 sm:px-6 lg:px-8 py-3 sm:py-0 w-full max-w-[1600px] mx-auto ' +
  'flex flex-wrap sm:flex-nowrap items-center justify-between gap-x-3 gap-y-2';

/** The wordmark tile — where the brand gradient went when it came off the bar.
 *  White-alpha ON THE BRAND GRADIENT: it reads the same in both themes and is
 *  the one constant here that takes no light partner, per §2. */
export const HEADER_MARK_TILE =
  'w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-2xl bg-gradient-to-br from-indigo-600 to-sky-500 ' +
  'border border-white/20 flex items-center justify-center shadow-lg';

/** "Band 6". The house display treatment — `italic uppercase` over
 *  `font-black tracking-tighter` — used in twenty-odd other files. On the rail,
 *  so it needs the pair. */
export const HEADER_WORDMARK =
  'text-lg sm:text-2xl font-black tracking-tighter leading-none italic uppercase ' +
  'whitespace-nowrap text-slate-900 dark:text-white';

/** "HSC Writing Coach". On the rail. The tracking no longer jumps at `sm` —
 *  it was the only responsive tracking in the codebase, and it made the label
 *  read as a different label at different widths. */
export const HEADER_SUBLABEL =
  'block mt-1 text-[10px] font-black uppercase tracking-[0.2em] whitespace-nowrap ' +
  'text-slate-500 dark:text-slate-400';

/** The square controls that stay on the rail whatever the role: the tools
 *  trigger, help and the theme toggle. On the rail, so they carry the pair; the
 *  resting fill is gone because a glass surface does not need a chip behind
 *  every icon. */
export const HEADER_ACTION =
  'w-10 h-10 flex items-center justify-center rounded-xl transition-colors ' +
  'text-slate-500 hover:text-slate-900 hover:bg-slate-100 ' +
  'dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/10';

/** Appended to `HEADER_ACTION` on the tools trigger while its popover is open.
 *  A toggle that looks the same open and shut is a toggle nobody trusts, and
 *  `aria-expanded` alone says it only to a screen reader. On the rail. */
export const HEADER_ACTION_OPEN = 'bg-slate-100 text-slate-900 dark:bg-white/10 dark:text-white';

/** The tools popover itself. Not on the rail — it floats over the page in a
 *  portal, so it paints an opaque surface of its own rather than borrowing the
 *  bar's glass; a translucent menu over live content is unreadable. */
export const HEADER_MENU_PANEL =
  'fixed z-[120] w-64 p-1.5 rounded-2xl shadow-2xl animate-fade-in text-left ' +
  'bg-white border border-slate-200 ' +
  'dark:bg-[rgb(var(--color-bg-surface-elevated))] dark:border-white/10';

/** One tool inside the popover. Painted on `HEADER_MENU_PANEL`. */
export const HEADER_MENU_ITEM =
  'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold transition-colors ' +
  'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10';

/** The parenthetical half of a tool's name, carried as a second line so the
 *  full string can stay the `title` and the accessible name without the panel
 *  having to be wide enough to show it in one. Painted on the panel. */
export const HEADER_MENU_ITEM_HINT =
  'block mt-0.5 text-[11px] font-medium leading-snug text-slate-500 dark:text-slate-400';

/** Library / Moderation / AI. Painted on the panel. */
export const HEADER_MENU_GROUP_LABEL =
  'px-3 pt-2 pb-1 text-[10px] font-black uppercase tracking-[0.2em] ' +
  'text-slate-400 dark:text-slate-500';

/** The profile control at the far right — name plus avatar chip. On the rail.
 *  The chip's own `bg-indigo-500` is brand-solid by intent and is not part of
 *  this constant. */
export const HEADER_PROFILE =
  'flex items-center gap-3 pl-3 pr-1.5 h-11 rounded-2xl transition-colors ' +
  'border border-slate-200 hover:bg-slate-100 ' +
  'dark:border-white/10 dark:hover:bg-white/10';
