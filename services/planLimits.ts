/**
 * Free/paid plan limits — the raw numbers, in a module with NO imports.
 *
 * These live apart from `entitlements.ts` (which re-exports them, so every
 * existing call site is unchanged) for two reasons:
 *
 *  1. `entitlements.ts` imports `authService` → `supabaseClient` →
 *     `import.meta.env`. Anything that only needs a NUMBER should not have to
 *     drag the whole auth stack — and a plain-Node context (the Playwright
 *     runner) cannot load that chain at all.
 *
 *  2. Bundle safety. `data/legalContent.ts` interpolates these numbers into the
 *     Terms of Use. When Rollup put the content file in a different chunk from
 *     `entitlements.ts`, and those chunks imported each other circularly, the
 *     content chunk executed first and read a `const` the other chunk had not
 *     initialised — a blank page with "Cannot access 'Cs' before
 *     initialization". A leaf module cannot pull a cycle in behind it.
 *
 * Both callers ALSO defer the interpolation to call time (see
 * `getLegalDocuments()` and `buildPlanComparison()`), which is what actually
 * makes chunk placement irrelevant. This file removes the coupling; the lazy
 * accessors remove the hazard. Keep both.
 *
 * KEEP THIS FILE IMPORT-FREE.
 *
 * These are the CLIENT's view of the limits. Authoritative enforcement is
 * server-side (supabase/schema.sql §11–§14 and the AI proxy);
 * `tests/unit/entitlementConstants.test.ts` asserts the two agree.
 */

/** Free users can attempt questions up to this command-term tier (inclusive). */
export const FREE_TIER_MAX_QUESTION_TIER = 3;

/** Free users get this many marked evaluations per day. */
export const FREE_TIER_EVAL_LIMIT = 5;

/** Free users can view sample answers up to this band (inclusive). */
export const FREE_TIER_MAX_SAMPLE_BAND = 3;

/**
 * Free users see a summary verdict + overall band but NOT the full
 * criterion-by-criterion breakdown, marker notes or improvement paths.
 */
export const FREE_TIER_FEEDBACK_SUMMARY_ONLY = true;

/**
 * Daily AI-call allowances, for DISPLAY only (the upgrade prompt and the plan
 * comparison). The real budget is enforced server-side by the proxy against
 * `ai_quota_limits` (schema §11), where an admin can raise or lower it per role
 * and per user — so these are the shipped defaults, not a promise. Distinct
 * from FREE_TIER_EVAL_LIMIT, which meters marked evaluations only.
 */
export const FREE_DAILY_AI_CALLS = 60;
export const PAID_DAILY_AI_CALLS = 300;
