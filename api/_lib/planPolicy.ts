/**
 * Server-side mirror of `services/planPolicy.ts`.
 *
 * The client copy decides what to SHOW as locked; this copy decides what the
 * proxy will actually do. That distinction matters: everything the client
 * enforces is advisory, because a determined user can edit the bundle, drop a
 * flag, or POST to `/api/gemini` by hand. Before this file, three of the seven
 * paid features — the AI Content Studio, answer upgrades, and (below the
 * question picker) advanced questions — were gated in the UI and nowhere else,
 * so the paywall was a suggestion for anyone who opened devtools.
 *
 * Kept in step with the client copy by `tests/unit/planPolicy.test.ts`. It
 * cannot simply import that module: this code runs in plain Node on Vercel,
 * and the client copy reads `import.meta.env`, which does not exist there.
 *
 * Deployment overrides use the same syntax as the client
 * (`feature:plan,feature:plan`) and are read from `PLAN_FEATURE_OVERRIDES`,
 * falling back to `VITE_PLAN_FEATURE_OVERRIDES` so a single Vercel variable
 * can drive both halves.
 */

export type Plan = 'free' | 'plus' | 'school';

export type PremiumFeatureKey =
  | 'pdfExport'
  | 'answerUpgrades'
  | 'aiContentStudio'
  | 'advancedQuestions'
  | 'fullFeedback'
  | 'sampleAnswers'
  | 'examMode';

export const PLAN_ORDER: Plan[] = ['free', 'plus', 'school'];

export const planRank = (plan: Plan): number => {
  const index = PLAN_ORDER.indexOf(plan);
  return index === -1 ? 0 : index;
};

/** MUST match DEFAULT_FEATURE_MIN_PLAN in services/planPolicy.ts. */
const DEFAULT_FEATURE_MIN_PLAN: Record<PremiumFeatureKey, Plan> = {
  pdfExport: 'plus',
  answerUpgrades: 'plus',
  advancedQuestions: 'plus',
  fullFeedback: 'plus',
  sampleAnswers: 'plus',
  examMode: 'plus',
  aiContentStudio: 'school',
};

export const parseFeatureOverrides = (
  raw: string | undefined
): Partial<Record<PremiumFeatureKey, Plan>> => {
  const out: Partial<Record<PremiumFeatureKey, Plan>> = {};
  if (!raw) return out;
  for (const entry of raw.split(',')) {
    const [keyPart, planPart] = entry.split(':').map((s) => s.trim());
    const key = keyPart as PremiumFeatureKey;
    const plan = planPart as Plan;
    if (!keyPart || !planPart) continue;
    if (!(key in DEFAULT_FEATURE_MIN_PLAN) || !PLAN_ORDER.includes(plan)) {
      console.warn(`[planPolicy] ignoring unrecognised feature override "${entry.trim()}"`);
      continue;
    }
    out[key] = plan;
  }
  return out;
};

export const featureMinPlans = (): Record<PremiumFeatureKey, Plan> => ({
  ...DEFAULT_FEATURE_MIN_PLAN,
  ...parseFeatureOverrides(
    process.env.PLAN_FEATURE_OVERRIDES ?? process.env.VITE_PLAN_FEATURE_OVERRIDES
  ),
});

export const featureMinPlan = (feature: PremiumFeatureKey): Plan =>
  featureMinPlans()[feature] ?? 'school';

export const planUnlocks = (plan: Plan, feature: PremiumFeatureKey): boolean =>
  planRank(plan) >= planRank(featureMinPlan(feature));

/**
 * Which product feature a proxied AI call belongs to, from the `__feature` tag
 * the client stamps on the request body (stripped before the provider sees it,
 * see `_lib/providers.ts`). Unknown or absent tags return null and are not
 * gated — new call sites must opt IN to metering, so forgetting a tag cannot
 * accidentally lock a feature nobody meant to sell.
 *
 * `evaluation` is deliberately absent: it is metered by count rather than by
 * plan (schema §14), and has its own fingerprint-based detection precisely
 * because it is the one worth lying about.
 */
export const featureFromRequest = (body: unknown): PremiumFeatureKey | null => {
  if (!body || typeof body !== 'object') return null;
  const tag = (body as { __feature?: unknown }).__feature;
  if (typeof tag !== 'string') return null;
  return tag in DEFAULT_FEATURE_MIN_PLAN ? (tag as PremiumFeatureKey) : null;
};
