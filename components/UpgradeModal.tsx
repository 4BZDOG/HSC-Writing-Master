import React, { useState, useEffect, useCallback } from 'react';
import type { ToastType } from '../hooks/useToast';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Crown, Lock, Check, Sparkles, X, Zap, TrendingUp } from 'lucide-react';
import { User } from '../types';
import {
  PREMIUM_FEATURES,
  PLAN_LABELS,
  UPGRADE_REQUEST_EVENT,
  PremiumFeatureKey,
  ALREADY_SUBSCRIBED_STATUS,
  BILLING_CODE,
  describeAccess,
  createCheckoutUrl,
  createPortalUrl,
  planFeatureKeys,
  lowestPlanForFeature,
  planLabelForFeature,
  STRIPE_PRICE_IDS,
  PLAN_PRICING,
  FREE_DAILY_AI_CALLS,
  PAID_DAILY_AI_CALLS,
  monetisationEnabled,
  freeEvalLimit,
  type UpgradeReason,
} from '../services/entitlements';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import SchoolLicencePanel from './SchoolLicencePanel';
import { dailyResetPhrase } from '../utils/dailyReset';
import { billingErrorMessage } from '../utils/billingMessages';

/**
 * The plan a lock should NAME, as one or two words fit for a chip.
 *
 * A chip that says "Plus" beside a control the School plan unlocks sends the
 * user to a prompt selling something else, and a teacher who already holds Plus
 * reads it as "you have this" while the control refuses them. The feature key
 * is the only thing a call site knows, so the label is derived from it — and
 * follows a deployment's PLAN_FEATURE_OVERRIDES without any call site changing.
 */
const lockLabelFor = (feature?: PremiumFeatureKey): string =>
  feature && lowestPlanForFeature(feature) === 'school' ? 'School' : 'Plus';

/**
 * Small amber lock chip for a gated-but-visible control. Uses the SHORT plan
 * label ("Plus", "School") because a chip sits inline beside a control's own
 * label and has no room for the full name; everything with room — the overlay
 * button below, the tooltips, the prompt — says "Band 6 Plus" in full. Sits inline next to
 * the control's label so the feature is discoverable before it's paid for.
 *
 * Its fill is OPAQUE, and that is the part that is easy to lose. The chip used
 * to be an amber wash over whatever it sat on, and it sits on the band-coloured
 * card headers as often as on paper: amber ink over the red Band 1 header
 * measured 1.46:1 in light and 2.17:1 in dark. A translucent tint takes the
 * ground's colour with it, so the chip now carries its own pale ground in both
 * themes and its ink is set against that, not against the card.
 *
 * Pass the `feature` it guards so the chip names the plan that actually unlocks
 * it. Without one it falls back to "Plus", which is right for every feature
 * this deployment prices at Plus and is the historical behaviour.
 */
export const PlusLockChip: React.FC<{ className?: string; feature?: PremiumFeatureKey }> = ({
  className = '',
  feature,
}) => (
  <span
    className={`t-label inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-amber-100 border border-amber-500/50 text-amber-800 dark:bg-amber-950 dark:border-amber-400/40 dark:text-amber-200 ${className}`}
  >
    <Lock className="w-2.5 h-2.5" /> {lockLabelFor(feature)}
  </span>
);

/**
 * Blurred content overlay — shown over locked content (sample answers,
 * detailed feedback) to let free users see the shape of what they're
 * missing without reading the detail.
 */
