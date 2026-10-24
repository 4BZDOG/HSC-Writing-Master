/**
 * Applies a Stripe subscription to Supabase: the subscription row, the
 * customer's cached plan, and a school licence's seats and status.
 *
 * Two callers share this so they cannot drift apart:
 *   - api/stripe-webhook.ts, for every subscription event Stripe delivers;
 *   - api/sync-checkout.ts, which confirms a purchase when the browser returns
 *     from Checkout, before the webhook has necessarily landed.
 *
 * Every write here is ordered by subscriptions.last_event_at (isStaleEvent): a
 * write stamped with an older time than the row already holds is skipped. Any
 * caller that writes a subscription row must stamp it, or a later event could
 * be undone by an earlier one.
 *
 * Log lines keep the `[stripe-webhook]` prefix whichever caller runs them: they
 * describe the subscription row, and operators already search for that prefix.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { priceToPlan } from './stripe';
import { isMissingColumnError } from './stripeLedger';
import { isHeldStatus } from './openCheckout';
import {
  checkDuplicateSubscriptions,
  checkSchoolLicenceReplaced,
  recordIncident,
} from './billingIncidents';

type SB = SupabaseClient;

/** The ordering stamp written alongside every subscription-row write. */
export const eventStamp = (eventCreated?: number): Record<string, string> =>
  eventCreated ? { last_event_at: new Date(eventCreated * 1000).toISOString() } : {};

/**
 * True when this event predates the newest one already applied to the
 * subscription row — i.e. applying it would roll state backwards. Unknown
 * timestamps (no event.created, or a pre-migration row without the column)
 * are never treated as stale: skipping a real event is worse than the
 * out-of-order write it protects against.
 */
export async function isStaleEvent(
  supabase: SB,
  subId: string,
  eventCreated: number | undefined
): Promise<boolean> {
  if (!eventCreated || !subId) return false;
  const { data } = await supabase
    .from('subscriptions')
    .select('last_event_at')
    .eq('id', subId)
    .maybeSingle();
  const seen = data?.last_event_at as string | null | undefined;
  if (!seen) return false;
  return new Date(seen).getTime() > eventCreated * 1000;
}

/**
 * The newest stamp the subscription row holds, or null when it holds none.
 * Unlike isStaleEvent this throws on a read error: the caller must know the
 * prior stamp in order to put it back if its own write fails. A database that
 * has not re-applied the column reads as "no stamp", as isStaleEvent does.
 */
export async function lastEventAtOf(supabase: SB, subId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('last_event_at')
    .eq('id', subId)
    .maybeSingle();
  if (error) {
    if (isMissingColumnError(error)) return null;
    throw new Error(`could not read the ordering stamp for ${subId}: ${error.message}`);
  }
  return (data?.last_event_at as string | null | undefined) ?? null;
}

/**
 * What linkStripeCustomer did. 'linked' and 'already' leave the profile holding the
 * customer this event names. 'mismatch' does not: the profile keeps its older customer.
 */
export type CustomerLink = 'linked' | 'already' | 'mismatch' | 'no_profile';

/**
 * Links a Stripe customer to the Supabase profile that bought it. Throws on a
 * database error: without the link the billing portal and the later
 * subscription events cannot find the user.
 *
 * A profile is linked to ONE customer. Once it holds one, a different customer id is
 * not written over it (monetisation review §24). Overwriting sends the billing portal,
 * and every later event for the first customer, to a profile that no longer owns it.
 * The mismatch is recorded as a billing incident and the caller still applies the plan,
 * because the plan is keyed on the user and not on the customer.
 *
 * The write is conditional (only where the link is empty), so two events racing for
 * one profile cannot both succeed: the second reads the first's customer and reports
 * a mismatch.
 */
