import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import CriteriaSection, { isLoneLastRow } from '../../components/feedback/CriteriaSection';
import type { EvaluationResult, Prompt } from '../../types';

/**
 * The criteria pair up in two columns from `xl`. An odd count leaves the last
 * card alone in a half-width cell, so that card takes the full row.
 */

afterEach(cleanup);

describe('isLoneLastRow', () => {
  it('is true only for the last row of an odd count', () => {
    expect(isLoneLastRow(0, 1)).toBe(true);
    expect(isLoneLastRow(2, 3)).toBe(true);
    expect(isLoneLastRow(4, 5)).toBe(true);
  });

  it('is false for an even count, where every row has a partner', () => {
    expect(isLoneLastRow(1, 2)).toBe(false);
    expect(isLoneLastRow(3, 4)).toBe(false);
  });

  it('is false for the rows before the last one of an odd count', () => {
    expect(isLoneLastRow(0, 3)).toBe(false);
    expect(isLoneLastRow(1, 3)).toBe(false);
  });
});

const prompt = {
  id: 'p1',
  question: 'Explain the water cycle.',
  verb: 'EXPLAIN',
  totalMarks: 6,
  keywords: [],
} as unknown as Prompt;

const criterion = (name: string, mark: number) => ({
  criterion: name,
  mark,
  maxMark: 2,
  feedback: `${name} feedback.`,
});

const rowsFor = (count: number) => {
  const criteria = Array.from({ length: count }, (_, i) => criterion(`Criterion ${i + 1}`, 1));
  const { container } = render(
    <CriteriaSection
      criteria={criteria as EvaluationResult['criteria']}
      band={3}
      prompt={prompt}
      feedbackLocked={false}
    />
  );
  return Array.from(container.querySelectorAll('.CriteriaRow')) as HTMLElement[];
};

describe('CriteriaSection rows at xl', () => {
  it('spans the last card across both columns when the count is odd', () => {
    const rows = rowsFor(3);

    expect(rows).toHaveLength(3);
    expect(rows[2].className).toContain('xl:col-span-2');
    expect(rows[0].className).not.toContain('col-span');
    expect(rows[1].className).not.toContain('col-span');
  });

  it('leaves every card in its own column when the count is even', () => {
    const rows = rowsFor(4);

    for (const row of rows) {
      expect(row.className).not.toContain('col-span');
    }
  });

  it('keeps the ladder row look on the spanning card', () => {
    const rows = rowsFor(1);

    expect(rows[0].className).toContain('xl:col-span-2');
    // Still a ladder row: the criterion's title is set in the row's heading.
    expect(rows[0].querySelector('h4')?.textContent).toContain('Criterion 1');
  });
});
