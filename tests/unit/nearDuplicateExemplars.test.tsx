import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import SampleAnswerGeneratorModal from '../../components/SampleAnswerGeneratorModal';
import { generateSampleAnswer } from '../../services/geminiService';
import { getBandForMark, getCommandTermInfo } from '../../data/commandTerms';
import {
  answerSimilarity,
  findNearDuplicate,
  describeSimilarity,
  NEAR_DUPLICATE_THRESHOLD,
} from '../../utils/answerSimilarity';
import type { Prompt, PromptVerb, SampleAnswer } from '../../types';

/**
 * Labelling and folding make five exemplars at one mark readable. They cannot
 * make the fifth one worth reading. The cheapest fix for "five AI variations on
 * the same shape" is not to store the fifth — but asked, never dropped, because
 * a silent discard makes the library lie about what it produced just as surely
 * as a silent cap does.
 */

vi.mock('../../services/geminiService', () => ({
  generateSampleAnswer: vi.fn(),
}));

const mockGenerate = vi.mocked(generateSampleAnswer);

const ORIGINAL =
  'Caching reduces latency because frequently requested data is served from memory rather than from disk, which lowers the average response time of the system.';
const PARAPHRASE =
  'Caching reduces latency because frequently requested data is served from memory instead of from disk, which lowers the average response time for the system.';
const SAME_TOPIC =
  'Storing recently used results in memory means the processor avoids a slow disk read on every request, so throughput improves under sustained load.';
const UNRELATED =
  'A distributed load balancer spreads incoming requests across several nodes, so no single server becomes a bottleneck during peak demand.';

describe('exemplar similarity', () => {
  it('reports an identical answer as identical', () => {
    expect(answerSimilarity(ORIGINAL, ORIGINAL)).toBe(1);
  });

  it('catches a reworded copy', () => {
    expect(answerSimilarity(ORIGINAL, PARAPHRASE)).toBeGreaterThan(NEAR_DUPLICATE_THRESHOLD);
  });

  it('leaves a genuinely different answer on the same topic alone', () => {
    // The point of measuring PHRASING rather than vocabulary: two answers to
    // one question necessarily share their words. Flagging this one would make
    // the check useless, because a teacher would learn to ignore it.
    expect(answerSimilarity(ORIGINAL, SAME_TOPIC)).toBeLessThan(NEAR_DUPLICATE_THRESHOLD);
    expect(answerSimilarity(ORIGINAL, UNRELATED)).toBeLessThan(NEAR_DUPLICATE_THRESHOLD);
  });

  it('is unmoved by the mark-up exemplars are stored in', () => {
    expect(answerSimilarity(`<p>${ORIGINAL}</p>`, ORIGINAL)).toBe(1);
  });

  it('returns the closest match, not the first one over the line', () => {
    const match = findNearDuplicate(ORIGINAL, [
      { id: 'a', answer: PARAPHRASE.replace('frequently requested', 'often requested') },
      { id: 'b', answer: PARAPHRASE },
      { id: 'c', answer: UNRELATED },
    ]);
    expect(match?.against.id).toBe('b');
    // Two words changed in a sentence is "very similar"; "near-identical" is
    // reserved for something closer to a copy, so the label stays worth reading.
    expect(describeSimilarity(match?.score ?? 0)).toBe('Very similar');
    expect(describeSimilarity(answerSimilarity(ORIGINAL, ORIGINAL))).toBe('Near-identical');
  });

  it('finds nothing when nothing repeats', () => {
    expect(findNearDuplicate(ORIGINAL, [{ id: 'c', answer: UNRELATED }])).toBeNull();
  });

  it('handles an empty or wordless answer without claiming a match', () => {
    expect(answerSimilarity('', ORIGINAL)).toBe(0);
    expect(answerSimilarity('<p></p>', ORIGINAL)).toBe(0);
  });
});

// --- The generator ----------------------------------------------------------

const TOTAL = 6;
const VERB = 'Analyse' as PromptVerb;
const bandOf = (mark: number) => getBandForMark(mark, TOTAL, getCommandTermInfo(VERB).tier);

