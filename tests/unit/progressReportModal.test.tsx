import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor, within, act } from '@testing-library/react';
import type { Course, User } from '../../types';
import type { ProgressReport } from '../../pdf/reportModel';
import type { OwnAttempt } from '../../utils/profileHistory';
import type { ProgressReportPayload, TeachingClass } from '../../services/responseService';

/**
 * The progress report's options dialog, and the profile entry that opens it.
 *
 * Every service is mocked: no test reaches Supabase, Gemini or the PDF engine.
 * The exporter is mocked at its own module, so each test can read the exact
 * report that a download would have printed.
 */

vi.mock('../../services/geminiService', () => ({}));
vi.mock('../../services/supabaseClient', () => ({ supabase: null }));
vi.mock('../../services/authService', () => ({
  authService: {
    getCurrentUser: () => null,
    updateUser: vi.fn(),
  },
}));
vi.mock('../../services/dataRightsService', () => ({
  downloadMyData: vi.fn(),
  deleteMyAccount: vi.fn(async () => ({ ok: true })),
}));
vi.mock('../../services/curriculumService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/curriculumService')>();
  return { ...actual, isCurriculumRemote: vi.fn(() => true) };
});
vi.mock('../../services/responseService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/responseService')>();
  return {
    ...actual,
    fetchMyReportHistory: vi.fn(),
    fetchProgressReport: vi.fn(),
    fetchMyClasses: vi.fn(),
  };
});
vi.mock('../../services/contributionService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/contributionService')>();
  return { ...actual, resolveCourseRowId: vi.fn() };
});
vi.mock('../../services/entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/entitlements')>();
  return {
    ...actual,
    isFeatureLocked: vi.fn(() => false),
    requestUpgrade: vi.fn(),
    fetchBillingLookup: async () => ({ status: 'none' }),
  };
});
vi.mock('../../pdf/exportProgressReport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../pdf/exportProgressReport')>();
  return { ...actual, exportProgressReportPdf: vi.fn(async () => ({ pages: 2 })) };
});

import ProgressReportModal from '../../components/ProgressReportModal';
import UserProfileModal from '../../components/UserProfileModal';
import { exportProgressReportPdf } from '../../pdf/exportProgressReport';
import {
  fetchMyClasses,
  fetchMyReportHistory,
  fetchProgressReport,
  ProgressReportUnavailableError,
} from '../../services/responseService';
import { resolveCourseRowId } from '../../services/contributionService';
import { isCurriculumRemote } from '../../services/curriculumService';
import { isFeatureLocked, requestUpgrade } from '../../services/entitlements';
import {
  defaultSectionsFor,
  periodChoicesFor,
  periodLine,
  reportAudienceFor,
  reportIsEmpty,
  reportSubjectFor,
  schoolNameFrom,
  sectionChoicesFor,
  summaryLine,
} from '../../utils/progressReportOptions';

const exportMock = vi.mocked(exportProgressReportPdf);
const historyMock = vi.mocked(fetchMyReportHistory);
const progressMock = vi.mocked(fetchProgressReport);
const classesMock = vi.mocked(fetchMyClasses);
const courseRowMock = vi.mocked(resolveCourseRowId);
const remoteMock = vi.mocked(isCurriculumRemote);
const lockedMock = vi.mocked(isFeatureLocked);
const upgradeMock = vi.mocked(requestUpgrade);

const DAY = 86_400_000;
const daysAgo = (n: number): string => new Date(Date.now() - n * DAY).toISOString();

const COURSES = [
  { id: 'course-a', name: 'Course A' },
  { id: 'course-b', name: 'Course B' },
] as unknown as Course[];

const CLASS_1: TeachingClass = {
  id: 'class-1',
  name: 'Year 11 Chemistry',
  year: 11,
  school: 'Ridgeview High',
  students: 2,
};

const makeUser = (role: User['role'], overrides: Partial<User> = {}): User =>
  ({
    username: 'ada@school.nsw.edu.au',
    displayName: 'Ada Lovelace',
    role,
    preferences: {
      theme: 'dark',
      defaultFocusMode: false,
      autoSave: true,
      highContrast: false,
      showTips: true,
    },
    stats: {
      xp: 465,
      level: 5,
      questionsAnswered: 12,
      totalWordsWritten: 900,
      averageBand: 3.2,
      streakDays: 4,
      lastActive: Date.now(),
      markShareMean: 0.6,
      markShareCount: 12,
    },
    ...overrides,
  }) as unknown as User;

