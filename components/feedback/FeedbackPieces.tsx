import React from 'react';
import { Trophy, type LucideIcon } from 'lucide-react';
import {
  getBandConfig,
  getBandHex,
  BandConfig,
  VERB_HIGHLIGHT_CLASS,
  KEYWORD_HIGHLIGHT_CLASS,
} from '../../utils/renderUtils';
import { LADDER_SOLID } from '../../utils/ladderChrome';
import { FEEDBACK_CARD, FEEDBACK_HEADING, FEEDBACK_TILE } from './feedbackChrome';

export const MetricCard = ({
  label,
  value,
  subtext,
  icon: Icon,
  theme,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  icon: LucideIcon;
  theme: BandConfig;
}) => (
  <div
    className={`${FEEDBACK_CARD} p-4 sm:p-5 flex flex-col gap-3 h-full relative overflow-hidden`}
  >
    {/* Icon sits inline with its label rather than floating in its own row —
        keeps the tile compact so the score placard beside it doesn't have to
        stretch to match an artificially tall column. */}
    <div className="flex items-center gap-2.5">
      <div className={`p-2 rounded-xl shrink-0 ${theme.bg} ${theme.text}`}>
        <Icon className="w-4 h-4" />
      </div>
      <h4 className="t-label text-slate-600 dark:text-slate-400 truncate">{label}</h4>
    </div>
    <div className="flex items-baseline gap-1.5 mt-auto">
      <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-none">
        {value}
      </span>
      {subtext && <span className="t-label text-slate-600 dark:text-slate-400">{subtext}</span>}
    </div>
  </div>
);

/**
 * The goal the report measures against: the band the question can reach, how
 * far this response is from full marks, and the band it has reached.
 *
 * "Achieved" is said only at full marks. Band 6 reached on 5/6 is a band, not a
 * goal met, and the old card read "Band 1 Goal: Achieved" beside 1/2 — a
 * statement the mark beside it did not support. The mark itself is not stated
 * here: the placard is the one place it is written, and this says how far that
 * mark is from full in words.
 */
export const BandGoalCard = ({
  currentBand,
  maxBand,
  marksToFull,
  capNote,
}: {
  currentBand: number;
  maxBand: number;
  /** Marks between this response and full marks. Zero or less is full marks. */
  marksToFull: number;
  /** Why the goal is where it is, when the command verb caps it. */
  capNote?: React.ReactNode;
}) => {
  const goalConfig = getBandConfig(maxBand);
  const full = marksToFull <= 0;
  const rungs = Array.from({ length: maxBand }, (_, i) => i + 1);

  return (
    <div className={`${FEEDBACK_CARD} p-4 sm:p-5 flex flex-col gap-4 relative overflow-hidden`}>
      <div className="flex items-center gap-2.5">
        <div className={`${FEEDBACK_TILE} ${goalConfig.bg} ${goalConfig.text}`}>
          <Trophy className="w-4 h-4" />
        </div>
        <h4 className={FEEDBACK_HEADING}>Band {maxBand} goal</h4>
      </div>
      <div className="flex flex-col gap-3">
        <p className="text-base font-bold text-slate-900 dark:text-white leading-snug">
          {full ? 'Achieved' : `Band ${currentBand} reached`}
          <span className="font-medium text-slate-600 dark:text-slate-400">
            {' '}
            ·{' '}
            {full ? 'full marks' : `${marksToFull} ${marksToFull === 1 ? 'mark' : 'marks'} to full`}
          </span>
        </p>
        <div
          className="flex gap-1"
          role="img"
          aria-label={`Band ${currentBand} of ${maxBand} — ${full ? `Band ${maxBand} achieved` : `Band ${maxBand} is the goal`}`}
        >
          {rungs.map((b) => (
            <div key={b} className="flex-1 flex flex-col items-center gap-1.5">
              <div
                className={`h-2 w-full rounded-full transition-colors duration-500 ${
                  b <= currentBand ? '' : 'bg-slate-200 dark:bg-white/10'
                }`}
                style={b <= currentBand ? { backgroundColor: getBandHex(b) } : undefined}
              />
              <span
                className={`text-[9px] font-bold leading-none ${
                  b === maxBand ? goalConfig.text : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {b}
              </span>
            </div>
          ))}
        </div>
      </div>
      {capNote && (
        <p className="pt-3 border-t border-slate-200/80 dark:border-white/10 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          {capNote}
        </p>
      )}
    </div>
  );
};

/**
 * The one-line key for the highlighting in this report, shown once under the question.
 *
 * The samples are the real classes the text uses, so the key cannot drift from the
 * thing it explains. It is shown only when there is something to explain: a question
 * with neither a command verb nor syllabus terms highlights nothing, and a key for it
 * would be a legend for an absent colour.
 */
export const HighlightKey: React.FC<{ hasVerb: boolean; hasTerms: boolean }> = ({
  hasVerb,
  hasTerms,
}) => {
  if (!hasVerb && !hasTerms) return null;
  return (
    <p className="t-label flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-600 dark:text-slate-400">
      <span>Highlighted:</span>
      {hasVerb && <span className={VERB_HIGHLIGHT_CLASS}>command verb</span>}
      {hasVerb && hasTerms && <span aria-hidden="true">·</span>}
      {hasTerms && <span className={KEYWORD_HIGHLIGHT_CLASS}>syllabus terms</span>}
    </p>
  );
};

/**
 * The heading above a section: an icon tile in the section's tone, then the
 * heading itself in sentence case. The tone lives in the tile, so the heading
 * stays in primary ink and reads the same whichever section it heads.
 */
export const SectionHeading: React.FC<{
  icon: React.ElementType;
  label: string;
  tone?: string;
  toneBg?: string;
  children?: React.ReactNode;
}> = ({ icon: Icon, label, tone = 'text-slate-600 dark:text-slate-400', toneBg, children }) => (
  // Wraps, so an aside (the rewrite's "one mark higher · Band 2") drops to a line of
  // its own on a phone instead of being squeezed into two ragged lines beside the title.
  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-4 min-w-0">
    <div className={`${FEEDBACK_TILE} ${toneBg ?? 'bg-slate-100 dark:bg-white/10'} ${tone}`}>
      <Icon className="w-3.5 h-3.5" />
    </div>
    <h3 className={FEEDBACK_HEADING}>{label}</h3>
    {children}
  </div>
);

/**
 * How much of a criterion's marks the response earned, as a filled track.
 *
 * "2 / 4" is a fact the reader has to do arithmetic on, and a list of them is a
 * list of arithmetic; the same fact as a track is read at a glance. The track is
 * the band's own solid fill, so the meters of a report share the colour of the
 * placard above them rather than a traffic light of their own.
 */
export const CriterionMeter: React.FC<{ mark: number; maxMark: number }> = ({ mark, maxMark }) => {
  const ratio = maxMark > 0 ? Math.max(0, Math.min(1, mark / maxMark)) : 0;
  return (
    <div
      className="h-1.5 w-full rounded-full bg-slate-950/10 dark:bg-white/15 overflow-hidden"
      role="img"
      aria-label={`${mark} of ${maxMark} marks awarded`}
    >
      <div
        className={`h-full rounded-full transition-all duration-700 ${LADDER_SOLID}`}
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  );
};
