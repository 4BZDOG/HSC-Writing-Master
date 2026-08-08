import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import ImprovementReviewModal from '../../components/ImprovementReviewModal';
import type { Prompt, PromptVerb } from '../../types';

/**
 * The improvement is an EDIT of the student's own answer, so the review has to
 * read as a diff: what was added, what was cut, and how much of their own
 * writing survived. A block of new prose teaches none of that.
 */
afterEach(cleanup);

const prompt: Prompt = {
  id: 'p1',
  question: 'Analyse the impact of caching on system performance.',
  totalMarks: 8,
  verb: 'Analyse' as PromptVerb,
  keywords: ['cache hit ratio', 'latency'],
  sampleAnswers: [],
} as unknown as Prompt;

const ORIGINAL = 'Caching stores data. It makes the system faster.';
const IMPROVED =
  'Caching stores frequently requested data. It makes the system faster by reducing latency.';

const renderModal = (over: Partial<React.ComponentProps<typeof ImprovementReviewModal>> = {}) => {
  const onApply = vi.fn();
  render(
    <ImprovementReviewModal
      isOpen
      onClose={vi.fn()}
      improvedAnswer={IMPROVED}
      originalAnswer={ORIGINAL}
      originalPrompt={prompt}
      targetBand={4}
      targetMark={5}
      originalMark={4}
      onApply={onApply}
      {...over}
    />
  );
  return { onApply };
};

describe('ImprovementReviewModal', () => {
  it('marks the added words and leaves the student’s own words unmarked', () => {
    renderModal();

    const added = screen.getAllByTitle('Added by the marker').map((el) => el.textContent?.trim());
    expect(added.join(' ')).toContain('frequently requested');
    expect(added.join(' ')).toContain('by reducing latency');

    // Nothing was cut in this revision, so no strike-through runs at all.
    expect(screen.queryAllByTitle('Cut by the marker')).toHaveLength(0);
  });

  it('marks words the revision cut', () => {
    renderModal({ improvedAnswer: 'Caching stores data.' });

    const cut = screen.getAllByTitle('Cut by the marker').map((el) => el.textContent?.trim());
    expect(cut.join(' ')).toContain('It makes the system faster.');
  });

  it('reports how much of the student’s own writing survived', () => {
    renderModal();

    expect(screen.getByText('of your words kept')).toBeTruthy();
    // Every original word is carried through, so retention is 100%.
    expect(screen.getByText('100%')).toBeTruthy();
  });

  it('names the mark it moved from and to', () => {
    renderModal();

    expect(screen.getByText('4 → 5/8')).toBeTruthy();
    expect(screen.getByText(/\+1 mark/)).toBeTruthy();
  });

  it('names the syllabus terms the revision brought in', () => {
    renderModal();

    const panel = screen.getByText(/Syllabus terms the revision added/).closest('div')!;
    expect(within(panel).getByText('latency')).toBeTruthy();
    // A term the student already used is not claimed as new.
    expect(within(panel).queryByText('cache hit ratio')).toBeNull();
  });

  it('applies the revised text, not the marked-up version', () => {
    const { onApply } = renderModal();

    fireEvent.click(screen.getByText('Use this version'));

    expect(onApply).toHaveBeenCalledWith(IMPROVED);
  });

  it('offers a side-by-side view that shows each side its own text', () => {
    renderModal();

    fireEvent.click(screen.getByText('Side by side'));

    expect(screen.getByText('Your original')).toBeTruthy();
    expect(screen.getByText('Improved')).toBeTruthy();
    // Word counts for each column come from the diff, not a separate count.
    expect(screen.getByText('8 words')).toBeTruthy();
    expect(screen.getByText('13 words')).toBeTruthy();
  });

  it('falls back to the plain revision when there is no original to compare', () => {
    renderModal({ originalAnswer: null });

    expect(screen.queryByText('Side by side')).toBeNull();
    expect(screen.queryAllByTitle('Cut by the marker')).toHaveLength(0);
    expect(screen.getByText(/Caching stores frequently requested data/)).toBeTruthy();
  });
});
