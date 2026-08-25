// pdf/buildBlocks.ts
//
// Pure transform: marking-feedback data -> ordered ContentBlock[]. No DOM, no
// jsPDF; fully unit-testable. Markup is normalised to selectable Unicode via
// toText() here so downstream drawing/measurement is plain-text.

import { ContentBlock, TextRun } from './types';
import { normalizeContent } from './text';
import { parseInlineSpans, type InlineOptions } from './inline';
import { diffWords, groupedChanges, substantiveChanges, summariseDiff } from '../utils/textDiff';

/** Brand palette (RGB 0-255). */
export const COLORS = {
  ink: [17, 24, 39] as [number, number, number],
  body: [55, 65, 81] as [number, number, number],
  muted: [107, 114, 128] as [number, number, number],
  accent: [79, 70, 229] as [number, number, number], // indigo-600
  emerald: [4, 120, 87] as [number, number, number],
  rose: [190, 18, 60] as [number, number, number],
  rule: [203, 213, 225] as [number, number, number],
  chipBg: [238, 242, 255] as [number, number, number],
  slate: [100, 116, 139] as [number, number, number],
  /**
   * Syllabus terms and the command verb, in print.
   *
   * These are the light-theme colours the app already highlights with —
   * `KEYWORD_HIGHLIGHT_CLASS`'s emerald-800 and the accent — rather than the
   * dark-theme ones, because paper is white. The screen's tinted background
   * behind a keyword has no print equivalent worth having (a wash of green
   * behind every third word is unreadable on a school laser printer), so the
   * ink carries it alone.
   */
  keyword: [6, 95, 70] as [number, number, number], // emerald-800
  verb: [67, 56, 202] as [number, number, number], // indigo-700
};

/** Map an HSC performance band to an accent colour. */
export const bandColor = (band: number): [number, number, number] => {
  if (band >= 6) return [147, 51, 234]; // purple
  if (band >= 5) return [37, 99, 235]; // blue
  if (band >= 4) return [5, 150, 105]; // green
  if (band >= 3) return [202, 138, 4]; // amber
  if (band >= 2) return [234, 88, 12]; // orange
  return [220, 38, 38]; // red
};

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

const heading = (label: string, accent = COLORS.accent): ContentBlock => ({
  kind: 'heading',
  id: nid('h'),
  runs: [run(label.toUpperCase(), 8.5, { style: 'bold', color: COLORS.muted })],
  accent,
  basePadTop: 3,
  basePadBottom: 1.5,
});

const spacer = (mm: number): ContentBlock => ({
  kind: 'spacer',
  id: nid('sp'),
  runs: [],
  basePadTop: mm,
});

const divider = (): ContentBlock => ({
  kind: 'divider',
  id: nid('div'),
  runs: [],
  basePadTop: 1.5,
  basePadBottom: 1.5,
  accent: COLORS.rule,
});

/**
 * Build the ordered block list for a marking-feedback report. Criteria are
 * numbered continuously (1., 2., …) regardless of where the column flow places
 * them.
 */
