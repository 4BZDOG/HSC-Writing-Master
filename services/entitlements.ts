import { authService } from './authService';
import type { User } from '../types';
import type { UserRole } from '../types';

const resolveUser = (user?: User | null): User | null =>
  user !== undefined ? user : authService.getCurrentUser();

const isAdmin = (user?: User | null): boolean => {
  const u = resolveUser(user);
  return u?.role === ('admin' as UserRole);
};

/**
 * Monetisation / entitlements — single source of truth.
 *
 * Three plans: free → plus → school. The free tier is generous enough to
 * hook students; Plus unlocks the full individual toolkit; School is an
 * institutional plan where an admin buys a pool of seats.
 *
 * Every gate in the UI reads from this file. A gated control stays VISIBLE
 * but renders in its locked style (amber + lock chip) and calls
 * `requestUpgrade()` instead of its real action; the UpgradeModal listens
 * for that event.
 *
 * Stripe integration points:
 *   - `getUserPlan()` resolves the plan from the Supabase profile's
 *     `stripe_plan` column (set by the Stripe webhook handler).
 *   - `api/stripe-webhook.ts` handles checkout.session.completed,
 *     customer.subscription.updated/deleted and patches the profile.
 *   - The checkout URL is built by `api/create-checkout.ts` which creates
 *     a Stripe Checkout Session server-side.
 *
 * Content-access tiers (soft gates):
 *   The free tier can browse all courses and topics, but deeper content
 *   (higher-tier questions, full marking feedback, sample answers) is
 *   progressively gated. This keeps the product discoverable — students
 *   see what they're missing — while reserving the full experience for
 *   paying users.
 */

export type Plan = 'free' | 'plus' | 'school';

export const MONETISATION_ENABLED = true;

export const PLAN_LABELS: Record<Plan, string> = {
  free: 'Free',
  plus: 'Band 6 Plus',
  school: 'School',
};

// ---------------------------------------------------------------------------
// Feature keys — the atomic units of gating
// ---------------------------------------------------------------------------

export type PremiumFeatureKey =
  | 'pdfExport'
  | 'answerUpgrades'
  | 'aiContentStudio'
  | 'advancedQuestions'
  | 'fullFeedback'
  | 'sampleAnswers'
  | 'examMode';

export interface PremiumFeatureMeta {
  title: string;
  blurb: string;
  perk: string;
}

/**
 * The gated feature set. Remove an entry and every lock for it disappears —
 * call sites only know the key.
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
  advancedQuestions: {
    title: 'Advanced Questions',
    blurb: 'Tackle higher-tier questions (Analyse, Evaluate, Discuss) that push you beyond recall.',
    perk: 'Full access to Tier 4–6 questions (Analyse → Evaluate)',
  },
  fullFeedback: {
    title: 'Full Marking Feedback',
    blurb: 'Get criterion-by-criterion breakdowns, marker notes and improvement paths.',
    perk: 'Detailed criterion feedback, common errors and marker notes',
  },
  sampleAnswers: {
    title: 'Sample Answers',
    blurb: 'Study model answers at every band level to see what markers really want.',
    perk: 'View sample answers and exemplars across all bands',
  },
  examMode: {
    title: 'Exam Simulation',
    blurb: 'Practise under real HSC conditions — timed, unassisted, with post-exam feedback.',
    perk: 'Timed HSC exam simulation mode with post-exam analysis',
  },
};

// ---------------------------------------------------------------------------
// Free-tier content limits — what free users can access without paying
// ---------------------------------------------------------------------------

/** Free users can attempt questions up to this command-term tier (inclusive). */
export const FREE_TIER_MAX_QUESTION_TIER = 3;

/** Free users see this many evaluations before being asked to upgrade. */
export const FREE_TIER_EVAL_LIMIT = 5;

/** Free users can view sample answers up to this band (inclusive). */
export const FREE_TIER_MAX_SAMPLE_BAND = 3;

/**
 * Free users see a summary verdict + overall band but NOT the full
 * criterion-by-criterion breakdown, marker notes or improvement paths.
 */
export const FREE_TIER_FEEDBACK_SUMMARY_ONLY = true;

// ---------------------------------------------------------------------------
// Plan features — which features each plan unlocks
// ---------------------------------------------------------------------------

