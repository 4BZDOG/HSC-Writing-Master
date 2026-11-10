import React from 'react';
import { ArrowRight, Trophy } from 'lucide-react';
import type { ReportLevels } from '../../utils/reportLevels';
import { ladderBandVars } from '../LadderRow';
import { BAND_GROUND } from './feedbackChrome';

interface LevelKeyProps {
  /** The three levels (`reportLevels`): You, the Improved or next level, and the top. */
  you: ReportLevels['you'];
  next: ReportLevels['next'];
  top: ReportLevels['top'];
  /** The question's total marks, for the spoken sentence. */
  total: number;
  /**
   * The Improved figure while the review's replay counts it up. Only the numeral
   * changes; the band and the sentence stay the rewrite's own.
   */
  countingMark?: number;
  className?: string;
}

/** The sentence the group is named by: the whole key, said in words, for a screen reader. */
const levelSentence = (
  you: ReportLevels['you'],
  next: ReportLevels['next'],
  top: ReportLevels['top'],
  total: number
): string => {
  const head = `You scored ${you.mark} out of ${total}, Band ${you.band}.`;
  if (!next) return `${head} That is the top of this question.`;
  const subject = next.isRewrite ? 'The improved response' : 'The next level';
  if (next.mark >= total) {
    return `${head} ${subject} reaches ${next.mark} out of ${total}, Band ${next.band}, the top of this question.`;
  }
  return `${head} ${subject} reaches ${next.mark} out of ${total}, Band ${next.band}. The top of this question is ${top.mark} out of ${top.mark}, Band ${top.band}.`;
};

/**
 * The level key in a post-marking window's header: where the student is (You), where
 * the rewrite gets them (Improved, or Next when there is no rewrite to show) and what
 * the top of the question is (Top). It is the header's one statement of the three
 * levels, so it sits in the same place in both windows.
 *
 * Each tile is a chip filled in its own band, with a caption above it and "Band N"
 * beneath: the three colours a student sees in the key are the three levels, at full
 * strength, and every other use of those colours in the window points back to them. The
 * header's ground is the You band's ink, so the captions are white on it, the pairing the
 * header already holds to AA, and each chip carries the report's ink on a band. Top is
 * joined by a dotted connector, because it is the aspiration, not the next step.
 *
 * Full marks: one tile, "Band N · top", with a trophy. An improvement that reaches the
 * top: two tiles, the second "Band N · top", and no third tile saying the same again.
 */
const LevelKey: React.FC<LevelKeyProps> = ({
  you,
  next,
  top,
  total,
  countingMark,
  className = '',
}) => {
  const sentence = levelSentence(you, next, top, total);
  const atFull = next === null;
  const reachesTop = next !== null && next.mark >= total;
  const nextCaption = next?.isRewrite ? 'Improved' : 'Next';

  return (
    <div
      role="group"
      aria-label={sentence}
      className={`flex items-start gap-2 sm:gap-3 shrink-0 max-sm:w-full max-sm:justify-between ${className}`}
    >
      <LevelTile
        caption="You"
        mark={you.mark}
        band={you.band}
        footer={atFull ? `Band ${you.band} · top` : `Band ${you.band}`}
      />
      {atFull ? (
        <Trophy className="w-4 h-4 mt-6 text-white shrink-0" aria-hidden="true" />
      ) : (
        <>
          <ArrowRight className="w-4 h-4 mt-6 text-white shrink-0" aria-hidden="true" />
          <LevelTile
            caption={nextCaption}
            mark={countingMark ?? next.mark}
            band={next.band}
            footer={reachesTop ? `Band ${next.band} · top` : `Band ${next.band}`}
            strong
            figureAttr
          />
          {!reachesTop && (
            <>
              <span
                aria-hidden="true"
                className="mt-[31px] w-4 border-t-2 border-dotted border-white/80 shrink-0"
              />
              <LevelTile
                caption="Top"
                mark={top.mark}
                band={top.band}
                footer={`Band ${top.band}`}
              />
            </>
          )}
        </>
      )}
    </div>
  );
};

const LevelTile: React.FC<{
  caption: string;
  mark: number;
  band: number;
  footer: string;
  /** The Improved tile: one step stronger than the others. */
  strong?: boolean;
  /** Carries `data-mark-figure="target"`, which the review's replay counts up. */
  figureAttr?: boolean;
}> = ({ caption, mark, band, footer, strong = false, figureAttr = false }) => (
  <div className="flex flex-col items-center gap-1 min-w-0">
    <span className="t-label leading-3 text-white whitespace-nowrap">{caption}</span>
    {/* The tile is the band itself: its flat ground with the ink the report draws on a
        band (`BAND_GROUND`, AA on all six), so the level's colour is the whole chip and
        not a trim on it. The white ring sets the tile off the header, whose ground is
        the You band's own ink. */}
    <span
      data-mark-figure={figureAttr ? 'target' : undefined}
      data-level-band={band}
      style={ladderBandVars(band)}
      className={`${BAND_GROUND} inline-flex items-center justify-center min-w-[2.25rem] px-2 rounded-lg tabular-nums shadow-sm ${
        strong
          ? 'h-8 text-lg font-black ring-2 ring-white'
          : 'h-8 text-base font-bold ring-1 ring-white/70'
      }`}
    >
      {mark}
    </span>
    <span className="t-label leading-3 text-white tabular-nums whitespace-nowrap">{footer}</span>
  </div>
);

export default LevelKey;
