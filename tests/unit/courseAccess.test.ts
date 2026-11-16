import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { User } from '../../types';

/**
 * The client's course-unlock policy (services/courseAccess.ts, projectDocs/course-unlocks.md
 * "Client"). These pin the rule order, the env parsing, the owned-unlock cache and the
 * checkout's refusal codes. With unlocks off nothing is requested at all.
 */

const rpcMock = vi.fn();
const getSupabaseMock = vi.fn();
const postBillingJsonMock = vi.fn();

vi.mock('../../services/supabaseClient', () => ({
  getSupabase: (...args: unknown[]) => getSupabaseMock(...args),
}));

vi.mock('../../services/entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/entitlements')>();
  return {
    ...actual,
    postBillingJson: (...args: unknown[]) => postBillingJsonMock(...args),
  };
});

import {
  COURSE_UNLOCK_CODE,
  clearOwnedCourseUnlocks,
  courseAccessReason,
  courseUnlockFreeCourses,
  courseUnlockIncludedPlans,
  courseUnlocksEnabled,
  getOwnedCourseUnlocks,
  isCourseIncluded,
  isCourseLocked,
  loadOwnedCourseUnlocks,
  parseCourseUnlockReturn,
  parseCsvList,
  startCourseUnlockCheckout,
  subscribeOwnedCourseUnlocks,
} from '../../services/courseAccess';

const user = (role: User['role'], extra: Partial<User> = {}): User =>
  ({
    username: `${role}-1`,
    role,
    displayName: role,
    preferences: {},
    stats: {},
    ...extra,
  }) as unknown as User;

const student = (extra: Partial<User> = {}) => user('user', extra);
const none = new Set<string>();

const ENV_KEYS = [
  'VITE_COURSE_UNLOCKS_ENABLED',
  'VITE_COURSE_UNLOCK_INCLUDED_PLANS',
  'VITE_COURSE_UNLOCK_FREE_COURSES',
] as const;

beforeEach(() => {
  // Every course-unlock variable starts UNSET, which is the shipped default.
  vi.unstubAllEnvs();
  rpcMock.mockReset();
  getSupabaseMock.mockReset();
  getSupabaseMock.mockResolvedValue({ rpc: rpcMock });
  postBillingJsonMock.mockReset();
  clearOwnedCourseUnlocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  clearOwnedCourseUnlocks();
});

const enable = (extra: Partial<Record<(typeof ENV_KEYS)[number], string>> = {}) => {
  vi.stubEnv('VITE_COURSE_UNLOCKS_ENABLED', 'true');
  for (const [key, value] of Object.entries(extra)) vi.stubEnv(key, value);
};

describe('env parsing', () => {
  it('is off unless the flag is the literal true', () => {
    expect(courseUnlocksEnabled()).toBe(false);
    vi.stubEnv('VITE_COURSE_UNLOCKS_ENABLED', 'yes');
    expect(courseUnlocksEnabled()).toBe(false);
    vi.stubEnv('VITE_COURSE_UNLOCKS_ENABLED', ' TRUE ');
    expect(courseUnlocksEnabled()).toBe(true);
  });

  it('includes the school plan by default, and nothing when the variable is empty', () => {
    expect(courseUnlockIncludedPlans()).toEqual(['school']);
    vi.stubEnv('VITE_COURSE_UNLOCK_INCLUDED_PLANS', '');
    expect(courseUnlockIncludedPlans()).toEqual([]);
  });

  it('reads a comma list of plans and drops unknown names with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('VITE_COURSE_UNLOCK_INCLUDED_PLANS', ' plus , school,gold ');
    expect(courseUnlockIncludedPlans()).toEqual(['plus', 'school']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('gold'));
    warn.mockRestore();
  });

  it('reads free courses as a trimmed comma list, skipping blanks', () => {
    vi.stubEnv('VITE_COURSE_UNLOCK_FREE_COURSES', ' course-a, ,course-b ,');
    expect(courseUnlockFreeCourses()).toEqual(['course-a', 'course-b']);
    expect(parseCsvList(undefined)).toEqual([]);
  });
});

