import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The course-unlock policy (projectDocs/course-unlocks.md, api/_lib/courseAccess.ts).
 *
 * Pure rules first: each rule in the spec's order, the env parsing, and the fail-open
 * rule. Then resolveCourseAccess through a mocked Supabase client, to show that a broken
 * lookup opens the course rather than refusing a student's marking.
 */

const createClientMock = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

import {
  coursePolicy,
  courseIdFromRequest,
  courseUnlocksEnabled,
  decideCourseAccess,
  defaultCourseUnlockPriceId,
  freeCourses,
  includedPlans,
  resolveCourseAccess,
  unlockDurationDays,
  type CourseFacts,
  type CoursePolicy,
} from '../../api/_lib/courseAccess';

const ENV_KEYS = [
  'COURSE_UNLOCKS_ENABLED',
  'VITE_COURSE_UNLOCKS_ENABLED',
  'COURSE_UNLOCK_INCLUDED_PLANS',
  'VITE_COURSE_UNLOCK_INCLUDED_PLANS',
  'COURSE_UNLOCK_FREE_COURSES',
  'VITE_COURSE_UNLOCK_FREE_COURSES',
  'COURSE_UNLOCK_DURATION_DAYS',
  'STRIPE_COURSE_UNLOCK_PRICE_ID',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
] as const;

const COURSE = 'course-hsc-chemistry';

/** A policy switched on, with the default included plan and no free courses. */
const ON: CoursePolicy = { enabled: true, includedPlans: ['school'], freeCourses: [] };

/** Facts for a free student holding nothing, against a course that needs an unlock. */
const LOCKED_FACTS: CourseFacts = {
  isStaff: false,
  plan: 'free',
  catalogue: { ok: true, entry: null },
  owned: false,
};

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  createClientMock.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

describe('decideCourseAccess: the rules, in the spec order', () => {
  it('is open to everyone while unlocks are switched off', () => {
    const verdict = decideCourseAccess(COURSE, LOCKED_FACTS, { ...ON, enabled: false });
    expect(verdict).toEqual({ open: true, reason: 'disabled' });
  });

  it('is locked for a free student with no unlock, against a course that needs one', () => {
    expect(decideCourseAccess(COURSE, LOCKED_FACTS, ON)).toEqual({ open: false, reason: 'locked' });
  });

  it('is open to staff, whatever the plan', () => {
    const verdict = decideCourseAccess(COURSE, { ...LOCKED_FACTS, isStaff: true }, ON);
    expect(verdict).toEqual({ open: true, reason: 'staff' });
  });

  it('is open to a plan in the included list', () => {
    const plus = { ...LOCKED_FACTS, plan: 'plus' as const };
    const school = { ...LOCKED_FACTS, plan: 'school' as const };
    expect(decideCourseAccess(COURSE, plus, ON).open).toBe(false);
    expect(decideCourseAccess(COURSE, school, ON)).toEqual({ open: true, reason: 'included_plan' });
  });

  it('is open to a course on the free-courses list', () => {
    const verdict = decideCourseAccess(COURSE, LOCKED_FACTS, { ...ON, freeCourses: [COURSE] });
    expect(verdict).toEqual({ open: true, reason: 'free_course' });
  });

  it('is open when the catalogue says the course needs no unlock', () => {
    const facts: CourseFacts = {
      ...LOCKED_FACTS,
      catalogue: { ok: true, entry: { unlockRequired: false, stripePriceId: null } },
    };
    expect(decideCourseAccess(COURSE, facts, ON)).toEqual({ open: true, reason: 'catalogue_free' });
  });

  it('treats a course with no catalogue row as one that needs an unlock', () => {
    const facts: CourseFacts = { ...LOCKED_FACTS, catalogue: { ok: true, entry: null } };
    expect(decideCourseAccess(COURSE, facts, ON).open).toBe(false);
  });

  it('is open to a student who holds an active unlock', () => {
    const verdict = decideCourseAccess(COURSE, { ...LOCKED_FACTS, owned: true }, ON);
    expect(verdict).toEqual({ open: true, reason: 'unlocked' });
  });

  it('reports staff over the included plan when both hold (the earlier rule wins)', () => {
    const verdict = decideCourseAccess(
      COURSE,
      { ...LOCKED_FACTS, isStaff: true, plan: 'school' },
      ON
    );
    expect(verdict.reason).toBe('staff');
  });

  it('reports the free-course reason over an unlock the student also holds', () => {
    const verdict = decideCourseAccess(
      COURSE,
      { ...LOCKED_FACTS, owned: true },
      {
        ...ON,
        freeCourses: [COURSE],
      }
    );
    expect(verdict.reason).toBe('free_course');
  });

  it('answers an empty included list as nobody included, so the plan does not open anything', () => {
    const school = { ...LOCKED_FACTS, plan: 'school' as const };
    expect(decideCourseAccess(COURSE, school, { ...ON, includedPlans: [] }).open).toBe(false);
  });
});

