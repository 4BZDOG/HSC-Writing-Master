/**
 * Server-side mirror of `services/planPolicy.ts`.
 *
 * The client copy decides what to SHOW as locked; this copy decides what the
 * proxy will actually do. That distinction matters: everything the client
 * enforces is advisory, because a determined user can edit the bundle, drop a
 * flag, or POST to `/api/gemini` by hand. Before this file, the AI Content
 * Studio and answer upgrades were gated in the UI and nowhere else, so those
 * two were a paywall with a "please don't" sign on it for anyone who opened
 * devtools. `featureFromRequest` below is what made them real.
 *
 * WHICH GATES THIS FILE COVERS. Only the ones that spend a provider call and
 * carry a `__feature` tag: `aiContentStudio` and `answerUpgrades`. The other
 * four are enforced elsewhere, or not at all:
 *
 *   - `fullFeedback` — enforced, but by redaction rather than refusal
 *     (`redactEvaluationResponse` in ./entitlements.ts strips the paid parts
 *     out of the marking result before it is sent).
 *   - `advancedQuestions` — UI-only. Attempting a tier-4+ question is not a
 *     distinct call: it is an ordinary evaluation, so a tampered client can
 *     mark one at the cost of a free evaluation it had anyway. Gating it here
 *     would mean sending the question's tier with the request and trusting it,
 *     which enforces nothing. Low value to steal, so it is left as a routing
 *     gate (components/Workspace.tsx catches every route into a question).
 *   - `sampleAnswers` — UI-only, and unfixable at this layer: exemplars are
 *     content the client already holds, so the blur is presentation. Withhold
 *     them at the point they are FETCHED if this ever needs to be real.
 *   - `pdfExport`, `examMode` — UI-only by nature. Both run entirely in the
 *     browser over data the user already has; there is no server call to
 *     refuse and nothing to withhold.
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

/**
 * Server half of the master switch: `MONETISATION_ENABLED=false` stops the
 * proxy enforcing plan gates, for a pilot or a demo deployment. Falls back to
 * the VITE_ copy so one Vercel variable can drive both halves, and defaults to
 * ON — a deployment has to say `false` to give the product away.
 *
 * Note this covers the PLAN gates only. The daily evaluation allowance is
 * metered in Postgres; raise it there
 * (`select set_plan_setting('free_evaluation_limit', 1000)`).
 */
export const monetisationEnabled = (): boolean =>
  (process.env.MONETISATION_ENABLED ?? process.env.VITE_MONETISATION_ENABLED) !== 'false';

/**
 * Whether the free tier is held to a summary verdict rather than the full
 * criterion-by-criterion breakdown. Server half of `summaryFeedbackOnly` in
 * services/planPolicy.ts, with the same opt-in to giving it all away
 * (`FREE_TIER_FULL_FEEDBACK=true`) and the same VITE_ fallback.
 *
 * The proxy REMOVES the withheld feedback from a free-tier result, so this
 * has to agree with the client: if the UI stops locking the panel while the
 * server keeps stripping it, a free user gets an unlocked view of
 * placeholder text with no way to reveal anything.
 */
export const freeTierSummaryFeedbackOnly = (): boolean =>
  (process.env.FREE_TIER_FULL_FEEDBACK ?? process.env.VITE_FREE_TIER_FULL_FEEDBACK) !== 'true';

/**
 * Whether the proxy should withhold paid feedback from a free-tier marking
 * result. Both switches have to be on: the master monetisation switch (a
 * pilot or demo deployment turns the whole paywall off) and the summary-only
 * policy itself.
 */
export const shouldRedactFreeTierFeedback = (): boolean =>
  monetisationEnabled() && freeTierSummaryFeedbackOnly();

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
