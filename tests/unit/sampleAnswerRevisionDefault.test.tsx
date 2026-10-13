import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import SampleAnswerRevisionModal from '../../components/SampleAnswerRevisionModal';
import type { Prompt, PromptVerb, SampleAnswer } from '../../types';

/**
 * The revision dialog opens on a target mark, and that mark is what "Revise with
 * AI" writes to. It used to open on the lowest unused mark, which on a 6/6
 * sample is 0/6: one click turned a full-mark answer into a zero-mark rewrite.
 */
vi.mock('../../services/geminiService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/geminiService')>();
  return { ...actual, reviseSampleAnswer: vi.fn(() => new Promise(() => {})) };
});

afterEach(cleanup);

// EVALUATE is a Tier 6 verb, so on a six-mark question each mark is its own band:
// mark 3 is Band 3, and the next band up starts at mark 4.
const prompt = {
  id: 'p-1',
  question: 'Evaluate the design of the survey.',
  totalMarks: 6,
  verb: 'EVALUATE' as PromptVerb,
  sampleAnswers: [],
} as unknown as Prompt;

const sampleAt = (mark: number): SampleAnswer =>
  ({
    id: `sa-${mark}`,
    band: mark,
    mark,
    answer: 'A sample answer that evaluates the survey design.',
    source: 'AI',
  }) as SampleAnswer;

const props = (mark: number, existingMarks: number[]) => ({
  isOpen: true,
  onClose: vi.fn(),
  prompt,
  sampleToRevise: sampleAt(mark),
  existingMarks,
  onRevisionComplete: vi.fn(),
});

const targetValue = () => (screen.getByLabelText('New target mark') as HTMLSelectElement).value;

describe('SampleAnswerRevisionModal: the mark a revision starts on', () => {
  it('starts on the next band up, not on the lowest unused mark', () => {
    render(<SampleAnswerRevisionModal {...props(3, [3])} />);

    expect(targetValue()).toBe('4');
  });

  it('at full marks, steps down to the nearest unused mark rather than to 0/6', () => {
    render(<SampleAnswerRevisionModal {...props(6, [6])} />);

    expect(targetValue()).toBe('5');
  });

  it('skips a band-up mark that the question already has', () => {
    render(<SampleAnswerRevisionModal {...props(3, [3, 4])} />);

    expect(targetValue()).toBe('5');
  });

  it('at full marks, skips the nearest mark below when that one is taken', () => {
    render(<SampleAnswerRevisionModal {...props(6, [6, 5])} />);

    expect(targetValue()).toBe('4');
  });

  it('follows a different answer when the one under revision changes', () => {
    const { rerender } = render(<SampleAnswerRevisionModal {...props(3, [3])} />);
    expect(targetValue()).toBe('4');

    rerender(<SampleAnswerRevisionModal {...props(6, [6])} />);

    expect(targetValue()).toBe('5');
  });

  it('starts again from the default when the dialog is reopened', () => {
    const { rerender } = render(<SampleAnswerRevisionModal {...props(3, [3])} />);
    fireEvent.change(screen.getByLabelText('New target mark'), { target: { value: '0' } });
    expect(targetValue()).toBe('0');

    rerender(<SampleAnswerRevisionModal {...props(3, [3])} isOpen={false} />);
    rerender(<SampleAnswerRevisionModal {...props(3, [3])} isOpen />);

    expect(targetValue()).toBe('4');
  });

  /**
   * `SampleAnswersAccordion` passes the marks as a new array on every render. The
   * reset used to key on that array's identity, so the panel re-rendering in the
   * middle of someone's choice put their target back to the default.
   */
  it('keeps the chosen target when the parent re-renders with the same marks in a new array', () => {
    const { rerender } = render(<SampleAnswerRevisionModal {...props(3, [3])} />);
    fireEvent.change(screen.getByLabelText('New target mark'), { target: { value: '0' } });

    rerender(<SampleAnswerRevisionModal {...props(3, [3])} />);

    expect(targetValue()).toBe('0');
  });

  it('keeps the chosen target through a parent re-render while the revision is open', () => {
    const { rerender } = render(<SampleAnswerRevisionModal {...props(6, [6, 5])} />);
    fireEvent.change(screen.getByLabelText('New target mark'), { target: { value: '1' } });

    rerender(<SampleAnswerRevisionModal {...props(6, [5, 6])} />);

    expect(targetValue()).toBe('1');
  });

  it('labels the original answer with its own heading, not a stray label', () => {
    render(<SampleAnswerRevisionModal {...props(3, [3])} />);

    const region = screen.getByRole('region', { name: /original answer/i });
    expect(region.textContent).toContain('A sample answer that evaluates');
    expect(screen.getByRole('heading', { name: 'Revise sample answer' })).toBeTruthy();
  });
});