export const ContentLockOverlay: React.FC<{
  feature: PremiumFeatureKey;
  /**
   * Corner radius to match the container being covered. The overlay is
   * `inset-0`, so a radius smaller than its container's leaves the opaque
   * backdrop poking out past the container's rounded corners.
   */
  className?: string;
}> = ({ feature, className = 'rounded-2xl' }) => {
  const meta = PREMIUM_FEATURES[feature];
  // The sentence and the button both come from the one answer for this viewer,
  // so a student is offered an upgrade and a teacher is pointed at the school.
  const access = describeAccess(feature);
  return (
    <div
      className={`absolute inset-0 z-10 flex flex-col items-center justify-center bg-[rgb(var(--color-bg-surface))]/80 light:bg-white/80 backdrop-blur-sm ${className}`}
    >
      <div className="flex flex-col items-center gap-3 text-center px-6 max-w-xs">
        <div className="w-10 h-10 rounded-2xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center">
          <Lock className="w-5 h-5 text-amber-500 light:text-amber-700" />
        </div>
        <p className="text-xs font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-900">
          {meta?.title || 'Plus Feature'}
        </p>
        <p className="text-xs leading-relaxed text-[rgb(var(--color-text-secondary))]">
          {access.explanation}
        </p>
        {access.cta !== 'none' && (
          <button
            onClick={() =>
              window.dispatchEvent(new CustomEvent(UPGRADE_REQUEST_EVENT, { detail: { feature } }))
            }
            className="t-label min-h-11 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-slate-900 shadow-lg hover:scale-105 active:scale-[0.98] transition-all"
          >
            {access.ctaLabel}
          </button>
        )}
      </div>
    </div>
  );
};

interface UpgradeModalProps {
  showToast: (message: string, type: ToastType) => void;
  /** Current user — used to personalise the prompt with their band average. */
  user?: User | null;
}

/**
 * The friendly "this is a Plus feature" prompt. Mounted once (in App); any
 * component opens it by calling requestUpgrade(featureKey) — no prop drilling.
 *
 * When Stripe is configured (price IDs set), the CTA opens a real checkout.
 * Until then, it registers interest via a toast.
 */