describe('decideCourseAccess: fail-open on a lookup that failed', () => {
  it('opens a course when a fact that could open it is unknown', () => {
    const verdict = decideCourseAccess(COURSE, { ...LOCKED_FACTS, isStaff: null }, ON);
    expect(verdict).toEqual({ open: true, reason: 'lookup_failed' });
  });

  it('opens a course when the catalogue could not be read and nothing else opens it', () => {
    const verdict = decideCourseAccess(COURSE, { ...LOCKED_FACTS, catalogue: { ok: false } }, ON);
    expect(verdict).toEqual({ open: true, reason: 'lookup_failed' });
  });

  it('opens a course when the unlock lookup failed and nothing else opens it', () => {
    expect(decideCourseAccess(COURSE, { ...LOCKED_FACTS, owned: null }, ON).reason).toBe(
      'lookup_failed'
    );
  });

  it('does not let a failed lookup override a rule that opens the course', () => {
    // The unlock lookup failed, but the caller is staff, so the course is open for a reason
    // that needs no database answer at all.
    const verdict = decideCourseAccess(COURSE, { ...LOCKED_FACTS, isStaff: true, owned: null }, ON);
    expect(verdict).toEqual({ open: true, reason: 'staff' });
  });

  it('needs the plan only when an included list exists, so an empty list is not a failure', () => {
    const facts: CourseFacts = { ...LOCKED_FACTS, plan: null };
    expect(decideCourseAccess(COURSE, facts, { ...ON, includedPlans: [] })).toEqual({
      open: false,
      reason: 'locked',
    });
    expect(decideCourseAccess(COURSE, facts, ON).reason).toBe('lookup_failed');
  });

  it('answers a known open rule even while the plan is unknown', () => {
    const verdict = decideCourseAccess(COURSE, { ...LOCKED_FACTS, plan: null, owned: true }, ON);
    expect(verdict).toEqual({ open: true, reason: 'unlocked' });
  });
});

describe('env parsing', () => {
  it('is off unless the switch says true, on the server or the client', () => {
    expect(courseUnlocksEnabled()).toBe(false);
    process.env.COURSE_UNLOCKS_ENABLED = 'false';
    expect(courseUnlocksEnabled()).toBe(false);
    process.env.COURSE_UNLOCKS_ENABLED = 'true';
    expect(courseUnlocksEnabled()).toBe(true);
  });

  it('falls back to the VITE_ switch, so one variable can drive both halves', () => {
    process.env.VITE_COURSE_UNLOCKS_ENABLED = 'true';
    expect(courseUnlocksEnabled()).toBe(true);
    // The server copy wins when both are set.
    process.env.COURSE_UNLOCKS_ENABLED = 'false';
    expect(courseUnlocksEnabled()).toBe(false);
  });

  it('includes school by default, and an explicit empty value includes nobody', () => {
    expect(includedPlans()).toEqual(['school']);
    process.env.COURSE_UNLOCK_INCLUDED_PLANS = '';
    expect(includedPlans()).toEqual([]);
  });

  it('parses a comma list, trims it, and ignores an unknown plan', () => {
    process.env.COURSE_UNLOCK_INCLUDED_PLANS = ' plus , school, platinum ,';
    expect(includedPlans()).toEqual(['plus', 'school']);
  });

  it('reads the included plans from the VITE_ copy when the server copy is unset', () => {
    process.env.VITE_COURSE_UNLOCK_INCLUDED_PLANS = 'plus,school';
    expect(includedPlans()).toEqual(['plus', 'school']);
  });

  it('parses the free-courses list, empty by default', () => {
    expect(freeCourses()).toEqual([]);
    process.env.COURSE_UNLOCK_FREE_COURSES = ' course-a ,course-b,,';
    expect(freeCourses()).toEqual(['course-a', 'course-b']);
  });

  it('reads the unlock duration in whole days, and never expires when it is empty', () => {
    expect(unlockDurationDays()).toBeNull();
    process.env.COURSE_UNLOCK_DURATION_DAYS = '';
    expect(unlockDurationDays()).toBeNull();
    process.env.COURSE_UNLOCK_DURATION_DAYS = '365';
    expect(unlockDurationDays()).toBe(365);
  });

  it('ignores a duration that is not a positive whole number', () => {
    for (const bad of ['0', '-3', '1.5', 'a year']) {
      process.env.COURSE_UNLOCK_DURATION_DAYS = bad;
      expect(unlockDurationDays(), bad).toBeNull();
    }
  });

  it('has no default price until one is configured', () => {
    expect(defaultCourseUnlockPriceId()).toBeNull();
    process.env.STRIPE_COURSE_UNLOCK_PRICE_ID = 'price_course';
    expect(defaultCourseUnlockPriceId()).toBe('price_course');
  });

  it('assembles the policy from the environment, read on each call', () => {
    expect(coursePolicy()).toEqual({ enabled: false, includedPlans: ['school'], freeCourses: [] });
    process.env.COURSE_UNLOCKS_ENABLED = 'true';
    process.env.COURSE_UNLOCK_FREE_COURSES = COURSE;
    expect(coursePolicy()).toEqual({
      enabled: true,
      includedPlans: ['school'],
      freeCourses: [COURSE],
    });
  });

  it('reads the course id from the __courseId tag and nothing else', () => {
    expect(courseIdFromRequest({ __courseId: COURSE })).toBe(COURSE);
    expect(courseIdFromRequest({ __courseId: '  ' })).toBeNull();
    expect(courseIdFromRequest({ __courseId: 42 })).toBeNull();
    expect(courseIdFromRequest({})).toBeNull();
    expect(courseIdFromRequest(null)).toBeNull();
  });
});

