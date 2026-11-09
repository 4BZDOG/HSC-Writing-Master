import React from 'react';
import { Award, Target, Trophy } from 'lucide-react';
import { getBandConfig, getBandName } from '../../utils/renderUtils';
import { LADDER_SOLID } from '../../utils/ladderChrome';
import { ladderBandVars } from '../LadderRow';

interface ScorePlacardProps {
  /** The band the response was marked in. Its colour is the placard's wash and edge. */
  band: number;
  /** The mark awarded. The one place the mark is written on the report. */
  mark: number;
  total: number;
  /** At the question's own ceiling, or full marks: the trophy, not the target. */
  atCeiling: boolean;
  /** Export and any other actions, drawn as the report's neutral secondary actions. */
  actions?: React.ReactNode;
}

/**
 * The result placard: the band identifies the mark, it does not fill the card.
 *
 * The card is paper with a faint wash of the band and a band edge, and the mark is set
 * in the band's ink: the light tint of the band in the dark theme, its deep ink on white
 * in the light. The band also shows as an outline chip, the progress fill and the target
 * tile's icon. The saturated fill is kept for the progress bar, a small band mark, which
 * reads as the band without making a failure notice of the card. The wash, edge and ink
 * are the `band-placard` and `band-ink` classes in `index.css`.
 *
 * It is the report's one authoritative statement of the mark. Every other surface says
 * what the mark means in words ("two marks to full", "one mark higher") and points back
 * here, so a student never has to reconcile two figures.
 */
const ScorePlacard: React.FC<ScorePlacardProps> = ({ band, mark, total, atCeiling, actions }) => {
  const ink = getBandConfig(band).text;
  return (
    <div
      className={`band-placard clip-stable relative rounded-panel overflow-hidden bg-surface p-7 sm:p-8 shadow-sm text-slate-900 dark:text-white`}
      style={ladderBandVars(band)}
    >
      <div className="flex flex-col justify-between gap-6">
        <div className="flex flex-col gap-5">
          <div className="flex justify-between items-start gap-4">
            <div className="min-w-0">
              <div
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4 border border-current ${ink} band-ink`}
              >
                <Award className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="t-label">
                  Band {band} · {getBandName(band)}
                </span>
              </div>
              {/* A `<p>`, not the `<h1>` it was. A number is not a heading:
                it made the mark the page's second level-one heading,
                under this panel's own `<h2>`, and a screen reader read
                it as "15 slash 20". The slash is drawn for the eye and
                "out of" is spoken for the ear. */}
              <p
                className={`text-6xl sm:text-7xl font-black tracking-tight italic leading-none ${ink} band-ink`}
              >
                {mark}
                <span className="text-3xl font-medium align-top" aria-hidden="true">
                  /{total}
                </span>
                <span className="sr-only"> out of {total}</span>
              </p>
              {/* "Result", not "Assessment Score". The word carries weight in the HSC
                that practice marking has not earned, which is why it was taken out
                of the exported report; the screen it was exported from still said
                it. See pdf/buildBlocks.ts, where the same cell is labelled. */}
              <p className="t-label mt-2 text-slate-700 dark:text-slate-300">Result</p>
            </div>
            <div className="w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center border border-slate-500 bg-slate-900/[0.03] dark:border-white/40 dark:bg-white/[0.06] no-print">
              <span className={`${ink} band-ink flex`}>
                {atCeiling ? (
                  <Trophy className="w-7 h-7" aria-hidden="true" />
                ) : (
                  <Target className="w-7 h-7" aria-hidden="true" />
                )}
              </span>
            </div>
          </div>

          {/* Marks awarded as a share of the total — gives the placard's middle a
            purpose instead of leaving a gradient void when the column stretches. The
            track is neutral, so the band's fill is the only colour in it. */}
          <div
            className="h-1.5 w-full rounded-full bg-slate-900/10 dark:bg-white/15 overflow-hidden"
            role="img"
            aria-label={`${mark} of ${total} marks awarded`}
          >
            <div
              className={`h-full rounded-full transition-all duration-700 ${LADDER_SOLID}`}
              style={{ width: `${total > 0 ? Math.min(100, (mark / total) * 100) : 0}%` }}
            />
          </div>
        </div>

        {actions && <div className="flex flex-wrap gap-3 no-print">{actions}</div>}
      </div>
    </div>
  );
};

export default ScorePlacard;
