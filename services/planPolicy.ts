import {
  FREE_TIER_EVAL_LIMIT as DEFAULT_EVAL_LIMIT,
  FREE_TIER_MAX_QUESTION_TIER as DEFAULT_MAX_QUESTION_TIER,
  FREE_TIER_MAX_SAMPLE_BAND as DEFAULT_MAX_SAMPLE_BAND,
  FREE_TIER_FEEDBACK_SUMMARY_ONLY as DEFAULT_SUMMARY_ONLY,
} from './planLimits';

/**
 * The commercial policy: which plan unlocks which feature, and how far the
 * free tier reaches. This is the layer that is meant to CHANGE — pricing
 * experiments, a feature promoted from Plus to free, a limit tightened
 * because inference got expensive.
 *
 * Two properties it is built for:
 *
 *  1. **Granularity.** Every gate is a named feature key, and each key maps to
 *     the LOWEST plan that unlocks it. Moving one feature between plans is a
 *     one-line change here and nothing else — call sites only ever name the
 *     key, never a plan.
 *
 *  2. **Adjustability without a code change.** Every value can be overridden
 *     per deployment through environment variables (set them in the Vercel
 *     project and redeploy — no release, no PR). The defaults below are what
 *     ships; the overrides are what a given deployment sells.
 *
 * The API layer mirrors this file in `api/_lib/planPolicy.ts` — it runs in
 * plain Node and cannot read `import.meta.env`. The two are pinned together by
 * `tests/unit/planPolicy.test.ts`; the SERVER copy is the one that enforces.
 *
 * Everything here is evaluated lazily, at call time, for the chunk-ordering
 * reason documented in `./planLimits.ts`.
 */

export type Plan = 'free' | 'plus' | 'school';

export type PremiumFeatureKey =
  | 'pdfExport'
  | 'answerUpgrades'
  | 'aiContentStudio'
  | 'advancedQuestions'
  | 'fullFeedback'
  | 'sampleAnswers'
  | 'examMode'
  | 'outcomeBriefing';

/** Ascending order of generosity — used to compare two plans. */
export const PLAN_ORDER: Plan[] = ['free', 'plus', 'school'];

export const planRank = (plan: Plan): number => {
  const index = PLAN_ORDER.indexOf(plan);
  return index === -1 ? 0 : index;
};

/**
 * The LOWEST plan that unlocks each feature. This is the whole gating policy:
 * a feature is locked when the caller's plan ranks below its entry here.
 *
 * Expressed as "minimum plan" rather than a plan → features matrix because it
 * makes the common edit — "move sample answers into the free tier" — a single
 * value change that cannot leave the two directions disagreeing.
 */
const DEFAULT_FEATURE_MIN_PLAN: Record<PremiumFeatureKey, Plan> = {
  pdfExport: 'plus',
  answerUpgrades: 'plus',
  advancedQuestions: 'plus',
  fullFeedback: 'plus',
  sampleAnswers: 'plus',
  examMode: 'plus',
  // The AI briefing behind a linked outcome. The outcome CODE and its syllabus
  // wording stay free for everyone — that is published NESA content and the
  // student needs it to know what is being assessed. What Plus buys is the
  // model working out how that outcome applies to the question in front of
  // them, which is a provider call every time it is opened.
  outcomeBriefing: 'plus',
  // Authoring tools. Plus rather than School so the staff perk actually
  // reaches them: teachers resolve to Plus (getUserPlan step 3), and a studio
  // pinned to School meant a teacher saw half the authoring surface locked
  // behind a plan they were never going to buy personally. The plan is not the
  // only gate on authoring — `canUseAiGeneration` in utils/permissions.ts keeps
  // it to staff regardless of what a student pays — so pricing it at Plus does
  // not hand the studio to a student who subscribes.
  aiContentStudio: 'plus',
};

// ---------------------------------------------------------------------------
// Deployment overrides
// ---------------------------------------------------------------------------

/**
 * Vite inlines `import.meta.env.VITE_*` at build time, so each variable is
 * named literally rather than looked up dynamically. The optional chaining
 * keeps the module loadable in a plain-Node context, where `import.meta.env`
 * does not exist at all.
 */
const rawEnv = (): Record<string, string | undefined> => {
  try {
    return {
      VITE_MONETISATION_ENABLED: import.meta.env?.VITE_MONETISATION_ENABLED,
      VITE_PLAN_FEATURE_OVERRIDES: import.meta.env?.VITE_PLAN_FEATURE_OVERRIDES,
      VITE_FREE_TIER_EVAL_LIMIT: import.meta.env?.VITE_FREE_TIER_EVAL_LIMIT,
      VITE_FREE_TIER_MAX_QUESTION_TIER: import.meta.env?.VITE_FREE_TIER_MAX_QUESTION_TIER,
      VITE_FREE_TIER_MAX_SAMPLE_BAND: import.meta.env?.VITE_FREE_TIER_MAX_SAMPLE_BAND,
      VITE_FREE_TIER_FULL_FEEDBACK: import.meta.env?.VITE_FREE_TIER_FULL_FEEDBACK,
    };
  } catch {
    return {};
  }
};

