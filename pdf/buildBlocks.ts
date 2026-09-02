// pdf/buildBlocks.ts
//
// Pure transform: marking-feedback data -> ordered ContentBlock[]. No DOM, no
// jsPDF; fully unit-testable. Markup is normalised to selectable Unicode via
// toText() here so downstream drawing/measurement is plain-text.

import { ContentBlock, TextRun } from './types';
import { normalizeContent } from './text';
import { parseInlineSpans, type InlineOptions } from './inline';
import type { IconName } from './icons';
import { getBandHexDark, getBandName } from '../utils/renderUtils';
import {
  diffWords,
  rewrittenSentenceCount,
  sentenceChanges,
  summariseDiff,
} from '../utils/textDiff';

/** #rrggbb -> the RGB triple the exporter draws in. */
const hexToRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

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
 *                the words the rewrite added. Never structure.
 *   keyword      a syllabus term, inline in the prose. Nowhere else.
 *   verb         the question's command term, in the question. Nowhere else.
 *   rose         something to fix — the next-step ticks, the words cut.
 *   slate/ink    structure — headings, rules, bullets, chips, frames.
 */
export const COLORS = {
  ink: [17, 24, 39] as [number, number, number],
  body: [55, 65, 81] as [number, number, number],
  muted: [107, 114, 128] as [number, number, number],
  dim: [156, 163, 175] as [number, number, number],
  /** Structure: heading rules, bullets, accent bars, frames. */
  slate: [100, 116, 139] as [number, number, number],
  rule: [203, 213, 225] as [number, number, number],
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
}

/**
 * The report's own name, and the one place it is stated.
 *
 * Not "Band 6 — …": that is the product's name, and printed as the largest text
 * on a Band 2 report it reads as a claim about the mark below it.
 */
