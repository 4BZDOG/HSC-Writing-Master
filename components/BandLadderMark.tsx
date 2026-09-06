import React from 'react';
import { getBandConfig } from '../utils/renderUtils';

/**
 * The app's mark: the band ladder, filled to Band 6.
 *
 * This replaced a `Sparkles` glyph on an indigo-to-sky gradient — the generic
 * AI-product mark, which said nothing about HSC assessment and, on the login
 * page, sat directly above the one line that does say it ("Band 6").
 *
 * It is the ladder `drawBandScale` already prints at the top of every marking
 * report: six equal segments, filled up to the band reached. Horizontal and
 * equal is what makes it a scale rather than a bar chart — an earlier attempt
 * with rungs rising left to right turned out to be the signal-strength glyph,
 * which is one stock mark swapped for another. A student meets this device on
 * the way in and again on the report they take away.
 *
 * All six are filled because that is the product's name and its claim. The fill
 * comes from `getBandConfig(6)` rather than a hand-written purple, so it tracks
 * the band palette with everything else (project skill, "Styling"). See
 * `projectDocs/Plan-FrontendDesignReview.md`, finding 8.
 */
const BAND_RUNGS = [1, 2, 3, 4, 5, 6];

interface BandLadderMarkProps {
  /** `hero` is the login page's full-width lockup; `mark` is the header tile,
   *  where the same six segments have to survive being 40px wide. */
  size?: 'hero' | 'mark';
  /** Overrides the band fill — the header tile sits ON the brand gradient, so
   *  purple-on-indigo would disappear and it takes white instead. */
  fillClass?: string;
}

const BandLadderMark: React.FC<BandLadderMarkProps> = ({ size = 'hero', fillClass }) => {
  const fill = fillClass ?? getBandConfig(6).solidBg;
  const isHero = size === 'hero';
  return (
    <div
      role="img"
      aria-label="The NESA band ladder, filled to Band 6"
      className={`flex items-center ${isHero ? 'gap-2 w-[224px]' : 'gap-[2px] w-7 sm:w-8'}`}
    >
      {BAND_RUNGS.map((band) => (
        // Square, with no radius at all: `drawBandScale` prints these as
        // `doc.rect`, and the radius scale starts at `rounded-lg` — 8px on a
        // 4px rung is a capsule, which is a different mark. See
        // `tests/unit/surfaceScale.test.ts`.
        <span key={band} className={`flex-1 ${isHero ? 'h-3' : 'h-2'} ${fill}`} />
      ))}
    </div>
  );
};

export default BandLadderMark;
