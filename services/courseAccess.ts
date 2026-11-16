/**
 * Course unlocks, the client side (projectDocs/course-unlocks.md, "Client").
 *
 * A plan says how much a student can do; an unlock says which courses they can be
 * marked in. This module answers two questions for the screens: is this course
 * locked for this viewer, and what do they already hold. The server enforces
 * (api/gemini.ts answers 402 course_locked); nothing here is a security gate.
 *
 * Off by default. With VITE_COURSE_UNLOCKS_ENABLED unset, every function here
 * answers "open", loads nothing and makes no request, so the app behaves exactly
 * as it did before this file existed.
 *
 * Everything reads the environment lazily, at call time, as planPolicy.ts does,
 * so a test (or a deployment that rebuilds) sees the current value.
 */
import { canCurateContent } from '../utils/permissions';
import type { User } from '../types';
import { getUserPlan, postBillingJson, checkoutReturnUrl, type Plan } from './entitlements';
import { PLAN_ORDER } from './planPolicy';
import { getSupabase } from './supabaseClient';

/** Plans that include every course when the deployment does not say otherwise. */
export const DEFAULT_COURSE_UNLOCK_INCLUDED_PLANS: readonly Plan[] = ['school'];

/** The server's machine codes for a refused checkout (api/course-unlock-checkout). */
export const COURSE_UNLOCK_CODE = {
  unlocksDisabled: 'course_unlocks_disabled',
  courseIncluded: 'course_included',
  alreadyUnlocked: 'course_already_unlocked',
} as const;

/** The evaluation refusal the server sends for a locked course (402). */
export const COURSE_LOCKED_CODE = 'course_locked';

/**
 * The rule that decided a course's access, in the order the policy checks them.
 * Named so a test can pin each rule, and so a caller can tell "open by plan"
 * from "bought" without re-deriving either.
 */
export type CourseAccessReason =
  | 'disabled'
  | 'staff'
  | 'included-plan'
  | 'free-course'
  | 'owned'
  | 'locked';

const rawEnv = (): Record<string, string | undefined> => {
  try {
    return {
      VITE_COURSE_UNLOCKS_ENABLED: import.meta.env?.VITE_COURSE_UNLOCKS_ENABLED,
      VITE_COURSE_UNLOCK_INCLUDED_PLANS: import.meta.env?.VITE_COURSE_UNLOCK_INCLUDED_PLANS,
      VITE_COURSE_UNLOCK_FREE_COURSES: import.meta.env?.VITE_COURSE_UNLOCK_FREE_COURSES,
    };
  } catch {
    return {};
  }
};

/** Comma-separated values, trimmed, with blanks dropped. */
export const parseCsvList = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

/**
 * Opt-IN. Only the literal `true` switches unlocks on, so a typo or an empty
 * variable leaves the app as it was.
 */
export const courseUnlocksEnabled = (): boolean =>
  rawEnv().VITE_COURSE_UNLOCKS_ENABLED?.trim().toLowerCase() === 'true';

/**
 * The plans that include every course. Unset takes the default (`school`); an
 * empty value means no plan is included, so everyone pays. Unknown plan names are
 * dropped with a warning, the same way planPolicy.ts treats a typo.
 */
export const courseUnlockIncludedPlans = (): Plan[] => {
  const raw = rawEnv().VITE_COURSE_UNLOCK_INCLUDED_PLANS;
  if (raw === undefined) return [...DEFAULT_COURSE_UNLOCK_INCLUDED_PLANS];
  const plans: Plan[] = [];
  for (const entry of parseCsvList(raw)) {
    if (PLAN_ORDER.includes(entry as Plan)) plans.push(entry as Plan);
    else console.warn(`[courseAccess] ignoring unrecognised included plan "${entry}"`);
  }
  return plans;
};

/** Courses that never need an unlock, by id. */
export const courseUnlockFreeCourses = (): string[] =>
  parseCsvList(rawEnv().VITE_COURSE_UNLOCK_FREE_COURSES);

/**
 * Which rule decides this course for this viewer. Pure: the owned set is passed
 * in, so the caller decides where it came from.
 *
 * Order matters and is the spec's order: switched off, staff, an included plan,
 * a free course, a held unlock, otherwise locked.
 */
export const courseAccessReason = (
  courseId: string,
  user: User | null | undefined,
  owned: ReadonlySet<string>
): CourseAccessReason => {
  if (!courseUnlocksEnabled()) return 'disabled';
  if (user && canCurateContent(user.role)) return 'staff';
  if (courseUnlockIncludedPlans().includes(getUserPlan(user ?? null))) return 'included-plan';
  if (courseUnlockFreeCourses().includes(courseId)) return 'free-course';
  if (owned.has(courseId)) return 'owned';
  return 'locked';
};

/** True when a student must buy this course before it can be marked. */
export const isCourseLocked = (
  courseId: string,
  user: User | null | undefined,
  owned: ReadonlySet<string>
): boolean => courseAccessReason(courseId, user, owned) === 'locked';

