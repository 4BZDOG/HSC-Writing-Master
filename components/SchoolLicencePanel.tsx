import React, { useState } from 'react';
import { School, Minus, Plus } from 'lucide-react';
import type { ToastType } from '../hooks/useToast';
import {
  createCheckoutUrl,
  monetisationEnabled,
  PLAN_LABELS,
  PLAN_PRICING,
  SCHOOL_CONTACT_EMAIL,
  SCHOOL_SEAT_LIMITS,
  STRIPE_PRICE_IDS,
} from '../services/entitlements';
import type { User } from '../types';

/**
 * The School licence route: a seat purchase for staff, an enquiry link for
 * everyone else.
 *
 * WHY THIS IS A COMPONENT AND NOT A BLOCK INSIDE THE UPGRADE PROMPT. It used
 * to be exactly that, and it was unreachable. The seat picker is shown only to
 * teachers and admins, and the upgrade prompt only opens when a control is
 * LOCKED — but a teacher resolves to Plus through the staff perk and an admin
 * to School by role, so neither of them ever has a locked control to press.
 * Every feature this deployment prices at Plus is therefore open to the only
 * two roles allowed to buy a licence, and the only in-app route to the School
 * plan sat behind a door they could not open. `VITE_STRIPE_SCHOOL_PRICE_ID`
 * could be set and configured correctly and no school could buy anything.
 *
 * So it lives here, and renders in BOTH places: the upgrade prompt (where a
 * student who hit a lock can still ask about a licence) and the plan
 * comparison (which is where staff actually arrive — Profile → Compare plans).
 */

interface SchoolLicencePanelProps {
  user?: User | null;
  showToast: (message: string, type: ToastType) => void;
  /** Called after an action that should dismiss the surrounding surface. */
  onDone?: () => void;
  className?: string;
}

/** Staff buy seats; everyone else asks. Mirrored server-side in create-checkout. */
const canBuySeats = (user?: User | null): boolean =>
  !!STRIPE_PRICE_IDS.school && (user?.role === 'teacher' || user?.role === 'admin');

/**
 * True when there is a School route worth drawing at all. A deployment that
 * sells nothing has no licence to offer; every other deployment has at least
 * the enquiry route.
 */
export const hasSchoolRoute = (): boolean => monetisationEnabled();

const SchoolLicencePanel: React.FC<SchoolLicencePanelProps> = ({
  user,
  showToast,
  onDone,
  className = '',
}) => {
  const [seats, setSeats] = useState<number>(SCHOOL_SEAT_LIMITS.default);
  const [isBuyingSeats, setIsBuyingSeats] = useState(false);

  if (!monetisationEnabled()) return null;

  const buying = canBuySeats(user);

  // Students, parents and schools that cannot pay by card need a human
  // conversation rather than a checkout. With no contact address configured
  // there is still something honest to say, so the route is never a dead end.
  if (!buying) {
    return (
      <div className={`text-center ${className}`}>
        {SCHOOL_CONTACT_EMAIL ? (
          <a
            href={`mailto:${SCHOOL_CONTACT_EMAIL}?subject=${encodeURIComponent('School / class licence enquiry')}`}
            className="text-[11px] font-bold text-indigo-400 light:text-indigo-600 hover:underline"
          >
            Buying for a class or school? Ask about a school licence
          </a>
        ) : (
          <button
            type="button"
            onClick={() => {
              showToast(
                'School licensing is coming — ask your school admin to register interest.',
                'info'
              );
              onDone?.();
            }}
            className="text-[11px] font-bold text-indigo-400 light:text-indigo-600 hover:underline"
          >
            Buying for a class or school? Ask about a school licence
          </button>
        )}
      </div>
    );
  }

  const startCheckout = async () => {
    if (isBuyingSeats) return;
    setIsBuyingSeats(true);
    const { url, error } = await createCheckoutUrl(STRIPE_PRICE_IDS.school, seats);
    if (url) {
      window.location.href = url;
      return;
    }
    // Stay put on failure: the seat count the buyer chose is still on screen,
    // and the message says what to do next.
    showToast(error ?? 'Could not start the school checkout. Please try again.', 'error');
    setIsBuyingSeats(false);
  };

  return (
    <div
      className={`rounded-2xl bg-indigo-500/10 light:bg-indigo-50 border border-indigo-500/20 light:border-indigo-200 p-4 ${className}`}
    >
      <span className="t-label text-indigo-400 light:text-indigo-600 flex items-center gap-2 mb-3">
        <School className="w-3.5 h-3.5" /> School licence
      </span>
      <div className="flex flex-wrap items-center justify-between gap-3">
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
          <span className="t-label text-slate-400 ml-1">
            seats · {PLAN_PRICING.schoolSeat}/student/yr
          </span>
        </div>
        <button
          type="button"
          disabled={isBuyingSeats}
          onClick={startCheckout}
          className="t-label px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg active:scale-[0.98] transition-all disabled:opacity-60"
        >
          {isBuyingSeats ? 'Redirecting…' : `Buy ${seats} seats`}
        </button>
      </div>
      <p className="mt-2.5 text-[10px] font-medium text-[rgb(var(--color-text-muted))] light:text-slate-500 leading-relaxed">
        Everyone in your school gets {PLAN_LABELS.school} while the licence is active. Make sure
        your school is set up (and you're in it) before purchasing.
      </p>
    </div>
  );
};

export default SchoolLicencePanel;
