import React from 'react';
import { Plus } from 'lucide-react';

interface WordChipProps {
  word: string;
  onInsert: (word: string) => void;
}

/**
 * A word the student can add to their draft with one press.
 *
 * Tall enough to hit on a phone (44px under `sm`), and the same chip whether it
 * sits in the draft check or the how-to-answer card, so "a word you can add"
 * looks like one thing wherever it appears.
 */
const WordChip: React.FC<WordChipProps> = ({ word, onInsert }) => (
  <button
    type="button"
    onClick={() => onInsert(word)}
    title={`Add "${word}" to your draft`}
    className="t-label inline-flex items-center gap-1.5 min-h-11 sm:min-h-8 px-3 rounded-full border border-slate-300 dark:border-white/20 bg-white dark:bg-[rgb(var(--color-bg-surface))] text-slate-800 dark:text-slate-100 hover:border-slate-500 dark:hover:border-white/40 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors motion-reduce:transition-none active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
  >
    <Plus className="w-3 h-3 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
    {word}
  </button>
);

export default WordChip;
