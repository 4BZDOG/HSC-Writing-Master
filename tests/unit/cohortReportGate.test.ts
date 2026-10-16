import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { User } from '../../types';

/**
 * The Class & School reports are a School-tier feature. Three things have to
 * hold for that to be true, and each has a test here:
 *
 *  1. The policy prices `cohortReports` at School in BOTH copies (client and
 *     API), and a deployment can restore Plus with the documented override.
 *  2. A teacher holds School only through a licence, and the higher of their
 *     own plan and the licence wins at sign-in, as caller_plan() does on the
 *     server. A teacher with a personal Plus in a licensed school must not be
 *     locked out of the report they were sold.
 *  3. The lock follows the audience: the student's own progress report stays on
 *     `pdfExport` (Plus), and only staff reports need School.
 */

// One profile read is all applySchoolPlan makes, so a fixed row is enough.
let profileRow: unknown = null;
let profileError: unknown = null;
vi.mock('../../services/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: profileRow, error: profileError }),
        }),
      }),
    }),
  },
}));

import { applySchoolPlan } from '../../services/authService';
import { getUserPlan, isFeatureLocked } from '../../services/entitlements';
import { featureMinPlan, featureMinPlans } from '../../services/planPolicy';
import {
  featureMinPlan as serverFeatureMinPlan,
  featureMinPlans as serverFeatureMinPlans,
} from '../../api/_lib/planPolicy';

const LIVE_END = '2026-12-31T00:00:00.000Z';

const user = (over: Partial<User> = {}): User => ({
  username: 'ms.teacher',
  role: 'teacher',
  displayName: 'Ms Teacher',
  preferences: {} as User['preferences'],
  stats: {} as User['stats'],
  ...over,
});

/** A profile row as the sign-in read returns it: the school embedded. */
const schoolRow = (school: Record<string, unknown> | null, schoolId: string | null = 's1') => ({
  school_id: schoolId,
  school: school,
});

beforeEach(() => {
  profileRow = null;
  profileError = null;
});
afterEach(() => vi.unstubAllEnvs());

describe('cohortReports is priced at School, in both copies', () => {
  it('the client and the API both default it to School', () => {
    expect(featureMinPlan('cohortReports')).toBe('school');
    expect(serverFeatureMinPlan('cohortReports')).toBe('school');
  });

  it('the documented override restores Plus on the client (VITE_) and the server', () => {
    vi.stubEnv('VITE_PLAN_FEATURE_OVERRIDES', 'cohortReports:plus');
    expect(featureMinPlans().cohortReports).toBe('plus');
    vi.unstubAllEnvs();

    const before = process.env.PLAN_FEATURE_OVERRIDES;
    process.env.PLAN_FEATURE_OVERRIDES = 'cohortReports:plus';
    try {
      expect(serverFeatureMinPlans().cohortReports).toBe('plus');
    } finally {
      if (before === undefined) delete process.env.PLAN_FEATURE_OVERRIDES;
      else process.env.PLAN_FEATURE_OVERRIDES = before;
    }
  });
});

describe('the lock follows the audience', () => {
  it('locks a teacher who holds only the staff perk (Plus)', () => {
    const teacher = user();
    expect(getUserPlan(teacher)).toBe('plus');
    expect(isFeatureLocked('cohortReports', teacher)).toBe(true);
  });

  it('opens for a teacher whose licence is live, and for an admin by role', () => {
    expect(isFeatureLocked('cohortReports', user({ stripePlan: 'school' }))).toBe(false);
    expect(isFeatureLocked('cohortReports', user({ role: 'admin' }))).toBe(false);
  });

  it('keeps a student on Plus for their own report, and locks a student from the cohort report', () => {
    const student = user({ role: 'user', stripePlan: 'plus' });
    expect(isFeatureLocked('pdfExport', student)).toBe(false);
    expect(isFeatureLocked('cohortReports', student)).toBe(true);
  });
});

describe('applySchoolPlan: the higher of the personal plan and the licence', () => {
  it('a teacher with their own Plus in a live licensed school holds School', async () => {
    profileRow = schoolRow({
      name: 'Hills High',
      plan_status: 'active',
      plan_period_end: LIVE_END,
      plan_cancel_at_period_end: false,
    });
    const held = await applySchoolPlan(
      'u1',
      user({ stripePlan: 'plus', planPeriodEnd: '2026-06-01T00:00:00.000Z' })
    );
    expect(held.stripePlan).toBe('school');
    expect(getUserPlan(held)).toBe('school');
    expect(isFeatureLocked('cohortReports', held)).toBe(false);
    // The licence's renewal date replaces the personal one it outranks.
    expect(held.planPeriodEnd).toBe(LIVE_END);
  });

  it('a licence with no end date does not leave the personal date on the School plan', async () => {
    profileRow = schoolRow({ name: 'Hills High', plan_status: 'active', plan_period_end: null });
    const held = await applySchoolPlan(
      'u1',
      user({ stripePlan: 'plus', planPeriodEnd: '2026-06-01T00:00:00.000Z' })
    );
    expect(held.stripePlan).toBe('school');
    expect(held.planPeriodEnd).toBeUndefined();
  });

  it('a teacher with no plan of their own gets School from the licence alone', async () => {
    profileRow = schoolRow({ name: 'Hills High', plan_status: 'trialing', plan_period_end: null });
    const held = await applySchoolPlan('u1', user());
    expect(held.stripePlan).toBe('school');
  });

  it('a lapsed licence leaves a personal Plus in place, and keeps the school attached', async () => {
    profileRow = schoolRow({ name: 'Hills High', plan_status: 'canceled', plan_period_end: null });
    const held = await applySchoolPlan('u1', user({ stripePlan: 'plus' }));
    expect(held.stripePlan).toBe('plus');
    expect(held.schoolId).toBe('s1');
    expect(held.schoolName).toBe('Hills High');
  });

  it('an unlicensed school is carried on the session, so the buy route can be offered', async () => {
    profileRow = schoolRow({ name: 'Hills High', plan_status: 'none', plan_period_end: null });
    const attached = await applySchoolPlan('u1', user());
    expect(attached.stripePlan).toBeUndefined();
    expect(attached.schoolId).toBe('s1');
    expect(attached.schoolName).toBe('Hills High');
  });

  it('a teacher with no school has neither field, so the answer is "ask an admin"', async () => {
    profileRow = schoolRow(null, null);
    const unattached = await applySchoolPlan('u1', user({ schoolId: 'old', schoolName: 'Old' }));
    expect(unattached.schoolId).toBeUndefined();
    expect(unattached.schoolName).toBeUndefined();
  });

  it('a failed read leaves the user exactly as the profile read made them', async () => {
    profileError = { message: 'column "plan_status" does not exist' };
    const before = user({ stripePlan: 'plus' });
    expect(await applySchoolPlan('u1', before)).toBe(before);
  });
});
