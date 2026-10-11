import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The progress report's reads, against a chainable Supabase stub. Nothing here
 * reaches a real database: the RPC and the history query are asserted on their
 * arguments, and the error paths on the shape PostgREST returns.
 */

const getUserMock = vi.fn();
const rpcMock = vi.fn();
const fromMock = vi.fn();
const selectMock = vi.fn();
const eqMock = vi.fn();
const orderMock = vi.fn();
const limitMock = vi.fn();
const isRemoteMock = vi.fn();

vi.mock('../../services/supabaseClient', () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => getUserMock(...a) },
    rpc: (name: string, args: unknown) => rpcMock(name, args),
    from: (table: string) => {
      fromMock(table);
      return {
        select: (columns: string) => {
          selectMock(columns);
          return {
            eq: (col: string, value: unknown) => {
              eqMock(col, value);
              return {
                order: (column: string, opts: unknown) => {
                  orderMock(column, opts);
                  return { limit: (n: number) => limitMock(n) };
                },
              };
            },
          };
        },
      };
    },
  },
}));
vi.mock('../../services/curriculumService', () => ({
  isCurriculumRemote: () => isRemoteMock(),
}));
vi.mock('../../services/contributionService', () => ({
  resolvePromptRowId: vi.fn(),
  resolvePromptRowIds: vi.fn(),
  resolveCourseRowId: vi.fn(),
}));

import {
  fetchMyReportHistory,
  fetchProgressReport,
  ProgressReportUnavailableError,
} from '../../services/responseService';

beforeEach(() => {
  vi.clearAllMocks();
  isRemoteMock.mockReturnValue(true);
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  rpcMock.mockResolvedValue({
    data: { days: 90, weeks: 13, totals: { attempts: 0 } },
    error: null,
  });
});

describe('fetchProgressReport arguments', () => {
  it('sends only the window when no class or course is selected', async () => {
    await fetchProgressReport(90);
    expect(rpcMock).toHaveBeenCalledWith('get_progress_report', { p_days: 90 });
    expect(rpcMock.mock.calls[0][1]).not.toHaveProperty('p_class_id');
    expect(rpcMock.mock.calls[0][1]).not.toHaveProperty('p_course_id');
  });

  it('treats null, undefined and an empty string as "not selected"', async () => {
    await fetchProgressReport(30, null, null);
    await fetchProgressReport(30, undefined, undefined);
    await fetchProgressReport(30, '', '');
    for (const call of rpcMock.mock.calls) {
      expect(call[1]).toEqual({ p_days: 30 });
    }
  });

  it('sends p_course_id on its own when only a course is selected', async () => {
    await fetchProgressReport(365, null, 'course-row-uuid');
    expect(rpcMock).toHaveBeenLastCalledWith('get_progress_report', {
      p_days: 365,
      p_course_id: 'course-row-uuid',
    });
    expect(rpcMock.mock.calls[0][1]).not.toHaveProperty('p_class_id');
  });

  it('sends both p_class_id and p_course_id when both are selected', async () => {
    await fetchProgressReport(90, 'class-1', 'course-row-uuid');
    expect(rpcMock).toHaveBeenLastCalledWith('get_progress_report', {
      p_days: 90,
      p_class_id: 'class-1',
      p_course_id: 'course-row-uuid',
    });
  });

  it('sends p_class_id alone when only a class is selected', async () => {
    await fetchProgressReport(90, 'class-1');
    expect(rpcMock).toHaveBeenLastCalledWith('get_progress_report', {
      p_days: 90,
      p_class_id: 'class-1',
    });
    expect(rpcMock.mock.calls[0][1]).not.toHaveProperty('p_course_id');
  });
});

