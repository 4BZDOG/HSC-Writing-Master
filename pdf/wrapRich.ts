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
  underline?: boolean;
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
        ...(span.underline ? { underline: true } : {}),
        kind: piece === '\n' ? 'break' : /^[ \t]+$/.test(piece) ? 'space' : 'word',
      });
    }
  }
  return chunks;
};

/**
 * Closing punctuation belongs to the word before it. A bold term followed by a
 * comma is two chunks with no space between them, and a comma must never open a
 * line: on paper it reads as a typo.
 */
const CLOSING_PUNCTUATION = /^[,.;:!?)\]’”]/;

/**
 * What the wrap decides between: a word with whatever closing punctuation is
 * fastened to it (kept as one unit, so it can only break before the whole of
 * it), a run of spaces, or a line break.
 */
type Item = { kind: 'break' } | { kind: 'space'; chunk: Chunk } | { kind: 'word'; chunks: Chunk[] };

const itemsOf = (chunks: Chunk[]): Item[] => {
  const items: Item[] = [];
  for (const chunk of chunks) {
    if (chunk.kind === 'break') {
      items.push({ kind: 'break' });
      continue;
    }
    if (chunk.kind === 'space') {
      items.push({ kind: 'space', chunk });
      continue;
    }
    const previous = items[items.length - 1];
    if (previous?.kind === 'word' && CLOSING_PUNCTUATION.test(chunk.text)) {
      previous.chunks.push(chunk);
    } else {
      items.push({ kind: 'word', chunks: [chunk] });
    }
  }
  return items;
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
      (last.color?.join() ?? '') === (chunk.color?.join() ?? '') &&
      !!last.underline === !!chunk.underline
    ) {
      last.text += chunk.text;
    } else {
      line.push({
        text: chunk.text,
        style: chunk.style,
        ...(chunk.color ? { color: chunk.color } : {}),
        ...(chunk.underline ? { underline: true } : {}),
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

  for (const item of itemsOf(chunksOf(spans))) {
    if (item.kind === 'break') {
      endLine();
      continue;
    }
    if (item.kind === 'space') {
      // Held back: a run of spaces at a wrap point is discarded rather than
      // indenting the next line.
      if (line.length > 0) pending.push(item.chunk);
      continue;
    }

    const unit = item.chunks;
    const pendingWidth = pending.reduce(
      (sum, s) => sum + measurer.measure(s.text, fontPt, s.style),
      0
    );
    const wordWidth = unit.reduce((sum, c) => sum + measurer.measure(c.text, fontPt, c.style), 0);

    if (line.length > 0 && width + pendingWidth + wordWidth > maxWidthMm + 1e-6) {
      endLine();
    } else {
      pending.forEach(push);
      pending = [];
    }

    if (wordWidth > maxWidthMm + 1e-6) {
      for (const chunk of unit) {
        const pieces = breakLongWord(chunk, maxWidthMm, fontPt, measurer);
        pieces.forEach((piece, i) => {
          if (i > 0) endLine();
          push(piece);
        });
      }
    } else {
      unit.forEach(push);
    }
  }

  lines.push(line);
  // A trailing hard break leaves one empty line, which is whitespace the author
  // did not ask for at the foot of a block.
  while (lines.length > 1 && spansToText(lines[lines.length - 1]) === '') lines.pop();
  return lines;
};
