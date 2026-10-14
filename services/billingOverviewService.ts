/**
 * The admin Billing overview: who pays, what needs a decision, and whether
 * Stripe is still reaching the app (schema §13).
 *
 * Read-only. Nothing here moves money or changes a plan; the webhook owns every
 * write. The one write the overview can start, approving or declining a
 * purchase-order request, is in `invoiceDecisionService.ts` and goes through
 * api/issue-invoice.ts. The reads need no new database function: admins already
 * read every subscription row ("Admins read all subscriptions"), reviewers read
 * the webhook ledger, and admins read every purchase-order request
 * ("Admins read all licence requests", schema §27). The one thing a plain select
 * cannot do is get past PostgREST's row cap, so the big reads go through
 * `fetchAllRows`.
 *
 * Money is deliberately absent. The display prices in `entitlements.ts` are
 * presentation strings, not Stripe amounts, and a total built from them would
 * read as a figure from Stripe. Revenue needs a price source of truth first.
 *
 * The counting lives in pure functions so the unit tests can drive them with
 * fixtures and no database.
 */
import { supabase, fetchAllRows } from './supabaseClient';
import { fetchSchools, LIVE_LICENCE_STATUSES, type SchoolRow } from './quotaService';
import { STRIPE_PRICE_IDS } from './entitlements';

const DAY_MS = 86_400_000;

/**
 * A renewal is "overdue" once its period has ended this long ago and the webhook
 * still shows the old period. Stripe retries a failed webhook delivery for up to
 * three days, so inside that window a late renewal is not yet a fault.
 */
export const RENEWAL_GRACE_DAYS = 4;

/**
 * `incomplete` is a first payment waiting on the customer (often a 3-D Secure
 * step). Stripe closes it after about a day, so one still open after this long
 * is a closing event the webhook did not hear.
 */
export const STALLED_CHECKOUT_DAYS = 1;

/**
 * Silence this long, with paid subscriptions on the books, is worth a look. It is
 * deliberately conservative: a deployment that sells only annual plans can be
 * quiet for months and still be healthy, so the wording says so.
 */
export const WEBHOOK_SILENT_DAYS = 45;

export const UPCOMING_WINDOW_DAYS = 30;
export const RECENT_EVENT_LIMIT = 10;

/**
 * A purchase-order request waiting longer than this many working days is flagged.
 * Working days are Monday to Friday; NSW public holidays are not excluded, so a
 * request over a long weekend can be flagged a day early.
 */
export const INVOICE_WAIT_WORKING_DAYS = 3;

const REQUEST_COLUMNS =
  'id, school_id, seats, billing_name, billing_email, billing_address, abn, po_number, note, created_at, stripe_subscription_id, schools(name)';

/** Statuses under which a subscription still grants its plan (matches resolve_stripe_plan). */
const PAID_SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due'];

/** Every status the overview reads: the paid ones, plus the ones that need a decision. */
const READ_SUBSCRIPTION_STATUSES = [...PAID_SUBSCRIPTION_STATUSES, 'unpaid', 'incomplete'];

const SUBSCRIPTION_COLUMNS =
  'id, status, plan, seats, current_period_end, cancel_at_period_end, updated_at, last_event_at';

export interface BillingSubscriptionRow {
  /** Stripe subscription id (sub_...). Never shown in full; see `shortSubscriptionRef`. */
  id: string;
  status: string;
  plan: string;
  seats: number;
  current_period_end: string;
  cancel_at_period_end: boolean;
  updated_at: string | null;
  last_event_at: string | null;
}

export interface BillingEventRow {
  id: string;
  type: string;
  received_at: string;
}

export type PlanBucket = 'plus' | 'school' | 'other';

export type SubscriptionAttentionKind = 'unpaid' | 'past_due' | 'renewal_overdue' | 'incomplete';

export interface SubscriptionAttention {
  kind: SubscriptionAttentionKind;
  ref: string;
  plan: string;
  seats: number;
  /**
   * When the state began, as far as the webhook can say (ISO). For `past_due`
   * this is the last webhook update, which a retry can move forward, so it is
   * labelled as such rather than as the first failure.
   */
  since: string | null;
  /** Whole days since `since`; null when the webhook has not recorded a time. */
  days: number | null;
}

