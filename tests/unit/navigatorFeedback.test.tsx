import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import React, { useState } from 'react';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import Combobox from '../../components/Combobox';
import PromptSelector from '../../components/PromptSelector';
import Breadcrumb from '../../components/Breadcrumb';
import { useNavigatorFocusHandoff } from '../../hooks/useNavigatorFocusHandoff';
import { Course, Prompt, PromptVerb, StatePath, SyllabusCrumb } from '../../types';

/**
 * The navigator's silences.
 *
 * Four of them, all of the same kind: something happened and nothing said so.
 * A committed selection dropped focus to `<body>`, so the next Tab restarted at
 * the top of the document. A cascade threw away the chosen question and the
 * workspace simply vanished. An empty sub-topic list opened onto "No options
 * available." with no word on whose problem it was. And a course list still in
 * flight looked exactly like a student with no courses at all.
 *
 * Two of the four had a second half that the first pass missed, and both are
 * covered below: the focus handoff fired only on the collapse seam, so a crumb
 * pressed with the navigator already open still dropped focus to `<body>`; and
 * the notice read the first CHANGED level, which is the level a stage picker
 * set but the level a crumb walked away from — off by one for three crumbs and
 * silent for the fourth.
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

// --- 2b. …and must name the level correctly for BOTH routes -----------------

/**
 * The four crumb handlers exactly as `App.tsx` builds them.
 *
 * Copied rather than imported because `App.tsx` cannot be mounted here, and
 * the SHAPE is the whole point: a crumb clears the levels BELOW the one it
 * names and leaves that level standing, which is the inverse of what a stage
 * picker does. Reading "the first key that differs" therefore names the level
 * the student walked away from, not the one they are left on — and for the
 * dot-point crumb, which clears nothing but the question, it names nothing at
 * all.
 */
const CRUMB_PATCHES: Partial<StatePath>[] = [
  {
    topicId: undefined,
    subTopicId: undefined,
    dotPointId: undefined,
    promptId: undefined,
    selectedSubItems: undefined,
  },
  {
    subTopicId: undefined,
    dotPointId: undefined,
    promptId: undefined,
    selectedSubItems: undefined,
  },
  { dotPointId: undefined, promptId: undefined, selectedSubItems: undefined },
  { promptId: undefined },
];

const CRUMB_LABELS = ['Course', 'Topic', 'Sub-Topic', 'Dot Point'];

/** The real `Breadcrumb` and the real picker, over one shared `statePath`. */
const CrumbHarness: React.FC<{ initial: StatePath }> = ({ initial }) => {
  const [statePath, setStatePath] = useState<StatePath>(initial);
  const merge = (next: Partial<StatePath>) => setStatePath((prev) => ({ ...prev, ...next }));
  const crumbs: SyllabusCrumb[] = CRUMB_LABELS.map((label, i) => ({
    label,
    onClick: () => merge(CRUMB_PATCHES[i]),
  }));
  return (
    <>
      <div data-testid="crumbs">
        <Breadcrumb items={crumbs} />
      </div>
      <PromptSelector {...baseProps} statePath={statePath} onPathChange={merge} />
    </>
  );
};

