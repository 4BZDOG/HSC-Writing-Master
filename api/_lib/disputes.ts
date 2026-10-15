/**
 * Payment disputes (chargebacks) and full refunds: the webhook's two findings that a
 * person has to act on in the Stripe Dashboard (schema §13 and §29).
 *
 * The policy is fixed. Nothing is cancelled, refunded or re-planned automatically:
 * the webhook records an incident and alerts the operator, and never writes the plan
 * or licence tables. A dispute has a hard deadline for the evidence, so its alert
 * states the deadline. An operator who learns of a dispute only from Stripe's email
 * can miss it.
 *
 * Best effort, like the rest of the webhook's billing code. A failed lookup records
 * the incident with whatever is known, and never fails the event, or Stripe would
 * redeliver an event that has already been applied in part. The one exception is a
 * failed write that closes an incident: it throws, so Stripe retries the close.
 */
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { recordIncident } from './billingIncidents';
import { notifyOperator, type OperatorAlert } from './operatorAlert';

type SB = SupabaseClient;
type Obj = Record<string, unknown>;
type IncidentKind = 'dispute' | 'refund';

/** The most detail an incident keeps (the check on billing_incidents.detail). */
const DETAIL_MAX = 1000;

const NOTHING_CHANGED = 'Nothing has been cancelled, refunded or changed.';
const ACCESS_UNCHANGED =
  'Access is unchanged. Cancel the subscription in Stripe if this refund ends the licence.';
const OPEN_BILLING = 'Open Admin → Billing overview.';

/** Who a dispute or refund belongs to, as far as the database can say. */
interface Owner {
  userId?: string;
  schoolId?: string;
}

/** Stripe's amounts are in the smallest unit. Intl says how many digits the currency has. */
export const formatAmount = (minor: number, currency: string): string => {
  const code = currency.toUpperCase();
  try {
    const format = new Intl.NumberFormat('en-AU', { style: 'currency', currency: code });
    const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
    return format.format(minor / 10 ** digits);
  } catch {
    return `${(minor / 100).toFixed(2)} ${code}`;
  }
};

/** A Stripe timestamp as an Australian date, such as "3 November 2026", in Sydney time. */
export const formatDueDate = (unixSeconds: number): string =>
  new Date(unixSeconds * 1000).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Australia/Sydney',
  });

/** A Stripe id, whether the field came back as the id or as an expanded object. */
const idOf = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value;
  const id = (value as { id?: unknown } | null | undefined)?.id;
  return typeof id === 'string' ? id : undefined;
};

/** The error's message, for a log line. Never the whole object: it can carry request detail. */
const errorText = (e: unknown): string => {
  if (e instanceof Error) return e.message;
  const message = (e as { message?: unknown } | null | undefined)?.message;
  return typeof message === 'string' ? message : String(e);
};

/** Adds a line to an open incident's detail. The new line stays whole; the older text gives way. */
const appendDetail = (current: string, line: string): string => {
  const joined = `${current} ${line}`;
  if (joined.length <= DETAIL_MAX) return joined;
  const kept = current.slice(0, Math.max(0, DETAIL_MAX - line.length - 1));
  return `${kept} ${line}`.slice(0, DETAIL_MAX);
};

/**
 * The Stripe customer behind a charge. A failed retrieve is logged and leaves the
 * customer unknown: the incident is still recorded, just without an owner.
 */
const customerOfCharge = async (
  stripe: Stripe,
  chargeId: string | undefined
): Promise<string | undefined> => {
  if (!chargeId) return undefined;
  try {
    const charge = await stripe.charges.retrieve(chargeId);
    return idOf(charge.customer);
  } catch (e) {
    console.warn(
      '[stripe-webhook] could not read the charge for a dispute; recording it without the customer:',
      errorText(e)
    );
    return undefined;
  }
};

/**
 * Who a Stripe customer belongs to: the profile linked to it, and the school whose
 * licence it bought. The school is found through the licence, not the purchaser's
 * current school, for the reason the subscription sync gives (a teacher can move
 * school). Each lookup fails on its own and leaves the other one unset.
 */
const ownerOfCustomer = async (supabase: SB, customerId: string | undefined): Promise<Owner> => {
  const owner: Owner = {};
  if (!customerId) return owner;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
    if (error) throw error;
    if (data?.id) owner.userId = data.id as string;
  } catch (e) {
    console.warn('[stripe-webhook] dispute owner lookup (profile) failed:', errorText(e));
  }

  try {
    const { data: subs, error: subsError } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('stripe_customer_id', customerId);
    if (subsError) throw subsError;
    const subIds = (subs ?? []).map((row) => row.id as string);
    if (subIds.length > 0) {
      const { data: schools, error: schoolsError } = await supabase
        .from('schools')
        .select('id')
        .in('stripe_subscription_id', subIds)
        .limit(1);
      if (schoolsError) throw schoolsError;
      const schoolId = (schools ?? [])[0]?.id as string | undefined;
      if (schoolId) owner.schoolId = schoolId;
    }
  } catch (e) {
    console.warn('[stripe-webhook] dispute owner lookup (school) failed:', errorText(e));
  }

  return owner;
};

