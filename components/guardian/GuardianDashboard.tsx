import React, { useCallback, useEffect, useState } from 'react';
import type { User } from '../../types';
import ConfirmationModal from '../ConfirmationModal';
import GuardianChildProgress from './GuardianChildProgress';
import { useLivePrices } from '../../hooks/useLivePrices';
import { PLAN_LABELS, STRIPE_PRICE_IDS, monetisationEnabled } from '../../services/entitlements';
import type { PlanPriceText } from '../../services/livePrices';
import {
  guardianAvailable,
  listMyStudents,
  listPaidSubscriptions,
  openGuardianBillingPortal,
  redeemGuardianInvite,
  removeGuardianLink,
  startGuardianCheckout,
  type GuardianInterval,
  type GuardianPlan,
  type LinkedStudent,
  type PaidSubscription,
} from '../../services/guardianService';

/**
 * The parent's home. Lazy-loaded by App, so a student never fetches it.
 *
 * Each linked child is one card: the plan they hold and who pays for it, a
 * Plus purchase for a child on the free plan, billing for a child the parent
 * pays for, read-only progress, and a remove-link action with a confirmation.
 * Linking a child takes the one-time code the child makes in their own profile.
 *
 * Nothing here decides access. The server checks every call; this only shows
 * the answer and offers the next step.
 */

const CARD =
  'min-w-0 rounded-panel border border-slate-300 bg-surface shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none p-5 sm:p-6';

const BUTTON_QUIET =
  't-label min-h-11 sm:min-h-0 px-4 py-2 rounded-xl border border-secondary bg-surface text-secondary can-hover:hover:bg-surface-inset touch-manipulation select-none transition-colors disabled:cursor-wait disabled:text-muted';

const BUTTON_PLUS =
  't-label min-h-11 sm:min-h-0 px-4 py-2 rounded-xl bg-amber-700 text-white shadow-sm dark:bg-amber-600 dark:text-slate-950 can-hover:hover:bg-amber-800 dark:can-hover:hover:bg-amber-500 active:scale-[0.98] transition-colors touch-manipulation select-none disabled:cursor-wait disabled:bg-surface-light disabled:text-muted';

const SECTION_TITLE = 't-display text-base sm:text-lg tracking-tight text-primary';

const errorText = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

/** A date as the reader's calendar reads it, or null when it does not parse. */
const dateLabel = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** Whether this deployment sells Plus to a parent for a child at all. */
export const canBuyPlusForChild = (): boolean =>
  monetisationEnabled() && (!!STRIPE_PRICE_IDS.plus_monthly || !!STRIPE_PRICE_IDS.plus_yearly);

/** The plan name a chip shows. */
export const planChipLabel = (plan: GuardianPlan): string =>
  plan === 'plus' ? PLAN_LABELS.plus : plan === 'school' ? PLAN_LABELS.school : PLAN_LABELS.free;

/**
 * One sentence on what the child's plan is and where it comes from. Names the
 * child, because the parent is reading about someone else's account.
 */
export const planSentence = (student: LinkedStudent): string => {
  const name = student.displayName;
  const end = dateLabel(student.planPeriodEnd);
  if (student.plan === 'school') {
    return `${name} is covered by their school’s licence, so there is nothing to buy here.`;
  }
  if (student.plan === 'plus') {
    const when = end ? (student.cancelAtPeriodEnd ? `Ends ${end}.` : `Renews ${end}.`) : '';
    if (student.paidByMe) {
      return ['Paid by you.', when, student.cancelAtPeriodEnd ? 'No further charges.' : '']
        .filter(Boolean)
        .join(' ');
    }
    return [`${name} holds ${PLAN_LABELS.plus} on their own account.`, when]
      .filter(Boolean)
      .join(' ');
  }
  return `${name} is on the free plan.`;
};

interface ChildCardProps {
  student: LinkedStudent;
  prices: PlanPriceText;
  onRemove: (student: LinkedStudent) => void;
}

