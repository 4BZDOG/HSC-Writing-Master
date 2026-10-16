import React from 'react';
import { ClipboardList } from 'lucide-react';
import { EvaluationResult, Prompt } from '../../types';
import { renderFormattedText, renderHighlightedText } from '../../utils/renderUtils';
import { planLabelForFeature } from '../../services/entitlements';
import { PlusLockChip, ContentLockOverlay } from '../UpgradeModal';
import LadderRow from '../LadderRow';
import { CriterionMeter, SectionHeading } from './FeedbackPieces';

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
 * The criterion-by-criterion breakdown, as rungs of the mark ladder: each row's
 * gutter is the criterion's mark, and its body is the criterion, the meter and
 * what the marker said. From `xl` two rows sit side by side, which keeps a
 * criterion's lines to a readable measure at the width the report has there.
 */
const CriteriaSection: React.FC<CriteriaSectionProps> = ({
  criteria,
  band,
  prompt,
  feedbackLocked,
  className = '',
}) => (
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
          <LadderRow
            band={band}
            markLabel={String(criterion.mark)}
            total={criterion.maxMark}
            bandCaption={false}
          >
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
          </LadderRow>
        </div>
      ))}
    </div>
  </section>
);

export default CriteriaSection;