/** The open incident of this kind that already belongs to the same user or school, if any. */
interface OpenRow {
  id: string;
  detail: string;
  subscription_ids: string[];
}

const openRowFor = async (
  supabase: SB,
  kind: IncidentKind,
  owner: Owner
): Promise<OpenRow | null> => {
  const scopes: Array<['user_id' | 'school_id', string]> = [];
  if (owner.userId) scopes.push(['user_id', owner.userId]);
  if (owner.schoolId) scopes.push(['school_id', owner.schoolId]);
  for (const [column, value] of scopes) {
    const { data, error } = await supabase
      .from('billing_incidents')
      .select('id, detail, subscription_ids')
      .eq('kind', kind)
      .eq(column, value)
      .is('resolved_at', null)
      .limit(1);
    if (error) throw error;
    const row = (data ?? [])[0];
    if (row) {
      return {
        id: row.id as string,
        detail: row.detail as string,
        subscription_ids: (row.subscription_ids as string[] | null) ?? [],
      };
    }
  }
  return null;
};

/**
 * Records a dispute or refund once, with its own alert. Three cases:
 *   - the Stripe id is already on an incident of this kind: a repeat. Nothing is
 *     written and nothing is sent.
 *   - an open incident of this kind already belongs to the same user or school. The
 *     table allows one open row per kind, so this case is added to that row and
 *     alerts, so its deadline is not lost behind the first.
 *   - otherwise a new row is written. recordIncident alerts when it writes one. If it
 *     cannot write (schema §13 not applied, or a failed write) or finds a row that
 *     appeared meanwhile, the alert is sent here, so the deadline is never silent.
 */
const recordStripeIncident = async (
  supabase: SB,
  input: {
    kind: IncidentKind;
    owner: Owner;
    stripeId: string;
    detail: string;
    alert: OperatorAlert;
  }
): Promise<void> => {
  const { kind, owner, stripeId, detail, alert } = input;

  try {
    const { data, error } = await supabase
      .from('billing_incidents')
      .select('id')
      .eq('kind', kind)
      .contains('subscription_ids', [stripeId])
      .limit(1);
    if (error) throw error;
    if ((data ?? []).length > 0) {
      console.log(`[stripe-webhook] ${kind} ${stripeId} is already on file — skipping.`);
      return;
    }
  } catch (e) {
    console.warn(`[stripe-webhook] ${kind} repeat check failed:`, errorText(e));
  }

  try {
    const open = await openRowFor(supabase, kind, owner);
    if (open) {
      const { error } = await supabase
        .from('billing_incidents')
        .update({
          detail: appendDetail(open.detail, detail),
          subscription_ids: [...open.subscription_ids, stripeId],
        })
        .eq('id', open.id);
      if (error) throw error;
      console.error(`[stripe-webhook] BILLING INCIDENT (${kind}), added to an open one: ${detail}`);
      await notifyOperator(alert);
      return;
    }
  } catch (e) {
    console.error(`[stripe-webhook] could not add to the open ${kind} incident:`, errorText(e));
    await notifyOperator(alert);
    return;
  }

  const outcome = await recordIncident(supabase, {
    kind,
    userId: owner.userId,
    schoolId: owner.schoolId,
    subscriptionIds: [stripeId],
    detail,
    alert,
  });
  // recordIncident alerts only when it writes a row. Anything else must still reach the operator.
  if (outcome !== 'recorded') await notifyOperator(alert);
};

/**
 * charge.dispute.created: the customer's bank has taken the money back. Records the
 * dispute, with its amount, reason, status and evidence deadline, and alerts. Never throws.
 */
export async function handleDisputeCreated(
  supabase: SB,
  stripe: Stripe,
  dispute: Obj
): Promise<void> {
  const disputeId = typeof dispute.id === 'string' ? dispute.id : '';
  if (!disputeId) {
    console.warn('[stripe-webhook] charge.dispute.created without an id; nothing recorded.');
    return;
  }
  const chargeId = idOf(dispute.charge);
  const amount = formatAmount(Number(dispute.amount ?? 0), String(dispute.currency ?? 'aud'));
  const reason = String(dispute.reason ?? 'unknown').replace(/_/g, ' ');
  const status = String(dispute.status ?? 'unknown');
  const dueBy = (dispute.evidence_details as { due_by?: unknown } | null | undefined)?.due_by;
  const deadline = typeof dueBy === 'number' ? formatDueDate(dueBy) : null;

  const owner = await ownerOfCustomer(supabase, await customerOfCharge(stripe, chargeId));

  const detail =
    `Payment dispute ${disputeId} on charge ${chargeId ?? 'not reported'}: ${amount}, ` +
    `reason ${reason}, status ${status}. ` +
    (deadline ? `Evidence due ${deadline}. ` : 'Stripe reported no evidence deadline. ') +
    NOTHING_CHANGED;

  await recordStripeIncident(supabase, {
    kind: 'dispute',
    owner,
    stripeId: disputeId,
    detail,
    alert: {
      kind: 'dispute',
      title: 'Payment dispute opened',
      lines: [
        amount,
        `Reason: ${reason}`,
        deadline
          ? `Respond in Stripe by ${deadline}`
          : 'Respond in Stripe. Stripe reported no deadline.',
        OPEN_BILLING,
      ],
    },
  });
}

