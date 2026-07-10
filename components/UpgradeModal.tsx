import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Crown, Lock, Check, Sparkles, X } from 'lucide-react';
import {
  PREMIUM_FEATURES,
  PLAN_LABELS,
  UPGRADE_REQUEST_EVENT,
  PremiumFeatureKey,
} from '../services/entitlements';
import { useEscapeKey } from '../hooks/useEscapeKey';

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

interface UpgradeModalProps {
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

/**
 * The friendly "this is a Plus feature" prompt. Mounted once (in App); any
 * component opens it by calling requestUpgrade(featureKey) — no prop drilling.
 * Copy is deliberately soft because pricing isn't finalised: the CTA registers
 * interest rather than promising a checkout.
 */
const UpgradeModal: React.FC<UpgradeModalProps> = ({ showToast }) => {
  const [feature, setFeature] = useState<PremiumFeatureKey | null>(null);

  useEffect(() => {
    const onRequest = (e: Event) => {
      const key = (e as CustomEvent).detail?.feature as PremiumFeatureKey | undefined;
      if (key && key in PREMIUM_FEATURES) setFeature(key);
    };
    window.addEventListener(UPGRADE_REQUEST_EVENT, onRequest);
    return () => window.removeEventListener(UPGRADE_REQUEST_EVENT, onRequest);
  }, []);

  const close = useCallback(() => setFeature(null), []);
  useEscapeKey(!!feature, close);

  if (!feature) return null;
  const meta = PREMIUM_FEATURES[feature];

  return createPortal(
    <div
      className="fixed inset-0 z-[900] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
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
                {PLAN_LABELS.plus}
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
            {meta.blurb} This is part of <strong>{PLAN_LABELS.plus}</strong> — plans are being
            finalised, so it isn't available on the free plan just yet.
          </p>

          <div className="rounded-2xl bg-amber-400/5 light:bg-amber-50 border border-amber-400/20 light:border-amber-200 p-4 mb-6">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500 light:text-amber-700 flex items-center gap-2 mb-3">
              <Sparkles className="w-3.5 h-3.5" /> Included in {PLAN_LABELS.plus}
            </span>
            <ul className="space-y-2">
              {(Object.keys(PREMIUM_FEATURES) as PremiumFeatureKey[]).map((key) => (
                <li
                  key={key}
                  className={`flex items-start gap-2.5 text-xs leading-relaxed ${key === feature ? 'text-[rgb(var(--color-text-primary))] light:text-slate-900 font-bold' : 'text-[rgb(var(--color-text-muted))] light:text-slate-500 font-medium'}`}
                >
                  <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />
                  {PREMIUM_FEATURES[key].perk}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => {
                showToast("Thanks! We'll let you know when Plus plans launch.", 'success');
                close();
              }}
              className="flex-1 px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 text-white font-black text-xs uppercase tracking-widest shadow-xl shadow-amber-900/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Crown className="w-4 h-4" /> Keep me posted
            </button>
            <button
              onClick={close}
              className="px-5 py-3 rounded-2xl bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-100 text-[rgb(var(--color-text-secondary))] light:text-slate-600 font-bold text-xs uppercase tracking-widest border border-white/5 light:border-slate-200 hover:bg-white/10 light:hover:bg-slate-200 transition-all"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default UpgradeModal;
