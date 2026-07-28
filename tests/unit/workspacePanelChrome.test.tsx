import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import PromptDisplay from '../../components/PromptDisplay';
import Editor from '../../components/Editor';
import LiveInsights from '../../components/LiveInsights';
import WritingMetricsDashboard from '../../components/WritingMetricsDashboard';
import SampleAnswersAccordion from '../../components/SampleAnswersAccordion';
import { PANEL_SURFACE } from '../../utils/panelStyles';
import { Prompt, PromptVerb } from '../../types';

/**
 * Two pieces of workspace chrome that user testing kept catching.
 *
 * 1. "Writing Prompt" and "Written Response" have to sit on the same line as
 *    each other. The two headers are stretched to a shared height but hold
 *    different things, so anything that centres their content lands the two
 *    headings a few pixels apart — an offset that then moves with zoom and with
 *    every width at which the chrome wraps.
 * 2. Everything below the two cards is reference material of one weight, and
 *    should look it. The live writing stats had drifted onto their own heavier
 *    surface.
 */

vi.mock('../../services/geminiService', () => ({
  explainOutcomeInContext: vi.fn(),
  generateRubricForPrompt: vi.fn(),
}));

vi.mock('../../services/entitlements', () => ({
  isFeatureLocked: () => false,
  requestUpgrade: vi.fn(),
  freeEvalsRemaining: () => Infinity,
}));

afterEach(cleanup);

const prompt = (over: Partial<Prompt> = {}): Prompt =>
  ({
    id: 'p1',
    question: 'Describe the key steps involved in DNA replication.',
    verb: 'DESCRIBE' as PromptVerb,
    totalMarks: 4,
    keywords: ['helicase'],
    sampleAnswers: [],
    ...over,
  }) as unknown as Prompt;

const promptProps = {
  prompt: prompt(),
  isEnriching: false,
  enrichError: null,
  onVerbClick: vi.fn(),
  onGenerateScenario: vi.fn(),
  onUpdatePrompt: vi.fn(),
  isGeneratingScenario: false,
  generateScenarioError: null,
  courseOutcomes: [],
  onOutcomeClick: vi.fn(),
  userRole: 'student' as const,
  onDismissEnrichError: vi.fn(),
  onRunQualityCheck: vi.fn(),
  onSuggestOutcomes: vi.fn(),
  isSuggestingOutcomes: false,
  fontSize: 18,
  onFontSizeChange: vi.fn(),
};

/** The header box a heading sits in, and the rows between the two. */
const headingChain = (heading: HTMLElement): HTMLElement[] => {
  const chain: HTMLElement[] = [];
  let el = heading.parentElement;
  while (el && !el.className.includes('rounded-t-[30px]')) {
    chain.push(el);
    el = el.parentElement;
  }
  if (el) chain.push(el);
  return chain;
};

describe('the two card headings sit on the same line', () => {
  it('pins the question card header to the top, never centred', () => {
    const { getByText } = render(<PromptDisplay {...promptProps} />);
    const chain = headingChain(getByText('Writing Prompt'));

    expect(chain.length).toBeGreaterThan(0);
    for (const el of chain) {
      expect(el.className).not.toMatch(/(^|\s)items-center/);
    }
    expect(chain[chain.length - 1].className).toMatch(/items-start/);
  });

  it('pins the writing card header to the top in exactly the same way', () => {
    const { getByText } = render(
      <Editor value="" onChange={vi.fn()} verb={'DESCRIBE' as PromptVerb} writingMode="coach" />
    );
    const chain = headingChain(getByText('Written Response'));

    expect(chain.length).toBeGreaterThan(0);
    for (const el of chain) {
      expect(el.className).not.toMatch(/(^|\s)items-center/);
    }
    expect(chain[chain.length - 1].className).toMatch(/items-start/);
  });

  it('gives both title blocks the same step down from the top', () => {
    const { getByText: promptText } = render(<PromptDisplay {...promptProps} />);
    const { getByText: editorText } = render(
      <Editor value="" onChange={vi.fn()} verb={'DESCRIBE' as PromptVerb} writingMode="coach" />
    );

    // The heading's own block: whatever padding lifts it off the top of the
    // card has to be identical on both, or the alignment is undone by it.
    const promptBlock = promptText('Writing Prompt').closest('div');
    const editorBlock = editorText('Written Response').closest('div');
    const padding = (el: Element | null) => (el?.className.match(/\bpt-[\d.]+\b/) ?? ['none'])[0];

    expect(padding(promptBlock)).toBe(padding(editorBlock));
  });
});

describe('the panels below the cards share one surface', () => {
  const surfaceOf = (container: HTMLElement) => container.firstElementChild?.className ?? '';

  it('dresses the live writing stats like every other panel', () => {
    const { container } = render(
      <WritingMetricsDashboard userAnswer="" prompt={prompt()} onAddWord={vi.fn()} />
    );
    expect(surfaceOf(container)).toContain(PANEL_SURFACE);
  });

  it('dresses Live Insights the same way', () => {
    const { container } = render(
      <LiveInsights
        insights={[{ id: 'i1', tone: 'info', title: 'Keep going', detail: 'Add a second point.' }]}
      />
    );
    expect(surfaceOf(container)).toContain(PANEL_SURFACE);
  });

  it('dresses the exemplars the same way', () => {
    const { container } = render(
      <SampleAnswersAccordion
        prompt={prompt()}
        onSampleAnswerGenerated={vi.fn()}
        onUseSampleAnswer={vi.fn()}
        onDeleteSampleAnswer={vi.fn()}
        onUpdateSampleAnswer={vi.fn()}
        userRole="student"
      />
    );
    expect(surfaceOf(container)).toContain(PANEL_SURFACE);
  });
});