describe('the cleared-question notice, driven from the breadcrumb', () => {
  const selected: StatePath = {
    courseId: 'c1',
    topicId: 't1',
    subTopicId: 's1',
    dotPointId: 'd1',
    promptId: 'p1',
  };

  const clickCrumb = (label: string) =>
    fireEvent.click(within(screen.getByTestId('crumbs')).getByRole('button', { name: label }));

  it.each([
    ['Course', 'Back to the course — your question selection was cleared.'],
    ['Topic', 'Back to the topic — your question selection was cleared.'],
    ['Sub-Topic', 'Back to the sub-topic — your question selection was cleared.'],
    ['Dot Point', 'Back to the syllabus point — your question selection was cleared.'],
  ])('names the level the %s crumb returns to', (label, expected) => {
    render(<CrumbHarness initial={selected} />);
    expect(screen.queryByRole('status')).toBeNull();

    clickCrumb(label);

    expect(screen.getByRole('status').textContent).toContain(expected);
  });

  it('never reports a crumb as a level the student chose', () => {
    for (const label of CRUMB_LABELS) {
      render(<CrumbHarness initial={selected} />);
      clickCrumb(label);
      // Going UP is not choosing. "New sub-topic chosen" after pressing the
      // Topic crumb names a level the student did not touch and did not pick.
      expect(screen.getByRole('status').textContent).not.toMatch(/chosen/);
      cleanup();
    }
  });

  it('is not silent for the dot-point crumb, which changes nothing but the question', () => {
    render(<CrumbHarness initial={selected} />);

    clickCrumb('Dot Point');

    // The regression: only `promptId` moved, so a search for a changed LEVEL
    // found nothing and the largest state change in the app happened in total
    // silence — for a screen-reader user, invisibly.
    const notice = screen.getByRole('status');
    expect(notice.textContent).toContain('your question selection was cleared');
  });

  it('still clears once a question is chosen again after a crumb jump', () => {
    render(<CrumbHarness initial={selected} />);

    clickCrumb('Sub-Topic');
    expect(screen.getByRole('status')).toBeTruthy();

    pick(/Select Dot Point/, /applications of web programming/);
    pick(/Select Question/, /emerging technologies/);

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('stays quiet when a crumb is pressed with no question selected', () => {
    render(<CrumbHarness initial={{ courseId: 'c1', topicId: 't1', subTopicId: 's1' }} />);

    clickCrumb('Topic');

    expect(screen.queryByRole('status')).toBeNull();
  });
});

// --- 2c. A crumb press must not drop focus to `<body>` ----------------------

const FocusHarness: React.FC<{ collapsed: boolean; jumps: number }> = ({ collapsed, jumps }) => {
  const { navigatorRef, expandButtonRef, noteNavigatorFocused } = useNavigatorFocusHandoff(
    collapsed,
    jumps
  );
  return (
    <>
      {/* The wrapper `App` puts the `onFocusCapture` on, so "has anyone ever
          stood in the navigator?" is answered the same way here. */}
      <div onFocusCapture={noteNavigatorFocused}>
        <div ref={navigatorRef} tabIndex={-1} data-testid="navigator" />
      </div>
      <button ref={expandButtonRef}>Change</button>
      <button data-testid="crumb">Topic</button>
    </>
  );
};

describe('the navigator focus handoff', () => {
  const scrollSpy = () => Element.prototype.scrollIntoView as unknown as ReturnType<typeof vi.fn>;

  it('catches focus when a crumb is pressed with the navigator already open', () => {
    const { rerender } = render(<FocusHarness collapsed={false} jumps={0} />);
    const crumb = screen.getByTestId('crumb');
    crumb.focus();
    expect(document.activeElement).toBe(crumb);

    // The press clears the question, unmounting whichever surface drew that
    // crumb. `collapsed` does not move — the navigator was already open — so
    // only the press count marks that anything happened.
    rerender(<FocusHarness collapsed={false} jumps={1} />);

    expect(document.activeElement).toBe(screen.getByTestId('navigator'));
  });

  it('acts once when a crumb press also re-opens the navigator', () => {
    const { rerender } = render(<FocusHarness collapsed jumps={0} />);
    scrollSpy().mockClear();

    // A crumb on the COLLAPSED bar moves both triggers in one commit.
    rerender(<FocusHarness collapsed={false} jumps={1} />);

    expect(document.activeElement).toBe(screen.getByTestId('navigator'));
    expect(scrollSpy()).toHaveBeenCalledTimes(1);
  });

  it('leaves focus alone on a re-render that moves neither trigger', () => {
    const { rerender } = render(<FocusHarness collapsed={false} jumps={2} />);
    const crumb = screen.getByTestId('crumb');
    crumb.focus();

    rerender(<FocusHarness collapsed={false} jumps={2} />);

    expect(document.activeElement).toBe(crumb);
  });

  it('hands focus to the Change button when the navigator folds, once it has been used', () => {
    const { rerender } = render(<FocusHarness collapsed={false} jumps={0} />);
    // Nobody has stood in the navigator, so a fold on load must not jump.
    rerender(<FocusHarness collapsed jumps={0} />);
    expect(document.activeElement).toBe(document.body);

    rerender(<FocusHarness collapsed={false} jumps={0} />);
    screen.getByTestId('navigator').focus();
    rerender(<FocusHarness collapsed jumps={0} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Change' }));
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
