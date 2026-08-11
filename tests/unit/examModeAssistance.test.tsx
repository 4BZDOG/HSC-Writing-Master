import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import PromptDisplay from '../../components/PromptDisplay';
import { Prompt, CourseOutcome, PromptVerb } from '../../types';

/**
 * Exam Mode is "no assistance". The reference rail and the writing area's
 * strategy tip are already hidden under exam conditions; the prompt card must
 * not undercut that by handing over the outcomes the response is marked
 * against — still less the AI briefing on how to satisfy them.
 */

vi.mock('../../services/geminiService', () => ({
  explainOutcomeInContext: vi.fn(),
}));

afterEach(cleanup);

const OUTCOMES: CourseOutcome[] = [
  { code: 'SE-12-04', description: 'Evaluates practices to safely collect and store data.' },
  { code: 'SE-12-08', description: 'Tests and evaluates language structures to refine code.' },
];

const prompt = {
  id: 'p1',
  question: 'Outline three benefits of developing secure software.',
  verb: 'OUTLINE' as PromptVerb,
  totalMarks: 3,
  keywords: [],
  linkedOutcomes: ['SE-12-04', 'SE-12-08'],
  sampleAnswers: [],
} as unknown as Prompt;

const props = {
  prompt,
  isEnriching: false,
  enrichError: null,
  onVerbClick: vi.fn(),
  onGenerateScenario: vi.fn(),
  onUpdatePrompt: vi.fn(),
  isGeneratingScenario: false,
  generateScenarioError: null,
  courseOutcomes: OUTCOMES,
  onOutcomeClick: vi.fn(),
  userRole: 'user' as const,
  onDismissEnrichError: vi.fn(),
  onRunQualityCheck: vi.fn(),
  onSuggestOutcomes: vi.fn(),
  isSuggestingOutcomes: false,
  fontSize: 18,
  onFontSizeChange: vi.fn(),
};

describe('PromptDisplay under exam conditions', () => {
  it('offers the outcome briefing in Coach Mode', () => {
    render(<PromptDisplay {...props} />);
    expect(screen.getByText('SE-12-04')).toBeTruthy();
    expect(screen.getByText(/What's assessed/i)).toBeTruthy();
  });

  it('withholds every outcome affordance in Exam Mode', () => {
    render(<PromptDisplay {...props} examMode />);
    expect(screen.queryByText('SE-12-04')).toBeNull();
    expect(screen.queryByText('SE-12-08')).toBeNull();
    expect(screen.queryByText(/What's assessed/i)).toBeNull();
    // ...and does not replace them with a curation note either.
    expect(screen.queryByText(/No specific outcomes linked/i)).toBeNull();
  });

  it('still shows the directive, but not its guide', () => {
    render(<PromptDisplay {...props} examMode />);
    // The verb is printed on a real exam paper; a definition of it is not.
    const verb = screen.getByText('OUTLINE');
    expect(verb).toBeTruthy();
    expect(verb.closest('button')?.disabled).toBe(true);
  });
});
