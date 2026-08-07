import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canCreateCurriculum, canCurateContent } from '../../utils/permissions';

/**
 * Course demand — the other half of making course creation admin-only.
 *
 * Narrowing who can add a course keeps the shared syllabus tree coherent, but
 * it also creates a dead end: a teacher whose course isn't here has no way to
 * say so, and their disappointment is invisible. These tests cover the route
 * out (the request modal), the guarantee that makes the resulting list worth
 * reading (one row per course, one voice per person), and the permission split
 * itself.
 */

const rpcMock = vi.fn();

vi.mock('../../services/supabaseClient', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

import CourseRequestModal from '../../components/CourseRequestModal';
import { requestCourse, isCourseDemandAvailable } from '../../services/courseDemandService';

beforeEach(() => rpcMock.mockReset());
afterEach(cleanup);

describe('curriculum creation permissions', () => {
  it('keeps courses and topics with admins while teachers keep everything below', () => {
    // The whole point of the split: a teacher still curates, they just don't
    // get to reshape the tree everyone else navigates.
    expect(canCreateCurriculum('admin')).toBe(true);
    expect(canCreateCurriculum('teacher')).toBe(false);
    expect(canCreateCurriculum('user')).toBe(false);
    expect(canCreateCurriculum('guest')).toBe(false);

    expect(canCurateContent('teacher')).toBe(true);
  });
});

describe('courseDemandService', () => {
  it('sends the trimmed name and drops an empty note', async () => {
    rpcMock.mockResolvedValue({
      data: { name: 'Software Engineering', status: 'new', requesters: 1, alreadyAsked: false },
      error: null,
    });

    await requestCourse('  Software Engineering  ', '   ');

    expect(rpcMock).toHaveBeenCalledWith('log_course_request', {
      p_name: 'Software Engineering',
      // A note of pure whitespace is not a note; sending it would fill the
      // admin's list with empty quotation marks.
      p_note: null,
    });
  });

  it('surfaces the server message rather than a generic failure', async () => {
    // The RPC's messages ("that course name is too long") are written for the
    // person typing, so they must reach them intact.
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'That course name is too long (120 characters maximum)' },
    });

    await expect(requestCourse('x'.repeat(200))).rejects.toThrow(/too long/);
  });

  it('reports availability from whether there is a backend at all', () => {
    // A local-only session has nowhere to record a request, and offering the
    // link there would promise something the app cannot keep.
    expect(isCourseDemandAvailable()).toBe(true);
  });
});

describe('CourseRequestModal', () => {
  const showToast = vi.fn();

  const open = (initialName = '') =>
    render(
      <CourseRequestModal
        isOpen
        onClose={vi.fn()}
        initialName={initialName}
        showToast={showToast}
      />
    );

  it('opens on the words the user searched for', () => {
    open('Investigating Science');
    expect((screen.getByLabelText(/course name/i) as HTMLInputElement).value).toBe(
      'Investigating Science'
    );
  });

  it('tells the requester how many people are already waiting', async () => {
    // The headcount is what turns a suggestion box into a queue with a visible
    // length — "thanks, we'll consider it" tells the user nothing true.
    rpcMock.mockResolvedValue({
      data: { name: 'Software Engineering', status: 'new', requesters: 12, alreadyAsked: false },
      error: null,
    });
    open('Software Engineering');

    fireEvent.click(screen.getByRole('button', { name: /send request/i }));

    await waitFor(() => expect(screen.getByText(/12 people are waiting/i)).toBeTruthy());
  });

  it('says so plainly when the requester had already asked', async () => {
    rpcMock.mockResolvedValue({
      data: { name: 'Marine Studies', status: 'planned', requesters: 3, alreadyAsked: true },
      error: null,
    });
    open('Marine Studies');

    fireEvent.click(screen.getByRole('button', { name: /send request/i }));

    await waitFor(() => expect(screen.getByText(/already asked/i)).toBeTruthy());
    // And a course already on the roadmap is worth saying out loud.
    expect(screen.getByText(/already planned/i)).toBeTruthy();
  });

  it('keeps the form open with the reason when the request fails', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'Not authenticated' } });
    open('Ancient History');

    fireEvent.click(screen.getByRole('button', { name: /send request/i }));

    await waitFor(() => expect(screen.getByText(/not authenticated/i)).toBeTruthy());
    // Still on the form, with their text intact — not bounced to a dead end.
    expect((screen.getByLabelText(/course name/i) as HTMLInputElement).value).toBe(
      'Ancient History'
    );
  });

  it('will not send an empty request', () => {
    open('');
    expect(
      (screen.getByRole('button', { name: /send request/i }) as HTMLButtonElement).disabled
    ).toBe(true);
  });
});

describe('course demand schema', () => {
  const schemaSql = readFileSync(resolve(__dirname, '../../supabase/schema.sql'), 'utf8');

  it('counts people rather than clicks', () => {
    // One row per (request, user). Without the composite key a determined
    // person could manufacture a queue, and the ordering that drives the
    // roadmap would be measuring persistence rather than demand.
    const table = /create table if not exists public\.course_request_voices[\s\S]*?\);/.exec(
      schemaSql
    );
    expect(table, 'course_request_voices not found in schema.sql').not.toBeNull();
    expect(table![0]).toMatch(/primary key \(request_id, user_id\)/);
  });

  it('folds spelling variants of one course into a single row', () => {
    // "Software Engineering", "software engineering " and "Software  Engineering"
    // are one course with three requesters, not three courses with one each.
    expect(schemaSql).toMatch(/create or replace function public\.normalise_course_name/);
    const requests = /create table if not exists public\.course_requests[\s\S]*?\);/.exec(
      schemaSql
    );
    expect(requests![0]).toMatch(/normalised_name text not null unique/);
  });

  it('keeps the demand list to reviewers and triage to admins', () => {
    // The list names the people asking, so it is not readable by the people
    // asking. Changing a request's status is an editorial decision: admin only.
    expect(schemaSql).toMatch(/Only admins\/teachers can view course demand/);
    expect(schemaSql).toMatch(/Only admins can change a course request/);
  });
});
