import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import SampleAnswersAccordion from '../../components/SampleAnswersAccordion';
import SampleAnswerGeneratorModal from '../../components/SampleAnswerGeneratorModal';
import { MarkingGuidePanel } from '../../components/ReferenceMaterials';
import { LadderRowGutter } from '../../components/LadderRow';
import type { Prompt, PromptVerb, SampleAnswer } from '../../types';

/**
 * The phone form of the Sample Answers panel. A phone gets a narrow gutter on a closed
 * row, and a 4px strip on an open one, so the answer has the width. Both are `max-sm:`
 * overrides of the shared gutter, and only the Sample Answers panel asks for them: the
 * Marking Guide and the feedback report keep the full gutter at every width.
 */

vi.mock('../../services/geminiService', () => ({
  generateRubricForPrompt: vi.fn(),
  generateSampleAnswer: vi.fn(),
  reviseSampleAnswer: vi.fn(),
  performQualityCheck: vi.fn(),
}));

const GUIDE = [
  '5 marks: Explains the membrane with accurate examples',
  '3 marks: Describes the membrane with some accuracy',
  '1 mark: Makes a general statement about the membrane',
].join('\n');

const sample = (mark: number): SampleAnswer =>
  ({
    id: `s${mark}`,
    mark,
    band: mark,
    answer: `Model at ${mark}.`,
    source: 'AI',
  }) as SampleAnswer;

const makePrompt = (verb: string, sampleAnswers: SampleAnswer[]): Prompt =>
  ({
    id: `p-${verb}`,
    question: 'Explain how the cell membrane regulates transport.',
    verb: verb as PromptVerb,
    totalMarks: 6,
    keywords: [],
    markingCriteria: GUIDE,
    linkedOutcomes: [],
    sampleAnswers,
  }) as unknown as Prompt;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const tokensOf = (element: Element): string[] => (element.getAttribute('class') ?? '').split(' ');

/** The gutter of the exemplar row a level's disclosure belongs to: the row's first child. */
const gutterOfLevel = (mark: number): HTMLElement => {
  const disclosure = document.querySelector<HTMLElement>(`[data-exemplar-mark="${mark}"]`);
  const row = disclosure?.closest<HTMLElement>('[data-exemplar-row]');
  if (!row?.firstElementChild) throw new Error(`no exemplar row for mark ${mark}`);
  return row.firstElementChild as HTMLElement;
};

describe('the Sample Answers gutter on a phone', () => {
  const prompt = makePrompt('EXPLAIN', [sample(5), sample(3), sample(1)]);

  const renderOpenPanel = () =>
    render(
      <SampleAnswersAccordion
        prompt={prompt}
        onSampleAnswerGenerated={vi.fn()}
        onDeleteSampleAnswer={vi.fn()}
        onUpdateSampleAnswer={vi.fn()}
        userRole="user"
        defaultCollapsed={false}
      />
    );

  it('draws a closed row with the narrow gutter, and an open row with the strip', () => {
    renderOpenPanel();
    expect(tokensOf(gutterOfLevel(3))).toContain('max-sm:w-14');
    expect(tokensOf(gutterOfLevel(3))).not.toContain('max-sm:w-1');

    fireEvent.click(document.querySelector<HTMLElement>('[data-exemplar-mark="5"]')!);
    expect(document.querySelector('[data-exemplar-mark="5"]')!.getAttribute('aria-expanded')).toBe(
      'true'
    );
    expect(tokensOf(gutterOfLevel(5))).toContain('max-sm:w-1');
    expect(tokensOf(gutterOfLevel(5))).not.toContain('max-sm:w-14');
    // The other rows stay closed, so they keep the narrow gutter.
    expect(tokensOf(gutterOfLevel(3))).toContain('max-sm:w-14');
  });

  it('gives the row back its narrow gutter once it is shut again', () => {
    renderOpenPanel();
    const disclosure = document.querySelector<HTMLElement>('[data-exemplar-mark="5"]')!;
    fireEvent.click(disclosure);
    fireEvent.click(disclosure);
    expect(tokensOf(gutterOfLevel(5))).toContain('max-sm:w-14');
    expect(tokensOf(gutterOfLevel(5))).not.toContain('max-sm:w-1');
  });

  it('keeps the shared gutter tokens on both phone forms, so the lookups still find it', () => {
    renderOpenPanel();
    expect(tokensOf(gutterOfLevel(5))).toContain('w-[4.5rem]');
    expect(tokensOf(gutterOfLevel(3))).toContain('w-[4.5rem]');
  });

  it('leaves the Marking Guide and the default gutter at the full width on every size', () => {
    render(<MarkingGuidePanel prompt={prompt} userRole="user" onMarkingCriteriaChange={vi.fn()} />);
    const guideGutters = Array.from(document.querySelectorAll<HTMLElement>('.border-r')).filter(
      (el) => el.className.includes('w-[4.5rem]')
    );
    expect(guideGutters.length).toBeGreaterThan(0);
    for (const gutter of guideGutters) {
      expect(tokensOf(gutter).some((token) => token.startsWith('max-sm:'))).toBe(false);
    }
  });

  it('gives LadderRowGutter no phone override unless a caller asks for one', () => {
    const { container } = render(<LadderRowGutter band={3} markLabel="2" total={6} />);
    const gutter = container.firstElementChild as HTMLElement;
    expect(tokensOf(gutter).some((token) => token.startsWith('max-sm:'))).toBe(false);
  });
});

describe('the generator copy', () => {
  const prompt = makePrompt('DESCRIBE', []);

  it('names the verb without quotes, in the header and in the explanation', () => {
    render(
      <SampleAnswerGeneratorModal
        isOpen={true}
        onClose={vi.fn()}
        prompt={prompt}
        onSampleAnswerGenerated={vi.fn()}
      />
    );
    // The modal opens with every mark selected, so take the full marks off to leave the
    // single-mark sentence under test.
    fireEvent.click(screen.getByRole('button', { name: /^2 of 6 marks/ }));
    fireEvent.click(screen.getByRole('button', { name: /^6 of 6 marks/ }));

    const dialog = screen.getByRole('dialog', { name: /Generate a sample answer/i });
    const text = dialog.textContent ?? '';
    expect(text).not.toContain("'DESCRIBE'");
    expect(text).not.toMatch(/'DESCRIBE/);
    expect(text).toContain('this DESCRIBE question');
    expect(text).toContain('DESCRIBE');
  });
});
