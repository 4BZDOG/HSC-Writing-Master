/**
 * The webhook's idempotency ledger: public.stripe_events (schema §13).
 *
 * A claim is taken before a Stripe event is handled and stamped with
 * `processed_at` once the handler has returned. Stripe redelivers any event it
 * did not get a 2xx for, and the ledger decides what a redelivery means:
 *
 *   finished claim (processed_at set)  → duplicate: acknowledge, apply nothing.
 *   unfinished, younger than the lease → busy: another invocation may still be
 *                                        working on it, so answer non-2xx and let
 *                                        Stripe retry later.
 *   unfinished, older than the lease   → abandoned: the invocation that claimed it
 *                                        was killed. Take the claim over and reprocess.
 *
 * The lease is two minutes. Functions in api/ have a maxDuration of 60 seconds
 * (vercel.json), so an unstamped claim that old belongs to a dead invocation; the
 * margin covers clock skew between the function and the database and a slow cold start.
 *
 * Reprocessing an abandoned event is safe because every subscription write is
 * ordered by subscriptions.last_event_at (isStaleEvent in api/_lib/subscriptionSync.ts):
 * an event already overtaken by a newer one is skipped, and one that has not been
 * is applied as it would have been. Keep that true: a handler that writes without
 * the ordering stamp must not run on this path.
 *
 * Schema not re-applied: with no processed_at column, a redelivery is a duplicate
 * and nothing is stamped, which is exactly how the webhook behaved before the column
 * existed. A missing column never throws.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/** How long an unstamped claim is trusted to still be in flight. See the header. */
export const CLAIM_LEASE_MS = 2 * 60 * 1000;

/**
 *   'claimed'     — this invocation owns the event (new, or taken over) and must stamp it;
 *   'duplicate'   — already applied, skip;
 *   'busy'        — another invocation holds a live claim: answer non-2xx, retry later;
 *   'unavailable' — no event id, or the ledger cannot be written: process without dedup.
 */
export type ClaimResult = 'claimed' | 'duplicate' | 'busy' | 'unavailable';

interface DbError {
  code?: string;
  message?: string;
}

/**
 * True when the database says a column (or the PostgREST schema cache says it
 * has never heard of one): the schema has not been re-applied yet.
 */
export const isMissingColumnError = (error: DbError): boolean =>
  error.code === '42703' ||
  error.code === 'PGRST204' ||
  /could not find the .* column|column .* does not exist/i.test(error.message ?? '');

/**
 * True when the table itself is missing: schema §13 has not been re-applied since
 * the table was added (checkout_sessions, billing_incidents). Callers treat this as
 * "nothing recorded", so the database behaves as it did before the table existed.
 */
export const isMissingTableError = (error: DbError): boolean =>
  error.code === '42P01' ||
  error.code === 'PGRST205' ||
  /could not find the table|relation .* does not exist/i.test(error.message ?? '');

/**
 * Record the event id so a redelivery can be recognised. See ClaimResult.
 * `now` is injectable so the lease can be tested without fake timers.
 */
export async function claimEvent(
  supabase: SupabaseClient,
  eventId: string | undefined,
  eventType: string,
  eventCreated: number | undefined,
  now: number = Date.now()
): Promise<ClaimResult> {
  if (!eventId) return 'unavailable';
  // Names no processed_at on purpose: the column default is null, and an insert
  // that named it would fail outright on a database that has not re-applied §13.
  const { error } = await supabase.from('stripe_events').insert({
    id: eventId,
    type: eventType,
    event_created: eventCreated ? new Date(eventCreated * 1000).toISOString() : null,
  });
  if (!error) return 'claimed';

  // 23505 = unique_violation: the id is already in the ledger. Anything else is
  // the ledger being unavailable, and the event is processed without dedup as before.
  if (error.code !== '23505') {
    console.warn('[stripe-webhook] event ledger unavailable (processing anyway):', error.message);
    return 'unavailable';
  }

  const { data: row, error: readError } = await supabase
    .from('stripe_events')
    .select('processed_at')
    .eq('id', eventId)
    .maybeSingle();

  if (readError && isMissingColumnError(readError)) {
    // Pre-§13-re-apply: no way to tell an abandoned claim from a finished one,
    // so behave as the webhook always did and treat the redelivery as a duplicate.
    console.log(`[stripe-webhook] duplicate delivery of ${eventId} (${eventType}) — skipping.`);
    return 'duplicate';
  }
  if (readError) {
    // Could not tell. Refusing (non-2xx) makes Stripe retry, which is safe;
    // acknowledging it could lose an abandoned event.
    console.error(`[stripe-webhook] could not read claim for ${eventId}:`, readError.message);
    return 'busy';
  }
  if (!row) {
    // The claim disappeared between the insert and this read: the other invocation
    // failed and released it. Stripe is retrying that failure anyway.
    return 'busy';
  }

  if (row.processed_at) {
    console.log(`[stripe-webhook] duplicate delivery of ${eventId} (${eventType}) — skipping.`);
    return 'duplicate';
  }

  // Unstamped. Take it over only if its lease has run out. The condition is
  // evaluated by the database in one statement, so two redeliveries racing for
  // the same stale claim cannot both win: the second matches no row.
  const cutoff = new Date(now - CLAIM_LEASE_MS).toISOString();
  const { data: taken, error: takeError } = await supabase
    .from('stripe_events')
    .update({ received_at: new Date(now).toISOString() })
    .eq('id', eventId)
    .is('processed_at', null)
    .lt('received_at', cutoff)
    .select('id');
  if (takeError) {
    console.error(`[stripe-webhook] could not take over claim for ${eventId}:`, takeError.message);
    return 'busy';
  }
  if (taken && taken.length > 0) {
    console.warn(
      `[stripe-webhook] ${eventId} (${eventType}) was claimed by an invocation that never ` +
        'finished — reprocessing.'
    );
    return 'claimed';
  }
  console.log(
    `[stripe-webhook] ${eventId} (${eventType}) is being processed — asking Stripe to retry.`
  );
  return 'busy';
}

/**
 * Stamp a claim as finished. Called only after the handler has returned, so a
 * stamp means "applied". Throws on a real failure, which the caller treats like
 * a handler failure (release the claim, answer 500, let Stripe retry).
 */
export async function markEventProcessed(supabase: SupabaseClient, eventId: string): Promise<void> {
  const { error } = await supabase
    .from('stripe_events')
    .update({ processed_at: new Date().toISOString() })
    .eq('id', eventId);
  if (!error) return;
  if (isMissingColumnError(error)) {
    console.warn(
      '[stripe-webhook] ledger has no processed_at yet (schema §13 not re-applied) — not stamped.'
    );
    return;
  }
  throw new Error(`could not stamp ${eventId} as processed: ${error.message}`);
}

/**
 * Release a claim so the next delivery reprocesses the event. If this fails, the
 * claim stays unstamped and goes stale after the lease, so it is still recovered.
 */
export async function releaseEvent(supabase: SupabaseClient, eventId: string): Promise<void> {
  const { error } = await supabase.from('stripe_events').delete().eq('id', eventId);
  if (error) {
    console.error(`[stripe-webhook] could not release claim for ${eventId}:`, error.message);
  }
}
