import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import MarkingCriteriaManager from '../../components/MarkingCriteriaAccordion';
import { OPEN_EXEMPLAR_EVENT, type OpenExemplarDetail } from '../../utils/ladderLink';
import { LADDER_MODEL_ANSWER } from '../../utils/ladderChrome';
import type { Prompt, PromptVerb, SampleAnswer } from '../../types';

/**
 * A guide row that has an exemplar at its level shows a "Model answer" control.
 * Pressing it asks the Sample Answers panel for that mark, and the row says which
 * mark it will open in its label, so the student is never sent to an exemplar
 * they did not ask for.
 */

vi.mock('../../services/geminiService', () => ({
  generateRubricForPrompt: vi.fn(),
}));

afterEach(cleanup);

const sample = (mark: number): SampleAnswer =>
  ({ id: `s${mark}`, mark, band: mark, answer: 'x', source: 'AI' }) as SampleAnswer;

const prompt = (verb: string, totalMarks: number, sampleMarks: number[]): Prompt =>
  ({
    id: 'p-model',
    question: 'Analyse the causes of the event.',
    verb: verb as PromptVerb,
    totalMarks,
    keywords: [],
    linkedOutcomes: [],
    sampleAnswers: sampleMarks.map(sample),
    isPastHSC: false,
  }) as unknown as Prompt;

const renderGuide = (criteria: string, p: Prompt) =>
  render(
    <MarkingCriteriaManager
      prompt={p}
      markingCriteria={criteria}
      onSave={() => {}}
      band={4}
      userRole="user"
      embedded
    />
  );

const chips = () => screen.queryAllByRole('button', { name: /see the model answer/i });

const FOUR_ROWS = [
  '4 marks: Provides a complete analysis',
  '3 marks: Provides a sound analysis',
  '2 marks: Outlines the analysis',
  '1 mark: Identifies a point',
].join('\n');

describe('the Model answer control on a guide row', () => {
  it('appears on each row that has an exemplar, and only on those', () => {
    renderGuide(FOUR_ROWS, prompt('ANALYSE', 4, [4, 2]));

    expect(chips()).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'See the model answer for 4 marks' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'See the model answer for 2 marks' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /model answer for 3 marks/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /model answer for 1 mark/i })).toBeNull();
  });

  it('is labelled with the words "Model answer" on the face of the control', () => {
    renderGuide(FOUR_ROWS, prompt('ANALYSE', 4, [4]));
    expect(
      screen.getByRole('button', { name: /see the model answer for 4 marks/i }).textContent
    ).toMatch(/Model answer/);
  });

  it('is not shown when the question has no exemplars at all', () => {
    renderGuide(FOUR_ROWS, prompt('ANALYSE', 4, []));
    expect(chips()).toHaveLength(0);
  });

  it('asks for the exemplar at the mark the row names when pressed', () => {
    const heard: OpenExemplarDetail[] = [];
    const listen = (e: Event) => heard.push((e as CustomEvent<OpenExemplarDetail>).detail);
    window.addEventListener(OPEN_EXEMPLAR_EVENT, listen);

    renderGuide(FOUR_ROWS, prompt('ANALYSE', 4, [4, 2]));
    fireEvent.click(screen.getByRole('button', { name: 'See the model answer for 2 marks' }));

    window.removeEventListener(OPEN_EXEMPLAR_EVENT, listen);
    expect(heard).toEqual([{ promptId: 'p-model', mark: 2 }]);
  });

  it('opens the highest exemplar that falls inside a range row', () => {
    const heard: OpenExemplarDetail[] = [];
    const listen = (e: Event) => heard.push((e as CustomEvent<OpenExemplarDetail>).detail);
    window.addEventListener(OPEN_EXEMPLAR_EVENT, listen);

    renderGuide('3-4 marks: Sound analysis\n1-2 marks: Basic', prompt('ANALYSE', 4, [3, 4, 1]));
    fireEvent.click(screen.getByRole('button', { name: 'See the model answer for 4 marks' }));

    window.removeEventListener(OPEN_EXEMPLAR_EVENT, listen);
    expect(heard).toEqual([{ promptId: 'p-model', mark: 4 }]);
  });

  it('finds the exemplar for a band row by the band its mark earns on this question', () => {
    // EVALUATE on 4 marks: mark 4 earns Band 6, so the Band 6 row has the exemplar.
    renderGuide('Band 6: Comprehensive evaluation\nBand 3: Basic', prompt('EVALUATE', 4, [4]));

    expect(screen.getByRole('button', { name: 'See the model answer for 4 marks' })).toBeTruthy();
    expect(chips()).toHaveLength(1);
    // The band row says its band once, in its label, and gets no second caption.
    expect(screen.getAllByText('Band 6')).toHaveLength(1);
  });

  it('uses the singular for a single mark', () => {
    renderGuide('1 mark: Identifies a point', prompt('IDENTIFY', 1, [1]));
    expect(screen.getByRole('button', { name: 'See the model answer for 1 mark' })).toBeTruthy();
  });

  it('keeps a touch target of at least 44px on a phone', () => {
    renderGuide(FOUR_ROWS, prompt('ANALYSE', 4, [4]));
    const chip = screen.getByRole('button', { name: /see the model answer/i });
    expect(chip.className).toContain(LADDER_MODEL_ANSWER);
    expect(chip.className).toContain('min-h-11');
  });

  it('leaves the criterion text itself in place, beside the control', () => {
    renderGuide(FOUR_ROWS, prompt('ANALYSE', 4, [4]));
    expect(screen.getByText(/Provides a complete analysis/)).toBeTruthy();
  });
});
