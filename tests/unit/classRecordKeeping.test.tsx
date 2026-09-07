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
  return { ...actual, enrolInClass: vi.fn(), createClass: vi.fn() };
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
