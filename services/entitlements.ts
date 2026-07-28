import { authService } from './authService';
import {
  featureMinPlan,
  featuresForPlan,
  freeTierLimits,
  planUnlocks,
  type Plan,
  type PremiumFeatureKey,
} from './planPolicy';
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

/**
 * Plans, feature keys and the plan→feature policy itself now live in
 * `./planPolicy.ts`, which is where deployment overrides are applied. They are
 * re-exported here so every existing call site is unchanged, and so there is
 * still one obvious import for "everything about entitlements".
 */
export type { Plan, PremiumFeatureKey } from './planPolicy';
export { featureMinPlan, planUnlocks, PLAN_ORDER, planRank } from './planPolicy';

export const MONETISATION_ENABLED = true;

export const PLAN_LABELS: Record<Plan, string> = {
  free: 'Free',
  plus: 'Band 6 Plus',
  school: 'School',
};

// ---------------------------------------------------------------------------
// Feature keys — the atomic units of gating
// ---------------------------------------------------------------------------

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
    blurb: 'Tackle higher-band questions (Analyse, Evaluate, Discuss) that push you beyond recall.',
    perk: 'Full access to Band 4–6 questions (Analyse → Evaluate)',
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

/**
 * The raw limit numbers are DEFINED in `./planLimits.ts` — a module with no
 * imports — and re-exported here so every existing call site is unchanged.
 * See that file for why the separation matters (a chunk-ordering crash).
 */
export {
  FREE_TIER_MAX_QUESTION_TIER,
  FREE_TIER_EVAL_LIMIT,
  FREE_TIER_MAX_SAMPLE_BAND,
  FREE_TIER_FEEDBACK_SUMMARY_ONLY,
  FREE_DAILY_AI_CALLS,
  PAID_DAILY_AI_CALLS,
} from './planLimits';

// ---------------------------------------------------------------------------
// Plan features — which features each plan unlocks
// ---------------------------------------------------------------------------

// The plan → feature matrix is derived from planPolicy's feature → minimum-plan
// map, so the two directions can never disagree and a deployment override is
// picked up by both.

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

/**
 * The features a plan unlocks, in the display order of PREMIUM_FEATURES.
 * The upgrade prompt lists these rather than every key in PREMIUM_FEATURES —
 * otherwise it advertises school-only perks (the AI Content Studio) to
 * someone buying Plus.
 */
export const planFeatureKeys = (plan: Plan): PremiumFeatureKey[] => featuresForPlan(plan);

/**
 * The cheapest plan that unlocks a feature — what the upgrade prompt should
 * actually be selling. Without this the prompt offers Plus for every lock,
 * including school-only features, which is a dead end for a user who already
 * holds Plus (teachers do, as a staff perk).
 */
export const lowestPlanForFeature = (feature: PremiumFeatureKey): Plan => featureMinPlan(feature);

/** True when the given feature should render in its locked state. */
export const isFeatureLocked = (feature: PremiumFeatureKey, user?: User | null): boolean => {
  if (!MONETISATION_ENABLED) return false;
  if (isAdmin(user)) return false;
  if (!(feature in PREMIUM_FEATURES)) return false;
  return !planUnlocks(getUserPlan(user), feature);
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
  return tier > freeTierLimits().maxQuestionTier;
};

/**
 * True when the free tier should blur/hide a sample answer at this band.
 * Bands 1–3 are free; higher bands are Plus.
 */
export const isSampleAnswerLocked = (band: number, user?: User | null): boolean => {
  if (!MONETISATION_ENABLED) return false;
  if (isAdmin(user)) return false;
  if (getUserPlan(user) !== 'free') return false;
  return band > freeTierLimits().maxSampleBand;
};

/**
 * True when the free tier should show only the summary feedback, not the
 * full criterion-by-criterion breakdown.
 */
export const isFeedbackLocked = (user?: User | null): boolean => {
  if (!MONETISATION_ENABLED) return false;
  if (isAdmin(user)) return false;
  if (getUserPlan(user) !== 'free') return false;
  return freeTierLimits().summaryFeedbackOnly;
};

// ---------------------------------------------------------------------------
// Evaluation count gate (daily)
// ---------------------------------------------------------------------------

// The AUTHORITATIVE counter lives in Postgres: consume_evaluation() (schema
// §14) is spent by the AI proxy on every marking call, so clearing site data
// no longer resets the free tier's daily allowance. What follows is a local
// MIRROR of that count, kept so the UI can say "3 of 5 left" and stop an
// evaluation before the round trip — never as the enforcement point. When the
// server refuses, syncFreeEvalCount() reconciles this copy with the truth.
//
// Keyed PER USER: on a shared computer (school library) two accounts must
// not share — or drain — one 5-eval pool. The legacy un-keyed entries are
// simply ignored; the counter restarts per account, which at worst grants
// one extra free day.
const EVAL_COUNT_KEY = 'ws:free-eval-count';
const EVAL_DATE_KEY = 'ws:free-eval-date';
// The limit the SERVER last reported. `free_evaluation_limit()` is an
// admin-adjustable setting in Postgres (schema §15), so the number shipped in
// this bundle is only a starting guess — once the server has told us what it
// is actually enforcing, that wins for the rest of the day.
const EVAL_LIMIT_KEY = 'ws:free-eval-limit';

