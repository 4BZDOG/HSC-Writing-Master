import { describe, it, expect } from 'vitest';
import { parseInlineSpans, spansToText } from '../../pdf/inline';
import { wrapRich } from '../../pdf/wrapRich';
import { buildEvaluationBlocks, COLORS, type EvaluationExportData } from '../../pdf/buildBlocks';
import { measureBlocks, computeGeometry, splitOversized } from '../../pdf/layout';
import type { InlineSpan, TextMeasurer } from '../../pdf/types';

/**
 * The exported PDF used to be the right sentences in the wrong voice: `toText`
 * stripped every emphasis marker on the way to paper, so a marker's **bold**
 * and the syllabus terms the app colours on screen all came out as flat body
 * text. These cover the three things that had to be true to fix it — spans are
 * parsed, they wrap in the styles they will be drawn in, and they survive a
 * block being split across a column boundary.
 */

/** A monospace-ish measurer: 1mm per character, bold 25% wider. */
const measurer: TextMeasurer = {
  wrap: (text, maxWidthMm) => {
    const perLine = Math.max(1, Math.floor(maxWidthMm));
    const out: string[] = [];
    for (let i = 0; i < text.length; i += perLine) out.push(text.slice(i, i + perLine));
    return out.length ? out : [''];
  },
  lineHeight: (fontPt, factor) => fontPt * factor * 0.3528,
  measure: (text, _fontPt, style) =>
    text.length * (style === 'bold' || style === 'bolditalic' ? 1.25 : 1),
};

const styleOf = (spans: InlineSpan[], needle: string) =>
  spans.find((s) => s.text.includes(needle))?.style;

const colorOf = (spans: InlineSpan[], needle: string) =>
  spans.find((s) => s.text.includes(needle))?.color;

describe('parseInlineSpans', () => {
  it('keeps the marker’s bold as bold rather than deleting the markers', () => {
    const spans = parseInlineSpans('You **must** link cause and effect.');

    expect(styleOf(spans, 'must')).toBe('bold');
    // And nothing of the markup itself reaches the page.
    expect(spansToText(spans)).toBe('You must link cause and effect.');
  });

  it('reads italics, and italics inside bold', () => {
    expect(styleOf(parseInlineSpans('an *emphasised* point'), 'emphasised')).toBe('italic');
    expect(styleOf(parseInlineSpans('**a *strong* point**'), 'strong')).toBe('bolditalic');
  });

  it('resolves ambiguous nesting the way the screen does', () => {
    // Bold is matched before italic here exactly as in `processInlineFormatting`,
    // so `*a **b** c*` reads as an italic marker the bold split has already
    // broken — the outer emphasis is lost. That is worth pinning: the printed
    // report agreeing with the screen matters more than either being cleverer.
    const spans = parseInlineSpans('*a **strong** point*');
    expect(styleOf(spans, 'strong')).toBe('bold');
  });

  it('adds emphasis to the style the block is already set in', () => {
    // The coach's tip prints in italic; a bold term inside it must not lose it.
    const spans = parseInlineSpans('Watch the **verb**.', { baseStyle: 'italic' });
    expect(styleOf(spans, 'verb')).toBe('bolditalic');
    expect(styleOf(spans, 'Watch')).toBe('italic');
  });

  it('colours syllabus terms with the app’s own matcher', () => {
    const spans = parseInlineSpans('Caching reduces latency across the network.', {
      keywords: ['latency'],
      keywordColor: COLORS.keyword,
    });

    expect(colorOf(spans, 'latency')).toEqual(COLORS.keyword);
    expect(colorOf(spans, 'Caching')).toBeUndefined();
  });

  it('matches the variants the screen matches, not just the literal term', () => {
    // getKeywordVariants covers plurals and -our/-or spellings; sharing the
    // matcher is the point, so a term highlighted on screen is never black here.
    const spans = parseInlineSpans('Several caches were warmed.', {
      keywords: ['cache'],
      keywordColor: COLORS.keyword,
    });
    expect(colorOf(spans, 'caches')).toEqual(COLORS.keyword);
  });

  it('gives the command verb its own colour, and does not let a keyword take it', () => {
    const spans = parseInlineSpans('Analyse the effect of caching.', {
      verb: 'Analyse',
      verbColor: COLORS.verb,
      keywords: ['Analyse'],
      keywordColor: COLORS.keyword,
    });

    expect(colorOf(spans, 'Analyse')).toEqual(COLORS.verb);
  });

  it('still converts maths and symbols to selectable Unicode', () => {
    expect(spansToText(parseInlineSpans('**x^2** \\times y'))).toBe('x² × y');
  });

  it('strips HTML without corrupting bare angle brackets', () => {
    expect(spansToText(parseInlineSpans('<p>List&lt;T&gt; and x < y</p>'))).toBe(
      'List<T> and x < y'
    );
  });

  it('is safe on empty input', () => {
    expect(parseInlineSpans('')).toEqual([]);
  });
});

