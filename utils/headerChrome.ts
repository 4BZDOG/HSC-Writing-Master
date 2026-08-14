/**
 * The application header's class vocabulary, in the same shape as
 * `utils/cardChrome.ts` and `utils/panelStyles.ts`.
 *
 * Nothing here is new. Every value is the literal string that was sitting in
 * `components/AppHeader.tsx`, lifted out unchanged so the redesign that follows
 * is a diff of values in one small file rather than a diff of JSX — which is
 * the difference between a review that can see what changed visually and one
 * that has to read 170 lines of markup to find out.
 *
 * Each constant records what it is painted ON, because that is the question
 * DesignSpec §2 asks of every colour and it is not answerable from the class
 * string alone. Today the whole bar is one indigo→sky gradient wall, so every
 * white-alpha value below is correct as written and would be wrong the moment
 * the surface underneath it becomes a theme colour. Read the note before doing
 * anything that looks like a find-and-replace.
 */

/** The bar itself. The gradient is not here — it is painted by an
 *  absolutely-positioned child, which is also why the e2e contrast suite
 *  currently cannot read anything inside this element. */
export const HEADER_BAR =
  'sticky top-0 z-[60] min-h-20 flex items-center shadow-2xl shadow-indigo-900/20';

/** The content row, above the gradient child on `z-10`. It wraps below `sm` so
 *  the admin/moderator tool buttons drop onto their own row instead of
 *  overlapping the title on a narrow screen — which is what makes the header's
 *  height depend on the viewport and the signed-in role. */
export const HEADER_INNER =
  'relative z-10 px-4 sm:px-6 lg:px-8 py-3 sm:py-0 w-full max-w-[1600px] mx-auto ' +
  'flex flex-wrap sm:flex-nowrap items-center justify-between gap-x-3 gap-y-2';

/** The wordmark tile. White-alpha ON THE BRAND GRADIENT: it reads the same in
 *  both themes and takes no light partner. */
export const HEADER_MARK_TILE =
  'w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-2xl bg-white/20 backdrop-blur-xl border border-white/20 ' +
  'flex items-center justify-center shadow-2xl group transition-all';

/** "Band 6". The house display treatment — `italic uppercase` over
 *  `font-black tracking-tighter` — used in twenty-odd other files. */
export const HEADER_WORDMARK =
  'text-lg sm:text-2xl font-black text-white tracking-tighter leading-none italic uppercase whitespace-nowrap';

/** "HSC Writing Coach". The only tracking in the codebase that JUMPS at a
 *  breakpoint, so the label reads as a different label at different widths. */
export const HEADER_SUBLABEL =
  'text-[10px] font-black uppercase tracking-[0.2em] sm:tracking-[0.4em] text-white/70 block mt-1 whitespace-nowrap';

/** All eight admin/moderator tool buttons, which are identical to each other.
 *  White-alpha on the gradient wall — the value that has to change first if the
 *  wall ever becomes a theme surface. */
export const HEADER_ADMIN_BUTTON =
  'p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all shadow-lg border border-white/10';

/** The square controls that stay on the rail whatever the role: help and the
 *  theme toggle. Same paint as the tool buttons, minus the border and shadow. */
export const HEADER_ACTION =
  'w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all';

/** The profile control at the far right — name plus avatar chip. The chip's own
 *  `bg-indigo-500` is brand-solid by intent and is not part of this constant. */
export const HEADER_PROFILE =
  'flex items-center gap-3 pl-3 pr-1.5 h-11 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/10 transition-all';
