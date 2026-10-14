import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  CircleCheck,
  CircleX,
  ExternalLink,
  Receipt,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import {
  INVOICE_WAIT_WORKING_DAYS,
  type InvoiceRequestSummary,
} from '../../services/billingOverviewService';
import {
  DECISION_NOTE_MAX,
  DEFAULT_DUE_DAYS,
  DUE_DAY_CHOICES,
  actionsAfter,
  describeApproval,
  isSettled,
  type DecisionOutcome,
  type InvoiceDecision,
} from '../../services/invoiceDecisionService';

/**
 * The purchase-order queue on the Billing overview. Each request is a card with
 * its billing details and two actions. Approve and decline both open a confirm
 * step that says what will happen before anything is sent, and each card keeps
 * the answer the server gave it, so a refusal is not lost when the list refreshes.
 *
 * Only one call is in flight at a time, across every card: the buttons on all of
 * them are disabled until it returns. The deciding happens in the overview, which
 * holds the answers; this file only draws them.
 */

export interface InvoiceRequestRowView {
  request: InvoiceRequestSummary;
  outcome: DecisionOutcome | null;
}

export interface InvoiceRequestsProps {
  rows: InvoiceRequestRowView[];
  /** The request whose call is in flight, or null. */
  deciding: string | null;
  onDecide: (request: InvoiceRequestSummary, decision: InvoiceDecision) => void;
}

type Step = 'idle' | 'approve' | 'decline';

const countWord = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;

const waitedLabel = (days: number): string => {
  if (days === 0) return 'Came in today';
  return `Waiting ${countWord(days, 'working day')}`;
};

const receivedLabel = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

/** The button look used across the overview: a tinted fill, with the ink carrying the meaning. */
const TONE_BUTTON = {
  approve:
    'border-emerald-500/30 bg-emerald-500/10 text-emerald-500 light:text-emerald-800 hover:bg-emerald-500/20',
  decline: 'border-red-500/30 bg-red-500/10 text-red-400 light:text-red-700 hover:bg-red-500/20',
  quiet:
    'border-[rgb(var(--color-border-secondary))] light:border-slate-300 bg-[rgb(var(--color-bg-surface-light))] light:bg-slate-200 text-[rgb(var(--color-text-primary))] light:text-slate-900 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-300',
} as const;

/** Every button here is 44px tall on a phone, as the other overview controls are. */
const BUTTON_BASE =
  'min-h-[44px] sm:min-h-0 px-4 py-2 sm:py-1.5 rounded-lg border text-sm font-bold transition-all disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2';

const SPINNER = <RefreshCw className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" />;

interface CardProps {
  request: InvoiceRequestSummary;
  outcome: DecisionOutcome | null;
  deciding: string | null;
  onDecide: InvoiceRequestsProps['onDecide'];
}