const ChildCard: React.FC<ChildCardProps> = ({ student, prices, onRemove }) => {
  const monthlyId = STRIPE_PRICE_IDS.plus_monthly;
  const yearlyId = STRIPE_PRICE_IDS.plus_yearly;
  const options: GuardianInterval[] = [
    ...(monthlyId ? (['monthly'] as const) : []),
    ...(yearlyId ? (['yearly'] as const) : []),
  ];
  const [period, setPeriod] = useState<GuardianInterval>(yearlyId ? 'yearly' : 'monthly');
  const effectiveInterval: GuardianInterval = options.includes(period)
    ? period
    : (options[0] ?? 'monthly');
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);

  const offersPurchase = student.plan === 'free' && canBuyPlusForChild();
  const headingId = `guardian-child-${student.studentId}`;
  const linkedOn = dateLabel(student.linkedAt);

  const handleBuy = async () => {
    setBuying(true);
    setBuyError(null);
    try {
      const result = await startGuardianCheckout(
        student.studentId,
        effectiveInterval,
        student.displayName
      );
      if (result.url) {
        window.location.href = result.url;
        return;
      }
      setBuyError(result.error ?? 'Could not start checkout. Try again in a moment.');
    } catch (err) {
      setBuyError(errorText(err, 'Could not start checkout. Try again in a moment.'));
    }
    setBuying(false);
  };

  const priceText = (which: GuardianInterval): string =>
    which === 'yearly'
      ? `${prices.yearly}${prices.yearlyGst ? ` ${prices.yearlyGst}` : ''} a year`
      : `${prices.monthly}${prices.monthlyGst ? ` ${prices.monthlyGst}` : ''} a month`;

  return (
    <article aria-labelledby={headingId} className={`${CARD} space-y-5`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={headingId} className="text-lg font-bold text-primary break-words">
            {student.displayName}
          </h3>
          {linkedOn && <p className="t-label text-muted">Linked {linkedOn}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`t-label px-2.5 py-1 rounded-full border ${
              student.plan === 'free'
                ? 'border-secondary bg-surface-inset text-secondary'
                : 'border-amber-500/40 bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-400'
            }`}
          >
            {planChipLabel(student.plan)}
          </span>
          {student.paidByMe && (
            <span className="t-label px-2.5 py-1 rounded-full border border-secondary bg-surface-elevated text-primary">
              Paid by you
            </span>
          )}
        </div>
      </header>

      <p className="text-sm leading-relaxed text-secondary">{planSentence(student)}</p>

      {offersPurchase && (
        <div className="space-y-3 rounded-xl border border-secondary bg-surface-inset p-4">
          {options.length > 1 && (
            <div
              role="group"
              aria-label={`Billing period for ${student.displayName}`}
              className="grid grid-cols-1 sm:grid-cols-2 gap-2"
            >
              {options.map((option) => {
                const selected = option === effectiveInterval;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setPeriod(option)}
                    className={`text-left rounded-xl border px-3 py-2 touch-manipulation select-none transition-colors min-h-11 ${
                      selected
                        ? 'border-accent bg-surface text-primary'
                        : 'border-secondary bg-surface text-secondary can-hover:hover:bg-surface-elevated'
                    }`}
                  >
                    <span className="block text-sm font-semibold">
                      {option === 'yearly' ? 'Yearly' : 'Monthly'}
                    </span>
                    <span className="block t-label text-secondary">{priceText(option)}</span>
                    {option === 'yearly' && prices.yearlyNote && (
                      <span className="block t-label text-muted">{prices.yearlyNote}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleBuy}
              disabled={buying}
              aria-busy={buying || undefined}
              className={BUTTON_PLUS}
            >
              {buying ? 'Opening checkout…' : `Get ${PLAN_LABELS.plus} for ${student.displayName}`}
            </button>
          </div>
          <p className="t-label text-muted leading-relaxed">
            The charge is to you, and it renews automatically. You can cancel any time from Manage
            billing. {student.displayName} gets {PLAN_LABELS.plus} once payment goes through.
          </p>
          {buyError && (
            <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
              {buyError}
            </p>
          )}
        </div>
      )}

      <GuardianChildProgress studentId={student.studentId} name={student.displayName} />

      <footer className="flex justify-end border-t border-secondary pt-4">
        <button
          type="button"
          onClick={() => onRemove(student)}
          className="t-label min-h-11 sm:min-h-0 px-3 py-2 rounded-xl text-red-700 dark:text-red-400 can-hover:hover:bg-surface-inset touch-manipulation select-none transition-colors"
        >
          Remove link to {student.displayName}
        </button>
      </footer>
    </article>
  );
};

interface GuardianDashboardProps {
  user: User;
  /** Leave the dashboard for the question workspace. */
  onBrowseQuestions: () => void;
  onSignOut: () => void;
}

const GuardianDashboard: React.FC<GuardianDashboardProps> = ({
  user,
  onBrowseQuestions,
  onSignOut,
}) => {
  const available = guardianAvailable();
  const prices = useLivePrices();

  const [students, setStudents] = useState<LinkedStudent[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [code, setCode] = useState('');
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkNotice, setLinkNotice] = useState<string | null>(null);

  const [removeTarget, setRemoveTarget] = useState<LinkedStudent | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // Every live subscription this parent pays for. Read from the payer's side,
  // so billing stays reachable after a link is removed.
  const [payerRows, setPayerRows] = useState<PaidSubscription[] | null>(null);
  const [payerError, setPayerError] = useState<string | null>(null);

  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);

  const loadChildren = useCallback(async () => {
    setLoadError(null);
    try {
      setStudents(await listMyStudents());
    } catch (err) {
      setLoadError(errorText(err, 'Your children could not be loaded. Try again in a moment.'));
    }
    setPayerError(null);
    try {
      setPayerRows(await listPaidSubscriptions());
    } catch (err) {
      setPayerError(errorText(err, 'Your billing could not be checked. Try again in a moment.'));
    }
  }, []);

  useEffect(() => {
    if (available) void loadChildren();
  }, [available, loadChildren]);

  const handleLink = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = code.trim();
    setLinkNotice(null);
    setLinkError(null);
    if (!trimmed) {
      setLinkError('Enter the code your child shows you.');
      return;
    }
    setLinking(true);
    try {
      const linked = await redeemGuardianInvite(trimmed);
      setCode('');
      setLinkNotice(`Linked to ${linked.displayName}.`);
      await loadChildren();
    } catch (err) {
      setLinkError(errorText(err, 'That did not work. Try again in a moment.'));
    } finally {
      setLinking(false);
    }
  };

  const confirmRemove = async () => {
    const target = removeTarget;
    if (!target) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      await removeGuardianLink(target.studentId);
      setRemoveTarget(null);
      setLinkNotice(`The link to ${target.displayName} has been removed.`);
      await loadChildren();
    } catch (err) {
      setRemoveError(errorText(err, 'The link could not be removed. Try again in a moment.'));
    } finally {
      setRemoving(false);
    }
  };

  const handleManageBilling = async () => {
    setBillingBusy(true);
    setBillingError(null);
    try {
      const result = await openGuardianBillingPortal();
      if (result.url) {
        window.location.href = result.url;
        return;
      }
      setBillingError(result.error ?? 'The billing portal could not be opened. Try again shortly.');
    } catch (err) {
      setBillingError(errorText(err, 'The billing portal could not be opened. Try again shortly.'));
    }
    setBillingBusy(false);
  };

  // One billing route for the whole account. It shows whenever the parent pays
  // for any live subscription, or when that cannot be checked, so a removed
  // link never takes the portal away.
  const showBilling = available && ((payerRows?.length ?? 0) > 0 || payerError !== null);
  // A live subscription for a child who is no longer linked: say so, because the
  // child's card is gone and the section is the only trace of it.
  const payingForUnlinked =
    students !== null &&
    (payerRows ?? []).some((row) => !students.some((s) => s.studentId === row.userId));

  return (
    <main className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-6 sm:py-10 space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="t-display text-lg sm:text-xl tracking-tight text-primary">
            Your children
          </h1>
          <p className="text-sm text-secondary">Signed in as {user.displayName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onBrowseQuestions} className={BUTTON_QUIET}>
            Browse questions
          </button>
          <button type="button" onClick={onSignOut} className={BUTTON_QUIET}>
            Sign out
          </button>
        </div>
      </header>

      {!available && (
        <section aria-labelledby="guardian-offline-heading" className={`${CARD} space-y-3`}>
          <h2 id="guardian-offline-heading" className={SECTION_TITLE}>
            Parent accounts need an online account
          </h2>
          <p className="text-sm leading-relaxed text-secondary">
            This copy of the app is not connected to an online account service, so there are no
            children to link and no billing to manage here. Sign in to a connected copy to link a
            child. You can still browse questions in the meantime.
          </p>
        </section>
      )}

      {available && (
        <>
          <section aria-labelledby="guardian-link-heading" className={`${CARD} space-y-4`}>
            <div className="space-y-1.5">
              <h2 id="guardian-link-heading" className={SECTION_TITLE}>
                Link a child
              </h2>
              <p className="text-sm leading-relaxed text-secondary">
                Ask your child to open their profile, choose Parent or guardian, and create a link
                code. Enter the code here. Codes expire after 7 days, and a new code replaces the
                last one.
              </p>
            </div>
            <form onSubmit={handleLink} className="space-y-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="guardian-link-code"
                  className="block text-sm font-semibold text-primary"
                >
                  Link code
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    id="guardian-link-code"
                    type="text"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value);
                      setLinkError(null);
                    }}
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    placeholder="XXXX-XXXX"
                    aria-describedby="guardian-link-code-hint"
                    aria-invalid={linkError ? true : undefined}
                    className="min-h-11 flex-1 min-w-0 rounded-xl border border-secondary bg-surface-inset px-3 py-2 font-mono text-base tracking-wider text-primary"
                  />
                  <button
                    type="submit"
                    disabled={linking}
                    aria-busy={linking || undefined}
                    className={BUTTON_PLUS}
                  >
                    {linking ? 'Linking…' : 'Link child'}
                  </button>
                </div>
                <p id="guardian-link-code-hint" className="t-label text-muted">
                  Capitals, spaces and dashes do not matter.
                </p>
              </div>
              {linkError && (
                <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
                  {linkError}
                </p>
              )}
              {linkNotice && (
                <p
                  role="status"
                  className="text-sm font-medium text-emerald-700 dark:text-emerald-400"
                >
                  {linkNotice}
                </p>
              )}
            </form>
          </section>

          <section aria-labelledby="guardian-children-heading" className="space-y-4">
            <h2 id="guardian-children-heading" className={SECTION_TITLE}>
              Linked children
            </h2>

            {students === null && !loadError && (
              <p role="status" aria-busy="true" className="text-sm text-secondary">
                Loading your children…
              </p>
            )}

            {loadError && (
              <div className="space-y-2">
                <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
                  {loadError}
                </p>
                <button type="button" onClick={() => void loadChildren()} className={BUTTON_QUIET}>
                  Try again
                </button>
              </div>
            )}

            {students !== null && students.length === 0 && (
              <p className="text-sm leading-relaxed text-secondary">
                No children are linked yet. Once your child has created a code and you have entered
                it above, their progress and plan appear here.
              </p>
            )}

            {students !== null &&
              students.map((student) => (
                <ChildCard
                  key={student.studentId}
                  student={student}
                  prices={prices}
                  onRemove={(target) => {
                    setRemoveError(null);
                    setRemoveTarget(target);
                  }}
                />
              ))}
          </section>

          {showBilling && (
            <section aria-labelledby="guardian-billing-heading" className={`${CARD} space-y-3`}>
              <h2 id="guardian-billing-heading" className={SECTION_TITLE}>
                Billing
              </h2>
              <p className="text-sm leading-relaxed text-secondary">
                Update your payment details, or cancel a plan you pay for, in the billing portal.
                Removing a link does not cancel the plan it paid for.
              </p>
              {payingForUnlinked && (
                <p className="text-sm font-medium text-amber-800 dark:text-amber-400">
                  You still pay for a subscription for a student you are no longer linked to.
                </p>
              )}
              {payerError && (
                <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
                  {payerError}
                </p>
              )}
              <div>
                <button
                  type="button"
                  onClick={() => void handleManageBilling()}
                  disabled={billingBusy}
                  className={BUTTON_QUIET}
                >
                  {billingBusy ? 'Opening…' : 'Manage billing'}
                </button>
              </div>
              {billingError && (
                <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
                  {billingError}
                </p>
              )}
            </section>
          )}
        </>
      )}

      {removeTarget && (
        <ConfirmationModal
          isOpen
          onClose={() => {
            if (!removing) setRemoveTarget(null);
          }}
          onConfirm={() => void confirmRemove()}
          title={`Remove the link to ${removeTarget.displayName}?`}
          message={
            removeError ??
            (removeTarget.paidByMe
              ? `You will no longer see ${removeTarget.displayName}'s progress. Removing the link does not cancel the ${PLAN_LABELS.plus} you pay for, and you can still manage that billing from this page.`
              : `You will no longer see ${removeTarget.displayName}'s progress. They can link you again with a new code.`)
          }
          confirmButtonText={removing ? 'Removing…' : 'Remove link'}
          isDestructive
        />
      )}
    </main>
  );
};

export default GuardianDashboard;
