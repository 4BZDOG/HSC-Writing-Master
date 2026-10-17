import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import PromptSelector from '../../components/PromptSelector';
import { Course, StatePath } from '../../types';

/**
 * The focus picker sits beside the dot point picker and is a single-select
 * Combobox, so it has no "chosen" value to show. Its trigger states how many
 * focus areas are on (the pills beneath say which), and the list marks each one
 * that is on. Before this, the trigger read "All of this syllabus point" with
 * focus areas chosen, because the value it was given matched no option.
 */

vi.mock('../../services/geminiService', () => ({
  parseSyllabusStructure: vi.fn(),
}));

// The picker scrolls the highlighted option into view; jsdom has no layout.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

const FOCUS_AREAS = ['Peer review', 'Version control', 'Automated testing'];

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
            dotPoints: [
              {
                id: 'd1',
                description: 'Explain the practices that support team software.',
                focusAreas: FOCUS_AREAS,
                prompts: [],
              },
            ],
          },
        ],
      },
    ],
  },
];

const baseStatePath: StatePath = {
  courseId: 'c1',
  topicId: 't1',
  subTopicId: 's1',
  dotPointId: 'd1',
};

const noop = vi.fn();

const renderWith = (selectedSubItems?: string[]) =>
  render(
    <PromptSelector
      courses={courses}
      statePath={{ ...baseStatePath, selectedSubItems }}
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

/** The focus picker's trigger, found by the text it is showing. */
const focusTrigger = (text: string): HTMLElement =>
  screen.getByText(text).closest('button') as HTMLElement;

describe('focus picker trigger', () => {
  it('reads "All of this syllabus point" when no focus area is chosen', () => {
    renderWith();
    expect(focusTrigger('All of this syllabus point')).toBeTruthy();
  });

  it('reads "1 focus area" when one is chosen', () => {
    renderWith(['Peer review']);
    expect(focusTrigger('1 focus area')).toBeTruthy();
    expect(screen.queryByText('All of this syllabus point')).toBeNull();
  });

  it('reads the count when several are chosen', () => {
    renderWith(['Peer review', 'Version control']);
    expect(focusTrigger('2 focus areas')).toBeTruthy();
    expect(screen.queryByText('All of this syllabus point')).toBeNull();
  });

  it('still marks each chosen focus area in its list', () => {
    renderWith(['Peer review', 'Version control']);
    fireEvent.click(focusTrigger('2 focus areas'));
    const list = screen.getByRole('listbox');

    // Each option's own label draws a check when it is one of the chosen areas.
    const marked = (area: string) =>
      (within(list).getByText(area).closest('li') as HTMLElement).querySelector('.lucide-check');
    expect(marked('Peer review')).not.toBeNull();
    expect(marked('Version control')).not.toBeNull();
    expect(marked('Automated testing')).toBeNull();
  });
});
