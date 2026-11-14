import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import PromptDisplay from '../../components/PromptDisplay';
import Editor from '../../components/Editor';
import {
  KEYWORD_HIGHLIGHT_CLASS,
  VERB_HIGHLIGHT_CLASS,
  VERB_TRIGGER_CLASS,
} from '../../utils/renderUtils';
import { FOCUS_SHORT_CLASSES } from '../../utils/cardChrome';
import { Prompt, PromptVerb } from '../../types';

/**
 * An exam paper has no highlights. The question and scenario carry the command
 * verb and syllabus terms in plain type in Exam Mode, and in colour in Coach Mode.
 * The Focus Mode test at the end pins the short-window header classes.
 */

vi.mock('../../services/geminiService', () => ({
  explainOutcomeInContext: vi.fn(),
}));

afterEach(cleanup);

const HIGHLIGHT_CLASSES = [KEYWORD_HIGHLIGHT_CLASS, VERB_HIGHLIGHT_CLASS, VERB_TRIGGER_CLASS];

const highlightCount = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>('*')).filter((el) =>
    HIGHLIGHT_CLASSES.includes(el.className)
  ).length;

const prompt = {
  id: 'p-plain',
  question: 'Outline three benefits of security testing for software.',
  verb: 'OUTLINE' as PromptVerb,
  totalMarks: 3,
  keywords: ['security', 'testing'],
  scenario: 'A team builds a payments app and runs security testing before release.',
  linkedOutcomes: [],
  sampleAnswers: [],
} as unknown as Prompt;

const props = {
  prompt,
  isEnriching: false,
  enrichError: null,
  onVerbClick: vi.fn(),
  onGenerateScenario: vi.fn(),
  onUpdatePrompt: vi.fn(),
  isGeneratingScenario: false,
  generateScenarioError: null,
  courseOutcomes: [],
  onOutcomeClick: vi.fn(),
  userRole: 'user' as const,
  onDismissEnrichError: vi.fn(),
  onRunQualityCheck: vi.fn(),
  onSuggestOutcomes: vi.fn(),
  isSuggestingOutcomes: false,
  fontSize: 18,
  onFontSizeChange: vi.fn(),
};

describe('the question and scenario under Exam Mode', () => {
  it('paints the verb and the syllabus terms in Coach Mode', () => {
    const { container } = render(<PromptDisplay {...props} examMode={false} />);

    expect(highlightCount(container)).toBeGreaterThan(0);
  });

  it('paints no highlights in Exam Mode, and keeps the wording', () => {
    const { container } = render(<PromptDisplay {...props} examMode />);

    expect(highlightCount(container)).toBe(0);
    expect(container.textContent).toContain('Outline three benefits of security testing');
    expect(container.textContent).toContain('A team builds a payments app');
  });
});

describe('Focus Mode short-window classes on the writing card', () => {
  it('compacts the header only in Focus Mode', () => {
    const { container, unmount } = render(
      <Editor value="" onChange={vi.fn()} verb={'EXPLAIN' as PromptVerb} maxBand={6} isFocusMode />
    );
    expect(container.innerHTML).toContain(FOCUS_SHORT_CLASSES.header);
    expect(container.innerHTML).toContain(FOCUS_SHORT_CLASSES.footer);
    unmount();

    const coach = render(
      <Editor value="" onChange={vi.fn()} verb={'EXPLAIN' as PromptVerb} maxBand={6} />
    );
    expect(coach.container.innerHTML).not.toContain(FOCUS_SHORT_CLASSES.header);
    expect(coach.container.innerHTML).not.toContain(FOCUS_SHORT_CLASSES.footer);
  });
});
