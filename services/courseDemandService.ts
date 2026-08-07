/**
 * Course demand — the queue for courses this deployment doesn't carry yet.
 *
 * Creating a course is admin-only (`canCreateCurriculum`), which keeps the
 * shared syllabus tree coherent but leaves everyone else with no way to say
 * "the course I teach isn't here". This is that way: a request goes into
 * `course_requests` (schema §21), one row per course and one voice per person,
 * and an admin reads the list back ordered by how many people are waiting.
 *
 * Enforcement and de-duplication both live in Postgres. This module is the
 * client's view of it and nothing more.
 *
 * Every function degrades rather than throwing when Supabase is absent: the
 * app runs offline-first, and a local-only session must not see an error for a
 * feature that simply has no backend to reach.
 */
import { supabase } from './supabaseClient';

/** What the server says came of a request. */
export interface CourseRequestResult {
  name: string;
  status: CourseRequestStatus;
  /** How many DISTINCT people have asked for this course, including the caller. */
  requesters: number;
  /** True when this caller had already asked — the note was updated, not added. */
  alreadyAsked: boolean;
}

export type CourseRequestStatus = 'new' | 'planned' | 'available' | 'declined';

/** One row of the admin demand list. */
export interface CourseDemandRow {
  id: string;
  name: string;
  status: CourseRequestStatus;
  adminNotes: string | null;
  firstRequested: string;
  lastRequested: string | null;
  requesters: number;
  /** How many of the requesters are staff — a different signal from students. */
  teachers: number;
  notes: Array<{ note: string; role: string; at: string }>;
}

/** Thrown when the feature has no backend on this deployment. */
export class CourseDemandUnavailableError extends Error {
  constructor() {
    super('Course requests need the shared backend, which this deployment is not connected to.');
    this.name = 'CourseDemandUnavailableError';
  }
}

const requireClient = () => {
  if (!supabase) throw new CourseDemandUnavailableError();
  return supabase;
};

/** True when requests can be logged at all — drives whether the link is shown. */
export const isCourseDemandAvailable = (): boolean => !!supabase;

/**
 * Register interest in a course. Idempotent per user: asking again updates the
 * note rather than inflating the count.
 */
export const requestCourse = async (name: string, note?: string): Promise<CourseRequestResult> => {
  const { data, error } = await requireClient().rpc('log_course_request', {
    // Trimmed here as well as server-side: the RPC's length check counts what
    // it is sent, so trailing whitespace from a paste should not be what
    // pushes a legitimate name over the limit.
    p_name: name.trim(),
    p_note: note?.trim() ? note.trim() : null,
  });
  if (error) {
    // The RPC raises for a blank or over-long name; those messages are written
    // for the person typing, so they are passed through as-is.
    throw new Error(error.message || 'Could not log that course request.');
  }
  return data as CourseRequestResult;
};

/**
 * The demand list for reviewers, busiest first. `includeClosed` brings back
 * requests already marked available or declined, which is history rather than
 * a queue — off by default so the list stays a to-do.
 */
export const fetchCourseDemand = async (includeClosed = false): Promise<CourseDemandRow[]> => {
  const { data, error } = await requireClient().rpc('list_course_requests', {
    p_include_closed: includeClosed,
  });
  if (error) throw new Error(`Could not load course demand: ${error.message}`);
  return (data ?? []) as CourseDemandRow[];
};

/** Admin-only: move a request along and leave a note for the next admin. */
export const setCourseRequestStatus = async (
  id: string,
  status: CourseRequestStatus,
  notes?: string
): Promise<void> => {
  const { error } = await requireClient().rpc('set_course_request_status', {
    p_id: id,
    p_status: status,
    p_notes: notes?.trim() ? notes.trim() : null,
  });
  if (error) throw new Error(`Could not update that course request: ${error.message}`);
};
