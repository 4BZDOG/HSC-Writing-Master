import { describe, it, expect, vi } from 'vitest';
import type { User } from '../../types';

/**
 * A licence that goes live or lapses elsewhere has to reach the person who is
 * already signed in. These pin the decision behind that: when to ask the
 * server, what counts as a change, and what the person is told. The hook that
 * wires it to the tab is covered in usePlanFreshness.test.tsx.
 */

vi.mock('../../services/supabaseClient', () => ({ supabase: null }));

import {
  applyPlanFields,
  createPlanFreshness,
  planChangeNotice,
  PLAN_FRESHNESS_INTERVAL_MS,
  type PlanNotice,
} from '../../utils/planFreshness';

const student = (overrides: Partial<User> = {}): User =>
  ({
    username: 'student-a',
    role: 'user',
    preferences: {},
    stats: { xp: 10 },
    ...overrides,
  }) as unknown as User;

const teacher = (overrides: Partial<User> = {}): User =>
  ({
    username: 'teacher-a',
    role: 'teacher',
    preferences: {},
    stats: {},
    ...overrides,
  }) as unknown as User;

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

/** A checker wired to spies, with a clock the test moves by hand. */
const harness = (
  initial: User | null,
  refresh: (u: User) => Promise<User | null> = async (u) => u,
  intervalMs?: number
) => {
  let now = 1_000_000;
  let current: User | null = initial;
  const onChange = vi.fn();
  const notify = vi.fn<(notice: PlanNotice) => void>();
  const refreshSpy = vi.fn(refresh);
  const freshness = createPlanFreshness(
    {
      getUser: () => current,
      refresh: refreshSpy,
      now: () => now,
      onChange,
      notify,
    },
    intervalMs
  );
  return {
    freshness,
    onChange,
    notify,
    refreshSpy,
    advance: (ms: number) => {
      now += ms;
    },
    setUser: (u: User | null) => {
      current = u;
    },
  };
};

describe('planChangeNotice', () => {
  it('says nothing when the resolved plan has not moved', () => {
    expect(planChangeNotice(student(), student())).toBeNull();
    expect(
      planChangeNotice(
        student({ stripePlan: 'plus' }),
        student({ stripePlan: 'plus', planPeriodEnd: '2027-03-01T00:00:00Z' })
      )
    ).toBeNull();
  });

  it('tells a student their school licence has become active, in the Band 6 Plus wording', () => {
    const notice = planChangeNotice(student(), student({ stripePlan: 'school' }));
    expect(notice).toEqual({
      type: 'success',
      message: "Your school's licence is active — Band 6 Plus is unlocked.",
    });
  });

  it('tells a student their school licence has lapsed, and that the features are locked again', () => {
    const notice = planChangeNotice(student({ stripePlan: 'school' }), student());
    expect(notice?.type).toBe('warning');
    expect(notice?.message).toBe(
      "Your school's licence is no longer active, so Band 6 Plus features are locked again."
    );
  });

  it('tells a teacher the licence has ended, but that their Plus staff access stays', () => {
    const notice = planChangeNotice(
      teacher({ stripePlan: 'school' }),
      teacher({ stripePlan: undefined })
    );
    expect(notice).toEqual({
      type: 'warning',
      message: "Your school's licence is no longer active. Your plan is now Band 6 Plus.",
    });
  });

  it('reads a personal subscription ending as a subscription, not as a licence', () => {
    const notice = planChangeNotice(student({ stripePlan: 'plus' }), student());
    expect(notice?.message).toBe(
      'Your Band 6 Plus subscription is no longer active, so its features are locked again.'
    );
  });

  it('announces a personal subscription that became active elsewhere', () => {
    const notice = planChangeNotice(student(), student({ stripePlan: 'plus' }));
    expect(notice).toEqual({
      type: 'success',
      message: 'Your subscription is active — Band 6 Plus is unlocked.',
    });
  });
});

describe('applyPlanFields', () => {
  it('returns the same object when the plan fields already match, so nothing re-renders', () => {
    const current = student({ stripePlan: 'school' });
    expect(applyPlanFields(current, student({ stripePlan: 'school' }))).toBe(current);
  });

  it('carries the plan fields across and keeps everything else the app already holds', () => {
    const current = student({
      stats: { xp: 999 } as never,
      preferences: { theme: 'light' } as never,
    });
    const refreshed = student({
      stripePlan: 'school',
      planPeriodEnd: '2027-03-01T00:00:00Z',
      planCancelAtPeriodEnd: true,
      stats: { xp: 1 } as never,
    });
    const merged = applyPlanFields(current, refreshed);
    expect(merged.stripePlan).toBe('school');
    expect(merged.planPeriodEnd).toBe('2027-03-01T00:00:00Z');
    expect(merged.planCancelAtPeriodEnd).toBe(true);
    // Stats are not the plan's business: the app's copy wins.
    expect(merged.stats).toEqual({ xp: 999 });
    expect(merged.preferences).toEqual({ theme: 'light' });
  });

  it('removes a plan the refreshed session no longer carries', () => {
    const current = student({
      stripePlan: 'school',
      planPeriodEnd: '2027-03-01T00:00:00Z',
      planCancelAtPeriodEnd: true,
    });
    const merged = applyPlanFields(current, student());
    expect('stripePlan' in merged).toBe(false);
    expect('planPeriodEnd' in merged).toBe(false);
    expect('planCancelAtPeriodEnd' in merged).toBe(false);
    expect(current.stripePlan).toBe('school');
  });
});

