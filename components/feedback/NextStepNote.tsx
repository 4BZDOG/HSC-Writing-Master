import React, { useId } from 'react';
import { Lightbulb } from 'lucide-react';
import { renderFormattedText } from '../../utils/renderUtils';
import { Prompt } from '../../types';
import {
  LADDER_BODY,
  LADDER_EDGE_SHUT,
  LADDER_FILL,
  LADDER_NOTE,
  LADDER_NOTE_GLYPH,
  LADDER_NOTE_LABEL,
  LADDER_ROW,
} from '../../utils/ladderChrome';
import { ladderBandVars } from '../LadderRow';

interface NextStepNoteProps {
  /** The band the response was marked in, which the note's band fill is drawn in. */
  band: number;
  /** The marker's one tip: the single thing to do next. */
  tip: string;
  prompt: Prompt;
  className?: string;
}

/**
 * "Your next step": the marker's one tip, set directly under the question.
 *
 * It was the Coach's Tip, a solid card in the middle of the report, and the rewrite
 * that acts on it sat four screens below. The tip is the one thing to do next, so it
 * takes the top of the report and is written as a note on the band's own fill: the
 * ladder's vocabulary, not a card of its own.
 */
const NextStepNote: React.FC<NextStepNoteProps> = ({ band, tip, prompt, className = '' }) => {
  const labelId = useId();
  return (
    <section
      aria-labelledby={labelId}
      style={ladderBandVars(band)}
      className={`${LADDER_ROW} ${LADDER_EDGE_SHUT} ${LADDER_FILL} ${className}`}
    >
      <div className={LADDER_BODY}>
        <div className={LADDER_NOTE}>
          <Lightbulb className={LADDER_NOTE_GLYPH} aria-hidden="true" />
          <div className="min-w-0">
            <p id={labelId} className={LADDER_NOTE_LABEL}>
              Your next step
            </p>
            <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-800 dark:text-slate-100">
              {renderFormattedText(tip, prompt.keywords, prompt.verb)}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default NextStepNote;