export const DEFAULT_TITLE = 'HSC Writing Coach';

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
    spans: parseInlineSpans(text ?? '', {
      baseStyle: extra.style ?? 'normal',
      keywordColor: COLORS.keyword,
      verbColor: COLORS.verb,
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
  // One highlighting brief for the whole report, so a syllabus term is the same
  // colour in the student's response, the marker's commentary and the rewrite.
  //
  // Two briefs, not one. The verb used to be coloured wherever it occurred in
  // the whole document, so "explaining", "explain" and "explained" came out
  // indigo in the commentary, the tip, the next steps and the criteria — places
  // where the word is ordinary English rather than the question's command term.
  // It is the command term in exactly one place, so it is coloured in exactly
  // one place. Syllabus terms stay everywhere the prose is the student's or the
  // model's, which is where "did I use the term?" is the reader's question.
  // Keywords ride with the PROSE — the question, the response, the rewrite —
  // where "did I use the term?" is the reader's own question. The commentary and
  // the criteria carry the marker's own **bold**, and a second colour competing
  // with it there turned a page of feedback into a page of highlighter.
  const hl: InlineOptions = { keywords: data.keywords };
  const questionHl: InlineOptions = { keywords: data.keywords, verb: data.verb };
  const plain: InlineOptions = {};

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
    basePadBottom: 3,
  });

  // 1. The question, in a box ------------------------------------------------
  // One block, not four: the eyebrow, the question and the syllabus trail
  // qualify each other, and a frame that could separate from its trail at a
  // column break would be worse than no frame. The trail sits UNDER the
  // question — it says where the question came from, which is context a reader
  // wants after the question, not before it.
  const accent = bandColor(data.overallBand);
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
    runs: [
      richRun(
        data.question,
        14,
        { style: 'bold', color: COLORS.ink, lineHeightFactor: 1.3 },
        questionHl
      ),
    ],
    subText: data.syllabusPath?.trim() ? data.syllabusPath : undefined,
    basePadTop: 1,
    basePadBottom: 3,
  });

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
      runs: [richRun(data.studentAnswer, 9.5, { color: COLORS.body, lineHeightFactor: 1.4 }, hl)],
      panel: true,
      panelAccent: COLORS.slate,
      breakable: true,
      basePadBottom: 2,
    });
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
          plain
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
        richRun(data.overallFeedback, 9.5, { color: COLORS.body, lineHeightFactor: 1.4 }, plain),
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
        runs: [richRun(str, 9, { color: COLORS.body, lineHeightFactor: 1.35 }, plain)],
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

  // 7. Areas for growth -----------------------------------------------------
  // Tick boxes rather than bullets. These are the things to do next, and a
  // printed report a student can work down and tick off is a different object
  // from a printed report they read once — the same words, doing more.
  if (data.improvements?.length) {
    blocks.push(heading('Next Steps', 'arrow'));
    data.improvements.forEach((im) =>
      blocks.push({
        kind: 'listItem',
        id: nid('imp'),
        runs: [richRun(im, 9, { color: COLORS.body, lineHeightFactor: 1.35 }, plain)],
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
          richRun(`${i + 1}. ${c.criterion}`, 9, { style: 'bold', color: COLORS.ink }, plain),
        ],
        chip: `${c.mark} / ${c.maxMark}`,
        // Same fact as the chip, in a form a reader takes in without doing
        // arithmetic — and a column of them shows which criterion cost the
        // most marks without reading a word.
        meter: { value: c.mark, max: c.maxMark },
        runs: [richRun(c.feedback, 9, { color: COLORS.body, lineHeightFactor: 1.35 }, plain)],
        accent: accent,
        breakable: true,
        basePadTop: 1,
        basePadBottom: 2.4,
      })
    );
  }

  // 9. Improved response (exemplar) -----------------------------------------
  if (data.revisedAnswer && data.revisedAnswer.trim()) {
    const exBand = data.exemplarBand ?? data.overallBand + 1;
    const exMark = data.exemplarMark ?? Math.min(data.totalMarks, data.overallMark + 1);
    // The report has ONE accent, and it is the band this response reached. The
    // rewrite used to be framed in the EXEMPLAR's band instead, which put a
    // second hue on the page — purple beside a green result strip — for a fact
    // the heading beside it already states in words.
    blocks.push(spacer(2));
    blocks.push({
      ...heading(
        `Improved Response — ${exMark}/${data.totalMarks} · Band ${exBand} ${getBandName(exBand)}`,
        'sparkle',
        accent
      ),
      fullWidth: true,
    });
    // Framed exactly as "Your Response" is, in the band's colour rather than
    // slate: the pair is the comparison the whole report is building towards.
    blocks.push({
      kind: 'paragraph',
      id: nid('rev'),
      fullWidth: true,
      runs: [richRun(data.revisedAnswer, 9.5, { color: COLORS.ink, lineHeightFactor: 1.4 }, hl)],
      panel: true,
      panelAccent: accent,
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
    if (data.studentAnswer?.trim()) {
      const stats = summariseDiff(diffWords(data.studentAnswer, data.revisedAnswer));
      const changes = sentenceChanges(data.studentAnswer, data.revisedAnswer);

      if (stats.added + stats.removed > 0) {
        // The rule the user reads as "the rewrite ends here".
        blocks.push({ ...divider(COLORS.rule), fullWidth: true });
        blocks.push(heading('What Changed', 'swap'));
        // What the two markers mean, once, where the rows begin. The colours
        // say it to a reader who knows the convention; this says it to the one
        // who does not, and to anyone holding a greyscale photocopy.
        blocks.push({
          kind: 'paragraph',
          id: nid('difflegend'),
          runs: [
            run('\u2212  what you wrote          +  what it became', 7.5, {
              style: 'bold',
              color: COLORS.muted,
            }),
          ],
          basePadBottom: 1.6,
        });
        const { rewritten, total } = rewrittenSentenceCount(data.studentAnswer, changes);
        const summary = changes.length
          ? `${rewritten} of your ${total} sentence${total === 1 ? '' : 's'} rewritten` +
            ` · ${stats.added} words added · ${stats.removed} cut`
          : `${stats.added} words added · ${stats.removed} cut`;
        blocks.push({
          kind: 'paragraph',
          id: nid('diffsum'),
          runs: [run(summary, 8, { style: 'bold', color: COLORS.muted })],
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
          // A long revision rewrites most of the answer; past a point the list
          // stops being a revision aid and becomes a second copy of the rewrite.
          const MAX_PRINTED_CHANGES = 5;
          changes.slice(0, MAX_PRINTED_CHANGES).forEach((change) => {
            // One block per side, not one block with two runs: a single run is
            // what the layout engine can split at a column boundary, and a
            // rewritten sentence is easily a column's worth of text.
            if (change.before) {
              blocks.push({
                kind: 'listItem',
                id: nid('chgold'),
                runs: [run(change.before, 8.5, { color: COLORS.rose, lineHeightFactor: 1.35 })],
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
                  run(change.after, 8.5, {
                    color: COLORS.added,
                    style: 'bold',
                    lineHeightFactor: 1.35,
                  }),
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
                  8,
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