const existing = (answer: string, mark = TOTAL): SampleAnswer =>
  ({
    id: `sa-${mark}`,
    answer,
    mark,
    band: bandOf(mark),
    source: 'AI',
    feedback: 'ok',
  }) as SampleAnswer;

const promptWith = (samples: SampleAnswer[]): Prompt =>
  ({
    id: 'p1',
    question: 'Analyse the impact of caching on system performance.',
    totalMarks: TOTAL,
    verb: VERB,
    sampleAnswers: samples,
  }) as Prompt;

const markButton = (mark: number) =>
  screen.getByRole('button', { name: new RegExp(`^${mark} of ${TOTAL} marks`) });

afterEach(cleanup);

describe('a generated answer that repeats one already at that mark', () => {
  const onGenerated = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    mockGenerate.mockReset();
    onGenerated.mockReset();
    onClose.mockReset();
  });

  /** Generates one answer at full marks, against a library holding `samples`. */
  const generateAt6 = async (samples: SampleAnswer[], produced: string) => {
    mockGenerate.mockImplementation(
      async (_p, mark) =>
        ({
          id: 'new-1',
          answer: produced,
          mark,
          band: bandOf(mark),
          source: 'AI',
          feedback: 'ok',
        }) as SampleAnswer
    );

    render(
      <SampleAnswerGeneratorModal
        isOpen={true}
        onClose={onClose}
        prompt={promptWith(samples)}
        onSampleAnswerGenerated={onGenerated}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    fireEvent.click(markButton(TOTAL));
    fireEvent.click(screen.getByText(`Generate Band ${bandOf(TOTAL)} Answer`));
    await waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(1));
  };

  it('holds it back rather than writing a second copy', async () => {
    await generateAt6([existing(ORIGINAL)], PARAPHRASE);

    await screen.findByText(/repeats an exemplar already at that mark/i);
    expect(onGenerated).not.toHaveBeenCalled();
    // The modal cannot close over an undecided answer — that would be the
    // silent discard this check exists to prevent.
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows both answers and how alike they are, so the call is the reader’s', async () => {
    await generateAt6([existing(ORIGINAL)], PARAPHRASE);

    await screen.findByText(/repeats an exemplar already at that mark/i);
    expect(screen.getByText(/(Very similar|Near-identical) · \d+% overlap/)).toBeTruthy();
    // Both are on screen, told apart by the words that differ — the reader is
    // being asked to judge, so they need the evidence, not a verdict.
    expect(screen.getByText(/served from memory instead of from disk/)).toBeTruthy();
    expect(screen.getByText(/served from memory rather than from disk/)).toBeTruthy();
  });

  it('writes it after all when the reader keeps it', async () => {
    await generateAt6([existing(ORIGINAL)], PARAPHRASE);
    fireEvent.click(await screen.findByRole('button', { name: /keep it/i }));

    expect(onGenerated).toHaveBeenCalledTimes(1);
    expect(onGenerated.mock.calls[0][0].answer).toBe(PARAPHRASE);
  });

  it('loses nothing but the repeat when the reader discards it', async () => {
    await generateAt6([existing(ORIGINAL)], PARAPHRASE);
    fireEvent.click(await screen.findByRole('button', { name: /discard/i }));

    expect(onGenerated).not.toHaveBeenCalled();
    expect(screen.queryByText(/repeats an exemplar already at that mark/i)).toBeNull();
  });

  it('never stands in the way of a genuinely new answer', async () => {
    await generateAt6([existing(ORIGINAL)], SAME_TOPIC);

    await waitFor(() => expect(onGenerated).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/repeats an exemplar/i)).toBeNull();
  });

  it('compares only against the same mark — a tight ladder is not a duplicate', async () => {
    // The 4/6 saying almost what the 6/6 says is the ladder being close, which
    // is often exactly right; it is not the same failure as two answers at one
    // mark.
    await generateAt6([existing(ORIGINAL, 4)], PARAPHRASE);

    await waitFor(() => expect(onGenerated).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/repeats an exemplar/i)).toBeNull();
  });
});
