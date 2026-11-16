/**
 * Course unlocks: which courses a caller may be MARKED in. The product rules are in
 * projectDocs/course-unlocks.md; this is the server copy, and the one that enforces.
 *
 * A plan governs how much a student can do. A course unlock governs which courses. A
 * course is open to a caller when any of these holds, checked in this order:
 *
 *   1. unlocks are switched off (the default) — `disabled`
 *   2. the caller is staff (teacher or admin) — `staff`
 *   3. the caller's plan is in COURSE_UNLOCK_INCLUDED_PLANS (default: school) — `included_plan`
 *   4. the course is in COURSE_UNLOCK_FREE_COURSES, or its catalogue row says
 *      unlock_required = false — `free_course` / `catalogue_free`
 *   5. the caller holds an active unlock (not revoked, not past expires_at) — `unlocked`
 *
 * Otherwise it is `locked`.
 *
 * FAIL-OPEN. A lookup that errors, or a database that is not migrated, leaves a fact
 * unknown. An unknown fact that could have opened the course opens it (`lookup_failed`),
 * because a broken lookup must not take marking down; resolveCallerPlan in ./quota.ts
 * is fail-open for the same reason. The checkout endpoint is stricter: it refuses to
 * sell while a fact it needs is unknown, which is how it tells the two apart.
 *
 * The env is read lazily, on each call, so a test can set it and a deployment can change
 * it without a rebuild. The VITE_ copies are read as fallbacks, so one Vercel variable can
 * drive the server and the client, as planPolicy.ts does.
 */
import { createClient } from '@supabase/supabase-js';
import { PLAN_ORDER, type Plan } from './planPolicy';

/** Upper bound on one Supabase request made from the marking path. */
const SUPABASE_TIMEOUT_MS = 5000;

const timedFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const timeout = AbortSignal.timeout(SUPABASE_TIMEOUT_MS);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
};

export type CourseAccessReason =
  | 'disabled'
  | 'staff'
  | 'included_plan'
  | 'free_course'
  | 'catalogue_free'
  | 'unlocked'
  | 'locked'
  | 'lookup_failed';

export interface CourseAccess {
  open: boolean;
  reason: CourseAccessReason;
}

export interface CoursePolicy {
  enabled: boolean;
  includedPlans: Plan[];
  freeCourses: string[];
}

export interface CatalogueEntry {
  unlockRequired: boolean;
  stripePriceId: string | null;
}

/**
 * The facts the decision reads. `null` means the lookup failed or could not run, which is
 * not the same as "no": a missing catalogue row is `{ ok: true, entry: null }`.
 */
export interface CourseFacts {
  isStaff: boolean | null;
  plan: Plan | null;
  catalogue: { ok: true; entry: CatalogueEntry | null } | { ok: false };
  owned: boolean | null;
}

// ---- Env ----------------------------------------------------------------------

/** Master switch. Off unless the deployment says `true`. */
export const courseUnlocksEnabled = (): boolean =>
  (process.env.COURSE_UNLOCKS_ENABLED ?? process.env.VITE_COURSE_UNLOCKS_ENABLED) === 'true';

/** A comma list, trimmed, with empty entries dropped. */
export const parseCsv = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * The plans that include every course. Unset means `school`, the default; an explicit
 * empty value means nobody is included and everyone pays.
 */
export const includedPlans = (): Plan[] => {
  const raw =
    process.env.COURSE_UNLOCK_INCLUDED_PLANS ??
    process.env.VITE_COURSE_UNLOCK_INCLUDED_PLANS ??
    'school';
  const plans: Plan[] = [];
  for (const entry of parseCsv(raw)) {
    if (PLAN_ORDER.includes(entry as Plan)) {
      plans.push(entry as Plan);
    } else {
      console.warn(`[courseAccess] ignoring unrecognised plan "${entry}" in included plans`);
    }
  }
  return plans;
};

/** Courses that never need an unlock. Empty by default. */
export const freeCourses = (): string[] =>
  parseCsv(process.env.COURSE_UNLOCK_FREE_COURSES ?? process.env.VITE_COURSE_UNLOCK_FREE_COURSES);

/**
 * How long a purchased or granted unlock lasts, in days. Empty or unset means it never
 * expires. Anything that is not a positive whole number is ignored, with a warning.
 */
export const unlockDurationDays = (): number | null => {
  const raw = (process.env.COURSE_UNLOCK_DURATION_DAYS ?? '').trim();
  if (!raw) return null;
  const days = Number(raw);
  if (!Number.isInteger(days) || days <= 0) {
    console.warn(
      `[courseAccess] ignoring COURSE_UNLOCK_DURATION_DAYS="${raw}" (not a positive whole number)`
    );
    return null;
  }
  return days;
};

/** The default one-off Stripe price. Null when it is not set, and checkout then answers 503. */
export const defaultCourseUnlockPriceId = (): string | null =>
  process.env.STRIPE_COURSE_UNLOCK_PRICE_ID || null;

export const coursePolicy = (): CoursePolicy => ({
  enabled: courseUnlocksEnabled(),
  includedPlans: includedPlans(),
  freeCourses: freeCourses(),
});

// ---- Decision -----------------------------------------------------------------

const open = (reason: CourseAccessReason): CourseAccess => ({ open: true, reason });

/**
 * The policy, as a pure function of the facts. Rules run in the order the spec gives. A
 * rule that opens the course returns at once. A rule that needs an unknown fact is noted,
 * and the answer is `lookup_failed` (open) only if no other rule opens the course, so a
 * known open rule is never overridden by a failed lookup elsewhere.
 */
