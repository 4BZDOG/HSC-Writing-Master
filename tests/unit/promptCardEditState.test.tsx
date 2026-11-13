import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import PromptDisplay from '../../components/PromptDisplay';
import { Prompt, PromptVerb } from '../../types';

/**
 * A curator moves from question to question in the same card. The card is not
 * remounted between them, so its edit state has to be closed and reset by hand
 * when the question changes. Each of these carried over from the question before.
 */

vi.mock('../../services/geminiService', () => ({
  explainOutcomeInContext: vi.fn(),
}));

const makePrompt = (overrides: Partial<Prompt>): Prompt =>
  ({
    id: 'q1',
    question: 'First question?',
    verb: 'ASSESS' as PromptVerb,
    totalMarks: 4,
    keywords: [],
    sampleAnswers: [],
    linkedOutcomes: [],
    ...overrides,
  }) as unknown as Prompt;

const q1 = makePrompt({ id: 'q1', question: 'First question?' });
const q2 = makePrompt({ id: 'q2', question: 'Second question?' });

const propsFor = (prompt: Prompt, onUpdatePrompt = vi.fn()) => ({
  prompt,
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
});

afterEach(cleanup);

const questionEditor = () => screen.queryByRole('textbox', { name: 'Question text' });
const scenarioEditor = () => screen.queryByRole('textbox', { name: 'Scenario text' });

describe('the question editor across questions', () => {
  it('closes an open question editor when the curator moves to another question', () => {
    const { rerender } = render(<PromptDisplay {...propsFor(q1)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Question' }));
    fireEvent.change(questionEditor()!, { target: { value: 'Half-typed' } });

    rerender(<PromptDisplay {...propsFor(q2)} />);

    expect(questionEditor()).toBeNull();
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('Second question?');
  });

  it('opens the next question’s editor with that question’s own text', () => {
    const { rerender } = render(<PromptDisplay {...propsFor(q1)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Question' }));
    fireEvent.change(questionEditor()!, { target: { value: 'Half-typed' } });

    rerender(<PromptDisplay {...propsFor(q2)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Question' }));

    expect((questionEditor() as HTMLTextAreaElement).value).toBe('Second question?');
  });

  it('keeps the editor open when the same question is updated underneath it', () => {
    const { rerender } = render(<PromptDisplay {...propsFor(q1)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Question' }));
    fireEvent.change(questionEditor()!, { target: { value: 'Still typing' } });

    // An enrichment or a save lands on this question while the curator types.
    rerender(<PromptDisplay {...propsFor({ ...q1, scenario: 'Background arrived' })} />);

    expect((questionEditor() as HTMLTextAreaElement).value).toBe('Still typing');
  });

  it('discards the text on Cancel, so the next Edit shows the saved question', () => {
    render(<PromptDisplay {...propsFor(q1)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Question' }));
    fireEvent.change(questionEditor()!, { target: { value: 'Discarded' } });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Question' }));

    expect((questionEditor() as HTMLTextAreaElement).value).toBe('First question?');
  });

  it('will not save an empty question, and says so by disabling the button', () => {
    const onUpdatePrompt = vi.fn();
    render(<PromptDisplay {...propsFor(q1, onUpdatePrompt)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Question' }));
    fireEvent.change(questionEditor()!, { target: { value: '   ' } });

    const save = screen.getByRole('button', { name: /save changes/i }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(onUpdatePrompt).not.toHaveBeenCalled();
  });

  it('still saves a changed question, trimmed', () => {
    const onUpdatePrompt = vi.fn();
    render(<PromptDisplay {...propsFor(q1, onUpdatePrompt)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Question' }));
    fireEvent.change(questionEditor()!, { target: { value: '  Edited question?  ' } });

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(onUpdatePrompt).toHaveBeenCalledWith({ question: 'Edited question?' });
  });

  it('names the question textarea', () => {
    render(<PromptDisplay {...propsFor(q1)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Question' }));
    expect(questionEditor()).toBeTruthy();
  });
});

describe('the scenario editor across questions', () => {
  it('does not carry an open scenario editor, or its text, onto a question with no scenario', () => {
    const onUpdatePrompt = vi.fn();
    const { rerender } = render(<PromptDisplay {...propsFor(q1, onUpdatePrompt)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Scenario' }));
    fireEvent.change(scenarioEditor()!, { target: { value: 'Q1 scenario draft' } });

    rerender(<PromptDisplay {...propsFor(q2, onUpdatePrompt)} />);

    // Both questions have no scenario, so the scenario itself did not change and
    // the old effect never reset the text. Save Scenario must not be reachable.
    expect(scenarioEditor()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save Scenario' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Scenario' }));
    expect((scenarioEditor() as HTMLTextAreaElement).value).toBe('');
    expect(onUpdatePrompt).not.toHaveBeenCalled();
  });

  it('names the scenario textarea', () => {
    render(<PromptDisplay {...propsFor(q1)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Scenario' }));
    expect(scenarioEditor()).toBeTruthy();
  });
});
