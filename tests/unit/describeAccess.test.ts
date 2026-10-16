import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { User } from '../../types';

/**
 * `describeAccess` is the one answer to "what do I tell this person about this
 * feature?". This file is table-driven over audience x feature x deployment
 * override, and every expectation is derived from the POLICY (planUnlocks,
 * featureMinPlan, getUserPlan), not copied from the implementation. So a new
 * feature key that has no sensible answer for some audience fails here, and so
 * does a wording that offers the wrong button.
 */

vi.mock('../../services/supabaseClient', () => ({ supabase: null }));

import {
  describeAccess,
  getUserPlan,
  PLAN_LABELS,
  PREMIUM_FEATURES,
  type AccessDescription,
} from '../../services/entitlements';
import { featureMinPlan, planUnlocks, type PremiumFeatureKey } from '../../services/planPolicy';
import { canUseAiGeneration } from '../../utils/permissions';

const ALL_FEATURES = Object.keys(PREMIUM_FEATURES) as PremiumFeatureKey[];

interface Audience {
  name: string;
  user: User;
}

const base = (over: Partial<User>): User =>
  ({ username: 'someone', role: 'user', stats: {}, ...over }) as unknown as User;

const AUDIENCES: Audience[] = [
  { name: 'student, free', user: base({ role: 'user' }) },
  { name: 'student, own Plus', user: base({ role: 'user', stripePlan: 'plus' }) },
  { name: 'guest', user: base({ role: 'guest' }) },
  { name: 'teacher, no school', user: base({ role: 'teacher' }) },
  {
    name: 'teacher, unlicensed school',
    user: base({ role: 'teacher', schoolId: 's1', schoolName: 'Hills High' }),
  },
  {
    name: 'teacher, own Plus, unlicensed school',
    user: base({ role: 'teacher', schoolId: 's1', schoolName: 'Hills High', stripePlan: 'plus' }),
  },
  {
    name: 'teacher, licensed school',
    user: base({ role: 'teacher', schoolId: 's1', schoolName: 'Hills High', stripePlan: 'school' }),
  },
  { name: 'admin', user: base({ role: 'admin' }) },
];

/** The deployment settings a school can run with. */
const DEPLOYMENTS: { name: string; env: Record<string, string> }[] = [
  { name: 'shipped policy', env: {} },
  {
    name: 'cohortReports restored to Plus',
    env: { VITE_PLAN_FEATURE_OVERRIDES: 'cohortReports:plus' },
  },
  {
    name: 'sample answers priced at School',
    env: { VITE_PLAN_FEATURE_OVERRIDES: 'sampleAnswers:school' },
  },
  { name: 'monetisation off', env: { VITE_MONETISATION_ENABLED: 'false' } },
];

const isStaff = (user: User) => user.role === 'teacher' || user.role === 'admin';

/** What the policy says, worked out without describeAccess. */
const expectedState = (
  feature: PremiumFeatureKey,
  user: User
): 'open' | 'locked-plan' | 'locked-role' => {
  if (user.role === 'admin') return 'open';
  if (feature === 'aiContentStudio' && !canUseAiGeneration(user.role)) return 'locked-role';
  return planUnlocks(getUserPlan(user), feature) ? 'open' : 'locked-plan';
};

const describeCase = (feature: PremiumFeatureKey, audience: Audience): AccessDescription =>
  describeAccess(feature, audience.user);

afterEach(() => vi.unstubAllEnvs());