export interface UpcomingRenewal {
  ref: string;
  plan: string;
  seats: number;
  /** When the current period ends (ISO). */
  endsAt: string;
  /** Whole days until it ends; 0 is today. */
  daysUntil: number;
  /** True when the subscription is set to cancel: the licence lapses rather than renews. */
  willEnd: boolean;
}

export interface WindowCount {
  renews: number;
  ends: number;
}

export interface SubscriptionSummary {
  live: {
    total: number;
    byPlan: Record<PlanBucket, number>;
    seats: number;
    seatsByPlan: Record<PlanBucket, number>;
    pastDue: number;
    endingAtPeriodEnd: number;
  };
  attention: SubscriptionAttention[];
  upcoming: {
    next7: WindowCount;
    next30: WindowCount;
    /** Every renewal or ending in the next 30 days, soonest first. */
    list: UpcomingRenewal[];
  };
}

export interface SchoolSeatIssue {
  name: string;
  members: number;
  seats: number;
}

export interface WebhookSummary {
  lastReceivedAt: string | null;
  daysSinceLast: number | null;
  /** Paid subscriptions exist, and nothing has been recorded for `WEBHOOK_SILENT_DAYS`, or ever. */
  silent: boolean;
}

/** A `licence_requests` row as the overview reads it, with the school's name joined on. */
export interface InvoiceRequestRow {
  id: string;
  school_id: string;
  seats: number;
  billing_name: string;
  billing_email: string;
  billing_address: {
    line1?: string;
    line2?: string | null;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
  } | null;
  abn: string | null;
  po_number: string | null;
  note: string | null;
  created_at: string;
  stripe_subscription_id: string | null;
  schools: { name: string } | null;
}

/** A pending purchase-order request, as the approval queue shows it. */
export interface InvoiceRequestSummary {
  id: string;
  schoolName: string;
  seats: number;
  billingName: string;
  billingEmail: string;
  /** One line, in the order it prints on the invoice. */
  billingAddress: string;
  /** Printed as "51 824 753 556". Null when the request had none. */
  abn: string | null;
  poNumber: string | null;
  note: string | null;
  /** When the request arrived (ISO). */
  requestedAt: string;
  /** Working days since it arrived, in Sydney time. 0 is the day it came in. */
  workingDaysWaited: number;
  /** Waiting longer than `INVOICE_WAIT_WORKING_DAYS`. */
  overdue: boolean;
  /**
   * A Stripe subscription an earlier, part-finished approval already made for
   * this request. Approving again reuses it rather than making a second one, so
   * the queue shows the id and says so.
   */
  subscriptionId: string | null;
}

export interface BillingOverview {
  asOf: string;
  stripeConfigured: boolean;
  subscriptions: SubscriptionSummary;
  /** null when the school seat check could not run (see `schoolsError`). */
  schools: SchoolSeatIssue[] | null;
  schoolsError: string | null;
  /** Pending purchase-order requests, oldest first. null when they could not be read (see `requestsError`). */
  requests: InvoiceRequestSummary[] | null;
  requestsError: string | null;
  webhook: WebhookSummary;
  recentEvents: BillingEventRow[];
}

/** One line of the "Needs attention" list. */
export type AttentionItem =
  | ({ type: 'subscription' } & SubscriptionAttention)
  | ({ type: 'school' } & SchoolSeatIssue)
  | { type: 'webhook'; daysSinceLast: number | null; lastReceivedAt: string | null };

/** Opaque, and enough to find the subscription in Stripe. Not a person's identity. */
export const shortSubscriptionRef = (id: string): string =>
  id.length > 12 ? `${id.slice(0, 4)}…${id.slice(-6)}` : id;

const planBucket = (plan: string): PlanBucket =>
  plan === 'plus' || plan === 'school' ? plan : 'other';

/** Whole days from `fromMs` to `toMs`, rounded down (negative when `toMs` is earlier). */
const wholeDays = (fromMs: number, toMs: number): number => Math.floor((toMs - fromMs) / DAY_MS);

const parseMs = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
};

/** Most serious first. Within a kind, the longest-standing comes first. */
const ATTENTION_WEIGHT: Record<SubscriptionAttentionKind, number> = {
  unpaid: 0,
  renewal_overdue: 1,
  past_due: 2,
  incomplete: 3,
};

