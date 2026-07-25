import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import ReferenceMaterials from '../../components/ReferenceMaterials';
import SampleAnswersAccordion from '../../components/SampleAnswersAccordion';
import { Prompt, CourseOutcome, PromptVerb, Topic } from '../../types';
import { isTwoColumnWidth, TWO_COLUMN_BREAKPOINT } from '../../utils/layoutConstants';

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

/** Panel headings in DOM order, read from the disclosure buttons themselves. */
const sectionTitles = () =>
  Array.from(document.querySelectorAll('button[aria-expanded]')).map(
    (el) => (el.textContent ?? '').trim().split('\n')[0]
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
    sampleAnswers: [{ id: 's1', answer: 'A model response.', mark: 6, band: 6, source: 'AI' }],
  } as Partial<Prompt>);

  // Folded by default, like every other panel in the rail, and its controls
  // live in the body so the collapsed row reads as a heading, not a toolbar.
  it('starts folded, and unfolds from the header', () => {
    render(<SampleAnswersAccordion {...sampleProps} prompt={withSamples} />);
    const header = screen.getByRole('button', { name: /Sample Answers/i });
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(/6\/6 Marks/i)).toBeNull();
    expect(screen.queryByTitle(/Increase text size/i)).toBeNull();

    fireEvent.click(header);
    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(/6\/6 Marks/i)).toBeTruthy();
  });

  it('can be asked to start open', () => {
    render(
      <SampleAnswersAccordion {...sampleProps} prompt={withSamples} defaultCollapsed={false} />
    );
    expect(screen.getByText(/6\/6 Marks/i)).toBeTruthy();
  });

  it('defers to a shared reading size when the workspace supplies one', () => {
    const onFontSizeChange = vi.fn();
    render(
      <SampleAnswersAccordion
        {...sampleProps}
        prompt={withSamples}
        defaultCollapsed={false}
        fontSize={20}
        onFontSizeChange={onFontSizeChange}
      />
    );
    expect(screen.getByText('20')).toBeTruthy();
    fireEvent.click(screen.getByTitle(/Increase text size/i));
    expect(onFontSizeChange).toHaveBeenCalledWith(22);
  });
});

describe('card chrome sync', () => {
  it('only applies when the two cards are side by side', () => {
    // The header/footer/height sync exists so the prompt and the writing area
    // line up as columns. Below `lg` the grid stacks them, and a prompt footer
    // that wraps its outcome chips onto three rows was dragging the writing
    // area's 41px footer to 163px of empty space.
    expect(isTwoColumnWidth(1600)).toBe(true);
    expect(isTwoColumnWidth(TWO_COLUMN_BREAKPOINT)).toBe(true);
    expect(isTwoColumnWidth(TWO_COLUMN_BREAKPOINT - 1)).toBe(false);
    expect(isTwoColumnWidth(390)).toBe(false);
  });
});

describe('panel chrome consistency', () => {
  it('gives every rail panel the same disclosure contract', () => {
    render(
      <ReferenceMaterials
        {...railProps}
        prompt={prompt()}
        topic={topic()}
        courseOutcomes={OUTCOMES}
        sampleAnswersSlot={
          <SampleAnswersAccordion
            prompt={prompt()}
            onSampleAnswerGenerated={vi.fn()}
            onUseSampleAnswer={vi.fn()}
            onDeleteSampleAnswer={vi.fn()}
            onUpdateSampleAnswer={vi.fn()}
            userRole="student"
          />
        }
      />
    );
    const panels = Array.from(document.querySelectorAll('button[aria-expanded]'));
    expect(panels.length).toBe(5);
    // Screen readers get the same story from all of them, exemplars included.
    for (const panel of panels) {
      expect(panel.getAttribute('aria-expanded')).toMatch(/true|false/);
      expect(panel.getAttribute('aria-controls')).toBeTruthy();
    }
  });

  it('does not head the Marking Guide twice', () => {
    render(
      <ReferenceMaterials
        {...railProps}
        prompt={prompt()}
        topic={topic()}
        courseOutcomes={OUTCOMES}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Marking Guide/i }));
    // The panel supplies the title and the band line; the criteria manager
    // used to repeat both immediately underneath.
    expect(screen.queryByText(/^Marking Criteria$/i)).toBeNull();
    expect(screen.getByText(/Top level: Band \d/i)).toBeTruthy();
  });
});
