import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import SampleAnswersAccordion from '../../components/SampleAnswersAccordion';
import { getBandForMark, getCommandTermInfo } from '../../data/commandTerms';
import type { Prompt, PromptVerb, SampleAnswer } from '../../types';

/**
 * What a student sees where an exemplar they have not paid for used to be.
 *
 * The band ceiling was `blur-sm select-none pointer-events-none` on a div whose
 * text was already in the document — one class removed in the inspector, or one
 * look at the network tab, and the library was free. schema.sql §25 stops
 * sending the prose, so there is nothing left here to blur; these tests pin the
 * two halves of what replaced it. The lock must still be OFFERED (a gate the
 * reader cannot see is a gate that sells nothing), and the prose must not be in
 * the document at all.
 */

vi.mock('../../services/geminiService', () => ({
  generateSampleAnswer: vi.fn(),
  recalibrateSampleAnswer: vi.fn(),
}));

const TOTAL = 15;
const VERB = 'Analyse' as PromptVerb;
const bandOf = (mark: number) => getBandForMark(mark, TOTAL, getCommandTermInfo(VERB).tier);

const sample = (over: Partial<SampleAnswer> & { mark: number }): SampleAnswer =>
  ({
    id: `sa-${over.mark}`,
    answer: 'PROSE THAT WAS PAID FOR',
    band: bandOf(over.mark),
    source: 'HSC_EXEMPLAR',
    ...over,
  }) as SampleAnswer;

const renderWith = (samples: SampleAnswer[]) =>
  render(
    <SampleAnswersAccordion
      prompt={
        {
          id: 'p1',
          question: 'Analyse the impact of caching.',
          totalMarks: TOTAL,
          verb: VERB,
          sampleAnswers: samples,
        } as Prompt
      }
      onSampleAnswerGenerated={vi.fn()}
      onDeleteSampleAnswer={vi.fn()}
      onUpdateSampleAnswer={vi.fn()}
      userRole="user"
      defaultCollapsed={false}
    />
  );

afterEach(cleanup);

describe('an exemplar the server withheld', () => {
  it('never puts the prose in the document', () => {
    // Deliberately given prose AND the flag. The loader synthesises these rows
    // with an empty `answer`, so asserting on a row that never had any would
    // pass whatever the component did with it. The guard that matters is that
    // the flag alone is enough to keep text out of the DOM — a cached tree
    // from before the gate, or a local library, must not leak through it.
    renderWith([sample({ mark: 14, withheld: true })]);
    expect(screen.queryByText(/PROSE THAT WAS PAID FOR/)).toBeNull();
  });

  it('still says what is behind the plan, and offers the way through', () => {
    renderWith([sample({ mark: 14, answer: '', withheld: true })]);
    // The band and the mark: enough for a student to judge whether it is worth
    // paying for, which is the entire argument for keeping the row.
    expect(screen.getByText(/A Band \d exemplar at 14\/15/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /unlock with/i })).toBeTruthy();
  });

  it('leaves an exemplar it did send alone', () => {
    renderWith([sample({ mark: 6 })]);
    expect(screen.getByText(/PROSE THAT WAS PAID FOR/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /unlock with/i })).toBeNull();
  });
});