/**
 * Count live subscriptions, collect the ones that need a decision, and list what
 * renews or ends in the coming month. Pure: pass `now` in so a test can pin it.
 */
export const summariseSubscriptions = (
  rows: BillingSubscriptionRow[],
  now: Date
): SubscriptionSummary => {
  const nowMs = now.getTime();
  const live: SubscriptionSummary['live'] = {
    total: 0,
    byPlan: { plus: 0, school: 0, other: 0 },
    seats: 0,
    seatsByPlan: { plus: 0, school: 0, other: 0 },
    pastDue: 0,
    endingAtPeriodEnd: 0,
  };
  const attention: SubscriptionAttention[] = [];
  const upcomingList: UpcomingRenewal[] = [];
  const next7: WindowCount = { renews: 0, ends: 0 };
  const next30: WindowCount = { renews: 0, ends: 0 };

  for (const row of rows) {
    const ref = shortSubscriptionRef(row.id);
    const bucket = planBucket(row.plan);
    const endMs = parseMs(row.current_period_end);
    const sinceIso = row.last_event_at ?? row.updated_at;
    const sinceMs = parseMs(sinceIso);
    const sinceDays = sinceMs === null ? null : wholeDays(sinceMs, nowMs);
    const flag = (kind: SubscriptionAttentionKind, since: string | null, days: number | null) =>
      attention.push({ kind, ref, plan: row.plan, seats: row.seats, since, days });

    if (PAID_SUBSCRIPTION_STATUSES.includes(row.status)) {
      live.total += 1;
      live.byPlan[bucket] += 1;
      live.seats += row.seats;
      live.seatsByPlan[bucket] += row.seats;
      if (row.status === 'past_due') live.pastDue += 1;
      if (row.cancel_at_period_end) live.endingAtPeriodEnd += 1;

      if (endMs !== null) {
        const untilMs = endMs - nowMs;
        if (untilMs > 0 && untilMs <= UPCOMING_WINDOW_DAYS * DAY_MS) {
          upcomingList.push({
            ref,
            plan: row.plan,
            seats: row.seats,
            endsAt: new Date(endMs).toISOString(),
            daysUntil: wholeDays(nowMs, endMs),
            willEnd: row.cancel_at_period_end,
          });
          const kind = row.cancel_at_period_end ? 'ends' : 'renews';
          next30[kind] += 1;
          if (untilMs <= 7 * DAY_MS) next7[kind] += 1;
        }
      }
    }

    if (row.status === 'unpaid') {
      flag('unpaid', sinceIso, sinceDays);
    } else if (row.status === 'past_due') {
      flag('past_due', sinceIso, sinceDays);
    } else if (row.status === 'incomplete') {
      // Only a checkout the webhook has timed can be called stalled.
      if (sinceDays !== null && sinceDays >= STALLED_CHECKOUT_DAYS) {
        flag('incomplete', sinceIso, sinceDays);
      }
    } else if (
      (row.status === 'active' || row.status === 'trialing') &&
      endMs !== null &&
      nowMs - endMs > RENEWAL_GRACE_DAYS * DAY_MS
    ) {
      // The period has ended and the webhook still shows the old one: a renewal
      // or a cancellation did not reach us, so the record, and the access it
      // grants, cannot be trusted until Stripe is checked.
      flag('renewal_overdue', row.current_period_end, wholeDays(endMs, nowMs));
    }
  }

  attention.sort(
    (a, b) => ATTENTION_WEIGHT[a.kind] - ATTENTION_WEIGHT[b.kind] || (b.days ?? -1) - (a.days ?? -1)
  );
  upcomingList.sort((a, b) => a.endsAt.localeCompare(b.endsAt));

  return {
    live,
    attention,
    upcoming: { next7, next30, list: upcomingList },
  };
};

/**
 * School licences whose members outnumber the seats they pay for. Only live
 * licences count: a lapsed one has no seats in use to question.
 */
