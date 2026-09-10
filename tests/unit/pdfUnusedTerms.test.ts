import { describe, it, expect } from 'vitest';
import { buildEvaluationBlocks, type EvaluationExportData } from '../../pdf/buildBlocks';

/**
 * The printed report names the terms a student has not used yet — and only six
 * of them fit, so WHICH six decides whether the line is useful.
 *
 * On screen a chip can carry a tooltip explaining that some terms matter more
 * than others. On paper there is nothing but the order, so the terms the
 * question names itself go first. They are ordered rather than filtered: a
 * supporting term is still worth reaching for, it is just not the one to reach
 * for first.
 */
const TERMS = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta'];

const data = (over: Partial<EvaluationExportData> = {}): EvaluationExportData => ({
  question: 'Explain the process.',
  verb: 'EXPLAIN',
  totalMarks: 6,
  overallMark: 4,
  overallBand: 4,
  overallFeedback: 'Sound.',
  quickTip: 'Add detail.',
  strengths: ['Clear.'],
  improvements: ['More depth.'],
  criteria: [{ criterion: 'Detail', mark: 4, maxMark: 6, feedback: 'Thin.' }],
  studentAnswer: 'A response that names none of them.',
  keywords: TERMS,
  ...over,
});

/** The report's "terms not yet used" line, whatever it is called. */
const termsLine = (over: Partial<EvaluationExportData> = {}): string => {
  const text = buildEvaluationBlocks(data(over))
    .filter((block) => block.kind === 'paragraph')
    .map((block) => block.runs.map((run) => run.text).join(''))
    .find((line) => /not yet used/i.test(line));
  return text ?? '';
};

describe('the printed list of terms still to use', () => {
  it('leads with the terms the question names itself', () => {
    const line = termsLine({ mustUseKeywords: ['zeta', 'eta'] });
    expect(line).toMatch(/:\s*zeta, eta/);
  });

  it('names the line for what it is when every term shown is one of them', () => {
    const line = termsLine({ mustUseKeywords: ['zeta', 'eta'], keywords: ['zeta', 'eta'] });
    expect(line).toContain('Terms this question names, not yet used');
  });

  it('keeps the old wording and order when nothing is marked must-use', () => {
    const line = termsLine();
    expect(line).toContain('Syllabus terms not yet used: alpha, beta');
    expect(line).toContain('(and 1 more)');
  });

  it('still counts every unused term, not only the ones it names', () => {
    // Six named, seven missing: the overflow count is about the whole list.
    expect(termsLine({ mustUseKeywords: ['eta'] })).toContain('(and 1 more)');
  });
});
