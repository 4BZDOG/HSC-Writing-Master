import React from 'react';

/**
 * The backdrop shared by every signed-out screen (sign-in, password reset).
 *
 * It deliberately does NOT paint an opaque base. The app's AnimatedBackground
 * is already mounted behind these pages; the sign-in screen used to cover it
 * with a flat `--color-bg-base` panel and then lay two `mix-blend-screen` blobs
 * over the top — a blend mode that does nothing against a near-white ground, so
 * the light theme resolved to a bare white sheet while the dark theme got its
 * aurora. These layers are defined per theme in index.css instead, so both are
 * composed on purpose.
 *
 * Layer order: wash → ruling → drifting orbs → vignette. All of it is
 * `pointer-events-none` and sits under the page's own `z-10` content.
 */
const AuthBackdrop: React.FC = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
    <div className="auth-ambient absolute inset-0" />
    <div className="auth-grid absolute inset-0" />

    {/* Two slow orbs for depth. Each theme gets its own blend mode and weight:
        `screen` lifts a dark ground, `multiply` deepens a light one — using
        either alone is what made the two themes look unrelated. */}
    <div className="absolute inset-0 light:hidden">
      <div
        className="absolute -top-24 -left-20 w-[32rem] h-[32rem] rounded-full bg-indigo-600 mix-blend-screen blur-[130px] opacity-25"
        style={{ animation: 'blob 16s infinite ease-in-out' }}
      />
      <div
        className="absolute -bottom-32 -right-16 w-[30rem] h-[30rem] rounded-full bg-sky-500 mix-blend-screen blur-[130px] opacity-20"
        style={{ animation: 'blob 16s infinite ease-in-out', animationDelay: '5s' }}
      />
    </div>
    <div className="absolute inset-0 hidden light:block">
      <div
        className="absolute -top-24 -left-20 w-[32rem] h-[32rem] rounded-full bg-indigo-300 mix-blend-multiply blur-[130px] opacity-45"
        style={{ animation: 'blob 16s infinite ease-in-out' }}
      />
      <div
        className="absolute -bottom-32 -right-16 w-[30rem] h-[30rem] rounded-full bg-sky-300 mix-blend-multiply blur-[130px] opacity-40"
        style={{ animation: 'blob 16s infinite ease-in-out', animationDelay: '5s' }}
      />
    </div>

    <div className="auth-vignette absolute inset-0" />
  </div>
);

export default AuthBackdrop;
