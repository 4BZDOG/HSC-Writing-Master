import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import SampleAnswersAccordion from '../../components/SampleAnswersAccordion';
import { Prompt, PromptVerb } from '../../types';

/**
 * A response is only worth marking if the student wrote it.
 *
 * The writing surface enforces that by refusing pasted and dragged-in text
 * (see Editor). That guard is only as good as the other routes into the draft,
 * and there was one: every exemplar carried a "Use" button that wrote a Band 6
 * model answer straight into the student's draft in a single click — the front
 * door locked and the window open. The button is a curator's tool, and it is
 * handed down as a handler rather than hidden with a flag, so a workspace that
 * never supplies it cannot render it.
 */

vi.mock('../../services/geminiService', () => ({
  explainOutcomeInContext: vi.fn(),
  generateRubricForPrompt: vi.fn(),
}));

afterEach(cleanup);

const withSamples = (): Prompt =>
  ({
    id: 'p1',
    question: 'Describe the key steps involved in DNA replication.',
    verb: 'DESCRIBE' as PromptVerb,
    totalMarks: 6,
    keywords: [],
    sampleAnswers: [{ id: 's1', answer: 'A model response.', mark: 6, band: 6, source: 'AI' }],
  }) as unknown as Prompt;

const baseProps = {
  onSampleAnswerGenerated: vi.fn(),
  onDeleteSampleAnswer: vi.fn(),
  onUpdateSampleAnswer: vi.fn(),
  userRole: 'student' as const,
};

/** Open the panel and the one exemplar group inside it. */
const openExemplar = () => {
  fireEvent.click(screen.getByRole('button', { name: /Sample Answers/i }));
  fireEvent.click(screen.getByRole('button', { name: /6\/6 Marks/i }));
};

describe('loading an exemplar into the draft', () => {
  it('is offered to a curator, who moves exemplars through the editor', () => {
    const onUseSampleAnswer = vi.fn();
    render(
      <SampleAnswersAccordion
        {...baseProps}
        userRole="teacher"
        prompt={withSamples()}
        onUseSampleAnswer={onUseSampleAnswer}
      />
    );
    openExemplar();

    fireEvent.click(screen.getByRole('button', { name: /^Use$/i }));
    expect(onUseSampleAnswer).toHaveBeenCalledWith('A model response.');
  });

  it('is not offered at all without a handler — a student cannot one-click it', () => {
    render(<SampleAnswersAccordion {...baseProps} prompt={withSamples()} />);
    openExemplar();

    expect(screen.queryByRole('button', { name: /^Use$/i })).toBeNull();
  });

  // Reading and comparing is the whole point of an exemplar; only the route
  // into the student's own draft closes.
  it('leaves the exemplar itself readable', () => {
    render(<SampleAnswersAccordion {...baseProps} prompt={withSamples()} />);
    openExemplar();

    expect(screen.getByText(/A model response\./i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /copy/i })).toBeTruthy();
  });
});
