import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import PromptSelector from '../../components/PromptSelector';
import { Course, Prompt, PromptVerb, StatePath } from '../../types';

/**
 * The Past HSC navigator: a switch above the syllabus picker that, when on,
 * lists only the topics, sub-topics and syllabus points holding a past HSC
 * question, and narrows the question list to match. The fixture has one topic
 * with a 2023 paper question, one with a 2019 paper question, and one with
 * practice questions only.
 */

vi.mock('../../services/geminiService', () => ({
  parseSyllabusStructure: vi.fn(),
}));

// The picker scrolls the highlighted option into view; jsdom has no layout.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  // The filter is remembered per course, so one test's toggle must not reach the next.
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const makePrompt = (id: string, question: string, extra: Partial<Prompt> = {}): Prompt =>
  ({
    id,
    question,
    verb: 'ASSESS' as PromptVerb,
    totalMarks: 8,
    ...extra,
  }) as Prompt;

const makeCourse = (topics: Course['topics']): Course => ({
  id: 'c1',
  name: 'Software Engineering',
  outcomes: [],
  topics,
});

const fixtureCourse = makeCourse([
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
            description: 'Explore the applications of web programming.',
            prompts: [
              makePrompt('p-hsc-2023', 'Assess the impact of emerging technologies.', {
                isPastHSC: true,
                hscYear: 2023,
                hscQuestionNumber: '12',
              }),
              makePrompt('p-practice', 'Assess the value of automated testing.'),
            ],
          },
        ],
      },
    ],
  },
  {
    id: 't2',
    name: 'Data Structures',
    subTopics: [
      {
        id: 's2',
        name: 'Collections',
        dotPoints: [
          {
            id: 'd2',
            description: 'Compare the trade-offs of common collections.',
            prompts: [makePrompt('p-practice-2', 'Assess the trade-offs of hash tables.')],
          },
        ],
      },
    ],
  },
  {
    id: 't3',
    name: 'Networks',
    subTopics: [
      {
        id: 's3',
        name: 'Protocols',
        dotPoints: [
          {
            id: 'd3',
            description: 'Describe the layers of a network protocol.',
            prompts: [
              makePrompt('p-hsc-2019', 'Assess the role of open standards.', {
                isPastHSC: true,
                hscYear: 2019,
              }),
            ],
          },
        ],
      },
    ],
  },
]);

const statePath: StatePath = {
  courseId: 'c1',
  topicId: 't1',
  subTopicId: 's1',
  dotPointId: 'd1',
};

const noop = vi.fn();

