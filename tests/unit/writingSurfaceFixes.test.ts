import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { getFullMarkWordRange, getStructureGuide } from '../../data/commandTerms';
import { useWritingMetrics } from '../../hooks/useWritingMetrics';
import { textContainsKeyword } from '../../utils/renderUtils';
import type { Prompt, PromptVerb } from '../../types';

/**
 * Two things the writing surface told a student that were not so.
 *
 * The word guide came from the question's band CEILING, which a command verb
 * caps, so a 4-mark DESCRIBE was "about 32 words" while the marker was told a
 * full-mark answer runs 80-120. And a syllabus term written as a gerund
 * ("unwinding") was not found in an answer that said "unwinds".
 */

const prompt = (verb: string, totalMarks: number): Prompt =>
  ({ id: 'p', question: 'Q', verb: verb as PromptVerb, totalMarks, keywords: [] }) as Prompt;

describe('one word range, everywhere', () => {
  it('gives the live guide the same length the marker is told', () => {
    for (const marks of [1, 2, 4, 6, 8, 10, 15]) {
      const { result } = renderHook(() => useWritingMetrics('', prompt('DESCRIBE', marks)));
      const [min, max] = getFullMarkWordRange(marks);
      expect(result.current.progressInfo.targetCount).toBe(min);
      expect(result.current.progressInfo.targetCountMax).toBe(max);
      if (marks <= 10) expect(getStructureGuide(marks)).toContain(`${min}-${max}`);
    }
  });

  it('does not shrink the guide because a verb caps the band', () => {
    // DESCRIBE caps at Band 2 and EVALUATE reaches Band 6; the answer to a
    // 4-mark question still has to be about the same length to earn 4 marks.
    const describe = renderHook(() => useWritingMetrics('', prompt('DESCRIBE', 4)));
    const evaluate = renderHook(() => useWritingMetrics('', prompt('EVALUATE', 4)));
    expect(describe.result.current.progressInfo.targetCount).toBe(80);
    expect(evaluate.result.current.progressInfo.targetCount).toBe(80);
  });

  it('keeps the structure guide text the marker has always been given', () => {
    expect(getStructureGuide(4)).toBe(
      'Clear explanation with at least two linked points and one specific example/quote. Logical connections shown. (Approx 80-120 words)'
    );
    expect(getStructureGuide(1)).toContain('(Approx 1-10 words)');
    expect(getStructureGuide(10)).toContain('(Approx 320-450+ words)');
  });
});

describe('a term written as a gerund or past tense', () => {
  it('finds "unwinding" in an answer that says "unwinds"', () => {
    expect(textContainsKeyword('Helicase unwinds the double helix.', 'unwinding')).toBe(true);
  });

  it('finds "testing" as "tests" and "tested", and "tested" as "tests"', () => {
    expect(textContainsKeyword('It tests each unit.', 'testing')).toBe(true);
    expect(textContainsKeyword('Each unit was tested.', 'testing')).toBe(true);
    expect(textContainsKeyword('It tests each unit.', 'tested')).toBe(true);
  });

  it('finds "computing" as "computes"', () => {
    expect(textContainsKeyword('The model computes a value.', 'computing')).toBe(true);
  });

  it('still refuses a different word that shares letters', () => {
    expect(textContainsKeyword('He wound the clock.', 'unwinding')).toBe(false);
    expect(textContainsKeyword('The window was open.', 'unwinding')).toBe(false);
  });
});
