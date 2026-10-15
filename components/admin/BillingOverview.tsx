import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  RefreshCw,
  CreditCard,
  TriangleAlert,
  CircleCheck,
  CalendarClock,
  Webhook,
  Info,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  collectAttention,
  isMissingSchemaError,
  loadBillingOverview,
  withoutIncident,
  type AttentionItem,
  type BillingOverview,
  type InvoiceRequestSummary,
  type UpcomingRenewal,
  type WindowCount,
} from '../../services/billingOverviewService';
import {
  decideInvoiceRequest,
  invoiceRequestRows,
  keepSettled,
  type DecidedInvoiceRequest,
  type InvoiceDecision,
} from '../../services/invoiceDecisionService';
import { isCurriculumRemote } from '../../services/curriculumService';
import { PLAN_LABELS } from '../../services/entitlements';
import { TOOL_HEAD, TOOL_WELL, SECTION_TITLE } from '../../utils/adminChrome';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useScrollLock } from '../../hooks/useScrollLock';
import { InvoiceRequestsGroup } from './InvoiceRequests';
import BillingIncidents from './BillingIncidents';

interface BillingOverviewProps {
  isOpen: boolean;
  onClose: () => void;
}

/** How many upcoming renewals to list before saying "and N more". */
const UPCOMING_SHOWN = 12;

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

/**
 * "2 hours ago", "yesterday", "in 3 days". Measured from when the figures were
 * read, not from the clock now, so the words agree with the numbers beside them.
 */
const relativeTo = (iso: string, asOfMs: number): string => {
  const minutes = Math.round((Date.parse(iso) - asOfMs) / 60_000);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
  if (Math.abs(minutes) < 60 * 48) return rtf.format(Math.round(minutes / 60), 'hour');
  return rtf.format(Math.round(minutes / 1440), 'day');
};

const dateLabel = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

const dateTimeLabel = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

const planName = (plan: string): string =>
  plan === 'plus' || plan === 'school' ? PLAN_LABELS[plan] : 'Other plan';

const countWord = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;

/** Server messages often arrive without a full stop; a sentence bolted onto one needs it. */
const endWithStop = (text: string): string => (/[.!?]$/.test(text.trim()) ? text : `${text}.`);

/**
 * Status colour is never the only signal: every item also carries a plain-words
 * title ("Payment failing", "Over seats") and its icon, so it reads the same in
 * greyscale and to a screen reader.
 */
const TONE = {
  alert: {
    box: 'border-red-500/40 bg-red-500/10 light:bg-red-50 light:border-red-300',
    ink: 'text-red-400 light:text-red-800',
  },
  warn: {
    box: 'border-amber-500/40 bg-amber-500/10 light:bg-amber-50 light:border-amber-300',
    ink: 'text-amber-400 light:text-amber-800',
  },
} as const;

interface AttentionCopy {
  tone: keyof typeof TONE;
  title: string;
  detail: string;
}

