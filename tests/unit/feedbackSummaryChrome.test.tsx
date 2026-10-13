import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import EvaluationDisplay from '../../components/EvaluationDisplay';
import type { EvaluationResult, Prompt, PromptVerb } from '../../types';

/**
 * The marking summary's chrome had drifted into four different section
 * treatments — a tinted 32px-radius panel, a white card, a dashed-border
 * callout, and a bare region between two hairline rules — which is most of what
 * "looks dated" meant. Most of that pass is visual and belongs to the eye, but
 * two parts of it changed what the page actually TELLS a student, and those are
 * worth holding onto:
 *
 *  - the coach's tip was the one piece of marker prose that printed its
 *    syllabus terms plain, because it never went through the formatter;
 *  - a criterion stated its result only as "2 / 4", leaving the reader to do
 *    the arithmetic the exported PDF has always done for them.
 */
vi.mock('../../services/entitlements', () => ({
  isFeatureLocked: () => false,
  isFeedbackLocked: () => false,
  requestUpgrade: vi.fn(),
}));

vi.mock('../../pdf', () => ({ exportEvaluationPdf: vi.fn() }));

afterEach(cleanup);

const prompt: Prompt = {
  id: 'p1',
  question: 'Analyse the impact of caching.',
  totalMarks: 8,
  verb: 'Analyse' as PromptVerb,
  keywords: ['latency'],
  sampleAnswers: [],
} as unknown as Prompt;

const result: EvaluationResult = {
  overallMark: 4,
  overallBand: 3,
  overallFeedback: 'Sound, but the effect on latency is asserted rather than analysed.',
  quickTip: 'Say what latency actually is before you claim it falls.',
  strengths: ['Defines caching'],
  improvements: ['Explain the effect on latency'],
  criteria: [
    { criterion: 'Analysis', mark: 1, maxMark: 4, feedback: 'Thin.' },
    { criterion: 'Terminology', mark: 3, maxMark: 4, feedback: 'Mostly precise.' },
  ],
} as unknown as EvaluationResult;

const renderDisplay = () =>
  render(
    <EvaluationDisplay
      result={result}
      prompt={prompt}
      userAnswer="Caching keeps data in memory so latency falls."
      onImproveAnswer={vi.fn()}
      isImproving={false}
      improveAnswerError={null}
    />
  );

describe('the marking summary', () => {
  it('highlights syllabus terms in the next-step note, like every other piece of prose', () => {
    const { container } = renderDisplay();

    // The tip is the note under "Your next step", not a card of its own any more.
    const tip = screen.getByText('Your next step').closest('section');
    const highlighted = container.querySelectorAll('.text-emerald-400, .light\\:text-emerald-800');
    expect(tip?.textContent).toContain('latency');
    // The formatter wraps a matched term in its own span; plain text would not.
    expect(highlighted.length).toBeGreaterThan(0);
  });

  it('puts the next step directly under the question, before the rewrite and the criteria', () => {
    const { container } = renderDisplay();

    // The question's keywords are wrapped in their own spans, so it is read as the heading.
    const question = container.querySelector('h2') as HTMLElement;
    const next = screen.getByText('Your next step');
    const criteria = screen.getByText('Criteria breakdown');
    // Question, then next step, then the evidence and the criteria further down.
    expect(question.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(next.compareDocumentPosition(criteria) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector('[data-report="reading"]')).not.toBeNull();
  });

  it('shows each criterion as a proportion, not only as arithmetic', () => {
    renderDisplay();

    // The same figure the PDF has always drawn as a filled track.
    expect(screen.getByLabelText('1 of 4 marks awarded')).toBeTruthy();
    expect(screen.getByLabelText('3 of 4 marks awarded')).toBeTruthy();
  });

  it('numbers the criteria so one can be referred to without quoting it', () => {
    const { container } = renderDisplay();
    const rows = container.querySelectorAll('.CriteriaRow');

    // The mark sits in the ladder gutter, so the number is read from the title.
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('h4')?.textContent).toMatch(/^1Analysis/);
    expect(rows[1].querySelector('h4')?.textContent).toMatch(/^2Terminology/);
  });

  it('still renders every section of the report', () => {
    renderDisplay();

    expect(screen.getByText("Marker's commentary")).toBeTruthy();
    expect(screen.getByText('Strong evidence')).toBeTruthy();
    expect(screen.getByText('Areas for growth')).toBeTruthy();
    expect(screen.getByText('Criteria breakdown')).toBeTruthy();
  });
});

describe('the overall mark', () => {
  // It was an <h1>: a second level-one heading on the page, under the panel's
  // own <h2>, read aloud as "4 slash 8".
  it('is not a heading, and is spoken as "out of"', () => {
    renderDisplay();
    expect(screen.queryAllByRole('heading', { level: 1 })).toHaveLength(0);
    expect(screen.getByText(/out of 8/)).toBeTruthy();
  });
});
