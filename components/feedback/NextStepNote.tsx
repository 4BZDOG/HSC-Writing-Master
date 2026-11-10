import React, { useId } from 'react';
import { Lightbulb } from 'lucide-react';
import { getBandConfig, renderFormattedText } from '../../utils/renderUtils';
import { Prompt } from '../../types';
import { nextVars } from '../../utils/reportLevels';
import { FEEDBACK_CARD_NEUTRAL } from './feedbackChrome';

interface NextStepNoteProps {
  /**
   * The Improved band: the band the rewrite reaches, or the next level. The step is
   * towards it, so the rule and the bulb take its colour.
   */
  nextBand: number;
  /** The marker's one tip: the single thing to do next. */
  tip: string;
  prompt: Prompt;
  className?: string;
}

/**
 * "Your next step": the marker's one tip, set directly under the question.
 *
 * The tip is the one thing to do next, so it takes the top of the report. It sits on a
 * neutral card, the same paper as the rest of the report. Its rule and bulb carry the
 * Improved band, because the tip is the step to that level; the card is not tinted,
 * since a tip is advice, not a verdict.
 */
const NextStepNote: React.FC<NextStepNoteProps> = ({ nextBand, tip, prompt, className = '' }) => {
  const labelId = useId();
  const ink = getBandConfig(nextBand).text;
  return (
    <section
      aria-labelledby={labelId}
      style={nextVars(nextBand) as React.CSSProperties}
      className={`${FEEDBACK_CARD_NEUTRAL} relative overflow-hidden py-4 pl-6 pr-5 sm:py-5 ${className}`}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[3px] bg-[rgb(var(--next-rgb))]"
      />
      <div className="flex items-start gap-3">
        <Lightbulb className={`w-5 h-5 mt-0.5 shrink-0 ${ink} next-ink`} aria-hidden="true" />
        <div className="min-w-0">
          <p id={labelId} className="t-label text-slate-600 dark:text-slate-400">
            Your next step
          </p>
          <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-800 dark:text-slate-100">
            {renderFormattedText(tip, prompt.keywords, prompt.verb)}
          </p>
        </div>
      </div>
    </section>
  );
};

export default NextStepNote;
