// pdf/buildBlocks.ts
//
// Pure transform: marking-feedback data -> ordered ContentBlock[]. No DOM, no
// jsPDF; fully unit-testable. Markup is normalised to selectable Unicode via
// toText() here so downstream drawing/measurement is plain-text.

import { ContentBlock, InlineSpan, TextRun } from './types';
import { normalizeContent } from './text';
import { parseInlineSpans, type InlineOptions } from './inline';
import type { IconName } from './icons';
import {
  BAND_HEX_INK,
  getBandHexDark,
  getBandName,
  textContainsKeyword,
} from '../utils/renderUtils';
import { getCommandTermInfo, getNextLevelTarget } from '../data/commandTerms';
import { diffWords, sentenceChanges, summariseDiff } from '../utils/textDiff';
import { wordCountsLine, wordsKeptLine } from '../utils/diffSummary';

/** #rrggbb -> the RGB triple the exporter draws in. */
const hexToRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const clampBand = (band: number): number => Math.max(1, Math.min(6, Math.round(band)));

/**
 * The report's palette, and the rule that governs it: EVERY COLOUR MEANS
 * EXACTLY ONE THING.
 *
 * It did not used to. On a Band 4 report the band accent, the "strong evidence"
 * bullets, the criterion meters and the rewrite's added words were all drawn in
 * effectively the same green, and a reader had no way to know which green in
 * front of them meant which. So:
 *
 *   band accent  attainment — the result strip, the ladder, the rewrite, and
 *                the words the rewrite added. Never structure. As TEXT it is
 *                the ink step (`bandInkColor`), never the fill step.
 *   keyword      a syllabus term, in the student's own words and the rewrite.
 *   verb         the question's command term, wherever the screen highlights it.
 *   rose         something to fix — the next-step ticks, the words cut.
 *   slate/ink    structure — headings, rules, bullets, chips, frames.
 *
 * A syllabus term and the command verb are also UNDERLINED wherever they are
 * highlighted, so the mark survives a greyscale printer. The colour is spent
 * only where the reader is asking "did I use the term?"; in the marker's own
 * commentary a term is underlined in body colour instead. See `proseHighlight`.
 */
export const COLORS = {
  ink: [17, 24, 39] as [number, number, number],
  body: [55, 65, 81] as [number, number, number],
  muted: [107, 114, 128] as [number, number, number],
  dim: [156, 163, 175] as [number, number, number],
  /** Structure: heading rules, bullets, accent bars, frames. */
  slate: [100, 116, 139] as [number, number, number],
  rule: [203, 213, 225] as [number, number, number],
  /** The unfilled part of a criterion meter: lighter than a rule, so a fill reads against it. */
  track: [226, 232, 240] as [number, number, number],
  /**
   * Something to fix, and the words a rewrite cut.
   *
   * Dark crimson rather than the old rose: a diff has a convention older than
   * this report, and a reader arrives expecting red for what went and green for
   * what came. Rose read as magenta beside it.
   */
  rose: [185, 28, 28] as [number, number, number], // red-700
  /**
   * The words a rewrite added.
   *
   * The one place the band accent does NOT stand for attainment. Additions were
   * drawn in it, which meant they were amber on a Band 3 report and purple on a
   * Band 6 one — a diff in colours nobody reads as a diff. Green/red is the
   * convention, and it is worth more here than the consistency it costs.
   */
  added: [21, 128, 61] as [number, number, number], // green-700
  /**
   * Syllabus terms and the command verb, in print.
   *
   * Teal rather than the screen's emerald. On screen a keyword sits on a
   * tinted background and nothing else is green; on paper the wash has no
   * equivalent worth having (a green haze behind every third word is
   * unreadable on a school laser printer) and the diff below it is already
   * using green for "the rewrite added this". Two greens a page apart, meaning
   * different things, is the collision this palette exists to prevent — so the
   * syllabus terms move to the neighbouring hue and keep the green for the diff.
   *
   * The verb stays the app's accent indigo.
   */
  keyword: [15, 118, 110] as [number, number, number], // teal-700
  verb: [67, 56, 202] as [number, number, number], // indigo-700
};

/**
 * Map an HSC performance band to its accent colour.
 *
 * Read from the app's own `BAND_HEX_DARK` rather than restated here. It used to
 * be a literal map, and it had already drifted: Band 4 printed emerald where
 * the screen drew green, which is exactly the kind of disagreement a student
 * notices between the app and the sheet in their hand.
 */
