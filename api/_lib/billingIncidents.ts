/**
 * Billing incidents: the webhook's findings that a person has to act on (schema §13,
 * billing_incidents). The plan is never changed by an incident, and nothing is cancelled
 * or refunded. An incident is a row for the operator to read in the database, and the
 * Stripe Dashboard is where they act on it (docs/stripesetup.md).
 *
 * Every function here is best effort and never throws. An incident is a record of
 * something that already happened. Failing to write it must not fail the webhook, or
 * Stripe would redeliver an event whose plan write has already succeeded.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingTableError } from './stripeLedger';
import { notifyOperator, type OperatorAlert } from './operatorAlert';

type SB = SupabaseClient;

export type IncidentKind =
  | 'duplicate_subscription'
  | 'duplicate_school_licence'
  | 'customer_mismatch'
  | 'dispute'
  | 'refund';

export interface IncidentInput {
  kind: IncidentKind;
  userId?: string;
  schoolId?: string;
  subscriptionIds?: string[];
  detail: string;
  /**
   * The alert sent when a new row is written. Left out, the generic "New billing incident"
   * alert goes. A caller with its own deadline to state (a dispute) passes its own, so the
   * operator gets one alert, not two.
   */
  alert?: OperatorAlert;
}

/**
 *   'recorded'     — a new open incident was written, and logged as an error;
 *   'already_open' — an open incident of this kind already exists for the user or school;
 *   'unavailable'  — the table is missing, or the write failed (logged).
 */
export type IncidentOutcome = 'recorded' | 'already_open' | 'unavailable';

const DETAIL_MAX = 1000;

/** The statuses that mean a subscription is being paid for right now (the webhook's grace rule). */
const LIVE_STATUSES = ['active', 'trialing', 'past_due'];

const scopeOf = (
  input: IncidentInput
): { column: 'user_id' | 'school_id'; value: string } | null => {
  if (input.userId) return { column: 'user_id', value: input.userId };
  if (input.schoolId) return { column: 'school_id', value: input.schoolId };
  return null;
};

/**
 * Keeps an open incident's subscription list and detail current when it is found again.
 * A third live subscription should appear on the open row, not only in the server log.
 */
const refreshOpenIncident = async (
  supabase: SB,
  input: IncidentInput,
  subscriptionIds: string[],
  detail: string
): Promise<void> => {
  const scope = scopeOf(input);
  if (!scope || subscriptionIds.length === 0) return;
  const { error } = await supabase
    .from('billing_incidents')
    .update({ subscription_ids: subscriptionIds, detail })
    .eq(scope.column, scope.value)
    .eq('kind', input.kind)
    .is('resolved_at', null);
  if (error) {
    console.error(
      `[stripe-webhook] could not refresh the open ${input.kind} incident: ${error.message}`
    );
  }
};

/**
 * Writes an open incident, or finds the one already open for the same user or school.
 * A redelivered event therefore leaves one row, not one per delivery.
 */
export async function recordIncident(supabase: SB, input: IncidentInput): Promise<IncidentOutcome> {
  const detail = input.detail.slice(0, DETAIL_MAX);
  const subscriptionIds = input.subscriptionIds ?? [];
  try {
    const { error } = await supabase.from('billing_incidents').insert({
      kind: input.kind,
      user_id: input.userId ?? null,
      school_id: input.schoolId ?? null,
      subscription_ids: subscriptionIds,
      detail,
    });
    if (!error) {
      console.error(`[stripe-webhook] BILLING INCIDENT (${input.kind}): ${detail}`);
      // Only a new row alerts the operator; a deduped one was already announced. Awaited,
      // and it never throws, so the outcome returned is the same either way.
      await notifyOperator(
        input.alert ?? {
          kind: 'billing_incident',
          title: 'New billing incident',
          lines: [
            `Kind: ${input.kind}`,
            ...(input.schoolId ? [`School: ${input.schoolId}`] : []),
            'Open Admin → Billing overview.',
          ],
        }
      );
      return 'recorded';
    }
    if (error.code === '23505') {
      await refreshOpenIncident(supabase, input, subscriptionIds, detail);
      console.warn(`[stripe-webhook] billing incident (${input.kind}) is already open: ${detail}`);
      return 'already_open';
    }
    if (isMissingTableError(error)) {
      console.error(
        `[stripe-webhook] billing_incidents is missing (schema §13 not re-applied); not recorded: ${detail}`
      );
      return 'unavailable';
    }
    console.error(
      `[stripe-webhook] could not record billing incident (${input.kind}): ${error.message}. ${detail}`
    );
    return 'unavailable';
  } catch (e) {
    console.error(
      `[stripe-webhook] could not record billing incident (${input.kind}):`,
      e instanceof Error ? e.message : e
    );
    return 'unavailable';
  }
}

/**
 * Records a duplicate_subscription incident when the user holds more than one live
 * subscription. Counted after the subscription row is written, so the row that has just
 * arrived is included. Never throws.
 */
export async function checkDuplicateSubscriptions(supabase: SB, userId: string): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('user_id', userId)
      .in('status', LIVE_STATUSES);
    if (error) {
      console.error('[stripe-webhook] duplicate-subscription check failed:', error.message);
      return;
    }
    const ids = (data ?? []).map((row) => row.id as string);
    if (ids.length < 2) return;
    await recordIncident(supabase, {
      kind: 'duplicate_subscription',
      userId,
      subscriptionIds: ids,
      detail:
        `Account ${userId} holds ${ids.length} live subscriptions (${ids.join(', ')}). ` +
        'Stripe bills each of them, and the plan follows the one that runs longest ' +
        '(resolve_stripe_plan). Nothing has been cancelled or refunded.',
    });
  } catch (e) {
    console.error(
      '[stripe-webhook] duplicate-subscription check failed:',
      e instanceof Error ? e.message : e
    );
  }
}

/**
 * Records a duplicate_school_licence incident when a school's licence is about to be
 * replaced by a different subscription while the one it holds is still live. Called
 * BEFORE the school row is written, so the subscription it still names is the one that
 * would be lost. Never throws.
 */
export async function checkSchoolLicenceReplaced(
  supabase: SB,
  input: { schoolId: string; purchaserId: string; subscriptionId: string }
): Promise<void> {
  try {
    const { data: school, error: schoolError } = await supabase
      .from('schools')
      .select('stripe_subscription_id')
      .eq('id', input.schoolId)
      .maybeSingle();
    if (schoolError) {
      console.error('[stripe-webhook] school licence overlap check failed:', schoolError.message);
      return;
    }
    const previous = (school?.stripe_subscription_id as string | null | undefined) ?? null;
    if (!previous || previous === input.subscriptionId) return;

    const { data: prior, error: priorError } = await supabase
      .from('subscriptions')
      .select('status')
      .eq('id', previous)
      .maybeSingle();
    if (priorError) {
      console.error('[stripe-webhook] school licence overlap check failed:', priorError.message);
      return;
    }
    // Only a licence still being paid for holds the school. A cancelled one is simply replaced.
    if (!prior || !LIVE_STATUSES.includes(prior.status as string)) return;

    await recordIncident(supabase, {
      kind: 'duplicate_school_licence',
      userId: input.purchaserId,
      schoolId: input.schoolId,
      subscriptionIds: [previous, input.subscriptionId],
      detail:
        `School ${input.schoolId} now records ${input.subscriptionId}, replacing ${previous}, ` +
        'which was still live. Both are billed. Nothing has been cancelled or refunded.',
    });
  } catch (e) {
    console.error(
      '[stripe-webhook] school licence overlap check failed:',
      e instanceof Error ? e.message : e
    );
  }
}
