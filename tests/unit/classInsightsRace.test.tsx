import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import ClassInsightsModal from '../../components/admin/ClassInsightsModal';
import StudentProgressModal from '../../components/admin/StudentProgressModal';
import * as responseService from '../../services/responseService';
import * as curriculumService from '../../services/curriculumService';

/**
 * Class Insights fires a fresh fetch on every control — window, class and
 * dimension — so several are routinely in flight at once. These pin that the
 * NEWEST REQUEST wins rather than the last response to arrive.
 *
 * The distinction is not cosmetic. Losing the race on the window control paints
 * one period's figures under another's heading; losing it on the class picker
 * shows one class's students under another class's name, on the very panel whose
 * purpose is to keep a teacher inside the classes they actually teach.
 */

vi.mock('../../services/responseService', async (importOriginal) => {
  const actual = await importOriginal<typeof responseService>();
  return {
    ...actual,
    fetchClassAnalytics: vi.fn(),
    fetchClassCohort: vi.fn(),
    fetchMyClasses: vi.fn(),
    fetchStudentProgress: vi.fn(),
    fetchResponseStudents: vi.fn(),
  };
});

vi.mock('../../services/curriculumService', async (importOriginal) => {
  const actual = await importOriginal<typeof curriculumService>();
  return { ...actual, isCurriculumRemote: vi.fn(() => true) };
});

const mocked = vi.mocked(responseService);

/** A one-row analytics payload whose verb label identifies which call produced it. */
const analyticsFor = (label: string): responseService.ClassAnalytics => ({
  byVerb: [
    {
      label,
      attempts: 10,
      students: 3,
      avg_mark: 4,
      avg_band: 4,
      low_band_rate: 0.5,
      avg_mark_frac: 0.5,
    },
  ],
  byTopic: [],
  totals: { total_attempts: 10, active_students: 3, avg_band: 4 },
});

/** A promise plus the handle to settle it, so a test controls arrival order. */
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const CLASSES: responseService.TeachingClass[] = [
  { id: 'c1', name: 'Class One', year: 12, school: 'Demo High', students: 4 },
  { id: 'c2', name: 'Class Two', year: 12, school: 'Demo High', students: 5 },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const open = () =>
  render(<ClassInsightsModal isOpen={true} onClose={vi.fn()} showToast={vi.fn()} />);

describe('Class Insights — the newest request wins', () => {
  it('ignores a superseded window response that arrives last', async () => {
    mocked.fetchMyClasses.mockResolvedValue([]);

    const first = deferred<responseService.ClassAnalytics>(); // the 30d default
    const second = deferred<responseService.ClassAnalytics>(); // after clicking 90d
    mocked.fetchClassAnalytics
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    open();

    // Switch to the 90-day window while the 30-day call is still out.
    fireEvent.click(await screen.findByRole('button', { name: '90d' }));
    await waitFor(() => expect(mocked.fetchClassAnalytics).toHaveBeenCalledTimes(2));

    // The 90-day answer lands first, then the stale 30-day one.
    second.resolve(analyticsFor('NinetyDayVerb'));
    await screen.findByText('NinetyDayVerb');
    first.resolve(analyticsFor('ThirtyDayVerb'));

    // The stale payload must never replace the one the user asked for.
    await waitFor(() => expect(screen.queryByText('ThirtyDayVerb')).toBeNull());
    expect(screen.queryByText('NinetyDayVerb')).not.toBeNull();
  });

  it('never shows one class’s figures under another class’s name', async () => {
    mocked.fetchMyClasses.mockResolvedValue(CLASSES);

    const initial = deferred<responseService.ClassAnalytics>();
    const classOne = deferred<responseService.ClassAnalytics>();
    const classTwo = deferred<responseService.ClassAnalytics>();
    mocked.fetchClassAnalytics
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(classOne.promise)
      .mockReturnValueOnce(classTwo.promise);

    open();
    initial.resolve(analyticsFor('AllClassesVerb'));
    await screen.findByText('AllClassesVerb');

    // Click through to Class One, then straight on to Class Two.
    fireEvent.click(await screen.findByRole('button', { name: 'Class One' }));
    await waitFor(() => expect(mocked.fetchClassAnalytics).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: 'Class Two' }));
    await waitFor(() => expect(mocked.fetchClassAnalytics).toHaveBeenCalledTimes(3));

    // Changing scope must clear the previous class's figures immediately, rather
    // than leaving them on screen under the newly selected class's name.
    expect(screen.queryByText('AllClassesVerb')).toBeNull();

    classTwo.resolve(analyticsFor('ClassTwoVerb'));
    await screen.findByText('ClassTwoVerb');

    // Class One's response arrives late; it must not overwrite Class Two's.
    classOne.resolve(analyticsFor('ClassOneVerb'));
    await waitFor(() => expect(screen.queryByText('ClassOneVerb')).toBeNull());
    expect(screen.queryByText('ClassTwoVerb')).not.toBeNull();
  });

  it('does not surface an error from a request the user has already moved past', async () => {
    mocked.fetchMyClasses.mockResolvedValue([]);
    const showToast = vi.fn();

    const first = deferred<responseService.ClassAnalytics>();
    const second = deferred<responseService.ClassAnalytics>();
    mocked.fetchClassAnalytics
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    render(<ClassInsightsModal isOpen={true} onClose={vi.fn()} showToast={showToast} />);

    fireEvent.click(await screen.findByRole('button', { name: '90d' }));
    await waitFor(() => expect(mocked.fetchClassAnalytics).toHaveBeenCalledTimes(2));

    second.resolve(analyticsFor('NinetyDayVerb'));
    await screen.findByText('NinetyDayVerb');

    // The abandoned 30-day call now fails. The user is not waiting on it, so
    // there is nothing they could do about it and no toast to justify.
    first.reject(new Error('30-day call failed'));
    await waitFor(() => expect(screen.queryByText('NinetyDayVerb')).not.toBeNull());
    expect(showToast).not.toHaveBeenCalled();
  });
});

