import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import ReferenceMaterials from '../../components/ReferenceMaterials';
import SampleAnswersAccordion from '../../components/SampleAnswersAccordion';
import { Prompt, CourseOutcome, PromptVerb, Topic } from '../../types';

/**
 * Ordering and communication contract for the workspace's left reference rail
 * and the exemplars that now live inside it. The bundled sample courses carry
 * no linked outcomes, so the outcome-briefing path can only be exercised here.
 */

vi.mock('../../services/geminiService', () => ({
  explainOutcomeInContext: vi.fn().mockResolvedValue('Because the question asks you to explain.'),
  generateRubricForPrompt: vi.fn(),
}));

afterEach(cleanup);

const OUTCOMES: CourseOutcome[] = [
  { code: 'BI-12-01', description: 'Analyses the structure and function of biological molecules.' },
  { code: 'BI-12-04', description: 'Explains the mechanisms of inheritance.' },
];

const prompt = (over: Partial<Prompt> = {}): Prompt =>
  ({
    id: 'p1',
    question: 'Explain the roles of mRNA and tRNA in polypeptide synthesis.',
    verb: 'EXPLAIN' as PromptVerb,
    totalMarks: 6,
    keywords: ['mRNA', 'tRNA'],
    markingCriteria: '6 marks: Explains both roles thoroughly.',
    linkedOutcomes: ['BI-12-01', 'BI-12-04'],
    sampleAnswers: [],
    ...over,
  }) as Prompt;

const topic = (): Topic =>
  ({
    id: 't1',
    name: 'Heredity',
    subTopics: [],
    performanceBandDescriptors: [
      { band: 6, shortLabel: 'Extensive', description: 'Demonstrates extensive knowledge.' },
      { band: 5, shortLabel: 'Thorough', description: 'Demonstrates thorough knowledge.' },
    ],
  }) as unknown as Topic;

const railProps = {
  onKeywordsChange: vi.fn(),
  onMarkingCriteriaChange: vi.fn(),
  isEnriching: false,
  onRegenerateKeywords: vi.fn(),
  isRegeneratingKeywords: false,
  regenerateError: null,
  onSuggestKeywords: vi.fn(),
  isSuggestingKeywords: false,
  suggestError: null,
  userRole: 'student' as const,
};

const sectionTitles = () =>
  Array.from(document.querySelectorAll('span'))
    .map((el) => el.textContent?.trim() ?? '')
    .filter((t) =>
      /^(What's Assessed|Syllabus Terms|Grade Standards|Marking Guide)/i.test(t)
    );

describe('ReferenceMaterials rail', () => {
  it('orders the panels so standards are read before the criteria', () => {
    render(
      <ReferenceMaterials
        {...railProps}
        prompt={prompt()}
        topic={topic()}
        courseOutcomes={OUTCOMES}
      />
    );
    const titles = sectionTitles();
    expect(titles[0]).toMatch(/What's Assessed/i);
    expect(titles[1]).toMatch(/Syllabus Terms/i);
    expect(titles[2]).toMatch(/Grade Standards/i);
    expect(titles[3]).toMatch(/Marking Guide/i);
  });

  it('renders the exemplars slot after the marking guide, not before it', () => {
    render(
      <ReferenceMaterials
        {...railProps}
        prompt={prompt()}
        topic={topic()}
        courseOutcomes={OUTCOMES}
        sampleAnswersSlot={<div data-testid="samples">samples</div>}
      />
    );
    const guide = screen.getByText(/Marking Guide/i);
    const samples = screen.getByTestId('samples');
    // Node.DOCUMENT_POSITION_FOLLOWING === 4
    expect(guide.compareDocumentPosition(samples) & 4).toBeTruthy();
  });

  it('names every linked outcome and opens its briefing on click', async () => {
    render(
      <ReferenceMaterials
        {...railProps}
        prompt={prompt()}
        topic={topic()}
        courseOutcomes={OUTCOMES}
        breadcrumb={['Biology', 'Heredity', 'Synthesis', 'Dot point']}
      />
    );
    expect(screen.getByText(/What's Assessed · 2 Outcomes/i)).toBeTruthy();
    // The description is spelled out in the rail, not hidden behind a chip.
    expect(screen.getByText(OUTCOMES[0].description)).toBeTruthy();

    fireEvent.click(screen.getByText('BI-12-01'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByText('BI-12-01').length).toBeGreaterThan(0);
  });

  it('omits the outcomes panel entirely when nothing is linked', () => {
    render(
      <ReferenceMaterials
        {...railProps}
        prompt={prompt({ linkedOutcomes: [] })}
        topic={topic()}
        courseOutcomes={OUTCOMES}
      />
    );
    expect(screen.queryByText(/What's Assessed/i)).toBeNull();
  });
});

describe('SampleAnswersAccordion', () => {
  const sampleProps = {
    onSampleAnswerGenerated: vi.fn(),
    onUseSampleAnswer: vi.fn(),
    onDeleteSampleAnswer: vi.fn(),
    onUpdateSampleAnswer: vi.fn(),
    userRole: 'student' as const,
  };
  const withSamples = prompt({
    sampleAnswers: [
      { id: 's1', answer: 'A model response.', mark: 6, band: 6, source: 'AI' },
    ],
  } as Partial<Prompt>);

  it('shows its content by default outside Focus Mode', () => {
    render(<SampleAnswersAccordion {...sampleProps} prompt={withSamples} />);
    expect(screen.getByText(/6\/6 Marks/i)).toBeTruthy();
  });

  it('starts folded when collapsible, and unfolds on click', () => {
    render(<SampleAnswersAccordion {...sampleProps} prompt={withSamples} collapsible />);
    expect(screen.queryByText(/6\/6 Marks/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Sample Answers/i }));
    expect(screen.getByText(/6\/6 Marks/i)).toBeTruthy();
  });

  it('defers to a shared reading size when the workspace supplies one', () => {
    const onFontSizeChange = vi.fn();
    render(
      <SampleAnswersAccordion
        {...sampleProps}
        prompt={withSamples}
        fontSize={20}
        onFontSizeChange={onFontSizeChange}
      />
    );
    expect(screen.getByText('20')).toBeTruthy();
    fireEvent.click(screen.getByTitle(/Increase text size/i));
    expect(onFontSizeChange).toHaveBeenCalledWith(22);
  });
});
