import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import SampleAnswerGeneratorModal from '../../components/SampleAnswerGeneratorModal';
import { generateSampleAnswer } from '../../services/geminiService';
import { getBandForMark, getCommandTermInfo } from '../../data/commandTerms';
import type { Prompt, PromptVerb, SampleAnswer } from '../../types';

/**
 * Building a ladder of exemplars used to mean reopening this modal once per
 * mark. Marks are now a multi-selection generated as one batch, bottom-up, with
 * each answer written against the ones already produced.
 */
vi.mock('../../services/geminiService', () => ({
  generateSampleAnswer: vi.fn(),
}));

const mockGenerate = vi.mocked(generateSampleAnswer);

const TOTAL = 6;

const prompt = (over: Partial<Prompt> = {}): Prompt =>
  ({
    id: 'p1',
    question: 'Analyse the impact of caching on system performance.',
    totalMarks: TOTAL,
    verb: 'Analyse' as PromptVerb,
    sampleAnswers: [],
    ...over,
  }) as Prompt;

const sample = (mark: number): SampleAnswer =>
  ({
    id: `sa-${mark}`,
    answer: `An answer worth ${mark}.`,
    mark,
    band: getBandForMark(mark, TOTAL, getCommandTermInfo('Analyse' as PromptVerb).tier),
    source: 'AI',
    feedback: 'ok',
  }) as SampleAnswer;

/** Band the modal will label a mark with — the same Verb Gate the app uses. */
const bandOf = (mark: number) =>
  getBandForMark(mark, TOTAL, getCommandTermInfo('Analyse' as PromptVerb).tier);

afterEach(cleanup);

/** The mark tiles carry their full meaning as an accessible name. */
const markButton = (mark: number) =>
  screen.getByRole('button', { name: new RegExp(`^${mark} of ${TOTAL} marks`) });

describe('SampleAnswerGeneratorModal batch generation', () => {
  beforeEach(() => {
    mockGenerate.mockReset();
    mockGenerate.mockImplementation(async (_p, mark) => sample(mark));
  });

  const renderModal = (onGenerated = vi.fn(), over: Partial<Prompt> = {}) => {
    render(
      <SampleAnswerGeneratorModal
        isOpen={true}
        onClose={vi.fn()}
        prompt={prompt(over)}
        onSampleAnswerGenerated={onGenerated}
      />
    );
    return onGenerated;
  };

  it('generates one answer per selected mark, lowest first', async () => {
    const onGenerated = renderModal();

    // Default selection is full marks; add 1 and 2.
    fireEvent.click(markButton(1));
    fireEvent.click(markButton(2));
    expect(screen.getByText('Generate 3 Sample Answers')).toBeTruthy();

    fireEvent.click(screen.getByText('Generate 3 Sample Answers'));

    await waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(3));
    expect(mockGenerate.mock.calls.map((c) => c[1])).toEqual([1, 2, TOTAL]);
    expect(onGenerated).toHaveBeenCalledTimes(3);
  });

  it('shows each answer to the next one so the ladder is graduated', async () => {
    renderModal();
    fireEvent.click(markButton(1));
    fireEvent.click(screen.getByText('Generate 2 Sample Answers'));

    await waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(2));

    // The first call has nothing to compare against; the second sees the first.
    expect(mockGenerate.mock.calls[0][2]).toEqual([]);
    expect(mockGenerate.mock.calls[1][2]).toEqual([sample(1)]);
  });

  it('keeps what succeeded and re-arms only the failures', async () => {
    const onGenerated = vi.fn();
    mockGenerate.mockImplementation(async (_p, mark) => {
      if (mark === 2) throw new Error('Model unavailable.');
      return sample(mark);
    });
    renderModal(onGenerated);

    fireEvent.click(markButton(2));
    fireEvent.click(screen.getByText('Generate 2 Sample Answers'));

    await waitFor(() => expect(screen.getByText(/could not be generated/)).toBeTruthy());
    // The full-mark answer still landed in the library.
    expect(onGenerated).toHaveBeenCalledTimes(1);
    expect(onGenerated).toHaveBeenCalledWith(sample(TOTAL));
    // Only the failed mark stays selected, so "Generate" retries exactly that.
    expect(screen.getByText(`Generate Band ${bandOf(2)} Answer`)).toBeTruthy();
    expect(screen.getByText(/Model unavailable/)).toBeTruthy();
  });

  it('offers a one-click selection of every band with no exemplar yet', async () => {
    renderModal(vi.fn(), { sampleAnswers: [sample(TOTAL)] });

    fireEvent.click(screen.getByTitle(/every band that has no exemplar yet/));
    fireEvent.click(screen.getByText(/^Generate \d+ Sample Answers$/));

    await waitFor(() => expect(mockGenerate).toHaveBeenCalled());
    const requested = mockGenerate.mock.calls.map((c) => c[1]);
    // Nothing from the band the existing exemplar already demonstrates…
    expect(requested).not.toContain(TOTAL);
    // …and one mark for each band that has none.
    expect(new Set(requested.map(bandOf)).size).toBe(requested.length);
  });
});
