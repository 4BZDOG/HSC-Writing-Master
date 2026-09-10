import { describe, it, expect } from 'vitest';
import { Prompt, SampleAnswer, PromptVerb } from '../../types';
import { getCommandTermInfo, markForBand } from '../../data/commandTerms';
import {
  auditSampleAnswer,
  auditPromptExemplars,
  promptHasExemplarMismatch,
} from '../../utils/exemplarAudit';

const words = (n: number, w = 'idea'): string => Array(n).fill(w).join(' ');
const paragraphs = (n: number, wordsEach = 40): string =>
  Array.from({ length: n }, () => words(wordsEach)).join('\n\n');

const tierOf = (verb: PromptVerb): number => getCommandTermInfo(verb).tier;

const prompt = (over: Partial<Prompt> = {}): Prompt =>
  ({
    id: 'p1',
    question: 'Explain the thing.',
    totalMarks: 6,
    verb: 'EXPLAIN' as PromptVerb,
    ...over,
  }) as Prompt;

const sample = (over: Partial<SampleAnswer>): SampleAnswer => ({
  id: 's1',
  band: 4,
  mark: 4,
  answer: words(200),
  source: 'AI',
  ...over,
});

const codes = (flags: { code: string }[]) => flags.map((f) => f.code);
const warnings = <T extends { severity: string }>(flags: T[]): T[] =>
  flags.filter((f) => f.severity === 'warning');

describe('exemplarAudit — a band-appropriate exemplar is clean', () => {
  it('flags nothing when length, coverage, band and mark all line up', () => {
    const p = prompt({ totalMarks: 6, keywords: ['alpha', 'beta'] });
    const tier = tierOf(p.verb);
    const band = 4;
    // A long, multi-paragraph answer covering both terms, marked consistently.
    const answer = `${words(120, 'alpha')} beta\n\n${words(120, 'idea')}`;
    const flags = auditSampleAnswer(p, sample({ band, mark: markForBand(band, 6, tier), answer }));
    expect(flags).toEqual([]);
  });
});

describe('exemplarAudit — under-length for the claimed band', () => {
  it('warns when a high-band exemplar reads three or more bands short', () => {
    const p = prompt({ totalMarks: 8, verb: 'EVALUATE' as PromptVerb });
    const tier = tierOf(p.verb);
    const band = 6;
    // A Band 6 exemplar but only ~30 words — a Band 1 length: a warning.
    const flags = auditSampleAnswer(
      p,
      sample({ band, mark: markForBand(band, 8, tier), answer: words(30) })
    );
    expect(flags.some((f) => f.code === 'under-length' && f.severity === 'warning')).toBe(true);
  });

  it('does not raise under-length when the length matches the band', () => {
    const p = prompt({ totalMarks: 6, verb: 'EVALUATE' as PromptVerb });
    const tier = tierOf(p.verb);
    const band = 4;
    // ~250 words on a 6-mark question reads as a top-band length — no shortfall.
    const flags = auditSampleAnswer(
      p,
      sample({ band, mark: markForBand(band, 6, tier), answer: paragraphs(6) })
    );
    expect(codes(flags)).not.toContain('under-length');
  });
});

/**
 * Coverage is judged against the terms the QUESTION names, not the whole list.
 *
 * It used to fire below 40% of every listed term, which is wrong twice over: a
 * supporting term ("bioethics" on a CRISPR question) is not one a model answer
 * has to contain, and an exemplar can clear 40% while missing every term the
 * question is built on. Two missing, because one is a judgement call — a term
 * the answer demonstrates without naming — and two is a pattern.
 */