/** A Supabase client whose reads answer from `answers`; a value that is an Error throws. */
const fakeClient = (answers: {
  is_reviewer?: unknown;
  caller_plan?: unknown;
  catalogue?: { data: unknown; error: unknown };
  my_course_unlocks?: unknown;
}) => ({
  rpc: vi.fn(async (name: string) => {
    const answer = answers[name as keyof typeof answers];
    if (answer instanceof Error) throw answer;
    return { data: answer ?? null, error: null };
  }),
  from: vi.fn(() => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => answers.catalogue ?? { data: null, error: null },
      }),
    }),
  })),
});

describe('resolveCourseAccess', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon';
  });

  it('answers disabled without a single lookup', async () => {
    const verdict = await resolveCourseAccess('token', COURSE);
    expect(verdict).toEqual({ open: true, reason: 'disabled' });
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('refuses a locked course, reading each fact through the caller token', async () => {
    process.env.COURSE_UNLOCKS_ENABLED = 'true';
    const client = fakeClient({
      is_reviewer: false,
      caller_plan: 'free',
      catalogue: { data: { unlock_required: true, stripe_price_id: null }, error: null },
      my_course_unlocks: ['some-other-course'],
    });
    createClientMock.mockReturnValue(client);

    const verdict = await resolveCourseAccess('student-token', COURSE);

    expect(verdict).toEqual({ open: false, reason: 'locked' });
    const [, , options] = createClientMock.mock.calls[0];
    expect(options.global.headers.Authorization).toBe('Bearer student-token');
  });

  it('opens a course the caller has unlocked', async () => {
    process.env.COURSE_UNLOCKS_ENABLED = 'true';
    createClientMock.mockReturnValue(
      fakeClient({
        is_reviewer: false,
        caller_plan: 'free',
        catalogue: { data: { unlock_required: true, stripe_price_id: null }, error: null },
        my_course_unlocks: [COURSE],
      })
    );
    expect(await resolveCourseAccess('t', COURSE)).toEqual({ open: true, reason: 'unlocked' });
  });

  it('opens a course for staff', async () => {
    process.env.COURSE_UNLOCKS_ENABLED = 'true';
    createClientMock.mockReturnValue(
      fakeClient({ is_reviewer: true, caller_plan: 'free', my_course_unlocks: [] })
    );
    expect(await resolveCourseAccess('t', COURSE)).toEqual({ open: true, reason: 'staff' });
  });

  it('fails OPEN, with a warning, when every lookup throws', async () => {
    process.env.COURSE_UNLOCKS_ENABLED = 'true';
    const boom = new Error('supabase is down');
    createClientMock.mockReturnValue(
      fakeClient({ is_reviewer: boom, caller_plan: boom, my_course_unlocks: boom })
    );
    const verdict = await resolveCourseAccess('t', COURSE);
    expect(verdict).toEqual({ open: true, reason: 'lookup_failed' });
    expect(console.warn).toHaveBeenCalled();
  });

  it('fails OPEN when the client cannot even be created', async () => {
    process.env.COURSE_UNLOCKS_ENABLED = 'true';
    createClientMock.mockImplementation(() => {
      throw new Error('bad config');
    });
    await expect(resolveCourseAccess('t', COURSE)).resolves.toEqual({
      open: true,
      reason: 'lookup_failed',
    });
  });

  it('fails OPEN when the database is not configured at all', async () => {
    process.env.COURSE_UNLOCKS_ENABLED = 'true';
    delete process.env.SUPABASE_URL;
    const verdict = await resolveCourseAccess('t', COURSE);
    expect(verdict).toEqual({ open: true, reason: 'lookup_failed' });
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('fails OPEN when the unlock RPC is missing (schema §34 not applied)', async () => {
    process.env.COURSE_UNLOCKS_ENABLED = 'true';
    createClientMock.mockReturnValue({
      rpc: vi.fn(async (name: string) =>
        name === 'my_course_unlocks'
          ? { data: null, error: { message: 'function my_course_unlocks() does not exist' } }
          : { data: name === 'caller_plan' ? 'free' : false, error: null }
      ),
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
      }),
    });
    // The catalogue has no row (so it needs an unlock), the caller is a free student, and
    // the unlock lookup is unknown: the course opens rather than refusing marking.
    expect(await resolveCourseAccess('t', COURSE)).toEqual({
      open: true,
      reason: 'lookup_failed',
    });
  });
});