describe('wrapRich', () => {
  it('wraps at word boundaries and keeps every word', () => {
    const spans = parseInlineSpans('one two three four five six');
    const lines = wrapRich(spans, 10, 10, measurer);

    lines.forEach((line) => expect(spansToText(line).length).toBeLessThanOrEqual(10));
    expect(lines.map(spansToText).join(' ').split(/\s+/)).toEqual([
      'one',
      'two',
      'three',
      'four',
      'five',
      'six',
    ]);
  });

  it('measures bold at its real width, so a bold line cannot overrun the column', () => {
    // 8 bold chars measure 10mm here; the plain wrap would have fitted 10.
    const bold = wrapRich(parseInlineSpans('**aaaa bbbb cccc**'), 10, 10, measurer);
    bold.forEach((line) => {
      const width = line.reduce((w, s) => w + measurer.measure(s.text, 10, s.style), 0);
      expect(width).toBeLessThanOrEqual(10 + 1e-6);
    });
  });

  it('carries the style across a wrap that falls mid-emphasis', () => {
    // The emphasis spans three lines at this width, so every one of its words
    // has to arrive bold on whichever line it lands on.
    const lines = wrapRich(parseInlineSpans('plain **bold words here** plain'), 12, 10, measurer);
    const boldWords = lines
      .flat()
      .filter((s) => s.style === 'bold')
      .flatMap((s) => s.text.split(/\s+/))
      .filter(Boolean);

    expect(lines.length).toBeGreaterThan(1);
    expect(boldWords).toEqual(['bold', 'words', 'here']);
    // …and nothing outside it was swept up.
    const plainWords = lines
      .flat()
      .filter((s) => s.style === 'normal')
      .flatMap((s) => s.text.split(/\s+/))
      .filter(Boolean);
    expect(plainWords).toEqual(['plain', 'plain']);
  });

  it('honours the author’s own line breaks', () => {
    const lines = wrapRich(parseInlineSpans('first line\nsecond line'), 100, 10, measurer);
    expect(lines.map(spansToText)).toEqual(['first line', 'second line']);
  });

  it('drops the space a line wraps on rather than indenting the next line', () => {
    const lines = wrapRich(parseInlineSpans('aaaa bbbb'), 5, 10, measurer);
    lines.forEach((line) => expect(spansToText(line)).not.toMatch(/^\s/));
  });

  it('breaks a word too long for any line instead of drawing past the margin', () => {
    const lines = wrapRich(parseInlineSpans('supercalifragilistic'), 6, 10, measurer);
    expect(lines.length).toBeGreaterThan(1);
    lines.forEach((line) => expect(spansToText(line).length).toBeLessThanOrEqual(6));
    expect(lines.map(spansToText).join('')).toBe('supercalifragilistic');
  });

  it('is safe on empty spans', () => {
    expect(wrapRich([], 10, 10, measurer)).toEqual([[]]);
  });
});

const data = (over: Partial<EvaluationExportData> = {}): EvaluationExportData => ({
  question: 'Analyse the effect of caching.',
  verb: 'Analyse',
  totalMarks: 8,
  overallMark: 4,
  overallBand: 3,
  overallFeedback: 'You **describe** caching but do not analyse its effect on latency.',
  strengths: ['Defines **latency** correctly'],
  improvements: ['Link caching to latency'],
  criteria: [{ criterion: 'Analysis', mark: 2, maxMark: 4, feedback: 'Some **analysis**.' }],
  keywords: ['latency', 'caching'],
  ...over,
});

const geo = computeGeometry({
  size: 'a4',
  columnsPerPage: 2,
  columnGap: 7,
  headerHeight: 30,
  footerHeight: 8,
});

