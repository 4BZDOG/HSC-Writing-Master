import React from 'react';
import { Award, Target, Trophy } from 'lucide-react';
import { getBandName } from '../../utils/renderUtils';
import { ladderBandVars } from '../LadderRow';
import { BAND_GROUND, INK_CHIP } from './feedbackChrome';

interface ScorePlacardProps {
  /** The band the response was marked in. Its colour is the placard's ground. */
  band: number;
  /** The mark awarded. The one place the mark is written on the report. */
  mark: number;
  total: number;
  /** At the question's own ceiling, or full marks: the trophy, not the target. */
  atCeiling: boolean;
  /** Export and any other actions, drawn in the placard's ink. */
  actions?: React.ReactNode;
}

/**
 * The result placard: the band as a solid fill, the mark in the band's ink.
 *
 * It is the report's one authoritative statement of the mark. Every other
 * surface says what the mark means in words ("two marks to full", "one mark
 * higher") and points back here, so a student never has to reconcile two figures.
 *
 * The ground is the flat band (`BAND_GROUND`), with the ink of `band-solid`, so
 * no band is ever under white text (bands 2–4 measure 1.9–2.8:1 with white).
 */
const ScorePlacard: React.FC<ScorePlacardProps> = ({ band, mark, total, atCeiling, actions }) => (
  <div
    className={`${BAND_GROUND} clip-stable relative rounded-panel overflow-hidden p-7 sm:p-8 shadow-lg`}
    style={ladderBandVars(band)}
  >
    <div className="flex flex-col justify-between gap-6">
      <div className="flex flex-col gap-5">
        <div className="flex justify-between items-start gap-4">
          <div className="min-w-0">
            <div
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4 ${INK_CHIP}`}
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
            <p className="text-6xl sm:text-7xl font-black tracking-tight italic leading-none">
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
            <p className="t-label mt-2">Result</p>
          </div>
          <div className="w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center border border-slate-950/25 bg-slate-950/10 no-print">
            {atCeiling ? (
              <Trophy className="w-7 h-7" aria-hidden="true" />
            ) : (
              <Target className="w-7 h-7" aria-hidden="true" />
            )}
          </div>
        </div>

        {/* Marks awarded as a share of the total — gives the placard's middle a
            purpose instead of leaving a gradient void when the column stretches. */}
        <div
          className="h-1.5 w-full rounded-full bg-slate-950/20 overflow-hidden"
          role="img"
          aria-label={`${mark} of ${total} marks awarded`}
        >
          <div
            className="h-full rounded-full bg-slate-950 transition-all duration-700"
            style={{ width: `${total > 0 ? Math.min(100, (mark / total) * 100) : 0}%` }}
          />
        </div>
      </div>

      {actions && <div className="flex flex-wrap gap-3 no-print">{actions}</div>}
    </div>
  </div>
);

export default ScorePlacard;