describe('Student Progress — the newest lookup wins', () => {
  /** A progress payload that names the student it belongs to. */
  const progressFor = (username: string): responseService.StudentProgress => ({
    username,
    byVerb: [],
    totals: { total_attempts: 4, active_students: 1, avg_band: 4 },
    trend: [],
  });

  it('ignores a superseded lookup that arrives last', async () => {
    mocked.fetchResponseStudents.mockResolvedValue([]);

    const aisha = deferred<responseService.StudentProgress>();
    const jayden = deferred<responseService.StudentProgress>();
    mocked.fetchStudentProgress
      .mockReturnValueOnce(aisha.promise)
      .mockReturnValueOnce(jayden.promise);

    render(<StudentProgressModal isOpen={true} onClose={vi.fn()} showToast={vi.fn()} />);

    // The username field stays live while a lookup runs, so a teacher can start
    // a second one from the keyboard before the first has come back.
    const field = screen.getByPlaceholderText('e.g. jsmith');
    fireEvent.change(field, { target: { value: 'demo.aisha' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    fireEvent.change(field, { target: { value: 'demo.jayden' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() => expect(mocked.fetchStudentProgress).toHaveBeenCalledTimes(2));

    // Jayden — the student actually asked for — answers first.
    jayden.resolve(progressFor('demo.jayden'));
    await screen.findByText('demo.jayden');

    // Aisha's abandoned lookup lands afterwards and must be discarded.
    aisha.resolve(progressFor('demo.aisha'));
    await waitFor(() => expect(screen.queryByText('demo.aisha')).toBeNull());
    expect(screen.queryByText('demo.jayden')).not.toBeNull();
  });

  it('does not surface an error from a lookup the user has already moved past', async () => {
    mocked.fetchResponseStudents.mockResolvedValue([]);
    const showToast = vi.fn();

    const aisha = deferred<responseService.StudentProgress>();
    const jayden = deferred<responseService.StudentProgress>();
    mocked.fetchStudentProgress
      .mockReturnValueOnce(aisha.promise)
      .mockReturnValueOnce(jayden.promise);

    render(<StudentProgressModal isOpen={true} onClose={vi.fn()} showToast={showToast} />);

    const field = screen.getByPlaceholderText('e.g. jsmith');
    fireEvent.change(field, { target: { value: 'demo.aisha' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    fireEvent.change(field, { target: { value: 'demo.jayden' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() => expect(mocked.fetchStudentProgress).toHaveBeenCalledTimes(2));

    jayden.resolve(progressFor('demo.jayden'));
    await screen.findByText('demo.jayden');

    // The abandoned lookup fails. It must not clear the result the teacher is
    // reading, nor raise a toast about a request they did not wait for.
    aisha.reject(new Error('lookup failed'));
    await waitFor(() => expect(screen.queryByText('demo.jayden')).not.toBeNull());
    expect(showToast).not.toHaveBeenCalled();
  });
});