export const summariseSchools = (rows: SchoolRow[]): SchoolSeatIssue[] =>
  rows
    .filter(
      (s) =>
        LIVE_LICENCE_STATUSES.includes(s.plan_status ?? '') &&
        (s.plan_seats ?? 0) > 0 &&
        s.members > (s.plan_seats ?? 0)
    )
    .map((s) => ({ name: s.name, members: s.members, seats: s.plan_seats ?? 0 }))
    .sort((a, b) => b.members - b.seats - (a.members - a.seats));

/**
 * Whether Stripe is still reaching the app. `events` may arrive in any order; the
 * newest is taken as the maximum, so a reordered page cannot hide it.
 */
export const summariseWebhook = (
  events: BillingEventRow[],
  paidSubscriptionCount: number,
  now: Date
): WebhookSummary => {
  let latestMs: number | null = null;
  let latestIso: string | null = null;
  for (const e of events) {
    const ms = parseMs(e.received_at);
    if (ms !== null && (latestMs === null || ms > latestMs)) {
      latestMs = ms;
      latestIso = e.received_at;
    }
  }
  const daysSinceLast = latestMs === null ? null : wholeDays(latestMs, now.getTime());
  return {
    lastReceivedAt: latestIso,
    daysSinceLast,
    silent:
      paidSubscriptionCount > 0 && (daysSinceLast === null || daysSinceLast >= WEBHOOK_SILENT_DAYS),
  };
};

const sydneyDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Australia/Sydney',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Working days from `fromMs` to `toMs`, counted as calendar days in Sydney time.
 * A day is counted when it is a Monday to Friday and comes after the day the
 * request arrived, so a request made on Monday and read on Thursday has waited
 * three working days. Sydney time, not the viewer's, so an admin in another
 * timezone sees the same number. Zero when `toMs` is not after `fromMs`.
 */
