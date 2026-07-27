import React from 'react';

interface AiBusyOverlayProps {
  /** Nothing renders unless this is true — call sites read as `<AiBusyOverlay show={isLoading}>`. */
  show: boolean;
  /** The wait card itself, almost always a `<LoadingIndicator />`. */
  children: React.ReactNode;
  /**
   * Corner radius. Inherited from the covered surface by default, so the veil
   * follows whatever shell it is dropped into rather than assuming one radius.
   */
  rounded?: string;
  /** Stacking context of the covered surface. Defaults above modal content. */
  z?: string;
  /** Extra width constraint for the card. Defaults to a comfortable column. */
  maxWidth?: string;
}

/**
 * The one way an AI request covers the surface that started it.
 *
 * Ten call sites had each invented their own veil: opacities from 60% to 95%,
 * blurs from `sm` to `3xl`, some rounded and some square, some animated in and
 * some snapping into place. Side by side in one session they read as different
 * apps. This fixes the recipe — a deep, even blur, a wash that works on both
 * themes, corners that follow the surface underneath, and one entrance
 * animation — so every wait in the app feels like the same wait.
 *
 * The overlay is deliberately opaque enough to stop the content behind it
 * being read mid-change, and it swallows pointer events so nothing underneath
 * can be clicked while the request is in flight.
 */
const AiBusyOverlay: React.FC<AiBusyOverlayProps> = ({
  show,
  children,
  rounded = 'rounded-[inherit]',
  z = 'z-50',
  maxWidth = 'max-w-md',
}) => {
  if (!show) return null;

  return (
    <div
      className={`absolute inset-0 ${z} ${rounded} flex items-center justify-center p-4 sm:p-6 cursor-wait animate-fade-in bg-white/80 dark:bg-[rgb(var(--color-bg-base))]/75 backdrop-blur-xl`}
      role="presentation"
    >
      {/* A soft accent bloom behind the card so it lifts off the blur rather
          than floating on a flat grey pane. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          background:
            'radial-gradient(ellipse 60% 45% at 50% 50%, rgba(99,102,241,0.18), transparent 70%)',
        }}
      />
      <div className={`relative w-full ${maxWidth} animate-in`}>{children}</div>
    </div>
  );
};

export default AiBusyOverlay;