describe('createPlanFreshness', () => {
  it('waits out the interval before asking the server again', async () => {
    const h = harness(student());
    await h.freshness.check();
    expect(h.refreshSpy).not.toHaveBeenCalled();

    h.advance(PLAN_FRESHNESS_INTERVAL_MS - 1);
    await h.freshness.check();
    expect(h.refreshSpy).not.toHaveBeenCalled();

    h.advance(1);
    await h.freshness.check();
    expect(h.refreshSpy).toHaveBeenCalledTimes(1);
  });

  it('uses five minutes unless told otherwise', () => {
    expect(PLAN_FRESHNESS_INTERVAL_MS).toBe(5 * 60 * 1000);
  });

  it('never starts a second refresh while one is in flight', async () => {
    const pending = deferred<User | null>();
    const h = harness(student(), () => pending.promise, 0);
    const first = h.freshness.check();
    const second = h.freshness.check();
    expect(h.refreshSpy).toHaveBeenCalledTimes(1);

    pending.resolve(student());
    await Promise.all([first, second]);
    // And once it has settled, the next allowed check runs again.
    await h.freshness.check();
    expect(h.refreshSpy).toHaveBeenCalledTimes(2);
  });

  it('never refreshes a guest or a signed-out visitor, and does not spend the throttle on them', async () => {
    const guest = harness(student({ role: 'guest' as never }));
    guest.advance(PLAN_FRESHNESS_INTERVAL_MS);
    await guest.freshness.check();
    expect(guest.refreshSpy).not.toHaveBeenCalled();

    // Signed out for the whole interval, then signed in: the first check after
    // signing in is allowed at once, because nothing was spent while signed out.
    const signedOut = harness(null);
    signedOut.advance(PLAN_FRESHNESS_INTERVAL_MS);
    await signedOut.freshness.check();
    expect(signedOut.refreshSpy).not.toHaveBeenCalled();

    signedOut.setUser(student());
    await signedOut.freshness.check();
    expect(signedOut.refreshSpy).toHaveBeenCalledTimes(1);
  });

  it('is silent when the refreshed plan is the same', async () => {
    const h = harness(student({ stripePlan: 'school' }), async (u) => ({ ...u }), 0);
    await h.freshness.check();
    expect(h.onChange).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('applies a gained licence once, with one toast', async () => {
    const h = harness(student(), async (u) => ({ ...u, stripePlan: 'school' }) as User, 0);
    await h.freshness.check();
    expect(h.onChange).toHaveBeenCalledTimes(1);
    expect(h.onChange.mock.calls[0][0]).toMatchObject({ stripePlan: 'school' });
    expect(h.notify).toHaveBeenCalledTimes(1);
    expect(h.notify.mock.calls[0][0].type).toBe('success');

    // The next return to the tab sees the same plan and says nothing more.
    h.setUser(student({ stripePlan: 'school' }));
    await h.freshness.check();
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  it('moves the state without a toast when only the period end or cancellation changed', async () => {
    const h = harness(
      student({ stripePlan: 'school' }),
      async (u) => ({ ...u, planCancelAtPeriodEnd: true }) as User,
      0
    );
    await h.freshness.check();
    expect(h.onChange).toHaveBeenCalledTimes(1);
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('ignores a refresh that comes back empty, rather than signing anyone out', async () => {
    const h = harness(student(), async () => null, 0);
    await h.freshness.check();
    expect(h.onChange).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('drops a refresh that lands after the person has signed out or changed account', async () => {
    const pending = deferred<User | null>();
    const h = harness(student(), () => pending.promise, 0);
    const run = h.freshness.check();
    h.setUser(null);
    pending.resolve(student({ stripePlan: 'school' }));
    await run;
    expect(h.onChange).not.toHaveBeenCalled();

    // A session that answers for someone else is not this person's plan.
    const other = harness(
      student(),
      () => Promise.resolve(student({ username: 'someone-else', stripePlan: 'school' })),
      0
    );
    await other.freshness.check();
    expect(other.onChange).not.toHaveBeenCalled();
  });

  it('treats a failed refresh as no news, and tries again on the next return', async () => {
    let fail = true;
    const h = harness(
      student(),
      async (u) => {
        if (fail) throw new Error('offline');
        return { ...u, stripePlan: 'school' } as User;
      },
      0
    );
    await expect(h.freshness.check()).resolves.toBeUndefined();
    expect(h.notify).not.toHaveBeenCalled();

    fail = false;
    await h.freshness.check();
    expect(h.notify).toHaveBeenCalledTimes(1);
  });
});