const renderNavigator = (courses: Course[] = [fixtureCourse], path: StatePath = statePath) =>
  render(
    <PromptSelector
      courses={courses}
      statePath={path}
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

/** Opens the picker whose trigger shows `current`, and returns its open list. */
const openPicker = (current: string): HTMLElement => {
  const trigger = screen.getByText(current).closest('button') as HTMLElement;
  fireEvent.click(trigger);
  return screen.getByRole('listbox');
};

/** A press outside the list is how the picker closes; a click on the trigger would toggle it back open. */
const closePicker = () => fireEvent.mouseDown(document.body);

const pastHscSwitch = () => screen.getByRole('button', { name: 'Past HSC' });

describe('past HSC navigator', () => {
  it('hides topics with no past HSC question when on, and restores them when off', () => {
    renderNavigator();

    // Off: every topic in the year is offered.
    let list = openPicker('Programming for the Web');
    expect(within(list).getByText('Data Structures')).toBeTruthy();
    expect(within(list).getByText('Networks')).toBeTruthy();
    closePicker();

    fireEvent.click(pastHscSwitch());
    expect(pastHscSwitch().getAttribute('aria-pressed')).toBe('true');

    list = openPicker('Programming for the Web');
    expect(within(list).queryByText('Data Structures')).toBeNull();
    expect(within(list).getByText('Networks')).toBeTruthy();
    // The count says what each kept topic holds.
    const networks = within(list).getByText('Networks').closest('li') as HTMLElement;
    expect(within(networks).getByText('1 past HSC')).toBeTruthy();
    closePicker();

    fireEvent.click(pastHscSwitch());
    expect(pastHscSwitch().getAttribute('aria-pressed')).toBe('false');

    list = openPicker('Programming for the Web');
    expect(within(list).getByText('Data Structures')).toBeTruthy();
  });

  it('keeps the selected topic on screen even when it has no matching question', () => {
    // Pointed at a topic with only practice questions, the filter must not
    // take the reader's place away from them.
    renderNavigator([fixtureCourse], {
      ...statePath,
      topicId: 't2',
      subTopicId: 's2',
      dotPointId: 'd2',
    });

    fireEvent.click(pastHscSwitch());
    const list = openPicker('Data Structures');

    const selected = within(list).getByText('Data Structures').closest('li') as HTMLElement;
    expect(within(selected).getByText('no past HSC')).toBeTruthy();
    expect(within(list).getByText('Networks')).toBeTruthy();
    expect(within(list).getByText('Programming for the Web')).toBeTruthy();
  });

  it('narrows to the chosen years, and still lists the selected topic beside them', () => {
    renderNavigator();

    fireEvent.click(pastHscSwitch());
    fireEvent.click(screen.getByRole('button', { name: '2019' }));
    expect(screen.getByRole('button', { name: '2019' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'All years' }).getAttribute('aria-pressed')).toBe(
      'false'
    );

    const list = openPicker('Programming for the Web');
    // The 2023 topic is the reader's place, so it stays, and says it holds nothing from 2019.
    const selected = within(list).getByText('Programming for the Web').closest('li') as HTMLElement;
    expect(within(selected).getByText('no past HSC')).toBeTruthy();
    expect(within(list).getByText('Networks')).toBeTruthy();
    expect(within(list).queryByText('Data Structures')).toBeNull();
  });

  it('shows only the past HSC questions in the question list, and restores them when off', () => {
    renderNavigator();

    fireEvent.click(pastHscSwitch());
    let list = openPicker('Select question…');
    expect(within(list).getByText(/emerging technologies/i)).toBeTruthy();
    expect(within(list).queryByText(/automated testing/i)).toBeNull();
    closePicker();

    fireEvent.click(pastHscSwitch());
    list = openPicker('Select question…');
    expect(within(list).getByText(/automated testing/i)).toBeTruthy();
  });

  it('remembers the switch and the years for the course on the next visit', () => {
    const first = renderNavigator();
    fireEvent.click(pastHscSwitch());
    fireEvent.click(screen.getByRole('button', { name: '2023' }));
    first.unmount();

    renderNavigator();
    expect(pastHscSwitch().getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '2023' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('is not offered for a course with no past HSC question in the year on screen', () => {
    const practiceOnly = makeCourse([
      {
        id: 'p1',
        name: 'Practice Only',
        subTopics: [
          {
            id: 'ps1',
            name: 'Basics',
            dotPoints: [
              {
                id: 'pd1',
                description: 'Explain a basic idea.',
                prompts: [makePrompt('pp1', 'Explain the basic idea.')],
              },
            ],
          },
        ],
      },
    ]);
    renderNavigator([practiceOnly], {
      courseId: 'c1',
      topicId: 'p1',
      subTopicId: 'ps1',
      dotPointId: 'pd1',
    });

    expect(screen.queryByRole('button', { name: 'Past HSC' })).toBeNull();
  });
});

/**
 * The question list only gets its refinement bar at seven questions, so these
 * tests use a dot point long enough to have one: six practice questions and two
 * past papers, from 2019 and 2023.
 */
describe('past HSC navigator and the question list', () => {
  const longCourse = makeCourse([
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
              description: 'Explore the applications of web programming.',
              prompts: [
                makePrompt('pr1', 'Identify two input devices.'),
                makePrompt('pr2', 'Outline the fetch-execute cycle.'),
                makePrompt('pr3', 'Describe the role of a compiler.'),
                makePrompt('pr4', 'Explain how caching reduces latency.'),
                makePrompt('pr5', 'Analyse the impact of automation.'),
                makePrompt('pr6', 'Evaluate the merits of agile delivery.'),
                makePrompt('ph23', 'Assess the impact of emerging technologies.', {
                  isPastHSC: true,
                  hscYear: 2023,
                }),
                makePrompt('ph19', 'Assess the role of open standards.', {
                  isPastHSC: true,
                  hscYear: 2019,
                }),
              ],
            },
          ],
        },
      ],
    },
  ]);

  const longPath: StatePath = { courseId: 'c1', topicId: 't1', subTopicId: 's1', dotPointId: 'd1' };

  it('turns the navigator off when the question bar chip is switched off', () => {
    renderNavigator([longCourse], longPath);

    fireEvent.click(pastHscSwitch());
    fireEvent.click(screen.getByRole('button', { name: /refine/i }));
    const chip = screen.getByRole('button', { name: /past hsc only/i });
    expect(chip.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(chip);

    expect(pastHscSwitch().getAttribute('aria-pressed')).toBe('false');
    expect(
      screen.getByRole('button', { name: /past hsc only/i }).getAttribute('aria-pressed')
    ).toBe('false');
  });

  it('narrows the question list to the chosen year', () => {
    renderNavigator([longCourse], longPath);

    fireEvent.click(pastHscSwitch());
    fireEvent.click(screen.getByRole('button', { name: '2019' }));

    const list = openPicker('Select question…');
    expect(within(list).getByText(/open standards/i)).toBeTruthy();
    expect(within(list).queryByText(/emerging technologies/i)).toBeNull();
    expect(within(list).queryByText(/input devices/i)).toBeNull();
  });
});