export const decideCourseAccess = (
  courseId: string,
  facts: CourseFacts,
  policy: CoursePolicy = coursePolicy()
): CourseAccess => {
  if (!policy.enabled) return open('disabled');

  const unknown: string[] = [];

  if (facts.isStaff === true) return open('staff');
  if (facts.isStaff === null) unknown.push('staff');

  if (facts.plan !== null && policy.includedPlans.includes(facts.plan)) {
    return open('included_plan');
  }
  if (facts.plan === null && policy.includedPlans.length > 0) unknown.push('plan');

  if (policy.freeCourses.includes(courseId)) return open('free_course');

  if (!facts.catalogue.ok) {
    unknown.push('catalogue');
  } else if (facts.catalogue.entry && !facts.catalogue.entry.unlockRequired) {
    return open('catalogue_free');
  }

  if (facts.owned === true) return open('unlocked');
  if (facts.owned === null) unknown.push('owned');

  if (unknown.length > 0) return open('lookup_failed');
  return { open: false, reason: 'locked' };
};

// ---- Lookups ------------------------------------------------------------------

/** The facts with nothing known: what a missing or unreachable database looks like. */
export const unknownCourseFacts = (): CourseFacts => ({
  isStaff: null,
  plan: null,
  catalogue: { ok: false },
  owned: null,
});

const PLANS: readonly string[] = PLAN_ORDER;

type LookupResult = { error: { message?: string } | null; data: unknown };

/**
 * One fact, read safely. A synchronous throw, a rejected promise and an `error` in the
 * reply all become the fallback: the fact is unknown, and the decision above treats it so.
 * Never rejects.
 */
const readFact = <T>(
  label: string,
  run: () => PromiseLike<LookupResult>,
  read: (data: unknown) => T,
  fallback: T
): Promise<T> =>
  Promise.resolve()
    .then(run)
    .then(
      ({ data, error }) => {
        if (error) {
          console.warn(`[courseAccess] ${label} unavailable:`, error.message ?? 'unknown error');
          return fallback;
        }
        return read(data);
      },
      (e: unknown) => {
        console.warn(
          `[courseAccess] ${label} failed:`,
          e instanceof Error ? e.message : typeof e === 'string' ? e : 'unknown error'
        );
        return fallback;
      }
    );

/**
 * Reads each fact through the caller's own token, so row-level security applies: the
 * catalogue is readable to any signed-in user, and `my_course_unlocks()` returns only the
 * caller's own active unlocks (schema §34). Each read is independent, so one that fails
 * leaves only its own fact unknown. This never throws.
 */
export const loadCourseFacts = async (
  accessToken: string,
  courseId: string
): Promise<CourseFacts> => {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return unknownCourseFacts();

  try {
    const client = createClient(url, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` }, fetch: timedFetch },
    });

    const [isStaff, plan, catalogue, owned] = await Promise.all([
      readFact<boolean | null>(
        'is_reviewer',
        () => client.rpc('is_reviewer'),
        (data) => (data === true ? true : data === false ? false : null),
        null
      ),
      readFact<Plan | null>(
        'caller_plan',
        () => client.rpc('caller_plan'),
        (data) => (typeof data === 'string' && PLANS.includes(data) ? (data as Plan) : null),
        null
      ),
      readFact<CourseFacts['catalogue']>(
        'course_catalogue',
        () =>
          client
            .from('course_catalogue')
            .select('unlock_required, stripe_price_id')
            .eq('course_id', courseId)
            .maybeSingle(),
        (data) => {
          if (!data) return { ok: true, entry: null };
          const row = data as { unlock_required: boolean | null; stripe_price_id: string | null };
          return {
            ok: true,
            entry: {
              unlockRequired: row.unlock_required !== false,
              stripePriceId: row.stripe_price_id ?? null,
            },
          };
        },
        { ok: false }
      ),
      readFact<boolean | null>(
        'my_course_unlocks',
        () => client.rpc('my_course_unlocks'),
        (data) => (Array.isArray(data) ? data.includes(courseId) : null),
        null
      ),
    ]);

    return { isStaff, plan, catalogue, owned };
  } catch (e) {
    console.warn(
      '[courseAccess] course access could not be read:',
      e instanceof Error ? e.message : 'unknown error'
    );
    return unknownCourseFacts();
  }
};

export const resolveCourseAccess = async (
  accessToken: string,
  courseId: string
): Promise<CourseAccess> => {
  const policy = coursePolicy();
  if (!policy.enabled) return open('disabled');

  const facts = await loadCourseFacts(accessToken, courseId);
  const verdict = decideCourseAccess(courseId, facts, policy);
  if (verdict.reason === 'lookup_failed') {
    console.warn(
      `[courseAccess] a course-access lookup failed for "${courseId}"; not gating (fail-open).`
    );
  }
  return verdict;
};

/**
 * The course an evaluation request is for, from the `__courseId` tag the client stamps on
 * the body (stripped before the provider sees it, see ./providers.ts). Absent or
 * non-string means there is nothing to gate.
 */
export const courseIdFromRequest = (body: unknown): string | null => {
  if (!body || typeof body !== 'object') return null;
  const tag = (body as { __courseId?: unknown }).__courseId;
  return typeof tag === 'string' && tag.trim() !== '' ? tag.trim() : null;
};