const UpgradeModal: React.FC<UpgradeModalProps> = ({ showToast, user }) => {
  const [feature, setFeature] = useState<PremiumFeatureKey | null>(null);
  /** Why the prompt opened, when it was not a locked control being pressed. */
  const [reason, setReason] = useState<UpgradeReason | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('yearly');
  const [isRedirecting, setIsRedirecting] = useState(false);
  /**
   * Set when checkout refuses because this account already holds a live
   * subscription (409, api/create-checkout). The refusal tells the user to use
   * "Manage subscription" — which lives in the profile, two screens away from
   * the prompt they are standing in. Rather than name a control and leave them
   * to find it, the CTA becomes that control.
   */
  const [alreadySubscribed, setAlreadySubscribed] = useState(false);
  /**
   * Set when checkout refuses because the school already holds a licence bought
   * by someone else (409 with `school_licence_held`). The server's sentence says
   * whom to ask. There is no purchase to make here, and no portal to open: the
   * portal belongs to whoever bought the licence and would 404 for this caller.
   */
  const [licenceHeld, setLicenceHeld] = useState<string | null>(null);

  // A deployment may legitimately sell one billing period only — a school
  // pilot on annual invoicing, or a monthly launch with the annual price still
  // being decided. The server sells whichever price IDs it was given, so
  // requiring BOTH here turned that into no checkout at all: the CTA fell back
  // to "Keep me posted" while a perfectly valid price sat configured.
  const monthlyPrice = STRIPE_PRICE_IDS.plus_monthly;
  const yearlyPrice = STRIPE_PRICE_IDS.plus_yearly;
  const stripeReady = !!(monthlyPrice || yearlyPrice);
  /** Only offer the toggle when there is genuinely a choice to make. */
  const canChoosePeriod = !!(monthlyPrice && yearlyPrice);
  /** What the user is actually buying: their choice, or the only one on sale. */
  const effectivePeriod: 'monthly' | 'yearly' = canChoosePeriod
    ? billingPeriod
    : yearlyPrice
      ? 'yearly'
      : 'monthly';
  const plusPriceId = effectivePeriod === 'yearly' ? yearlyPrice : monthlyPrice;
  const plusPriceDisplay =
    effectivePeriod === 'yearly' ? PLAN_PRICING.yearly : PLAN_PRICING.monthly;
  /**
   * A guest has no account for a subscription to attach to, so checkout cannot
   * work: /api/create-checkout answers 401 "Authentication required." — a
   * correct sentence and a useless one at the moment someone is trying to pay.
   * Tell them the actual next step instead of letting them press a button that
   * can only fail.
   */
  const isGuest = user?.role === 'guest';

  // Personalised hook: the most convincing thing we can show a student is
  // their own trajectory. Only shown once they have enough marked answers for
  // the average to mean something, and only while there's a gap to close.
  const avgBand = user?.stats?.averageBand ?? 0;
  const showBandHook = (user?.stats?.questionsAnswered ?? 0) >= 3 && avgBand > 0 && avgBand < 5.5;

  useEffect(() => {
    const onRequest = (e: Event) => {
      // A deployment that sells nothing must not open a sales prompt. Locked
      // controls already stop calling requestUpgrade when monetisation is off
      // (isFeatureLocked short-circuits), but the plan comparison and the
      // profile card call it unconditionally for anyone on the free plan — so
      // a pilot user could still be offered an upgrade to features they were
      // already using. Every route in goes through this event, so one guard
      // here covers all of them, including any added later.
      if (!monetisationEnabled()) return;
      const detail = (e as CustomEvent).detail as
        | { feature?: PremiumFeatureKey; reason?: UpgradeReason }
        | undefined;
      const key = detail?.feature;
      if (key && key in PREMIUM_FEATURES) {
        // Nobody is sold what they already hold. A teacher who presses a Plus
        // control (their staff perk covers it) gets no prompt to read.
        if (describeAccess(key, user).state === 'open') return;
        setFeature(key);
        setReason(detail?.reason ?? null);
      }
    };
    window.addEventListener(UPGRADE_REQUEST_EVENT, onRequest);
    return () => window.removeEventListener(UPGRADE_REQUEST_EVENT, onRequest);
  }, [user]);

  const close = useCallback(() => {
    setFeature(null);
    setReason(null);
    setIsRedirecting(false);
    setAlreadySubscribed(false);
    setLicenceHeld(null);
  }, []);
  useEscapeKey(!!feature, close);
  // Tab stays inside the dialog while it is open, and focus returns to
  // whatever opened it on close. Partners `useEscapeKey` — same stack,
  // same topmost-only arbitration.
  const dialogRef = useFocusTrap<HTMLDivElement>(!!feature);
  useScrollLock(!!feature);

  const handleUpgrade = async () => {
    if (isGuest) {
      showToast('Create a free account first. A subscription is attached to an account.', 'info');
      close();
      return;
    }
    // Unreachable from the button (which is not drawn without a price), kept so
    // a stale open prompt cannot start a checkout that has nothing to buy.
    if (!stripeReady) {
      showToast(`${PLAN_LABELS.plus} is not on sale yet, so there is nothing to buy.`, 'info');
      close();
      return;
    }
    setIsRedirecting(true);
    const { url, error, status, code } = await createCheckoutUrl(plusPriceId);
    if (url) {
      window.location.href = url;
      return;
    }
    // A 409 with a code is a different refusal. The licence belongs to someone
    // else at the school, so the answer is their sentence, not the portal.
    if (status === ALREADY_SUBSCRIBED_STATUS && code === BILLING_CODE.schoolLicenceHeld) {
      setLicenceHeld(billingErrorMessage('checkout', { error, status, code }));
      setIsRedirecting(false);
      return;
    }
    // Already subscribed: not an error the user can act on by trying again.
    // Swap the CTA to the billing portal, which is where plan and seat changes
    // actually happen, and say so in the prompt rather than only in a toast.
    if (status === ALREADY_SUBSCRIBED_STATUS && !code) {
      setAlreadySubscribed(true);
      setIsRedirecting(false);
      return;
    }
    showToast(billingErrorMessage('checkout', { error, status, code }), 'error');
    setIsRedirecting(false);
  };

  const handleManageSubscription = async () => {
    setIsRedirecting(true);
    const { url, error, status } = await createPortalUrl();
    if (url) {
      window.location.href = url;
      return;
    }
    showToast(billingErrorMessage('portal', { error, status }), 'error');
    setIsRedirecting(false);
  };

  if (!feature) return null;
  const meta = PREMIUM_FEATURES[feature];
  // What this viewer is told, and what they are offered, comes from one place.
  // A student is sold Plus; a teacher with no licence is pointed at the school
  // (or at an admin); a role lock offers nothing, because paying would not help.
  const access = describeAccess(feature, user);
  const requiredPlan = access.planNeeded ?? lowestPlanForFeature(feature);
  // Checkout is for a student or guest buying Plus, and only when a price is on sale.
  const offersCheckout = access.cta === 'upgrade' && stripeReady;
  const perkKeys = planFeatureKeys(requiredPlan);

  /**
   * Lead with what actually just happened.
   *
   * Running out of the daily allowance is the moment a student is most likely
   * to pay, and it was being answered with the wrong sentence: marking is
   * metered by count rather than gated by plan, so there is no feature key for
   * it and the limit borrowed `fullFeedback`. The student saw "Full Marking
   * Feedback — get criterion-by-criterion breakdowns" seconds after being told
   * they had used their five markings. True of Plus, but not an answer to the
   * question they were asking, and the perk list below still sells everything
   * else either way.
   */
  const atDailyLimit = reason === 'dailyLimit';
  const headline = atDailyLimit ? "You've used today's free markings" : meta.title;
  const eyebrow = access.planLabel ?? PLAN_LABELS[requiredPlan];
  /**
   * What the buyer agrees to, in the order they will wonder about it: the
   * amount, that it repeats, and how to stop. "Cancel anytime, no lock-in"
   * answered none of those, and a payment prompt has to answer all three.
   */
  const chargeLine = `Charged ${plusPriceDisplay} ${effectivePeriod === 'yearly' ? 'a year' : 'a month'} and renews automatically. Cancel from your profile at any time, and your access runs to the end of the period you have paid for.`;
  const blurb = atDailyLimit
    ? // The reset is stated in the reader's own clock. "Midnight" was read as
      // THEIR midnight; the boundary is a UTC day, which is mid-morning here.
      `The free plan includes ${freeEvalLimit()} marked answers a day, and your next one is at ${dailyResetPhrase()}. ` +
      `${PLAN_LABELS.plus} removes the daily limit on marked answers.`
    : meta.blurb;

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-upgrade bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-modal-title"
    >
      <div className="clip-stable w-full max-w-md rounded-surface bg-[rgb(var(--color-bg-surface))] border-2 border-amber-400/40 shadow-[0_32px_96px_-16px_rgba(0,0,0,0.7)] overflow-hidden animate-fade-in-up flex flex-col max-h-[90vh]">
        {/* Golden header */}
        <div className="relative px-6 py-6 bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 text-slate-900 overflow-hidden shrink-0">
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/20 blur-3xl rounded-full pointer-events-none" />
          <button
            onClick={close}
            aria-label="Close"
            /* z-20, above the header's own content wrapper.
               That wrapper is `relative z-10` and this button had no z-index at
               all, so the crown-and-headline block covered it outright — at
               EVERY width, not just on a phone. The close button on the
               highest-intent surface in the product did nothing; the only ways
               out were "Maybe later", Escape or the backdrop. */
            className="absolute top-3 right-3 w-11 h-11 flex items-center justify-center rounded-xl bg-black/10 hover:bg-black/20 text-slate-900 transition-colors z-20"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-4 relative z-10">
            <div className="w-14 h-14 shrink-0 rounded-2xl bg-white/25 backdrop-blur border border-white/40 flex items-center justify-center shadow-lg">
              <Crown className="w-7 h-7" />
            </div>
            <div className="min-w-0">
              <span className="t-label text-slate-900/80 block">{eyebrow}</span>
              <h2
                id="upgrade-modal-title"
                className="text-xl font-black tracking-tight leading-tight"
              >
                {headline}
              </h2>
            </div>
          </div>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar">
          <p className="text-sm text-[rgb(var(--color-text-secondary))] light:text-slate-600 leading-relaxed mb-5">
            {blurb}{' '}
            {atDailyLimit
              ? // "Unlock this" is wrong here: nothing is locked, they have
                // simply spent today's allowance and it returns tomorrow.
                stripeReady
                ? `Everything below is included.`
                : `${PLAN_LABELS.plus} is not on sale yet, so there is nothing to buy.`
              : access.cta === 'upgrade' && !stripeReady
                ? `${access.explanation} ${PLAN_LABELS.plus} is not on sale yet.`
                : access.explanation}
          </p>

          {showBandHook && (
            <div className="rounded-2xl bg-indigo-500/10 light:bg-indigo-100/60 border border-indigo-500/20 light:border-indigo-300 p-4 mb-5 flex items-start gap-3">
              <TrendingUp className="w-4 h-4 text-indigo-400 light:text-indigo-600 mt-0.5 shrink-0" />
              <p className="text-xs leading-relaxed text-[rgb(var(--color-text-secondary))] light:text-slate-600">
                You're averaging{' '}
                <span className="font-bold text-indigo-400 light:text-indigo-600">
                  Band {avgBand.toFixed(1)}
                </span>{' '}
                across {user!.stats.questionsAnswered} marked answers. Full criterion feedback,
                answer upgrades and exemplars are the tools for closing the gap to Band 6.
              </p>
            </div>
          )}

          <div className="rounded-2xl bg-amber-400/5 light:bg-amber-100/60 border border-amber-400/20 light:border-amber-300 p-4 mb-6">
            <span className="t-label text-amber-500 light:text-amber-700 flex items-center gap-2 mb-3">
              <Sparkles className="w-3.5 h-3.5" /> Included in {PLAN_LABELS[requiredPlan]}
            </span>
            <ul className="space-y-2">
              {perkKeys.map((key) => (
                <li
                  key={key}
                  className={`flex items-start gap-2.5 text-xs leading-relaxed ${key === feature ? 'text-[rgb(var(--color-text-primary))] light:text-slate-900 font-bold' : 'text-[rgb(var(--color-text-muted))] font-medium'}`}
                >
                  <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500 light:text-amber-700" />
                  {PREMIUM_FEATURES[key].perk}
                </li>
              ))}
              {/* Not a feature gate — the plan-aware server quota (schema §11):
                  paid plans are guaranteed a 300-call daily AI allowance. */}
              <li className="flex items-start gap-2.5 text-xs leading-relaxed text-[rgb(var(--color-text-muted))] font-medium">
                <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500 light:text-amber-700" />
                A {PAID_DAILY_AI_CALLS}-call daily AI allowance —{' '}
                {Math.round(PAID_DAILY_AI_CALLS / FREE_DAILY_AI_CALLS)} times the free tier
              </li>
            </ul>
          </div>

          {/* Billing period toggle with real prices — a paywall that hides the
              price converts far worse than one that states it plainly. Only
              drawn when both periods are on sale; with one, a two-button
              toggle would offer a choice that does not exist. */}
          {canChoosePeriod && offersCheckout && (
            <div className="mb-5">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setBillingPeriod('monthly')}
                  aria-pressed={billingPeriod === 'monthly'}
                  className={`px-4 py-3 rounded-xl text-left transition-all border ${
                    billingPeriod === 'monthly'
                      ? 'bg-amber-400/20 border-amber-400/40'
                      : 'border-white/5 light:border-slate-300 hover:border-amber-400/20'
                  }`}
                >
                  <span className="t-label block text-[rgb(var(--color-text-muted))]">Monthly</span>
                  <span className="block text-2xl font-black tracking-tight text-[rgb(var(--color-text-primary))] light:text-slate-900 mt-0.5">
                    {PLAN_PRICING.monthly}
                    <span className="text-xs font-bold text-[rgb(var(--color-text-muted))]">
                      {' '}
                      /month
                    </span>
                  </span>
                </button>
                <button
                  onClick={() => setBillingPeriod('yearly')}
                  aria-pressed={billingPeriod === 'yearly'}
                  className={`px-4 py-3 rounded-xl text-left transition-all border relative ${
                    billingPeriod === 'yearly'
                      ? 'bg-amber-400/20 border-amber-400/40'
                      : 'border-white/5 light:border-slate-300 hover:border-amber-400/20'
                  }`}
                >
                  <span className="t-label text-[rgb(var(--color-text-muted))] flex items-center gap-1">
                    Yearly <Zap className="w-3 h-3 text-amber-500 light:text-amber-700" />
                  </span>
                  <span className="block text-2xl font-black tracking-tight text-[rgb(var(--color-text-primary))] light:text-slate-900 mt-0.5">
                    {PLAN_PRICING.yearly}
                    <span className="text-xs font-bold text-[rgb(var(--color-text-muted))]">
                      {' '}
                      /year
                    </span>
                  </span>
                </button>
              </div>
              {billingPeriod === 'yearly' && (
                <p className="mt-2 text-center text-xs text-emerald-500 light:text-emerald-700">
                  {PLAN_PRICING.yearlyNote}
                  <span className="block mt-0.5 font-medium text-[rgb(var(--color-text-muted))]">
                    A year of marking for less than one hour of tutoring.
                  </span>
                </p>
              )}
            </div>
          )}

          {/* One period on sale: still state the price. The rule above holds
              either way — the reason not to draw the toggle is that there is
              nothing to toggle, not that the price should be hidden. */}
          {offersCheckout && !canChoosePeriod && (
            <div className="mb-5 px-4 py-3 rounded-xl bg-amber-400/20 border border-amber-400/40">
              <span className="t-label block text-[rgb(var(--color-text-muted))]">
                {effectivePeriod === 'yearly' ? 'Yearly' : 'Monthly'}
              </span>
              <span className="block text-2xl font-black tracking-tight text-[rgb(var(--color-text-primary))] light:text-slate-900 mt-0.5">
                {plusPriceDisplay}
                <span className="text-xs font-bold text-[rgb(var(--color-text-muted))]">
                  {effectivePeriod === 'yearly' ? ' /year' : ' /month'}
                </span>
              </span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            {/* Only drawn when there is a price to sell. With none configured
                this button used to read "Keep me posted" and did nothing but
                show a toast, so a student could press it and believe they had
                asked to be told when Plus launches. Nothing records that. The
                line above already says plans are not on sale yet. */}
            {offersCheckout && !licenceHeld && (
              <button
                onClick={alreadySubscribed ? handleManageSubscription : handleUpgrade}
                disabled={isRedirecting}
                className="min-h-11 flex-1 px-5 py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 text-sm font-bold text-slate-900 shadow-lg shadow-amber-900/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <Crown className="w-4 h-4" />{' '}
                {isRedirecting
                  ? 'Redirecting…'
                  : alreadySubscribed
                    ? 'Manage subscription'
                    : isGuest
                      ? 'Create an account'
                      : access.ctaLabel}
              </button>
            )}
            <button
              onClick={close}
              className={`t-label min-h-11 ${offersCheckout && !licenceHeld ? '' : 'flex-1 '}px-5 py-3 rounded-2xl bg-[rgb(var(--color-bg-surface-inset))] text-[rgb(var(--color-text-secondary))] border border-white/5 light:border-slate-300 hover:bg-white/10 light:hover:bg-surface-light transition-all`}
            >
              Maybe later
            </button>
          </div>

          {licenceHeld ? (
            <p
              role="status"
              className="mt-3 text-center text-xs font-medium text-amber-500 light:text-amber-700 leading-relaxed"
            >
              {licenceHeld}
            </p>
          ) : alreadySubscribed ? (
            <p className="mt-3 text-center text-xs font-medium text-amber-500 light:text-amber-700 leading-relaxed">
              You already have a live subscription, so there is nothing to buy here. Change your
              plan or seat count in the billing portal.
            </p>
          ) : (
            offersCheckout && (
              <p className="mt-3 text-center text-xs leading-relaxed text-[rgb(var(--color-text-muted))]">
                {chargeLine}
              </p>
            )
          )}

          {/* The School licence route — a seat purchase for staff, an enquiry
              link for everyone else. Lives in its own component because the
              plan comparison shows the same panel: staff never see a locked
              control, so the prompt alone could not sell them a licence. */}
          {/* Not drawn once checkout has refused because a subscription is live.
              The server refuses a second subscription whatever its price, so a
              seat picker under "there is nothing to buy here" contradicted the
              line above it. */}
          {!alreadySubscribed && !licenceHeld && access.cta === 'buy-school' && (
            <SchoolLicencePanel
              user={user}
              showToast={showToast}
              onDone={close}
              className="mt-4 pt-4 border-t border-white/5 light:border-slate-300"
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default UpgradeModal;
