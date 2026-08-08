// pdf/buildBlocks.ts
//
// Pure transform: marking-feedback data -> ordered ContentBlock[]. No DOM, no
// jsPDF; fully unit-testable. Markup is normalised to selectable Unicode via
// toText() here so downstream drawing/measurement is plain-text.

import { ContentBlock, TextRun } from './types';
import { normalizeContent } from './text';

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
}

let seq = 0;
const nid = (p: string) => `${p}-${seq++}`;

const run = (text: string, baseFontPt: number, extra: Partial<TextRun> = {}): TextRun => ({
  text: normalizeContent(text ?? ''),
  baseFontPt,
  ...extra,
});

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
    runs: [run(data.question, 12.5, { color: COLORS.ink, lineHeightFactor: 1.25 })],
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
      runs: [run(data.studentAnswer, 9.5, { color: COLORS.body, lineHeightFactor: 1.35 })],
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
        run(data.quickTip, 9.5, { style: 'italic', color: COLORS.body, lineHeightFactor: 1.3 }),
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
      runs: [run(data.overallFeedback, 10, { color: COLORS.body, lineHeightFactor: 1.35 })],
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
        runs: [run(s, 9.5, { color: COLORS.body, lineHeightFactor: 1.3 })],
        accent: COLORS.emerald,
        breakable: true,
        basePadBottom: 1.4,
      })
    );
  }

  // 7. Areas for growth -----------------------------------------------------
  if (data.improvements?.length) {
    blocks.push(heading('Areas for Growth', COLORS.rose));
    data.improvements.forEach((im) =>
      blocks.push({
        kind: 'listItem',
        id: nid('imp'),
        runs: [run(im, 9.5, { color: COLORS.body, lineHeightFactor: 1.3 })],
        accent: COLORS.rose,
        breakable: true,
        basePadBottom: 1.4,
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
        runs: [run(c.feedback, 9, { color: COLORS.body, lineHeightFactor: 1.3 })],
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
      runs: [run(data.revisedAnswer, 9.5, { color: COLORS.ink, lineHeightFactor: 1.4 })],
      accent: exAccent,
      breakable: true,
      basePadBottom: 2,
    });
  }

  return blocks;
};
