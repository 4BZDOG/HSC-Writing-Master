/**
 * Turning a block of typed or pasted syllabus text into dot points.
 *
 * A teacher holding the NESA document can copy its dot points straight across,
 * and a list copied from a PDF or a Word file arrives with whatever markers the
 * source put in front of each line: a bullet, a number, a lettered list item.
 * None of that belongs in the dot point, and NESA's own wording carries no
 * trailing full stop, so both come off here. The same list pasted twice, or
 * pasted over dot points already in the sub-topic, would otherwise add every
 * line again, so repeats are counted and left out.
 */

export interface DotPointLinesResult {
  /** The dot points to add, in the order they were typed. */
  dotPoints: string[];
  /** Lines that repeat a dot point already in this sub-topic. */
  skippedExisting: number;
  /** Lines that repeat an earlier line of the same paste. */
  skippedRepeated: number;
}

/**
 * The marker a list puts in front of an item: a bullet (`•`, `-`, `*`, `–`), or
 * a number or letter with a closing bracket or full stop (`1.`, `2)`, `a)`,
 * `(b)`). A number or letter must be followed by a space or the end of the line.
 * Without that, "2.5 ways to…" or "e.g. …" would lose their first characters,
 * and a bare "1." is a marker with nothing after it, so the line is dropped. A
 * dot point never begins with a hyphen, so a bullet needs no space.
 */
const LEADING_MARKER = /^(?:[•\-*–]+\s*|\(?(?:\d{1,3}|[a-zA-Z])[.)](?:\s+|$))/;

/**
 * One line, cleaned: its markers, its surrounding and doubled whitespace, and
 * its trailing full stop removed. An empty result means the line held nothing,
 * or only a marker, and it is dropped. Internal whitespace is collapsed as well,
 * since a paste from a PDF often carries a double space or a tab where the page
 * had a gap, and that gap is not part of the dot point's wording.
 */
export const normaliseDotPointLine = (line: string): string => {
  const collapsed = line.replace(/\s+/g, ' ').trim();
  const withoutMarker = collapsed.replace(LEADING_MARKER, '');
  return withoutMarker.replace(/\.$/, '').trim();
};

/**
 * Split typed or pasted text into one dot point per line, and say which lines
 * were left out because the sub-topic already holds them.
 *
 * Duplicates are compared case-insensitively. The existing dot points are read
 * through the same cleaning as the new lines, so a stored "Describe X." and a
 * pasted "Describe X" count as the same dot point. A line that repeats one in
 * the sub-topic is counted as existing, even if it also repeats an earlier line,
 * because that is the more useful thing to tell the teacher.
 */
export const parseDotPointLines = (
  text: string,
  existing: readonly string[] = []
): DotPointLinesResult => {
  const known = new Set(
    existing.map((description) => normaliseDotPointLine(description).toLowerCase()).filter(Boolean)
  );
  const seen = new Set<string>();
  const dotPoints: string[] = [];
  let skippedExisting = 0;
  let skippedRepeated = 0;

  for (const raw of text.split(/\r?\n/)) {
    const line = normaliseDotPointLine(raw);
    if (!line) continue;

    const key = line.toLowerCase();
    if (known.has(key)) {
      skippedExisting += 1;
    } else if (seen.has(key)) {
      skippedRepeated += 1;
    } else {
      seen.add(key);
      dotPoints.push(line);
    }
  }

  return { dotPoints, skippedExisting, skippedRepeated };
};