/** The sentence for one "needs attention" item. Each claim here is one the data supports. */
const attentionCopy = (item: AttentionItem): AttentionCopy => {
  switch (item.type) {
    case 'subscription': {
      const plan = planName(item.plan);
      // `days` is null only when the webhook recorded no time at all.
      const since =
        item.days === null
          ? 'The webhook has not recorded when this changed.'
          : `Last webhook update ${rtf.format(-item.days, 'day')}.`;
      if (item.kind === 'unpaid') {
        return {
          tone: 'alert',
          title: `Unpaid · ${plan}`,
          detail: `Payment failed for good, so the plan has lapsed in the app. ${since}`,
        };
      }
      if (item.kind === 'past_due') {
        return {
          tone: 'warn',
          title: `Payment failing · ${plan}`,
          detail: `Stripe is still retrying, so access continues. ${since}`,
        };
      }
      if (item.kind === 'renewal_overdue') {
        return {
          tone: 'alert',
          title: `Renewal not recorded · ${plan}`,
          detail:
            item.days === null
              ? 'The period has ended, but the webhook still shows the old one. Check this subscription in Stripe.'
              : `The period ended ${rtf.format(-item.days, 'day')}, but the webhook still shows the old one. Check this subscription in Stripe.`,
        };
      }
      return {
        tone: 'warn',
        title: `Checkout not completed · ${plan}`,
        detail:
          item.days === null
            ? 'The first payment never completed. Stripe closes these within about a day, so the closing event was probably missed.'
            : `The first payment started ${rtf.format(-item.days, 'day')} and never completed. Stripe closes these within about a day, so the closing event was probably missed.`,
      };
    }
    case 'school':
      return {
        tone: 'warn',
        title: `Over seats · ${item.name}`,
        detail: `${countWord(item.members, 'member')} against ${countWord(item.seats, 'seat')}. Members keep the plan, but the licence needs a true-up.`,
      };
    case 'webhook':
      return {
        tone: 'warn',
        title: 'Webhook quiet',
        detail:
          item.daysSinceLast === null
            ? 'No Stripe event has been recorded, but paid subscriptions exist. Check the endpoint in Stripe, and that schema §13 is applied.'
            : `Nothing has reached the webhook for ${countWord(item.daysSinceLast, 'day')}, though paid subscriptions exist. Quiet is normal on annual plans. If you expected a renewal or a payment, check the endpoint's delivery log in Stripe.`,
      };
  }
};

const ICON_FOR: Record<AttentionItem['type'], LucideIcon> = {
  subscription: CreditCard,
  school: Users,
  webhook: Webhook,
};

const StatTile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
}> = ({ icon, label, value, sub }) => (
  <div className="p-4 rounded-xl bg-[rgb(var(--color-bg-surface-inset))] border border-[rgb(var(--color-border-secondary))] light:border-slate-200">
    <div className="t-label flex items-center gap-2 text-[rgb(var(--color-text-muted))] light:text-slate-600 mb-1.5">
      {icon}
      {label}
    </div>
    <div className="text-2xl font-black text-[rgb(var(--color-text-primary))] light:text-slate-900 tabular-nums">
      {value}
    </div>
    <div className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-600 mt-0.5">
      {sub}
    </div>
  </div>
);

const SectionHeading: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({
  icon,
  children,
}) => (
  <h3 className={`${SECTION_TITLE} mb-3 flex items-center gap-2`}>
    {icon}
    {children}
  </h3>
);

interface AttentionSectionProps {
  overview: BillingOverview;
  requestRows: ReturnType<typeof invoiceRequestRows>;
  deciding: string | null;
  onDecide: (request: InvoiceRequestSummary, decision: InvoiceDecision) => void;
  onIncidentResolved: (id: string) => void;
}

