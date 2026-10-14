import React, { useEffect, useState } from 'react';
import { AlertTriangle, CreditCard, Loader2, X } from 'lucide-react';
import { createPortalUrl, fetchMySchoolSeats, type MySchoolSeats } from '../services/entitlements';
import { LIVE_LICENCE_STATUSES } from '../services/quotaService';
import type { User } from '../types';

const DISMISS_KEY = 'writing-studio:seat-overage-dismissed';

/**
 * Dismissal lasts for this tab's session. Read raw: a blocked store means the
 * notice comes back on the next visit, which is harmless.
 */
const readDismissed = (): boolean => {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
};

const rememberDismissed = (): void => {
  try {
    window.sessionStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* storage unavailable: the in-memory dismissal still holds for this mount */
  }
};

/**
 * More people in the school than the live licence pays for. A licence with no
 * seats recorded is "unknown", not "over", so it stays quiet.
 */
export const isOverSeats = (s: MySchoolSeats): boolean =>
  LIVE_LICENCE_STATUSES.includes(s.planStatus) && s.planSeats > 0 && s.members > s.planSeats;

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

/**
 * The seat notice for teachers and admins, mounted beside the payment alert.
 *
 * Seats are what the school pays for, and nothing caps membership at the seat
 * count: a licence can be outgrown without anyone deciding it should be. The
 * dashboard shows that to an admin who opens it. This tells the people who
 * bought or run the school, the first time they open the app in a session.
 *
 * Only the purchaser can open the billing portal (it is found through their own
 * customer id). Anyone else is told who to ask rather than shown a button that
 * would fail.
 */
const SeatOverageNotice: React.FC<{ user: User }> = ({ user }) => {
  // Students are refused by the database, so there is no point asking for them.
  const isStaff = user.role === 'teacher' || user.role === 'admin';
  const [seats, setSeats] = useState<MySchoolSeats | null>(null);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  // Re-read on a plan change too: that is when the seat picture can have moved.
  useEffect(() => {
    if (!isStaff) return;
    let cancelled = false;
    void fetchMySchoolSeats().then((s) => {
      if (!cancelled) setSeats(s);
    });
    return () => {
      cancelled = true;
    };
  }, [isStaff, user.username, user.stripePlan]);

  if (!isStaff || !seats || dismissed || !isOverSeats(seats)) return null;

  const over = seats.members - seats.planSeats;

  const dismiss = () => {
    rememberDismissed();
    setDismissed(true);
  };

  const openPortal = async () => {
    setIsOpeningPortal(true);
    setPortalError(null);
    const { url, error } = await createPortalUrl();
    if (url) {
      window.location.href = url;
      return;
    }
    setPortalError(error ?? 'Could not open the billing portal. Please try again shortly.');
    setIsOpeningPortal(false);
  };

  return (
    <div
      role="status"
      className="relative z-40 flex flex-wrap items-start sm:items-center gap-3 px-4 sm:px-5 py-3 rounded-2xl bg-amber-500/10 light:bg-amber-50 border border-amber-500/40 light:border-amber-300"
    >
      <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
        <AlertTriangle className="w-4 h-4 text-amber-600 light:text-amber-700" aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-[200px] text-xs leading-relaxed">
        <p className="text-primary">
          Your school licence covers {seats.planSeats} {plural(seats.planSeats, 'seat', 'seats')},
          but {seats.members} people are in the school now, {over} more than it covers.
        </p>
        <p className="mt-1 text-secondary">
          {over === 1 ? 'The extra person keeps' : `The ${over} extra people keep`} School access
          for now.{' '}
          {seats.purchaser
            ? 'Add seats under Manage subscription to match who is using it.'
            : 'Ask the teacher or administrator who bought the licence to add seats under Manage subscription.'}
        </p>
      </div>
      {seats.purchaser && (
        <button
          type="button"
          onClick={openPortal}
          disabled={isOpeningPortal}
          className="min-h-11 sm:min-h-0 t-label flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-slate-900 shadow-sm hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-60"
        >
          {isOpeningPortal ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <CreditCard className="w-3.5 h-3.5" aria-hidden="true" />
          )}
          Manage subscription
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss seat notice"
        className="min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 flex items-center justify-center p-1.5 rounded-lg text-amber-600 light:text-amber-700 hover:bg-amber-500/10 transition-colors"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
      {portalError && (
        <p className="w-full text-[11px] text-red-500 light:text-red-600">{portalError}</p>
      )}
    </div>
  );
};

export default SeatOverageNotice;
