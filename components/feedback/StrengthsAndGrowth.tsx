import React from 'react';
import { CheckCircle, Check, XCircle } from 'lucide-react';
import { Prompt } from '../../types';
import { renderFormattedText } from '../../utils/renderUtils';
import { planLabelForFeature } from '../../services/entitlements';
import { PlusLockChip, ContentLockOverlay } from '../UpgradeModal';
import { FEEDBACK_CARD, GROWTH_BOX } from './feedbackChrome';
import { SectionHeading } from './FeedbackPieces';

interface StrengthsAndGrowthProps {
  strengths: string[];
  improvements: string[];
  prompt: Prompt;
  /** The improvement path is redacted for the free tier (see the growth column below). */
  feedbackLocked: boolean;
  className?: string;
}

/**
 * What went well, and what to work on, side by side from `md`.
 *
 * The two lists mean opposite things, so they are drawn as opposites: a tick
 * for what the response already does, and an empty box for what it has yet to
 * do. The box is the PDF's own idiom, so a printed report a student works down
 * and ticks off looks the same as the one on screen.
 */
const StrengthsAndGrowth: React.FC<StrengthsAndGrowthProps> = ({
  strengths,
  improvements,
  prompt,
  feedbackLocked,
  className = '',
}) => (
  <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${className}`}>
    <section>
      <SectionHeading
        icon={CheckCircle}
        label="Strong evidence"
        tone="text-emerald-800 dark:text-emerald-400"
        toneBg="bg-emerald-100 dark:bg-emerald-500/15"
      />
      <ul className={`${FEEDBACK_CARD} p-5 sm:p-6 space-y-3.5`}>
        {strengths.map((s, i) => (
          <li
            key={i}
            className="flex gap-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed animate-fade-in-up-sm"
            style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
          >
            {/* A tick, not a dot. The two lists mean opposite things and
            used to be told apart only by the colour of a 6px circle —
            which is no distinction at all on a greyscale print. */}
            <Check
              className="w-4 h-4 mt-0.5 shrink-0 text-emerald-700 dark:text-emerald-400"
              aria-hidden="true"
            />
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
        label="Areas for growth"
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
        className={`${FEEDBACK_CARD} p-5 sm:p-6 space-y-3.5 ${feedbackLocked ? 'blur-sm select-none pointer-events-none' : ''}`}
      >
        {improvements.map((im, i) => (
          <li
            key={i}
            className="flex gap-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed animate-fade-in-up-sm"
            style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
          >
            <span className={GROWTH_BOX} aria-hidden="true" />
            <span>{renderFormattedText(im, prompt.keywords, prompt.verb)}</span>
          </li>
        ))}
      </ul>
    </section>
  </div>
);

export default StrengthsAndGrowth;
