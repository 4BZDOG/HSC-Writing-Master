import { describe, it, expect } from 'vitest';
import { Prompt, SampleAnswer, PromptVerb } from '../../types';
import { getCommandTermInfo, markForBand } from '../../data/commandTerms';
import {
  auditSampleAnswer,
  auditPromptExemplars,
  promptHasExemplarMismatch,
  sampleCountsAsAnswer,
} from '../../utils/exemplarAudit';
import { buildAuditTree, TreeNode } from '../../components/admin/contentAudit/auditModel';
import { Course } from '../../types';

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

describe('exemplarAudit — NESA’s own HSC exemplars are the standard, not audited', () => {
  it('skips an HSC_EXEMPLAR sample even when its length would flag a library sample', () => {
    // A Band 6 sample of ~30 words on a 10-mark question: a warning if it were ours.
    const p = prompt({ totalMarks: 10, verb: 'EVALUATE' as PromptVerb });
    const hsc = sample({ band: 6, mark: 10, answer: words(30), source: 'HSC_EXEMPLAR' });
    expect(auditSampleAnswer(p, hsc)).toEqual([]);
    expect(promptHasExemplarMismatch({ ...p, sampleAnswers: [hsc] })).toBe(false);
  });

  it('still audits the same short sample when the library wrote it', () => {
    const p = prompt({ totalMarks: 10, verb: 'EVALUATE' as PromptVerb });
    const ours = sample({ band: 6, mark: 10, answer: words(30), source: 'AI' });
    expect(codes(auditSampleAnswer(p, ours))).toContain('under-length');
  });
});

describe('exemplarAudit — under-length is measured against the sample’s own marks', () => {
  // 100 words on a 10-mark question is a Band 1 length (a full answer runs 320+),
  // but a 3-mark answer of 100 words is a Band 6 length. The same text, two marks.
  const p = prompt({ totalMarks: 10, verb: 'EVALUATE' as PromptVerb });
  const text = words(100);

  it('does not flag a Band 4 sample that earns 3 of 10 marks at a length that fits 3 marks', () => {
    const flags = auditSampleAnswer(p, sample({ band: 4, mark: 3, answer: text }));
    expect(codes(flags)).not.toContain('under-length');
  });

  it('still flags a full-mark Band 6 sample of the same length', () => {
    const flags = auditSampleAnswer(p, sample({ band: 6, mark: 10, answer: text }));
    expect(flags.some((f) => f.code === 'under-length' && f.severity === 'warning')).toBe(true);
  });

  it('falls back to the question’s marks when the sample has no mark', () => {
    const flags = auditSampleAnswer(
      p,
      sample({ band: 6, mark: undefined as unknown as number, answer: text })
    );
    expect(flags.some((f) => f.code === 'under-length' && f.severity === 'warning')).toBe(true);
  });
});

describe('exemplarAudit — a sample counts as an answer by the question’s marks', () => {
  it('counts any non-empty answer on a 1-2 mark question', () => {
    expect(sampleCountsAsAnswer('Coal', 1)).toBe(true);
    expect(sampleCountsAsAnswer('4 am', 2)).toBe(true);
    expect(sampleCountsAsAnswer('Sugar, phosphate and base', 2)).toBe(true);
    expect(sampleCountsAsAnswer('   ', 2)).toBe(false);
  });

  it('keeps the 30-character floor on a question of 3 or more marks', () => {
    expect(sampleCountsAsAnswer('Coal', 3)).toBe(false);
    expect(sampleCountsAsAnswer(words(20), 3)).toBe(true);
  });

  it('keeps the 30-character floor when the marks are unknown', () => {
    expect(sampleCountsAsAnswer('Coal', 0)).toBe(false);
  });

  it('is not an answer when the text is not a string', () => {
    expect(sampleCountsAsAnswer(undefined, 1)).toBe(false);
  });
});

describe('audit tree — No Samples counts a short answer on a 1-2 mark question', () => {
  const courseWith = (totalMarks: number, answer: string): Course =>
    ({
      id: 'c1',
      name: 'Course',
      outcomes: [],
      topics: [
        {
          id: 't1',
          name: 'Topic',
          subTopics: [
            {
              id: 's1',
              name: 'Sub',
              dotPoints: [
                {
                  id: 'd1',
                  description: 'Dot point',
                  prompts: [
                    {
                      id: 'p1',
                      question: 'Name the mineral.',
                      verb: 'IDENTIFY',
                      totalMarks,
                      keywords: [],
                      linkedOutcomes: [],
                      sampleAnswers: [sample({ id: 'a1', answer, mark: totalMarks, band: 6 })],
                      isPastHSC: false,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }) as unknown as Course;

  const promptNode = (c: Course): TreeNode => {
    const find = (n: TreeNode): TreeNode | undefined =>
      n.type === 'prompt' ? n : (n.children ?? []).map(find).find(Boolean);
    const node = buildAuditTree([c]).map(find).find(Boolean);
    if (!node) throw new Error('no prompt node');
    return node;
  };

  it('does not report a missing sample for "Coal" on a 1-mark question', () => {
    expect(promptNode(courseWith(1, 'Coal')).stats.missingSamples).toBe(0);
  });

  it('still reports a missing sample for "Coal" on a 3-mark question', () => {
    expect(promptNode(courseWith(3, 'Coal')).stats.missingSamples).toBe(1);
  });
});
