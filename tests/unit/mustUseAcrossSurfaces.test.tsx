import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, within } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { WritingMetricsDashboard } from '../../components/WritingMetricsDashboard';
import PromptDisplay from '../../components/PromptDisplay';
import { useWritingMetrics } from '../../hooks/useWritingMetrics';
import type { Prompt, PromptVerb } from '../../types';

/**
 * The same terms, said the same way, wherever a student meets them.
 *
 * The Syllabus Terms panel groups must-use terms apart and marks them. The two
 * other surfaces that list the SAME terms to the SAME student — the metrics
 * dashboard's term tracker and the question card's filler list — showed them as
 * one undifferentiated set, which is the distinction the panel exists to make,
 * unmade twice on the same screen.
 */

vi.mock('../../services/geminiService', () => ({}));

afterEach(cleanup);

const SYLLABUS = {
  dotPointText: 'apply testing methodologies to a software solution',
  subTopicName: 'Testing and debugging',
  topicName: 'Software automation',
};

const prompt = (over: Partial<Prompt> = {}): Prompt =>
  ({
    id: 'p1',
    question: 'Assess automated unit testing against manual ad-hoc testing.',
    verb: 'ASSESS' as PromptVerb,
    totalMarks: 6,
    keywords: ['automated unit testing', 'regression testing', 'manual ad-hoc testing'],
    linkedOutcomes: [],
    sampleAnswers: [],
    isPastHSC: false,
    ...over,
  }) as Prompt;

describe('the metrics hook reports the split its consumers read', () => {
  it('names the must-use terms and counts them apart', () => {
    const { result } = renderHook(() =>
      useWritingMetrics('I relied on automated unit testing.', prompt(), SYLLABUS)
    );
    const stats = result.current.keywordStats;

    expect(stats.mustUse).toEqual(['automated unit testing', 'manual ad-hoc testing']);
    expect(stats.mustUseTotal).toBe(2);
    expect(stats.mustUseUsed).toBe(1);
    // What is still missing, with the terms the question names leading.
    expect(stats.missedInPriority[0]).toBe('manual ad-hoc testing');
    expect(stats.missedMustUse).toEqual(['manual ad-hoc testing']);
  });

  it('reports nothing weighted when there is no syllabus to judge by', () => {
    const { result } = renderHook(() => useWritingMetrics('An answer.', prompt({ question: '' })));
    expect(result.current.keywordStats.mustUseTotal).toBe(0);
  });
});

describe('the metrics dashboard term tracker', () => {
  const renderDashboard = (userAnswer: string) =>
    render(
      <WritingMetricsDashboard
        userAnswer={userAnswer}
        prompt={prompt()}
        syllabus={SYLLABUS}
        onAddWord={() => {}}
      />
    );

  /** The term pills, in the order the tracker renders them. */
  const pillOrder = () =>
    screen
      .getAllByRole('button')
      .map((b) => (b.textContent ?? '').trim())
      .filter((label) => prompt().keywords?.includes(label));

  it('puts the terms the question names at the front of each group', () => {
    renderDashboard('');
    // Nothing used yet, so this is the missing group: must-use terms lead,
    // whatever order the curated list happens to be in.
    expect(pillOrder().slice(0, 2)).toEqual(['automated unit testing', 'manual ad-hoc testing']);
  });

  it('marks a must-use term as one, and a supporting term as not', () => {
    renderDashboard('');
    expect(screen.getByText('automated unit testing').closest('button')).toHaveProperty(
      'title',
      'Named in the question or its syllabus — a must-use term'
    );
    expect(screen.getByText('regression testing').closest('button')).toHaveProperty(
      'title',
      'Supporting term — click to add it to your answer'
    );
  });

  it('counts the two kinds apart', () => {
    renderDashboard('I relied on automated unit testing.');
    expect(screen.getByText('1/2 key · 0/1 more')).toBeTruthy();
  });
});

describe('the question card’s filler list of terms', () => {
  const renderCard = () =>
    render(
      <PromptDisplay
        prompt={prompt({ scenario: '' })}
        syllabus={SYLLABUS}
        isEnriching={false}
        enrichError={null}
        onVerbClick={() => {}}
        onGenerateScenario={() => {}}
        onUpdatePrompt={() => {}}
        isGeneratingScenario={false}
        generateScenarioError={null}
        courseOutcomes={[]}
        onOutcomeClick={() => {}}
        userRole="user"
        onDismissEnrichError={() => {}}
        onRunQualityCheck={() => {}}
        onSuggestOutcomes={() => {}}
        isSuggestingOutcomes={false}
        fontSize={18}
        onFontSizeChange={() => {}}
      />
    );

  it('leads with the must-use terms and marks them', () => {
    renderCard();
    // Scoped to the filler list: the question stem says these words too, and
    // the card renders the stem.
    const heading = screen.getByText(/syllabus terms to weave in/i);
    const list = heading.parentElement as HTMLElement;
    // The chip row is the section's last child; reading it in DOM order is
    // reading it in the order a student does.
    const chips = Array.from(list.lastElementChild?.children ?? []);
    expect(chips.map((chip) => chip.textContent?.trim())).toEqual([
      'automated unit testing',
      'manual ad-hoc testing',
      'regression testing',
    ]);

    // Only the two the question names carry the mark.
    expect(
      within(list)
        .getAllByTitle(/must-use term/i)
        .map((c) => c.textContent?.trim())
    ).toEqual(['automated unit testing', 'manual ad-hoc testing']);
  });

  it('leaves a supporting term unmarked rather than mislabelling it', () => {
    renderCard();
    const heading = screen.getByText(/syllabus terms to weave in/i);
    const list = heading.parentElement as HTMLElement;

    const supporting = within(list).getByText('regression testing');
    expect(supporting).toHaveProperty('title', '');
    expect(supporting.querySelector('svg')).toBeNull();
  });
});