const AttentionSection: React.FC<AttentionSectionProps> = ({
  overview,
  requestRows,
  deciding,
  onDecide,
  onIncidentResolved,
}) => {
  const items = collectAttention(overview);
  // "Nothing needs attention" is only true when the purchase-order requests and the
  // billing incidents were read as well, and none of them is waiting.
  const requestsChecked = overview.requests !== null;
  const incidentsChecked = overview.incidents !== null;
  const incidentsOpen = overview.incidents?.open ?? 0;
  const allClear =
    items.length === 0 &&
    requestRows.length === 0 &&
    requestsChecked &&
    incidentsChecked &&
    incidentsOpen === 0;
  return (
    <section aria-labelledby="billing-attention">
      <SectionHeading icon={<TriangleAlert className="w-3.5 h-3.5" />}>
        <span id="billing-attention">Needs attention</span>
      </SectionHeading>
      {requestRows.length > 0 && (
        <div className="mb-6">
          <InvoiceRequestsGroup rows={requestRows} deciding={deciding} onDecide={onDecide} />
        </div>
      )}
      <BillingIncidents
        summary={overview.incidents ?? null}
        error={overview.incidentsError ?? null}
        onResolved={onIncidentResolved}
      />
      {allClear ? (
        <div className="flex gap-3 p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 light:bg-emerald-50 light:border-emerald-300">
          <CircleCheck className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400 light:text-emerald-800" />
          <p className="text-sm text-[rgb(var(--color-text-secondary))] light:text-slate-800">
            Nothing needs attention. No payment is failing, no renewal is overdue
            {overview.schools ? ', and no school is over its seats' : ''}.
          </p>
        </div>
      ) : items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item, i) => {
            const copy = attentionCopy(item);
            const Icon = ICON_FOR[item.type];
            // The one item with a Stripe reference to look up. Schools and the
            // webhook are named by their own title.
            const ref = item.type === 'subscription' ? `Subscription ${item.ref}` : null;
            return (
              <li
                key={`${item.type}-${i}`}
                className={`flex gap-3 p-3 rounded-xl border ${TONE[copy.tone].box}`}
              >
                <Icon
                  className={`w-4 h-4 mt-0.5 shrink-0 ${TONE[copy.tone].ink}`}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-900">
                    {copy.title}
                  </p>
                  <p className="text-xs text-[rgb(var(--color-text-secondary))] light:text-slate-700 mt-0.5">
                    {copy.detail}
                  </p>
                  {ref && (
                    <p className="text-xs font-mono text-[rgb(var(--color-text-muted))] light:text-slate-600 mt-1 break-all">
                      {ref}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {!requestsChecked && (
        <p className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-600 mt-2">
          Invoice requests were not checked:{' '}
          {endWithStop(overview.requestsError ?? 'Unknown error')}
          {isMissingSchemaError(overview.requestsError ?? '')
            ? ' The purchase-order table is not in this database yet. Apply the purchase-order section of supabase/schema.sql (§27), then refresh.'
            : ''}
        </p>
      )}
      {overview.schoolsError && (
        <p className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-600 mt-2">
          School seats were not checked: {overview.schoolsError}
        </p>
      )}
    </section>
  );
};

const ActiveSection: React.FC<{ overview: BillingOverview }> = ({ overview }) => {
  const { live } = overview.subscriptions;
  return (
    <section aria-labelledby="billing-active">
      <SectionHeading icon={<Users className="w-3.5 h-3.5" />}>
        <span id="billing-active">Active now</span>
      </SectionHeading>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          icon={<CreditCard className="w-3.5 h-3.5" />}
          label="Subscriptions"
          value={live.total}
          sub={`${live.byPlan.plus} Plus, ${live.byPlan.school} school licence${live.byPlan.school === 1 ? '' : 's'}`}
        />
        <StatTile
          icon={<Users className="w-3.5 h-3.5" />}
          label="Paid seats"
          value={live.seats}
          sub={`${live.seatsByPlan.plus} Plus, ${live.seatsByPlan.school} School`}
        />
        <StatTile
          icon={<CalendarClock className="w-3.5 h-3.5" />}
          label="Ending"
          value={live.endingAtPeriodEnd}
          sub="set to lapse at period end"
        />
        <StatTile
          icon={<TriangleAlert className="w-3.5 h-3.5" />}
          label="Past due"
          value={live.pastDue}
          sub="in Stripe's retries"
        />
      </div>
      {live.total === 0 && (
        <p className="text-sm text-[rgb(var(--color-text-secondary))] light:text-slate-700 mt-3">
          No paying subscriptions yet. They appear here once a checkout completes.
        </p>
      )}
    </section>
  );
};

const WindowLine: React.FC<{ label: string; counts: WindowCount }> = ({ label, counts }) => (
  <p className="text-sm text-[rgb(var(--color-text-secondary))] light:text-slate-700">
    <span className="font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900">
      {label}:
    </span>{' '}
    {counts.renews} renewing, {counts.ends} ending.
  </p>
);

const UpcomingRow: React.FC<{ item: UpcomingRenewal }> = ({ item }) => (
  <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5 border-b border-[rgb(var(--color-border-secondary))] light:border-slate-200 last:border-b-0">
    <span className="w-32 shrink-0 text-sm font-bold tabular-nums text-[rgb(var(--color-text-primary))] light:text-slate-900">
      {dateLabel(item.endsAt)}
    </span>
    <span className="text-sm text-[rgb(var(--color-text-secondary))] light:text-slate-700">
      {item.willEnd ? (
        <span className="text-amber-400 light:text-amber-800 font-bold">Ends</span>
      ) : (
        <span className="text-emerald-400 light:text-emerald-800 font-bold">Renews</span>
      )}{' '}
      {rtf.format(item.daysUntil, 'day')}
    </span>
    <span className="text-sm text-[rgb(var(--color-text-secondary))] light:text-slate-700">
      {planName(item.plan)}, {countWord(item.seats, 'seat')}
    </span>
    <span className="text-xs font-mono text-[rgb(var(--color-text-muted))] light:text-slate-600">
      {item.ref}
    </span>
  </li>
);

const ComingUpSection: React.FC<{ overview: BillingOverview }> = ({ overview }) => {
  const { upcoming } = overview.subscriptions;
  const shown = upcoming.list.slice(0, UPCOMING_SHOWN);
  const hidden = upcoming.list.length - shown.length;
  return (
    <section aria-labelledby="billing-coming">
      <SectionHeading icon={<CalendarClock className="w-3.5 h-3.5" />}>
        <span id="billing-coming">Coming up</span>
      </SectionHeading>
      <div className="space-y-1">
        <WindowLine label="Next 7 days" counts={upcoming.next7} />
        <WindowLine label="Next 30 days" counts={upcoming.next30} />
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-[rgb(var(--color-text-secondary))] light:text-slate-700 mt-3">
          Nothing renews or ends in the next 30 days.
        </p>
      ) : (
        <>
          <ul className="mt-3">
            {shown.map((item) => (
              <UpcomingRow key={`${item.ref}-${item.endsAt}`} item={item} />
            ))}
          </ul>
          {hidden > 0 && (
            <p className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-600 mt-2">
              And {hidden} more in the next 30 days.
            </p>
          )}
        </>
      )}
    </section>
  );
};

const WebhookSection: React.FC<{ overview: BillingOverview; asOfMs: number }> = ({
  overview,
  asOfMs,
}) => {
  const { webhook, recentEvents } = overview;
  return (
    <section aria-labelledby="billing-webhook">
      <SectionHeading icon={<Webhook className="w-3.5 h-3.5" />}>
        <span id="billing-webhook">Recent webhook activity</span>
      </SectionHeading>
      <p className="text-sm text-[rgb(var(--color-text-secondary))] light:text-slate-700">
        {webhook.lastReceivedAt
          ? `Last event ${relativeTo(webhook.lastReceivedAt, asOfMs)}, ${dateTimeLabel(webhook.lastReceivedAt)}.`
          : 'No events recorded yet.'}
      </p>
      {recentEvents.length > 0 && (
        <ul className="mt-3">
          {recentEvents.map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 py-2 border-b border-[rgb(var(--color-border-secondary))] light:border-slate-200 last:border-b-0"
            >
              <span className="text-xs font-mono break-all text-[rgb(var(--color-text-primary))] light:text-slate-900">
                {e.type}
              </span>
              <span className="text-xs tabular-nums text-[rgb(var(--color-text-muted))] light:text-slate-600">
                {dateTimeLabel(e.received_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-600 mt-3">
        Only events the webhook accepted are listed. A delivery it rejected, or could not process,
        shows in Stripe's webhook log instead.
      </p>
    </section>
  );
};

const BillingOverviewDialog: React.FC<BillingOverviewProps> = ({ isOpen, onClose }) => {
  const remote = isCurriculumRemote();
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Each load takes a number; only the newest may write. Without this a slow
  // first read could land after a refresh and show figures from before it.
  const requestRef = useRef(0);
  // The answers to decisions made in this window, and the one decision call in
  // flight. Only one may be out at a time, so two approvals cannot race each other.
  const [decided, setDecided] = useState<Record<string, DecidedInvoiceRequest>>({});
  const [deciding, setDeciding] = useState<string | null>(null);
  const decidingRef = useRef(false);

  // A resolved incident leaves the page's copy at once, so the tally and the list agree
  // before the next read.
  const resolveIncident = useCallback((id: string) => {
    setOverview((prev) =>
      prev && prev.incidents ? { ...prev, incidents: withoutIncident(prev.incidents, id) } : prev
    );
  }, []);

  // A call in flight is not dismissed: closing would drop its answer, and the
  // answer may be an invoice that has just been sent.
  useEscapeKey(isOpen && deciding === null, onClose);
  useScrollLock(isOpen);

  const load = useCallback(async () => {
    const id = ++requestRef.current;
    setLoading(true);
    try {
      const next = await loadBillingOverview();
      if (id !== requestRef.current) return;
      setOverview(next);
      setError(null);
      // A fresh read is the server's word on refused and unknown answers, so those
      // are dropped. Approved and declined stay, so the window does not lose them.
      setDecided((prev) => keepSettled(prev));
    } catch (e) {
      if (id !== requestRef.current) return;
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      if (id === requestRef.current) setLoading(false);
    }
  }, []);

  const decide = useCallback(async (request: InvoiceRequestSummary, decision: InvoiceDecision) => {
    if (decidingRef.current) return;
    decidingRef.current = true;
    setDeciding(request.id);
    const outcome = await decideInvoiceRequest(request.id, decision);
    decidingRef.current = false;
    setDecided((prev) => ({ ...prev, [request.id]: { request, outcome } }));
    setDeciding(null);
  }, []);

  useEffect(() => {
    if (isOpen && remote) load();
  }, [isOpen, remote, load]);

  // The answers belong to one opening of the window. Reopening reads the server again.
  useEffect(() => {
    if (!isOpen) setDecided((prev) => (Object.keys(prev).length > 0 ? {} : prev));
  }, [isOpen]);

  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);

  if (!isOpen) return null;

  const requestRows = invoiceRequestRows(overview?.requests ?? [], decided);

  const schemaMissing = error !== null && isMissingSchemaError(error);
  const asOfMs = overview ? Date.parse(overview.asOf) : Date.now();

  let body: React.ReactNode;
  if (!remote) {
    body = (
      <div className="text-center py-16">
        <Info className="w-12 h-12 text-[rgb(var(--color-text-muted))] mx-auto mb-3" />
        <p className="text-[rgb(var(--color-text-secondary))] light:text-slate-600 font-medium">
          Billing needs Supabase.
        </p>
        <p className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-600 max-w-sm mx-auto mt-1">
          In local mode there are no subscriptions to read. Configure the Supabase variables to see
          them here.
        </p>
      </div>
    );
  } else if (!overview && error) {
    body = (
      <div className={`p-5 rounded-xl ${TOOL_WELL} text-center`}>
        <p className="font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-900">
          {schemaMissing
            ? 'The billing tables are not in this database yet.'
            : 'Could not load billing data.'}
        </p>
        <p className="text-sm text-[rgb(var(--color-text-secondary))] light:text-slate-700 mt-1">
          {schemaMissing
            ? 'Apply the Stripe billing section of supabase/schema.sql (§13), then try again.'
            : `${endWithStop(error)} This screen only reads billing data, so nothing has been changed.`}
        </p>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="mt-4 min-h-[44px] sm:min-h-0 px-4 py-2 rounded-lg text-sm font-bold bg-[rgb(var(--color-bg-surface-light))] light:bg-slate-200 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-300 text-[rgb(var(--color-text-primary))] light:text-slate-900 disabled:opacity-50 transition-all"
        >
          Try again
        </button>
      </div>
    );
  } else if (!overview) {
    // A plain line, not the shared LoadingIndicator: its card is built to stand
    // alone on the page, and inside this paper dialog it reads as a white box.
    body = (
      <div
        role="status"
        className="h-48 flex items-center justify-center gap-3 text-sm text-[rgb(var(--color-text-secondary))] light:text-slate-700"
      >
        <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
        Loading billing data…
      </div>
    );
  } else {
    body = (
      <>
        {error && (
          <p
            role="alert"
            className="text-sm text-red-400 light:text-red-800 p-3 rounded-lg border border-red-500/40 bg-red-500/10 light:bg-red-50 light:border-red-300"
          >
            The refresh failed: {endWithStop(error)} The figures below were read{' '}
            {relativeTo(overview.asOf, Date.now())}.
          </p>
        )}
        {!overview.stripeConfigured && (
          <div className={`flex gap-3 p-4 rounded-xl ${TOOL_WELL}`}>
            <Info className="w-4 h-4 mt-0.5 shrink-0 text-[rgb(var(--color-text-muted))] light:text-slate-600" />
            <p className="text-sm text-[rgb(var(--color-text-secondary))] light:text-slate-700">
              Stripe is not configured in this build, so no plan can be bought here. The figures
              below are whatever the database already holds.
            </p>
          </div>
        )}
        <AttentionSection
          overview={overview}
          requestRows={requestRows}
          deciding={deciding}
          onDecide={decide}
          onIncidentResolved={resolveIncident}
        />
        <ActiveSection overview={overview} />
        <ComingUpSection overview={overview} />
        <WebhookSection overview={overview} asOfMs={asOfMs} />
        <p className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-600">
          Revenue is not shown. The app's display prices are not Stripe amounts, so a total would be
          a guess.
        </p>
      </>
    );
  }

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Billing overview"
      className="fixed inset-0 z-modal-elevated bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={deciding === null ? onClose : undefined}
    >
      <div
        className="bg-[rgb(var(--color-bg-surface))] rounded-2xl shadow-lg w-full max-w-4xl border border-[rgb(var(--color-border-secondary))] light:border-slate-300 clip-stable animate-fade-in-up overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`px-5 sm:px-6 py-5 border-b border-[rgb(var(--color-border-secondary))] light:border-slate-200 ${TOOL_HEAD} flex items-center justify-between gap-3`}
        >
          <div className="flex items-center gap-3 min-w-0">
            {/* Decorative on a phone: the words need the width more than the tile. */}
            <div className="hidden sm:flex w-12 h-12 shrink-0 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg items-center justify-center">
              <CreditCard className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900">
                Billing overview
              </h2>
              <p className="text-sm text-[rgb(var(--color-text-muted))] light:text-slate-600">
                Who pays, what needs a decision, and whether Stripe is reaching the app
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={load}
              disabled={loading || !remote || deciding !== null}
              aria-label="Refresh"
              title={
                overview
                  ? `Read again (last read ${relativeTo(overview.asOf, Date.now())})`
                  : 'Refresh'
              }
              className="w-11 h-11 sm:w-9 sm:h-9 shrink-0 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-200 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-300 transition-all flex items-center justify-center disabled:opacity-50"
            >
              <RefreshCw
                className={`w-4 h-4 text-[rgb(var(--color-text-muted))] ${loading ? 'animate-spin' : ''}`}
              />
            </button>
            <button
              onClick={onClose}
              disabled={deciding !== null}
              aria-label="Close"
              className="w-11 h-11 sm:w-9 sm:h-9 shrink-0 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-200 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-300 transition-all flex items-center justify-center disabled:opacity-50"
            >
              <X className="w-4 h-4 text-[rgb(var(--color-text-muted))]" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 custom-scrollbar space-y-6">
          {body}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default BillingOverviewDialog;
