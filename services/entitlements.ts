import { authService } from './authService';
import type { User } from '../types';

/**
 * Monetisation / entitlements — single source of truth.
 *
 * The commercial model is not finalised, so everything a future pricing
 * decision could change lives in this one file:
 *
 *   - `MONETISATION_ENABLED`  — master switch; false hides every lock in the app
 *   - `PREMIUM_FEATURES`      — which features are gated, and the friendly copy
 *                               the upgrade prompt shows for each
 *   - `getUserPlan`           — how a user's plan is resolved (currently a
 *                               role-based placeholder; swap for a real
 *                               subscription lookup when billing lands)
 *
 * UI surfaces never hard-code any of this. A gated control stays VISIBLE but
 * renders in its locked style (amber + lock chip) and calls `requestUpgrade()`
 * instead of its real action; the UpgradeModal listens for that event.
 */

export type Plan = 'free' | 'plus';

export const MONETISATION_ENABLED = true;

export const PLAN_LABELS: Record<Plan, string> = {
  free: 'Free',
  plus: 'Writing Studio Plus',
};

export type PremiumFeatureKey = 'pdfExport' | 'answerUpgrades' | 'aiContentStudio';

export interface PremiumFeatureMeta {
  /** Short feature name shown in lock tooltips and the upgrade prompt title. */
  title: string;
  /** One friendly sentence about what the feature does. */
  blurb: string;
  /** Bullet shown in the "included in Plus" list. */
  perk: string;
}

/**
 * The gated feature set. Remove an entry (or move it behind a cheaper plan
 * later) and every lock for it disappears — call sites only know the key.
 */
export const PREMIUM_FEATURES: Record<PremiumFeatureKey, PremiumFeatureMeta> = {
  pdfExport: {
    title: 'PDF Report Export',
    blurb: 'Download beautifully formatted marking reports to keep, print or share.',
    perk: 'Export marking feedback as polished PDF reports',
  },
  answerUpgrades: {
    title: 'AI Answer Upgrades',
    blurb: 'See your own words rewritten to the next band, so the path up is concrete.',
    perk: 'Unlimited AI band-upgrade rewrites of your answers',
  },
  aiContentStudio: {
    title: 'AI Content Studio',
    blurb: 'Generate exam-style questions, model answers and marking rubrics on demand.',
    perk: 'AI generation of questions, rubrics and sample answers',
  },
};

/**
 * Resolve the caller's plan. PLACEHOLDER POLICY until billing is decided:
 * staff accounts (teachers/admins) get everything so the app stays fully
 * usable for content authors; students and guests see the locked state.
 * Replace the body with a subscription lookup when the model is chosen.
 */
export const getUserPlan = (user?: User | null): Plan => {
  const u = user !== undefined ? user : authService.getCurrentUser();
  if (!u) return 'free';
  return u.role === 'admin' || u.role === 'teacher' ? 'plus' : 'free';
};

/** True when the given feature should render in its locked state. */
export const isFeatureLocked = (feature: PremiumFeatureKey, user?: User | null): boolean => {
  if (!MONETISATION_ENABLED) return false;
  if (!(feature in PREMIUM_FEATURES)) return false;
  return getUserPlan(user) === 'free';
};

/** Event carrying the feature key a locked control was asked for. */
export const UPGRADE_REQUEST_EVENT = 'writing-studio:upgrade-request';

/** Open the friendly upgrade prompt for a feature (from any component). */
export const requestUpgrade = (feature: PremiumFeatureKey): void => {
  window.dispatchEvent(new CustomEvent(UPGRADE_REQUEST_EVENT, { detail: { feature } }));
};