export const bandColor = (band: number): [number, number, number] => hexToRgb(getBandHexDark(band));

/**
 * The same band, as TEXT on paper: the `-700` ink step.
 *
 * `bandColor` is the `-600` fill, and on white it measures 3.0 to 5.2:1 by band —
 * yellow misses 4.5 outright, and the figures and chips that were set in it
 * (the mark, the criterion scores) were the report's text, not its decoration.
 * Pinned by pdfExport.test.ts at 4.5:1 for every band.
 */
export const bandInkColor = (band: number): [number, number, number] =>
  hexToRgb(BAND_HEX_INK[clampBand(band)]);

/** Minimal data the exporter needs — decoupled from the React prop shapes. */
export interface EvaluationExportData {
  question: string;
  verb: string;
  totalMarks: number;
  /** Where the question sits in the syllabus (course › topic › … trail). */
  syllabusPath?: string;
  /** The student's own submitted answer, verbatim. */
  studentAnswer?: string;
  overallMark: number;
  overallBand: number;
  /**
   * The question's target (max achievable) band — its tier ceiling. Caps the
   * band ladder so a lower-tier question does not draw empty rungs up to Band 6.
   * Absent means the full six-band ladder.
   */
  targetBand?: number;
  overallFeedback: string;
  quickTip?: string;
  strengths: string[];
  improvements: string[];
  criteria: { criterion: string; mark: number; maxMark: number; feedback: string }[];
  revisedAnswer?: string;
  /**
   * The edits the marker says it made to reach the improved response, and why
   * each earns credit — 2 to 4 short lines, in the marker's words. Printed first
   * in "What changed". The caller passes them only when the rewrite itself is
   * shown: a reason for an edit the reader cannot see is worse than none.
   */
  keyChanges?: string[];
  exemplarBand?: number;
  /** What the improved response is worth — one mark above the student's own. */
  exemplarMark?: number;
  wordCount?: number;
  keywordsUsed?: number;
  keywordsTotal?: number;
  /** Ruled space at the end for a teacher's handwritten notes. */
  markerNotes?: boolean;
  /**
   * The question's syllabus terms, coloured wherever they appear in the report
   * — the same terms the app highlights on screen. Omit and the prose prints in
   * body colour throughout, which is what every export did before.
   */
  keywords?: string[];
  /**
   * Of those, the ones the question, its scenario or its syllabus names itself.
   * The report lists what a student has not used yet, and it lists these first:
   * on paper there is no tooltip to explain that some terms matter more, so the
   * order has to do it. Omit and the terms print in list order, as before.
   */
  mustUseKeywords?: string[];
}

/**
 * The report's own name, and the one place it is stated: the title under the
 * letterhead, and the running head on every later page.
 *
 * The product's name is not the title. It is the letterhead, "BAND 6" beside its
 * mark and set small, and it is kept small on purpose: printed as the largest
 * text on a Band 2 report, "Band 6" reads as a claim about the mark below it.
 */
export const DEFAULT_TITLE = 'Marking feedback';

/** Presentation the report carries but the marking data does not. */
export interface ReportChrome {
  title?: string;
  subtitle?: string;
  /** Name / class / date rules on the masthead. */
  showFields?: boolean;
}

let seq = 0;
const nid = (p: string) => `${p}-${seq++}`;

const run = (text: string, baseFontPt: number, extra: Partial<TextRun> = {}): TextRun => ({
  text: normalizeContent(text ?? ''),
  baseFontPt,
  ...extra,
});

/**
 * A run of model prose, carrying the same emphasis and highlighting it has on
 * screen: **bold** from the marker, syllabus keywords in emerald, the command
 * verb in the accent colour.
 *
 * Used for everything a marker or a student actually wrote — the question, the
 * response, the commentary, the criteria, the rewrite. Plain `run()` stays for
 * the report's own furniture (headings, metric strings, "3 words added"), where
 * there is no author's emphasis to preserve and a stray asterisk in a metric
 * line should not silently bold half of it.
 */
const richRun = (
  text: string,
  baseFontPt: number,
  extra: Partial<TextRun> = {},
  highlight: InlineOptions = {}
): TextRun => {
  const base = run(text, baseFontPt, extra);
  return {
    ...base,
    // No default keyword colour here: whether a term is coloured is the decision
    // of the highlight set the caller passes (see `proseHighlight`). A default
    // would colour the marker's commentary whatever the caller meant.
    spans: parseInlineSpans(text ?? '', {
      baseStyle: extra.style ?? 'normal',
      ...highlight,
    }),
  };
};

