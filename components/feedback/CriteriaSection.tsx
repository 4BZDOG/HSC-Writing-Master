import React from 'react';
import { ClipboardList } from 'lucide-react';
import { EvaluationResult, Prompt } from '../../types';
import { getBandConfig, renderFormattedText, renderHighlightedText } from '../../utils/renderUtils';
import { planLabelForFeature } from '../../services/entitlements';
import { PlusLockChip, ContentLockOverlay } from '../UpgradeModal';
import { ladderBandVars } from '../LadderRow';
import {
  LADDER_EDGE_SHUT,
  LADDER_GUTTER,
  LADDER_GUTTER_MARK,
  LADDER_GUTTER_TOTAL,
} from '../../utils/ladderChrome';
import { CriterionMeter, SectionHeading } from './FeedbackPieces';
import { FEEDBACK_CARD_NEUTRAL } from './feedbackChrome';

interface CriteriaSectionProps {
  criteria: EvaluationResult['criteria'];
  /** The band the response was marked in. Every criterion row is drawn in it. */
  band: number;
  prompt: Prompt;
  /** The plan withholds the per-criterion prose; the rows are drawn blurred behind a lock. */
  feedbackLocked: boolean;
  className?: string;
}

/**
 * Whether the row at `index` is the last of an odd count, so that at `xl`, where
 * rows pair up, it has no partner and should span the row. Pure, so the rule is
 * tested without a layout.
 */
export const isLoneLastRow = (index: number, count: number): boolean =>
  count % 2 === 1 && index === count - 1;

/**
 * The criterion-by-criterion breakdown. Each row is a neutral card on the desk, with a
 * gutter on its left that holds the criterion's mark in a tint of the band. The row's
 * body is the criterion, the meter and what the marker said. The band identifies the
 * mark; it does not fill the row. From `xl` two rows sit side by side across the report's
 * full width, so one criterion's text does not run the length of a wide card. The report
 * has no reading measure of its own (DesignSpec §4, "Measure").
 */
const CriteriaSection: React.FC<CriteriaSectionProps> = ({
  criteria,
  band,
  prompt,
  feedbackLocked,
  className = '',
}) => {
  const ink = getBandConfig(band).text;
  return (
    <section className={`relative ${className}`}>
      <div className="no-print">
        <SectionHeading icon={ClipboardList} label="Criteria breakdown">
          {feedbackLocked && <PlusLockChip feature="fullFeedback" />}
        </SectionHeading>
      </div>
      {feedbackLocked && <ContentLockOverlay feature="fullFeedback" />}
      <div
        className={`grid grid-cols-1 xl:grid-cols-2 gap-3 ${feedbackLocked ? 'blur-sm select-none pointer-events-none' : ''}`}
      >
        {criteria.map((criterion, idx) => (
          <div
            key={idx}
            // Two columns at xl: an odd count would leave the last card alone in
            // a half-width cell, so that card takes the whole row instead.
            className={`CriteriaRow animate-fade-in-up-sm min-w-0 ${
              isLoneLastRow(idx, criteria.length) ? 'xl:col-span-2' : ''
            }`}
            style={{ animationDelay: `${Math.min(idx, 8) * 60}ms` }}
          >
            <div
              className={`${FEEDBACK_CARD_NEUTRAL} flex items-stretch overflow-hidden h-full`}
              style={ladderBandVars(band)}
            >
              {/* The mark's gutter: a tint of the row's band, with the mark in the band's
                  ink. The divider is the band's own edge, as the ladder's gutters draw it. */}
              <div className={`${LADDER_GUTTER} ${LADDER_EDGE_SHUT} band-tint`}>
                <span className={`${LADDER_GUTTER_MARK} ${ink} band-ink`}>
                  {criterion.mark}
                  <span className={`${LADDER_GUTTER_TOTAL}`}>/{criterion.maxMark}</span>
                </span>
              </div>
              <div className="flex-1 min-w-0 p-4 sm:p-5">
                <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 leading-snug">
                  {/* Numbered, so a criterion can be referred to out loud — "look at
                      three" — rather than by quoting its wording back. */}
                  <span className="text-slate-700 dark:text-slate-300 tabular-nums mr-2">
                    {idx + 1}
                  </span>
                  {renderHighlightedText(criterion.criterion, prompt.keywords, prompt.verb)}
                </h4>
                <div className="mt-3">
                  <CriterionMeter mark={criterion.mark} maxMark={criterion.maxMark} />
                </div>
                <p className="mt-3 text-[13px] leading-relaxed text-slate-700 dark:text-slate-300">
                  {renderFormattedText(criterion.feedback, prompt.keywords, prompt.verb)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default CriteriaSection;
