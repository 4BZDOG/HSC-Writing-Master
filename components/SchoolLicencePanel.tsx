import React, { useState } from 'react';
import { School, Minus, Plus } from 'lucide-react';
import type { ToastType } from '../hooks/useToast';
import {
  BILLING_CODE,
  createCheckoutUrl,
  monetisationEnabled,
  PLAN_LABELS,
  SCHOOL_CONTACT_EMAIL,
  SCHOOL_SEAT_LIMITS,
  STRIPE_PRICE_IDS,
} from '../services/entitlements';
import { useLivePrices } from '../hooks/useLivePrices';
import type { User } from '../types';
import { billingErrorMessage } from '../utils/billingMessages';
import ChampionKit from './ChampionKit';
import { invoicedLicencesEnabled } from '../services/licenceRequestService';
import InvoiceRequestForm from './InvoiceRequestForm';

/**
 * The School licence route for STAFF: a seat purchase, or the reason there is
 * none to make.
 *
 * WHY THIS IS A COMPONENT AND NOT A BLOCK INSIDE THE UPGRADE PROMPT. A teacher
 * holds Plus as a staff perk and an admin holds School by role, so neither
 * meets a Plus lock. The plan comparison is where staff arrive, so the route
 * renders there as well as in the prompt for a School-priced feature.
 *
 * WHO SEES IT. Teachers and admins only. A student is never shown a School
 * route: they cannot buy one, and a licence offered to them is an upsell aimed at
 * the wrong person. Their answer is in describeAccess ("ask your school").
 *
 * WHAT IT SAYS, IN ORDER OF THE ANSWER:
 *   1. The school is already covered (the caller's plan is a licence): say so,
 *      and send them to whoever bought it. No seat picker, because a second
 *      licence would be refused.
 *   2. The server has refused a purchase because a licence is held: show its
 *      sentence, with no purchase button.
 *   3. The caller is not attached to a school: a licence would only cover them,
 *      so the route is "ask an admin", not a checkout the server would refuse.
 *   4. No School price in this deployment: the enquiry route.
 *   5. Otherwise the seat picker.
 */

interface SchoolLicencePanelProps {
  user?: User | null;
  showToast: (message: string, type: ToastType) => void;
  /** Called after an action that should dismiss the surrounding surface. */
  onDone?: () => void;
  className?: string;
}

const isStaff = (user?: User | null): boolean => user?.role === 'teacher' || user?.role === 'admin';

/**
 * A licence already covers this person's school. `stripePlan === 'school'` is
 * set at sign-in only from a live licence (or this account's own purchase), so
 * it answers "is the school covered" without a round trip.
 */
const schoolCovered = (user?: User | null): boolean => user?.stripePlan === 'school';

