import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import type { Course, User } from '../../types';
import { clearOwnedCourseUnlocks, loadOwnedCourseUnlocks } from '../../services/courseAccess';

/**
 * The course picker's lock badge (course unlocks). Enabled: a locked course carries
 * "Unlock · A$20" and stays selectable. Disabled: the picker is exactly what it was,
 * with no badge and no request for prices or unlocks.
 */

vi.mock('../../services/geminiService', () => ({ parseSyllabusStructure: vi.fn() }));
vi.mock('../../services/responseService', () => ({
  fetchMyAttempts: vi.fn().mockResolvedValue(new Map()),
}));

const rpcMock = vi.fn();
vi.mock('../../services/supabaseClient', () => ({
  getSupabase: async () => ({ rpc: rpcMock }),
}));

vi.mock('../../hooks/useLivePrices', () => ({
  useCourseUnlockPrice: () =>
    import.meta.env.VITE_COURSE_UNLOCKS_ENABLED === 'true'
      ? { amount: 20, currency: 'aud', display: 'A$20', taxBehavior: 'unspecified' }
      : null,
  useLivePrices: () => ({}),
}));

import PromptSelector from '../../components/PromptSelector';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.scrollTo = vi.fn();
});

/** One question, so the course is ready to use (a course with none is "Coming soon"). */
const oneQuestion = (id: string) => [
  {
    id: `${id}-t`,
    name: 'Topic',
    subTopics: [
      {
        id: `${id}-st`,
        name: 'Sub-topic',
        dotPoints: [{ id: `${id}-dp`, description: 'Dot point', prompts: [{ id: `${id}-p` }] }],
      },
    ],
  },
];

const course = (id: string, name: string, subject: string) =>
  ({ id, name, subject, outcomes: [], topics: oneQuestion(id) }) as unknown as Course;

const courses: Course[] = [
  course('course-chem', 'Chemistry', 'Science'),
  course('course-bio', 'Biology', 'Science'),
];

const student = {
  username: 'student-1',
  role: 'user',
  displayName: 'Student',
  preferences: {},
  stats: {},
} as unknown as User;

const noop = vi.fn();
const props = {
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
  statePath: {},
};

const openPicker = () => {
  fireEvent.click(screen.getByRole('button', { name: /select course/i }));
  return within(screen.getByRole('listbox'));
};

beforeEach(() => {
  vi.unstubAllEnvs();
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: ['course-bio'], error: null });
  clearOwnedCourseUnlocks();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  clearOwnedCourseUnlocks();
});

