import React from 'react';
import { getBandHex } from '../utils/renderUtils';

/**
 * The app's mark: the band scale, marked at Band 6.
 *
 * The six rungs are the six bands in the colours students meet everywhere else
 * in the app (`getBandHex`), and the caret above the last rung is the marker
 * from the marking wait's glyph (`MarkingScene` in AiWaitGlyph), landed on
 * Band 6. So the brand is literally the marking scale with the marker placed:
 * a student who has watched a script being marked has already seen this mark.
 *
 * It replaced a `Sparkles` glyph on an indigo-to-sky gradient, the generic
 * AI-product mark, which said nothing about HSC assessment and, on the login
 * page, sat directly above the one line that does ("Band 6").
 *
 * The rungs are square and equal, in a row. Horizontal and equal is what makes
 * it a scale rather than a bar chart: an earlier attempt with rungs rising left
 * to right turned out to be the signal-strength glyph, which is one stock mark
 * swapped for another. Square because `drawBandScale` prints these as
 * `doc.rect`, and the radius scale starts at `rounded-lg`: 8px on a 4px rung is
 * a capsule, which is a different mark. See `tests/unit/surfaceScale.test.ts`.
 * Rung 6 is taller than the rest, as the lit rung is in the marking glyph.
 *
 * Every rung is drawn at full colour. The scale is a claim about all six bands,
 * not a dimmed bar with one lit segment, and the fill comes from `getBandHex`
 * rather than a hand-written hex so it tracks the band palette with everything
 * else (project skill, "Styling").
 *
 * The caret takes `currentColor`, so it follows the page's ink in each theme.
 * It is written light-first, `text-white light:text-slate-900`, the way
 * AuthBrand writes its own wordmark, and not `dark:`-first. The `dark:` variant
 * keys on a `dark` class on <html> that App.tsx sets once a user is signed in;
 * the signed-out screens never set it, so there a `dark:` partner did not apply and the caret
 * went invisible on the dark sign-in page. On a dark ink tile it is white in both
 * themes, and `onInk` says so. Its dot is the Band 6 colour, as it is in the
 * marking glyph.
 *
 * See `projectDocs/Plan-FrontendDesignReview.md`, finding 8.
 */
const BAND_RUNGS = [1, 2, 3, 4, 5, 6];
const TOP_BAND = 6;

/**
 * Every measure for each size, in CSS pixels. These are numbers rather than
 * Tailwind classes because the caret's climb is computed from them: the step
 * from one rung to the next is `ladderStep`, and the keyframes in index.css
 * read it back through `--ladder-step`. A class-based row could not hand that
 * number to the stylesheet.
 *
 * - `hero` is the sign-in page's lockup, 224px across.
 * - `mark` is the tile proportion the favicon and the PDF letterhead are drawn
 *   to (pdf/brand.ts). The header used it until it took `lockup`. It has to
 *   survive being 32px across inside a 40px tile and a 48px one. The rungs are 8px (rung 6 is 14px) and the caret an
 *   8px teardrop: at 5px the strip sat low in an expanse of ink and read as a
 *   row of dots, where the favicon, drawn to fill its tile, read as the mark.
 * - `compact` is the 112px ladder a local data read shows while it waits.
 * - `lockup` is the header's: the scale laid flat over the wordmark, `fluid` so
 *   it is exactly as wide as the word. The rungs are 4px tall, so at the
 *   wordmark's width they are wider than they are tall and read as a scale,
 *   which the 4px-wide `mark` rungs in a tile did not.
 */
const LAYOUT = {
  hero: { width: 224, gap: 8, rung: 12, tall: 22, caret: { w: 14, h: 16 }, caretGap: 6, hop: 8 },
  mark: { width: 32, gap: 2, rung: 8, tall: 14, caret: { w: 8, h: 9 }, caretGap: 1, hop: 2 },
  compact: { width: 112, gap: 6, rung: 8, tall: 14, caret: { w: 9, h: 10 }, caretGap: 3, hop: 4 },
  lockup: { width: 96, gap: 2, rung: 4, tall: 7, caret: { w: 7, h: 8 }, caretGap: 1, hop: 2 },
} as const;

