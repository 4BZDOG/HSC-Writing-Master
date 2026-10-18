/**
 * The class vocabulary of the five content-creation dialogs: the course and
 * sub-topic creators, the dot point generator, and the AI and written question
 * composers. Shaped like `utils/authChrome.ts` and `utils/headerChrome.ts`.
 *
 * These five each carried their own gradient icon tile, mesh overlay and
 * padding, so the same action read as a different tool every time. One file
 * means they read as one tool: the same shell, the same header, the same body
 * and footer, and the same primary action.
 *
 * Light is the base and `dark:` carries the override, as DesignSpec §2 asks for
 * new code. The `light:` idiom elsewhere in these files is left alone.
 *
 * Dark borders are white alphas, never `--color-border-secondary`: that token
 * is pure white in the dark theme and is only ever meant to be used with an
 * alpha, so a 2px shell drawn in it was a bright white frame.
 */

/** The dimmed page behind a dialog. Each dialog's shell stops propagation, so a
 *  click inside it never reaches this layer's backdrop handler. */
export const CREATOR_BACKDROP =
  'fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-modal p-3 sm:p-4';

/** The outer box of a creator dialog. The caller adds its own `max-w-*`. It is
 *  capped to the dynamic viewport, so on a phone the header and footer stay in
 *  view and only the body scrolls. */
export const CREATOR_SHELL =
  'clip-stable relative w-full flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[90dvh] rounded-surface border-2 border-slate-300 dark:border-white/15 bg-surface shadow-lg overflow-hidden animate-fade-in-up';

/** The fixed head of a creator dialog: the icon tile, the kicker and title, and
 *  the close button. It stays put while the body scrolls beneath it. */
export const CREATOR_HEADER =
  'flex-shrink-0 flex items-start gap-3 sm:gap-4 px-5 sm:px-6 pt-5 pb-4 border-b border-slate-200 dark:border-white/10 bg-surface-elevated';

/** The square tile that names the object being made. Solid and quiet, not a
 *  gradient: the icon says what it is and the tile does not decorate. */
export const CREATOR_ICON_TILE =
  'w-10 h-10 rounded-tile flex items-center justify-center shrink-0 bg-indigo-100 text-indigo-700 border border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30';

/** The small line above the title. It must say something the title does not,
 *  such as the destination course or topic. It is never a generic eyebrow. */
export const CREATOR_KICKER = 't-label text-[rgb(var(--color-text-muted))]';

/** The dialog's title, in the display voice. The source is sentence case; the
 *  display type uppercases it on screen. */
export const CREATOR_TITLE =
  't-display mt-1 text-xl sm:text-2xl uppercase italic leading-none tracking-tight text-[rgb(var(--color-text-primary))]';

/** The close button. The same 44px target as FlagContentModal, at every width. */
export const CREATOR_CLOSE =
  'flex-shrink-0 flex items-center justify-center min-h-11 min-w-11 rounded-lg text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text-primary))] hover:bg-[rgb(var(--color-bg-surface-inset))] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

/** The scrolling middle of a creator dialog, between the header and footer. */
export const CREATOR_BODY = 'flex-1 overflow-y-auto px-5 sm:px-6 py-5 custom-scrollbar';

/** The fixed foot of a creator dialog. Buttons stack on a phone, with the
 *  primary action on the bottom edge where the thumb reaches it, and sit in a
 *  row from `sm` up. */
export const CREATOR_FOOTER =
  'flex-shrink-0 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3 px-5 sm:px-6 py-4 border-t border-slate-200 dark:border-white/10 bg-surface-elevated';

/** The cancel action beside the primary one. Quiet, so the primary still reads
 *  as the one thing to do. */
export const CREATOR_SECONDARY_BUTTON =
  'min-h-11 sm:min-h-0 py-2.5 px-5 rounded-xl text-sm font-semibold text-[rgb(var(--color-text-secondary))] bg-surface-light hover:bg-slate-300 dark:hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

/** The one primary action in each creator dialog. Solid indigo-600 in both
 *  themes: white on it is 6.29:1, so it takes no light partner. */
export const CREATOR_PRIMARY_BUTTON =
  'min-h-11 sm:min-h-0 py-2.5 px-5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-sm hover:shadow-lg active:scale-[0.98] transition-[background-color,box-shadow,transform] inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

/** A field's label, above its input. */
export const CREATOR_FIELD_LABEL =
  'block text-sm font-semibold text-[rgb(var(--color-text-primary))] mb-2';

/** A text input or textarea. 16px on a phone, where a smaller field makes iOS
 *  Safari zoom on focus. */
export const CREATOR_INPUT =
  'block w-full rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-[rgb(var(--color-bg-surface-inset))] py-3 px-4 text-base sm:text-sm text-[rgb(var(--color-text-primary))] placeholder:text-[rgb(var(--color-text-dim))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))]';
