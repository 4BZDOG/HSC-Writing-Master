import React from 'react';
import { Landmark } from 'lucide-react';
import type { Prompt } from '../types';
import { isAnsweredOnOwnText } from '../utils/pastHscUtils';

/**
 * Where a past HSC question sits on its paper, above the question itself.
 *
 * The paper's own heading ("Paper 2, Section III — Module C: The Craft of
 * Writing (20 marks). Allow about 40 minutes.") and the prescribed text a part
 * is set on used to open the question's scenario, so a student read exam front
 * matter as if it were context for their answer. The scenario now holds only
 * what they read to answer; the paper, section, time and text are stated here,
 * quietly, beside the year and question number on the card's chip.
 */
const PastHscExamLine: React.FC<{
  prompt: Pick<Prompt, 'isPastHSC' | 'hscSection' | 'hscText' | 'hscQuestionNumber'>;
}> = ({ prompt }) => {
  if (!prompt.isPastHSC) return null;
  const ownText = isAnsweredOnOwnText(prompt);
  if (!prompt.hscSection && !prompt.hscText && !ownText) return null;

  return (
    <div
      data-testid="past-hsc-exam-line"
      className="mb-3 pl-2 flex flex-col gap-1 text-xs leading-snug text-slate-400 light:text-slate-600"
    >
      {prompt.hscSection && (
        <p className="flex items-start gap-1.5">
          <Landmark className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
          <span>{prompt.hscSection}</span>
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