/**
 * Parse `feature:plan` pairs — e.g. `sampleAnswers:free,examMode:school`.
 * Unknown keys and unknown plans are ignored rather than throwing: a typo in a
 * deployment variable must not take the app down, and the shipped default is
 * always a safe answer.
 */
export const parseFeatureOverrides = (
  raw: string | undefined,
  onIgnored?: (entry: string) => void
): Partial<Record<PremiumFeatureKey, Plan>> => {
  const out: Partial<Record<PremiumFeatureKey, Plan>> = {};
  if (!raw) return out;
  for (const entry of raw.split(',')) {
    const [keyPart, planPart] = entry.split(':').map((s) => s.trim());
    const key = keyPart as PremiumFeatureKey;
    const plan = planPart as Plan;
    if (!keyPart || !planPart) continue;
    if (!(key in DEFAULT_FEATURE_MIN_PLAN) || !PLAN_ORDER.includes(plan)) {
      onIgnored?.(entry.trim());
      continue;
    }
    out[key] = plan;
  }
  return out;
};

const numberOverride = (raw: string | undefined, fallback: number, min = 0): number => {
  const parsed = Number(raw);
  if (!raw || !Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.trunc(parsed));
};

/**
 * The master switch. `VITE_MONETISATION_ENABLED=false` opens every gate at
 * once — the honest way to run a school-wide pilot, an internal trial or a
 * conference demo, rather than hand-editing the policy and remembering to put
 * it back. Set the unprefixed `MONETISATION_ENABLED=false` alongside it so the
 * API stops enforcing too; the daily evaluation meter lives in Postgres and is
 * raised separately (`set_plan_setting('free_evaluation_limit', …)`).
 *
 * Opt-OUT, not opt-in: an unset or malformed value leaves the paywall ON. A
 * deployment must say `false` explicitly to give the product away.
 */
export const monetisationEnabled = (): boolean => rawEnv().VITE_MONETISATION_ENABLED !== 'false';

/** The effective feature → minimum-plan map for this deployment. */
export const featureMinPlans = (): Record<PremiumFeatureKey, Plan> => ({
  ...DEFAULT_FEATURE_MIN_PLAN,
  ...parseFeatureOverrides(rawEnv().VITE_PLAN_FEATURE_OVERRIDES, (entry) =>
    // Loud, because the failure mode is silent: a mistyped override leaves the
    // default in place and the deployment quietly sells the wrong thing.
    console.warn(`[planPolicy] ignoring unrecognised feature override "${entry}"`)
  ),
});

/** The lowest plan that unlocks a feature — what an upgrade prompt should sell. */
export const featureMinPlan = (feature: PremiumFeatureKey): Plan =>
  featureMinPlans()[feature] ?? 'school';

/** True when `plan` is generous enough to unlock `feature`. */
export const planUnlocks = (plan: Plan, feature: PremiumFeatureKey): boolean =>
  planRank(plan) >= planRank(featureMinPlan(feature));

/** Every feature a plan unlocks, in the declared display order. */
export const featuresForPlan = (plan: Plan): PremiumFeatureKey[] =>
  (Object.keys(DEFAULT_FEATURE_MIN_PLAN) as PremiumFeatureKey[]).filter((key) =>
    planUnlocks(plan, key)
  );

/**
 * The free tier's reach. `evalLimit` is the DISPLAY default only — the live
 * number is whatever `free_evaluation_limit()` returns in Postgres, which an
 * admin can change without a deploy, and which the server reports back to the
 * client on the first refusal (see entitlements.syncFreeEvalCount).
 */
export const freeTierLimits = () => {
  const env = rawEnv();
  return {
    evalLimit: numberOverride(env.VITE_FREE_TIER_EVAL_LIMIT, DEFAULT_EVAL_LIMIT, 0),
    maxQuestionTier: numberOverride(
      env.VITE_FREE_TIER_MAX_QUESTION_TIER,
      DEFAULT_MAX_QUESTION_TIER
    ),
    maxSampleBand: numberOverride(env.VITE_FREE_TIER_MAX_SAMPLE_BAND, DEFAULT_MAX_SAMPLE_BAND),
    // Opt-IN to giving the free tier everything: `VITE_FREE_TIER_FULL_FEEDBACK=true`
    // turns the summary-only restriction off.
    summaryFeedbackOnly: env.VITE_FREE_TIER_FULL_FEEDBACK === 'true' ? false : DEFAULT_SUMMARY_ONLY,
  };
};