const PLAN_FEATURES: Record<Plan, Set<PremiumFeatureKey>> = {
  free: new Set(),
  plus: new Set([
    'pdfExport',
    'answerUpgrades',
    'advancedQuestions',
    'fullFeedback',
    'sampleAnswers',
    'examMode',
  ]),
  school: new Set([
    'pdfExport',
    'answerUpgrades',
    'aiContentStudio',
    'advancedQuestions',
    'fullFeedback',
    'sampleAnswers',
    'examMode',
  ]),
};

// ---------------------------------------------------------------------------
// Plan resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the caller's plan.
 *
 * Priority:
 *   1. If the user's Supabase profile has a `stripe_plan` field (set by the
 *      Stripe webhook), that wins.
 *   2. If the user belongs to a school with an active institutional
 *      subscription, they inherit the `school` plan.
 *   3. Admins and teachers get `plus` as a staff perk (so the app is fully
 *      usable for content authors even before Stripe is live).
 *   4. Everyone else is `free`.
 *
 * When Stripe is integrated: replace the role-based fallback (step 3) with
 * a real subscription check. The profile column is the source of truth.
 */
export const getUserPlan = (user?: User | null): Plan => {
  const u = user !== undefined ? user : authService.getCurrentUser();
  if (!u) return 'free';

  // Admins get the most permissive plan so every feature is unlocked.
  if (u.role === 'admin') return 'school';

  // Step 1: explicit plan on the profile (set by Stripe webhook or admin)
  const explicit = (u as User & { stripePlan?: Plan }).stripePlan;
  if (explicit && explicit in PLAN_LABELS) return explicit;

  // Step 2: school institutional subscription (future — school.plan column)
  // For now, schools use the quota system; the plan stays role-derived.

  // Step 3: staff perk — teachers get Plus so content authoring works
  if (u.role === 'teacher') return 'plus';

  // Step 4: everyone else
  return 'free';
};

/** True when the given feature should render in its locked state. */
export const isFeatureLocked = (feature: PremiumFeatureKey, user?: User | null): boolean => {
  if (!MONETISATION_ENABLED) return false;
  if (isAdmin(user)) return false;
  if (!(feature in PREMIUM_FEATURES)) return false;
  const plan = getUserPlan(user);
  return !PLAN_FEATURES[plan].has(feature);
};

// ---------------------------------------------------------------------------
// Content-access helpers (soft gates for the free tier)
// ---------------------------------------------------------------------------

/**
 * True when the free tier should block a question of this command-term tier.
 * Tiers 1–3 (Identify → Apply) are free; 4–6 (Analyse → Evaluate) are Plus.
 */
export const isQuestionTierLocked = (tier: number, user?: User | null): boolean => {
  if (!MONETISATION_ENABLED) return false;
  if (isAdmin(user)) return false;
  if (getUserPlan(user) !== 'free') return false;
  return tier > FREE_TIER_MAX_QUESTION_TIER;
};

/**
 * True when the free tier should blur/hide a sample answer at this band.
 * Bands 1–3 are free; higher bands are Plus.
 */
export const isSampleAnswerLocked = (band: number, user?: User | null): boolean => {
  if (!MONETISATION_ENABLED) return false;
  if (isAdmin(user)) return false;
  if (getUserPlan(user) !== 'free') return false;
  return band > FREE_TIER_MAX_SAMPLE_BAND;
};

/**
 * True when the free tier should show only the summary feedback, not the
 * full criterion-by-criterion breakdown.
 */
export const isFeedbackLocked = (user?: User | null): boolean => {
  if (!MONETISATION_ENABLED) return false;
  if (isAdmin(user)) return false;
  if (getUserPlan(user) !== 'free') return false;
  return FREE_TIER_FEEDBACK_SUMMARY_ONLY;
};

// ---------------------------------------------------------------------------
// Evaluation count gate (daily, localStorage-backed)
// ---------------------------------------------------------------------------

const EVAL_COUNT_KEY = 'ws:free-eval-count';
const EVAL_DATE_KEY = 'ws:free-eval-date';

const todayDateStr = (): string => new Date().toISOString().slice(0, 10);

const readDailyEvalCount = (): number => {
  try {
    const storedDate = localStorage.getItem(EVAL_DATE_KEY);
    if (storedDate !== todayDateStr()) return 0;
    return parseInt(localStorage.getItem(EVAL_COUNT_KEY) ?? '0', 10);
  } catch {
    return 0;
  }
};