export const workingDaysBetween = (fromMs: number, toMs: number): number => {
  const dayStamp = (ms: number): number => {
    const [y, m, d] = sydneyDay.format(ms).split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const end = dayStamp(toMs);
  let count = 0;
  for (let day = dayStamp(fromMs) + DAY_MS; day <= end; day += DAY_MS) {
    const weekday = new Date(day).getUTCDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
  }
  return count;
};

/** "51 824 753 556" from the eleven stored digits. Anything else is shown as stored. */
export const formatAbn = (abn: string | null): string | null => {
  if (!abn) return null;
  return /^\d{11}$/.test(abn) ? abn.replace(/^(\d{2})(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3 $4') : abn;
};

/** The billing address on one line, in the order it prints on the invoice. */
const addressLine = (address: InvoiceRequestRow['billing_address']): string => {
  if (!address) return 'No address recorded';
  const locality = [address.city, address.state, address.postcode].filter(Boolean).join(' ');
  return [address.line1, address.line2, locality].filter(Boolean).join(', ');
};

/**
 * The pending queue, oldest first, so the request that has waited longest is the
 * one at the top. Pure: `now` is passed in so a test can pin the working days.
 */
export const summariseRequests = (
  rows: InvoiceRequestRow[],
  now: Date
): InvoiceRequestSummary[] => {
  const nowMs = now.getTime();
  return rows
    .map((row) => ({ row, arrivedMs: parseMs(row.created_at) ?? nowMs }))
    .sort((a, b) => a.arrivedMs - b.arrivedMs || a.row.id.localeCompare(b.row.id))
    .map(({ row, arrivedMs }) => {
      const workingDaysWaited = workingDaysBetween(arrivedMs, nowMs);
      return {
        id: row.id,
        schoolName: row.schools?.name ?? 'School name not available',
        seats: row.seats,
        billingName: row.billing_name,
        billingEmail: row.billing_email,
        billingAddress: addressLine(row.billing_address),
        abn: formatAbn(row.abn),
        poNumber: row.po_number?.trim() || null,
        note: row.note?.trim() || null,
        requestedAt: row.created_at,
        workingDaysWaited,
        overdue: workingDaysWaited > INVOICE_WAIT_WORKING_DAYS,
        subscriptionId: row.stripe_subscription_id,
      };
    });
};

/**
 * The one list the overview leads with: subscriptions that need a decision, then
 * over-seat schools, then a silent webhook. Each group keeps its own order.
 * Purchase-order requests are not in it: they have their own group, which the
 * page puts above this list and which carries its own buttons.
 */
export const collectAttention = (
  overview: Pick<BillingOverview, 'subscriptions' | 'schools' | 'webhook'>
): AttentionItem[] => {
  const items: AttentionItem[] = overview.subscriptions.attention.map((a) => ({
    type: 'subscription',
    ...a,
  }));
  for (const school of overview.schools ?? []) {
    items.push({ type: 'school', ...school });
  }
  if (overview.webhook.silent) {
    items.push({
      type: 'webhook',
      daysSinceLast: overview.webhook.daysSinceLast,
      lastReceivedAt: overview.webhook.lastReceivedAt,
    });
  }
  return items;
};

/**
 * PostgREST's "that table is not here" (PGRST205 from the schema cache, or
 * Postgres' 42P01). `fetchAllRows` folds the code into its message, so the test is
 * on the text. The two need different words: this deployment has not applied
 * schema §13 yet, which is not the same as a failed read.
 */
export const isMissingSchemaError = (message: string): boolean =>
  /schema cache|does not exist|could not find the table/i.test(message);

/** Stripe is wired into this build when at least one price is configured. */
const stripeConfiguredInBuild = (): boolean => Object.values(STRIPE_PRICE_IDS).some(Boolean);

const loadRecentEvents = async (
  client: NonNullable<typeof supabase>
): Promise<BillingEventRow[]> => {
  const { data, error } = await client
    .from('stripe_events')
    .select('id, type, received_at')
    .order('received_at', { ascending: false })
    .limit(RECENT_EVENT_LIMIT);
  if (error) throw new Error(`Could not load webhook events: ${error.message}`);
  return (data ?? []) as BillingEventRow[];
};

/**
 * The purchase-order requests still waiting for a decision. Every pending row
 * is read, not a page of them, because a request left unseen is the thing the
 * queue exists to prevent.
 */
const loadPendingRequests = (client: NonNullable<typeof supabase>): Promise<InvoiceRequestRow[]> =>
  fetchAllRows<InvoiceRequestRow>(
    () => client.from('licence_requests').select(REQUEST_COLUMNS).eq('status', 'pending'),
    'Could not load invoice requests'
  );

/**
 * Fetch and summarise everything the overview shows. Subscriptions and webhook
 * events are required: without them there is nothing honest to show, so their
 * failure fails the whole load. School seats (schema §12) and purchase-order
 * requests (schema §27) are optional extras, so their failure is reported beside
 * their own section rather than instead of the whole page. A database that has
 * not had §27 applied yet must still show its subscriptions.
 */
export const loadBillingOverview = async (now: Date = new Date()): Promise<BillingOverview> => {
  const client = supabase;
  if (!client) throw new Error('Supabase is not configured.');

  const [subscriptionRows, recentEvents, schoolResult, requestResult] = await Promise.all([
    fetchAllRows<BillingSubscriptionRow>(
      () =>
        client
          .from('subscriptions')
          .select(SUBSCRIPTION_COLUMNS)
          .in('status', READ_SUBSCRIPTION_STATUSES),
      'Could not load subscriptions'
    ),
    loadRecentEvents(client),
    fetchSchools().then(
      (rows) => ({ rows, error: null as string | null }),
      (e: unknown) => ({
        rows: null as SchoolRow[] | null,
        error: e instanceof Error ? e.message : 'Could not load schools.',
      })
    ),
    loadPendingRequests(client).then(
      (rows) => ({ rows, error: null as string | null }),
      (e: unknown) => ({
        rows: null as InvoiceRequestRow[] | null,
        error: e instanceof Error ? e.message : 'Could not load invoice requests.',
      })
    ),
  ]);

  const subscriptions = summariseSubscriptions(subscriptionRows, now);
  const webhook = summariseWebhook(recentEvents, subscriptions.live.total, now);

  return {
    asOf: now.toISOString(),
    stripeConfigured: stripeConfiguredInBuild(),
    subscriptions,
    schools: schoolResult.rows ? summariseSchools(schoolResult.rows) : null,
    schoolsError: schoolResult.error,
    requests: requestResult.rows ? summariseRequests(requestResult.rows, now) : null,
    requestsError: requestResult.error,
    webhook,
    recentEvents,
  };
};
