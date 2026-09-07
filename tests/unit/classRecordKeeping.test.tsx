import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import ClassInsightsModal from '../../components/admin/ClassInsightsModal';
import * as classService from '../../services/classService';
import * as responseService from '../../services/responseService';

/**
 * Class record-keeping, the write half of schema §19.
 *
 * The database has had `create_class` and `enrol_in_class` — permissioned,
 * revoked, RLS'd — since §19, and no client had ever called either. Because
 * `visible_student_ids` resolves a teacher's cohort THROUGH class membership, a
 * teacher with no class saw a dashboard of zeros that no amount of student work
 * would ever fill, and had no way in the app to fix it.
 */

vi.mock('../../services/curriculumService', async (importOriginal) => {
  const actual = await importOriginal<object>();
  return { ...actual, isCurriculumRemote: () => true };
});

vi.mock('../../services/classService', async (importOriginal) => {
  const actual = await importOriginal<typeof classService>();
  return {
    ...actual,
    enrolInClass: vi.fn(),
    createClass: vi.fn(),
    fetchClassMembers: vi.fn(),
    removeFromClass: vi.fn(),
  };
});

vi.mock('../../services/responseService', async (importOriginal) => {
  const actual = await importOriginal<typeof responseService>();
  return {
    ...actual,
    fetchMyClasses: vi.fn(),
    fetchClassAnalytics: vi.fn(),
    fetchClassCohort: vi.fn(),
  };
});

const EMPTY_ANALYTICS = {
  byVerb: [],
  byTopic: [],
  totals: { total_attempts: 0, active_students: 0, avg_band: null },
};

beforeEach(() => {
  vi.mocked(responseService.fetchClassAnalytics).mockResolvedValue(EMPTY_ANALYTICS as never);
  vi.mocked(responseService.fetchClassCohort).mockResolvedValue({
    byStudent: [],
    weekly: [],
    daily: [],
    weeks: 0,
  } as never);
  vi.mocked(classService.enrolInClass).mockResolvedValue(undefined);
  vi.mocked(classService.fetchClassMembers).mockResolvedValue([]);
  vi.mocked(classService.removeFromClass).mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const renderInsights = (showToast = vi.fn()) => {
  render(<ClassInsightsModal isOpen onClose={vi.fn()} showToast={showToast} />);
  return showToast;
};

describe('Class Insights — a teacher with no class', () => {
  it('says why the numbers are zero instead of just showing zeros', async () => {
    vi.mocked(responseService.fetchMyClasses).mockResolvedValue([]);
    renderInsights();

    expect(await screen.findByText(/You do not teach a class yet/i)).toBeTruthy();
    // Names the cause and who can fix it, rather than "no data".
    expect(
      screen.getByText(/An administrator creates classes in the Usage Dashboard/i)
    ).toBeTruthy();
    // And offers no roll control it cannot honour.
    expect(screen.queryByRole('button', { name: /add a student/i })).toBeNull();
  });
});

describe('Class Insights — managing the roll', () => {
  const oneClass = [
    { id: 'cls-1', name: '12BIO1', year: 12, school: 'Northmead High', students: 3 },
  ];

  it('enrols a student into the teacher’s own class', async () => {
    vi.mocked(responseService.fetchMyClasses).mockResolvedValue(oneClass as never);
    const showToast = renderInsights();

    fireEvent.click(await screen.findByRole('button', { name: /add a student/i }));
    fireEvent.change(screen.getByLabelText(/username to enrol/i), {
      target: { value: 'jane.doe' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^enrol$/i }));

    await waitFor(() =>
      // The single class is preselected — there is no choice to make.
      expect(classService.enrolInClass).toHaveBeenCalledWith('cls-1', 'jane.doe', 'student')
    );
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        expect.stringContaining('jane.doe enrolled in “12BIO1” as a student'),
        'success'
      )
    );
  });

  it('can add a co-teacher rather than a student', async () => {
    vi.mocked(responseService.fetchMyClasses).mockResolvedValue(oneClass as never);
    renderInsights();

    fireEvent.click(await screen.findByRole('button', { name: /add a student/i }));
    fireEvent.change(screen.getByLabelText(/username to enrol/i), {
      target: { value: 'sam.teacher' },
    });
    fireEvent.change(screen.getByLabelText(/role to enrol them with/i), {
      target: { value: 'co_teacher' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^enrol$/i }));

    await waitFor(() =>
      expect(classService.enrolInClass).toHaveBeenCalledWith('cls-1', 'sam.teacher', 'co_teacher')
    );
  });

  it('asks which class when the teacher has more than one', async () => {
    vi.mocked(responseService.fetchMyClasses).mockResolvedValue([
      ...oneClass,
      { id: 'cls-2', name: '12BIO2', year: 12, school: 'Northmead High', students: 1 },
    ] as never);
    const showToast = renderInsights();

    fireEvent.click(await screen.findByRole('button', { name: /add a student/i }));
    fireEvent.change(screen.getByLabelText(/username to enrol/i), {
      target: { value: 'jane.doe' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^enrol$/i }));

    // Nothing is guessed — enrolling into the wrong class is not recoverable
    // from this panel, since the database has no removal function.
    expect(classService.enrolInClass).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('Pick the class to enrol them in.', 'info');

    fireEvent.change(screen.getByLabelText(/class to enrol them in/i), {
      target: { value: 'cls-2' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^enrol$/i }));
    await waitFor(() =>
      expect(classService.enrolInClass).toHaveBeenCalledWith('cls-2', 'jane.doe', 'student')
    );
  });

  it('surfaces a refused enrolment rather than reporting success', async () => {
    vi.mocked(responseService.fetchMyClasses).mockResolvedValue(oneClass as never);
    vi.mocked(classService.enrolInClass).mockRejectedValue(
      new Error('Could not enrol ghost: No user with username "ghost"')
    );
    const showToast = renderInsights();

    fireEvent.click(await screen.findByRole('button', { name: /add a student/i }));
    fireEvent.change(screen.getByLabelText(/username to enrol/i), { target: { value: 'ghost' } });
    fireEvent.click(screen.getByRole('button', { name: /^enrol$/i }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        expect.stringContaining('No user with username "ghost"'),
        'error'
      )
    );
  });
});

