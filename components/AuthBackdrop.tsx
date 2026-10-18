import React from 'react';

/**
 * The backdrop shared by every signed-out screen (sign-in, password reset).
 *
 * It paints no ground of its own: the app's AnimatedBackground is already
 * mounted behind these pages, so sign-in sits on the same quiet aurora as the
 * rest of the app. All it adds is the ruling of an HSC writing booklet, faint
 * horizontal lines that give the empty space a texture from the thing a
 * student is here to do.
 *
 * It used to lay a second, heavier sky over the app's: an indigo-and-violet
 * wash, two more drifting orbs, a 44px grid fading out from the centre and a
 * vignette. That is the stock look of a generated landing page, and it said
 * nothing about writing an answer.
 */
const AuthBackdrop: React.FC = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
    <div className="auth-ruling absolute inset-0" />
  </div>
);

export default AuthBackdrop;