const evalKeySuffix = (): string => {
  const username = authService.getCurrentUser()?.username;
  return username ? `:${username}` : '';
};

const todayDateStr = (): string => new Date().toISOString().slice(0, 10);

const readDailyEvalCount = (): number => {
  try {
    const suffix = evalKeySuffix();
    const storedDate = localStorage.getItem(EVAL_DATE_KEY + suffix);
    if (storedDate !== todayDateStr()) return 0;
    return parseInt(localStorage.getItem(EVAL_COUNT_KEY + suffix) ?? '0', 10);
  } catch {
    return 0;
  }
};

/**
 * The daily allowance to display and pre-check against: the server's own
 * figure when it has told us one today, otherwise this deployment's default.
 */
const effectiveEvalLimit = (): number => {
  try {
    const suffix = evalKeySuffix();
    if (localStorage.getItem(EVAL_DATE_KEY + suffix) === todayDateStr()) {
      const stored = parseInt(localStorage.getItem(EVAL_LIMIT_KEY + suffix) ?? '', 10);
      if (Number.isFinite(stored) && stored >= 0) return stored;
    }
  } catch {
    /* localStorage unavailable — fall back to the shipped default */
  }
  return freeTierLimits().evalLimit;
};

/** This deployment's free daily evaluation allowance, as the UI should state it. */
export const freeEvalLimit = (): number => effectiveEvalLimit();

/** Record one evaluation use. Call after a successful evaluation. */
export const recordEvaluation = (): void => {
  try {
    const suffix = evalKeySuffix();
    const today = todayDateStr();
    if (localStorage.getItem(EVAL_DATE_KEY + suffix) !== today) {
      localStorage.setItem(EVAL_DATE_KEY + suffix, today);
      localStorage.setItem(EVAL_COUNT_KEY + suffix, '1');
    } else {
      const count = readDailyEvalCount();
      localStorage.setItem(EVAL_COUNT_KEY + suffix, String(count + 1));
    }
  } catch {
    /* localStorage unavailable — fail open */
  }
};

/**
 * Reconcile the local mirror with the server's authoritative count — called
 * when the proxy refuses an evaluation (402). Without this the UI would keep
 * offering evaluations the server will keep refusing.
 */
export const syncFreeEvalCount = (used: number, limit?: number): void => {
  if (!Number.isFinite(used) || used < 0) return;
  try {
    const suffix = evalKeySuffix();
    localStorage.setItem(EVAL_DATE_KEY + suffix, todayDateStr());
    localStorage.setItem(EVAL_COUNT_KEY + suffix, String(Math.trunc(used)));
    // `limit: -1` means "not metered at all" (staff or a paid plan) and is not
    // a number to display; anything else is the server's live setting.
    if (typeof limit === 'number' && Number.isFinite(limit) && limit >= 0) {
      localStorage.setItem(EVAL_LIMIT_KEY + suffix, String(Math.trunc(limit)));
    }
  } catch {
    /* localStorage unavailable — the server gate still holds */
  }
};

/** True when the free tier's daily evaluation limit has been reached. */
export const isEvalLimitReached = (user?: User | null): boolean => {
  if (!MONETISATION_ENABLED) return false;
  if (isAdmin(user)) return false;
  if (getUserPlan(user) !== 'free') return false;
  return readDailyEvalCount() >= effectiveEvalLimit();
};

/** Remaining free evaluations today. */
export const freeEvalsRemaining = (user?: User | null): number => {
  if (!MONETISATION_ENABLED) return Infinity;
  if (isAdmin(user)) return Infinity;
  if (getUserPlan(user) !== 'free') return Infinity;
  return Math.max(0, effectiveEvalLimit() - readDailyEvalCount());
};

// ---------------------------------------------------------------------------
// Stripe integration helpers
// ---------------------------------------------------------------------------

export const STRIPE_PRICE_IDS = {
  plus_monthly: import.meta.env.VITE_STRIPE_PLUS_MONTHLY_PRICE_ID ?? '',
  plus_yearly: import.meta.env.VITE_STRIPE_PLUS_YEARLY_PRICE_ID ?? '',
  /** Per-seat school licence price. Unset = school sales stay enquiry-only. */
  school: import.meta.env.VITE_STRIPE_SCHOOL_PRICE_ID ?? '',
} as const;

