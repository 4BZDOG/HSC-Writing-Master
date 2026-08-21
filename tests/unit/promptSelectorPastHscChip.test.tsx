import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import PromptSelector from '../../components/PromptSelector';
import { Course, Prompt, PromptVerb, StatePath } from '../../types';

/**
 * A past HSC question and a generated practice question read identically in the
 * question picker, which is the one place a teacher chooses between them. The
 * provenance chip says which paper a question came from — the year matters,
 * because "have we already used the 2023 paper" is a real question.
 */

vi.mock('../../services/geminiService', () => ({
  parseSyllabusStructure: vi.fn(),
}));

// The picker scrolls the highlighted option into view; jsdom has no layout.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

const makePrompt = (id: string, question: string, extra: Partial<Prompt> = {}): Prompt =>
  ({
    id,
    question,
    verb: 'ASSESS' as PromptVerb,
    totalMarks: 8,
    ...extra,
  }) as Prompt;

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
                description: 'Explore the applications of web programming.',
                prompts: [
                  makePrompt('p-hsc', 'Assess the impact of emerging technologies.', {
                    isPastHSC: true,
                    hscYear: 2023,
                    hscQuestionNumber: '12',
                  }),
                  makePrompt('p-hsc-old', 'Assess the role of open standards.', {
                    isPastHSC: true,
                    hscYear: 2019,
                  }),
                  makePrompt('p-practice', 'Assess the value of automated testing.'),
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];

const statePath: StatePath = {
  courseId: 'c1',
  topicId: 't1',
  subTopicId: 's1',
  dotPointId: 'd1',
};

const noop = vi.fn();

const props = {
  courses,
  statePath,
  onPathChange: noop,
  onAddCourse: noop,
  onToggleCourseStatus: noop,
  onAddSubTopic: noop,
  onGeneratePrompt: noop,
  onManualEntry: noop,
  onEditOutcomes: noop,
  onOpenDataManager: noop,
  onRenameItem: noop,
  onDeleteItem: noop,
  onAddTopicFromSyllabus: noop,
  onAddTopicWithContent: noop,
  onGenerateDotPoints: noop,
  onImportTopic: noop,
  onImportSyllabus: noop,
  newlyAddedIds: new Set<string>(),
  userRole: 'teacher' as const,
};

const openQuestionList = () => {
  const trigger = screen.getByText('Select Question...');
  fireEvent.click(trigger.closest('button') as HTMLElement);
  return screen.getByRole('listbox');
};

describe('past HSC chip in the question picker', () => {
  it('names the paper and question number a question came from', () => {
    render(<PromptSelector {...props} />);
    const list = openQuestionList();

    const option = within(list).getByText(/emerging technologies/i).closest('li') as HTMLElement;
    expect(within(option).getByText('HSC 2023 · Q12')).toBeTruthy();
  });

  it('labels a paper with no recorded question number by year alone', () => {
    render(<PromptSelector {...props} />);
    const list = openQuestionList();

    const option = within(list).getByText(/open standards/i).closest('li') as HTMLElement;
    expect(within(option).getByText('HSC 2019')).toBeTruthy();
  });

  it('leaves a practice question unlabelled', () => {
    render(<PromptSelector {...props} />);
    const list = openQuestionList();

    const option = within(list).getByText(/automated testing/i).closest('li') as HTMLElement;
    expect(within(option).queryByText(/HSC/)).toBeNull();
  });
});

/**
 * The navigator is the app's primary navigation and had one `aria-` attribute in
 * 1544 lines — no landmark, no list, and no name on any of its five steps. Worse,
 * the only place the word "Course" appeared was the step header, which is drawn
 * only while the level is UNCHOSEN: pick a course and the trigger reads
 * "Software Engineering, button" with nothing anywhere saying what that is.
 */
describe('the navigator has a shape a screen reader can read', () => {
  it('is a named landmark holding a list of five steps', () => {
    render(<PromptSelector {...props} />);

    const nav = screen.getByRole('navigation', { name: /syllabus navigator/i });
    // `role="list"` rather than an `<ol>`: it keeps the DOM and the CSS as they
    // were, and it survives `list-style: none`, which Safari's accessibility
    // tree otherwise strips list semantics for.
    const list = within(nav).getByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
  });

  it('names every step by its level and its state', () => {
    render(<PromptSelector {...props} />);

    // The four chosen levels each say which rung they are and what is on it.
    expect(
      screen.getByRole('group', { name: 'Course — chosen: Software Engineering' })
    ).toBeTruthy();
    expect(
      screen.getByRole('group', { name: 'Topic — chosen: Programming for the Web' })
    ).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Sub-Topic — chosen: Web Systems' })).toBeTruthy();
    expect(screen.getByRole('group', { name: /^Syllabus Content — chosen: / })).toBeTruthy();
    // …and the one still to do says so rather than saying nothing.
    expect(screen.getByRole('group', { name: 'Question — current step' })).toBeTruthy();
    expect(screen.getAllByRole('group')).toHaveLength(5);
  });

  it('says a step is unreachable rather than leaving it silent', () => {
    // A dot point with no questions yet: the empty state says so on screen, and
    // now the step's own name says so too.
    const bare = JSON.parse(JSON.stringify(courses)) as Course[];
    bare[0].topics[0].subTopics[0].dotPoints[0].prompts = [];
    render(<PromptSelector {...props} courses={bare} />);

    expect(screen.getByRole('group', { name: 'Question — none available yet' })).toBeTruthy();
  });

  it('no longer hides the rail’s meaning in a title on a div', () => {
    render(<PromptSelector {...props} />);

    // A `title` on a non-interactive `<div>` is not an accessible name: it is
    // unreachable by keyboard and absent on touch. What it said now lives in
    // each step's name, so the rail is decorative.
    expect(screen.queryByTitle('Step complete')).toBeNull();
    expect(screen.queryByTitle('Current step')).toBeNull();
  });
});
