// pdf/wrapRich.ts
//
// Word wrapping for styled spans.
//
// `TextMeasurer.wrap` can only wrap a single string in a single style, which is
// exactly why the exporter used to draw whole lines in one voice. Bold is wider
// than regular at the same point size, so a rich line cannot be wrapped by
// measuring its plain text and hoping — a paragraph with several bold terms
// would over-run the column by a word or two per line, and in a two-column
// layout that lands in the gutter or over the footer.
//
// This wraps by measuring each fragment in the style it will actually be drawn
// in. Pure: the measurer is injected, so this is unit-testable under Node.

import { FontStyle, InlineSpan, TextMeasurer } from './types';
import { spansToText } from './inline';

/** One indivisible piece of a line: a word, a run of spaces, or a line break. */
interface Chunk {
  text: string;
  style: FontStyle;
  color?: [number, number, number];
  kind: 'word' | 'space' | 'break';
}

const chunksOf = (spans: InlineSpan[]): Chunk[] => {
  const chunks: Chunk[] = [];
  for (const span of spans) {
    // Keep the separators: trailing spaces belong to the line they end, and the
    // author's own newlines are hard breaks, not collapsible whitespace.
    for (const piece of span.text.split(/(\n|[ \t]+)/)) {
      if (!piece) continue;
      chunks.push({
        text: piece,
        style: span.style,
        color: span.color,
        kind: piece === '\n' ? 'break' : /^[ \t]+$/.test(piece) ? 'space' : 'word',
      });
    }
  }
  return chunks;
};

/**
 * Break a word that cannot fit a whole line on its own (a URL, a long chemical
 * name) into pieces that can. Without this the drawer would happily paint it
 * straight out of the column.
 */
const breakLongWord = (
  chunk: Chunk,
  maxWidthMm: number,
  fontPt: number,
  measurer: TextMeasurer
): Chunk[] => {
  const out: Chunk[] = [];
  let current = '';
  for (const ch of Array.from(chunk.text)) {
    const next = current + ch;
    if (current && measurer.measure(next, fontPt, chunk.style) > maxWidthMm) {
      out.push({ ...chunk, text: current });
      current = ch;
    } else {
      current = next;
    }
  }
  if (current) out.push({ ...chunk, text: current });
  return out;
};

/**
 * Wrap styled spans to `maxWidthMm`, returning one array of spans per line.
 *
 * Trailing whitespace is dropped from each line so a wrapped space cannot push
 * the following word past the margin, and empty lines are preserved — a blank
 * line between paragraphs is content, and squeezing it out reflows a response
 * into a single block the student did not write.
 */
export const wrapRich = (
  spans: InlineSpan[],
  maxWidthMm: number,
  fontPt: number,
  measurer: TextMeasurer
): InlineSpan[][] => {
  if (spans.length === 0) return [[]];
  if (maxWidthMm <= 0) return [spans];

  const lines: InlineSpan[][] = [];
  let line: InlineSpan[] = [];
  let width = 0;
  let pending: Chunk[] = []; // whitespace not yet committed to a line

  const push = (chunk: Chunk) => {
    const last = line[line.length - 1];
    if (
      last &&
      last.style === chunk.style &&
      (last.color?.join() ?? '') === (chunk.color?.join() ?? '')
    ) {
      last.text += chunk.text;
    } else {
      line.push({
        text: chunk.text,
        style: chunk.style,
        ...(chunk.color ? { color: chunk.color } : {}),
      });
    }
    width += measurer.measure(chunk.text, fontPt, chunk.style);
  };

  const endLine = () => {
    lines.push(line);
    line = [];
    width = 0;
    pending = [];
  };

  for (const chunk of chunksOf(spans)) {
    if (chunk.kind === 'break') {
      endLine();
      continue;
    }
    if (chunk.kind === 'space') {
      // Held back: a run of spaces at a wrap point is discarded rather than
      // indenting the next line.
      if (line.length > 0) pending.push(chunk);
      continue;
    }

    const pendingWidth = pending.reduce(
      (sum, s) => sum + measurer.measure(s.text, fontPt, s.style),
      0
    );
    const wordWidth = measurer.measure(chunk.text, fontPt, chunk.style);

    if (line.length > 0 && width + pendingWidth + wordWidth > maxWidthMm + 1e-6) {
      endLine();
    } else {
      pending.forEach(push);
      pending = [];
    }

    if (wordWidth > maxWidthMm + 1e-6) {
      const pieces = breakLongWord(chunk, maxWidthMm, fontPt, measurer);
      pieces.forEach((piece, i) => {
        if (i > 0) endLine();
        push(piece);
      });
    } else {
      push(chunk);
    }
  }

  lines.push(line);
  // A trailing hard break leaves one empty line, which is whitespace the author
  // did not ask for at the foot of a block.
  while (lines.length > 1 && spansToText(lines[lines.length - 1]) === '') lines.pop();
  return lines;
};
