import { describe, it, expect } from 'vitest';
import { getPastHscLabel } from '../../utils/pastHscUtils';
import { Prompt } from '../../types';

const makePrompt = (overrides: Partial<Prompt>): Prompt =>
  ({
    id: 'p1',
    question: 'Assess the impact of automation on software development.',
    verb: 'ASSESS',
    totalMarks: 6,
    ...overrides,
  }) as Prompt;

describe('getPastHscLabel', () => {
  it('returns nothing for a question that is not from a past paper', () => {
    expect(getPastHscLabel(makePrompt({}))).toBeNull();
    expect(getPastHscLabel(makePrompt({ isPastHSC: false, hscYear: 2023 }))).toBeNull();
  });

  it('names the year and question number when both are known', () => {
    const label = getPastHscLabel(
      makePrompt({ isPastHSC: true, hscYear: 2023, hscQuestionNumber: '12' })
    );
    expect(label?.text).toBe('HSC 2023 · Q12');
    expect(label?.title).toBe('From the 2023 HSC examination, question 12');
  });

  it('does not double up the Q when the source data already carries one', () => {
    expect(
      getPastHscLabel(makePrompt({ isPastHSC: true, hscYear: 2019, hscQuestionNumber: 'Q7(b)' }))
        ?.text
    ).toBe('HSC 2019 · Q7(b)');
    expect(
      getPastHscLabel(
        makePrompt({ isPastHSC: true, hscYear: 2019, hscQuestionNumber: 'Question 7' })
      )?.text
    ).toBe('HSC 2019 · Q7');
  });

  it('still labels the paper when only the year is known', () => {
    expect(getPastHscLabel(makePrompt({ isPastHSC: true, hscYear: 2021 }))?.text).toBe('HSC 2021');
  });

  // Bulk imports tag a whole paper at once, so year and number can both be
  // missing. The chip must still say the question is the real thing.
  it('falls back to a bare Past HSC label when the year is missing', () => {
    expect(getPastHscLabel(makePrompt({ isPastHSC: true }))?.text).toBe('Past HSC');
    expect(getPastHscLabel(makePrompt({ isPastHSC: true, hscQuestionNumber: '3' }))?.text).toBe(
      'Past HSC · Q3'
    );
  });
});