describe('course picker with unlocks enabled', () => {
  beforeEach(() => vi.stubEnv('VITE_COURSE_UNLOCKS_ENABLED', 'true'));

  it('badges a locked course with its price, and leaves it selectable', async () => {
    const onPathChange = vi.fn();
    render(<PromptSelector {...props} user={student} onPathChange={onPathChange} />);
    const list = openPicker();
    // The Chemistry row is locked for this student; Biology is owned after the load.
    const chemistry = await list.findByRole('option', { name: /Chemistry/ });
    expect(within(chemistry).getByText('Unlock · A$20')).toBeTruthy();
    expect(chemistry.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(chemistry);
    expect(onPathChange).toHaveBeenCalledWith(expect.objectContaining({ courseId: 'course-chem' }));
  });

  it('does not badge a course the viewer owns', async () => {
    // App loads the unlocks once per sign-in; the picker only reads them.
    await loadOwnedCourseUnlocks();
    render(<PromptSelector {...props} user={student} />);
    const list = openPicker();
    const biology = await list.findByRole('option', { name: /Biology/ });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(within(biology).queryByTestId('course-lock-badge')).toBeNull();
    const chemistry = await list.findByRole('option', { name: /Chemistry/ });
    expect(within(chemistry).getByTestId('course-lock-badge')).toBeTruthy();
  });

  it('does not badge staff, who are never locked', async () => {
    render(<PromptSelector {...props} user={{ ...student, role: 'teacher' } as User} />);
    const list = openPicker();
    const chemistry = await list.findByRole('option', { name: /Chemistry/ });
    expect(within(chemistry).queryByTestId('course-lock-badge')).toBeNull();
  });
});

describe('course picker with unlocks disabled (the default)', () => {
  it('renders no badge and asks for neither unlocks nor prices', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<PromptSelector {...props} user={student} />);
    const list = openPicker();
    expect(await list.findByRole('option', { name: /Chemistry/ })).toBeTruthy();
    expect(screen.queryByTestId('course-lock-badge')).toBeNull();
    expect(screen.queryByText(/^Unlock/)).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('course picker: what each course is to the viewer', () => {
  const empty = (id: string, name: string) =>
    ({ id, name, subject: 'Science', outcomes: [], topics: [] }) as unknown as Course;

  it('marks a bought course Purchased and counts each state at the top of the list', async () => {
    vi.stubEnv('VITE_COURSE_UNLOCKS_ENABLED', 'true');
    await loadOwnedCourseUnlocks();
    render(
      <PromptSelector
        {...props}
        courses={[...courses, empty('course-phys', 'Physics')]}
        user={student}
      />
    );
    const list = openPicker();
    const biology = await list.findByRole('option', { name: /Biology/ });
    expect(within(biology).getByTestId('course-status-purchased').textContent).toBe('Purchased');
    expect(screen.getByTestId('course-availability-summary').textContent).toBe(
      '1 purchased · 1 to unlock · 1 coming soon'
    );
  });

  it('marks a course the plan includes as Included', async () => {
    vi.stubEnv('VITE_COURSE_UNLOCKS_ENABLED', 'true');
    vi.stubEnv('VITE_COURSE_UNLOCK_FREE_COURSES', 'course-chem');
    render(<PromptSelector {...props} user={student} />);
    const list = openPicker();
    const chemistry = await list.findByRole('option', { name: /Chemistry/ });
    expect(within(chemistry).getByTestId('course-status-included')).toBeTruthy();
    expect(within(chemistry).queryByTestId('course-lock-badge')).toBeNull();
  });

  it('files a course with no questions under Coming soon, last, and disables it for a student', async () => {
    const onPathChange = vi.fn();
    render(
      <PromptSelector
        {...props}
        courses={[empty('course-anat', 'Anatomy'), ...courses]}
        user={student}
        onPathChange={onPathChange}
      />
    );
    const list = openPicker();
    const options = await list.findAllByRole('option');
    // Alphabetically Anatomy would come first; not ready, it comes last.
    expect(options.map((o) => o.textContent?.match(/Anatomy|Biology|Chemistry/)?.[0])).toEqual([
      'Biology',
      'Chemistry',
      'Anatomy',
    ]);
    const anatomy = options[2];
    expect(within(anatomy).getByTestId('course-status-coming-soon')).toBeTruthy();
    expect(anatomy.getAttribute('aria-disabled')).toBe('true');
    expect(list.getByRole('group', { name: 'Coming soon' })).toBeTruthy();
    fireEvent.click(anatomy);
    expect(onPathChange).not.toHaveBeenCalled();
  });

  it('lets a teacher open a Coming soon course, to write its questions', async () => {
    const onPathChange = vi.fn();
    render(
      <PromptSelector
        {...props}
        courses={[empty('course-anat', 'Anatomy'), ...courses]}
        user={{ ...student, role: 'teacher' } as User}
        userRole="teacher"
        onPathChange={onPathChange}
      />
    );
    const list = openPicker();
    const anatomy = await list.findByRole('option', { name: /Anatomy/ });
    expect(anatomy.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(anatomy);
    expect(onPathChange).toHaveBeenCalledWith(expect.objectContaining({ courseId: 'course-anat' }));
  });

  it('shows no summary when every course is simply open', async () => {
    render(<PromptSelector {...props} user={student} />);
    openPicker();
    expect(screen.queryByTestId('course-availability-summary')).toBeNull();
  });
});