describe('courseAccessReason: rule order', () => {
  it('is disabled for everyone while unlocks are off, whatever else is true', () => {
    expect(courseAccessReason('course-chem', student(), none)).toBe('disabled');
    expect(courseAccessReason('course-chem', null, none)).toBe('disabled');
    expect(isCourseLocked('course-chem', student(), none)).toBe(false);
  });

  it('opens a course for staff, whichever plan they hold', () => {
    enable();
    expect(courseAccessReason('course-chem', user('teacher'), none)).toBe('staff');
    expect(courseAccessReason('course-chem', user('admin'), none)).toBe('staff');
  });

  it('opens a course for an included plan (a School licence by default)', () => {
    enable();
    const school = student({ stripePlan: 'school' } as Partial<User>);
    expect(courseAccessReason('course-chem', school, none)).toBe('included-plan');
    expect(isCourseLocked('course-chem', school, none)).toBe(false);
  });

  it('locks a Plus subscriber unless Plus is in the included list', () => {
    enable();
    const plus = student({ stripePlan: 'plus' } as Partial<User>);
    expect(courseAccessReason('course-chem', plus, none)).toBe('locked');
    enable({ VITE_COURSE_UNLOCK_INCLUDED_PLANS: 'plus,school' });
    expect(courseAccessReason('course-chem', plus, none)).toBe('included-plan');
  });

  it('opens a free course for everyone', () => {
    enable({ VITE_COURSE_UNLOCK_FREE_COURSES: 'course-hsc-english-standard' });
    expect(courseAccessReason('course-hsc-english-standard', student(), none)).toBe('free-course');
    expect(courseAccessReason('course-chem', student(), none)).toBe('locked');
  });

  it('opens a course the viewer owns, and only that one', () => {
    enable();
    const owned = new Set(['course-chem']);
    expect(courseAccessReason('course-chem', student(), owned)).toBe('owned');
    expect(courseAccessReason('course-bio', student(), owned)).toBe('locked');
  });

  it('locks a course for a signed-out viewer who owns nothing', () => {
    enable();
    expect(courseAccessReason('course-chem', null, none)).toBe('locked');
    expect(isCourseLocked('course-chem', undefined, none)).toBe(true);
  });

  it('lets an earlier rule win: a teacher on a locked course is staff, not locked', () => {
    enable();
    expect(courseAccessReason('course-chem', user('teacher'), none)).toBe('staff');
  });
});

describe('isCourseIncluded', () => {
  it('is true for staff, an included plan or a free course, and false for owned or locked', () => {
    enable({ VITE_COURSE_UNLOCK_FREE_COURSES: 'course-free' });
    expect(isCourseIncluded('course-chem', user('admin'))).toBe(true);
    expect(
      isCourseIncluded('course-chem', student({ stripePlan: 'school' } as Partial<User>))
    ).toBe(true);
    expect(isCourseIncluded('course-free', student())).toBe(true);
    expect(isCourseIncluded('course-chem', student())).toBe(false);
  });

  it('is false while unlocks are off, since nothing is for sale then', () => {
    expect(isCourseIncluded('course-chem', student())).toBe(false);
  });
});

