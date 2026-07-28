import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  featureMinPlan,
  featuresForPlan,
  freeTierLimits,
  parseFeatureOverrides,
  planUnlocks,
  PLAN_ORDER,
  type PremiumFeatureKey,
} from '../../services/planPolicy';
import {
  featureFromRequest,
  featureMinPlan as serverFeatureMinPlan,
  parseFeatureOverrides as serverParseOverrides,
  planUnlocks as serverPlanUnlocks,
} from '../../api/_lib/planPolicy';
import { PREMIUM_FEATURES } from '../../services/entitlements';

/**
 * The commercial policy has to say the same thing in three places: the client
 * (which decides what to lock), the API (which decides what to serve), and the
 * feature catalogue the upgrade prompt sells from. Drift here is the expensive
 * kind — either a paid feature is given away, or a paying customer is refused.
 */

const ALL_FEATURES = Object.keys(PREMIUM_FEATURES) as PremiumFeatureKey[];

describe('plan policy', () => {
  it('gates every advertised feature, and advertises every gated feature', () => {
    for (const key of ALL_FEATURES) {
      expect(PLAN_ORDER, `${key} has no minimum plan`).toContain(featureMinPlan(key));
    }
    // Nothing in the policy may be unsellable: a key with no catalogue entry
    // would render an upgrade prompt with a blank title.
    for (const key of ALL_FEATURES) {
      expect(PREMIUM_FEATURES[key]?.title, `${key} has no catalogue entry`).toBeTruthy();
    }
  });

  it('agrees with the server copy, feature for feature', () => {
    for (const key of ALL_FEATURES) {
      expect(serverFeatureMinPlan(key), `${key} differs between client and server`).toBe(
        featureMinPlan(key)
      );
    }
  });

  it('never locks a feature for a plan above the one that unlocks it', () => {
    for (const key of ALL_FEATURES) {
      const min = featureMinPlan(key);
      const higher = PLAN_ORDER.slice(PLAN_ORDER.indexOf(min));
      for (const plan of higher) {
        expect(planUnlocks(plan, key), `${plan} should unlock ${key}`).toBe(true);
        expect(serverPlanUnlocks(plan, key), `server: ${plan} should unlock ${key}`).toBe(true);
      }
    }
  });

  it('keeps the free tier free of paid features', () => {
    expect(featuresForPlan('free')).toEqual([]);
  });

  it('parses deployment overrides and ignores nonsense', () => {
    const parsed = parseFeatureOverrides('sampleAnswers:free, examMode:school ,bogus:plus,pdf:');
    expect(parsed).toEqual({ sampleAnswers: 'free', examMode: 'school' });
    // The server parser must accept exactly the same syntax, or one half of a
    // deployment would silently keep the default.
    expect(serverParseOverrides('sampleAnswers:free, examMode:school')).toEqual({
      sampleAnswers: 'free',
      examMode: 'school',
    });
  });

  it('reads a paid feature tag off a proxied request, and nothing else', () => {
    expect(featureFromRequest({ __feature: 'aiContentStudio' })).toBe('aiContentStudio');
    expect(featureFromRequest({ __feature: 'answerUpgrades' })).toBe('answerUpgrades');
    // Metered by count, not by plan — it has its own gate and must not be
    // caught by this one.
    expect(featureFromRequest({ __feature: 'evaluation' })).toBeNull();
    expect(featureFromRequest({ __feature: 'made-up' })).toBeNull();
    expect(featureFromRequest({})).toBeNull();
    expect(featureFromRequest(null)).toBeNull();
  });

  it('exposes free-tier limits as numbers the UI can state', () => {
    const limits = freeTierLimits();
    expect(limits.evalLimit).toBeGreaterThan(0);
    expect(limits.maxQuestionTier).toBeGreaterThan(0);
    expect(limits.maxSampleBand).toBeGreaterThan(0);
    expect(typeof limits.summaryFeedbackOnly).toBe('boolean');
  });
});

describe('paid AI calls carry their feature tag', () => {
  const service = readFileSync(resolve(__dirname, '../../services/geminiService.ts'), 'utf8');

  it('tags the calls whose UI entry points are plan-gated', () => {
    // Without the tag the proxy cannot tell that a call belongs to a paid
    // feature, and the gate silently does nothing.
    const tagged = service.match(/__feature: '([a-zA-Z]+)'/g) ?? [];
    expect(tagged).toContain("__feature: 'evaluation'");
    expect(tagged).toContain("__feature: 'answerUpgrades'");
    expect(tagged.filter((t) => t.includes('aiContentStudio')).length).toBeGreaterThanOrEqual(5);
  });

  it('leaves manual question entry untagged', () => {
    // refineManualPrompt backs the "Manual" button, which is role-gated but
    // NOT plan-gated. Tagging it would refuse teachers a tool they have.
    const refine = service.slice(service.indexOf('export const refineManualPrompt'));
    const body = refine.slice(0, refine.indexOf('export const', 10));
    expect(body).not.toContain('__feature');
  });
});
