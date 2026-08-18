import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import React, { useState } from 'react';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import Combobox from '../../components/Combobox';
import PromptSelector from '../../components/PromptSelector';
import { Course, Prompt, PromptVerb, StatePath } from '../../types';

/**
 * The navigator's silences.
 *
 * Four of them, all of the same kind: something happened and nothing said so.
 * A committed selection dropped focus to `<body>`, so the next Tab restarted at
 * the top of the document. A cascade threw away the chosen question and the
 * workspace simply vanished. An empty sub-topic list opened onto "No options
 * available." with no word on whose problem it was. And a course list still in
 * flight looked exactly like a student with no courses at all.
 */

vi.mock('../../services/geminiService', () => ({
  parseSyllabusStructure: vi.fn(),
}));

// The picker asks the backend for this reader's own marks; there is no backend
// here, and the hook is deliberately silent about that either way.
vi.mock('../../services/responseService', () => ({
  fetchMyAttempts: vi.fn().mockResolvedValue(new Map()),
}));

// The "request a course" route only exists where there is somewhere to log the
// demand. Say there is, so the link under the picker is on screen to hide.
vi.mock('../../services/courseDemandService', () => ({
  isCourseDemandAvailable: () => true,
}));

beforeAll(() => {
  // jsdom has no layout: the highlight's scrollIntoView and the breadcrumb's
  // scrollTo are both no-op stubs.
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.scrollTo = vi.fn();
});

afterEach(cleanup);

// --- 1. A commit must hand focus back ---------------------------------------

const manyOptions = Array.from({ length: 8 }, (_, i) => ({
  id: `o${i}`,
  label: `Option ${i}`,
}));

describe('committing a Combobox selection', () => {
  const openSearchableList = () => {
    const onChange = vi.fn();
    render(<Combobox options={manyOptions} value="" onChange={onChange} label={null} />);
    const trigger = screen.getByRole('button', { name: /select/i });
    fireEvent.click(trigger);
    // Long enough to be searchable, so focus is in the search box — the control
    // that unmounts with the popup.
    expect(screen.getByRole('combobox')).toBe(document.activeElement);
    return { onChange, trigger };
  };

  it('returns focus to the trigger when Enter commits', () => {
    const { onChange, trigger } = openSearchableList();

    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('o0');
    expect(document.activeElement).toBe(trigger);
  });

  it('returns focus to the trigger when a click commits', () => {
    const { onChange, trigger } = openSearchableList();

    fireEvent.click(within(screen.getByRole('listbox')).getByText('Option 3'));

    expect(onChange).toHaveBeenCalledWith('o3');
    expect(document.activeElement).toBe(trigger);
  });
});

// --- The syllabus tree the picker walks -------------------------------------

const makePrompt = (id: string, question: string): Prompt =>
  ({
    id,
    question,
    verb: 'ASSESS' as PromptVerb,
    totalMarks: 8,
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
                prompts: [makePrompt('p1', 'Assess the impact of emerging technologies.')],
              },
            ],
          },
        ],
      },
      {
        id: 't2',
        name: 'Secure Software Architecture',
        subTopics: [
          {
            id: 's2',
            name: 'Designing Software',
            dotPoints: [
              {
                id: 'd2',
                description: 'Apply security by design to a scenario.',
                prompts: [makePrompt('p2', 'Assess the value of threat modelling.')],
              },
            ],
          },
        ],
      },
    ],
  },
];

const noop = vi.fn();

const baseProps = {
  courses,
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
  userRole: 'teacher' as const,
};

/** Open the picker whose trigger reads `trigger`, and choose `option` in it. */
const pick = (trigger: RegExp, option: RegExp | string) => {
  fireEvent.click(screen.getByRole('button', { name: trigger }));
  fireEvent.click(within(screen.getByRole('listbox')).getByText(option));
};

/**
 * The navigator as `App` drives it: one `statePath`, merged on every change.
 * The notice is a reaction to the path MOVING, so a fixed prop cannot test it.
 */
const LiveSelector: React.FC<{ initial: StatePath } & Record<string, unknown>> = ({
  initial,
  ...rest
}) => {
  const [statePath, setStatePath] = useState<StatePath>(initial);
  return (
    <PromptSelector
      {...baseProps}
      {...rest}
      statePath={statePath}
      onPathChange={(next) => setStatePath((prev) => ({ ...prev, ...next }))}
    />
  );
};

// --- 2. A cascade that discards the question must say so --------------------

describe('the cleared-question notice', () => {
  const selected: StatePath = {
    courseId: 'c1',
    topicId: 't1',
    subTopicId: 's1',
    dotPointId: 'd1',
    promptId: 'p1',
  };

  it('names the level that took the question, and clears when one is chosen again', () => {
    render(<LiveSelector initial={selected} />);

    // Nothing has been discarded yet.
    expect(screen.queryByRole('status')).toBeNull();

    pick(/Programming for the Web/, /Secure Software Architecture/);

    expect(screen.getByRole('status').textContent).toContain(
      'New topic chosen — your question selection was cleared.'
    );

    // Walk back down to a question; the notice is about a gap that no longer
    // exists the moment one is filled.
    pick(/Select Sub-Topic/, /Designing Software/);
    pick(/Select Dot Point/, /security by design/);
    pick(/Select Question/, /threat modelling/);

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('stays quiet on first-time navigation, where nothing was discarded', () => {
    render(<LiveSelector initial={{ courseId: 'c1' }} />);

    pick(/Select Topic/, /Programming for the Web/);

    expect(screen.queryByRole('status')).toBeNull();
  });
});

// --- 3. An empty stage must explain itself ----------------------------------

const emptyTopicCourses: Course[] = [
  {
    id: 'c1',
    name: 'Software Engineering',
    outcomes: [],
    topics: [{ id: 't1', name: 'Programming for the Web', subTopics: [] }],
  },
];

describe('the sub-topic empty state', () => {
  const path: StatePath = { courseId: 'c1', topicId: 't1' };

  it('tells a curator which controls fill it', () => {
    render(
      <PromptSelector
        {...baseProps}
        courses={emptyTopicCourses}
        statePath={path}
        onPathChange={noop}
        userRole="teacher"
      />
    );

    const notice = screen.getByText(/No sub-topics in this topic yet/);
    expect(notice.textContent).toContain('Add from Syllabus');
    expect(notice.textContent).not.toContain('Ask a teacher');
  });

  it('tells a student whose job it is', () => {
    render(
      <PromptSelector
        {...baseProps}
        courses={emptyTopicCourses}
        statePath={path}
        onPathChange={noop}
        userRole="user"
      />
    );

    const notice = screen.getByText(/No sub-topics in this topic yet/);
    expect(notice.textContent).toContain('Ask a teacher or admin to add content for this topic.');
    expect(notice.textContent).not.toContain('Add from Syllabus');
  });
});

// --- 4. A list still in flight is not an empty list -------------------------

describe('the course picker while the course list is still arriving', () => {
  const loadingProps = {
    ...baseProps,
    courses: [],
    statePath: {} as StatePath,
    onPathChange: noop,
    userRole: 'user' as const,
  };

  it('says it is loading, refuses to open, and does not offer to log demand', () => {
    render(<PromptSelector {...loadingProps} isLoading />);

    const trigger = screen.getByRole('button', { name: /Loading courses/ });
    expect((trigger as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(/Request it/)).toBeNull();
  });

  it('goes back to offering the request route once the list has landed', () => {
    render(<PromptSelector {...loadingProps} />);

    const trigger = screen.getByRole('button', { name: /Select Course/ });
    expect((trigger as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText(/Request it/)).toBeTruthy();
  });
});
