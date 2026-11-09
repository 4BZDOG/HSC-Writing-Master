import React from 'react';
import { Clock, Landmark } from 'lucide-react';
import type { Prompt } from '../types';
import { isAnsweredOnOwnText, pastHscTiming } from '../utils/pastHscUtils';

const minutesPhrase = (minutes: number): string =>
  `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;

/**
 * Where a past HSC question sits on its paper, above the question itself.
 *
 * The paper's own heading ("Paper 2, Section III — Module C: The Craft of
 * Writing (20 marks). Allow about 40 minutes.") and the prescribed text a part
 * is set on used to open the question's scenario, so a student read exam front
 * matter as if it were context for their answer. The scenario now holds only
 * what they read to answer; the paper, section, time and text are stated here,
 * quietly, beside the year and question number on the card's chip.
 *
 * The section's allowance is not shown as the question's time. The line gives
 * this part's marks and its share of the allowance (`pastHscTiming`), the same
 * figure the card's time chip and the writing timer use.
 */
const PastHscExamLine: React.FC<{
  prompt: Pick<Prompt, 'isPastHSC' | 'hscSection' | 'hscText' | 'hscQuestionNumber' | 'totalMarks'>;
}> = ({ prompt }) => {
  if (!prompt.isPastHSC) return null;
  const ownText = isAnsweredOnOwnText(prompt);
  const { heading, minutes, fromPaper } = pastHscTiming(prompt);
  if (!heading && !prompt.hscText && !ownText && minutes === null) return null;

  const question = (prompt.hscQuestionNumber ?? '').trim().replace(/^q(uestion)?\s*/i, '');
  const marks = prompt.totalMarks;
  const markWord = marks === 1 ? 'mark' : 'marks';
  const timeWords =
    minutes === null ? '' : `${fromPaper ? 'allow about' : 'about'} ${minutesPhrase(minutes)}`;
  const timing = [
    question ? `Question ${question}` : '',
    marks > 0 ? `${marks} ${markWord}` : '',
    timeWords,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      data-testid="past-hsc-exam-line"
      className="mb-3 pl-2 flex flex-col gap-1 text-xs leading-snug text-slate-400 light:text-slate-600"
    >
      {heading && (
        <p className="flex items-start gap-1.5">
          <Landmark className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
          <span>{heading}</span>
        </p>
      )}
      {timing && (
        <p className="flex items-start gap-1.5" data-testid="past-hsc-exam-time">
          <Clock className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
          <span>{timing}</span>
        </p>
      )}
      {prompt.hscText && (
        <p className="pl-5">
          <span className="font-semibold">Prescribed text:</span> {prompt.hscText}
        </p>
      )}
      {ownText && (
        <p className="pl-5">
          On the paper this question is set for several prescribed texts, one part for each. Answer
          it on the text you studied.
        </p>
      )}
    </div>
  );
};

export default PastHscExamLine;