/**
 * True when there is a School route worth drawing at all. A deployment that
 * sells nothing has no licence to offer; every other deployment has at least
 * the enquiry route for staff.
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
  /** The server's sentence after it refused a purchase because a licence is held. */
  const [heldMessage, setHeldMessage] = useState<string | null>(null);
  // Read before the early returns below, so the hook order never changes.
  const prices = useLivePrices();

  if (!monetisationEnabled()) return null;
  if (!isStaff(user)) {
    // A student cannot buy a licence, so they get no route here. The one sentence
    // that says how schools pay is kept for them, because it offers nothing to do.
    return invoicedLicencesEnabled() ? (
      <p
        className={`text-center text-xs font-medium leading-relaxed text-[rgb(var(--color-text-muted))] light:text-slate-600 ${className}`}
      >
        Invoices and purchase orders are accepted for school licences. A teacher or admin at the
        school asks for one.
      </p>
    ) : null;
  }

  const wrap = (children: React.ReactNode) => (
    <div className={`text-center ${className}`}>{children}</div>
  );

  const isTeacher = user?.role === 'teacher';

  if (heldMessage || schoolCovered(user)) {
    return (
      <div
        role="status"
        className={`rounded-2xl bg-indigo-500/10 light:bg-indigo-50 border border-indigo-500/20 light:border-indigo-200 p-4 ${className}`}
      >
        <span className="t-label text-indigo-400 light:text-indigo-600 flex items-center gap-2 mb-2">
          <School className="w-3.5 h-3.5" aria-hidden="true" /> School licence
        </span>
        <p className="text-xs font-medium text-[rgb(var(--color-text-secondary))] leading-relaxed">
          {heldMessage ??
            `Your school already has a ${PLAN_LABELS.school} licence, so everyone in it has ${PLAN_LABELS.school}. ` +
              'To add seats, ask whoever bought the licence. If that is you, use Manage subscription in your profile.'}
        </p>
        {/* Someone else bought the licence, so a teacher cannot buy it either: the
            note is the one thing they can send to the person who manages it. */}
        {heldMessage && isTeacher && <ChampionKit schoolName={user?.schoolName} className="mt-3" />}
      </div>
    );
  }

  if (!user?.schoolId) {
    return (
      <div className={`text-center ${className}`}>
        <p className="text-xs font-medium text-[rgb(var(--color-text-secondary))] leading-relaxed">
          {user?.role === 'admin'
            ? `Add your account to a school (Admin → Schools) before you buy seats, so the licence covers your school.`
            : `A ${PLAN_LABELS.school} licence covers everyone in a school, so ask an admin to add you to yours. Then you can buy the seats.`}
        </p>
        {isTeacher && (
          <div className="mt-3 flex justify-center">
            <ChampionKit />
          </div>
        )}
      </div>
    );
  }

  if (!STRIPE_PRICE_IDS.school) {
    return wrap(
      SCHOOL_CONTACT_EMAIL ? (
        <a
          href={`mailto:${SCHOOL_CONTACT_EMAIL}?subject=${encodeURIComponent('School / class licence enquiry')}`}
          className="inline-flex min-h-11 items-center justify-center text-xs font-bold text-indigo-400 light:text-indigo-600 hover:underline"
        >
          Ask about a school licence
        </a>
      ) : (
        <button
          type="button"
          onClick={() => {
            showToast(
              'School licences are not on sale in the app yet. Speak to your school about a licence.',
              'info'
            );
            onDone?.();
          }}
          className="min-h-11 text-xs font-bold text-indigo-400 light:text-indigo-600 hover:underline"
        >
          Ask about a school licence
        </button>
      )
    );
  }

  const startCheckout = async () => {
    if (isBuyingSeats) return;
    setIsBuyingSeats(true);
    const { url, error, status, code } = await createCheckoutUrl(STRIPE_PRICE_IDS.school, seats);
    if (url) {
      window.location.href = url;
      return;
    }
    // Someone else at the school holds the licence. The server's sentence says
    // whom to ask, and there is nothing for this button to do any more.
    if (code === BILLING_CODE.schoolLicenceHeld && error) {
      setHeldMessage(error);
      setIsBuyingSeats(false);
      return;
    }
    // Stay put on failure: the seat count the buyer chose is still on screen,
    // and the message says what happened to the money.
    showToast(billingErrorMessage('school-checkout', { error, status, code }), 'error');
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
            className="shrink-0 w-11 h-11 sm:w-8 sm:h-8 rounded-xl bg-white/5 light:bg-white border border-white/10 light:border-slate-200 flex items-center justify-center text-slate-400 light:text-slate-600 hover:text-white light:hover:text-slate-700 transition-colors"
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
            className="shrink-0 w-11 h-11 sm:w-8 sm:h-8 rounded-xl bg-white/5 light:bg-white border border-white/10 light:border-slate-200 flex items-center justify-center text-slate-400 light:text-slate-600 hover:text-white light:hover:text-slate-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <span className="t-label text-slate-400 light:text-slate-600 ml-1">
            seats · {prices.schoolSeat} per student a year
            {prices.schoolSeatGst ? ` ${prices.schoolSeatGst}` : ''}
          </span>
        </div>
        <button
          type="button"
          disabled={isBuyingSeats}
          onClick={startCheckout}
          className="min-h-11 text-sm font-bold px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg active:scale-[0.98] transition-all disabled:opacity-60"
        >
          {isBuyingSeats ? 'Redirecting…' : `Buy ${seats} seats`}
        </button>
      </div>
      {/* Read before paying, so it is full size: this is the line that says who
          gets the licence and what has to be true first. */}
      <p className="mt-2.5 text-xs font-medium text-[rgb(var(--color-text-muted))] light:text-slate-600 leading-relaxed">
        Everyone in your school gets {PLAN_LABELS.school} while the licence is active. Check that
        your school is set up in the app and that you are listed in it before you buy.
      </p>
      {/* The card stays the headline; an invoice or purchase order is the second route. */}
      {invoicedLicencesEnabled() && (
        <InvoiceRequestForm
          seats={seats}
          className="mt-4 pt-4 border-t border-indigo-500/20 light:border-indigo-200"
        />
      )}
    </div>
  );
};

export default SchoolLicencePanel;
