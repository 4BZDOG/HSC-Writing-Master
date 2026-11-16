import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import type { User } from '../../types';

/**
 * The hooks behind course unlocks (hooks/useCourseUnlocks.ts): the picker's gate,
 * the once-per-sign-in load, and the #/course-unlocked return from checkout.
 *
 * With unlocks off, none of it asks the server, says anything or touches the URL.
 */

const rpcMock = vi.fn();

vi.mock('../../services/supabaseClient', () => ({
  getSupabase: async () => ({ rpc: rpcMock }),
}));

import {
  COURSE_UNLOCK_POLL_ATTEMPTS,
  COURSE_UNLOCK_POLL_MS,
  useCourseUnlockGate,
  useCourseUnlockSession,
} from '../../hooks/useCourseUnlocks';
import { clearOwnedCourseUnlocks } from '../../services/courseAccess';

const student = (extra: Record<string, unknown> = {}): User =>
  ({
    username: 'student-1',
    role: 'user',
    displayName: 'Student',
    preferences: {},
    stats: {},
    ...extra,
  }) as unknown as User;

const courses = [
  { id: 'course-chem', name: 'Chemistry' },
  { id: 'course-bio', name: 'Biology' },
];

const showToast = vi.fn();

beforeEach(() => {
  vi.unstubAllEnvs();
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: [], error: null });
  showToast.mockReset();
  clearOwnedCourseUnlocks();
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  clearOwnedCourseUnlocks();
  window.history.replaceState({}, '', '/');
});

const enable = () => vi.stubEnv('VITE_COURSE_UNLOCKS_ENABLED', 'true');

const flush = () => act(async () => {});

describe('useCourseUnlockGate', () => {
  it('locks nothing while unlocks are off', () => {
    const { result } = renderHook(() => useCourseUnlockGate(student()));
    expect(result.current.enabled).toBe(false);
    expect(result.current.isLocked('course-chem')).toBe(false);
  });

  it('locks a course the viewer does not own, and opens the one they do', async () => {
    enable();
    rpcMock.mockResolvedValue({ data: ['course-chem'], error: null });
    const { result } = renderHook(() => ({
      gate: useCourseUnlockGate(student()),
      session: useCourseUnlockSession({ user: student(), courses, showToast }),
    }));
    await flush();
    expect(result.current.gate.isLocked('course-chem')).toBe(false);
    expect(result.current.gate.isLocked('course-bio')).toBe(true);
  });
});

describe('useCourseUnlockSession: disabled', () => {
  it('makes no request, says nothing and leaves the return hash alone', async () => {
    window.history.replaceState({}, '', '/#/course-unlocked?course=course-chem');
    renderHook(() => useCourseUnlockSession({ user: student(), courses, showToast }));
    await flush();
    expect(rpcMock).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('#/course-unlocked?course=course-chem');
  });
});

describe('useCourseUnlockSession: loading', () => {
  it('loads the unlocks once for a signed-in student', async () => {
    enable();
    const { rerender } = renderHook(
      ({ user }) => useCourseUnlockSession({ user, courses, showToast }),
      { initialProps: { user: student() } }
    );
    await flush();
    rerender({ user: student() });
    await flush();
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('my_course_unlocks');
  });

  it('never asks for a guest', async () => {
    enable();
    renderHook(() =>
      useCourseUnlockSession({ user: student({ role: 'guest' }), courses, showToast })
    );
    await flush();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('asks for nothing when there is no user yet', async () => {
    enable();
    renderHook(() => useCourseUnlockSession({ user: null, courses, showToast }));
    await flush();
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe('useCourseUnlockSession: the #/course-unlocked return', () => {
  it('refreshes the unlocks, strips the route and confirms with the course name', async () => {
    enable();
    rpcMock.mockResolvedValue({ data: ['course-chem'], error: null });
    window.history.replaceState({}, '', '/#/course-unlocked?course=course-chem');

    renderHook(() => useCourseUnlockSession({ user: student(), courses, showToast }));
    await flush();

    expect(showToast).toHaveBeenCalledWith('Chemistry is unlocked.', 'success');
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/');
  });

  it('holds the return until someone is signed in', async () => {
    enable();
    rpcMock.mockResolvedValue({ data: ['course-chem'], error: null });
    window.history.replaceState({}, '', '/#/course-unlocked?course=course-chem');

    const { rerender } = renderHook(
      ({ user }) => useCourseUnlockSession({ user, courses, showToast }),
      { initialProps: { user: null as User | null } }
    );
    await flush();
    expect(showToast).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();

    rerender({ user: student() });
    await flush();
    expect(showToast).toHaveBeenCalledWith('Chemistry is unlocked.', 'success');
  });

  it('says the unlock is on its way when the webhook has not landed after the polls', async () => {
    enable();
    vi.useFakeTimers();
    rpcMock.mockResolvedValue({ data: [], error: null });
    window.history.replaceState({}, '', '/#/course-unlocked?course=course-chem');

    renderHook(() => useCourseUnlockSession({ user: student(), courses, showToast }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COURSE_UNLOCK_POLL_MS * COURSE_UNLOCK_POLL_ATTEMPTS);
    });

    expect(rpcMock).toHaveBeenCalledTimes(COURSE_UNLOCK_POLL_ATTEMPTS);
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Payment received'), 'info');
    expect(showToast).not.toHaveBeenCalledWith(expect.stringContaining('is unlocked'), 'success');
  });

  it('falls back to a plain name when the course is not in the list yet', async () => {
    enable();
    rpcMock.mockResolvedValue({ data: ['course-new'], error: null });
    window.history.replaceState({}, '', '/#/course-unlocked?course=course-new');
    renderHook(() => useCourseUnlockSession({ user: student(), courses, showToast }));
    await flush();
    expect(showToast).toHaveBeenCalledWith('The course is unlocked.', 'success');
  });
});
