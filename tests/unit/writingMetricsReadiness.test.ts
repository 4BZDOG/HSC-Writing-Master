import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Prompt, PromptVerb } from '../../types';
import { useWritingMetrics } from '../../hooks/useWritingMetrics';

/**
 * The metrics hook exposes a single, shared `readiness` object (a provisional,
 * mechanical completeness signal — never a predicted band). These tests lock in
 * the two ends of that contract: an empty draft stays neutral (level 0), and a
 * substantial draft meeting length + keyword coverage climbs off the neutral
 * state to a higher level.
 */

const makePrompt = (): Prompt =>
  ({
    id: 'prompt-readiness',
    question: 'Analyse the causes and effects.',
    totalMarks: 6,
    verb: 'ANALYSE' as PromptVerb,
    sampleAnswers: [],
    keywords: ['causes', 'effects', 'evidence'],
    scenario: 's',
    linkedOutcomes: ['O1'],
    markingCriteria: '',
    isPastHSC: false,
  }) as Prompt;

describe('useWritingMetrics readiness', () => {
  it('is neutral (level 0) for an empty draft', () => {
    const { result } = renderHook(() => useWritingMetrics('', makePrompt()));

    expect(result.current.readiness.isNeutral).toBe(true);
    expect(result.current.readiness.level).toBe(0);
    expect(result.current.readiness.score).toBe(0);
  });

  it('climbs to a higher, non-neutral level for a substantial draft', () => {
    // Long, multi-paragraph answer that uses every keyword and varies its
    // sentences — enough to clear length, coverage, structure and variety.
    const answer = [
      'The causes of the event were varied and deep-rooted, drawing on economic pressure and social unrest.',
      'Each factor built on the last, and the evidence points to a slow accumulation of grievance rather than a single trigger.',
      '',
      'The effects were equally profound and long-lasting for the communities involved.',
      'Later reforms addressed some of these effects, though the evidence suggests many consequences endured for decades.',
      'Taken together, the causes and effects form a coherent picture supported by the available evidence.',
    ].join('\n');

    const { result } = renderHook(() => useWritingMetrics(answer, makePrompt()));

    expect(result.current.readiness.isNeutral).toBe(false);
    expect(result.current.readiness.level).toBeGreaterThan(0);
    expect(result.current.readiness.score).toBeGreaterThan(12);
  });
});