describe.each(DEPLOYMENTS)('describeAccess on a $name', ({ env }) => {
  beforeEach(() => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  });

  it.each(AUDIENCES)('answers every feature for a $name', (audience) => {
    for (const feature of ALL_FEATURES) {
      const answer = describeCase(feature, audience);
      const want =
        env.VITE_MONETISATION_ENABLED === 'false' ? 'open' : expectedState(feature, audience.user);

      // The state is what the policy says.
      expect(
        answer.state === 'open' ? 'open' : answer.cause === 'role' ? 'locked-role' : 'locked-plan',
        `${feature} for ${audience.name}`
      ).toBe(want);
      expect(answer.audience).toBe(
        audience.user.role === 'admin'
          ? 'admin'
          : audience.user.role === 'teacher'
            ? 'teacher'
            : 'student'
      );

      if (answer.state === 'open') {
        // Nothing to say, and nothing to offer: nobody is sold what they hold.
        expect(answer.cta, `${feature} open for ${audience.name}`).toBe('none');
        expect(answer.ctaLabel).toBe('');
        expect(answer.explanation).toBe('');
        continue;
      }

      // Every locked answer says something, and names the feature.
      expect(
        answer.explanation.length,
        `${feature} explanation for ${audience.name}`
      ).toBeGreaterThan(0);
      expect(answer.explanation).toContain(PREMIUM_FEATURES[feature].title);

      if (answer.cause === 'role') {
        // A role lock is never an upgrade: paying would not help.
        expect(answer.cta).toBe('none');
        expect(answer.ctaLabel).toBe('');
        expect(answer.planNeeded).toBeNull();
        continue;
      }

      const planNeeded = featureMinPlan(feature);
      expect(answer.planNeeded).toBe(planNeeded);
      expect(answer.planLabel).toBe(PLAN_LABELS[planNeeded]);
      expect(answer.ctaLabel.length).toBeGreaterThan(0);
      expect(answer.cta).not.toBe('none');

      if (planNeeded !== 'school') {
        // A Plus lock. A teacher is never locked out of Plus (the staff perk
        // holds it), so only a student or a guest is offered the upgrade.
        expect(isStaff(audience.user), `${feature} is Plus-locked for ${audience.name}`).toBe(
          false
        );
        expect(answer.cta).toBe('upgrade');
        expect(answer.ctaLabel).toBe(`Upgrade to ${PLAN_LABELS.plus}`);
        continue;
      }

      // A School lock. A student is never sold a licence.
      if (!isStaff(audience.user)) {
        expect(answer.cta, `${feature} for ${audience.name}`).toBe('ask-admin');
        expect(answer.explanation).toMatch(/ask your teacher or administrator/i);
        continue;
      }
      // A teacher with a school that has no licence can buy one; one with no
      // school is sent to an admin. Neither is offered Plus.
      expect(answer.cta).toMatch(/^(buy-school|ask-admin)$/);
      expect(answer.cta).not.toBe('upgrade');
      if (audience.user.schoolId) {
        expect(answer.cta).toBe('buy-school');
        expect(answer.ctaLabel).toBe(`Get a ${PLAN_LABELS.school} licence`);
      } else {
        expect(answer.cta).toBe('ask-admin');
      }
    }
  });
});

describe('describeAccess, the cases a reader has to get right', () => {
  it('tells a teacher with their own Plus that Plus does not cover a School feature', () => {
    const answer = describeAccess(
      'cohortReports',
      base({ role: 'teacher', schoolId: 's1', schoolName: 'Hills High', stripePlan: 'plus' })
    );
    expect(answer.cta).toBe('buy-school');
    expect(answer.explanation).toMatch(/your own Band 6 Plus plan does not include it/i);
    expect(answer.explanation).toMatch(/Hills High/);
  });

  it('gives a teacher at no school the admin route, and no checkout', () => {
    const answer = describeAccess('cohortReports', base({ role: 'teacher' }));
    expect(answer.cta).toBe('ask-admin');
    expect(answer.ctaLabel).toMatch(/add you to your school/i);
  });

  it('never returns an upgrade button for a student when the feature is School-priced', () => {
    vi.stubEnv('VITE_PLAN_FEATURE_OVERRIDES', 'sampleAnswers:school');
    const answer = describeAccess('sampleAnswers', base({ role: 'user', stripePlan: 'plus' }));
    expect(answer.cta).toBe('ask-admin');
    expect(answer.ctaLabel).not.toMatch(/upgrade/i);
  });

  it('answers a student who presses the AI Content Studio with the role, not a plan upgrade', () => {
    const answer = describeAccess('aiContentStudio', base({ role: 'user', stripePlan: 'plus' }));
    expect(answer.state).toBe('locked');
    expect(answer.cause).toBe('role');
    expect(answer.cta).toBe('none');
    expect(answer.explanation).toMatch(/teacher and admin accounts/);
  });

  it('is open to everyone when the deployment sells nothing', () => {
    vi.stubEnv('VITE_MONETISATION_ENABLED', 'false');
    expect(describeAccess('cohortReports', base({ role: 'teacher' })).state).toBe('open');
    expect(describeAccess('aiContentStudio', base({ role: 'user' })).state).toBe('open');
  });
});