const InvoiceRequestCard: React.FC<CardProps> = ({ request, outcome, deciding, onDecide }) => {
  const uid = useId();
  const [step, setStep] = useState<Step>('idle');
  const [daysUntilDue, setDaysUntilDue] = useState<number>(DEFAULT_DUE_DAYS);
  const [note, setNote] = useState('');

  const approveRef = useRef<HTMLButtonElement>(null);
  const declineRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);
  // Where focus goes when a confirm step is cancelled: back to the button that opened it.
  const returnFocusTo = useRef<'approve' | 'decline' | null>(null);

  const calling = deciding === request.id;
  const busy = deciding !== null;
  const settled = outcome !== null && isSettled(outcome);
  const allowed = actionsAfter(outcome);
  const hasSubscription = Boolean(request.subscriptionId);
  const ids = {
    title: `${uid}-title`,
    due: `${uid}-due`,
    note: `${uid}-note`,
    noteHint: `${uid}-note-hint`,
  };

  // A confirm step moves focus to its heading (or the note), so a screen reader
  // reads what is about to happen.
  useEffect(() => {
    if (step === 'approve') headingRef.current?.focus();
    if (step === 'decline') noteRef.current?.focus();
  }, [step]);

  // Cancelling hands focus back to the button that opened the step.
  useEffect(() => {
    if (step !== 'idle' || returnFocusTo.current === null) return;
    (returnFocusTo.current === 'approve' ? approveRef : declineRef).current?.focus();
    returnFocusTo.current = null;
  }, [step]);

  // A new answer closes any confirm step and takes focus, so the outcome is read
  // out rather than appearing silently. Keyed on the answer, not on the call: a
  // call that resolves before React paints the "calling" state must still close.
  // A layout effect, so the step closes in the same commit that shows the answer:
  // no frame shows the answer above a confirm step that is still open.
  const lastAnswer = useRef(outcome);
  useLayoutEffect(() => {
    if (outcome === lastAnswer.current) return;
    lastAnswer.current = outcome;
    if (!outcome) return;
    setStep('idle');
    answerRef.current?.focus();
  }, [outcome]);

  const cancel = (from: 'approve' | 'decline') => {
    returnFocusTo.current = from;
    setStep('idle');
  };

  const { schoolName } = request;

  const detail = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-base font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900 break-words">
            {schoolName}
          </p>
          <p className="text-sm text-[rgb(var(--color-text-secondary))] light:text-slate-700 break-words">
            {countWord(request.seats, 'seat')} · {request.billingName} ·{' '}
            <span className="break-words">{request.billingEmail}</span>
          </p>
        </div>
        <p
          className={`shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-bold ${
            request.overdue
              ? 'border-amber-500/40 bg-amber-500/10 light:bg-amber-50 light:border-amber-300 text-amber-400 light:text-amber-800'
              : 'border-[rgb(var(--color-border-secondary))] light:border-slate-300 text-[rgb(var(--color-text-secondary))] light:text-slate-700'
          }`}
          title={
            request.overdue ? `Older than ${INVOICE_WAIT_WORKING_DAYS} working days` : undefined
          }
        >
          {request.overdue && <TriangleAlert className="w-3.5 h-3.5" aria-hidden="true" />}
          {waitedLabel(request.workingDaysWaited)}
          {request.overdue ? ' · overdue' : ''}
        </p>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 mt-3 text-xs">
        <div className="min-w-0">
          <dt className="font-semibold text-[rgb(var(--color-text-muted))] light:text-slate-600">
            Billing address
          </dt>
          <dd className="text-[rgb(var(--color-text-primary))] light:text-slate-900 break-words">
            {request.billingAddress}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="font-semibold text-[rgb(var(--color-text-muted))] light:text-slate-600">
            ABN
          </dt>
          <dd className="text-[rgb(var(--color-text-primary))] light:text-slate-900 tabular-nums">
            {request.abn ?? 'Not given'}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="font-semibold text-[rgb(var(--color-text-muted))] light:text-slate-600">
            Purchase order
          </dt>
          <dd className="text-[rgb(var(--color-text-primary))] light:text-slate-900 break-words">
            {request.poNumber ?? 'Not given'}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="font-semibold text-[rgb(var(--color-text-muted))] light:text-slate-600">
            Received
          </dt>
          <dd className="text-[rgb(var(--color-text-primary))] light:text-slate-900">
            {receivedLabel(request.requestedAt)}
          </dd>
        </div>
      </dl>

      {request.note && (
        <p className="mt-3 text-xs whitespace-pre-line break-words text-[rgb(var(--color-text-secondary))] light:text-slate-700">
          <span className="font-semibold">Note from the person who asked:</span> {request.note}
        </p>
      )}
      {hasSubscription && !settled && (
        <p className="mt-3 text-xs text-amber-400 light:text-amber-800 break-words">
          Stripe already holds subscription{' '}
          <span className="font-mono break-all">{request.subscriptionId}</span> for this request,
          from an earlier approval that did not finish.
        </p>
      )}
    </>
  );

  // Approved and declined replace the actions. A refusal or an unknown answer
  // sits above them, so the admin can see why and what is still open.
  const answered = outcome && isSettled(outcome) ? outcome : null;
  const failure =
    outcome && (outcome.kind === 'refused' || outcome.kind === 'unknown') ? outcome : null;

  return (
    <li
      aria-busy={calling || undefined}
      className="p-4 rounded-xl border border-[rgb(var(--color-border-secondary))] light:border-slate-300 bg-[rgb(var(--color-bg-surface-inset))]"
    >
      {detail}

      {answered?.kind === 'approved' && (
        <div
          ref={answerRef}
          tabIndex={-1}
          role="status"
          className="mt-4 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 light:bg-emerald-50 light:border-emerald-300 outline-none"
        >
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-400 light:text-emerald-800">
            <CircleCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
            Approved. Stripe has sent the invoice to {request.billingEmail}.
          </p>
          {answered.subscriptionId && (
            <p className="mt-1 text-xs font-mono break-words text-[rgb(var(--color-text-secondary))] light:text-slate-700">
              Subscription {answered.subscriptionId}
            </p>
          )}
          {answered.hostedInvoiceUrl ? (
            <a
              href={answered.hostedInvoiceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${BUTTON_BASE} mt-3 ${TONE_BUTTON.quiet}`}
            >
              Open the invoice
              <ExternalLink className="w-4 h-4" aria-hidden="true" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : (
            <p className="mt-2 text-xs text-[rgb(var(--color-text-secondary))] light:text-slate-700">
              The invoice link is not shown here. Find the invoice in the Stripe Dashboard under the
              subscription above.
            </p>
          )}
        </div>
      )}

      {answered?.kind === 'declined' && (
        <div
          ref={answerRef}
          tabIndex={-1}
          role="status"
          className="mt-4 p-3 rounded-lg border border-[rgb(var(--color-border-secondary))] light:border-slate-300 bg-[rgb(var(--color-bg-surface))] outline-none"
        >
          <p className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-900">
            <CircleX
              className="w-4 h-4 shrink-0 text-red-400 light:text-red-700"
              aria-hidden="true"
            />
            Declined. Nothing in Stripe was changed.
          </p>
          <p className="mt-1 text-xs text-[rgb(var(--color-text-secondary))] light:text-slate-700">
            The person who asked can make a new request.
          </p>
        </div>
      )}

      {failure && (
        <div
          ref={answerRef}
          tabIndex={-1}
          role="alert"
          className="mt-4 p-3 rounded-lg border border-red-500/40 bg-red-500/10 light:bg-red-50 light:border-red-300 outline-none space-y-1"
        >
          <p className="text-sm font-semibold text-red-400 light:text-red-800">{failure.error}</p>
          {failure.kind === 'refused' && failure.subscriptionId && (
            <p className="text-xs text-[rgb(var(--color-text-secondary))] light:text-slate-800 break-words">
              Stripe holds subscription{' '}
              <span className="font-mono break-all">{failure.subscriptionId}</span> for this
              request. Check it in the Stripe Dashboard, then use Refresh in this window to read the
              request again. Approve stays off until then.
            </p>
          )}
        </div>
      )}

      {!answered && step === 'idle' && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            ref={approveRef}
            type="button"
            disabled={busy || !allowed.approve}
            onClick={() => setStep('approve')}
            className={`${BUTTON_BASE} ${TONE_BUTTON.approve}`}
          >
            Approve
          </button>
          <button
            ref={declineRef}
            type="button"
            disabled={busy || !allowed.decline}
            onClick={() => setStep('decline')}
            className={`${BUTTON_BASE} ${TONE_BUTTON.decline}`}
          >
            Decline
          </button>
        </div>
      )}

      {!answered && step === 'approve' && (
        <div
          role="group"
          aria-labelledby={ids.title}
          className="mt-4 p-4 rounded-lg border border-emerald-500/30 bg-[rgb(var(--color-bg-surface))] space-y-3"
        >
          <h5
            ref={headingRef}
            id={ids.title}
            tabIndex={-1}
            className="text-sm font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900 outline-none"
          >
            Approve {schoolName}’s request?
          </h5>
          <div className="space-y-2 text-sm text-[rgb(var(--color-text-secondary))] light:text-slate-700">
            {describeApproval(request, daysUntilDue).map((sentence) => (
              <p key={sentence}>{sentence}</p>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="min-w-0">
              <label
                htmlFor={ids.due}
                className="block text-xs font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-900 mb-1"
              >
                Payment due in
              </label>
              <select
                id={ids.due}
                value={daysUntilDue}
                disabled={busy || hasSubscription}
                onChange={(e) => setDaysUntilDue(Number(e.target.value))}
                className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-3 py-2 rounded-lg border border-[rgb(var(--color-border-secondary))] light:border-slate-300 bg-[rgb(var(--color-bg-surface-inset))] text-base sm:text-sm text-[rgb(var(--color-text-primary))] light:text-slate-900 disabled:opacity-60"
              >
                {DUE_DAY_CHOICES.map((days) => (
                  <option key={days} value={days}>
                    {days} days
                  </option>
                ))}
              </select>
              {hasSubscription && (
                <p className="text-xs mt-1 text-[rgb(var(--color-text-secondary))] light:text-slate-700">
                  Set when the subscription was first created, so it cannot change here.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              <button
                type="button"
                disabled={busy}
                onClick={() => onDecide(request, { action: 'approve', daysUntilDue })}
                className={`${BUTTON_BASE} border-transparent bg-emerald-700 hover:bg-emerald-600 text-white disabled:!opacity-100`}
              >
                {calling ? (
                  <>
                    {SPINNER}
                    Sending invoice…
                  </>
                ) : (
                  'Approve and send invoice'
                )}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => cancel('approve')}
                className={`${BUTTON_BASE} ${TONE_BUTTON.quiet}`}
              >
                Back
              </button>
            </div>
          </div>
        </div>
      )}

      {!answered && step === 'decline' && (
        <div
          role="group"
          aria-labelledby={ids.title}
          className="mt-4 p-4 rounded-lg border border-red-500/30 bg-[rgb(var(--color-bg-surface))] space-y-3"
        >
          <h5
            ref={headingRef}
            id={ids.title}
            tabIndex={-1}
            className="text-sm font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900 outline-none"
          >
            Decline {schoolName}’s request?
          </h5>
          <p className="text-sm text-[rgb(var(--color-text-secondary))] light:text-slate-700">
            Declining records the decision in the app. It changes nothing in Stripe and sends no
            invoice. The person who asked can make a new request.
          </p>
          <div>
            <label
              htmlFor={ids.note}
              className="block text-xs font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-900 mb-1"
            >
              Note for the person who asked (optional)
            </label>
            <textarea
              ref={noteRef}
              id={ids.note}
              rows={3}
              maxLength={DECISION_NOTE_MAX}
              value={note}
              disabled={busy}
              aria-describedby={ids.noteHint}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[rgb(var(--color-border-secondary))] light:border-slate-300 bg-[rgb(var(--color-bg-surface-inset))] text-base sm:text-sm text-[rgb(var(--color-text-primary))] light:text-slate-900 disabled:opacity-60"
            />
            <p
              id={ids.noteHint}
              className="text-xs mt-1 text-[rgb(var(--color-text-secondary))] light:text-slate-700"
            >
              The person who asked sees this note. Up to {DECISION_NOTE_MAX} characters.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                onDecide(request, { action: 'decline', decisionNote: note.trim() || null })
              }
              className={`${BUTTON_BASE} border-transparent bg-red-700 hover:bg-red-600 text-white disabled:!opacity-100`}
            >
              {calling ? (
                <>
                  {SPINNER}
                  Declining…
                </>
              ) : (
                'Decline request'
              )}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => cancel('decline')}
              className={`${BUTTON_BASE} ${TONE_BUTTON.quiet}`}
            >
              Back
            </button>
          </div>
        </div>
      )}
    </li>
  );
};

/**
 * The approval queue: the group at the top of "Needs attention". The caller only
 * renders it when there is something to show, so there is no empty state here.
 */
export const InvoiceRequestsGroup: React.FC<InvoiceRequestsProps> = ({
  rows,
  deciding,
  onDecide,
}) => {
  const waiting = rows.filter((row) => !(row.outcome && isSettled(row.outcome))).length;
  return (
    <section aria-labelledby="billing-requests" className="space-y-3">
      <div>
        <h4
          id="billing-requests"
          className="flex flex-wrap items-center gap-2 text-sm font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900"
        >
          <Receipt className="w-4 h-4" aria-hidden="true" />
          Invoice requests
          {waiting > 0 && (
            <span className="text-xs font-bold tabular-nums px-2 py-0.5 rounded-md border border-[rgb(var(--color-border-secondary))] light:border-slate-300 text-[rgb(var(--color-text-secondary))] light:text-slate-700">
              {waiting} waiting
            </span>
          )}
        </h4>
        <p className="text-xs mt-1 text-[rgb(var(--color-text-secondary))] light:text-slate-700">
          Schools that asked to be invoiced, oldest first. Approving sends the invoice. Declining
          changes nothing in Stripe.
        </p>
      </div>
      <ul className="space-y-3">
        {rows.map(({ request, outcome }) => (
          <InvoiceRequestCard
            key={request.id}
            request={request}
            outcome={outcome}
            deciding={deciding}
            onDecide={onDecide}
          />
        ))}
      </ul>
    </section>
  );
};
