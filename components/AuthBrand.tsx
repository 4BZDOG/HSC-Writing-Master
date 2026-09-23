import React from 'react';
import BandLadderMark from './BandLadderMark';

/**
 * The brand block above every signed-out card — the ladder mark, the wordmark
 * and an optional line under it.
 *
 * Sign-in and password reset each had their own copy, and they had drifted:
 * sign-in set the wordmark the way `HEADER_WORDMARK` does (display face, italic
 * caps) over the band ladder, while reset used a sparkles tile and Plex 700 in
 * sentence case. Someone following a reset link from their email met a
 * different-looking app from the one they signed up to. One component means
 * one brand.
 *
 * The wordmark is the page's `<h1>` on every signed-out screen, so the task
 * heading inside each card ("Create your account", "Choose a new password")
 * is an `<h2>`.
 */
const AuthBrand: React.FC<{ tagline?: React.ReactNode }> = ({ tagline }) => (
  <div className="text-center mb-10 sm:mb-12 relative z-10 animate-fade-in">
    <div className="inline-block mb-6">
      <BandLadderMark />
    </div>
    {/* The same name the header sets, set the same way. `t-display` carries the
        face and the weight; the caps, slope and tracking are the wordmark's own
        and are repeated here rather than shared, because the two differ in
        size and nothing else. */}
    <h1 className="t-display text-4xl tracking-tighter uppercase italic text-white light:text-slate-900 leading-none">
      Band 6
    </h1>
    {tagline && (
      <p className="text-slate-400 light:text-slate-600 text-sm mt-5 max-w-sm mx-auto leading-relaxed">
        {tagline}
      </p>
    )}
  </div>
);

export default AuthBrand;
