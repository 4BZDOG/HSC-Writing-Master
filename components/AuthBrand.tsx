import React from 'react';
import BandLadderMark from './BandLadderMark';

/**
 * The brand block above every signed-out card: the ladder mark, the wordmark,
 * and the lines under it.
 *
 * Sign-in and password reset each had their own copy, and they had drifted:
 * sign-in set the wordmark the way `HEADER_WORDMARK` does (display face, italic
 * caps) over the band ladder, while reset used a sparkles tile and Plex 700 in
 * sentence case. One component means one brand.
 *
 * `align="split"` is the sign-in page's two-column layout: centred on a phone,
 * left-aligned beside the card from 1024px. Reset keeps `center`.
 *
 * The wordmark is the page's `<h1>` on every signed-out screen, so the task
 * heading inside each card ("Create your account", "Choose a new password")
 * is an `<h2>`. The `headline` is a sub-heading that only the wide layout
 * shows; on a phone the tagline carries the same message.
 */
interface AuthBrandProps {
  tagline?: React.ReactNode;
  headline?: React.ReactNode;
  align?: 'center' | 'split';
  className?: string;
}

const AuthBrand: React.FC<AuthBrandProps> = ({
  tagline,
  headline,
  align = 'center',
  className,
}) => {
  const split = align === 'split';
  return (
    <div
      className={`relative z-10 animate-fade-in ${
        split ? 'text-center lg:text-left' : 'text-center mb-8 sm:mb-12'
      } ${className ?? ''}`}
    >
      <div className={`inline-block ${split ? 'mb-6 lg:mb-7' : 'mb-6'}`}>
        <BandLadderMark entrance />
      </div>
      {/* The same name the header sets, set the same way. `t-display` carries the
          face and the weight; the caps, slope and tracking are the wordmark's own
          and are repeated here rather than shared, because the two differ in
          size and nothing else. Below `sm` the wordmark and the gap under the
          ladder are smaller, so the card starts higher on a phone. */}
      <h1 className="t-display text-3xl sm:text-4xl tracking-tight uppercase italic text-white light:text-slate-900 leading-none">
        Band 6
      </h1>
      {headline && (
        <h2 className="hidden lg:block t-display text-4xl xl:text-5xl tracking-tight leading-[1.05] text-white light:text-slate-900 mt-7 max-w-xl">
          {headline}
        </h2>
      )}
      {tagline && (
        <p
          className={`text-slate-400 light:text-slate-600 text-sm leading-relaxed mt-5 max-w-sm ${
            split
              ? 'mx-auto lg:mx-0 lg:mt-6 lg:max-w-md lg:text-base lg:leading-relaxed'
              : 'mx-auto'
          }`}
        >
          {tagline}
        </p>
      )}
    </div>
  );
};

export default AuthBrand;
