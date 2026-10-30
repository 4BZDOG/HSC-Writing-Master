import React, { useMemo } from 'react';
import type { PromptVerb } from '../types';
import {
  getCommandTermInfo,
  getFullMarkWordRange,
  getRecommendedTime,
  getStructureExpectation,
  TIER_GROUPS,
} from '../data/commandTerms';
import { getBandConfig } from '../utils/renderUtils';
import AlternativesList from './AlternativesList';

interface QuestionExpectationsProps {
  verb: PromptVerb;
  marks: number;
  /** The band a full-mark response reaches. Colours the figures. */
  band: number;
  /** For a surface with no verb head of its own (the outcome brief): open with what
   *  the verb means, and close with why the band is capped and that the figures are
   *  a general guide. The command verb guide says both in its own head and its
   *  marking section, so it leaves this off. */
  standalone?: boolean;
}

/**
 * One figure: a name over a value, set as a description list so a screen reader
 * hears each name with its value. Same figure the command verb guide draws.
 */
const Figure: React.FC<{ label: string; value: string; tone: string }> = ({
  label,
  value,
  tone,
}) => (
  <div>
    <dt className="t-label text-[rgb(var(--color-text-muted))]">{label}</dt>
    <dd className={`mt-0.5 font-mono font-bold tabular-nums text-base leading-tight ${tone}`}>
      {value}
    </dd>
  </div>
);

/**
 * What a marker is looking for in THIS question: how long a full-mark answer
 * usually runs, how long to spend, and what the answer has to contain. The band
 * a full mark reaches is already on the screen both callers sit on, so it is only
 * restated where the panel stands alone.
 *
 * Nothing here is written for the panel. The figures come from the same
 * functions the live word guide and the marker read (`getFullMarkWordRange`,
 * `getRecommendedTime`, `getStructureExpectation`), and the band is the one the
 * question's card already shows, so the panel cannot disagree with the screen
 * it was opened from.
 */
const QuestionExpectations: React.FC<QuestionExpectationsProps> = ({
  verb,
  marks,
  band,
  standalone = false,
}) => {
  const info = useMemo(() => getCommandTermInfo(verb), [verb]);
  const tone = getBandConfig(band).text;
  const tierTitle = TIER_GROUPS.find((group) => group.tier === info.tier)?.title;
  const [minWords, maxWords] = getFullMarkWordRange(marks);
  const minutes = Math.max(1, Math.round(getRecommendedTime(marks, info) / 60));
  const structure = getStructureExpectation(marks);
  // "A OR B OR C." as its alternatives, each a sentence of its own.
  const alternatives = structure
    .replace(/\.$/, '')
    .split(/\s+OR\s+/)
    .map((alt) => `${alt.charAt(0).toUpperCase()}${alt.slice(1)}.`);

  return (
    <div>
      {standalone && (
        <p className="t-body text-[rgb(var(--color-text-secondary))]">
          <span className="font-semibold text-[rgb(var(--color-text-primary))]">{info.term}</span>{' '}
          means: {info.definition}
        </p>
      )}
      <dl className={`${standalone ? 'mt-3' : ''} flex flex-wrap gap-x-8 gap-y-3`}>
        <Figure
          label="Length"
          value={`${minWords}–${maxWords}${marks >= 10 ? '+' : ''} words`}
          tone={tone}
        />
        <Figure label="Time" value={`about ${minutes} min`} tone={tone} />
      </dl>
      {alternatives.length > 1 ? (
        // Two or three ways to full marks, as bullets with "OR" between: on one
        // line they read as a single requirement.
        <div className="mt-3 t-body text-[rgb(var(--color-text-secondary))]">
          <p className="font-semibold text-[rgb(var(--color-text-primary))]">
            A full-mark answer has any one of:
          </p>
          <div className="mt-1.5">
            <AlternativesList parts={alternatives.map((alt) => [alt])} />
          </div>
        </div>
      ) : (
        <p className="mt-3 t-body text-[rgb(var(--color-text-secondary))]">
          <span className="font-semibold text-[rgb(var(--color-text-primary))]">
            A full-mark answer:
          </span>{' '}
          {structure}
        </p>
      )}
      {standalone && (
        <p className="mt-2 t-label text-[rgb(var(--color-text-dim))]">
          {tierTitle
            ? band < info.tier
              ? `${info.term} is a “${tierTitle}” verb; in this course a full-mark response reaches Band ${band}. `
              : `${info.term} is a “${tierTitle}” verb: it sets the highest band a response can reach, here Band ${band}. `
            : ''}
          A general guide. Your paper&rsquo;s own marking guidelines win.
        </p>
      )}
    </div>
  );
};

export default QuestionExpectations;
