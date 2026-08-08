// pdf/inline.ts
//
// Rich inline text for the PDF: app markup and syllabus highlighting resolved
// into styled RUNS a word-placement drawer can paint, rather than the single
// flat string per line the exporter used to draw.
//
// Why this exists: everywhere else in the app, marking feedback arrives with
// **bold** emphasis, syllabus keywords in emerald and the command verb in the
// accent colour — and all of it was flattened on the way to paper. `toText()`
// strips emphasis markers and keeps the words, so the printed report was the
// right sentences in the wrong voice: the marker's emphasis gone, and no way to
// see at a glance which syllabus terms the response actually used.
//
// The keyword matcher is the app's own (`createKeywordRegex`), deliberately:
// two matchers would drift, and a term highlighted on screen but black on the
// printout is a disagreement a student notices and a teacher cannot explain.
//
// No DOM, no jsPDF — unit-testable under Node.

import { createKeywordRegex } from '../utils/renderUtils';
import { FontStyle, InlineSpan } from './types';
import { stripBasicHtml, toText } from './text';

export type { InlineSpan };

export interface InlineOptions {
  /** The style the surrounding block is drawn in — emphasis is added to it. */
  baseStyle?: FontStyle;
  /** Syllabus terms to colour, matched with the app's own matcher. */
  keywords?: string[];
  keywordColor?: [number, number, number];
  /** The question's command verb, coloured separately from the keywords. */
  verb?: string;
  verbColor?: [number, number, number];
}

/** Combine an emphasis with whatever the block was already set in. */
const withBold = (style: FontStyle): FontStyle =>
  style === 'italic' || style === 'bolditalic' ? 'bolditalic' : 'bold';

const withItalic = (style: FontStyle): FontStyle =>
  style === 'bold' || style === 'bolditalic' ? 'bolditalic' : 'italic';

// The app's own emphasis regexes (utils/renderUtils), so the printed page
// bolds exactly what the screen bolds. `_` is left alone here: the app reads it
// as a subscript marker, and `toText` turns it into real subscript glyphs.
const BOLD = /(\*\*.*?\*\*)/g;
const ITALIC = /(\*[^*]+\*)/g;

/**
 * Split markdown emphasis into styled spans, innermost first. Mirrors
 * `processInlineFormatting`'s order — bold, then italic within it — so nesting
 * resolves the same way it does on screen.
 */
const splitEmphasis = (text: string, style: FontStyle): InlineSpan[] => {
  if (!text) return [];

  const boldParts = text.split(BOLD);
  if (boldParts.length > 1) {
    return boldParts.flatMap((part) =>
      part.length > 4 && part.startsWith('**') && part.endsWith('**')
        ? splitEmphasis(part.slice(2, -2), withBold(style))
        : splitEmphasis(part, style)
    );
  }

  const italicParts = text.split(ITALIC);
  if (italicParts.length > 1) {
    return italicParts.flatMap((part) =>
      part.length > 2 && part.startsWith('*') && part.endsWith('*')
        ? splitEmphasis(part.slice(1, -1), withItalic(style))
        : splitEmphasis(part, style)
    );
  }

  return [{ text, style }];
};

/**
 * Split each uncoloured span on a matcher, colouring the matches.
 *
 * The regex's whole alternation sits in ONE capturing group (see
 * `createKeywordRegex`), so `split` yields matches at odd indices — the same
 * index-parity contract the React renderers rely on. Testing the regex instead
 * would be stateful (`/g` carries `lastIndex`) and would drop every other hit.
 */
const colourMatches = (
  spans: InlineSpan[],
  regex: RegExp | null,
  color: [number, number, number] | undefined
): InlineSpan[] => {
  if (!regex || !color) return spans;
  return spans.flatMap((span) => {
    // A span that already carries a colour has been claimed by an earlier pass
    // (the verb outranks the keywords), so leave it alone.
    if (span.color) return [span];
    const parts = span.text.split(regex);
    if (parts.length < 2) return [span];
    return parts
      .map((part, i) => ({
        text: part,
        style: span.style,
        ...(i % 2 === 1 ? { color } : {}),
      }))
      .filter((s) => s.text.length > 0);
  });
};

/** Merge neighbours that would be drawn identically — fewer draw calls, and
 *  fewer seams where a shaped font would otherwise lose its kerning. */
const coalesce = (spans: InlineSpan[]): InlineSpan[] => {
  const out: InlineSpan[] = [];
  for (const span of spans) {
    if (!span.text) continue;
    const last = out[out.length - 1];
    const sameColour =
      (last?.color?.join() ?? '') === (span.color?.join() ?? '') && last?.style === span.style;
    if (last && sameColour) last.text += span.text;
    else out.push({ ...span });
  }
  return out;
};

/**
 * Turn one piece of host content into styled spans: HTML stripped, emphasis
 * resolved, syllabus terms coloured, and every surviving fragment run through
 * `toText` so maths and symbols reach the page as selectable Unicode.
 */
export const parseInlineSpans = (input: string, opts: InlineOptions = {}): InlineSpan[] => {
  const base = opts.baseStyle ?? 'normal';
  const source = stripBasicHtml(input ?? '');
  if (!source) return [];

  let spans = splitEmphasis(source, base);
  // Verb first, then keywords: the verb is the one word a marker's comment
  // turns on, and letting a keyword claim it would recolour the question's own
  // command term. Matches the order on screen.
  spans = colourMatches(spans, opts.verb ? createKeywordRegex([opts.verb]) : null, opts.verbColor);
  spans = colourMatches(spans, createKeywordRegex(opts.keywords ?? []), opts.keywordColor);

  return coalesce(spans.map((span) => ({ ...span, text: toText(span.text) })));
};

/** The plain text of a run of spans — what the line would have been before. */
export const spansToText = (spans: InlineSpan[]): string => spans.map((s) => s.text).join('');