export const buildEvaluationBlocks = (data: EvaluationExportData): ContentBlock[] => {
  seq = 0;
  const blocks: ContentBlock[] = [];
  // One highlighting brief for the whole report, so a syllabus term is the same
  // colour in the student's response, the marker's commentary and the rewrite.
  const hl: InlineOptions = { keywords: data.keywords, verb: data.verb };

  // 1. Question -------------------------------------------------------------
  blocks.push(heading('Question'));
  blocks.push({
    kind: 'paragraph',
    id: nid('meta'),
    runs: [
      run(`${data.verb}  ·  ${data.totalMarks} ${data.totalMarks === 1 ? 'mark' : 'marks'}`, 7.5, {
        style: 'bold',
        color: COLORS.accent,
      }),
    ],
    basePadBottom: 1,
  });
  if (data.syllabusPath && data.syllabusPath.trim()) {
    blocks.push({
      kind: 'paragraph',
      id: nid('path'),
      runs: [run(data.syllabusPath, 7.5, { color: COLORS.muted, lineHeightFactor: 1.25 })],
      breakable: true,
      basePadBottom: 1.5,
    });
  }
  blocks.push({
    kind: 'paragraph',
    id: nid('q'),
    runs: [richRun(data.question, 12.5, { color: COLORS.ink, lineHeightFactor: 1.25 }, hl)],
    breakable: true,
    basePadBottom: 2,
  });

  // 2. Score summary --------------------------------------------------------
  const accent = bandColor(data.overallBand);
  const metricBits: string[] = [`Band ${data.overallBand}`];
  if (typeof data.wordCount === 'number') metricBits.push(`${data.wordCount} words`);
  if (typeof data.keywordsUsed === 'number' && typeof data.keywordsTotal === 'number') {
    metricBits.push(`${data.keywordsUsed}/${data.keywordsTotal} key terms`);
  }
  blocks.push({
    kind: 'scoreSummary',
    id: nid('score'),
    label: 'Assessment Score',
    chip: `${data.overallMark} / ${data.totalMarks}`,
    accent,
    // The ladder under the metrics. A mark out of 8 means little on its own;
    // where it sits on the six bands, and how far the next one is, is the
    // question every student asks first.
    bandScale: data.overallBand,
    runs: [run(metricBits.join('   ·   '), 9, { style: 'bold', color: COLORS.body })],
    basePadTop: 1,
    basePadBottom: 3,
  });

  // 3. Student response -------------------------------------------------------
  // The submitted answer travels with the feedback so the report stands on its
  // own when handed to a teacher.
  if (data.studentAnswer && data.studentAnswer.trim()) {
    blocks.push(heading('Student Response', COLORS.slate));
    blocks.push({
      kind: 'paragraph',
      id: nid('ans'),
      runs: [richRun(data.studentAnswer, 9.5, { color: COLORS.body, lineHeightFactor: 1.35 }, hl)],
      accent: COLORS.slate,
      breakable: true,
      basePadBottom: 2,
    });
  }

  // 4. Coach's tip ----------------------------------------------------------
  if (data.quickTip && data.quickTip.trim()) {
    blocks.push(heading("Coach's Tip", accent));
    blocks.push({
      kind: 'paragraph',
      id: nid('tip'),
      runs: [
        richRun(
          data.quickTip,
          9.5,
          { style: 'italic', color: COLORS.body, lineHeightFactor: 1.3 },
          hl
        ),
      ],
      accent,
      breakable: true,
      basePadBottom: 2,
    });
  }

  // 5. Marker's commentary --------------------------------------------------
  if (data.overallFeedback && data.overallFeedback.trim()) {
    blocks.push(heading("Marker's Commentary"));
    blocks.push({
      kind: 'paragraph',
      id: nid('comm'),
      runs: [richRun(data.overallFeedback, 10, { color: COLORS.body, lineHeightFactor: 1.35 }, hl)],
      breakable: true,
      basePadBottom: 2,
    });
  }

  // 6. Strengths ------------------------------------------------------------
  if (data.strengths?.length) {
    blocks.push(heading('Strong Evidence', COLORS.emerald));
    data.strengths.forEach((s) =>
      blocks.push({
        kind: 'listItem',
        id: nid('str'),
        runs: [richRun(s, 9.5, { color: COLORS.body, lineHeightFactor: 1.3 }, hl)],
        accent: COLORS.emerald,
        breakable: true,
        basePadBottom: 1.4,
      })
    );
  }

  // 7. Areas for growth -----------------------------------------------------
  // Tick boxes rather than bullets. These are the things to do next, and a
  // printed report a student can work down and tick off is a different object
  // from a printed report they read once — the same words, doing more.
  if (data.improvements?.length) {
    blocks.push(heading('Next Steps', COLORS.rose));
    data.improvements.forEach((im) =>
      blocks.push({
        kind: 'listItem',
        id: nid('imp'),
        runs: [richRun(im, 9.5, { color: COLORS.body, lineHeightFactor: 1.3 }, hl)],
        accent: COLORS.rose,
        checkbox: true,
        breakable: true,
        basePadBottom: 1.6,
      })
    );
  }

  // 8. Criteria breakdown (continuous numbering) ----------------------------
  if (data.criteria?.length) {
    blocks.push(heading('Criteria Breakdown'));
    data.criteria.forEach((c, i) =>
      blocks.push({
        kind: 'criterion',
        id: nid('crit'),
        label: `${i + 1}. ${normalizeContent(c.criterion)}`,
        chip: `${c.mark} / ${c.maxMark}`,
        // Same fact as the chip, in a form a reader takes in without doing
        // arithmetic — and a column of them shows which criterion cost the
        // most marks without reading a word.
        meter: { value: c.mark, max: c.maxMark },
        runs: [richRun(c.feedback, 9, { color: COLORS.body, lineHeightFactor: 1.3 }, hl)],
        accent: COLORS.accent,
        breakable: true,
        basePadTop: 1,
        basePadBottom: 2,
      })
    );
  }

  // 9. Improved response (exemplar) -----------------------------------------
  if (data.revisedAnswer && data.revisedAnswer.trim()) {
    const exBand = data.exemplarBand ?? data.overallBand + 1;
    const exAccent = bandColor(exBand);
    const exMark = data.exemplarMark ?? Math.min(data.totalMarks, data.overallMark + 1);
    blocks.push(spacer(2));
    blocks.push(divider());
    blocks.push(
      heading(`Improved Response — ${exMark}/${data.totalMarks} (Band ${exBand})`, exAccent)
    );
    blocks.push({
      kind: 'paragraph',
      id: nid('rev'),
      runs: [richRun(data.revisedAnswer, 9.5, { color: COLORS.ink, lineHeightFactor: 1.4 }, hl)],
      accent: exAccent,
      breakable: true,
      basePadBottom: 2,
    });

    // 10. What changed ------------------------------------------------------
    // The improvement is an EDIT of the student's own answer, so the printed
    // report has to say WHICH words earned the mark — otherwise it is a page of
    // prose the student is left to compare against their own by eye.
    //
    // A list rather than inline marking: the text engine draws whole wrapped
    // lines in a single style, so an inline diff on paper would mean a word-
    // placement engine. Every row is prefixed − / + as well as coloured, so the
    // page survives a greyscale printer — which is most school printers.
    if (data.studentAnswer?.trim()) {
      const segments = diffWords(data.studentAnswer, data.revisedAnswer);
      // Stats describe the WHOLE revision; the printed list shows only the
      // edits worth acting on, so a page isn't spent on one-word cuts.
      const stats = summariseDiff(segments);
      const changes = substantiveChanges(groupedChanges(segments));

      if (changes.length > 0) {
        blocks.push(spacer(1.5));
        blocks.push(heading('What changed', exAccent));
        blocks.push({
          kind: 'paragraph',
          id: nid('diffsum'),
          runs: [
            run(
              `${stats.added} words added · ${stats.removed} cut · ` +
                `${Math.round(stats.retention * 100)}% of your own writing kept`,
              8.5,
              { style: 'bold', color: COLORS.muted }
            ),
          ],
          basePadBottom: 1.5,
        });

        // A long revision can run to dozens of edits; past a point the list
        // stops being a revision aid and becomes a wall. Cap it and say so.
        const MAX_PRINTED_CHANGES = 14;
        changes.slice(0, MAX_PRINTED_CHANGES).forEach((change) => {
          const runs: TextRun[] = [];
          if (change.removed) {
            runs.push(
              run(`− ${change.removed}`, 8.5, { color: COLORS.rose, lineHeightFactor: 1.3 })
            );
          }
          if (change.added) {
            runs.push(
              run(`+ ${change.added}`, 8.5, {
                color: COLORS.emerald,
                style: 'bold',
                lineHeightFactor: 1.3,
              })
            );
          }
          blocks.push({
            kind: 'listItem',
            id: nid('chg'),
            runs,
            accent: exAccent,
            breakable: true,
            basePadBottom: 1.2,
          });
        });

        if (changes.length > MAX_PRINTED_CHANGES) {
          blocks.push({
            kind: 'paragraph',
            id: nid('chgmore'),
            runs: [
              run(
                `+ ${changes.length - MAX_PRINTED_CHANGES} more change` +
                  `${changes.length - MAX_PRINTED_CHANGES === 1 ? '' : 's'} — open the comparison in the app to see them all.`,
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

  // 10. Marker's notes ------------------------------------------------------
  // Ruled space, deliberately empty. The report is printed and taken into a
  // conversation with the student — the teacher writes the part the AI cannot,
  // on the same sheet, so the two do not drift apart in a folder. Opt-in: it
  // costs a third of a column, which a screen-only reader has no use for.
  if (data.markerNotes) {
    blocks.push(spacer(2));
    blocks.push(heading("Marker's Notes", COLORS.slate));
    blocks.push({
      kind: 'paragraph',
      id: nid('notes'),
      runs: [run('Teacher comments', 7.5, { style: 'italic', color: COLORS.muted })],
      ruleLines: 5,
      accent: COLORS.rule,
      basePadBottom: 2,
    });
  }

  return blocks;
};
