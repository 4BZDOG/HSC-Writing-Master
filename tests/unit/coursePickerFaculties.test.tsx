import { describe, it, expect, vi, beforeAll, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react';
import PromptSelector from '../../components/PromptSelector';
import { Course, StatePath } from '../../types';
import { FACULTY_FILTER_STORAGE_KEY } from '../../utils/courseGrouping';
import { SUBJECT_AREAS, SUBJECT_AREA_FULL_NAME } from '../../utils/subjectAreas';

/**
 * The course picker under faculty headings, with a faculty filter that is
 * remembered on the device. These pin what a teacher sees: headings in faculty
 * order, courses sorted within each, chips that narrow the list, the choice
 * coming back on the next visit, search that stays inside the faculty, and a
 * way out when nothing in it matches.
 */

vi.mock('../../services/geminiService', () => ({ parseSyllabusStructure: vi.fn() }));
vi.mock('../../services/responseService', () => ({
  fetchMyAttempts: vi.fn().mockResolvedValue(new Map()),
}));

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.scrollTo = vi.fn();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const course = (id: string, name: string, subject: string): Course =>
  ({ id, name, subject, outcomes: [], topics: [] }) as unknown as Course;

// Seven Science courses, so the search box appears inside that faculty alone.
const courses: Course[] = [
  course('phys', 'Physics', 'Science'),
  course('bio', 'Biology', 'Science'),
  course('chem', 'Chemistry', 'Science'),
  course('earth', 'Earth and Environmental Science', 'Science'),
  course('inv', 'Investigating Science', 'Science'),
  course('sci-ext', 'Science Extension', 'Science'),
  course('marine', 'Marine Studies', 'Science'),
  course('eng-adv', 'English Advanced', 'English'),
  course('eng-std', 'English Standard', 'English'),
  course('hist', 'Modern History', 'HSIE'),
  course('sdd', 'Software Design and Development', 'TAS'),
];

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

const renderAt = (statePath: StatePath = {} as StatePath) =>
  render(<PromptSelector {...baseProps} statePath={statePath} />);

const openCourses = () => {
  fireEvent.click(screen.getByRole('button', { name: /select course/i }));
  return within(screen.getByRole('listbox'));
};

const optionNames = (list: ReturnType<typeof within>) =>
  list.getAllByRole('option').map((o) => o.textContent?.trim());

const chipRow = () => within(screen.getByRole('group', { name: 'Show faculty' }));

describe('course picker: faculty headings and order', () => {
  it('groups courses under faculty headings in alphabetical order, with Other last', () => {
    renderAt();
    const list = openCourses();
    const groups = list.getAllByRole('group');
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual([
      'English',
      'Human Society and its Environment',
      'Science',
      'Technological and Applied Studies',
    ]);
  });

  it('orders headings as SUBJECT_AREAS does, so the picker follows the canonical order', () => {
    renderAt();
    const list = openCourses();
    const shown = list.getAllByRole('group').map((g) => g.getAttribute('aria-label'));
    const fullNames = SUBJECT_AREAS.map((a) => SUBJECT_AREA_FULL_NAME[a]);
    expect(shown).toEqual(fullNames.filter((n) => shown.includes(n)));
  });

  it('shows each faculty heading by its short name, with its full name as the tooltip', () => {
    renderAt();
    const list = openCourses();
    const tas = list
      .getAllByRole('group')
      .find((g) => g.getAttribute('aria-label')?.startsWith('Technological'));
    expect(tas).toBeTruthy();
    const visible = tas!.querySelector('[aria-hidden="true"]');
    expect(visible?.textContent).toBe('TAS');
    expect(visible?.querySelector('[title="Technological and Applied Studies"]')).toBeTruthy();
  });

  it('sorts courses by name within each faculty', () => {
    renderAt();
    const list = openCourses();
    const science = list.getAllByRole('group', { name: 'Science' })[0];
    expect(
      within(science)
        .getAllByRole('option')
        .map((o) => o.textContent?.trim())
    ).toEqual([
      'Biology',
      'Chemistry',
      'Earth and Environmental Science',
      'Investigating Science',
      'Marine Studies',
      'Physics',
      'Science Extension',
    ]);
  });
});

describe('course picker: faculty filter chips', () => {
  it('shows All and only the faculties that have courses, each with its count', () => {
    renderAt();
    openCourses();
    const chips = chipRow();
    expect(chips.getByRole('button', { name: /^All 11$/ })).toBeTruthy();
    expect(chips.getByRole('button', { name: /^Science 7$/ })).toBeTruthy();
    expect(chips.getByRole('button', { name: /^English 2$/ })).toBeTruthy();
    expect(chips.queryByRole('button', { name: /PDHPE/ })).toBeNull();
  });

  it('narrows the list to one faculty and drops the headings that no longer apply', () => {
    renderAt();
    const list = openCourses();
    fireEvent.click(chipRow().getByRole('button', { name: /^English 2$/ }));
    expect(optionNames(list)).toEqual(['English Advanced', 'English Standard']);
    expect(list.queryAllByRole('group')).toHaveLength(0);
    expect(
      chipRow()
        .getByRole('button', { name: /^English 2$/ })
        .getAttribute('aria-pressed')
    ).toBe('true');
  });

  it('returns to every faculty with All', () => {
    renderAt();
    const list = openCourses();
    fireEvent.click(chipRow().getByRole('button', { name: /^English 2$/ }));
    fireEvent.click(chipRow().getByRole('button', { name: /^All 11$/ }));
    expect(list.getAllByRole('group')).toHaveLength(4);
  });

  it('remembers the chosen faculty on this device, and restores it on the next visit', () => {
    const { unmount } = renderAt();
    openCourses();
    fireEvent.click(chipRow().getByRole('button', { name: /^Science 7$/ }));
    expect(window.localStorage.getItem(FACULTY_FILTER_STORAGE_KEY)).toBe('Science');
    unmount();

    renderAt();
    const list = openCourses();
    expect(list.getAllByRole('option')).toHaveLength(7);
    expect(
      chipRow()
        .getByRole('button', { name: /^Science 7$/ })
        .getAttribute('aria-pressed')
    ).toBe('true');
  });

  it('falls back to All when the remembered faculty has no courses', () => {
    window.localStorage.setItem(FACULTY_FILTER_STORAGE_KEY, 'PDHPE');
    renderAt();
    const list = openCourses();
    expect(list.getAllByRole('option')).toHaveLength(11);
  });

  it('is keyboard reachable: Tab from the search box enters the chips, arrows move between them', async () => {
    renderAt();
    openCourses();
    const search = screen.getByRole('combobox', { name: /search/i });
    search.focus();
    fireEvent.keyDown(search, { key: 'Tab' });
    const all = chipRow().getByRole('button', { name: /^All 11$/ });
    await waitFor(() => expect(document.activeElement).toBe(all));
    fireEvent.keyDown(all, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(chipRow().getByRole('button', { name: /^English 2$/ }));
  });
});

describe('course picker: search within a faculty', () => {
  it('searches only inside the chosen faculty', async () => {
    renderAt();
    const list = openCourses();
    fireEvent.click(chipRow().getByRole('button', { name: /^Science 7$/ }));
    const search = screen.getByRole('combobox', { name: /search/i });
    fireEvent.change(search, { target: { value: 'bio' } });
    await waitFor(() => expect(optionNames(list)).toEqual(['Biology']));
  });

  it('offers Show all faculties when nothing in the faculty matches, and keeps the search text', async () => {
    renderAt();
    const list = openCourses();
    fireEvent.click(chipRow().getByRole('button', { name: /^Science 7$/ }));
    const search = screen.getByRole('combobox', { name: /search/i });
    fireEvent.change(search, { target: { value: 'history' } });
    await waitFor(() => expect(screen.getByText(/Nothing matches/)).toBeTruthy());

    fireEvent.click(list.getByRole('button', { name: 'Show all faculties' }));
    await waitFor(() => expect(optionNames(list)).toEqual(['Modern History']));
    expect((screen.getByRole('combobox', { name: /search/i }) as HTMLInputElement).value).toBe(
      'history'
    );
    expect(
      chipRow()
        .getByRole('button', { name: /^All 11$/ })
        .getAttribute('aria-pressed')
    ).toBe('true');
  });

  it('does not offer Show all faculties when the filter is already All', async () => {
    renderAt();
    openCourses();
    fireEvent.change(screen.getByRole('combobox', { name: /search/i }), {
      target: { value: 'zzzz' },
    });
    await waitFor(() => expect(screen.getByText(/Nothing matches/)).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Show all faculties' })).toBeNull();
  });
});

describe('course picker: a hidden choice is not silent', () => {
  it('says so when the chosen course is outside the faculty being shown, and offers a way back', () => {
    window.localStorage.setItem(FACULTY_FILTER_STORAGE_KEY, 'Science');
    renderAt({ courseId: 'eng-adv' } as StatePath);
    // The trigger still names the chosen course, even though the list hides it.
    fireEvent.click(screen.getByRole('button', { name: 'Course: English Advanced' }));
    const list = within(screen.getByRole('listbox'));
    expect(screen.getByText(/“English Advanced” is hidden by this filter\./)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show all faculties' }));
    expect(list.getAllByRole('option')).toHaveLength(11);
    expect(screen.queryByText(/is hidden by this filter/)).toBeNull();
  });
});

describe('course picker: a single faculty', () => {
  it('shows no chip row and no headings when every course is in one faculty', () => {
    render(
      <PromptSelector
        {...baseProps}
        courses={courses.filter((c) => c.subject === 'Science')}
        statePath={{} as StatePath}
      />
    );
    const list = openCourses();
    expect(screen.queryByRole('group', { name: 'Show faculty' })).toBeNull();
    expect(list.queryAllByRole('group')).toHaveLength(0);
    expect(list.getAllByRole('option')).toHaveLength(7);
  });
});

describe('course picker: the course library', () => {
  it('offers the course library under the picker, to every role', () => {
    const onOpenCourseLibrary = vi.fn();
    render(
      <PromptSelector
        {...baseProps}
        statePath={{} as StatePath}
        onOpenCourseLibrary={onOpenCourseLibrary}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add a course from the library' }));
    expect(onOpenCourseLibrary).toHaveBeenCalledTimes(1);
  });

  it('points a search that finds nothing at the course library', async () => {
    const onOpenCourseLibrary = vi.fn();
    render(
      <PromptSelector
        {...baseProps}
        statePath={{} as StatePath}
        onOpenCourseLibrary={onOpenCourseLibrary}
      />
    );
    const list = openCourses();
    fireEvent.change(screen.getByRole('combobox', { name: /search/i }), {
      target: { value: 'visual arts' },
    });
    fireEvent.click(await list.findByRole('button', { name: 'Look for it in the course library' }));
    expect(onOpenCourseLibrary).toHaveBeenCalledTimes(1);
  });

  it('is not offered where the caller has no course library (a Supabase library)', () => {
    renderAt();
    expect(screen.queryByRole('button', { name: 'Add a course from the library' })).toBeNull();
  });
});
