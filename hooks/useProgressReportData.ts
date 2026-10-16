import { useEffect, useRef, useState } from 'react';
import {
  fetchMyClasses,
  fetchMyReportHistory,
  fetchProgressReport,
  ProgressReportUnavailableError,
  type ProgressReportPayload,
  type TeachingClass,
} from '../services/responseService';
import { resolveCourseRowId } from '../services/contributionService';
import type { OwnAttempt } from '../utils/profileHistory';

/**
 * The data behind the progress report's options panel.
 *
 * Every hook here guards its responses with a request id: a request only writes
 * state if it is still the latest one. So a slow earlier response cannot overwrite
 * the newer scope the user has already moved to, and a response that lands after
 * the dialog has closed writes nothing.
 */

/** A student's own history. `history` is null when there is no online account to read. */
export type OwnHistoryState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; history: OwnAttempt[] | null; readAt: string };

/** Reads the student's own answers once per open, or again when `attempt` changes (Try again). */
export const useOwnReportHistory = (enabled: boolean, attempt: number): OwnHistoryState => {
  const [state, setState] = useState<OwnHistoryState>({ status: 'loading' });
  const requestRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const id = ++requestRef.current;
    setState({ status: 'loading' });
    fetchMyReportHistory().then(
      (history) => {
        if (id !== requestRef.current) return;
        setState({ status: 'ready', history, readAt: new Date().toISOString() });
      },
      () => {
        if (id === requestRef.current) setState({ status: 'error' });
      }
    );
    return () => {
      // Anything still in flight is now stale.
      requestRef.current++;
    };
  }, [enabled, attempt]);

  return state;
};

/** The scope a class or school report is read for. Null means nothing is read yet. */
export interface RosterScope {
  days: number;
  classId: string | null;
  /** The course's database uuid, when the report is filtered to one course. */
  courseRowId: string | null;
}

export type RosterState =
  | { status: 'loading' }
  | { status: 'error' }
  /** The database has no `get_progress_report()` (it predates the progress report). */
  | { status: 'unavailable' }
  | { status: 'ready'; payload: ProgressReportPayload; readAt: string };

/**
 * Reads the teacher's or school's aggregate for one scope. Re-reads when the
 * period, class, course or `attempt` changes; not when a section or name toggle does.
 *
 * `scope` null means nothing should be read (a course is still being checked, or
 * there is no shared database). The state it returns is always for the scope it was
 * asked about: a result from a previous scope is reported as `loading`, never shown.
 */
export const useRosterReport = (scope: RosterScope | null, attempt: number): RosterState => {
  const enabled = scope !== null;
  const days = scope?.days ?? 0;
  const classId = scope?.classId ?? null;
  const courseRowId = scope?.courseRowId ?? null;
  const key = `${days}|${classId ?? ''}|${courseRowId ?? ''}|${attempt}`;

  const [result, setResult] = useState<{ key: string; state: RosterState } | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const id = ++requestRef.current;
    fetchProgressReport(days, classId, courseRowId).then(
      (payload) => {
        if (id !== requestRef.current) return;
        setResult({
          key,
          state: { status: 'ready', payload, readAt: new Date().toISOString() },
        });
      },
      (err: unknown) => {
        if (id !== requestRef.current) return;
        setResult({
          key,
          state:
            err instanceof ProgressReportUnavailableError
              ? { status: 'unavailable' }
              : { status: 'error' },
        });
      }
    );
    return () => {
      requestRef.current++;
    };
    // `key` carries every input the request depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);

  if (!enabled) return { status: 'loading' };
  if (result === null || result.key !== key) return { status: 'loading' };
  return result.state;
};

/**
 * Whether a course in the app has a row in the shared library the school report can
 * filter by. `pending` until the lookup answers; `blocked` when it does not, or fails.
 */
export type CourseRowState =
  | { status: 'pending' }
  | { status: 'ready'; rowId: string }
  | { status: 'missing' }
  | { status: 'error' };

const PENDING: CourseRowState = { status: 'pending' };

/**
 * Looks up the database uuid of every course in one pass, so each course option can
 * say up front whether it can be filtered by. Only runs when `enabled`.
 */
export const useCourseRowIds = (
  courseIds: readonly string[],
  enabled: boolean
): Record<string, CourseRowState> => {
  const key = courseIds.join('\u0001');
  const [rows, setRows] = useState<{ key: string; byId: Record<string, CourseRowState> }>({
    key: '',
    byId: {},
  });
  const requestRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const id = ++requestRef.current;
    const ids = key === '' ? [] : key.split('\u0001');
    Promise.all(
      ids.map(async (appId): Promise<[string, CourseRowState]> => {
        try {
          const rowId = await resolveCourseRowId(appId);
          return [appId, rowId ? { status: 'ready', rowId } : { status: 'missing' }];
        } catch {
          return [appId, { status: 'error' }];
        }
      })
    ).then((entries) => {
      if (id !== requestRef.current) return;
      setRows({ key, byId: Object.fromEntries(entries) });
    });
    return () => {
      requestRef.current++;
    };
  }, [enabled, key]);

  if (!enabled || rows.key !== key) {
    return Object.fromEntries(courseIds.map((appId) => [appId, PENDING]));
  }
  return rows.byId;
};

/** The classes the caller can report on. `null` while loading; `[]` when there are none. */
export const useTeachingClasses = (enabled: boolean): TeachingClass[] | null => {
  const [classes, setClasses] = useState<TeachingClass[] | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchMyClasses().then(
      (list) => {
        if (!cancelled) setClasses(list);
      },
      () => {
        if (!cancelled) setClasses([]);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return enabled ? classes : null;
};