/**
 * A section heading: an icon, the label in the report's display voice, and a
 * hairline rule under the row. Structure is slate unless the section is about
 * attainment, in which case the caller passes the band accent.
 */
const heading = (
  label: string,
  icon: IconName,
  accent: [number, number, number] = COLORS.slate
): ContentBlock => ({
  kind: 'heading',
  id: nid('h'),
  runs: [run(label, 9, { style: 'bold', color: COLORS.ink })],
  icon,
  display: true,
  accent,
  basePadTop: 3.4,
  basePadBottom: 2,
});

const spacer = (mm: number): ContentBlock => ({
  kind: 'spacer',
  id: nid('sp'),
  runs: [],
  basePadTop: mm,
});

const divider = (accent = COLORS.rule): ContentBlock => ({
  kind: 'divider',
  id: nid('div'),
  runs: [],
  basePadTop: 3,
  basePadBottom: 2,
  accent,
});

/**
 * How the screen's highlighting is spent on paper, in three places.
 *
 * The screen paints the command verb and the syllabus terms in every piece of
 * marking prose: the question, the response, the tip, the commentary, the
 * strengths, the next steps, the criteria and the rewrite. The paper used to
 * paint them in the question only, or not at all, so a term emerald on screen
 * printed as plain text. Each surface now gets the highlight, in the form its
 * colour can afford:
 *
 *   prose     The question, the student's response, the rewrite. The reader is
 *             asking "did I use the term?" here, so the term is teal and
 *             underlined, and the verb is indigo, bold and underlined.
 *   feedback  The tip, the commentary, the strengths, the next steps and the
 *             criteria. The marker's own **bold** is the emphasis that matters
 *             in these, and a second colour competing with it turned a page of
 *             feedback into a page of highlighter. So a term is underlined in
 *             body colour, and the verb in indigo and underlined but not bold.
 *   diff      The rewrite's changed sentences. Their colour is the diff's own
 *             (rose for what went, green for what came), so a term is underlined
 *             in that colour and nothing else.
 *
 * Nothing here depends on colour alone. The underline is the mark a greyscale
 * printer keeps, and the verb's weight is the second one in prose.
 */
const proseHighlight = (data: EvaluationExportData): InlineOptions => ({
  keywords: data.keywords,
  keywordColor: COLORS.keyword,
  verb: data.verb,
  verbColor: COLORS.verb,
  verbBold: true,
});

const feedbackHighlight = (data: EvaluationExportData): InlineOptions => ({
  keywords: data.keywords,
  verb: data.verb,
  verbColor: COLORS.verb,
});

const diffHighlight = (data: EvaluationExportData): InlineOptions => ({
  keywords: data.keywords,
  verb: data.verb,
});

/**
 * The one-line key under the question, as the screen prints it: the same two
 * highlights, drawn as they are drawn in the text, so the key cannot disagree
 * with what it explains. Shown only when there is something to explain.
 */
const highlightKey = (data: EvaluationExportData): ContentBlock | null => {
  const hasVerb = !!data.verb?.trim();
  const hasTerms = !!data.keywords?.length;
  if (!hasVerb && !hasTerms) return null;
  // One run with spans, for the reason the diff key carries: sibling runs stack
  // as separate lines rather than flowing inline.
  const spans: InlineSpan[] = [{ text: 'Highlighted: ', style: 'normal', color: COLORS.muted }];
  if (hasVerb) {
    spans.push({ text: 'command verb', style: 'bold', color: COLORS.verb, underline: true });
  }
  if (hasVerb && hasTerms) spans.push({ text: ' · ', style: 'normal', color: COLORS.muted });
  if (hasTerms) {
    spans.push({ text: 'syllabus terms', style: 'normal', color: COLORS.keyword, underline: true });
  }
  return {
    kind: 'paragraph',
    id: nid('hkey'),
    fullWidth: true,
    runs: [
      {
        text: spans.map((s) => s.text).join(''),
        baseFontPt: 8,
        color: COLORS.muted,
        spans,
      },
    ],
    basePadTop: 1.6,
    basePadBottom: 0,
  };
};

/**
 * Build the ordered block list for a marking-feedback report. Criteria are
 * numbered continuously (1., 2., …) regardless of where the column flow places
 * them.
 */
