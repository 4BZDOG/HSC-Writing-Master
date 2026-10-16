/**
 * One line of a command verb's generic marking guide, split into the marks it is
 * for and the criterion that earns them.
 *
 * The guide is written as "2-3 marks: Accurately recounts…" and "1 mark: …", and
 * `data/commandTerms.ts` is the only place it is written. The figure is what a
 * ladder gutter shows, so it is set with an en dash, the way the ladder rows show
 * every other range.
 */
export interface GenericMarkRow {
  marks: string;
  criterion: string;
}

const MARK_LINE = /^(\d+(?:\s*[-–]\s*\d+)?\+?)\s+marks?:\s*(.+)$/i;

/** The row a guide line describes, or null for a line that is not written that way. */
export const parseGenericMarkRow = (line: string): GenericMarkRow | null => {
  const match = line.trim().match(MARK_LINE);
  if (!match) return null;
  return {
    marks: match[1].replace(/\s*[-–]\s*/, '–'),
    criterion: match[2].trim(),
  };
};
