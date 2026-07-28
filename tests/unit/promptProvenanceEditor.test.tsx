import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import PromptDisplay from '../../components/PromptDisplay';
import { Prompt, PromptVerb } from '../../types';

/**
 * Which HSC paper a question came from used to be writable only by a bulk
 * import, so a mistagged question could not be corrected anywhere in the app.
 * The header chip is the way in — for a curator, and only outside Exam Mode,
 * where nothing on the card is editable.
 *
 * The chip appears only on a question that IS from a past paper. The empty
 * state used to render a dashed "Tag paper" chip beside the heading of every
 * practice question a curator opened; tagging a question as a past paper
 * belongs with the rest of its metadata, in the question editor.
 */

vi.mock('../../services/geminiService', () => ({
  explainOutcomeInContext: vi.fn(),
}));

afterEach(cleanup);

const makePrompt = (overrides: Partial<Prompt> = {}) =>
  ({
    id: 'p1',
    question: 'Describe the key steps involved in DNA replication.',
    verb: 'DESCRIBE' as PromptVerb,
    totalMarks: 4,
    keywords: [],
    sampleAnswers: [],
    ...overrides,
  }) as unknown as Prompt;

const onUpdatePrompt = vi.fn();

const props = {
  prompt: makePrompt(),
  isEnriching: false,
  enrichError: null,
  onVerbClick: vi.fn(),
  onGenerateScenario: vi.fn(),
  onUpdatePrompt,
  isGeneratingScenario: false,
  generateScenarioError: null,
  courseOutcomes: [],
  onOutcomeClick: vi.fn(),
  userRole: 'teacher' as const,
  onDismissEnrichError: vi.fn(),
  onRunQualityCheck: vi.fn(),
  onSuggestOutcomes: vi.fn(),
  isSuggestingOutcomes: false,
  fontSize: 18,
  onFontSizeChange: vi.fn(),
};

const chip = () => screen.getByRole('button', { name: /HSC|Past HSC/i });

describe('past HSC provenance on the question card', () => {
  it('lets a curator correct the paper a tagged question came from', () => {
    render(<PromptDisplay {...props} prompt={makePrompt({ isPastHSC: true, hscYear: 2019 })} />);
    onUpdatePrompt.mockClear();

    fireEvent.click(chip());
    fireEvent.change(screen.getByLabelText(/^Year$/i), { target: { value: '2023' } });
    fireEvent.change(screen.getByLabelText(/Question No\./i), { target: { value: '12(b)' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

    expect(onUpdatePrompt).toHaveBeenCalledWith({
      isPastHSC: true,
      hscYear: 2023,
      hscQuestionNumber: '12(b)',
    });
  });

  // The header is the most prominent line in the workspace; a filing control
  // for something the question is not does not belong in it.
  it('offers a curator no tagging chip on a question that is not a past paper', () => {
    render(<PromptDisplay {...props} />);

    expect(screen.queryByRole('button', { name: /Tag paper/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /HSC/i })).toBeNull();
  });

  it('shows the paper it came from, and seeds the editor from it', () => {
    render(
      <PromptDisplay
        {...props}
        prompt={makePrompt({ isPastHSC: true, hscYear: 2019, hscQuestionNumber: '7' })}
      />
    );

    expect(screen.getByText('HSC 2019 · Q7')).toBeTruthy();
    fireEvent.click(chip());
    expect((screen.getByLabelText(/^Year$/i) as HTMLInputElement).value).toBe('2019');
    expect((screen.getByLabelText(/Question No\./i) as HTMLInputElement).value).toBe('7');
  });

  // The other half of "can be corrected": a question wrongly imported as a
  // past paper has to be able to stop being one.
  it('can untag a question that is not from a past paper after all', () => {
    render(<PromptDisplay {...props} prompt={makePrompt({ isPastHSC: true, hscYear: 2019 })} />);
    onUpdatePrompt.mockClear();

    fireEvent.click(chip());
    fireEvent.click(screen.getByRole('button', { name: /not a past paper/i }));

    expect(onUpdatePrompt).toHaveBeenCalledWith({
      isPastHSC: false,
      hscYear: undefined,
      hscQuestionNumber: undefined,
    });
  });

  it('accepts a paper whose year is not known', () => {
    render(
      <PromptDisplay {...props} prompt={makePrompt({ isPastHSC: true, hscQuestionNumber: '3' })} />
    );
    onUpdatePrompt.mockClear();

    fireEvent.click(chip());
    fireEvent.change(screen.getByLabelText(/Question No\./i), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

    expect(onUpdatePrompt).toHaveBeenCalledWith({
      isPastHSC: true,
      hscYear: undefined,
      hscQuestionNumber: undefined,
    });
  });

  it('shows a student the label but no way to edit it', () => {
    render(
      <PromptDisplay
        {...props}
        userRole={'student' as const}
        prompt={makePrompt({ isPastHSC: true, hscYear: 2021 })}
      />
    );

    expect(screen.getByText('HSC 2021')).toBeTruthy();
    fireEvent.click(chip());
    expect(screen.queryByLabelText(/^Year$/i)).toBeNull();
  });

  it('offers a student with no tagged paper nothing at all', () => {
    render(<PromptDisplay {...props} userRole={'student' as const} />);
    expect(screen.queryByRole('button', { name: /Tag paper|HSC/i })).toBeNull();
  });

  it('does not let a curator edit provenance in Exam Mode', () => {
    render(
      <PromptDisplay {...props} examMode prompt={makePrompt({ isPastHSC: true, hscYear: 2021 })} />
    );

    fireEvent.click(chip());
    expect(screen.queryByLabelText(/^Year$/i)).toBeNull();
  });
});

describe('syllabus terms fill the void a short question leaves', () => {
  const withKeywords = makePrompt({ keywords: ['helicase', 'DNA polymerase'] });

  it('shows them when the card has room — no scenario to fill it', () => {
    render(<PromptDisplay {...props} prompt={withKeywords} userRole={'student' as const} />);

    expect(screen.getByText(/Syllabus terms to weave in/i)).toBeTruthy();
    expect(screen.getByText('helicase')).toBeTruthy();
  });

  it('leaves them out when a scenario already fills the card', () => {
    render(
      <PromptDisplay
        {...props}
        userRole={'student' as const}
        prompt={makePrompt({ keywords: ['helicase'], scenario: 'A lab sequences a genome.' })}
      />
    );

    expect(screen.queryByText(/Syllabus terms to weave in/i)).toBeNull();
  });

  it('leaves them out in Exam Mode — the terms are assistance', () => {
    render(
      <PromptDisplay {...props} examMode prompt={withKeywords} userRole={'student' as const} />
    );

    expect(screen.queryByText(/Syllabus terms to weave in/i)).toBeNull();
  });

  it('leaves them out in Focus Mode, where the card is deliberately minimal', () => {
    render(
      <PromptDisplay {...props} condensed prompt={withKeywords} userRole={'student' as const} />
    );

    expect(screen.queryByText(/Syllabus terms to weave in/i)).toBeNull();
  });
});
