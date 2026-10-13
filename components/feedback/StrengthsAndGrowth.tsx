import React from 'react';
import { ArrowUpRight, Check, CheckCircle, XCircle } from 'lucide-react';
import { Prompt } from '../../types';
import { renderFormattedText } from '../../utils/renderUtils';
import { planLabelForFeature } from '../../services/entitlements';
import { PlusLockChip, ContentLockOverlay } from '../UpgradeModal';
import { CARD, SectionHeading } from './FeedbackPieces';

interface StrengthsAndGrowthProps {
  strengths: string[];
  improvements: string[];
  prompt: Prompt;
  /** The improvement path is redacted for the free tier (see the growth column below). */
  feedbackLocked: boolean;
}

/**
 * What went well and what to do next, side by side from `md`.
 */
const StrengthsAndGrowth: React.FC<StrengthsAndGrowthProps> = ({
  strengths,
  improvements,
  prompt,
  feedbackLocked,
}) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    <section>
      <SectionHeading
        icon={CheckCircle}
        label="Strong Evidence"
        // emerald-600 measured 3.1:1 on the light desk, under AA; -800 is
        // 5.9:1 there and keeps the same hue.
        tone="text-emerald-800 dark:text-emerald-400"
        toneBg="bg-emerald-100 dark:bg-emerald-500/15"
      />
      <ul className={`${CARD} p-5 sm:p-6 space-y-3.5`}>
        {strengths.map((s, i) => (
          <li
            key={i}
            className="flex gap-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed animate-fade-in-up-sm"
            style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
          >
            {/* A tick, not a dot. The two lists mean opposite things and
            used to be told apart only by the colour of a 6px circle —
            which is no distinction at all on a greyscale print. */}
            <Check className="w-4 h-4 mt-0.5 shrink-0 text-emerald-500" />
            <span>{renderFormattedText(s, prompt.keywords, prompt.verb)}</span>
          </li>
        ))}
      </ul>
    </section>
    {/* The improvement path is REDACTED server-side for the free tier
    (api/_lib/entitlements.ts replaces it with the upgrade
    placeholder), so it has to carry the same lock treatment as the
    criteria below. Without it a free user reads
    "Upgrade to see this feedback." as if it were the marker's actual
    advice, with nothing to click. */}
    <section className="relative">
      <SectionHeading
        icon={XCircle}
        label="Areas for Growth"
        tone="text-rose-700 dark:text-rose-400"
        toneBg="bg-rose-100 dark:bg-rose-500/15"
      >
        {feedbackLocked && <PlusLockChip />}
      </SectionHeading>
      {feedbackLocked && (
        <ContentLockOverlay
          feature="fullFeedback"
          message={`Your improvement path is part of ${planLabelForFeature('fullFeedback')}`}
          className="rounded-panel"
        />
      )}
      <ul
        className={`${CARD} p-5 sm:p-6 space-y-3.5 ${feedbackLocked ? 'blur-sm select-none pointer-events-none' : ''}`}
      >
        {improvements.map((im, i) => (
          <li
            key={i}
            className="flex gap-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed animate-fade-in-up-sm"
            style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
          >
            <ArrowUpRight className="w-4 h-4 mt-0.5 shrink-0 text-rose-500" />
            <span>{renderFormattedText(im, prompt.keywords, prompt.verb)}</span>
          </li>
        ))}
      </ul>
    </section>
  </div>
);

export default StrengthsAndGrowth;