describe('fetchProgressReport results and errors', () => {
  it('maps PostgREST "no such function" (PGRST202) to ProgressReportUnavailableError', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST202',
        message:
          'Could not find the function public.get_progress_report(p_class_id, p_days) in the schema cache',
      },
    });
    const err = await fetchProgressReport(90).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProgressReportUnavailableError);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).name).toBe('ProgressReportUnavailableError');
  });

  it('recognises the same condition from the message alone', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'could not find the function get_progress_report' },
    });
    await expect(fetchProgressReport(90)).rejects.toBeInstanceOf(ProgressReportUnavailableError);
  });

  it('recognises Postgres undefined_function (42883) as the same missing database', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: '42883', message: 'function get_progress_report does not exist' },
    });
    await expect(fetchProgressReport(90)).rejects.toBeInstanceOf(ProgressReportUnavailableError);
  });

  it('throws a readable Error, not the unavailable type, for any other failure', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'Only admins/teachers can view the progress report' },
    });
    const err = await fetchProgressReport(90).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(ProgressReportUnavailableError);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe(
      'Could not build the progress report: Only admins/teachers can view the progress report'
    );
  });

  it('keeps the payload typed and fills the arrays a builder reads', async () => {
    rpcMock.mockResolvedValue({
      data: { days: 90, weeks: 13, totals: { attempts: 2, active_students: 1 } },
      error: null,
    });
    const payload = await fetchProgressReport(90);
    expect(payload.totals).toEqual({
      attempts: 2,
      active_students: 1,
      avg_band: null,
      avg_mark_frac: null,
      first_attempt_at: null,
      last_attempt_at: null,
    });
    expect(payload.byVerb).toEqual([]);
    expect(payload.byStudentWeek).toEqual([]);
    expect(payload.weekly).toEqual([]);
  });

  it('passes classCourse through, and reads it as null when the class has no course', async () => {
    rpcMock.mockResolvedValue({
      data: {
        days: 90,
        weeks: 13,
        totals: { attempts: 0 },
        classCourse: { course_id: 'c1', name: 'HSC Enterprise Computing' },
      },
      error: null,
    });
    const bound = await fetchProgressReport(90, 'class-1');
    expect(bound.classCourse).toEqual({ course_id: 'c1', name: 'HSC Enterprise Computing' });

    rpcMock.mockResolvedValue({
      data: { days: 90, weeks: 13, totals: { attempts: 0 }, classCourse: null },
      error: null,
    });
    const unbound = await fetchProgressReport(90, 'class-2');
    expect(unbound.classCourse).toBeNull();
  });

  it('leaves byClass undefined when the database omits it (a named class)', async () => {
    const payload = await fetchProgressReport(90, 'class-1');
    expect(payload.byClass).toBeUndefined();
    expect('byClass' in payload).toBe(false);
  });

  it('passes byClass through when the database sends it', async () => {
    rpcMock.mockResolvedValue({
      data: {
        days: 90,
        weeks: 13,
        totals: { attempts: 0 },
        byClass: [{ class_id: 'k1', name: 'Year 12 A', year: 12, students: 0, attempts: 0 }],
      },
      error: null,
    });
    const payload = await fetchProgressReport(90);
    expect(payload.byClass?.[0].name).toBe('Year 12 A');
  });
});

describe('fetchMyReportHistory', () => {
  it('resolves to null in local mode, without touching the database', async () => {
    isRemoteMock.mockReturnValue(false);
    await expect(fetchMyReportHistory()).resolves.toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('resolves to null for a caller with no session', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    await expect(fetchMyReportHistory()).resolves.toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('embeds the course and topic, reads only the caller’s rows, newest first, up to 1000', async () => {
    limitMock.mockResolvedValue({ data: [], error: null });
    await fetchMyReportHistory();

    expect(fromMock).toHaveBeenCalledWith('response_events');
    expect(selectMock.mock.calls[0][0]).toBe(
      'mark, band, word_count, created_at, prompts(verb,total_marks,dot_points(sub_topics(topics(name,courses(id,legacy_id,name)))))'
    );
    expect(eqMock).toHaveBeenCalledWith('user_id', 'user-1');
    expect(orderMock).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(limitMock).toHaveBeenCalledWith(1000);
  });

  it('honours a smaller limit, and keeps it a positive whole number', async () => {
    limitMock.mockResolvedValue({ data: [], error: null });
    await fetchMyReportHistory(50);
    expect(limitMock).toHaveBeenLastCalledWith(50);
    await fetchMyReportHistory(0);
    expect(limitMock).toHaveBeenLastCalledWith(1);
  });

  it('maps the embedded curriculum, and nulls it where RLS hides a level', async () => {
    limitMock.mockResolvedValue({
      data: [
        {
          mark: 5,
          band: 4,
          word_count: 180,
          created_at: '2026-09-08T10:00:00Z',
          prompts: {
            verb: 'analyse',
            total_marks: 6,
            dot_points: {
              sub_topics: {
                topics: {
                  name: 'Networks',
                  courses: {
                    id: 'uuid-ec',
                    legacy_id: 'course-ec-01',
                    name: 'Enterprise Computing',
                  },
                },
              },
            },
          },
        },
        {
          mark: 2,
          band: 2,
          word_count: 40,
          created_at: '2026-09-09T10:00:00Z',
          prompts: null,
        },
      ],
      error: null,
    });

    const attempts = await fetchMyReportHistory();
    expect(attempts).toHaveLength(2);
    expect(attempts?.[0]).toMatchObject({
      verb: 'ANALYSE',
      totalMarks: 6,
      course: { id: 'uuid-ec', legacyId: 'course-ec-01', name: 'Enterprise Computing' },
      topic: { name: 'Networks' },
    });
    expect(attempts?.[1]).toMatchObject({ verb: null, course: null, topic: null });
  });

  it('throws on a failed read, so the report can say it could not load the history', async () => {
    limitMock.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    await expect(fetchMyReportHistory()).rejects.toThrow('permission denied');
  });
});