const courseA = { id: 'course-a', legacyId: 'course-a', name: 'Course A' };
const courseB = { id: 'course-b', legacyId: 'course-b', name: 'Course B' };

const attempt = (overrides: Partial<OwnAttempt> = {}): OwnAttempt => ({
  at: daysAgo(2),
  band: 4,
  mark: 6,
  totalMarks: 10,
  verb: 'EXPLAIN',
  wordCount: 300,
  course: courseA,
  topic: { name: 'Topic 1', course: courseA },
  ...overrides,
});

/** A roster payload, as `get_progress_report()` returns it, with `attempts` answers in scope. */
const payload = (attempts = 12, withClasses = false): ProgressReportPayload => ({
  days: 90,
  weeks: 13,
  totals: {
    attempts,
    active_students: attempts > 0 ? 2 : 0,
    avg_band: attempts > 0 ? 3.5 : null,
    avg_mark_frac: attempts > 0 ? 0.6 : null,
    first_attempt_at: attempts > 0 ? daysAgo(30) : null,
    last_attempt_at: attempts > 0 ? daysAgo(1) : null,
  },
  byVerb: [{ label: 'EXPLAIN', attempts, students: 2, avg_band: 3.5, avg_mark_frac: 0.6 }],
  byCourse: [
    {
      course_id: 'uuid-a',
      label: 'Course A',
      attempts,
      students: 2,
      avg_band: 3.5,
      avg_mark_frac: 0.6,
    },
  ],
  byTopic: [],
  byStudent: [
    {
      username: 'sam@school',
      display_name: 'Sam Student',
      attempts: 7,
      avg_band: 4,
      avg_mark_frac: 0.7,
      last_active: daysAgo(1),
    },
    {
      username: 'lee@school',
      display_name: 'Lee Learner',
      attempts: 5,
      avg_band: 3,
      avg_mark_frac: 0.5,
      last_active: daysAgo(2),
    },
  ],
  byStudentVerb: [
    { username: 'sam@school', verb: 'EXPLAIN', attempts: 7, avg_band: 4, avg_mark_frac: 0.7 },
    { username: 'lee@school', verb: 'EXPLAIN', attempts: 5, avg_band: 3, avg_mark_frac: 0.5 },
  ],
  byStudentWeek: [],
  weekly: [{ week: 12, attempts, avg_band: 3.5, avg_mark_frac: 0.6 }],
  ...(withClasses
    ? {
        byClass: [
          {
            class_id: 'class-1',
            name: 'Year 11 Chemistry',
            year: 11,
            students: 2,
            attempts,
            avg_band: 3.5,
            avg_mark_frac: 0.6,
          },
        ],
      }
    : {}),
});

type DialogProps = React.ComponentProps<typeof ProgressReportModal>;

const renderDialog = (props: Partial<DialogProps> = {}) => {
  const onClose = vi.fn();
  const view = render(
    <ProgressReportModal
      isOpen
      onClose={onClose}
      user={makeUser('user')}
      courses={COURSES}
      showToast={vi.fn()}
      {...props}
    />
  );
  return { ...view, onClose };
};

const download = () => screen.getByRole('button', { name: /download pdf/i });

/** The report the most recent download would have printed. */
const lastExportedReport = (): ProgressReport => {
  const call = exportMock.mock.calls.at(-1);
  if (!call) throw new Error('No download was made');
  return call[0].report;
};

const readyStudentHistory = () => {
  historyMock.mockResolvedValue([attempt({ at: daysAgo(2) }), attempt({ at: daysAgo(4) })]);
};

beforeEach(() => {
  // Full reset, so no call count or queued one-off response leaks between tests.
  vi.resetAllMocks();
  window.localStorage.clear();
  historyMock.mockResolvedValue([]);
  progressMock.mockResolvedValue(payload());
  classesMock.mockResolvedValue([]);
  courseRowMock.mockImplementation(async (id: string) => (id === 'course-a' ? 'uuid-a' : null));
  remoteMock.mockReturnValue(true);
  lockedMock.mockReturnValue(false);
  exportMock.mockResolvedValue({ pages: 2 });
});

afterEach(cleanup);

// --- The pure rules --------------------------------------------------------------