export async function linkStripeCustomer(
  supabase: SB,
  userId: string,
  customerId: string
): Promise<CustomerLink> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ stripe_customer_id: customerId })
    .eq('id', userId)
    .is('stripe_customer_id', null)
    .select('id');

  if (error) {
    console.error('[stripe-webhook] Failed to link customer:', error.message);
    throw error;
  }
  if (data && data.length > 0) return 'linked';

  // Nothing was written: the profile holds a customer already, or it does not exist.
  const { data: current, error: readError } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .maybeSingle();
  if (readError) {
    console.error('[stripe-webhook] Failed to read the customer link:', readError.message);
    throw readError;
  }
  if (!current) return 'no_profile';

  const held = (current.stripe_customer_id as string | null | undefined) ?? null;
  if (held === customerId) return 'already';
  if (held === null) {
    // Unlinked between the two statements. Refuse this event so Stripe redelivers it,
    // rather than guess which customer the profile should hold.
    throw new Error(`the customer link for ${userId} changed while it was being written`);
  }

  console.error(
    `[stripe-webhook] profile ${userId} is linked to ${held}; not replacing it with ${customerId}.`
  );
  await recordIncident(supabase, {
    kind: 'customer_mismatch',
    userId,
    detail:
      `Profile ${userId} is linked to Stripe customer ${held}, and a purchase for ${customerId} ` +
      'completed. The plan was applied, but the link was not changed, so the billing portal ' +
      `still opens ${held}. Subscriptions on ${customerId} need an operator to relink them.`,
  });
  return 'mismatch';
}

/**
 * Upserts the subscription row and updates the profile's cached plan.
 * Throws on a database error, so the caller can release its claim or retry.
 */
