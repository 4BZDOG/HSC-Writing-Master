/**
 * The supporting syllabus-term chip, in the same shape as `utils/panelStyles.ts`
 * and `utils/cardChrome.ts`.
 *
 * One word of the syllabus that a student has not used yet. It appears in three
 * places and is the same object in all three: the prompt card's "syllabus terms
 * to weave in", the draft check's term pills, and the keyword editor's
 * clickable list. Each had hand-written its own copy, and by the time they were
 * put side by side they had drifted:
 *
 *     bg-slate-100    text-slate-700  border-slate-300   (keyword editor)
 *     bg-slate-100    text-slate-700  border-slate-300   (draft check)
 *     bg-slate-100/50 text-slate-600  border-slate-200   (prompt card)
 *
 * The third is the one a student meets FIRST, before writing a word, and it was
 * the faintest of the three: a half-strength slate-100 on the white prompt card
 * is a 1.05:1 fill behind a 1.17:1 border, so the chip had neither a face nor
 * an edge. The other two only look right because they were corrected one at a
 * time, in two separate passes, without either pass knowing about the third.
 *
 * So the resting tone is stated once here. A call site adds its own hover and
 * selected states, because those genuinely differ — the prompt card's chips are
 * read, the other two are pressed.
 *
 * What this is NOT: the chip for a term already used, or a must-use term named
 * in the question. Those take their colour from `getBandConfig` at the call
 * site, because they carry the question's own tier hue and that is
 * `utils/renderUtils.ts`'s to decide (DesignSpec §2).
 */

/** Fill, ink and edge for a term the draft has not reached yet. */
export const TERM_CHIP_RESTING =
  'bg-slate-100 dark:bg-white/[0.03] ' +
  'text-slate-700 dark:text-slate-400 ' +
  'border-slate-300 dark:border-white/10';

/** …and the edge it takes under the pointer, where the chip is a control. */
export const TERM_CHIP_HOVER =
  'hover:border-slate-400 dark:hover:border-white/20 ' +
  'hover:bg-slate-200 dark:hover:bg-white/[0.06]';