/** Record one evaluation use. Call after a successful evaluation. */
export const recordEvaluation = (): void => {
  try {
    const today = todayDateStr();
    if (localStorage.getItem(EVAL_DATE_KEY) !== today) {
      localStorage.setItem(EVAL_DATE_KEY, today);
      localStorage.setItem(EVAL_COUNT_KEY, '1');
    } else {
      const count = readDailyEvalCount();
      localStorage.setItem(EVAL_COUNT_KEY, String(count + 1));
    }
  } catch {
    /* localStorage unavailable — fail open */
  }
};

/** True when the free tier's daily evaluation limit has been reached. */
export const isEvalLimitReached = (user?: User | null): boolean => {
  if (!MONETISATION_ENABLED) return false;
  if (isAdmin(user)) return false;
  if (getUserPlan(user) !== 'free') return false;
  return readDailyEvalCount() >= FREE_TIER_EVAL_LIMIT;
};

/** Remaining free evaluations today. */
export const freeEvalsRemaining = (user?: User | null): number => {
  if (!MONETISATION_ENABLED) return Infinity;
  if (isAdmin(user)) return Infinity;
  if (getUserPlan(user) !== 'free') return Infinity;
  return Math.max(0, FREE_TIER_EVAL_LIMIT - readDailyEvalCount());
};

// ---------------------------------------------------------------------------
// Stripe integration helpers
// ---------------------------------------------------------------------------

export const STRIPE_PRICE_IDS = {
  plus_monthly: import.meta.env.VITE_STRIPE_PLUS_MONTHLY_PRICE_ID ?? '',
  plus_yearly: import.meta.env.VITE_STRIPE_PLUS_YEARLY_PRICE_ID ?? '',
} as const;

/**
 * Display prices for the upgrade prompt. These are PRESENTATION strings only —
 * the amount actually charged always comes from the Stripe Price object — so
 * they MUST be kept in sync with the configured price IDs above. Overridable
 * per deployment via env so a price change doesn't need a code release.
 */
export const PLAN_PRICING = {
  monthly: import.meta.env.VITE_PLUS_MONTHLY_PRICE_DISPLAY ?? 'A$7.99',
  yearly: import.meta.env.VITE_PLUS_YEARLY_PRICE_DISPLAY ?? 'A$59',
  yearlyNote: import.meta.env.VITE_PLUS_YEARLY_NOTE ?? 'Save 38% — under A$5/month',
} as const;

/** Contact for school/faculty licensing enquiries (shown in the upgrade prompt). */
export const SCHOOL_CONTACT_EMAIL: string = import.meta.env.VITE_SCHOOL_CONTACT_EMAIL ?? '';

const getAuthHeaders = async (): Promise<Record<string, string>> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const { supabase } = await import('./supabaseClient');
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    /* Supabase not configured — send unauthenticated */
  }
  return headers;
};

const apiBase = import.meta.env.VITE_API_BASE_URL ?? '';

/**
 * Request a Stripe Checkout session from the server. Returns the URL to
 * redirect the user to. In test mode (Stripe unconfigured on server) the
 * endpoint returns a fake URL so the client redirect logic still works.
 */
export const createCheckoutUrl = async (priceId: string): Promise<string | null> => {
  try {
    const res = await fetch(`${apiBase}/api/create-checkout`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ priceId }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { url?: string; test?: boolean };
    return data.url ?? null;
  } catch {
    return null;
  }
};

/**
 * Open the Stripe Billing Portal so the user can manage their subscription.
 * Returns the portal URL or null on failure.
 */
export const createPortalUrl = async (): Promise<string | null> => {
  try {
    const res = await fetch(`${apiBase}/api/customer-portal`, {
      method: 'POST',
      headers: await getAuthHeaders(),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { url?: string; test?: boolean };
    return data.url ?? null;
  } catch {
    return null;
  }
};

/** Event carrying the feature key a locked control was asked for. */
export const UPGRADE_REQUEST_EVENT = 'writing-studio:upgrade-request';

/** Open the friendly upgrade prompt for a feature (from any component). */
export const requestUpgrade = (feature: PremiumFeatureKey): void => {
  window.dispatchEvent(new CustomEvent(UPGRADE_REQUEST_EVENT, { detail: { feature } }));
};
