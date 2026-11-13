import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import PromptDisplay from '../../components/PromptDisplay';
import { Prompt, PromptVerb } from '../../types';

/**
 * The prompt card's curator tools, the mark count, and the Focus Mode scenario
 * toggle: what a keyboard user can reach, and what each control is called.
 */

vi.mock('../../services/geminiService', () => ({
  explainOutcomeInContext: vi.fn(),
}));

const makePrompt = (overrides: Partial<Prompt> = {}): Prompt =>
  ({
    id: 'q1',
    question: 'Assess the impact of emerging technologies on software development.',
    verb: 'ASSESS' as PromptVerb,
    totalMarks: 4,
    keywords: [],
    sampleAnswers: [],
    linkedOutcomes: [],
    scenario: 'A software house is deciding how to adopt a new framework.',
    ...overrides,
  }) as unknown as Prompt;

const propsFor = (prompt: Prompt) => ({
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
  userRole: 'teacher' as const,
  onDismissEnrichError: vi.fn(),
  onRunQualityCheck: vi.fn(),
  onSuggestOutcomes: vi.fn(),
  isSuggestingOutcomes: false,
  fontSize: 18,
  onFontSizeChange: vi.fn(),
});

beforeEach(() => {
  // The Focus Mode scenario choice is remembered per browser; start each test from
  // the default, which is folded.
  window.localStorage.clear();
});

afterEach(cleanup);

describe('the curator tools show under keyboard focus, not only under the pointer', () => {
  it('reveals the question tools when one of them takes focus', () => {
    render(<PromptDisplay {...propsFor(makePrompt())} />);
    const wrapper = screen.getByRole('button', { name: 'Edit Question' }).parentElement!;

    // `sm:` on both, so the rule that hides them at a desktop width is the one
    // that is overridden: a bare `focus-within:` would lose to `sm:opacity-0`.
    expect(wrapper.className).toContain('sm:opacity-0');
    expect(wrapper.className).toContain('sm:focus-within:opacity-100');
  });

  it('reveals the scenario tools when one of them takes focus', () => {
    render(<PromptDisplay {...propsFor(makePrompt())} />);
    const wrapper = screen.getByRole('button', { name: 'Edit Scenario' }).parentElement!;

    expect(wrapper.className).toContain('sm:opacity-0');
    expect(wrapper.className).toContain('sm:focus-within:opacity-100');
  });
});

describe('the mark count', () => {
  it('says "1 mark" for a one-mark question, in the corner bar and on the phone line', () => {
    render(<PromptDisplay {...propsFor(makePrompt({ totalMarks: 1 }))} />);

    // Both places state the marks: the corner bar from `sm`, the meta line below it.
    expect(screen.getAllByText('1 mark')).toHaveLength(2);
    expect(screen.queryByText('1 marks')).toBeNull();
    expect(screen.queryByText('1 Marks')).toBeNull();
  });

  it('says "3 marks" in lower case, as the rest of the page does', () => {
    render(<PromptDisplay {...propsFor(makePrompt({ totalMarks: 3 }))} />);

    expect(screen.getAllByText('3 marks')).toHaveLength(2);
    expect(screen.queryByText('3 Marks')).toBeNull();
  });
});

describe('the icon-only controls are named as their tooltips say', () => {
  it('gives each one an accessible name that matches its title', () => {
    render(<PromptDisplay {...propsFor(makePrompt())} />);

    const controls = [
      screen.getByRole('button', { name: /run quality check/i }),
      screen.getByRole('button', { name: 'Edit Question' }),
      screen.getByRole('button', { name: 'Edit Scenario' }),
      screen.getByRole('button', { name: 'Add Scenario Image' }),
    ];
    for (const control of controls) {
      expect(control.getAttribute('aria-label')).toBeTruthy();
      expect(control.getAttribute('aria-label')).toBe(control.getAttribute('title'));
    }
  });
});

describe('the Focus Mode scenario toggle', () => {
  const toggleNamed = (name: RegExp | string) => screen.getByRole('button', { name });

  it('names the region it controls only while that region is in the page', () => {
    render(<PromptDisplay {...propsFor(makePrompt())} condensed />);

    // Folded: the scenario region is not rendered, so there is nothing to name.
    const folded = toggleNamed('Show context scenario');
    expect(folded.hasAttribute('aria-controls')).toBe(false);

    fireEvent.click(folded);

    const open = toggleNamed('Hide context scenario');
    const regionId = open.getAttribute('aria-controls');
    expect(regionId).toBeTruthy();
    expect(document.getElementById(regionId!)).not.toBeNull();
  });
});