describe('reportAudienceFor', () => {
  it('reads a student, a teacher and an administrator as their own report', () => {
    expect(reportAudienceFor('user')).toBe('student');
    expect(reportAudienceFor('teacher')).toBe('teacher');
    expect(reportAudienceFor('admin')).toBe('school');
  });

  it('gives a guest no report at all', () => {
    expect(reportAudienceFor('guest')).toBeNull();
  });
});

describe('scope choices', () => {
  it('offers All time to students only, since the roster RPC caps at 365 days', () => {
    expect(periodChoicesFor('student').map((c) => c.label)).toEqual([
      '30 days',
      '90 days',
      '12 months',
      'All time',
    ]);
    expect(periodChoicesFor('teacher').map((c) => c.label)).not.toContain('All time');
    expect(periodChoicesFor('school').map((c) => c.label)).not.toContain('All time');
  });

  it('switches on every section the audience sees, and only those', () => {
    const teacher = defaultSectionsFor('teacher');
    expect(teacher.students).toBe(true);
    expect(teacher.recent).toBe(false);
    expect(teacher.classes).toBe(false);

    const student = defaultSectionsFor('student');
    expect(student.recent).toBe(true);
    expect(student.students).toBe(false);

    expect(sectionChoicesFor('school').map((c) => c.key)).toContain('classes');
    expect(sectionChoicesFor('student').map((c) => c.key)).not.toContain('classes');
  });
});

describe('the summary line and dates', () => {
  it('names the period in Sydney time, as "12 Aug – 4 Oct"', () => {
    expect(periodLine('2026-08-12T02:00:00Z', '2026-10-04T02:00:00Z')).toBe('12 Aug – 4 Oct');
  });

  it('prints one date for a single day, and adds the years when they differ', () => {
    expect(periodLine('2026-08-12T02:00:00Z', '2026-08-12T05:00:00Z')).toBe('12 Aug');
    expect(periodLine('2025-08-12T02:00:00Z', '2026-10-04T02:00:00Z')).toBe(
      '12 Aug 2025 – 4 Oct 2026'
    );
  });

  it('prints no period when an attempt date is unknown', () => {
    expect(periodLine(null, '2026-10-04T02:00:00Z')).toBeNull();
  });

  it('reads "25 answers across 2 courses" with the period, and counts an empty scope as empty', () => {
    const report = {
      answerCount: 25,
      byCourse: [{ label: 'A' }, { label: 'B' }],
      scope: {
        firstAttemptAt: '2026-08-12T02:00:00Z',
        lastAttemptAt: '2026-10-04T02:00:00Z',
      },
    } as unknown as ProgressReport;
    expect(summaryLine(report)).toBe('25 answers across 2 courses · 12 Aug – 4 Oct');
    expect(reportIsEmpty(report)).toBe(false);

    const none = {
      ...report,
      answerCount: 0,
    } as unknown as ProgressReport;
    expect(reportIsEmpty(none)).toBe(true);
  });
});

describe('who the report is printed for', () => {
  it('uses the school of the caller classes when they share one', () => {
    expect(schoolNameFrom([CLASS_1, { ...CLASS_1, id: 'c2' }])).toBe('Ridgeview High');
    expect(schoolNameFrom([CLASS_1, { ...CLASS_1, id: 'c2', school: 'Other High' }])).toBeNull();
    expect(schoolNameFrom([])).toBeNull();
  });

  it('falls back to "Your school" for an administrator with no school known', () => {
    const subject = reportSubjectFor('school', 'admin', 'Principal', 'p@x', null);
    expect(subject.name).toBe('Your school');
    expect(subject.roleLabel).toBe('Administrator');
  });

  it('prints a teacher under their own name and school', () => {
    const subject = reportSubjectFor('teacher', 'teacher', 'Ms Grant', 't@x', 'Ridgeview High');
    expect(subject).toEqual({
      name: 'Ms Grant',
      roleLabel: 'Teacher',
      school: 'Ridgeview High',
    });
  });
});

// --- The dialog ------------------------------------------------------------------

