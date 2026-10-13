import React from 'react';
import { EvaluationCriterion, Prompt } from '../../types';
import {
  getBandConfig,
  getBandHex,
  getBandName,
  KEYWORD_HIGHLIGHT_CLASS,
  renderFormattedText,
  renderHighlightedText,
  VERB_HIGHLIGHT_CLASS,
  BandConfig,
} from '../../utils/renderUtils';
import { Trophy, type LucideIcon } from 'lucide-react';

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
  <div className="bg-white dark:bg-white/5 rounded-panel p-4 sm:p-5 border border-slate-200/80 dark:border-white/10 shadow-sm flex flex-col gap-3 h-full relative overflow-hidden">
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

// The "Band 6" goal meter: how far this response sits from the app's titular
// goal. Achieved bands fill in the current band's canonical colour (BAND_HEX,
// via getBandHex, so it always matches the placard beside it); the numbered
// rungs and the distance text carry the information without relying on colour.
export const BandGoalCard = ({
  currentBand,
  maxBand,
  capNote,
}: {
  currentBand: number;
  maxBand: number;
  /** Why the goal is where it is, when the command verb caps it. */
  capNote?: React.ReactNode;
}) => {
  const goalConfig = getBandConfig(maxBand);
  const reached = currentBand >= maxBand;
  const bandsAway = Math.max(0, maxBand - currentBand);
  const rungs = Array.from({ length: maxBand }, (_, i) => i + 1);

  return (
    <div className="bg-white dark:bg-white/5 rounded-panel p-4 sm:p-5 border border-slate-200/80 dark:border-white/10 shadow-sm flex flex-col justify-between gap-3 h-full relative overflow-hidden">
      <div className="flex items-center gap-2.5">
        <div className={`p-2 rounded-xl shrink-0 ${goalConfig.bg} ${goalConfig.text}`}>
          <Trophy className="w-4 h-4" />
        </div>
        <h4 className="t-section text-slate-600 dark:text-slate-400 truncate">
          Band {maxBand} Goal
        </h4>
      </div>
      <div>
        <span className="block text-2xl font-black text-slate-900 dark:text-white tracking-tight leading-none mb-3">
          {reached ? 'Achieved' : `${bandsAway} band${bandsAway === 1 ? '' : 's'} to go`}
        </span>
        <div
          className="flex gap-1"
          role="img"
          aria-label={`Band ${currentBand} of ${maxBand} — ${reached ? `Band ${maxBand} achieved` : `${bandsAway} band${bandsAway === 1 ? '' : 's'} from the Band ${maxBand} goal`}`}
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
                  b === maxBand
                    ? goalConfig.text
                    : b <= currentBand
                      ? 'text-slate-600 dark:text-slate-300'
                      : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {b}
              </span>
            </div>
          ))}
        </div>
        {/* The band name belongs to the CURRENT band, so it reads as a caption
            on the meter rather than as a modifier of "n bands to go" above. */}
        <p className="t-label mt-2.5 text-slate-600 dark:text-slate-400">
          Now Band {currentBand} · {getBandName(currentBand)}
        </p>
      </div>
      {capNote && (
        <p className="pt-3 mt-1 border-t border-slate-200/80 dark:border-white/10 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
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
 * One card treatment for every panel in the report.
 *
 * The sections had drifted into four: a `rounded-panel`tinted panel, a
 * `rounded-3xl` white card, a dashed-border callout and a bare region between
 * two hairlines. Read top to bottom the page looked assembled rather than
 * designed, which is most of what "dated" meant here. One radius, one border,
 * one surface — the colour a section carries is then free to mean something.
 */
export const CARD =
  'rounded-panel bg-white dark:bg-white/5 border border-slate-200/80 dark:border-white/10 shadow-sm';

/**
 * The heading above a section: an icon in its section's colour, the label, and
 * an optional trailing chip. Replaces three different treatments — a centred
 * label between two hairline rules, a left-aligned icon pair, and a bare
 * uppercase span — with one, so the eye can find section boundaries without
 * re-learning them each time.
 */
export const SectionHeading: React.FC<{
  icon: React.ElementType;
  label: string;
  tone?: string;
  toneBg?: string;
  children?: React.ReactNode;
}> = ({ icon: Icon, label, tone = 'text-slate-600 dark:text-slate-400', toneBg, children }) => (
  <div className="flex items-center gap-3 mb-4">
    <div className={`p-1.5 rounded-lg ${toneBg ?? 'bg-slate-100 dark:bg-white/10'} ${tone}`}>
      <Icon className="w-3.5 h-3.5" />
    </div>
    <h3 className={`t-section ${tone}`}>{label}</h3>
    {children}
  </div>
);

/**
 * How much of a criterion's marks the response earned, as a filled track.
 *
 * "2 / 4" is a fact the reader has to do arithmetic on, and a list of them is a
 * list of arithmetic; the same fact as a track is read at a glance, and a
 * column of tracks shows which criterion cost the most marks without reading a
 * word. The exported PDF has drawn this since it was written (see METER in
 * pdf/types) — the screen was the one that made you work it out.
 */
export const CriterionMeter: React.FC<{ mark: number; maxMark: number }> = ({ mark, maxMark }) => {
  const ratio = maxMark > 0 ? Math.max(0, Math.min(1, mark / maxMark)) : 0;
  // The same three-step scale the PDF uses, so a printed report and the screen
  // never disagree about which criteria went well.
  const tone =
    ratio >= 0.85
      ? 'bg-emerald-500'
      : ratio >= 0.5
        ? 'bg-amber-500'
        : ratio > 0
          ? 'bg-rose-500'
          : 'bg-slate-300 dark:bg-white/15';
  return (
    <div
      className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden"
      role="img"
      aria-label={`${mark} of ${maxMark} marks awarded`}
    >
      <div
        className={`h-full rounded-full transition-all duration-700 ${tone}`}
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  );
};

// Added interface and used React.FC to correctly allow standard props like 'key' in JSX
interface CriteriaRowProps {
  criterion: EvaluationCriterion;
  maxMark: number;
  mark: number;
  feedback: string;
  prompt: Prompt;
  index?: number;
}

export const CriteriaRow: React.FC<CriteriaRowProps> = ({
  criterion,
  maxMark,
  mark,
  feedback,
  prompt,
  index = 0,
}) => {
  const percentage = maxMark > 0 ? (mark / maxMark) * 100 : 0;
  const isSuccess = percentage === 100;
  const isFailure = percentage === 0;

  return (
    <div
      className={`relative p-5 sm:p-6 ${CARD} animate-fade-in-up-sm CriteriaRow`}
      style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
    >
      <div className="flex items-start justify-between gap-4">
        <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 leading-snug flex-1 min-w-0">
          {/* Numbered, so a criterion can be referred to out loud — "look at
              three" — rather than by quoting its wording back. */}
          <span className="text-slate-600 dark:text-slate-400 tabular-nums mr-2">{index + 1}</span>
          {renderHighlightedText(criterion.criterion, prompt.keywords, prompt.verb)}
        </h4>
        <div
          className={`flex items-baseline gap-0.5 px-2.5 py-1 rounded-lg text-xs font-black shrink-0 tabular-nums ${isSuccess ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : isFailure ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400' : 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300'}`}
        >
          <span>{mark}</span>
          <span className="opacity-40">/</span>
          <span>{maxMark}</span>
        </div>
      </div>

      <div className="mt-3">
        <CriterionMeter mark={mark} maxMark={maxMark} />
      </div>

      <p className="mt-3.5 text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">
        {renderFormattedText(feedback, prompt.keywords, prompt.verb)}
      </p>
    </div>
  );
};