describe('the report blocks carry their styling to the page', () => {
  it('gives the marker’s prose styled spans', () => {
    const blocks = buildEvaluationBlocks(data());
    const commentary = blocks.find((b) => b.runs[0]?.text.includes('do not analyse'));

    expect(commentary?.runs[0].spans?.some((s) => s.style === 'bold')).toBe(true);
  });

  it('colours syllabus terms in the prose, and not in the commentary', () => {
    // "Did I use the term?" is the reader's question about the response and the
    // rewrite. In the marker's own commentary a second colour only competes with
    // the **bold** the marker put there, so a page of feedback stops reading as
    // a page of highlighter.
    const blocks = buildEvaluationBlocks(
      data({ studentAnswer: 'Caching stores data close to the user and cuts latency.' })
    );
    const carries = (b: (typeof blocks)[number] | undefined) =>
      b?.runs[0].spans?.some((s) => s.color === COLORS.keyword) ?? false;

    expect(carries(blocks.find((b) => b.kind === 'questionCard'))).toBe(true);
    expect(carries(blocks.find((b) => b.id.startsWith('ans-')))).toBe(true);
    expect(carries(blocks.find((b) => b.runs[0]?.text.includes('do not analyse')))).toBe(false);
  });

  it('leaves the report’s own furniture plain', () => {
    // A heading or a metrics line has no author's emphasis to preserve, and a
    // stray asterisk in one must not silently bold half of it.
    const blocks = buildEvaluationBlocks(data());
    expect(blocks.find((b) => b.kind === 'heading')?.runs[0].spans).toBeUndefined();
    expect(blocks.find((b) => b.kind === 'scoreSummary')?.runs[0].spans).toBeUndefined();
  });

  it('keeps the plain text alongside the spans, unchanged', () => {
    const blocks = buildEvaluationBlocks(data());
    const commentary = blocks.find((b) => b.runs[0]?.text.includes('do not analyse'));

    expect(commentary?.runs[0].text).toBe(
      'You describe caching but do not analyse its effect on latency.'
    );
  });

  it('prints in body colour throughout when no keywords are supplied', () => {
    const blocks = buildEvaluationBlocks(data({ keywords: undefined }));
    const question = blocks.find((b) => b.kind === 'questionCard');
    const commentary = blocks.find((b) => b.runs[0]?.text.includes('do not analyse'));

    expect(question?.runs[0].spans?.some((s) => s.color === COLORS.keyword)).toBe(false);
    // Bold survives — it is the marker's, not the syllabus's.
    expect(commentary?.runs[0].spans?.some((s) => s.style === 'bold')).toBe(true);
  });

  it('measures styled runs into lines that match their plain twins exactly', () => {
    const measured = measureBlocks(buildEvaluationBlocks(data()), measurer, geo, 1);
    measured.forEach((block) => {
      block.wrappedRich?.forEach((rich, i) => {
        if (!rich) return;
        // Derived from ONE wrap: two wraps of the same paragraph would disagree
        // the moment a bold term sat near a line end, and the drawer would
        // paint line breaks the flow never measured.
        expect(rich.map(spansToText)).toEqual(block.wrapped[i]);
      });
    });
  });

  it('keeps the styling when a long paragraph is split across columns', () => {
    const long = Array.from({ length: 1200 }, (_, i) =>
      i % 7 === 3 ? '**latency**' : 'padding'
    ).join(' ');
    const measured = measureBlocks(
      buildEvaluationBlocks(data({ overallFeedback: long })),
      measurer,
      geo,
      1
    );
    const fragments = splitOversized(measured, geo.columnHeight).filter((b) =>
      b.id.startsWith('comm')
    );

    expect(fragments.length).toBeGreaterThan(1);
    fragments.forEach((fragment) => {
      // Every fragment carries its own slice — a continuation that lost its
      // spans would print the rest of the paragraph in the wrong voice, at
      // whichever line the column happened to break.
      expect(fragment.wrappedRich?.[0]?.length).toBe(fragment.wrapped[0].length);
      expect(fragment.wrappedRich?.[0]?.map(spansToText)).toEqual(fragment.wrapped[0]);
    });
    // The bold terms are still bold somewhere after the break.
    const tail = fragments.slice(1).flatMap((f) => f.wrappedRich?.[0] ?? []);
    expect(tail.flat().some((s) => s.style === 'bold')).toBe(true);
  });
});