describe('the dialog for each audience', () => {
  it('titles a student report "Progress report"', async () => {
    renderDialog({ user: makeUser('user') });
    expect(screen.getByRole('heading', { name: 'Progress report' })).toBeTruthy();
  });

  it('titles a teacher report "Class report"', async () => {
    renderDialog({ user: makeUser('teacher') });
    expect(screen.getByRole('heading', { name: 'Class report' })).toBeTruthy();
  });

  it('titles an administrator report "School report"', async () => {
    renderDialog({ user: makeUser('admin') });
    expect(screen.getByRole('heading', { name: 'School report' })).toBeTruthy();
  });

  it('is labelled as a modal dialog by its title', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog', { name: 'Progress report' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('renders nothing for a guest', () => {
    renderDialog({ user: makeUser('guest') });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders nothing while closed', () => {
    renderDialog({ isOpen: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('the student flow', () => {
  it('builds the report from history, filtered by course and period, and exports it', async () => {
    historyMock.mockResolvedValue([
      attempt({ at: daysAgo(2), course: courseA, band: 4, mark: 6 }),
      attempt({ at: daysAgo(5), course: courseA, band: 3, mark: 4, verb: 'DESCRIBE' }),
      attempt({ at: daysAgo(60), course: courseA }),
      attempt({ at: daysAgo(3), course: courseB }),
    ]);
    renderDialog();
    await waitFor(() => expect(download().hasAttribute('disabled')).toBe(false));

    fireEvent.change(screen.getByLabelText('Course'), { target: { value: 'course-a' } });
    fireEvent.click(screen.getByRole('button', { name: '30 days' }));
    fireEvent.click(screen.getByLabelText(/By command verb/));

    expect(await screen.findByText(/^2 answers across 1 course/)).toBeTruthy();
    fireEvent.click(download());
    await waitFor(() => expect(exportMock).toHaveBeenCalledTimes(1));

    const report = lastExportedReport();
    expect(report.audience).toBe('student');
    expect(report.scope.courseName).toBe('Course A');
    expect(report.scope.windowLabel).toBe('Last 30 days');
    expect(report.byCourse.map((row) => row.label)).toEqual(['Course A']);
    expect(report.headline.find((s) => s.label === 'Answers marked')?.value).toBe('2');
    expect(report.sections.verbs).toBe(false);
    expect(report.sections.trend).toBe(true);
    expect(exportMock.mock.calls[0][0].pageSize).toBe('a4');
    expect(historyMock).toHaveBeenCalledTimes(1);
  });

  it('reads the history once per open, not again when the period changes', async () => {
    readyStudentHistory();
    renderDialog();
    await waitFor(() => expect(download().hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '90 days' }));
    fireEvent.click(screen.getByRole('button', { name: 'All time' }));
    await waitFor(() => expect(download().hasAttribute('disabled')).toBe(false));
    expect(historyMock).toHaveBeenCalledTimes(1);
  });

  it('shows the loading state, and does not allow a download while it loads', () => {
    historyMock.mockReturnValue(new Promise(() => {}));
    renderDialog();
    expect(screen.getByText('Loading your answers…')).toBeTruthy();
    expect(download().hasAttribute('disabled')).toBe(true);
  });

  it('shows the error with a retry, which reads the history again', async () => {
    historyMock
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([attempt({ at: daysAgo(2) })]);
    renderDialog();
    expect(await screen.findByText(/could not be loaded/)).toBeTruthy();
    expect(download().hasAttribute('disabled')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(download().hasAttribute('disabled')).toBe(false));
    expect(historyMock).toHaveBeenCalledTimes(2);
  });

  it('uses the saved totals, and says so, when there is no online history', async () => {
    historyMock.mockResolvedValue(null);
    renderDialog();
    expect(await screen.findByText(/^12 answers/)).toBeTruthy();
    expect(screen.getByText('Your report will use your saved totals only.')).toBeTruthy();
    await waitFor(() => expect(download().hasAttribute('disabled')).toBe(false));

    fireEvent.click(download());
    await waitFor(() => expect(exportMock).toHaveBeenCalledTimes(1));
    const report = lastExportedReport();
    expect(report.scope.courseName).toBeNull();
    expect(report.notes.join(' ')).toMatch(/Answer history is kept for signed-in accounts/);
  });

  it('locks the course and period controls when there is no history, and says why', async () => {
    historyMock.mockResolvedValue(null);
    renderDialog();
    await screen.findByText(/^12 answers/);

    const course = screen.getByLabelText('Course') as HTMLSelectElement;
    expect(course.getAttribute('aria-disabled')).toBe('true');
    const reason = screen.getByText(
      'Period and course need your answer history, which is kept for signed-in accounts.'
    );
    expect(course.getAttribute('aria-describedby')).toBe(reason.id);

    const thirtyDays = screen.getByRole('button', { name: '30 days' });
    expect(thirtyDays.getAttribute('aria-disabled')).toBe('true');
    expect(thirtyDays.getAttribute('aria-describedby')).toBe(reason.id);
    // The period shown is the one the report will use: all time.
    expect(screen.getByRole('button', { name: 'All time' }).getAttribute('aria-pressed')).toBe(
      'true'
    );
  });

  it('ignores presses on the locked controls, and prints all time with no course filter', async () => {
    historyMock.mockResolvedValue(null);
    renderDialog();
    await screen.findByText(/^12 answers/);

    const course = screen.getByLabelText('Course') as HTMLSelectElement;
    fireEvent.change(course, { target: { value: 'course-a' } });
    expect(course.value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: '30 days' }));
    expect(screen.getByRole('button', { name: '30 days' }).getAttribute('aria-pressed')).toBe(
      'false'
    );
    expect(screen.getByRole('button', { name: 'All time' }).getAttribute('aria-pressed')).toBe(
      'true'
    );

    await waitFor(() => expect(download().hasAttribute('disabled')).toBe(false));
    fireEvent.click(download());
    await waitFor(() => expect(exportMock).toHaveBeenCalledTimes(1));
    const report = lastExportedReport();
    expect(report.scope.windowLabel).toBe('All time');
    expect(report.scope.courseName).toBeNull();
    // The note about filters that were not applied never prints, because none was chosen.
    expect(report.notes.join(' ')).not.toMatch(/filters you chose/);
  });

  it('locks the controls for an account with an empty history, with its own reason', async () => {
    historyMock.mockResolvedValue([]);
    renderDialog();
    await waitFor(() => expect(download().hasAttribute('disabled')).toBe(false));

    expect(screen.getByLabelText('Course').getAttribute('aria-disabled')).toBe('true');
    expect(
      screen.getByText('Period and course apply once you have marked answers in your history.')
    ).toBeTruthy();

    fireEvent.click(download());
    await waitFor(() => expect(exportMock).toHaveBeenCalledTimes(1));
    const report = lastExportedReport();
    expect(report.scope.windowLabel).toBe('All time');
    expect(report.notes.join(' ')).not.toMatch(/filters you chose/);
  });

  it('leaves the controls live when there is history to filter', async () => {
    readyStudentHistory();
    renderDialog();
    await waitFor(() => expect(download().hasAttribute('disabled')).toBe(false));

    expect(screen.getByLabelText('Course').getAttribute('aria-disabled')).toBeNull();
    expect(
      screen.getByRole('button', { name: '30 days' }).getAttribute('aria-disabled')
    ).toBeNull();
    expect(screen.queryByText(/Period and course need your answer history/)).toBeNull();
  });

  it('disables the download with the reason when no answers fall in the scope', async () => {
    readyStudentHistory();
    renderDialog();
    await waitFor(() => expect(download().hasAttribute('disabled')).toBe(false));

    // Every answer in the history is on course A, so course B has none in scope.
    fireEvent.change(screen.getByLabelText('Course'), { target: { value: 'course-b' } });

    expect(await screen.findByText(/No marked answers in this scope/)).toBeTruthy();
    expect(download().hasAttribute('disabled')).toBe(true);
    fireEvent.click(download());
    expect(exportMock).not.toHaveBeenCalled();
  });
});

describe('the teacher flow', () => {
  it('passes the class, the course and the period to the aggregate', async () => {
    classesMock.mockResolvedValue([CLASS_1]);
    renderDialog({ user: makeUser('teacher') });

    await waitFor(() => expect(screen.getByLabelText('Class')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Class'), { target: { value: 'class-1' } });
    await waitFor(() => expect(progressMock).toHaveBeenLastCalledWith(90, 'class-1', null));

    await waitFor(() => expect(courseRowMock).toHaveBeenCalledWith('course-a'));
    await waitFor(() => expect(download().hasAttribute('disabled')).toBe(false));
    fireEvent.change(screen.getByLabelText('Course'), { target: { value: 'course-a' } });
    fireEvent.click(screen.getByRole('button', { name: '30 days' }));
    await waitFor(() => expect(progressMock).toHaveBeenLastCalledWith(30, 'class-1', 'uuid-a'));
  });

  it('ignores a response for an earlier scope that arrives after a newer one', async () => {
    classesMock.mockResolvedValue([CLASS_1]);
    let resolveStale!: (value: ProgressReportPayload) => void;
    progressMock
      .mockImplementationOnce(
        () =>
          new Promise<ProgressReportPayload>((resolve) => {
            resolveStale = resolve;
          })
      )
      .mockResolvedValue(payload(2));

    renderDialog({ user: makeUser('teacher') });
    await waitFor(() => expect(screen.getByLabelText('Class')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Class'), { target: { value: 'class-1' } });

    expect(await screen.findByText(/^2 answers/)).toBeTruthy();
    await act(async () => {
      resolveStale(payload(99));
    });

    expect(screen.getByText(/^2 answers/)).toBeTruthy();
    expect(screen.queryByText(/^99 answers/)).toBeNull();
    fireEvent.click(download());
    await waitFor(() => expect(exportMock).toHaveBeenCalledTimes(1));
    expect(lastExportedReport().headline.find((s) => s.label === 'Answers marked')?.value).toBe(
      '2'
    );
  });

  it('offers no class picker when the caller has no classes', async () => {
    classesMock.mockResolvedValue([]);
    renderDialog({ user: makeUser('teacher') });
    await waitFor(() => expect(download().hasAttribute('disabled')).toBe(false));
    expect(screen.queryByLabelText('Class')).toBeNull();
  });

  it('disables a course that is not in the shared library, with the reason', async () => {
    courseRowMock.mockImplementation(async (id: string) => (id === 'course-a' ? 'uuid-a' : null));
    renderDialog({ user: makeUser('teacher') });

    await waitFor(() => expect(courseRowMock).toHaveBeenCalledTimes(2));
    const option = await screen.findByRole('option', { name: /Course B/ });
    expect((option as HTMLOptionElement).disabled).toBe(true);
    expect(option.textContent).toMatch(/not in the shared library/);
    const courseA = screen.getByRole('option', { name: 'Course A' });
    expect((courseA as HTMLOptionElement).disabled).toBe(false);
  });

  it('says the report needs a database update when the function is missing, and disables download and course filtering', async () => {
    progressMock.mockRejectedValue(new ProgressReportUnavailableError());
    renderDialog({ user: makeUser('teacher') });

    expect(await screen.findByText(/Class and school reports need a database update/)).toBeTruthy();
    expect(download().hasAttribute('disabled')).toBe(true);
    expect((screen.getByLabelText('Course') as HTMLSelectElement).disabled).toBe(true);
  });

  it('disables the download when no answers are in the classes for this period', async () => {
    progressMock.mockResolvedValue(payload(0));
    renderDialog({ user: makeUser('teacher') });
    expect(await screen.findByText(/No marked answers in this scope/)).toBeTruthy();
    expect(download().hasAttribute('disabled')).toBe(true);
  });

  it('says the class report needs the shared database when this copy is not connected', async () => {
    remoteMock.mockReturnValue(false);
    renderDialog({ user: makeUser('teacher') });
    expect(
      await screen.findByText(
        /come from the shared database, which this copy of the app is not connected to/
      )
    ).toBeTruthy();
    expect(download().hasAttribute('disabled')).toBe(true);
    expect(progressMock).not.toHaveBeenCalled();
  });

  it('anonymises the names when the names toggle is switched off, without reading again', async () => {
    progressMock.mockResolvedValue(payload(12));
    renderDialog({ user: makeUser('teacher') });
    await waitFor(() => expect(download().hasAttribute('disabled')).toBe(false));

    fireEvent.click(download());
    await waitFor(() => expect(exportMock).toHaveBeenCalledTimes(1));
    let report = lastExportedReport();
    expect(report.anonymised).toBe(false);
    expect(report.students?.[0]?.name).toMatch(/Student|Sam|Lee/);
    expect(report.students?.some((s) => s.name === 'Sam Student')).toBe(true);

    fireEvent.click(screen.getByLabelText(/Include student names/));
    fireEvent.click(download());
    await waitFor(() => expect(exportMock).toHaveBeenCalledTimes(2));
    report = lastExportedReport();
    expect(report.anonymised).toBe(true);
    expect(report.students?.map((s) => s.name).sort()).toEqual(['Student 1', 'Student 2']);
    expect(progressMock).toHaveBeenCalledTimes(1);
  });

  it('names the school in the header, and offers the classes table to an administrator', async () => {
    classesMock.mockResolvedValue([CLASS_1]);
    progressMock.mockResolvedValue(payload(12, true));
    renderDialog({ user: makeUser('admin') });

    expect(await screen.findByText(/Ridgeview High · Administrator/)).toBeTruthy();
    const classesRow = screen.getByLabelText(/Classes table/) as HTMLInputElement;
    expect(classesRow.checked).toBe(true);
    expect(classesRow.disabled).toBe(false);

    fireEvent.change(screen.getByLabelText('Class'), { target: { value: 'class-1' } });
    await waitFor(() =>
      expect((screen.getByLabelText(/Classes table/) as HTMLInputElement).disabled).toBe(true)
    );
    expect(screen.getByText(/Shown when every class is included/)).toBeTruthy();
  });
});

describe('the download', () => {
  it('asks for the upgrade and never exports when the plan is locked', async () => {
    readyStudentHistory();
    lockedMock.mockReturnValue(true);
    renderDialog();
    await waitFor(() => expect(download().hasAttribute('disabled')).toBe(false));

    fireEvent.click(download());
    expect(upgradeMock).toHaveBeenCalledWith('pdfExport');
    expect(exportMock).not.toHaveBeenCalled();
  });

  it('remembers the paper size, and prints on it', async () => {
    readyStudentHistory();
    renderDialog();
    await waitFor(() => expect(download().hasAttribute('disabled')).toBe(false));

    fireEvent.click(screen.getByRole('button', { name: 'Letter' }));
    const stored = JSON.parse(window.localStorage.getItem('hsc.pdfExportPreferences') ?? '{}');
    expect(stored.pageSize).toBe('letter');

    fireEvent.click(download());
    await waitFor(() => expect(exportMock).toHaveBeenCalledTimes(1));
    expect(exportMock.mock.calls[0][0].pageSize).toBe('letter');
  });

  it('prints the administrator school under the school name', async () => {
    classesMock.mockResolvedValue([CLASS_1]);
    renderDialog({ user: makeUser('admin') });
    // The school name arrives with the class list, so wait for it before printing.
    await screen.findByText(/Ridgeview High · Administrator/);
    await waitFor(() => expect(download().hasAttribute('disabled')).toBe(false));
    fireEvent.click(download());
    await waitFor(() => expect(exportMock).toHaveBeenCalledTimes(1));
    expect(lastExportedReport().subject.name).toBe('Ridgeview High');
    expect(lastExportedReport().title).toBe('School report');
  });
});

describe('dialog behaviour', () => {
  it('closes on Escape', () => {
    const { onClose } = renderDialog();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on a click on the backdrop, but not inside the dialog', () => {
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('dialog').parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps Tab inside the dialog, wrapping from the last control to the first', async () => {
    readyStudentHistory();
    renderDialog();
    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(document.activeElement).toBe(dialog));
    // Download is disabled while the history loads, and a disabled button cannot take
    // focus — so on a slow machine the Tab below would start from the dialog, not from
    // the last control. Wait for the ready state before moving focus.
    await waitFor(() => expect((download() as HTMLButtonElement).disabled).toBe(false));

    const download0 = download();
    download0.focus();
    fireEvent.keyDown(download0, { key: 'Tab' });

    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
  });

  it('keeps the controls labelled, with the paper and period groups named', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('group', { name: 'Period' })).toBeTruthy();
    expect(within(dialog).getByRole('group', { name: 'Paper' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });
});

// --- The profile entry -----------------------------------------------------------

const renderProfile = (user: User, onOpenProgressReport = vi.fn()) => {
  render(
    <UserProfileModal
      isOpen
      onClose={() => {}}
      user={user}
      onUpdateUser={() => {}}
      onLogout={() => {}}
      onOpenProgressReport={onOpenProgressReport}
    />
  );
  return onOpenProgressReport;
};

describe('the profile entry point', () => {
  it.each([
    ['a student', 'user'],
    ['a teacher', 'teacher'],
    ['an administrator', 'admin'],
  ] as const)('offers the download to %s on the Stats tab', (_label, role) => {
    renderProfile(makeUser(role));
    expect(screen.getByRole('button', { name: /download progress report/i })).toBeTruthy();
  });

  it('never offers the download to a guest', () => {
    renderProfile(makeUser('guest'));
    expect(screen.queryByRole('button', { name: /download progress report/i })).toBeNull();
  });

  it('hands off to the report when it is pressed', () => {
    const onOpen = renderProfile(makeUser('user'));
    fireEvent.click(screen.getByRole('button', { name: /download progress report/i }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
