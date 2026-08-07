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

  /** The source of one exported service function, by name. */
  const bodyOf = (name: string): string => {
    const start = service.indexOf(`export const ${name}`);
    expect(start, `${name} not found in geminiService`).toBeGreaterThan(-1);
    const next = service.indexOf('export const', start + 10);
    return service.slice(start, next === -1 ? undefined : next);
  };

  it('tags the calls whose UI entry points are plan-gated', () => {
    // Without the tag the proxy cannot tell that a call belongs to a paid
    // feature, and the gate silently does nothing.
    expect(bodyOf('evaluateAnswer')).toContain("__feature: 'evaluation'");
    expect(bodyOf('improveAnswer')).toContain("__feature: 'answerUpgrades'");
  });

  it('tags every AI Content Studio call, not just the obvious ones', () => {
    // The studio used to be enforced on four calls out of a dozen: an author
    // saw "Generate question" locked and "Generate marking guide", "Suggest
    // keywords" and the syllabus parsers wide open, with no server gate behind
    // any of them. Whichever plan the studio is priced at, this is the list
    // that has to move together — a new authoring call added without a tag is
    // the same hole reopening.
    for (const fn of [
      'generateScenarioForPrompt',
      'generateKeywordsForPrompt',
      'suggestOutcomesForPrompt',
      'reviseSampleAnswer',
      'performQualityCheck',
      'refineManualPrompt',
      'generateNewPrompt',
      'generateSampleAnswer',
      'parseOutcomesFromText',
      'parseSyllabusStructure',
      'splitSyllabusIntoTopics',
      'generateDotPointsForSubTopic',
      'generateRubricForPrompt',
      'reviseRubricForPrompt',
    ]) {
      expect(bodyOf(fn), `${fn} should be tagged`).toContain("__feature: 'aiContentStudio'");
    }
  });

  it('leaves the calls a STUDENT makes untagged', () => {
    // None of these is an authoring action, and tagging any of them refuses a
    // free student something that was never being sold:
    //   explainOutcomeInContext → the reference-materials explainer
    //   enrichPromptDetails     → the automatic backfill that runs when ANY
    //                             user opens a question missing a scenario,
    //                             keywords or linked outcomes. Tagging it
    //                             opened an "AI Content Studio" upgrade prompt
    //                             at a student who had only clicked a question.
    //   screenContentQuality    → the automatic pre-screen on a shared-library
    //                             contribution (it passes { studio: false })
    // The AI quota still meters all three; that is the gate that belongs here.
    expect(bodyOf('explainOutcomeInContext')).not.toContain('__feature');
    expect(bodyOf('enrichPromptDetails')).not.toContain('__feature');
    expect(bodyOf('screenContentQuality')).toContain('studio: false');
  });
});
