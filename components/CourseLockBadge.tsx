import React from 'react';
import { Lock } from 'lucide-react';

/**
 * The amber lock on a course the viewer has to buy before it can be marked. Eager,
 * because the course picker shows it on the first screen; the dialog it opens is
 * CourseUnlockModal, which is lazy and must not be imported from here.
 *
 * Same colour family as the plan lock chip (UpgradeModal's PlusLockChip). The price
 * is shown when one is known, and the word alone when none is.
 */
export const CourseLockBadge: React.FC<{
  /** The one-off price as it reads, e.g. 'A$20'. Omitted when there is none. */
  priceText?: string | null;
  /** On a phone, the closed control shows the lock alone; the words stay for screen readers. */
  compact?: boolean;
  className?: string;
}> = ({ priceText, compact = false, className = '' }) => {
  const label = priceText ? `Unlock · ${priceText}` : 'Unlock';
  return (
    <span
      className={`t-label inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg whitespace-nowrap flex-shrink-0 bg-amber-100 border border-amber-500/50 text-amber-800 dark:bg-amber-950 dark:border-amber-400/40 dark:text-amber-200 ${className}`}
      data-testid="course-lock-badge"
    >
      <Lock className="w-2.5 h-2.5" aria-hidden="true" />
      {compact ? <span className="max-sm:sr-only">{label}</span> : label}
    </span>
  );
};

export default CourseLockBadge;
