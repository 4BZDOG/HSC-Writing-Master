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
// The keyword and verb matchers are the app's own (`createKeywordRegex` and
// `createVerbRegex`), deliberately: two matchers would drift, and a term
// highlighted on screen but black on the printout is a disagreement a student
// notices and a teacher cannot explain.
//
// No DOM, no jsPDF — unit-testable under Node.

import { createKeywordRegex, createVerbRegex } from '../utils/renderUtils';
import { FontStyle, InlineSpan } from './types';
import { stripBasicHtml, toText } from './text';

export type { InlineSpan };

export interface InlineOptions {
  /** The style the surrounding block is drawn in — emphasis is added to it. */
  baseStyle?: FontStyle;
  /** Syllabus terms to highlight, matched with the app's own matcher. */
  keywords?: string[];
  /**
   * The colour a term is printed in. Absent means the block's own colour, and
   * the term is then marked by its underline alone — see buildBlocks for where
   * the colour is spent and where it is not.
   */
  keywordColor?: [number, number, number];
  /** The question's command verb, highlighted separately from the keywords. */
  verb?: string;
  verbColor?: [number, number, number];
  /** Print the verb in bold as well. Set where the verb is read as prose. */
  verbBold?: boolean;
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
 * Split each unclaimed span on a matcher, and emphasise the matches.
 *
 * The regex's whole alternation sits in ONE capturing group (see
 * `createKeywordRegex`), so `split` yields matches at odd indices — the same
 * index-parity contract the React renderers rely on. Testing the regex instead
 * would be stateful (`/g` carries `lastIndex`) and would drop every other hit.
 *
 * A match is always underlined. It is coloured only when a colour is given, and
 * made bold only when asked: the underline is the mark that survives a greyscale
 * printer, and the colour and weight are what the prose can afford on top of it.
 */
const emphasise = (
  spans: InlineSpan[],
  regex: RegExp | null,
  emphasis: { color?: [number, number, number]; bold?: boolean }
): InlineSpan[] => {
  if (!regex) return spans;
  return spans.flatMap((span) => {
    // A span already underlined was claimed by an earlier pass (the verb
    // outranks the keywords), so leave it alone.
    if (span.underline) return [span];
    const parts = span.text.split(regex);
    if (parts.length < 2) return [span];
    return parts
      .map((part, i) => {
        if (i % 2 === 0)
          return { text: part, style: span.style, ...(span.color ? { color: span.color } : {}) };
        return {
          text: part,
          style: emphasis.bold ? withBold(span.style) : span.style,
          ...(emphasis.color ? { color: emphasis.color } : span.color ? { color: span.color } : {}),
          underline: true,
        };
      })
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
    const sameMark = !!last?.underline === !!span.underline;
    if (last && sameColour && sameMark) last.text += span.text;
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
  //
  // The verb uses the screen's own verb matcher, not the keyword one: a plain
  // keyword match reads an all-capital short verb as an acronym and misses its
  // inflections ("DRAW" would miss "drawing"), which the screen does not.
  spans = emphasise(spans, opts.verb ? createVerbRegex(opts.verb) : null, {
    color: opts.verbColor,
    bold: opts.verbBold,
  });
  spans = emphasise(spans, createKeywordRegex(opts.keywords ?? []), {
    color: opts.keywordColor,
  });

  return coalesce(spans.map((span) => ({ ...span, text: toText(span.text) })));
};

/** The plain text of a run of spans — what the line would have been before. */
export const spansToText = (spans: InlineSpan[]): string => spans.map((s) => s.text).join('');
