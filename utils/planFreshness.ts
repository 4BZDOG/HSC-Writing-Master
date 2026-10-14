import type { User } from '../types';
import { getUserPlan, PLAN_LABELS, planRank } from '../services/entitlements';

/**
 * How long a signed-in tab trusts the plan it loaded before asking the server
 * again.
 *
 * A licence bought on one device used to reach the rest of its school only on
 * their next full reload. Checking when the tab comes back to the front closes
 * that gap, and the throttle keeps a tab that is switched to and from all
 * afternoon from re-asking on every focus. Five minutes is about how long a
 * teacher takes to get the class back on screen after a purchase.
 */
export const PLAN_FRESHNESS_INTERVAL_MS = 5 * 60 * 1000;

export interface PlanNotice {
  type: 'success' | 'warning';
  message: string;
}

/**
 * The fields a plan change can move. Only these are compared, so a refresh that
 * finds nothing new is silent, and only these are copied across by
 * `applyPlanFields`.
 */
export const planFingerprint = (user: User): string =>
  JSON.stringify([
    getUserPlan(user),
    user.stripePlan ?? null,
    user.planPeriodEnd ?? null,
    user.planCancelAtPeriodEnd === true,
  ]);

/**
 * What to tell the person when their RESOLVED plan moves, or null when it has
 * not. Comparing the resolved plan rather than the stored field matters for
 * staff: a teacher whose school licence lapses drops from School to the Plus
 * they hold as a teacher, which is a loss of the licence but not of their
 * access, and the wording says so.
 */
export const planChangeNotice = (before: User, after: User): PlanNotice | null => {
  const from = getUserPlan(before);
  const to = getUserPlan(after);
  if (from === to) return null;

  if (planRank(to) > planRank(from)) {
    if (from === 'free' && after.stripePlan === 'school') {
      return {
        type: 'success',
        message: `Your school's licence is active — ${PLAN_LABELS.plus} is unlocked.`,
      };
    }
    if (from === 'free' && after.stripePlan === 'plus') {
      return {
        type: 'success',
        message: `Your subscription is active — ${PLAN_LABELS.plus} is unlocked.`,
      };
    }
    return { type: 'success', message: `Your plan is now ${PLAN_LABELS[to]}.` };
  }

  if (before.stripePlan === 'school') {
    return {
      type: 'warning',
      message:
        to === 'free'
          ? `Your school's licence is no longer active, so ${PLAN_LABELS.plus} features are locked again.`
          : `Your school's licence is no longer active. Your plan is now ${PLAN_LABELS[to]}.`,
    };
  }
  if (to === 'free') {
    return {
      type: 'warning',
      message: `Your ${PLAN_LABELS[from]} subscription is no longer active, so its features are locked again.`,
    };
  }
  return { type: 'warning', message: `Your plan is now ${PLAN_LABELS[to]}.` };
};

/**
 * Carry the plan fields of a refreshed session onto the copy the app is holding,
 * and nothing else.
 *
 * The refresh rewrites the whole profile, but the app can hold stats or
 * preferences newer than the row it has just read, so swapping the object would
 * be able to lose them. Returns `current` itself when the plan fields already
 * match, so React has nothing to re-render.
 */
export const applyPlanFields = (current: User, next: User): User => {
  if (planFingerprint(current) === planFingerprint(next)) return current;
  const copy: User = { ...current };
  delete copy.stripePlan;
  delete copy.planPeriodEnd;
  delete copy.planCancelAtPeriodEnd;
  if (next.stripePlan) copy.stripePlan = next.stripePlan;
  if (next.planPeriodEnd) copy.planPeriodEnd = next.planPeriodEnd;
  if (next.planCancelAtPeriodEnd) copy.planCancelAtPeriodEnd = next.planCancelAtPeriodEnd;
  return copy;
};

export interface PlanFreshnessDeps {
  /** The user the app is holding right now, or null when nobody is signed in. */
  getUser: () => User | null;
  /** Re-read the session as the server sees it now (authService.refreshSession). */
  refresh: (user: User) => Promise<User | null>;
  /** The clock. Injected so the throttle can be tested without timers. */
  now: () => number;
  /** Called only when a plan field moved. */
  onChange: (refreshed: User) => void;
  /** Called only when the resolved plan moved: say it once. */
  notify: (notice: PlanNotice) => void;
  /** Throttle window. Defaults to PLAN_FRESHNESS_INTERVAL_MS. */
  intervalMs?: number;
}

export interface PlanFreshness {
  /** Re-check when the throttle allows and no check is already in flight. */
  check: () => Promise<void>;
}

/**
 * The decision behind the freshness hook, free of the DOM and React.
 *
 *   - Guests and signed-out users never refresh: there is no server plan to
 *     compare against.
 *   - At most one refresh is in flight, and at most one starts per interval.
 *   - A refresh that changes nothing does not touch the app at all.
 *   - A refresh that returns null is ignored, not treated as a sign-out. The
 *     load-time path already signs out on a rejected session; mid-answer is the
 *     wrong moment to drop someone to the login screen over a background check.
 */
export const createPlanFreshness = (
  deps: PlanFreshnessDeps,
  intervalMs: number = PLAN_FRESHNESS_INTERVAL_MS
): PlanFreshness => {
  // The app has just loaded or signed in, which already refreshed the session,
  // so the first return to the tab waits out a full interval rather than
  // repeating that work.
  let lastCheckedAt = deps.now();
  let inFlight: Promise<void> | null = null;

  const check = (): Promise<void> => {
    if (inFlight) return inFlight;
    const current = deps.getUser();
    if (!current || current.role === 'guest') return Promise.resolve();
    const at = deps.now();
    if (at - lastCheckedAt < intervalMs) return Promise.resolve();
    lastCheckedAt = at;

    inFlight = deps
      .refresh(current)
      .then((refreshed) => {
        if (!refreshed) return;
        const latest = deps.getUser();
        // Signed out, or switched account, while the request was out: the
        // answer is about someone who is no longer here. Both sides of the
        // check must name the same account.
        if (!latest || latest.username !== current.username) return;
        if (refreshed.username !== latest.username) return;
        if (planFingerprint(refreshed) === planFingerprint(latest)) return;
        const notice = planChangeNotice(latest, refreshed);
        deps.onChange(refreshed);
        if (notice) deps.notify(notice);
      })
      // A transient failure is not news. The next return to the tab tries again.
      .catch(() => {})
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };

  return { check };
};
