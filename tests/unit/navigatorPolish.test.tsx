import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import Combobox from '../../components/Combobox';
import PromptSelector from '../../components/PromptSelector';
import { Course, Prompt, PromptVerb, StatePath } from '../../types';

/**
 * The syllabus navigator's second look.
 *
 * Each answered step used to be a tinted card holding a tinted control — five
 * of them, blue to amber — so the steps already answered outshouted the one
 * still open, a stack of answers did not say which question each answered, and
 * the only count anywhere was on sub-topics. These pin what replaced that.
 */

vi.mock('../../services/geminiService', () => ({ parseSyllabusStructure: vi.fn() }));
vi.mock('../../services/responseService', () => ({
  fetchMyAttempts: vi.fn().mockResolvedValue(new Map()),
}));

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.scrollTo = vi.fn();
});

afterEach(cleanup);

describe('Combobox quiet appearance', () => {
  const options = [{ id: 'a', label: 'Heredity' }];

  it('keeps a chosen value on a neutral surface, not a wash of its colour', () => {
    render(
      <Combobox
        options={options}
        value="a"
        onChange={vi.fn()}
        label={null}
        color="purple"
        appearance="quiet"
      />
    );
    const trigger = screen.getByRole('button');
    expect(trigger.className).not.toContain('bg-purple-500/10');
  });

  it('still washes by default, so other pickers are unchanged', () => {
    render(<Combobox options={options} value="a" onChange={vi.fn()} label={null} color="purple" />);
    expect(screen.getByRole('button').className).toContain('bg-purple-500/10');
  });

  it('names the level once a value is chosen, and not before', () => {
    const { rerender } = render(
      <Combobox options={options} value="" onChange={vi.fn()} label={null} caption="Topic" />
    );
    expect(screen.queryByText('Topic')).toBeNull();
    rerender(
      <Combobox options={options} value="a" onChange={vi.fn()} label={null} caption="Topic" />
    );
    expect(screen.getByText('Topic')).toBeTruthy();
  });
});

const prompt = (id: string): Prompt =>
  ({ id, question: `Question ${id}`, verb: 'EXPLAIN' as PromptVerb, totalMarks: 5 }) as Prompt;

const courses: Course[] = [
  {
    id: 'c1',
    name: 'HSC Biology',
    outcomes: [],
    topics: [
      {
        id: 't1',
        name: 'Heredity',
        subTopics: [
          {
            id: 's1',
            name: 'DNA',
            dotPoints: [
              {
                id: 'd1',
                description: 'Model DNA replication.',
                prompts: [prompt('p1'), prompt('p2')],
              },
              { id: 'd2', description: 'Model protein synthesis.', prompts: [] },
            ],
          },
          {
            id: 's2',
            name: 'Inheritance',
            dotPoints: [{ id: 'd3', description: 'x', prompts: [] }],
          },
        ],
      },
    ],
  },
] as Course[];

const noop = vi.fn();
const baseProps = {
  courses,
  onPathChange: noop,
  onAddCourse: noop,
  onRequestCourse: noop,
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
  userRole: 'user' as const,
};

const renderAt = (statePath: StatePath) =>
  render(<PromptSelector {...baseProps} statePath={statePath} />);

const openPicker = (name: RegExp) => {
  fireEvent.click(screen.getByRole('button', { name }));
  return within(screen.getByRole('listbox'));
};

describe('PromptSelector', () => {
  it('says how many sub-topics each topic holds', () => {
    renderAt({ courseId: 'c1' });
    expect(openPicker(/select topic/i).getByText('2 sub-topics')).toBeTruthy();
  });

  it('says where the questions are, and where there are none yet', () => {
    renderAt({ courseId: 'c1', topicId: 't1' });
    const list = openPicker(/select sub-topic/i);
    expect(list.getByText('2 questions')).toBeTruthy();
    expect(list.getByText('No questions yet')).toBeTruthy();
  });

  it('counts questions on each syllabus point', () => {
    renderAt({ courseId: 'c1', topicId: 't1', subTopicId: 's1' });
    const list = openPicker(/select dot point/i);
    expect(list.getByText(/^2 questions/)).toBeTruthy();
    expect(list.getByText(/^No questions yet/)).toBeTruthy();
  });

  it('shows a chosen syllabus point by its statement alone', () => {
    // The question step right below already counts its questions.
    renderAt({ courseId: 'c1', topicId: 't1', subTopicId: 's1', dotPointId: 'd1' });
    const trigger = screen.getByTitle('Model DNA replication.');
    expect(trigger.textContent).not.toMatch(/questions/);
  });

  it('labels each answered step with its level', () => {
    renderAt({ courseId: 'c1', topicId: 't1', subTopicId: 's1' });
    expect(screen.getByText('Course')).toBeTruthy();
    expect(screen.getByText('Topic')).toBeTruthy();
    expect(screen.getByText('Sub-topic')).toBeTruthy();
  });

  it('draws the sub-topic tile in teal, as every other sub-topic mark is', () => {
    renderAt({ courseId: 'c1', topicId: 't1' });
    const list = openPicker(/select sub-topic/i);
    const tile = list.getByText('DNA').previousElementSibling as HTMLElement;
    expect(tile.className).toContain('text-teal-400');
    expect(tile.className).not.toContain('indigo');
  });
});
