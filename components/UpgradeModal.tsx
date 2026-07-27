import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Crown,
  Lock,
  Check,
  Sparkles,
  X,
  Zap,
  TrendingUp,
  School,
  Minus,
  Plus,
} from 'lucide-react';
import { User } from '../types';
import {
  PREMIUM_FEATURES,
  PLAN_LABELS,
  UPGRADE_REQUEST_EVENT,
  PremiumFeatureKey,
  createCheckoutUrl,
  planFeatureKeys,
  lowestPlanForFeature,
  STRIPE_PRICE_IDS,
  PLAN_PRICING,
  SCHOOL_CONTACT_EMAIL,
  SCHOOL_SEAT_LIMITS,
  FREE_DAILY_AI_CALLS,
  PAID_DAILY_AI_CALLS,
} from '../services/entitlements';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';

/**
 * Small amber lock chip for a gated-but-visible control. Sits inline next to
 * the control's label so the feature is discoverable before it's paid for.
 */
export const PlusLockChip: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span
    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-400/15 border border-amber-400/40 text-amber-500 light:text-amber-600 text-[9px] font-black uppercase tracking-wider ${className}`}
  >
    <Lock className="w-2.5 h-2.5" /> Plus
  </span>
);

/**
 * Blurred content overlay — shown over locked content (sample answers,
 * detailed feedback) to let free users see the shape of what they're
 * missing without reading the detail.
 */
export const ContentLockOverlay: React.FC<{
  feature: PremiumFeatureKey;
  message?: string;
}> = ({ feature, message }) => {
  const meta = PREMIUM_FEATURES[feature];
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[rgb(var(--color-bg-surface))]/80 light:bg-white/80 backdrop-blur-sm rounded-2xl">
      <div className="flex flex-col items-center gap-3 text-center px-6 max-w-xs">
        <div className="w-10 h-10 rounded-2xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center">
          <Lock className="w-5 h-5 text-amber-500" />
        </div>
        <p className="text-xs font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900">
          {message || meta?.title || 'Plus Feature'}
        </p>
        <button
          onClick={() =>
            window.dispatchEvent(new CustomEvent(UPGRADE_REQUEST_EVENT, { detail: { feature } }))
          }
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-white font-black text-[10px] uppercase tracking-widest shadow-lg hover:scale-105 active:scale-95 transition-all"
        >
          Unlock with Plus
        </button>
      </div>
    </div>
  );
};

interface UpgradeModalProps {
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
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
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('yearly');
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [seats, setSeats] = useState<number>(SCHOOL_SEAT_LIMITS.default);
  const [isBuyingSeats, setIsBuyingSeats] = useState(false);

  const stripeReady = !!(STRIPE_PRICE_IDS.plus_monthly && STRIPE_PRICE_IDS.plus_yearly);
  // Seat licences are a staff purchase: shown to teachers/admins once the
  // school price exists; students keep the enquiry link.
  const canBuySeats =
    !!STRIPE_PRICE_IDS.school && (user?.role === 'teacher' || user?.role === 'admin');

  // Personalised hook: the most convincing thing we can show a student is
  // their own trajectory. Only shown once they have enough marked answers for
  // the average to mean something, and only while there's a gap to close.
  const avgBand = user?.stats?.averageBand ?? 0;
  const showBandHook = (user?.stats?.questionsAnswered ?? 0) >= 3 && avgBand > 0 && avgBand < 5.5;

  useEffect(() => {
    const onRequest = (e: Event) => {
      const key = (e as CustomEvent).detail?.feature as PremiumFeatureKey | undefined;
      if (key && key in PREMIUM_FEATURES) setFeature(key);
    };
    window.addEventListener(UPGRADE_REQUEST_EVENT, onRequest);
    return () => window.removeEventListener(UPGRADE_REQUEST_EVENT, onRequest);
  }, []);

  const close = useCallback(() => {
    setFeature(null);
    setIsRedirecting(false);
  }, []);
  useEscapeKey(!!feature, close);
  useScrollLock(!!feature);

  const handleUpgrade = async () => {
    if (!stripeReady) {
      showToast("Thanks! We'll let you know when Plus plans launch.", 'success');
      close();
      return;
    }
    setIsRedirecting(true);
    const priceId =
      billingPeriod === 'yearly' ? STRIPE_PRICE_IDS.plus_yearly : STRIPE_PRICE_IDS.plus_monthly;
    const { url, error } = await createCheckoutUrl(priceId);
    if (url) {
      window.location.href = url;
    } else {
      showToast(error ?? 'Could not start checkout. Please try again.', 'error');
      setIsRedirecting(false);
    }
  };

  if (!feature) return null;
  const meta = PREMIUM_FEATURES[feature];
  // Sell the plan that actually unlocks THIS feature. A school-only feature
  // (the AI Content Studio) must not be pitched as Plus — a teacher already
  // has Plus, so an "Upgrade to Plus" CTA would leave them where they started.
  const requiredPlan = lowestPlanForFeature(feature);
  const sellsPlus = requiredPlan === 'plus';
  const perkKeys = planFeatureKeys(requiredPlan);

  return createPortal(
    <div
      className="fixed inset-0 z-[900] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-modal-title"
    >
      <div className="clip-stable w-full max-w-md rounded-[32px] bg-[rgb(var(--color-bg-surface))] light:bg-white border-2 border-amber-400/40 shadow-[0_32px_96px_-16px_rgba(0,0,0,0.7)] overflow-hidden animate-fade-in-up flex flex-col max-h-[90vh]">
        {/* Golden header */}
        <div className="relative px-6 py-6 bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 text-white overflow-hidden shrink-0">
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/20 blur-3xl rounded-full pointer-events-none" />
          <button
            onClick={close}
            aria-label="Close"
            className="absolute top-4 right-4 p-2 rounded-xl bg-black/10 hover:bg-black/20 text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-4 relative z-10">
            <div className="w-14 h-14 shrink-0 rounded-2xl bg-white/25 backdrop-blur border border-white/40 flex items-center justify-center shadow-lg">
              <Crown className="w-7 h-7" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/80 block">
                {PLAN_LABELS[requiredPlan]}
              </span>
              <h2
                id="upgrade-modal-title"
                className="text-xl font-black tracking-tight leading-tight"
              >
                {meta.title}
              </h2>
            </div>
          </div>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar">
          <p className="text-sm text-[rgb(var(--color-text-secondary))] light:text-slate-600 leading-relaxed mb-5">
            {meta.blurb}{' '}
            {!sellsPlus
              ? `This is part of the ${PLAN_LABELS.school} plan — a licence covers everyone at your school.`
              : stripeReady
                ? `Upgrade to ${PLAN_LABELS.plus} to unlock this and everything below.`
                : `This is part of ${PLAN_LABELS.plus} — plans are being finalised, so it isn't available on the free plan just yet.`}
          </p>

          {showBandHook && (
            <div className="rounded-2xl bg-indigo-500/10 light:bg-indigo-50 border border-indigo-500/20 light:border-indigo-200 p-4 mb-5 flex items-start gap-3">
              <TrendingUp className="w-4 h-4 text-indigo-400 light:text-indigo-600 mt-0.5 shrink-0" />
              <p className="text-xs leading-relaxed text-[rgb(var(--color-text-secondary))] light:text-slate-600">
                You're averaging{' '}
                <span className="font-black text-indigo-400 light:text-indigo-600">
                  Band {avgBand.toFixed(1)}
                </span>{' '}
                across {user!.stats.questionsAnswered} marked answers. Full criterion feedback,
                answer upgrades and exemplars are the tools for closing the gap to Band 6.
              </p>
            </div>
          )}

          <div className="rounded-2xl bg-amber-400/5 light:bg-amber-50 border border-amber-400/20 light:border-amber-200 p-4 mb-6">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500 light:text-amber-700 flex items-center gap-2 mb-3">
              <Sparkles className="w-3.5 h-3.5" /> Included in {PLAN_LABELS[requiredPlan]}
            </span>
            <ul className="space-y-2">
              {perkKeys.map((key) => (
                <li
                  key={key}
                  className={`flex items-start gap-2.5 text-xs leading-relaxed ${key === feature ? 'text-[rgb(var(--color-text-primary))] light:text-slate-900 font-bold' : 'text-[rgb(var(--color-text-muted))] light:text-slate-500 font-medium'}`}
                >
                  <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />
                  {PREMIUM_FEATURES[key].perk}
                </li>
              ))}
              {/* Not a feature gate — the plan-aware server quota (schema §11):
                  paid plans are guaranteed a 300-call daily AI allowance. */}
              <li className="flex items-start gap-2.5 text-xs leading-relaxed text-[rgb(var(--color-text-muted))] light:text-slate-500 font-medium">
                <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />A{' '}
                {PAID_DAILY_AI_CALLS}-call daily AI allowance —{' '}
                {Math.round(PAID_DAILY_AI_CALLS / FREE_DAILY_AI_CALLS)} times the free tier
              </li>
            </ul>
          </div>

          {/* Billing period toggle with real prices — a paywall that hides the
              price converts far worse than one that states it plainly. */}
          {stripeReady && sellsPlus && (
            <div className="mb-5">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setBillingPeriod('monthly')}
                  aria-pressed={billingPeriod === 'monthly'}
                  className={`px-4 py-3 rounded-xl text-left transition-all border ${
                    billingPeriod === 'monthly'
                      ? 'bg-amber-400/20 border-amber-400/40'
                      : 'border-white/5 light:border-slate-200 hover:border-amber-400/20'
                  }`}
                >
                  <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Monthly
                  </span>
                  <span className="block text-lg font-black text-[rgb(var(--color-text-primary))] light:text-slate-900 mt-0.5">
                    {PLAN_PRICING.monthly}
                    <span className="text-[10px] font-bold text-slate-400"> /month</span>
                  </span>
                </button>
                <button
                  onClick={() => setBillingPeriod('yearly')}
                  aria-pressed={billingPeriod === 'yearly'}
                  className={`px-4 py-3 rounded-xl text-left transition-all border relative ${
                    billingPeriod === 'yearly'
                      ? 'bg-amber-400/20 border-amber-400/40'
                      : 'border-white/5 light:border-slate-200 hover:border-amber-400/20'
                  }`}
                >
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                    Yearly <Zap className="w-3 h-3 text-amber-500" />
                  </span>
                  <span className="block text-lg font-black text-[rgb(var(--color-text-primary))] light:text-slate-900 mt-0.5">
                    {PLAN_PRICING.yearly}
                    <span className="text-[10px] font-bold text-slate-400"> /year</span>
                  </span>
                </button>
              </div>
              {billingPeriod === 'yearly' && (
                <p className="mt-2 text-center text-[10px] font-bold text-emerald-500">
                  {PLAN_PRICING.yearlyNote}
                  <span className="block mt-0.5 font-medium text-[rgb(var(--color-text-muted))] light:text-slate-400">
                    A year of unlimited marking for less than one hour of tutoring.
                  </span>
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            {/* Only offer the Plus checkout when Plus is what unlocks the
                feature; school-only features are bought below (or enquired
                about) instead. */}
            {sellsPlus && (
              <button
                onClick={handleUpgrade}
                disabled={isRedirecting}
                className="flex-1 px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 text-white font-black text-xs uppercase tracking-widest shadow-xl shadow-amber-900/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <Crown className="w-4 h-4" />{' '}
                {isRedirecting ? 'Redirecting…' : stripeReady ? 'Upgrade now' : 'Keep me posted'}
              </button>
            )}
            <button
              onClick={close}
              className={`${sellsPlus ? '' : 'flex-1 '}px-5 py-3 rounded-2xl bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-100 text-[rgb(var(--color-text-secondary))] light:text-slate-600 font-bold text-xs uppercase tracking-widest border border-white/5 light:border-slate-200 hover:bg-white/10 light:hover:bg-slate-200 transition-all`}
            >
              Maybe later
            </button>
          </div>

          {stripeReady && sellsPlus && (
            <p className="mt-3 text-center text-[10px] text-[rgb(var(--color-text-muted))] light:text-slate-400">
              Cancel anytime from your profile — no lock-in.
            </p>
          )}

          {/* School seat licence — a direct purchase for staff once the school
              price is configured. Seats are the billed quantity; every member
              of the buyer's school gets the plan while it's active. */}
          {canBuySeats && (
            <div className="mt-4 pt-4 border-t border-white/5 light:border-slate-100">
              <div className="rounded-2xl bg-indigo-500/10 light:bg-indigo-50 border border-indigo-500/20 light:border-indigo-200 p-4">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400 light:text-indigo-600 flex items-center gap-2 mb-3">
                  <School className="w-3.5 h-3.5" /> School licence
                </span>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="Fewer seats"
                      onClick={() => setSeats((s) => Math.max(SCHOOL_SEAT_LIMITS.min, s - 5))}
                      className="w-8 h-8 rounded-xl bg-white/5 light:bg-white border border-white/10 light:border-slate-200 flex items-center justify-center text-slate-400 hover:text-white light:hover:text-slate-700 transition-colors"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-16 text-center text-lg font-black text-[rgb(var(--color-text-primary))] light:text-slate-900 tabular-nums">
                      {seats}
                    </span>
                    <button
                      type="button"
                      aria-label="More seats"
                      onClick={() => setSeats((s) => Math.min(SCHOOL_SEAT_LIMITS.max, s + 5))}
                      className="w-8 h-8 rounded-xl bg-white/5 light:bg-white border border-white/10 light:border-slate-200 flex items-center justify-center text-slate-400 hover:text-white light:hover:text-slate-700 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">
                      seats · {PLAN_PRICING.schoolSeat}/student/yr
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={isBuyingSeats}
                    onClick={async () => {
                      setIsBuyingSeats(true);
                      const { url, error } = await createCheckoutUrl(
                        STRIPE_PRICE_IDS.school,
                        seats
                      );
                      if (url) {
                        window.location.href = url;
                      } else {
                        showToast(
                          error ?? 'Could not start the school checkout. Please try again.',
                          'error'
                        );
                        setIsBuyingSeats(false);
                      }
                    }}
                    className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all disabled:opacity-60"
                  >
                    {isBuyingSeats ? 'Redirecting…' : `Buy ${seats} seats`}
                  </button>
                </div>
                <p className="mt-2.5 text-[10px] font-medium text-[rgb(var(--color-text-muted))] light:text-slate-500 leading-relaxed">
                  Everyone in your school gets {PLAN_LABELS.school} while the licence is active.
                  Make sure your school is set up (and you're in it) before purchasing.
                </p>
              </div>
            </div>
          )}

          {/* Teachers buying for a class, or schools buying seats, need a human
              conversation rather than an individual checkout — unless the
              direct seat purchase above is available. */}
          {!canBuySeats && (
            <div className="mt-4 pt-4 border-t border-white/5 light:border-slate-100 text-center">
              {SCHOOL_CONTACT_EMAIL ? (
                <a
                  href={`mailto:${SCHOOL_CONTACT_EMAIL}?subject=${encodeURIComponent('School / class licence enquiry')}`}
                  className="text-[11px] font-bold text-indigo-400 light:text-indigo-600 hover:underline"
                >
                  Buying for a class or school? Ask about a school licence →
                </a>
              ) : (
                <button
                  onClick={() => {
                    showToast(
                      'School licensing is coming — ask your school admin to register interest.',
                      'info'
                    );
                    close();
                  }}
                  className="text-[11px] font-bold text-indigo-400 light:text-indigo-600 hover:underline"
                >
                  Buying for a class or school? Ask about a school licence →
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default UpgradeModal;
