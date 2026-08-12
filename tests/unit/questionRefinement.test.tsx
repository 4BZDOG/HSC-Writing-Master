import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import PromptSelector from '../../components/PromptSelector';
import { Course, Prompt, PromptVerb, StatePath } from '../../types';
import {
  applyQuestionFilter,
  clampFilter,
  describeQuestions,
  isFilterActive,
  summariseFilter,
  widestFilter,
  QuestionFilter,
} from '../../utils/questionFilter';

/**
 * Grouping a long question list by cognitive tier says what KIND each question
 * is while it is being read. It does nothing for the reader who already knows:
 * "the hard ones", "the short ones", "the real exam ones". That is the job of
 * the refinement strip — and its whole obligation is to be honest about what it
 * is holding back, because a list that silently shortened would be the exact
 * failure the volume strategy exists to avoid.
 */

vi.mock('../../services/geminiService', () => ({
  parseSyllabusStructure: vi.fn(),
}));

beforeAll(() => {
  // The picker scrolls the highlighted option into view; jsdom has no layout.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

describe('question filter model', () => {
  const facets = [
    { id: 'a', tier: 2, marks: 3 },
    { id: 'b', tier: 4, marks: 6 },
    { id: 'c', tier: 5, marks: 8, isPastHsc: true },
  ];

  it('sizes the axes from the questions present, not the whole scale', () => {
    const bounds = describeQuestions(facets);
    expect(bounds.tier).toEqual([2, 5]);
    expect(bounds.marks).toEqual([3, 8]);
    expect(bounds.hasPastHsc).toBe(true);
    expect(bounds.total).toBe(3);
  });

  it('starts wide open — nothing is hidden that nobody hid', () => {
    const bounds = describeQuestions(facets);
    const filter = widestFilter(bounds);
    expect(isFilterActive(filter, bounds)).toBe(false);
    expect(applyQuestionFilter(facets, filter)).toHaveLength(3);
  });

  it('narrows by difficulty and by length independently', () => {
    const bounds = describeQuestions(facets);
    const harder: QuestionFilter = { ...widestFilter(bounds), tier: [4, 5] };
    expect(applyQuestionFilter(facets, harder).map((f) => f.id)).toEqual(['b', 'c']);

    const shorter: QuestionFilter = { ...widestFilter(bounds), marks: [3, 6] };
    expect(applyQuestionFilter(facets, shorter).map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('keeps the question the reader is on, whatever the filter says', () => {
    const bounds = describeQuestions(facets);
    const harder: QuestionFilter = { ...widestFilter(bounds), tier: [5, 5] };
    expect(applyQuestionFilter(facets, harder, 'a').map((f) => f.id)).toEqual(['a', 'c']);
  });

  it('re-fits a filter when the questions under it change', () => {
    const narrower = describeQuestions([{ id: 'x', tier: 2, marks: 4 }]);
    const carried: QuestionFilter = {
      tier: [4, 6],
      marks: [6, 9],
      pastHscOnly: true,
      unattemptedOnly: true,
    };
    const fitted = clampFilter(carried, narrower);

    // Nothing survives of a range that no longer overlaps, so it reopens rather
    // than collapsing onto an edge and hiding everything.
    expect(fitted.tier).toEqual([2, 2]);
    expect(fitted.marks).toEqual([4, 4]);
    // A toggle whose subject no longer exists would filter against nothing.
    expect(fitted.pastHscOnly).toBe(false);
    expect(fitted.unattemptedOnly).toBe(false);
  });

  it('says in words what it is holding back', () => {
    const bounds = describeQuestions(facets);
    expect(summariseFilter(
        { tier: [4, 5], marks: [3, 8], pastHscOnly: false, unattemptedOnly: false },
        bounds
      )).toEqual([
      'Analyse → Discuss',
    ]);
    expect(summariseFilter(
        { tier: [2, 5], marks: [6, 6], pastHscOnly: true, unattemptedOnly: false },
        bounds
      )).toEqual([
      '6 marks',
      'Past HSC only',
    ]);
  });
});

// --- The picker itself -------------------------------------------------------

const makePrompt = (
  id: string,
  question: string,
  verb: string,
  totalMarks: number,
  extra: Partial<Prompt> = {}
): Prompt =>
  ({
    id,
    question,
    verb: verb as PromptVerb,
    totalMarks,
    ...extra,
  }) as Prompt;

/** Eight questions under one dot point — the volume this feature exists for. */
const manyPrompts: Prompt[] = [
  makePrompt('p1', 'Identify two input devices.', 'IDENTIFY', 2),
  makePrompt('p2', 'Outline the fetch-execute cycle.', 'OUTLINE', 3),
  makePrompt('p3', 'Describe the role of a compiler.', 'DESCRIBE', 4),
  makePrompt('p4', 'Explain how caching reduces latency.', 'EXPLAIN', 5),
  makePrompt('p5', 'Analyse the impact of automation.', 'ANALYSE', 6),
  makePrompt('p6', 'Assess the value of automated testing.', 'ASSESS', 8, {
    isPastHSC: true,
    hscYear: 2023,
  }),
  makePrompt('p7', 'Evaluate the merits of agile delivery.', 'EVALUATE', 9),
  makePrompt('p8', 'Evaluate the security of open standards.', 'EVALUATE', 9),
];

const coursesWith = (prompts: Prompt[]): Course[] => [
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

const statePath: StatePath = {
  courseId: 'c1',
  topicId: 't1',
  subTopicId: 's1',
  dotPointId: 'd1',
};

const noop = vi.fn();

const baseProps = {
  statePath,
  onPathChange: noop,
  onAddCourse: noop,
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

const renderPicker = (prompts: Prompt[], path: StatePath = statePath) =>
  render(<PromptSelector {...baseProps} courses={coursesWith(prompts)} statePath={path} />);

const openQuestionList = (): HTMLElement => {
  const trigger = screen.getByText('Select Question...');
  fireEvent.click(trigger.closest('button') as HTMLElement);
  return screen.getByRole('listbox');
};

/** Opens the picker if it is shut, and reads the rows it is offering. */
const questionTexts = (): string[] => {
  if (!screen.queryByRole('listbox')) openQuestionList();
  return within(screen.getByRole('listbox'))
    .getAllByRole('option')
    .map((o) => o.textContent ?? '');
};

const expand = () => fireEvent.click(screen.getByRole('button', { name: /refine/i }));

const slider = (name: RegExp): HTMLInputElement =>
  screen.getByRole('slider', { name }) as HTMLInputElement;

describe('refining a long question list', () => {
  it('stays away from a list short enough to scan', () => {
    renderPicker(manyPrompts.slice(0, 6));
    expect(screen.queryByRole('button', { name: /refine/i })).toBeNull();
  });

  it('appears once the list is long enough to be worth narrowing', () => {
    renderPicker(manyPrompts);
    expect(screen.getByRole('button', { name: /refine/i })).toBeTruthy();
    expect(screen.getByText('8 questions')).toBeTruthy();
  });

  it('offers only the axes the questions actually vary on', () => {
    // Every question the same tier and the same marks: two sliders that could
    // not change the list are two controls not worth drawing.
    renderPicker([
      makePrompt('s1', 'Explain one.', 'EXPLAIN', 5),
      makePrompt('s2', 'Explain two.', 'EXPLAIN', 5),
      makePrompt('s3', 'Explain three.', 'EXPLAIN', 5),
      makePrompt('s4', 'Explain four.', 'EXPLAIN', 5),
      makePrompt('s5', 'Explain five.', 'EXPLAIN', 5),
      makePrompt('s6', 'Explain six.', 'EXPLAIN', 5),
      makePrompt('s7', 'Explain seven.', 'EXPLAIN', 5),
    ]);
    expect(screen.queryByRole('button', { name: /refine/i })).toBeNull();
  });

  it('drops the easy questions when the difficulty floor is raised', () => {
    renderPicker(manyPrompts);
    expand();

    fireEvent.change(slider(/difficulty, lowest/i), { target: { value: '5' } });

    expect(screen.getByText('3 of 8 shown')).toBeTruthy();
    const texts = questionTexts();
    expect(texts).toHaveLength(3);
    expect(texts.join(' ')).not.toMatch(/input devices/i);
    expect(texts.join(' ')).toMatch(/agile delivery/i);
  });

  it('drops the extended responses when the length ceiling is lowered', () => {
    renderPicker(manyPrompts);
    expand();

    fireEvent.change(slider(/length, highest/i), { target: { value: '4' } });

    expect(screen.getByText('3 of 8 shown')).toBeTruthy();
    expect(questionTexts().join(' ')).not.toMatch(/agile delivery/i);
  });

  it('never lets a handle cross its partner', () => {
    renderPicker(manyPrompts);
    expand();

    fireEvent.change(slider(/difficulty, highest/i), { target: { value: '1' } });
    // Pushed down to the floor, not below it — the pair still reads as a range.
    expect(slider(/difficulty, highest/i).value).toBe('1');
    expect(slider(/difficulty, lowest/i).value).toBe('1');
  });

  it('narrows to the real exam questions on request', () => {
    renderPicker(manyPrompts);
    expand();

    fireEvent.click(screen.getByRole('button', { name: /past hsc only/i }));

    expect(screen.getByText('1 of 8 shown')).toBeTruthy();
    expect(questionTexts().join(' ')).toMatch(/automated testing/i);
  });

  it('names what it is holding back once the controls are out of sight', () => {
    renderPicker(manyPrompts);
    expand();
    fireEvent.change(slider(/difficulty, lowest/i), { target: { value: '5' } });
    expand(); // collapse again

    expect(screen.getByText(/Discuss → Evaluate/)).toBeTruthy();
  });

  it('puts everything back in one click', () => {
    renderPicker(manyPrompts);
    expand();
    fireEvent.change(slider(/difficulty, lowest/i), { target: { value: '6' } });
    expect(screen.getByText('2 of 8 shown')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /clear/i }));

    expect(screen.getByText('8 questions')).toBeTruthy();
    expect(questionTexts()).toHaveLength(8);
  });

  it('explains an empty list rather than leaving a blank picker', () => {
    renderPicker(manyPrompts);
    expand();
    fireEvent.change(slider(/difficulty, lowest/i), { target: { value: '6' } });
    fireEvent.change(slider(/length, highest/i), { target: { value: '2' } });

    expect(screen.getByText('0 of 8 shown')).toBeTruthy();
    expect(screen.getByText(/No question here matches those settings/i)).toBeTruthy();
  });

  it('keeps the selected question visible even when the filter excludes it', () => {
    renderPicker(manyPrompts, { ...statePath, promptId: 'p1' });
    expand();
    fireEvent.change(slider(/difficulty, lowest/i), { target: { value: '6' } });

    // The count still tells the truth about the filter…
    expect(screen.getByText('2 of 8 shown')).toBeTruthy();
    // …and the picker still shows the question the workspace is displaying.
    const trigger = screen.getByText(/Identify two input devices/i);
    fireEvent.click(trigger.closest('button') as HTMLElement);
    expect(questionTexts().join(' ')).toMatch(/input devices/i);
  });
});

describe('a filter belongs to the dot point it was set on', () => {
  it('reopens when the reader moves to a different syllabus point', () => {
    const { rerender } = renderPicker(manyPrompts);
    expand();
    fireEvent.change(slider(/difficulty, lowest/i), { target: { value: '6' } });
    expect(screen.getByText('2 of 8 shown')).toBeTruthy();

    const courses = coursesWith(manyPrompts);
    courses[0].topics[0].subTopics[0].dotPoints.push({
      id: 'd2',
      description: 'A different syllabus point.',
      prompts: manyPrompts.map((p) => ({ ...p, id: `${p.id}-b` })),
    });

    rerender(
      <PromptSelector
        {...baseProps}
        courses={courses}
        statePath={{ ...statePath, dotPointId: 'd2' }}
      />
    );

    expect(screen.getByText('8 questions')).toBeTruthy();
  });
});