export async function applySubscriptionUpsert(
  supabase: SB,
  sub: Record<string, unknown>,
  eventCreated?: number
): Promise<void> {
  const subId = sub.id as string;
  const customerId = sub.customer as string;
  const status = sub.status as string;
  const cancelAtPeriodEnd = (sub.cancel_at_period_end as boolean) ?? false;

  const items = sub.items as
    | {
        data?: Array<{
          price?: { id?: string };
          quantity?: number;
          current_period_start?: number;
          current_period_end?: number;
        }>;
      }
    | undefined;
  const firstItem = items?.data?.[0];
  const priceId = firstItem?.price?.id ?? '';
  let plan = priceToPlan(priceId);
  // Seat count: the subscription item's quantity (school licences bill per
  // seat); individual Plus subscriptions are quantity 1.
  const seats = Math.max(1, Math.trunc(Number(firstItem?.quantity ?? sub.quantity ?? 1)) || 1);

  // Stripe API ≥ 2025-03-31 (basil) removed current_period_start/end from the
  // Subscription object — they now live on each subscription item. Read the
  // top-level fields first (older webhook API versions) and fall back to the
  // first item; without the fallback, modern accounts stored "now" for both
  // and the profile's renewal date was always today.
  const periodStart = (sub.current_period_start ?? firstItem?.current_period_start) as
    | number
    | undefined;
  const periodEnd = (sub.current_period_end ?? firstItem?.current_period_end) as number | undefined;

  // Ordering guard: Stripe does not order deliveries, so a delayed `updated`
  // (e.g. the one that preceded a cancellation) can arrive after the state it
  // predates and resurrect a plan that's already been ended. Refuse to apply
  // an event older than the newest one this row has seen.
  if (await isStaleEvent(supabase, subId, eventCreated)) {
    console.log(`[stripe-webhook] ignoring out-of-order event for ${subId}`);
    return;
  }

  // An ACTIVE subscription on a price this deployment doesn't recognise must
  // never be read as "free". priceToPlan falls back to 'free' for unknown
  // prices, and Stripe sends customer.subscription.updated for entirely
  // routine things — a renewal, a card update, a quantity change. So the day
  // someone rotates a price in Stripe, or a STRIPE_*_PRICE_ID goes missing
  // from the Vercel project, the next renewal event would quietly downgrade
  // every paying customer on the old price. Keep whatever plan the row already
  // holds instead, and be loud about it: the price list needs fixing, but not
  // at the customer's expense.
  const planKeepingStatus = status === 'active' || status === 'trialing' || status === 'past_due';
  if (plan === 'free' && planKeepingStatus) {
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('plan')
      .eq('id', subId)
      .maybeSingle();
    const knownPlan = existing?.plan as string | undefined;
    const fallback = knownPlan && knownPlan !== 'free' ? (knownPlan as 'plus' | 'school') : 'plus';
    console.error(
      `[stripe-webhook] price ${priceId || '(none)'} on active subscription ${subId} is not in ` +
        `this deployment's price list — keeping '${fallback}' rather than downgrading. ` +
        'Check STRIPE_PLUS_MONTHLY_PRICE_ID / STRIPE_PLUS_YEARLY_PRICE_ID / STRIPE_SCHOOL_PRICE_ID.'
    );
    plan = fallback;
  }

  // Find the user who owns this customer ID (and their school, for seat
  // licences).
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, school_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  let userId = profile?.id as string | undefined;
  let schoolId = (profile?.school_id as string | undefined) ?? undefined;
  // True when the metadata names a user whose profile no longer exists: an account
  // deleted while Stripe still held its subscription (see below).
  let metaUserGone = false;

  // Webhook ordering isn't guaranteed: customer.subscription.created can land
  // BEFORE checkout.session.completed links the customer id to the profile.
  // create-checkout stamps the Supabase user id onto the subscription's
  // metadata for exactly this case — use it, and backfill the customer link.
  if (!userId) {
    const metadata = sub.metadata as Record<string, string> | undefined;
    const metaUserId = metadata?.supabase_user_id;
    if (metaUserId) {
      userId = metaUserId;
      // The same rule as checkout.session.completed: the link is written only where
      // the profile has none (linkStripeCustomer). A different customer already linked
      // is recorded as an incident, and the plan write below still succeeds. A failed
      // write is logged, and the plan write still succeeds, as it always has.
      try {
        await linkStripeCustomer(supabase, metaUserId, customerId);
      } catch (linkError) {
        console.error(
          '[stripe-webhook] customer backfill failed:',
          linkError instanceof Error ? linkError.message : linkError
        );
      }
      const { data: metaProfile, error: metaProfileError } = await supabase
        .from('profiles')
        .select('school_id')
        .eq('id', metaUserId)
        .maybeSingle();
      schoolId = (metaProfile?.school_id as string | undefined) ?? undefined;
      metaUserGone = !metaProfile && !metaProfileError;
    }
  }

  if (!userId) {
    console.warn('[stripe-webhook] No profile for customer', customerId);
    return;
  }

  // A guardian purchase (schema §31). The customer, and so the payer, is the parent whose
  // profile was just found. The plan is the STUDENT's: the holder named in the metadata the
  // server wrote at checkout. Everything below that writes "the user" writes the holder,
  // and the school logic is skipped, because a guardian purchase is never a licence.
  const subMetadata = sub.metadata as Record<string, string> | undefined;
  const beneficiaryId = subMetadata?.beneficiary_user_id || undefined;

  // A deleted account (schema §16) takes its profile with it, but Stripe can still send
  // events for a subscription it held or paid for: one already set to end, or one
  // delivered late. Writing the row would fail its foreign key on profiles, and the
  // webhook would answer 500 to every retry for days. There is nothing to write for a
  // holder who no longer exists, so the event is acknowledged and left. A payer who no
  // longer exists is not named: the row keeps the null the deletion left in payer_id,
  // and the child's plan still follows Stripe. api/prepare-account-deletion.ts cancels
  // these subscriptions before an account goes, so this is the stray event, not the rule.
  if (beneficiaryId) {
    const { data: holder, error: holderError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', beneficiaryId)
      .maybeSingle();
    if (holderError) {
      console.error('[stripe-webhook] holder profile read failed:', holderError.message);
      throw holderError;
    }
    if (!holder) {
      console.warn(`[stripe-webhook] holder of ${subId} no longer exists; ignoring the event.`);
      return;
    }
  } else if (metaUserGone) {
    console.warn(`[stripe-webhook] holder of ${subId} no longer exists; ignoring the event.`);
    return;
  }
  const payerId = beneficiaryId && !metaUserGone ? userId : undefined;
  const holderId = beneficiaryId ?? userId;

  // Upsert the subscription row.
  const { error: subError } = await supabase.from('subscriptions').upsert(
    {
      id: subId,
      user_id: holderId,
      // Only a guardian purchase names a payer. A row without one is unchanged, so an
      // existing self-paid subscription is written exactly as before.
      ...(payerId ? { payer_id: payerId } : {}),
      stripe_customer_id: customerId,
      status,
      price_id: priceId,
      plan,
      current_period_start: periodStart
        ? new Date(periodStart * 1000).toISOString()
        : new Date().toISOString(),
      current_period_end: periodEnd
        ? new Date(periodEnd * 1000).toISOString()
        : new Date().toISOString(),
      cancel_at_period_end: cancelAtPeriodEnd,
      seats,
      updated_at: new Date().toISOString(),
      ...eventStamp(eventCreated),
    },
    { onConflict: 'id' }
  );

  if (subError) {
    console.error('[stripe-webhook] subscription upsert failed:', subError.message);
    throw subError;
  }

  // Update the cached plan on the profile.
  //
  // Grace period: `past_due` means one charge failed and STRIPE IS STILL
  // RETRYING (smart retries run for days). Downgrading here would cut a
  // paying customer off over a flaky card charge — and contradicts the
  // invoice.payment_failed handler, which deliberately doesn't
  // downgrade. The plan is only dropped on terminal states (canceled,
  // unpaid, incomplete_expired), which Stripe reaches after retries are
  // exhausted (customer.subscription.deleted also fires for cancellations).
  // The client reads the subscription row's `past_due` status directly
  // (RLS: users read own subscriptions) to show a fix-your-payment banner.
  const activePlan = planKeepingStatus ? plan : 'free';
  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      stripe_plan: activePlan,
      plan_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    })
    .eq('id', holderId);

  if (profileError) {
    console.error('[stripe-webhook] profile plan update failed:', profileError.message);
    throw profileError;
  }

  // Two live subscriptions for one person are two charges, and the plan follows only
  // one of them. The plan write above has already happened, so this only records the
  // finding for the operator. It never throws, and it never changes the plan.
  if (planKeepingStatus) await checkDuplicateSubscriptions(supabase, holderId);

  // A licence belongs to the school it was bought for, not to wherever its
  // purchaser works now. create-checkout fixes that school at purchase, and the
  // school row already carries this subscription id, so find it by that. The
  // purchaser's current school_id is only the fallback for a first event. Without
  // this, a teacher who moves school strands the licence: renewals and past_due or
  // unpaid statuses stop reaching the school row, so an unpaid school keeps its plan.
  if (plan === 'school' && !beneficiaryId) {
    const { data: licensed } = await supabase
      .from('schools')
      .select('id')
      .eq('stripe_subscription_id', subId)
      .maybeSingle();
    if (licensed?.id) schoolId = licensed.id as string;
  }

  // School seat licence: sync the purchaser's school so every member holds
  // the plan (the client resolves membership → plan at sign-in). Best-effort:
  // a purchaser without a school still gets the plan personally, and an admin
  // can attach the school later.
  if (plan === 'school' && !beneficiaryId) {
    if (schoolId) {
      // Checked before the write: the row still names the licence this write replaces.
      // A held status (incomplete included) is what counts, since the school row takes it too.
      if (isHeldStatus(status)) {
        await checkSchoolLicenceReplaced(supabase, {
          schoolId,
          purchaserId: userId,
          subscriptionId: subId,
        });
      }
      const { error: schoolError } = await supabase
        .from('schools')
        .update({
          stripe_subscription_id: subId,
          plan_seats: seats,
          plan_status: status,
          plan_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
          // Stripe holds a cancelling subscription at 'active' until the
          // boundary, so without this the dashboard reads the end date as a
          // renewal date and nobody finds out the school is about to lose the
          // plan until it has.
          plan_cancel_at_period_end: cancelAtPeriodEnd,
        })
        .eq('id', schoolId);
      if (schoolError) {
        console.error('[stripe-webhook] school licence sync failed:', schoolError.message);
      }
    } else {
      console.warn(
        '[stripe-webhook] school plan purchased by a user with no school_id — only the purchaser holds the plan until an admin assigns their school.'
      );
    }
  }
}