describe('exemplarAudit — a top-band exemplar that skips the question’s own terms', () => {
  const evaluateOn = (keywords: string[], question: string) =>
    prompt({ totalMarks: 10, verb: 'EVALUATE' as PromptVerb, question, keywords });

  // 400 words across paragraphs, so length and structure raise nothing.
  const longAnswerUsing = (term: string) => `${words(200, term)}\n\n${words(200, 'idea')}`;

  const auditTopBand = (p: Prompt, answer: string, dotPointText?: string) =>
    auditSampleAnswer(
      p,
      sample({ band: 6, mark: markForBand(6, 10, tierOf(p.verb)), answer }),
      dotPointText
    );

  it('warns when two or more of them never appear', () => {
    const p = evaluateOn(
      ['alpha', 'beta', 'gamma', 'delta', 'epsilon'],
      'Evaluate how alpha and beta affect gamma.'
    );
    const flags = auditTopBand(p, longAnswerUsing('alpha'));

    expect(codes(flags)).toContain('thin-coverage');
    // A warning, not a note: only warnings reach the studio's mismatch filter.
    expect(warnings(flags).map((f) => f.code)).toContain('thin-coverage');
    expect(flags.find((f) => f.code === 'thin-coverage')?.message).toContain('beta');
  });

  it('stays quiet when only one is missing', () => {
    const p = evaluateOn(['alpha', 'beta', 'delta'], 'Evaluate how alpha and beta interact.');
    const flags = auditTopBand(p, longAnswerUsing('alpha') + ' beta');
    expect(codes(flags)).not.toContain('thin-coverage');
  });

  it('ignores supporting terms the question never names', () => {
    // Four of five terms absent — but the question names none of them, so an
    // exemplar was never expected to contain them.
    const p = evaluateOn(['alpha', 'beta', 'gamma', 'delta', 'epsilon'], 'Evaluate the thing.');
    expect(codes(auditTopBand(p, longAnswerUsing('alpha')))).not.toContain('thin-coverage');
  });

  it('counts a term the dot point names when the caller supplies it', () => {
    const p = evaluateOn(['alpha', 'beta', 'gamma'], 'Evaluate the thing.');
    const flags = auditTopBand(p, longAnswerUsing('idea'), 'describe alpha, beta and gamma');
    expect(codes(flags)).toContain('thin-coverage');
  });
});

describe('exemplarAudit — high-band notes (info, not warnings)', () => {
  it('notes a top-band exemplar written as a single paragraph', () => {
    const p = prompt({ totalMarks: 10, verb: 'EVALUATE' as PromptVerb });
    const tier = tierOf(p.verb);
    const band = 6;
    const flags = auditSampleAnswer(
      p,
      sample({ band, mark: markForBand(band, 10, tier), answer: words(400) })
    );
    expect(codes(flags)).toContain('single-paragraph');
  });
});

describe('exemplarAudit — only real library exemplars are audited', () => {
  const p = prompt({ totalMarks: 6 });
  const mismatched = { band: 6, mark: 1, answer: words(200) };

  it('skips a student-authored (USER) sample', () => {
    expect(auditSampleAnswer(p, sample({ ...mismatched, source: 'USER' }))).toEqual([]);
  });
  it('skips an AI rewrite of a student answer', () => {
    expect(
      auditSampleAnswer(p, sample({ ...mismatched, source: 'AI', derivedFromStudent: true }))
    ).toEqual([]);
  });
  it('skips a stub answer that is too short to judge', () => {
    expect(auditSampleAnswer(p, sample({ band: 6, mark: 1, answer: 'too short' }))).toEqual([]);
  });
});

describe('exemplarAudit — prompt-level roll-up', () => {
  it('collects flags across all of a prompt’s samples and reports a warning mismatch', () => {
    const tier = tierOf('EVALUATE' as PromptVerb);
    const p = prompt({
      totalMarks: 6,
      verb: 'EVALUATE' as PromptVerb,
      sampleAnswers: [
        sample({ id: 'ok', band: 3, mark: markForBand(3, 6, tier), answer: paragraphs(3) }),
        // A Band 6 exemplar of ~30 words: a warning-level under-length outlier.
        sample({ id: 'bad', band: 6, mark: markForBand(6, 6, tier), answer: words(30) }),
      ],
    });
    const flags = auditPromptExemplars(p);
    expect(flags.some((f) => f.sampleId === 'bad' && f.code === 'under-length')).toBe(true);
    expect(promptHasExemplarMismatch(p)).toBe(true);
  });

  it('is false for a prompt whose exemplars are all sound', () => {
    const tier = tierOf('EXPLAIN' as PromptVerb);
    const p = prompt({
      totalMarks: 6,
      keywords: ['alpha'],
      sampleAnswers: [
        sample({
          id: 'clean',
          band: 4,
          mark: markForBand(4, 6, tier),
          answer: `${words(150, 'alpha')}\n\n${words(120, 'idea')}`,
        }),
      ],
    });
    expect(promptHasExemplarMismatch(p)).toBe(false);
  });
});