/**
 * charge.dispute.closed. The statuses that matter:
 *   - 'won': the open incident resolves ("Dispute won").
 *   - 'lost': the funds have gone. The incident stays open and says so, and alerts.
 *   - anything else (warning_closed, charge_refunded...): resolves, with the status as the note.
 * A row that also names another dispute still open stays open: this dispute is dropped
 * from its list and the close is noted. Only a failed write throws, so Stripe retries it.
 * No plan or licence is ever written here.
 */
export async function handleDisputeClosed(supabase: SB, dispute: Obj): Promise<void> {
  const disputeId = typeof dispute.id === 'string' ? dispute.id : '';
  const status = String(dispute.status ?? 'unknown');
  const amount = formatAmount(Number(dispute.amount ?? 0), String(dispute.currency ?? 'aud'));
  const lostAlert: OperatorAlert = {
    kind: 'dispute',
    title: 'Payment dispute lost',
    lines: [amount, `The funds were withdrawn. ${NOTHING_CHANGED}`, OPEN_BILLING],
  };

  const { data, error } = await supabase
    .from('billing_incidents')
    .select('id, detail, subscription_ids')
    .eq('kind', 'dispute')
    .is('resolved_at', null)
    .contains('subscription_ids', [disputeId]);
  if (error) throw error;

  const rows = (data ?? []) as Array<{
    id: string;
    detail: string;
    subscription_ids: string[] | null;
  }>;
  if (rows.length === 0) {
    console.warn(`[stripe-webhook] no open dispute incident names ${disputeId} (${status}).`);
    if (status === 'lost') await notifyOperator(lostAlert);
    return;
  }

  for (const row of rows) {
    if (status === 'lost') {
      const { error: writeError } = await supabase
        .from('billing_incidents')
        .update({ detail: appendDetail(row.detail, 'Dispute lost: the funds were withdrawn.') })
        .eq('id', row.id);
      if (writeError) throw writeError;
      console.error(`[stripe-webhook] BILLING INCIDENT: dispute ${disputeId} was lost.`);
      await notifyOperator(lostAlert);
      continue;
    }

    const others = (row.subscription_ids ?? []).filter((id) => id !== disputeId);
    if (others.length > 0) {
      const { error: writeError } = await supabase
        .from('billing_incidents')
        .update({
          subscription_ids: others,
          detail: appendDetail(row.detail, `Dispute ${disputeId} closed: ${status}.`),
        })
        .eq('id', row.id);
      if (writeError) throw writeError;
      continue;
    }

    const { error: writeError } = await supabase
      .from('billing_incidents')
      .update({
        resolved_at: new Date().toISOString(),
        resolution_note: status === 'won' ? 'Dispute won' : status,
      })
      .eq('id', row.id)
      .is('resolved_at', null);
    if (writeError) throw writeError;
  }
}

/**
 * charge.refunded. Acts only on a full refund: a partial one is logged and ignored.
 * The incident says access is unchanged and leaves any cancellation to a person.
 * Never throws, and never writes the plan or licence tables.
 */
export async function handleChargeRefunded(supabase: SB, charge: Obj): Promise<void> {
  const chargeId = typeof charge.id === 'string' ? charge.id : '';
  if (charge.refunded !== true) {
    console.log(`[stripe-webhook] partial refund on ${chargeId || 'a charge'} — no action taken.`);
    return;
  }
  if (!chargeId) {
    console.warn('[stripe-webhook] charge.refunded without an id; nothing recorded.');
    return;
  }

  const amount = formatAmount(
    Number(charge.amount_refunded ?? charge.amount ?? 0),
    String(charge.currency ?? 'aud')
  );
  const owner = await ownerOfCustomer(supabase, idOf(charge.customer));

  await recordStripeIncident(supabase, {
    kind: 'refund',
    owner,
    stripeId: chargeId,
    detail: `Charge ${chargeId} was refunded in full: ${amount}. ${ACCESS_UNCHANGED}`,
    alert: {
      kind: 'refund',
      title: 'Payment refunded in full',
      lines: [amount, ACCESS_UNCHANGED, OPEN_BILLING],
    },
  });
}