/**
 * Open without a purchase: by staff role, an included plan or the free list. A
 * held unlock is not "included" and switched-off unlocks are not either: this is
 * the question the checkout's 409 course_included answers.
 */
export const isCourseIncluded = (courseId: string, user: User | null | undefined): boolean => {
  const reason = courseAccessReason(courseId, user, new Set());
  return reason === 'staff' || reason === 'included-plan' || reason === 'free-course';
};

// ---------------------------------------------------------------------------
// Owned unlocks: loaded once per sign-in, cached in memory, observable.
// ---------------------------------------------------------------------------

const NONE: ReadonlySet<string> = new Set();
let owned: ReadonlySet<string> = NONE;
const listeners = new Set<() => void>();
let inFlight: Promise<ReadonlySet<string>> | null = null;
/**
 * Bumped by every clear. A request that started before a clear (a sign-out, or
 * a second account) must not write its answer into the cache afterwards.
 */
let generation = 0;

const publish = (next: ReadonlySet<string>): void => {
  owned = next;
  listeners.forEach((listener) => listener());
};

/** The course ids the signed-in viewer holds an unlock for. Empty when none is loaded. */
export const getOwnedCourseUnlocks = (): ReadonlySet<string> => owned;

/** Calls `listener` whenever the owned set changes. Returns the unsubscribe. */
export const subscribeOwnedCourseUnlocks = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Asks the server for the viewer's active unlocks (`my_course_unlocks()`), once,
 * sharing any request already in flight.
 *
 * With unlocks off it returns the empty set and makes no request. Without
 * Supabase (guest, mock mode) it does the same. A failed lookup keeps whatever is
 * already cached, so a network blip does not turn paid courses back to locked.
 * It never rejects.
 */
export const loadOwnedCourseUnlocks = (): Promise<ReadonlySet<string>> => {
  if (!courseUnlocksEnabled()) return Promise.resolve(NONE);
  if (inFlight) return inFlight;

  const startedAt = generation;
  const request = (async (): Promise<ReadonlySet<string>> => {
    try {
      const client = await getSupabase();
      if (!client) return NONE;
      const { data, error } = await client.rpc('my_course_unlocks');
      if (startedAt !== generation) return owned;
      if (error || !Array.isArray(data)) return owned;
      const ids = new Set(data.filter((id): id is string => typeof id === 'string'));
      publish(ids);
      return ids;
    } catch {
      return owned;
    }
  })();
  inFlight = request;
  void request.finally(() => {
    if (inFlight === request) inFlight = null;
  });
  return request;
};

/** Forgets the cached unlocks. Called on sign-out and when the account changes. */
export const clearOwnedCourseUnlocks = (): void => {
  generation += 1;
  inFlight = null;
  if (owned.size > 0) publish(NONE);
};

// ---------------------------------------------------------------------------
// Buying.
// ---------------------------------------------------------------------------

export interface CourseUnlockCheckoutResult {
  /** The Stripe Checkout URL to send the viewer to, or null when refused. */
  url: string | null;
  /** The server's sentence for a refusal, or a fallback. */
  error: string | null;
  /** The machine code (COURSE_UNLOCK_CODE), when the server sent one. Never guessed from the status. */
  code: string | null;
  status: number | null;
}

/**
 * Starts a one-off checkout for a course. The server answers with a Checkout URL,
 * or a refusal with a code. The return URL is the app's root; the server appends
 * the `#/course-unlocked` route (see parseCourseUnlockReturn).
 */
export const startCourseUnlockCheckout = async (
  courseId: string
): Promise<CourseUnlockCheckoutResult> => {
  const { data, error, status, code } = await postBillingJson<{ url?: string }>(
    '/api/course-unlock-checkout',
    { courseId, returnUrl: checkoutReturnUrl() },
    'Could not start checkout. Please try again.'
  );
  if (!data?.url) {
    return {
      url: null,
      error: error ?? 'Could not start checkout. Please try again.',
      code,
      status,
    };
  }
  return { url: data.url, error: null, code: null, status };
};

// ---------------------------------------------------------------------------
// Returning from checkout.
// ---------------------------------------------------------------------------

/** What the `#/course-unlocked` return route carries. */
export interface CourseUnlockReturn {
  /** The course the viewer bought, or null when the link did not name one. */
  courseId: string | null;
}

const COURSE_ID_PATTERN = /^[A-Za-z0-9_.-]{1,200}$/;

/**
 * Reads the `#/course-unlocked?course=<id>` return route from a location hash.
 * Null for any other hash. A course id that is not shaped like one is dropped
 * rather than echoed into a toast.
 */
export const parseCourseUnlockReturn = (hash: string): CourseUnlockReturn | null => {
  // `course-unlock-test` is the return when Stripe is not configured (the mock URL);
  // it is handled exactly like the success route.
  const match = /^#\/course-unlock(?:ed|-test)(?:\?(.*))?$/.exec(hash);
  if (!match) return null;
  const raw = new URLSearchParams(match[1] ?? '').get('course');
  return { courseId: raw && COURSE_ID_PATTERN.test(raw) ? raw : null };
};
