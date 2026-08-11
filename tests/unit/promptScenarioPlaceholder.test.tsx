import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import PromptDisplay from '../../components/PromptDisplay';
import { Prompt, PromptVerb } from '../../types';

/**
 * The prompt card is floored at MIN_CARD_HEIGHT so the writing area beside it
 * stays usable. Inside that fixed height, an empty "Context Scenario" panel is
 * ~130px of "No scenario provided." — worth showing to someone who can add a
 * scenario, worth nothing to the student sitting the question.
 */

vi.mock('../../services/geminiService', () => ({
  explainOutcomeInContext: vi.fn(),
}));

afterEach(cleanup);

const makePrompt = (scenario?: string) =>
  ({
    id: 'p1',
    question: 'Describe the key steps involved in DNA replication.',
    verb: 'DESCRIBE' as PromptVerb,
    totalMarks: 4,
    keywords: [],
    scenario,
    sampleAnswers: [],
  }) as unknown as Prompt;

const props = {
  prompt: makePrompt(),
  isEnriching: false,
  enrichError: null,
  onVerbClick: vi.fn(),
  onGenerateScenario: vi.fn(),
  onUpdatePrompt: vi.fn(),
  isGeneratingScenario: false,
  generateScenarioError: null,
  courseOutcomes: [],
  onOutcomeClick: vi.fn(),
  userRole: 'user' as const,
  onDismissEnrichError: vi.fn(),
  onRunQualityCheck: vi.fn(),
  onSuggestOutcomes: vi.fn(),
  isSuggestingOutcomes: false,
  fontSize: 18,
  onFontSizeChange: vi.fn(),
};

describe('empty scenario placeholder', () => {
  it('is hidden from a student when the question has no scenario', () => {
    render(<PromptDisplay {...props} />);
    expect(screen.queryByText(/No scenario provided/i)).toBeNull();
    expect(screen.queryByText(/Context Scenario/i)).toBeNull();
    // The question itself is still the card's subject.
    expect(screen.getByText(/DNA replication/i)).toBeTruthy();
  });

  it('is still offered to a curator, who can add one', () => {
    render(<PromptDisplay {...props} userRole={'teacher' as const} />);
    expect(screen.getByText(/Context Scenario/i)).toBeTruthy();
    expect(screen.getByText(/No scenario provided/i)).toBeTruthy();
  });

  it('shows a real scenario to everyone', () => {
    render(<PromptDisplay {...props} prompt={makePrompt('A lab is sequencing a genome.')} />);
    expect(screen.getByText(/Context Scenario/i)).toBeTruthy();
    expect(screen.getByText(/sequencing a genome/i)).toBeTruthy();
  });

  it('hides it in Exam Mode even for a curator', () => {
    render(<PromptDisplay {...props} userRole={'teacher' as const} examMode />);
    expect(screen.queryByText(/Context Scenario/i)).toBeNull();
  });
});
