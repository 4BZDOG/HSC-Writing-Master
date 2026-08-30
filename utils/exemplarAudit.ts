/**
 * A pure, no-AI lint for the SAMPLE-ANSWER LIBRARY. It flags exemplars whose
 * mechanical profile is out of step with the band they claim — a "Band 6"
 * sample that is far too short for its band, a top-band sample that touches
 * barely any syllabus terms, or a top-band sample delivered as a single
 * paragraph.
 *
 * WHY THIS EXISTS. Replaying every marked exemplar through the readiness
 * pipeline (the calibration behind `utils/draftReadiness.ts`) showed the
 * mechanical features — length, keyword coverage, structure — separate the
 * bands only weakly: some full-mark exemplars are mechanically thin. Mechanics
 * can NEVER judge quality, so this never asserts a sample is wrong. What it can
 * do, for free, is surface the outliers worth a human (or a regenerate) look —
 * a cheap triage list for the Content Audit, alongside the AI quality screen.
 *
 * Every signal here is necessary-not-sufficient: a flag means "mechanically
 * unusual for this band", not "bad". The reasoning mirrors the live readiness
 * hint — length and coverage are honest signals of completeness, never of merit.
 */

import { Prompt, SampleAnswer } from '../types';
import { getBandForWordCount, BAND_METRICS } from '../data/commandTerms';
import { analyzeText } from './writingAnalysis';
import { textContainsKeyword } from './renderUtils';

export type ExemplarFlagSeverity = 'warning' | 'info';

export type ExemplarFlagCode = 'under-length' | 'thin-coverage' | 'single-paragraph';

export interface ExemplarFlag {
  /** The sample the flag is about. */
  sampleId: string;
  /** The band the sample claims. */
  band: number;
  severity: ExemplarFlagSeverity;
  code: ExemplarFlagCode;
  /** A short, British-English explanation a reviewer can act on. */
  message: string;
}

/** Only real, curated library exemplars are audited — not a student's own draft. */
const isLibraryExemplar = (sa: SampleAnswer): boolean =>
  sa.source !== 'USER' &&
  !sa.derivedFromStudent &&
  typeof sa.answer === 'string' &&
  sa.answer.trim().length > 30;

const clampBand = (b: number): number => Math.max(1, Math.min(6, Math.round(b)));

/** The minimum word count a given band is expected to reach for this many marks. */
const expectedMinWords = (band: number, totalMarks: number): number => {
  const metric =
    BAND_METRICS.find((m) => m.band === clampBand(band)) ?? BAND_METRICS[BAND_METRICS.length - 1];
  return Math.max(1, Math.round(totalMarks * metric.wordCountMultiplier.min));
};

/**
 * Audit one sample answer against the band it claims and the question it belongs
 * to. Returns zero or more flags; an empty list means "nothing mechanically
 * unusual", which is the common case.
 */
export const auditSampleAnswer = (prompt: Prompt, sample: SampleAnswer): ExemplarFlag[] => {
  const flags: ExemplarFlag[] = [];
  if (!isLibraryExemplar(sample)) return flags;

  const totalMarks = Number(prompt.totalMarks) || 0;
  const band = clampBand(sample.band);
  const analysis = analyzeText(sample.answer);
  const { wordCount, paragraphCount } = analysis;

  // NOTE on what is deliberately NOT checked here: band ↔ mark agreement. The
  // library labels its exemplars on a different convention from the app's own
  // `getBandForMark` — on a 3-mark question the app maps full marks to Band 6,
  // while the library stores that exemplar as Band 3. Comparing the two flags
  // essentially the whole library, which is a single systemic finding about
  // labelling conventions, not a per-exemplar defect to triage. It is recorded
  // once in the PR, not surfaced here as noise.

  // 1. Under-length for its band. If the answer is far shorter than its band's
  //    own length expects — its word count reads as three or more bands lower —
  //    it is likely under-developed for the band it claims. A gap of two bands
  //    is a softer note. (A one-band gap is far too common to be worth raising.)
  if (totalMarks > 0 && wordCount > 0) {
    const lengthBand = getBandForWordCount(wordCount, totalMarks);
    const shortfall = band - lengthBand;
    if (shortfall >= 2) {
      flags.push({
        sampleId: sample.id,
        band,
        severity: shortfall >= 3 ? 'warning' : 'info',
        code: 'under-length',
        message: `A Band ${band} exemplar but only ${wordCount} words — a Band ${band} answer here is usually ~${expectedMinWords(band, totalMarks)}+.`,
      });
    }
  }

  // 2. Thin syllabus coverage on a high-band exemplar. Coverage is necessary,
  //    not sufficient — but a top-band model answer touching almost none of the
  //    prompt's own terms is worth a look. Info only.
  const keywords = (prompt.keywords || []).filter(
    (k) => typeof k === 'string' && k.trim().length > 0
  );
  if (band >= 5 && keywords.length >= 2) {
    const used = keywords.filter((kw) => textContainsKeyword(sample.answer, kw)).length;
    if (used / keywords.length < 0.4) {
      flags.push({
        sampleId: sample.id,
        band,
        severity: 'info',
        code: 'thin-coverage',
        message: `A Band ${band} exemplar that uses only ${used} of ${keywords.length} syllabus terms.`,
      });
    }
  }

  // 3. A high-band exemplar delivered as a single paragraph, despite being long
  //    enough to warrant structure. Info only — some long answers are legitimately
  //    one sustained paragraph, but at the top band it is worth a glance.
  if (band >= 5 && paragraphCount <= 1 && wordCount >= expectedMinWords(band, totalMarks || 1)) {
    flags.push({
      sampleId: sample.id,
      band,
      severity: 'info',
      code: 'single-paragraph',
      message: `A Band ${band} exemplar written as a single paragraph.`,
    });
  }

  return flags;
};

/** Every exemplar flag across a prompt's whole sample-answer library. */
export const auditPromptExemplars = (prompt: Prompt): ExemplarFlag[] =>
  (prompt.sampleAnswers || []).flatMap((sa) => auditSampleAnswer(prompt, sa));

/**
 * True when a prompt has at least one WARNING-level exemplar flag — the signal
 * the Content Audit filters and counts on. Info-only notes don't make a prompt
 * "mismatched", so the filter stays a high-signal triage list rather than noise.
 */
export const promptHasExemplarMismatch = (prompt: Prompt): boolean =>
  auditPromptExemplars(prompt).some((f) => f.severity === 'warning');
