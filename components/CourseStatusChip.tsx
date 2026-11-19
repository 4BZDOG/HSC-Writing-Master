import React from 'react';
import { BadgeCheck, Clock, Sparkles } from 'lucide-react';
import { CourseLockBadge } from './CourseLockBadge';
import { AVAILABILITY_DESCRIPTION, type CourseAvailability } from '../utils/courseAvailability';

/**
 * What a course is to this viewer, as a chip beside its name: Purchased,
 * Included, Unlock · price, or Coming soon. Nothing for a course that is simply
 * open (course unlocks off, or a staff viewer), which is most courses for most
 * people, so the chip only appears when it says something.
 *
 * Eager, like CourseLockBadge: the course picker shows it on the first screen.
 * Colours are the plan-chip families, light base with `dark:` overrides.
 */

const CHIP =
  't-label inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg whitespace-nowrap flex-shrink-0 border';

const STYLE: Record<'purchased' | 'included' | 'coming-soon', string> = {
  purchased:
    'bg-emerald-100 border-emerald-500/50 text-emerald-800 dark:bg-emerald-950 dark:border-emerald-400/40 dark:text-emerald-200',
  included:
    'bg-sky-100 border-sky-500/50 text-sky-800 dark:bg-sky-950 dark:border-sky-400/40 dark:text-sky-200',
  'coming-soon':
    'bg-slate-100 border-slate-400 text-slate-700 dark:bg-white/5 dark:border-white/15 dark:text-slate-300',
};

const ICON = { purchased: BadgeCheck, included: Sparkles, 'coming-soon': Clock } as const;
const WORDS = {
  purchased: 'Purchased',
  included: 'Included',
  'coming-soon': 'Coming soon',
} as const;

export const CourseStatusChip: React.FC<{
  availability: CourseAvailability;
  /** The one-off unlock price as it reads, e.g. 'A$20', for a locked course. */
  priceText?: string | null;
  /** On a phone, the closed control shows the icon alone; the words stay for screen readers. */
  compact?: boolean;
  className?: string;
}> = ({ availability, priceText, compact = false, className = '' }) => {
  if (availability === 'open') return null;
  if (availability === 'locked')
    return <CourseLockBadge priceText={priceText} compact={compact} className={className} />;
  const Icon = ICON[availability];
  return (
    <span
      className={`${CHIP} ${STYLE[availability]} ${className}`}
      title={AVAILABILITY_DESCRIPTION[availability]}
      data-testid={`course-status-${availability}`}
    >
      <Icon className="w-2.5 h-2.5" aria-hidden="true" />
      {compact ? (
        <span className="max-sm:sr-only">{WORDS[availability]}</span>
      ) : (
        WORDS[availability]
      )}
    </span>
  );
};

export default CourseStatusChip;