/** Bounds for the school licence seat picker (also clamped server-side). */
export const SCHOOL_SEAT_LIMITS = { min: 5, max: 1000, default: 30 } as const;

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
  /** Per-seat, per-year display string for the school licence. */
  schoolSeat: import.meta.env.VITE_SCHOOL_SEAT_PRICE_DISPLAY ?? 'A$4',
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

// Where Stripe should send the browser back to. Includes the Vite base path
// because on sub-path hosting (e.g. GitHub Pages at /<repo>/) the server can't
// recover it from the Origin header — an origin-only redirect 404s.
const checkoutReturnUrl = (): string =>
  `${window.location.origin}${import.meta.env.BASE_URL ?? '/'}`;

/**
 * Result of a billing request. The server's own message is carried through on
 * failure — "Please sign in", "No billing account found" and "no plans
 * available" are all actionable, and collapsing them into one generic string
 * leaves the user with nothing to act on.
 */
export interface BillingUrlResult {
  url: string | null;
  error: string | null;
}

const postBilling = async (
  path: string,
  body: Record<string, unknown>,
  fallbackError: string
): Promise<BillingUrlResult> => {
  try {
    const res = await fetch(`${apiBase}${path}`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as {
      url?: string;
      error?: string;
      test?: boolean;
    } | null;
    if (!res.ok || !data?.url) {
      return { url: null, error: data?.error || fallbackError };
    }
    return { url: data.url, error: null };
  } catch {
    return { url: null, error: fallbackError };
  }
};

/**
 * Request a Stripe Checkout session from the server. Returns the URL to
 * redirect the user to. In test mode (Stripe unconfigured on server) the
 * endpoint returns a fake URL so the client redirect logic still works.
 */
export const createCheckoutUrl = async (
  priceId: string,
  seats?: number
): Promise<BillingUrlResult> =>
  postBilling(
    '/api/create-checkout',
    {
      priceId,
      returnUrl: checkoutReturnUrl(),
      ...(seats && seats > 1 ? { seats } : {}),
    },
    'Could not start checkout. Please try again.'
  );

/**
 * Billing health for the signed-in user, read from their own subscriptions
 * row (RLS: "Users read own subscriptions"). Returns non-null only when the
 * newest subscription is `past_due` — i.e. a charge failed and Stripe is
 * retrying. The webhook deliberately KEEPS the plan during this grace period
 * (see api/stripe-webhook.ts), so this is the client's only signal to prompt
 * the user to fix their payment method before retries run out.
 */
export interface BillingAlert {
  status: 'past_due';
  plan: string;
  currentPeriodEnd: string | null;
}

/**
 * The signed-in user's newest subscription row, as the client is allowed to
 * see it. `cancelAtPeriodEnd` is what stops the profile claiming a cancelled
 * subscription "renews" on the very date it actually ends.
 */
export interface BillingState {
  status: string;
  plan: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export const fetchBillingState = async (): Promise<BillingState | null> => {
  try {
    const { supabase } = await import('./supabaseClient');
    if (!supabase) return null;
    // Scope to the signed-in user explicitly. RLS already limits ordinary
    // users to their own row, but admins can read ALL subscriptions — without
    // this filter an admin sees a stranger's failed payment as their own.
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return null;
    const { data, error } = await supabase
      .from('subscriptions')
      .select('status, plan, current_period_end, cancel_at_period_end')
      .eq('user_id', userId)
      .order('current_period_end', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return {
      status: typeof data.status === 'string' ? data.status : 'unknown',
      plan: typeof data.plan === 'string' ? data.plan : 'plus',
      currentPeriodEnd: data.current_period_end ?? null,
      cancelAtPeriodEnd: data.cancel_at_period_end === true,
    };
  } catch {
    return null;
  }
};

export const fetchBillingAlert = async (): Promise<BillingAlert | null> => {
  const state = await fetchBillingState();
  if (!state || state.status !== 'past_due') return null;
  return {
    status: 'past_due',
    plan: state.plan,
    currentPeriodEnd: state.currentPeriodEnd,
  };
};

/**
 * Open the Stripe Billing Portal so the user can manage their subscription.
 * Returns the portal URL or null on failure.
 */
export const createPortalUrl = async (): Promise<BillingUrlResult> =>
  postBilling(
    '/api/customer-portal',
    { returnUrl: checkoutReturnUrl() },
    'Could not open the billing portal. Please try again shortly.'
  );

/** Event carrying the feature key a locked control was asked for. */
export const UPGRADE_REQUEST_EVENT = 'writing-studio:upgrade-request';

/** Open the friendly upgrade prompt for a feature (from any component). */
export const requestUpgrade = (feature: PremiumFeatureKey): void => {
  window.dispatchEvent(new CustomEvent(UPGRADE_REQUEST_EVENT, { detail: { feature } }));
};
