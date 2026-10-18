/**
 * The signed-out screens' class vocabulary, in the same shape as
 * `utils/headerChrome.ts`.
 *
 * Sign-in and password reset each carried their own copies of these strings —
 * the primary button five times over — and the copies had already drifted:
 * reset's button had lost its hover border, its fields their focus glow and
 * their error link for screen readers. One file means one screen, twice.
 *
 * These surfaces are written `light:`-override (dark base), like the rest of
 * the auth screens: they render before any user preference exists, and the
 * `.dark` class that `dark:` keys on is only set once someone is signed in.
 */

/** The page. `my-auto` on `AUTH_COLUMN`, not `justify-center` here: centring
 *  with justify-content pushes a column taller than the viewport off BOTH ends,
 *  and the top half cannot be scrolled back to. Auto margins centre when there
 *  is room and fall back to top-down flow when there is not.
 *  The gutter is 16px below `sm` and 24px from there up. */
export const AUTH_PAGE =
  'min-h-screen w-full flex flex-col items-center relative px-4 sm:px-6 py-8 sm:py-14 ' +
  'selection:bg-indigo-500/30';

/** The centred column inside `AUTH_PAGE`. */
export const AUTH_COLUMN = 'my-auto w-full flex flex-col items-center';

/** The card that holds the form. */
export const AUTH_CARD =
  'clip-stable relative overflow-hidden rounded-surface border-2 ' +
  'bg-[rgb(var(--color-bg-surface))] ' +
  'border-white/20 light:border-slate-400/60 ' +
  'shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] light:shadow-[0_1px_2px_rgba(15,23,42,0.08),0_18px_36px_-14px_rgba(15,23,42,0.26),0_44px_80px_-24px_rgba(30,41,59,0.36)]';

/** The one primary action on each card — sign in, create, send, set, back.
 *  Painted on `AUTH_CARD`. Solid indigo-600 in both themes (white on it is
 *  6.29:1), so it takes no light partner. */
export const AUTH_PRIMARY_BUTTON =
  'w-full py-4 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-3 ' +
  'bg-indigo-600 hover:bg-indigo-500 border-2 border-white/10 hover:border-white/20 ' +
  'shadow-sm active:scale-[0.98] ' +
  'transition-[background-color,border-color,transform] disabled:opacity-50 disabled:cursor-not-allowed';

/** An inline text action — "Forgot your password?", "Back to sign in". */
export const AUTH_TEXT_LINK =
  'font-bold underline underline-offset-2 ' +
  'text-indigo-400 hover:text-indigo-300 light:text-indigo-700 light:hover:text-indigo-800';