describe('formatDay — the UTC bucket a cohort chart actually holds', () => {
  it('names the stored date, not the reader’s local rendering of UTC midnight', async () => {
    const { formatDay } = await import('../../components/admin/CohortBreakdown');
    // `new Date('2026-09-07')` is UTC midnight, which prints as 6 Sep for
    // anyone west of Greenwich and as 7 Sep here — the bucket is a UTC date
    // string and must read back as itself wherever the teacher is sitting.
    expect(formatDay('2026-09-07')).toBe('Mon 7 Sep');
    expect(formatDay('2026-01-01')).toBe('Thu 1 Jan');
    expect(formatDay('not-a-date')).toBe('not-a-date');
  });
});

describe('Class Insights — taking someone off the roll', () => {
  const oneClass = [
    { id: 'cls-1', name: '12BIO1', year: 12, school: 'Northmead High', students: 2 },
  ];

  const roll = [
    { username: 'jane.doe', display_name: 'Jane Doe', role: 'student' as const },
    { username: 'sam.teacher', display_name: 'Sam Teacher', role: 'co_teacher' as const },
  ];

  beforeEach(() => {
    vi.mocked(responseService.fetchMyClasses).mockResolvedValue(oneClass as never);
    vi.mocked(classService.fetchClassMembers).mockResolvedValue(roll);
    vi.mocked(classService.removeFromClass).mockResolvedValue(undefined);
  });

  const openRoll = async () => {
    renderInsights();
    fireEvent.click(await screen.findByRole('button', { name: /add a student/i }));
    return screen.findByText('Jane Doe');
  };

  it('shows who is actually on the roll, not just how many', async () => {
    await openRoll();
    // `list_my_classes` returns a count; a teacher told they have 2 students
    // could not learn which 2 until §24.
    expect(screen.getByText('Jane Doe')).toBeTruthy();
    expect(screen.getByText('Sam Teacher')).toBeTruthy();
    expect(screen.getByText('co-teacher')).toBeTruthy();
    expect(screen.getByText('2 on the roll')).toBeTruthy();
  });

  it('confirms before removing, naming who and what it costs', async () => {
    const showToast = vi.fn();
    render(<ClassInsightsModal isOpen onClose={vi.fn()} showToast={showToast} />);
    fireEvent.click(await screen.findByRole('button', { name: /add a student/i }));
    await screen.findByText('Jane Doe');

    fireEvent.click(screen.getByRole('button', { name: /remove jane\.doe from the class/i }));

    // Named, and honest that it is not a no-op for the figures.
    expect(screen.getByText('Remove from the class?')).toBeTruthy();
    expect(screen.getByText(/Jane Doe \(jane\.doe\)/)).toBeTruthy();
    expect(screen.getByText(/Their marked work is kept/)).toBeTruthy();
    // Nothing has happened yet.
    expect(classService.removeFromClass).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^remove$/i }));
    await waitFor(() =>
      expect(classService.removeFromClass).toHaveBeenCalledWith('cls-1', 'jane.doe')
    );
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('jane.doe removed from the class.', 'success')
    );
  });

  it('cancelling the confirmation removes nobody', async () => {
    await openRoll();
    fireEvent.click(screen.getByRole('button', { name: /remove jane\.doe from the class/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(classService.removeFromClass).not.toHaveBeenCalled();
    expect(screen.queryByText('Remove from the class?')).toBeNull();
  });

  it('surfaces a refused removal — the class owner — rather than reporting success', async () => {
    vi.mocked(classService.removeFromClass).mockRejectedValue(
      new Error(
        'Could not remove sam.teacher: That teacher owns this class; an admin reassigns it with create_class'
      )
    );
    const showToast = vi.fn();
    render(<ClassInsightsModal isOpen onClose={vi.fn()} showToast={showToast} />);
    fireEvent.click(await screen.findByRole('button', { name: /add a student/i }));
    await screen.findByText('Sam Teacher');

    fireEvent.click(screen.getByRole('button', { name: /remove sam\.teacher from the class/i }));
    fireEvent.click(screen.getByRole('button', { name: /^remove$/i }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        expect.stringContaining('That teacher owns this class'),
        'error'
      )
    );
  });

  it('still enrols on a database that predates §24 and has no roll to show', async () => {
    // `list_class_members` is absent there; the roll simply is not rendered and
    // the half that does exist keeps working.
    vi.mocked(classService.fetchClassMembers).mockRejectedValue(new Error('no such function'));
    renderInsights();
    fireEvent.click(await screen.findByRole('button', { name: /add a student/i }));

    await waitFor(() => expect(screen.queryByText(/on the roll/)).toBeNull());
    fireEvent.change(screen.getByLabelText(/username to enrol/i), {
      target: { value: 'jane.doe' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^enrol$/i }));
    await waitFor(() =>
      expect(classService.enrolInClass).toHaveBeenCalledWith('cls-1', 'jane.doe', 'student')
    );
  });
});
