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
import { classifySyllabusTerms } from './syllabusTermSource';

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
export const auditSampleAnswer = (
  prompt: Prompt,
  sample: SampleAnswer,
  /** The dot point this question sits under, when the caller knows it — a term
   *  the syllabus names is one the exemplar was expected to use. */
  dotPointText?: string
): ExemplarFlag[] => {
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

  // 2. A high-band exemplar that skips the terms the question is BUILT on.
  //
  //    This counted every listed term equally and fired below 40% coverage —
  //    which is the wrong measure twice over: a supporting term ("bioethics" on
  //    a CRISPR question) is not one a model answer has to contain, and an
  //    exemplar can clear 40% while missing every term the question itself
  //    names. Measured over the shipped library, the old rule flagged 34 of 259
  //    band-5+ exemplars and the two sets barely overlap.
  //
  //    Now it asks the only question mechanics can honestly ask about content:
  //    did the top-band answer use the terms the question, its scenario and its
  //    syllabus name themselves? Two or more missing, because one is a judgement
  //    call — a term the answer demonstrates without naming — and two is a
  //    pattern.
  //
  //    A WARNING rather than a note, which is what makes the retarget worth
  //    doing: only warnings reach `promptHasExemplarMismatch`, and only that
  //    reaches the studio's Exemplar Mismatch filter. As an info flag this
  //    check has never been visible to anyone.
  const keywords = (prompt.keywords || []).filter(
    (k) => typeof k === 'string' && k.trim().length > 0
  );
  if (band >= 5 && keywords.length >= 2) {
    const named = classifySyllabusTerms(keywords, {
      question: prompt.question,
      scenario: prompt.scenario,
      dotPointText,
    });
    const missing = keywords.filter(
      (kw) => named.has(kw) && !textContainsKeyword(sample.answer, kw)
    );
    if (missing.length >= 2) {
      flags.push({
        sampleId: sample.id,
        band,
        severity: 'warning',
        code: 'thin-coverage',
        message: `A Band ${band} exemplar that never uses ${missing.length} of the terms this question names: ${missing.join(', ')}.`,
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
export const auditPromptExemplars = (prompt: Prompt, dotPointText?: string): ExemplarFlag[] =>
  (prompt.sampleAnswers || []).flatMap((sa) => auditSampleAnswer(prompt, sa, dotPointText));

/**
 * True when a prompt has at least one WARNING-level exemplar flag — the signal
 * the Content Audit filters and counts on. Info-only notes don't make a prompt
 * "mismatched", so the filter stays a high-signal triage list rather than noise.
 */
export const promptHasExemplarMismatch = (prompt: Prompt, dotPointText?: string): boolean =>
  auditPromptExemplars(prompt, dotPointText).some((f) => f.severity === 'warning');
