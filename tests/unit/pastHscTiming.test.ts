import { describe, it, expect } from 'vitest';
import {
  getCommandTermInfo,
  getRecommendedTime,
  HSC_MINUTES_PER_MARK,
} from '../../data/commandTerms';
import type { PromptVerb } from '../../types';
import { getQuestionSeconds, pastHscTiming } from '../../utils/pastHscUtils';

const timing = (hscSection: string | undefined, totalMarks: number) =>
  pastHscTiming({ hscSection, totalMarks });

describe('pastHscTiming: the paper allowance, shared by the part marks', () => {
  it('gives a 3-mark Physics part its share of the 2h25m section, not the whole', () => {
    const t = timing(
      'Section II (80 marks). Attempt Questions 21–36. Allow about 2 hours and 25 minutes for this section.',
      3
    );
    expect(t).toEqual({
      heading: 'Section II (80 marks). Attempt Questions 21–36.',
      minutes: 5,
      fromPaper: true,
    });
  });

  it('gives a part worth the whole section the whole allowance', () => {
    const t = timing(
      'Section II (40 marks). Allow about 1 hour and 15 minutes for this section.',
      40
    );
    expect(t.minutes).toBe(75);
    expect(t.heading).toBe('Section II (40 marks).');
  });

  it('reads a bare "NN marks" section heading (Chemistry run-on form, rewritten)', () => {
    const t = timing(
      'Section II (80 marks). Attempt Questions 21–37. Allow about 2 hours and 25 minutes for this section.',
      80
    );
    expect(t.minutes).toBe(145);
  });

  it('handles the CAFS part heading (section marks after a bare "Part B")', () => {
    const t = timing(
      'Section I, Part B (55 marks). Attempt Questions 21–29. Allow about 1 hour and 40 minutes for this part.',
      6
    );
    expect(t.minutes).toBe(11);
  });

  it('reads the first "N marks" as the section, not a later part (Legal Part B)', () => {
    const t = timing(
      'Section II – 30 marks. Part B – Crime, 15 marks. Attempt Question 24. Allow about 1 hour for this section.',
      15
    );
    expect(t.minutes).toBe(30);
  });

  it('gives a 25-mark Legal Options essay 45 minutes of the 90-minute section', () => {
    const t = timing(
      'Section III — Options, 50 marks. Attempt TWO questions from Questions 25–31, each from a different Option. Allow about 1 hour and 30 minutes for this section.',
      25
    );
    expect(t.minutes).toBe(45);
    expect(t.heading).toBe(
      'Section III — Options, 50 marks. Attempt TWO questions from Questions 25–31, each from a different Option.'
    );
  });

  it('keeps a whole 20-mark English module essay at 40 minutes', () => {
    const t = timing(
      'Paper 2, Section I — Module A: Textual Conversations (20 marks). Allow about 40 minutes.',
      20
    );
    expect(t).toEqual({
      heading: 'Paper 2, Section I — Module A: Textual Conversations (20 marks).',
      minutes: 40,
      fromPaper: true,
    });
  });

  it('divides a 20-marks-in-all English Standard part by its own marks', () => {
    const t = timing(
      'Paper 2, Section III — Module C: The Craft of Writing (20 marks in all; this part is worth 5). Allow about 40 minutes for the whole question.',
      5
    );
    expect(t.minutes).toBe(10);
  });

  it('gives a 20-mark Business Studies section its whole 35 minutes', () => {
    const t = timing(
      'Section IV (20 marks). Attempt either Question 26 or Question 27. Allow about 35 minutes for this section.',
      20
    );
    expect(t.minutes).toBe(35);
  });

  it('reads an hours-only allowance', () => {
    expect(timing('Section I (25 marks). Allow about 1 hour for this section.', 25).minutes).toBe(
      60
    );
  });

  it('rounds to whole minutes under 15, then to the nearest 5', () => {
    // 70 minutes for 40 marks: 9 marks is 15.75, which is 15 at the nearest five.
    expect(timing('Section II (40 marks). Allow about 1 hour and 10 minutes.', 9).minutes).toBe(15);
    // 2 minutes at 1 mark, never 0.
    expect(timing('Section II (80 marks). Allow about 2 hours and 25 minutes.', 1).minutes).toBe(2);
  });

  it('tidies a run-on heading that has no full stop before the allowance', () => {
    const t = timing(
      'Section II 40 marks Attempt Questions 21–24 Allow about 1 hour and 15 minutes for this section',
      10
    );
    expect(t.heading).toBe('Section II 40 marks Attempt Questions 21–24.');
    expect(t.minutes).toBe(20);
  });
});

describe('pastHscTiming: the HSC pace when the heading prints no allowance', () => {
  it('uses HSC_MINUTES_PER_MARK for a heading with no time, and leaves the heading as it is', () => {
    expect(HSC_MINUTES_PER_MARK).toBe(1.8);
    const t = timing('Section IV — Change in the Modern World', 10);
    expect(t).toEqual({
      heading: 'Section IV — Change in the Modern World',
      minutes: 20, // 1.8 a mark is 18 minutes, rounded to the nearest five from 15 up
      fromPaper: false,
    });
  });

  it('uses the pace for a part whose heading has marks but no allowance', () => {
    const t = timing('Paper 2, Section III — Module C: The Craft of Writing (5 marks).', 5);
    expect(t.minutes).toBe(9);
    expect(t.fromPaper).toBe(false);
  });

  it('gives nothing when the question has no marks', () => {
    expect(timing('Section I — Cities of Vesuvius', 0).minutes).toBeNull();
    expect(timing(undefined, 0).minutes).toBeNull();
  });

  it('copes with no heading at all, using the pace', () => {
    expect(timing(undefined, 3)).toEqual({ heading: '', minutes: 5, fromPaper: false });
  });
});

describe('getQuestionSeconds: one time per past question on every surface', () => {
  const explain = getCommandTermInfo('EXPLAIN' as PromptVerb);

  it('uses the paper time for a past question with a printed allowance', () => {
    expect(
      getQuestionSeconds(
        {
          isPastHSC: true,
          hscSection: 'Section II (80 marks). Allow about 2 hours and 25 minutes for this section.',
          totalMarks: 3,
        },
        explain
      )
    ).toBe(5 * 60);
  });

  it('uses the same pace as the exam line for a past question with no allowance', () => {
    expect(
      getQuestionSeconds(
        { isPastHSC: true, hscSection: 'Section IV — Peace', totalMarks: 10 },
        explain
      )
    ).toBe(20 * 60);
  });

  it('keeps getRecommendedTime for a question that is not from a past paper', () => {
    expect(
      getQuestionSeconds(
        {
          isPastHSC: false,
          hscSection: 'Section II (80 marks). Allow about 2 hours.',
          totalMarks: 3,
        },
        explain
      )
    ).toBe(getRecommendedTime(3, explain));
  });

  it('falls back to getRecommendedTime for a past question with no marks', () => {
    expect(
      getQuestionSeconds({ isPastHSC: true, hscSection: undefined, totalMarks: 0 }, explain)
    ).toBe(getRecommendedTime(0, explain));
  });
});
