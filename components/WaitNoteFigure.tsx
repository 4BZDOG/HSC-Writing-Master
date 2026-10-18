import React from 'react';
import { PenLine } from 'lucide-react';
import type { WaitNote } from '../utils/waitTips';

interface WaitNoteFigureProps {
  note: WaitNote;
  /**
   * The wait's ink colour, for the margin rule beside the note. Any CSS colour:
   * the rule is mixed with the page through `color-mix`, not by appending an
   * alpha to the value, so a theme token works as well as a hex.
   */
  accent: string;
  /** Extra classes for the figure, e.g. `ai-wait-note`, which lets the wait card drop the note when it is short. */
  className?: string;
}

/**
 * One margin note on an AI wait, set as a marker's comment in the margin, in
 * the serif italic written feedback is set in, so it reads as advice rather
 * than as another status line.
 *
 * A note that is a number from the published HSC results says so, with its
 * year, so the reader can tell a statistic from the advice around it.
 *
 * Callers keep this OUTSIDE their live region, so the note is never announced
 * on its own clock.
 */
const WaitNoteFigure: React.FC<WaitNoteFigureProps> = ({ note, accent, className }) => (
  <figure
    className={`flex gap-3 pl-3 border-l-2 animate-fade-in${className ? ` ${className}` : ''}`}
    style={{ borderColor: `color-mix(in srgb, ${accent} 40%, transparent)` }}
  >
    <PenLine
      className="w-4 h-4 mt-1 shrink-0 text-slate-500 dark:text-slate-400"
      aria-hidden="true"
    />
    <div className="min-w-0 space-y-1">
      {note.kind === 'fact' && (
        <p className="t-label text-slate-600 dark:text-slate-400">HSC in numbers, {note.year}</p>
      )}
      <blockquote className="font-serif italic text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
        {note.text}
      </blockquote>
    </div>
  </figure>
);

export default WaitNoteFigure;
