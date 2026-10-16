import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { CourseOutcome, Prompt, PromptVerb } from '../../types';
import { getCommandTermInfo, getRecommendedTime } from '../../data/commandTerms';

/**
 * The question card's reading size lives in the heading's top-right corner, not in
 * the footer. The footer is the row that ran out of width in two columns (an
 * outcome chip was clipped to "S…"), and in Focus Mode it is not drawn at all when
 * no outcome is linked, which left the reading size with it. In the header it is
 * reachable in both layouts and in Exam Mode, and it still drives the one shared
 * size the sample answers read.
 */

vi.mock('../../services/geminiService', () => ({
  explainOutcomeInContext: vi.fn(),
}));

import PromptDisplay from '../../components/PromptDisplay';

afterEach(cleanup);

const outcomes: CourseOutcome[] = [
  { code: 'SE-12-01', description: 'Justifies the selection of software development approaches.' },
];

const prompt = {
  id: 'p1',
  question: 'Assess the impact of emerging technologies on software development.',
  verb: 'ASSESS' as PromptVerb,
  totalMarks: 8,
  keywords: [],
  sampleAnswers: [],
  linkedOutcomes: ['SE-12-01'],
} as unknown as Prompt;

const baseProps = () => ({
  prompt,
  isEnriching: false,
  enrichError: null,
  onVerbClick: vi.fn(),
  onGenerateScenario: vi.fn(),
  onUpdatePrompt: vi.fn(),
  isGeneratingScenario: false,
  generateScenarioError: null,
  courseOutcomes: outcomes,
  onOutcomeClick: vi.fn(),
  userRole: 'user' as const,
  onDismissEnrichError: vi.fn(),
  onRunQualityCheck: vi.fn(),
  onSuggestOutcomes: vi.fn(),
  isSuggestingOutcomes: false,
  fontSize: 18,
  onFontSizeChange: vi.fn(),
});

const zoomGroup = () => screen.getByRole('group', { name: 'Reading size' });

describe('the reading size in the question card header', () => {
  it('sits in the header, beside the title and not in the footer', () => {
    render(<PromptDisplay {...baseProps()} />);

    const header = screen.getByText('Writing Prompt').closest('[class*="rounded-t-"]');
    expect(header?.contains(zoomGroup())).toBe(true);

    // The footer holds the brief button, the chips and the flag, and no zoom.
    const footer = screen
      .getByRole('button', { name: /read before you write/i })
      .closest('[class*="rounded-b-"]') as HTMLElement;
    expect(within(footer).queryByRole('button', { name: /reading size/i })).toBeNull();
    expect(within(footer).getByRole('button', { name: /flag this question/i })).toBeTruthy();
  });

  it('shows the current size and steps it by two through the shared handler', () => {
    const props = baseProps();
    render(<PromptDisplay {...props} fontSize={20} />);

    expect(within(zoomGroup()).getByText('20')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Increase reading size' }));
    expect(props.onFontSizeChange).toHaveBeenLastCalledWith(22);
    fireEvent.click(screen.getByRole('button', { name: 'Decrease reading size' }));
    expect(props.onFontSizeChange).toHaveBeenLastCalledWith(18);
  });

  it('stops at the ends of the range instead of sending a size the card cannot show', () => {
    const smallest = render(<PromptDisplay {...baseProps()} fontSize={12} />);
    expect(
      (screen.getByRole('button', { name: 'Decrease reading size' }) as HTMLButtonElement).disabled
    ).toBe(true);
    smallest.unmount();

    render(<PromptDisplay {...baseProps()} fontSize={48} />);
    expect(
      (screen.getByRole('button', { name: 'Increase reading size' }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it('keeps both buttons 44px on a phone', () => {
    render(<PromptDisplay {...baseProps()} />);
    for (const name of ['Decrease reading size', 'Increase reading size']) {
      const button = screen.getByRole('button', { name });
      expect(button.className).toContain('max-sm:h-11');
      expect(button.className).toContain('max-sm:w-11');
    }
  });

  it('is still there in Exam Mode and in Focus Mode with nothing linked', () => {
    const { unmount } = render(<PromptDisplay {...baseProps()} examMode />);
    expect(zoomGroup()).toBeTruthy();
    unmount();

    // Focus Mode with no outcomes draws no footer at all; the control used to go
    // with it.
    render(<PromptDisplay {...baseProps()} condensed prompt={{ ...prompt, linkedOutcomes: [] }} />);
    expect(screen.queryByRole('button', { name: /flag this question/i })).toBeNull();
    expect(zoomGroup()).toBeTruthy();
  });
});

describe('the band chip in the question card header', () => {
  it('opens the verb guide, so a touch screen can reach what the tooltip says', () => {
    const props = baseProps();
    render(<PromptDisplay {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /band 5 is the target/i }));
    expect(props.onVerbClick).toHaveBeenCalledTimes(1);
  });

  it('is plain text in Exam Mode, where the guide is assistance', () => {
    render(<PromptDisplay {...baseProps()} examMode />);
    expect(screen.queryByRole('button', { name: /is the target/i })).toBeNull();
    expect(screen.getByText(/Band 5/)).toBeTruthy();
  });
});

describe('the suggested time in the header', () => {
  it('is the figure the writing metrics strip and the verb guide use', () => {
    const minutes = Math.round(
      getRecommendedTime(prompt.totalMarks, getCommandTermInfo(prompt.verb)) / 60
    );
    render(<PromptDisplay {...baseProps()} />);
    // Hidden below 2xl by CSS, but always in the document.
    expect(screen.getByText(new RegExp(`${minutes} min`))).toBeTruthy();
  });
});
