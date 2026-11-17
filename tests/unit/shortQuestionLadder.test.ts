import { describe, it, expect } from 'vitest';
import {
  getBandForMark,
  getPromptTermInfo,
  getQuestionBandCeiling,
  guideRanges,
  shortQuestionBands,
} from '../../data/commandTerms';
import type { PromptVerb } from '../../types';

/**
 * The ladder for a question under 15 marks: Band 5 is the top on six marks or
 * fewer, Band 6 needs seven, and the extra rungs on a longer question go to the
 * bands below the ceiling, evenly, middle bands first. The examples are the owner's, from November 2026.
 */
describe('shortQuestionBands: the ladder under 15 marks', () => {
  it('gives the owner’s examples', () => {
    expect(shortQuestionBands(6, 5)).toEqual([1, 2, 3, 3, 4, 5]);
    expect(shortQuestionBands(8, 6)).toEqual([1, 2, 3, 3, 4, 4, 5, 6]);
    expect(shortQuestionBands(7, 6)).toEqual([1, 2, 3, 3, 4, 5, 6]);
    expect(shortQuestionBands(5, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(shortQuestionBands(4, 5)).toEqual([2, 3, 4, 5]);
  });

  it('shares the marks below full marks evenly, with the leftovers to Band 3, then 4, then 2', () => {
    expect(shortQuestionBands(9, 6)).toEqual([1, 2, 2, 3, 3, 4, 4, 5, 6]);
    expect(shortQuestionBands(14, 6)).toEqual([1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 6]);
    expect(shortQuestionBands(5, 4)).toEqual([1, 2, 3, 3, 4]);
  });

  it('spreads a long question under a low ceiling across every band below it', () => {
    expect(shortQuestionBands(8, 3)).toEqual([1, 1, 1, 2, 2, 2, 2, 3]);
    expect(shortQuestionBands(8, 4)).toEqual([1, 1, 2, 2, 3, 3, 3, 4]);
    expect(shortQuestionBands(3, 2)).toEqual([1, 1, 2]);
    expect(shortQuestionBands(2, 1)).toEqual([1, 1]);
  });

  it('never falls as marks rise, reaches Band 1 at one mark, and holds every band up to the ceiling', () => {
    for (let tier = 1; tier <= 6; tier++) {
      for (let total = 1; total < 15; total++) {
        const cap = getQuestionBandCeiling(total, tier);
        const ladder = shortQuestionBands(total, cap);
        expect(ladder).toHaveLength(total);
        // Under the ceiling the count runs down from it, so Band 1 needs marks >= cap.
        if (total >= cap) expect(ladder[0]).toBe(1);
        expect(ladder[total - 1]).toBe(cap);
        for (let i = 1; i < ladder.length; i++)
          expect(ladder[i]).toBeGreaterThanOrEqual(ladder[i - 1]);
        if (total >= cap) for (let b = 1; b <= cap; b++) expect(ladder).toContain(b);
      }
    }
  });
});

describe('getQuestionBandCeiling: the verb tier and the length, whichever is lower', () => {
  it('caps a question of six marks or fewer at Band 5, and one of seven or more at Band 6', () => {
    expect(getQuestionBandCeiling(4, 6)).toBe(5);
    expect(getQuestionBandCeiling(6, 6)).toBe(5);
    expect(getQuestionBandCeiling(7, 6)).toBe(6);
    expect(getQuestionBandCeiling(8, 6)).toBe(6);
  });

  it('keeps a low-tier verb at its own tier, however long the question', () => {
    expect(getQuestionBandCeiling(8, 3)).toBe(3);
    expect(getQuestionBandCeiling(2, 1)).toBe(1);
    expect(getQuestionBandCeiling(20, 3)).toBe(3);
  });
});

describe('getBandForMark: the ladder reaches the marking', () => {
  it('reads a six-mark Evaluate as the owner wrote it', () => {
    const bands = Array.from({ length: 6 }, (_, i) => getBandForMark(i + 1, 6, 6));
    expect(bands).toEqual([1, 2, 3, 3, 4, 5]);
    expect(getBandForMark(6, 6, 6)).toBe(5);
  });

  it('matches shortQuestionBands for every short question', () => {
    for (let tier = 1; tier <= 6; tier++) {
      for (let total = 1; total < 15; total++) {
        const cap = getQuestionBandCeiling(total, tier);
        const expected = shortQuestionBands(total, cap);
        expect(Array.from({ length: total }, (_, i) => getBandForMark(i + 1, total, tier))).toEqual(
          expected
        );
      }
    }
  });

  it('leaves questions of fifteen marks or more on NESA’s five rows, unchanged', () => {
    // The proportional rule for long questions is not touched: on a 20-mark
    // Tier-6 question the five rows read 6, 5, 4, 3, 2, as they always did.
    expect([20, 16, 12, 8, 4].map((m) => getBandForMark(m, 20, 6))).toEqual([6, 5, 4, 3, 2]);
    expect(guideRanges(20, 6).map((r) => r.band)).toEqual([6, 5, 4, 3, 2]);
  });
});

describe('getPromptTermInfo: the question’s colour follows its ceiling', () => {
  const evaluate = 'EVALUATE' as PromptVerb;

  it('draws a six-mark Evaluate at Band 5 when the marks are passed', () => {
    expect(getPromptTermInfo({ verb: evaluate, totalMarks: 6 }).tier).toBe(5);
    expect(getPromptTermInfo({ verb: evaluate, totalMarks: 7 }).tier).toBe(6);
  });

  it('keeps the verb’s own tier when no marks are given', () => {
    expect(getPromptTermInfo({ verb: evaluate }).tier).toBe(6);
  });
});