type Layout = (typeof LAYOUT)[keyof typeof LAYOUT];

/** Left edge to left edge, rung to rung: the distance the caret travels per band. */
const ladderStep = (layout: Layout): number =>
  (layout.width - 5 * layout.gap) / BAND_RUNGS.length + layout.gap;

interface BandLadderMarkProps {
  /** `hero` is the login page's full-width lockup; `lockup` is the header's;
   *  `mark` is the tile proportion; `compact` is the local data read's wait
   *  (DataLoading). */
  size?: keyof typeof LAYOUT;
  /** The mark sits on the dark ink tile, so the caret is white in both themes.
   *  Everywhere else the caret is the page's own ink. */
  onInk?: boolean;
  /** The waiting cue. The caret climbs the scale from Band 1 to Band 6, hopping
   *  at each rung, rests on 6, and starts again. Infinite, so it is only for a
   *  wait: the boot splash while a saved session is restored, and DataLoading
   *  while a local read runs. Under reduced motion the global rule ends it at
   *  once, on its final frame, which is the caret on rung 6: the still picture
   *  is the finished mark. */
  animated?: boolean;
  /** The sign-in page's one orchestrated moment: the caret drops onto Band 6
   *  once as the page opens, with a small settle, and then stays. */
  entrance?: boolean;
  /** Take the width of the box it sits in rather than its own. */
  fluid?: boolean;
  /** Hidden from assistive technology, where a heading beside it already names the app. */
  decorative?: boolean;
}

const BandLadderMark: React.FC<BandLadderMarkProps> = ({
  size = 'hero',
  onInk = false,
  animated = false,
  entrance = false,
  fluid = false,
  decorative = false,
}) => {
  const layout = LAYOUT[size];
  const { caret } = layout;

  // Only the caret moves, and only with a transform: the keyframes in index.css
  // read these two variables, so one stylesheet serves every size.
  const caretStyle = {
    marginBottom: layout.caretGap,
    '--ladder-step': `${ladderStep(layout)}px`,
    '--ladder-hop': `${layout.hop}px`,
  } as React.CSSProperties;
  const caretMotion = animated ? 'ladder-climb' : entrance ? 'ladder-drop' : '';

  return (
    <div
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : 'The NESA band scale, marked at Band 6'}
      aria-hidden={decorative || undefined}
      className="flex flex-col"
      style={{ width: fluid ? '100%' : layout.width }}
    >
      {/* The caret lane. Its slots are the rung slots, so the caret sits over
          rung 6 by construction and the two rows cannot drift apart. */}
      <div
        aria-hidden="true"
        className="flex items-end"
        style={{ gap: layout.gap, height: caret.h + layout.caretGap }}
      >
        {BAND_RUNGS.map((band) => (
          <span key={band} className="flex flex-1 justify-center items-end h-full">
            {band === TOP_BAND && (
              <svg
                viewBox="0 0 14 16"
                width={caret.w}
                height={caret.h}
                focusable="false"
                className={`block shrink-0 overflow-visible ${onInk ? 'text-white' : 'text-white light:text-slate-900'} ${caretMotion}`}
                style={caretStyle}
              >
                <path d="M7 16 L1 5 A6 6 0 1 1 13 5 Z" fill="currentColor" />
                <circle cx="7" cy="5.5" r="2.2" fill={getBandHex(TOP_BAND)} />
              </svg>
            )}
          </span>
        ))}
      </div>
      <div className="flex items-end" style={{ gap: layout.gap }}>
        {BAND_RUNGS.map((band) => (
          // Square, with no radius at all (see the file comment). The fill is
          // inline because the six colours come from `getBandHex`, and a Tailwind
          // class cannot be built from a runtime value.
          <span
            key={band}
            data-band={band}
            className="block flex-1"
            style={{
              height: band === TOP_BAND ? layout.tall : layout.rung,
              backgroundColor: getBandHex(band),
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default BandLadderMark;
