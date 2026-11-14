import React, { useSyncExternalStore } from 'react';
import { getExamClock, subscribeExamClock } from '../utils/examClockStore';

/**
 * The exam clock, in the writing card's footer during Exam Mode.
 *
 * The clock itself runs in the writing metrics strip, which sits below the fold
 * on a laptop. This keeps the figure in view at the foot of the writing card,
 * where the student's eye already is. It is a second visual copy of a reading the
 * strip has published (see utils/examClockStore), so it is hidden from assistive
 * technology: the strip's own timer carries the spoken name.
 *
 * Renders nothing while no clock is published, so Coach Mode is unchanged.
 */
export const ExamClockChip: React.FC = () => {
  const clock = useSyncExternalStore(subscribeExamClock, getExamClock, getExamClock);
  if (!clock) return null;
  // The same tones the strip's clock takes: slate/white normally, the overrun red
  // past the budget. The caption keeps the footer's own secondary text colour.
  const tone = clock.over ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white';
  return (
    <span
      aria-hidden="true"
      className={`t-label inline-flex items-baseline gap-2 whitespace-nowrap leading-none ${tone}`}
    >
      <span className="font-mono tabular-nums text-sm font-bold tracking-tight">{clock.text}</span>
      <span className="text-[rgb(var(--color-text-secondary))]">{clock.caption}</span>
    </span>
  );
};

export default ExamClockChip;