describe('owned unlocks: load, cache and subscribe', () => {
  it('asks for nothing while unlocks are off', async () => {
    const result = await loadOwnedCourseUnlocks();
    expect(result.size).toBe(0);
    expect(getSupabaseMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('is empty without Supabase (guest or mock mode) and makes no request', async () => {
    enable();
    getSupabaseMock.mockResolvedValueOnce(null);
    const result = await loadOwnedCourseUnlocks();
    expect(result.size).toBe(0);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('caches the RPC answer and tells subscribers when it changes', async () => {
    enable();
    rpcMock.mockResolvedValue({ data: ['course-chem', 42, 'course-bio'], error: null });
    const listener = vi.fn();
    const unsubscribe = subscribeOwnedCourseUnlocks(listener);

    const result = await loadOwnedCourseUnlocks();

    expect(rpcMock).toHaveBeenCalledWith('my_course_unlocks');
    expect([...result].sort()).toEqual(['course-bio', 'course-chem']);
    expect(getOwnedCourseUnlocks().has('course-chem')).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    clearOwnedCourseUnlocks();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('shares one request between overlapping callers', async () => {
    enable();
    rpcMock.mockResolvedValue({ data: ['course-chem'], error: null });
    await Promise.all([loadOwnedCourseUnlocks(), loadOwnedCourseUnlocks()]);
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it('keeps what it already holds when a lookup fails', async () => {
    enable();
    rpcMock.mockResolvedValueOnce({ data: ['course-chem'], error: null });
    await loadOwnedCourseUnlocks();
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    const result = await loadOwnedCourseUnlocks();
    expect([...result]).toEqual(['course-chem']);
  });

  it('never rejects, even when the client cannot be created', async () => {
    enable();
    getSupabaseMock.mockRejectedValueOnce(new Error('chunk failed'));
    await expect(loadOwnedCourseUnlocks()).resolves.toBeInstanceOf(Set);
  });

  it('discards a lookup that was still running when the account was cleared', async () => {
    enable();
    let finish!: (value: { data: string[]; error: null }) => void;
    rpcMock.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const pending = loadOwnedCourseUnlocks();
    await Promise.resolve();
    clearOwnedCourseUnlocks();
    finish({ data: ['course-chem'], error: null });
    await pending;
    expect(getOwnedCourseUnlocks().size).toBe(0);
  });
});

describe('startCourseUnlockCheckout', () => {
  it('posts the course and the return base, and returns the checkout URL', async () => {
    postBillingJsonMock.mockResolvedValue({
      data: { url: 'https://checkout.stripe.test/c/1' },
      error: null,
      status: 200,
      code: null,
    });
    const result = await startCourseUnlockCheckout('course-chem');
    expect(postBillingJsonMock).toHaveBeenCalledWith(
      '/api/course-unlock-checkout',
      expect.objectContaining({ courseId: 'course-chem', returnUrl: expect.any(String) }),
      expect.any(String)
    );
    expect(result).toEqual({
      url: 'https://checkout.stripe.test/c/1',
      error: null,
      code: null,
      status: 200,
    });
  });

  it('carries the server code for each refusal, without guessing it from the status', async () => {
    postBillingJsonMock.mockResolvedValue({
      data: null,
      error: 'Already unlocked.',
      status: 409,
      code: COURSE_UNLOCK_CODE.alreadyUnlocked,
    });
    const result = await startCourseUnlockCheckout('course-chem');
    expect(result).toEqual({
      url: null,
      error: 'Already unlocked.',
      code: 'course_already_unlocked',
      status: 409,
    });
  });
});

describe('parseCourseUnlockReturn', () => {
  it('reads the course from the #/course-unlocked return route', () => {
    expect(parseCourseUnlockReturn('#/course-unlocked?course=course-chem')).toEqual({
      courseId: 'course-chem',
    });
  });

  it('accepts the route without a course, and drops a course id that is not shaped like one', () => {
    expect(parseCourseUnlockReturn('#/course-unlocked')).toEqual({ courseId: null });
    expect(parseCourseUnlockReturn('#/course-unlocked?course=%3Cscript%3E')).toEqual({
      courseId: null,
    });
  });

  it('treats the mock return route the same as the success route', () => {
    expect(parseCourseUnlockReturn('#/course-unlock-test?course=course-chem')).toEqual({
      courseId: 'course-chem',
    });
  });

  it('ignores every other hash', () => {
    expect(parseCourseUnlockReturn('#/upgrade-test?price=price_1')).toBeNull();
    expect(parseCourseUnlockReturn('')).toBeNull();
    expect(parseCourseUnlockReturn('#/course-unlocked-extra')).toBeNull();
  });
});