export const buildEvaluationBlocks = (
  data: EvaluationExportData,
  chrome: ReportChrome = {}
): ContentBlock[] => {
  seq = 0;
  const blocks: ContentBlock[] = [];
  const prose = proseHighlight(data);
  const feedback = feedbackHighlight(data);
  const diff = diffHighlight(data);

  // 0. Masthead -------------------------------------------------------------
  // Content, not page chrome. It used to be drawn as a header, which meant its
  // ~20mm was reserved on every page and reprinted verbatim on every page; as a
  // block it appears once and pages two and after get the space back.
  blocks.push({
    kind: 'masthead',
    id: nid('mast'),
    fullWidth: true,
    label: chrome.title ?? DEFAULT_TITLE,
    subText: chrome.subtitle,
    fields: chrome.showFields ?? true,
    accent: bandColor(data.overallBand),
    runs: [],
    basePadBottom: 2,
  });

  // 1. The question, in a box ------------------------------------------------
  // One block, not four: the eyebrow, the question and the syllabus trail
  // qualify each other, and a frame that could separate from its trail at a
  // column break would be worse than no frame. The trail sits UNDER the
  // question — it says where the question came from, which is context a reader
  // wants after the question, not before it.
  const accent = bandColor(data.overallBand);
  const inkAccent = bandInkColor(data.overallBand);
  const marks = `${data.totalMarks} ${data.totalMarks === 1 ? 'mark' : 'marks'}`;
  blocks.push({
    kind: 'questionCard',
    id: nid('q'),
    fullWidth: true,
    label: 'Question',
    icon: 'question',
    eyebrow: data.verb,
    eyebrowChip: marks,
    panel: true,
    panelAccent: accent,
    accent,
    inkAccent,
    runs: [
      richRun(
        data.question,
        14,
        { style: 'bold', color: COLORS.ink, lineHeightFactor: 1.3 },
        prose
      ),
    ],
    subText: data.syllabusPath?.trim() ? data.syllabusPath : undefined,
    basePadTop: 1,
    basePadBottom: 3,
  });
  const key = highlightKey(data);
  if (key) blocks.push(key);

  // 2. Result strip ---------------------------------------------------------
  // "Assessment" is a word with weight in an HSC year — this is practice
  // marking, and the sheet should not imply otherwise. It says RESULT.
  const metricBits: string[] = [];
  if (typeof data.wordCount === 'number') metricBits.push(`${data.wordCount} words`);
  if (typeof data.keywordsUsed === 'number' && typeof data.keywordsTotal === 'number') {
    metricBits.push(`${data.keywordsUsed} of ${data.keywordsTotal} key terms`);
  }
  // Cap the ladder at the question's target (max achievable) band, clamped to a
  // whole 1..6. A lower-tier question stops the rungs at its ceiling instead of
  // showing empty (never reachable) segments up to Band 6.
  const bandScaleMax = Math.max(1, Math.min(6, Math.round(data.targetBand ?? 6)));
  const shownBand = Math.min(data.overallBand, bandScaleMax);
  blocks.push({
    kind: 'scoreSummary',
    id: nid('score'),
    fullWidth: true,
    label: 'Result',
    chip: `${data.overallMark} / ${data.totalMarks}`,
    // The band, in the words the app uses on screen. "Band 4" is a number a
    // student has to already know how to read; "Band 4 · Sound" is not.
    subText: `Band ${shownBand} · ${getBandName(shownBand)}`,
    accent,
    inkAccent,
    bandScale: shownBand,
    bandScaleMax,
    runs: [run(metricBits.join('\n'), 8.5, { style: 'bold', color: COLORS.body })],
    basePadTop: 1,
    basePadBottom: 3,
  });

  // 3. The student's own answer ---------------------------------------------
  // Boxed, and boxed the same way the rewrite below is, because the whole point
  // of carrying both is that a reader can hold them against each other.
  if (data.studentAnswer && data.studentAnswer.trim()) {
    blocks.push({ ...heading('Your Response', 'pen'), fullWidth: true });
    blocks.push({
      kind: 'paragraph',
      id: nid('ans'),
      fullWidth: true,
      // 10.5pt, a full point above the 9pt the commentary, the criteria and the
      // next steps are set in. The three panels a reader actually compares —
      // the question, what the student wrote, and what it could have been —
      // were within half a point of the notes around them, so a page of this
      // report read as one undifferentiated wall of 9pt with frames drawn on
      // parts of it. The frames said "this is a document"; the type did not.
      runs: [
        richRun(data.studentAnswer, 10.5, { color: COLORS.body, lineHeightFactor: 1.4 }, prose),
      ],
      panel: true,
      panelAccent: COLORS.slate,
      breakable: true,
      basePadBottom: 2,
    });
  }

  // 3b. The terms still to reach for --------------------------------------
  // "2 of 7 key terms" is a scoreboard: it says how many without saying which,
  // so a report whose commentary praises the student's terminology can look
  // like it contradicts its own metric. Naming the ones still missing turns the
  // number into something to do, and shows the count was right all along.
  if (data.studentAnswer?.trim() && data.keywords?.length) {
    const mustUse = new Set(data.mustUseKeywords || []);
    const unusedAll = data.keywords.filter((kw) => !textContainsKeyword(data.studentAnswer!, kw));
    // The terms the question names lead, and only the first six are printed —
    // so which six they are decides whether the line is useful. Ordering here
    // rather than filtering: a supporting term is still worth reaching for,
    // it is just not the one to reach for first.
    const unused = [
      ...unusedAll.filter((kw) => mustUse.has(kw)),
      ...unusedAll.filter((kw) => !mustUse.has(kw)),
    ];
    if (unused.length) {
      const MAX_NAMED = 6;
      const named = unused.slice(0, MAX_NAMED).join(', ');
      const more = unused.length - MAX_NAMED;
      const namedAreKey = unused.slice(0, MAX_NAMED).every((kw) => mustUse.has(kw));
      const label = namedAreKey
        ? 'Terms this question names, not yet used'
        : 'Syllabus terms not yet used';
      // Set as a labelled line, not a grey sentence. In one muted colour at
      // `basePadTop: 0.5` it sat hard under the response panel in the same tone
      // the report uses for captions, so it read as metadata about the box — or
      // worse, as something the student had typed at the end of their own
      // answer. Three changes, no new machinery: the label leads in slate bold
      // so the line announces itself, the terms take `COLORS.keyword` — the same
      // teal every syllabus term is already drawn in, in the response above and
      // the rewrite below, so they are recognisable as terms on sight — and the
      // top padding lifts it clear of the panel it is about.
      //
      // One run with spans, for the reason the diff key carries: sibling runs
      // stack as separate line groups, they do not flow inline.
      blocks.push({
        kind: 'paragraph',
        id: nid('unused'),
        fullWidth: true,
        runs: [
          {
            text: `${label}: ${named}` + (more > 0 ? ` (and ${more} more)` : '') + '.',
            baseFontPt: 8.5,
            color: COLORS.muted,
            lineHeightFactor: 1.3,
            spans: [
              { text: `${label}: `, style: 'bold', color: COLORS.slate },
              { text: named, style: 'bold', color: COLORS.keyword, underline: true },
              {
                text: (more > 0 ? ` (and ${more} more)` : '') + '.',
                style: 'normal',
                color: COLORS.muted,
              },
            ],
          },
        ],
        breakable: true,
        basePadTop: 2.5,
        basePadBottom: 2.5,
      });
    }
  }

  // 4. Coach's tip ----------------------------------------------------------
  if (data.quickTip && data.quickTip.trim()) {
    blocks.push(heading("Coach's Tip", 'bulb'));
    blocks.push({
      kind: 'paragraph',
      id: nid('tip'),
      runs: [
        richRun(
          data.quickTip,
          9.5,
          { style: 'italic', color: COLORS.body, lineHeightFactor: 1.35 },
          feedback
        ),
      ],
      accent: COLORS.slate,
      breakable: true,
      basePadBottom: 2.5,
    });
  }

  // 5. Marker's commentary --------------------------------------------------
  if (data.overallFeedback && data.overallFeedback.trim()) {
    blocks.push(heading("Marker's Commentary", 'speech'));
    blocks.push({
      kind: 'paragraph',
      id: nid('comm'),
      runs: [
        richRun(data.overallFeedback, 9.5, { color: COLORS.body, lineHeightFactor: 1.4 }, feedback),
      ],
      breakable: true,
      basePadBottom: 2.5,
    });
  }

  // 6. Strengths ------------------------------------------------------------
  if (data.strengths?.length) {
    blocks.push(heading('Strong Evidence', 'check'));
    data.strengths.forEach((str) =>
      blocks.push({
        kind: 'listItem',
        id: nid('str'),
        runs: [richRun(str, 9, { color: COLORS.body, lineHeightFactor: 1.35 }, feedback)],
        accent: COLORS.slate,
        // A tick against the next steps' empty box: the two lists are the same
        // gesture in two states — what the response already does, and what it
        // has yet to. Solid squares beside empty boxes read as two systems.
        tick: true,
        breakable: true,
        basePadBottom: 1.6,
      })
    );
  }

  // 7. Areas for Growth ---------------------------------------------------
  // Tick boxes rather than bullets. These are the things to do next, and a
  // printed report a student can work down and tick off is a different object
  // from a printed report they read once — the same words, doing more.
  if (data.improvements?.length) {
    // The screen's own heading. "Next Steps" names the action; this names the list.
    blocks.push(heading('Areas for Growth', 'arrow'));
    data.improvements.forEach((im) =>
      blocks.push({
        kind: 'listItem',
        id: nid('imp'),
        runs: [richRun(im, 9, { color: COLORS.body, lineHeightFactor: 1.35 }, feedback)],
        accent: COLORS.rose,
        checkbox: true,
        breakable: true,
        basePadBottom: 1.8,
      })
    );
  }

  // 8. Criteria breakdown (continuous numbering) ----------------------------
  if (data.criteria?.length) {
    blocks.push(heading('Criteria Breakdown', 'bars'));
    data.criteria.forEach((c, i) =>
      blocks.push({
        kind: 'criterion',
        id: nid('crit'),
        // Styled runs rather than a plain label, so a criterion's title is set
        // in the same voice as the feedback under it — a marker's **bold** used
        // to survive in the feedback and vanish from the title above it.
        label: `${i + 1}. ${normalizeContent(c.criterion)}`,
        labelRuns: [
          richRun(`${i + 1}. ${c.criterion}`, 9, { style: 'bold', color: COLORS.ink }, feedback),
        ],
        chip: `${c.mark} / ${c.maxMark}`,
        // Same fact as the chip, in a form a reader takes in without doing
        // arithmetic — and a column of them shows which criterion cost the
        // most marks without reading a word.
        meter: { value: c.mark, max: c.maxMark },
        runs: [richRun(c.feedback, 9, { color: COLORS.body, lineHeightFactor: 1.35 }, feedback)],
        accent: accent,
        inkAccent,
        breakable: true,
        basePadTop: 1,
        basePadBottom: 2.4,
      })
    );
  }

  // 9. Improved response (exemplar) -----------------------------------------
  if (data.revisedAnswer && data.revisedAnswer.trim()) {
    // Normally supplied by the caller, which derives them from
    // `getNextLevelTarget`. The fallback asks the same helper rather than
    // keeping a second rule here: a `+1` of its own is how a report came to
    // print a band the rewrite had never been aimed at.
    const nextLevel = getNextLevelTarget(
      data.overallMark,
      data.totalMarks,
      // This layer keeps `verb` as a plain string — it is a report input, not a
      // domain object. `getCommandTermInfo` normalises case and falls back for
      // anything it does not recognise, so the cast cannot produce a wrong tier,
      // only the default one.
      getCommandTermInfo(data.verb as Parameters<typeof getCommandTermInfo>[0]).tier
    );
    const exBand = data.exemplarBand ?? nextLevel.targetBand;
    const exMark = data.exemplarMark ?? nextLevel.targetMark;
    // The rewrite is in the EXEMPLAR's band, as the screen draws it: the rule
    // across the top of the improved response is that band, and the heading's
    // icon is too. An earlier version framed it in the response's band so the
    // report had one hue; the screen does not, so the paper does not either. The
    // result strip above still carries the response's own band.
    const exemplarAccent = bandColor(exBand);
    blocks.push(spacer(2));
    blocks.push({
      ...heading(
        `Improved Response — ${exMark}/${data.totalMarks} · Band ${exBand} ${getBandName(exBand)}`,
        'sparkle',
        exemplarAccent
      ),
      fullWidth: true,
    });
    // Framed exactly as "Your Response" is, in the band's colour rather than
    // slate: the pair is the comparison the whole report is building towards.
    blocks.push({
      kind: 'paragraph',
      id: nid('rev'),
      fullWidth: true,
      // Set at the student's own size — the two are read against each other, and
      // a rewrite in smaller type than the answer it improves reads as a
      // footnote to it.
      runs: [
        richRun(data.revisedAnswer, 10.5, { color: COLORS.ink, lineHeightFactor: 1.4 }, prose),
      ],
      panel: true,
      panelAccent: exemplarAccent,
      breakable: true,
      basePadBottom: 2,
    });

    // 10. What changed ------------------------------------------------------
    // The improvement is an EDIT of the student's own answer, so the printed
    // report has to say WHICH words earned the mark — otherwise it is a page of
    // prose the student is left to compare against their own by eye.
    //
    // Sentence pairs rather than word runs: the text engine draws whole wrapped
    // lines in one style, so an inline diff on paper would mean a word-placement
    // engine, and a word-level ROW is a fragment with its sense removed. Each
    // row is marked − / + in the gutter as well as coloured, so the page
    // survives a greyscale printer — which is most school printers.
    // The marker's reasons lead the section. They are the one part a reader can
    // take in without comparing two texts, so they come before the word count
    // and the pairs, and they survive when the pairs cannot be drawn.
    const keyChanges = (data.keyChanges ?? []).map((s) => s.trim()).filter(Boolean);
    const studentText = data.studentAnswer?.trim() ? data.studentAnswer : '';
    const stats = studentText ? summariseDiff(diffWords(studentText, data.revisedAnswer)) : null;
    const changes = studentText ? sentenceChanges(studentText, data.revisedAnswer) : [];
    const hasEdits = stats !== null && stats.added + stats.removed > 0;

    // Nothing to compare and no reasons to give: the section has nothing to say.
    if (hasEdits || keyChanges.length > 0) {
      // The rule the user reads as "the rewrite ends here".
      blocks.push({ ...divider(COLORS.rule), fullWidth: true });

      // With no rows to draw, the section is a single sentence — so it spans
      // the page rather than sitting in a narrow column with the heading
      // beside it and the sentence wrapping awkwardly in the other.
      const holistic = changes.length === 0;
      blocks.push({
        ...heading('Improved response: what changed', 'swap'),
        fullWidth: holistic,
      });

      if (keyChanges.length > 0) {
        // A sub-heading, not a section heading: it names the list under it.
        blocks.push({
          kind: 'paragraph',
          id: nid('chgwhy'),
          fullWidth: holistic,
          runs: [run('Why these edits earn the mark', 8.5, { style: 'bold', color: COLORS.slate })],
          keepWithNext: true,
          basePadTop: 1,
          basePadBottom: 1.5,
        });
        keyChanges.forEach((change) =>
          blocks.push({
            kind: 'listItem',
            id: nid('chgwhy-item'),
            fullWidth: holistic,
            // The feedback's own voice: the marker's prose, with its terms and
            // verb underlined as they are in the commentary above.
            runs: [richRun(change, 9, { color: COLORS.body, lineHeightFactor: 1.35 }, feedback)],
            accent: COLORS.slate,
            breakable: true,
            basePadBottom: 1.6,
          })
        );
      }

      if (stats && hasEdits) {
        // The screen's own summary, from the same statistic: the share of the
        // student's words the rewrite keeps, and how far the count moves. A count
        // of rewritten sentences reads as a rewrite of everything, whatever the
        // edit was, so the paper says what the screen says.
        blocks.push({
          kind: 'paragraph',
          id: nid('diffsum'),
          fullWidth: holistic,
          runs: [
            run(`${wordsKeptLine(stats)} · ${wordCountsLine(stats)}`, 8.5, {
              style: 'bold',
              color: COLORS.muted,
            }),
          ],
          basePadBottom: 2,
        });

        if (changes.length === 0) {
          // No sentence in the rewrite is a version of a sentence in the
          // response — it was reworked throughout rather than edited in places.
          // Say that, rather than print a truncated quotation from each and let
          // it pose as a comparison: the two panels above already sit on the
          // same page, which is the comparison.
          blocks.push({
            kind: 'paragraph',
            id: nid('chgminor'),
            fullWidth: true,
            runs: [
              run(
                'This rewrite reworks the response throughout rather than editing it in places, ' +
                  'so there is no sentence-by-sentence comparison to draw. Read the improved ' +
                  'response above against your own.',
                8.5,
                { color: COLORS.muted, lineHeightFactor: 1.35 }
              ),
            ],
            breakable: true,
            basePadBottom: 2,
          });
        } else {
          // The key to the two markers, and only where there are markers to
          // key. Printed unconditionally it sat above the "reworked throughout"
          // message explaining a red and a green that were nowhere on the page.
          //
          // It has to say HOW TO READ the grid, not just what the markers mean.
          // Set as two bold phrases either side of a wide gap — "\u2212 what you
          // wrote          + what it became" — one line above a two-column flow,
          // it read as a pair of column headings promising originals on the left
          // and rewrites on the right. What is actually below is a stack of
          // pairs, each sentence over its own replacement, packed down one
          // column and on into the next: `keepWithNext` on the "before" row
          // exists precisely to stop a pair being split across that boundary,
          // because the pairing is the whole point of the section.
          //
          // So the fix is the key, not the grid. Naming the reading order kills
          // the left-right reading, and tinting each marker in the colour of the
          // card it labels makes it a legend rather than a heading.
          //
          // ONE run carrying spans, not five runs. Sibling runs in a block are
          // wrapped and drawn as stacked line groups — that is what lets a diff
          // row hold a marker and its wrapped tail — so a sentence split across
          // several of them sets as several lines. Inline mixing is what `spans`
          // is for.
          blocks.push({
            kind: 'paragraph',
            id: nid('difflegend'),
            runs: [
              {
                text: 'Read each pair top to bottom: \u2212 what you wrote, then + what it became.',
                baseFontPt: 8,
                color: COLORS.muted,
                spans: [
                  { text: 'Read each pair top to bottom: ', style: 'normal', color: COLORS.muted },
                  { text: '\u2212 what you wrote', style: 'bold', color: COLORS.rose },
                  { text: ', then ', style: 'normal', color: COLORS.muted },
                  { text: '+ what it became', style: 'bold', color: COLORS.added },
                  { text: '.', style: 'normal', color: COLORS.muted },
                ],
              },
            ],
            basePadBottom: 1.6,
          });
          // The cap is for a list that would become a second copy of the
          // rewrite, and a rewrite that is a one-band edit keeps 60-85% of the
          // student's words, so it rarely gets there. Eight pairs is the most a
          // printed revision aid needs. A lower cap sent the student back up the
          // page to read the rest while the bottom of the page was still blank,
          // which costs more than the length it saves.
          const MAX_PRINTED_CHANGES = 8;
          changes.slice(0, MAX_PRINTED_CHANGES).forEach((change) => {
            // One block per side, not one block with two runs: a single run is
            // what the layout engine can split at a column boundary, and a
            // rewritten sentence is easily a column's worth of text.
            if (change.before) {
              blocks.push({
                kind: 'listItem',
                id: nid('chgold'),
                runs: [
                  richRun(change.before, 8.5, { color: COLORS.rose, lineHeightFactor: 1.35 }, diff),
                ],
                diffMarker: '\u2212',
                accent: COLORS.rose,
                panel: true,
                panelBorderless: true,
                panelAccent: COLORS.rose,
                // The pair is one thought. A break between the two halves puts
                // the sentence and its rewrite in different columns, which is
                // the one thing the pairing exists to spare the reader.
                keepWithNext: !!change.after,
                breakable: true,
                // No gap under a row that has a partner: the two tints meet, so
                // the pair reads as one card rather than two neighbouring rows.
                basePadBottom: change.after ? 0 : 2.6,
              });
            }
            if (change.after) {
              blocks.push({
                kind: 'listItem',
                id: nid('chgnew'),
                runs: [
                  richRun(
                    change.after,
                    8.5,
                    { color: COLORS.added, style: 'bold', lineHeightFactor: 1.35 },
                    diff
                  ),
                ],
                diffMarker: '+',
                accent: COLORS.added,
                panel: true,
                panelBorderless: true,
                panelAccent: COLORS.added,
                breakable: true,
                basePadBottom: 2.6,
              });
            }
          });

          if (changes.length > MAX_PRINTED_CHANGES) {
            blocks.push({
              kind: 'paragraph',
              id: nid('chgmore'),
              runs: [
                run(
                  `+ ${changes.length - MAX_PRINTED_CHANGES} more rewritten sentence` +
                    `${changes.length - MAX_PRINTED_CHANGES === 1 ? '' : 's'} — read them in the improved response above.`,
                  8.5,
                  { color: COLORS.muted }
                ),
              ],
              basePadBottom: 2,
            });
          }
        }
      }
    }
  }

  // 11. Marker's notes ------------------------------------------------------
  // Ruled space, deliberately empty, and full width — it used to land in
  // whatever column was left over, which in a typical report was five short
  // half-width rules nobody could write a sentence on. The report is printed and
  // taken into a conversation with the student; the teacher writes the part the
  // AI cannot, on the same sheet, so the two do not drift apart in a folder.
  if (data.markerNotes) {
    blocks.push(spacer(2));
    blocks.push({ ...heading("Marker's Notes", 'notes'), fullWidth: true });
    blocks.push({
      kind: 'paragraph',
      id: nid('notes'),
      fullWidth: true,
      runs: [run('Teacher comments', 7.5, { style: 'italic', color: COLORS.muted })],
      ruleLines: 6,
      flexibleRules: true,
      accent: COLORS.rule,
      basePadBottom: 2,
    });
  }

  return blocks;
};
