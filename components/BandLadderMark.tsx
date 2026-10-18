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

/** Row gap and width, and rung height, for each size. */
const LAYOUT = {
  hero: { row: 'gap-2 w-[224px]', rung: 'h-3' },
  mark: { row: 'gap-[2px] w-7 sm:w-8', rung: 'h-2' },
  compact: { row: 'gap-1.5 w-28', rung: 'h-2' },
} as const;

interface BandLadderMarkProps {
  /** `hero` is the login page's full-width lockup; `mark` is the header tile,
   *  where the same six segments have to survive being 40px wide; `compact` is
   *  the 112px ladder a local data read shows while it waits (DataLoading). */
  size?: 'hero' | 'mark' | 'compact';
  /** Overrides the band fill — the header tile sits ON the brand gradient, so
   *  purple-on-indigo would disappear and it takes white instead. */
  fillClass?: string;
  /** Waiting cue: each rung dips in turn, staggered left to right (the boot
   *  splash while a saved session is restored, and DataLoading while a local
   *  read runs). Opacity only, and it is stilled under reduced motion. Off
   *  everywhere the mark is a mark, not a wait. */
  animated?: boolean;
}

const BandLadderMark: React.FC<BandLadderMarkProps> = ({
  size = 'hero',
  fillClass,
  animated = false,
}) => {
  const fill = fillClass ?? getBandConfig(6).solidBg;
  const layout = LAYOUT[size];
  return (
    <div
      role="img"
      aria-label="The NESA band ladder, filled to Band 6"
      className={`flex items-center ${layout.row}`}
    >
      {BAND_RUNGS.map((band, i) => (
        // Square, with no radius at all: `drawBandScale` prints these as
        // `doc.rect`, and the radius scale starts at `rounded-lg` — 8px on a
        // 4px rung is a capsule, which is a different mark. See
        // `tests/unit/surfaceScale.test.ts`.
        <span
          key={band}
          className={`flex-1 ${layout.rung} ${fill}${animated ? ' ladder-boot-rung' : ''}`}
          style={animated ? { animationDelay: `${i * 120}ms` } : undefined}
        />
      ))}
    </div>
  );
};

export default BandLadderMark;
