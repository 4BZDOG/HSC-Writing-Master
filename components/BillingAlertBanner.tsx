import React, { useEffect, useState } from 'react';
import { AlertTriangle, CreditCard, Loader2, X } from 'lucide-react';
import {
  BillingAlert,
  fetchBillingAlert,
  createPortalUrl,
  PLAN_LABELS,
  Plan,
} from '../services/entitlements';

/**
 * Amber "fix your payment" banner, shown only while the user's subscription
 * is `past_due` — the grace period where Stripe is retrying a failed charge
 * and the webhook has deliberately kept their plan active (see
 * api/stripe-webhook.ts). Renders nothing otherwise, so it is safe to mount
 * unconditionally. Dismissal lasts for the session; the alert returns on the
 * next full load until the payment is actually fixed.
 */
const BillingAlertBanner: React.FC = () => {
  const [alert, setAlert] = useState<BillingAlert | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchBillingAlert().then((a) => {
      if (!cancelled) setAlert(a);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!alert || dismissed) return null;

  const planLabel = PLAN_LABELS[alert.plan as Plan] ?? alert.plan;

  const openPortal = async () => {
    setIsOpeningPortal(true);
    setPortalError(null);
    const { url, error } = await createPortalUrl();
    if (url) {
      window.location.href = url;
      return;
    }
    // Say something: a spinner that stops with nothing happening reads as a
    // broken button on the one screen where the user is trying to pay us.
    setPortalError(error ?? 'Could not open the billing portal. Please try again shortly.');
    setIsOpeningPortal(false);
  };

  return (
    <div
      role="alert"
      className="relative z-40 flex flex-wrap items-center gap-3 px-4 sm:px-5 py-3 rounded-2xl bg-amber-500/10 light:bg-amber-50 border border-amber-500/40 light:border-amber-300 shadow-lg animate-fade-in"
    >
      <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
        <AlertTriangle className="w-4 h-4 text-amber-500" />
      </div>
      <p className="flex-1 min-w-[200px] text-xs font-bold text-amber-600 light:text-amber-700 leading-relaxed">
        There's a payment issue with your {planLabel} subscription. Your access continues while the
        payment is retried — update your card to keep it that way.
      </p>
      <button
        onClick={openPortal}
        disabled={isOpeningPortal}
        className="t-label flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-white shadow hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-60"
      >
        {isOpeningPortal ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <CreditCard className="w-3.5 h-3.5" />
        )}
        Update payment method
      </button>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss payment warning"
        className="p-1.5 rounded-lg text-amber-500 hover:bg-amber-500/10 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
      {portalError && (
        <p className="w-full text-[11px] font-bold text-red-500 light:text-red-600">
          {portalError}
        </p>
      )}
    </div>
  );
};

export default BillingAlertBanner;
