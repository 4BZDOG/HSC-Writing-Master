import React from 'react';
import { ClipboardList } from 'lucide-react';
import { EvaluationResult, Prompt } from '../../types';
import { planLabelForFeature } from '../../services/entitlements';
import { PlusLockChip, ContentLockOverlay } from '../UpgradeModal';
import { CriteriaRow, SectionHeading } from './FeedbackPieces';

interface CriteriaSectionProps {
  criteria: EvaluationResult['criteria'];
  prompt: Prompt;
  /** The plan withholds the per-criterion prose; the rows are drawn blurred behind a lock. */
  feedbackLocked: boolean;
}

/** The criterion-by-criterion breakdown, with its own lock when the plan withholds it. */
const CriteriaSection: React.FC<CriteriaSectionProps> = ({ criteria, prompt, feedbackLocked }) => (
  <section className="relative">
    <div className="no-print">
      <SectionHeading icon={ClipboardList} label="Criteria Breakdown">
        {feedbackLocked && <PlusLockChip />}
      </SectionHeading>
    </div>
    {feedbackLocked && (
      <ContentLockOverlay
        feature="fullFeedback"
        message={`Detailed criterion feedback is part of ${planLabelForFeature('fullFeedback')}`}
      />
    )}
    <div
      className={`grid grid-cols-1 gap-3 ${feedbackLocked ? 'blur-sm select-none pointer-events-none' : ''}`}
    >
      {criteria.map((criterion, idx) => (
        <CriteriaRow
          key={idx}
          index={idx}
          criterion={criterion}
          maxMark={criterion.maxMark}
          mark={criterion.mark}
          feedback={criterion.feedback}
          prompt={prompt}
        />
      ))}
    </div>
  </section>
);

export default CriteriaSection;
