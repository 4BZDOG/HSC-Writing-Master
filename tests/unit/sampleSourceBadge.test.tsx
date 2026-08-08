import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import SampleAnswersAccordion from '../../components/SampleAnswersAccordion';
import type { Prompt, PromptVerb, SampleAnswer } from '../../types';

/**
 * An AI sample that is a lift of the student's OWN response reads differently
 * from one written from scratch — it inherits their structure and voice. The
 * library says which is which rather than filing both under "AI Model".
 */
vi.mock('../../services/geminiService', () => ({
  generateSampleAnswer: vi.fn(),
  reviseSampleAnswer: vi.fn(),
  performQualityCheck: vi.fn(),
}));

afterEach(cleanup);

const sample = (over: Partial<SampleAnswer> = {}): SampleAnswer =>
  ({
    id: 'sa1',
    answer: 'Caching reduces latency because…',
    mark: 4,
    band: 3,
    source: 'AI',
    feedback: 'Sound.',
    ...over,
  }) as SampleAnswer;

const renderAccordion = (sampleAnswers: SampleAnswer[]) =>
  render(
    <SampleAnswersAccordion
      prompt={
        {
          id: 'p1',
          question: 'Analyse the impact of caching.',
          totalMarks: 6,
          verb: 'Analyse' as PromptVerb,
          keywords: [],
          sampleAnswers,
        } as Prompt
      }
      onSampleAnswerGenerated={vi.fn()}
      onDeleteSampleAnswer={vi.fn()}
      onUpdateSampleAnswer={vi.fn()}
      userRole="student"
      defaultCollapsed={false}
    />
  );

describe('sample answer source badges', () => {
  it('marks an AI lift of a student answer as "Student + AI"', () => {
    renderAccordion([sample({ derivedFromStudent: true })]);

    expect(screen.getByText('Student + AI')).toBeTruthy();
    expect(screen.queryByText('AI Model')).toBeNull();
  });

  it('leaves a clean-room AI exemplar as "AI Model"', () => {
    renderAccordion([sample()]);

    expect(screen.getByText('AI Model')).toBeTruthy();
    expect(screen.queryByText('Student + AI')).toBeNull();
  });

  it('still distinguishes the student’s own submission and an official exemplar', () => {
    cleanup();
    renderAccordion([sample({ source: 'USER' })]);
    expect(screen.getByText('Student')).toBeTruthy();

    cleanup();
    renderAccordion([sample({ source: 'HSC_EXEMPLAR' })]);
    expect(screen.getByText('Official')).toBeTruthy();
  });
});
