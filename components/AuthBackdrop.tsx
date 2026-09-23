import React from 'react';
import AmbientAurora from './AmbientAurora';

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
 * Layer order: wash → ruling → aurora → vignette. All of it is
 * `pointer-events-none` and sits under the page's own `z-10` content.
 */
const AuthBackdrop: React.FC = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
    <div className="auth-ambient absolute inset-0" />
    <div className="auth-grid absolute inset-0" />

    {/* Two slow orbs for depth, from the same aurora as the app behind — see
        AmbientAurora for why each drifts on its own path and clock. */}
    <AmbientAurora variant="auth" />

    <div className="auth-vignette absolute inset-0" />
  </div>
);

export default AuthBackdrop;
