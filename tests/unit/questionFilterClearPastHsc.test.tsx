import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import PromptSelector from '../../components/PromptSelector';
import { Course, Prompt, PromptVerb, StatePath } from '../../types';

/**
 * Clear in the refine bar puts the questions back. It must not also switch off
 * the Past HSC navigator, which the same bar mirrors as its Past HSC switch:
 * with the navigator on, that switch is the navigator's state, so Clear leaves
 * it alone and does not offer itself for it alone.
 */

vi.mock('../../services/geminiService', () => ({
  parseSyllabusStructure: vi.fn(),
}));

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(cleanup);

const makePrompt = (
  id: string,
  question: string,
  verb: PromptVerb,
  totalMarks: number,
  extra: Partial<Prompt> = {}
): Prompt => ({ id, question, verb, totalMarks, ...extra }) as Prompt;

// Eight questions under one dot point, varying in marks so the length slider
// exists, with one past paper question.
const prompts: Prompt[] = [
  makePrompt('p1', 'Identify two input devices.', 'IDENTIFY', 2),
  makePrompt('p2', 'Outline the fetch-execute cycle.', 'OUTLINE', 3),
  makePrompt('p3', 'Describe the role of a compiler.', 'DESCRIBE', 4),
  makePrompt('p4', 'Explain how caching reduces latency.', 'EXPLAIN', 5),
  makePrompt('p5', 'Analyse the impact of automation.', 'ANALYSE', 6),
  makePrompt('p6', 'Assess the value of automated testing.', 'ASSESS', 8, {
    isPastHSC: true,
    hscYear: 2023,
  } as Partial<Prompt>),
  makePrompt('p7', 'Evaluate the merits of agile delivery.', 'EVALUATE', 9),
  makePrompt('p8', 'Evaluate the security of open standards.', 'EVALUATE', 9),
];

const courses: Course[] = [
  {
    id: 'c1',
    name: 'Software Engineering',
    outcomes: [],
    topics: [
      {
        id: 't1',
        name: 'Programming for the Web',
        subTopics: [
          {
            id: 's1',
            name: 'Web Systems',
            dotPoints: [{ id: 'd1', description: 'Explore web programming.', prompts }],
          },
        ],
      },
    ],
  },
];

const statePath: StatePath = { courseId: 'c1', topicId: 't1', subTopicId: 's1', dotPointId: 'd1' };

const noop = vi.fn();

const renderPicker = () =>
  render(
    <PromptSelector
      courses={courses}
      statePath={statePath}
      onPathChange={noop}
      onAddCourse={noop}
      onToggleCourseStatus={noop}
      onAddSubTopic={noop}
      onGeneratePrompt={noop}
      onManualEntry={noop}
      onEditOutcomes={noop}
      onOpenDataManager={noop}
      onRenameItem={noop}
      onDeleteItem={noop}
      onAddTopicFromSyllabus={noop}
      onAddTopicWithContent={noop}
      onGenerateDotPoints={noop}
      onImportTopic={noop}
      onImportSyllabus={noop}
      newlyAddedIds={new Set<string>()}
      userRole="teacher"
    />
  );

const pastHscSwitch = () => screen.getByRole('button', { name: 'Past HSC' });
const expand = () => fireEvent.click(screen.getByRole('button', { name: /refine/i }));
const clearButton = () => screen.queryByRole('button', { name: /^clear$/i });
const lengthSlider = () =>
  screen.getByRole('slider', { name: /length, highest/i }) as HTMLInputElement;

describe('Clear and the Past HSC navigator', () => {
  it('does not offer Clear for the navigator alone', () => {
    renderPicker();
    fireEvent.click(pastHscSwitch());
    expand();

    expect(pastHscSwitch().getAttribute('aria-pressed')).toBe('true');
    expect(clearButton()).toBeNull();
  });

  it('clears the other filters but keeps the navigator on', () => {
    renderPicker();
    fireEvent.click(pastHscSwitch());
    expand();
    fireEvent.change(lengthSlider(), { target: { value: '2' } });
    expect(clearButton()).not.toBeNull();

    fireEvent.click(clearButton() as HTMLElement);

    expect(pastHscSwitch().getAttribute('aria-pressed')).toBe('true');
    expect(clearButton()).toBeNull();
    const refine = screen.getByRole('button', { name: /refine/i });
    expect(within(refine).getByText('1 of 8 shown')).toBeTruthy();
  });
});
