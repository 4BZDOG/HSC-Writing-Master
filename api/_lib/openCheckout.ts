/**
 * One open Checkout Session per user (monetisation review §21).
 *
 * The duplicate-subscription guard in api/create-checkout.ts reads subscription rows,
 * and a row exists only once the webhook has run. So it cannot see a purchase that is
 * still in flight: two tabs, a double tap, or a second device can each create a session,
 * and both stay payable for up to a day. This module keeps one payable session per user.
 *
 * The order is deliberate. create-checkout first creates the new session, then swaps
 * its id into checkout_sessions, and only then expires the session it displaced. The
 * new session is not handed to the customer until that swap has happened, so a session
 * is never payable while another one for the same person is going unrecorded.
 *
 * The swap is a compare-and-set on session_id. Two requests racing for the same row
 * cannot both believe they displaced the same session: one wins, and the other reads
 * the winner's session and displaces that instead.
 *
 * Idempotency. A double tap should return the SAME session, not create one and expire
 * the other. The create call carries an idempotency key made from the user, the plan,
 * the seats, and a five-minute bucket of time. Stripe returns the original session for a
 * repeat of the same key and parameters, so the second request's swap finds its own
 * session already recorded and displaces nothing. expires_at is derived from the same
 * bucket, because Stripe rejects a repeat whose parameters differ.
 */
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingTableError } from './stripeLedger';

type SB = SupabaseClient;

/**
 * Stripe's floor for expires_at, measured from creation (its ceiling is 24 hours, the
 * default). A session created for a forgotten tab stays payable for at most this and
 * one bucket more, rather than a day.
 */
export const CHECKOUT_LIFE_MS = 31 * 60 * 1000;

/**
 * The width of the window in which repeat requests share a Stripe session. Five
 * minutes covers a double tap or a second tab opened in the same breath, and is short
 * enough that a deliberate second attempt later gets a fresh session.
 */
export const CHECKOUT_REQUEST_BUCKET_MS = 5 * 60 * 1000;

/**
 * Subscription statuses in which a purchase is paid, being paid, or may still be paid.
 * They hold a new purchase outright, for both guards: a second checkout would double-bill.
 * `past_due` counts because Stripe is still retrying the charge.
 */
export const LIVE_STATUSES = ['active', 'trialing', 'past_due'] as const;

/**
 * How long an `incomplete` subscription holds a new purchase after its last write: the
 * 3-D Secure window. Stripe creates the subscription in `incomplete` when the first
 * payment needs an extra step, and the customer has this long to approve it in their
 * bank's prompt. Once the row has been quiet for longer, it no longer holds, so a
 * customer who gave up and came back to retry is not locked out.
 *
 * The cost is accepted on purpose. If the abandoned payment does go through after the
 * window, the account can end up with two live subscriptions. The duplicate-subscription
 * incident (api/_lib/billingIncidents.ts) records that for the operator, which is the
 * safeguard for this rare case; holding every `incomplete` purchase for up to a day
 * would lose sales to prevent it.
 */
export const INCOMPLETE_HOLD_MS = 45 * 60 * 1000;

/**
 * `incomplete` and the live statuses together: every status the INCIDENT detection
 * treats as one that may still be paid. The guards use LIVE_STATUSES plus
 * holdsPurchase(), which applies INCOMPLETE_HOLD_MS.
 */
export const HELD_STATUSES = [...LIVE_STATUSES, 'incomplete'] as const;

export const isHeldStatus = (status: unknown): boolean =>
  typeof status === 'string' && (HELD_STATUSES as readonly string[]).includes(status);

/** True for an active, trialing or past_due subscription, which holds outright. */
export const isLiveStatus = (status: unknown): boolean =>
  typeof status === 'string' && (LIVE_STATUSES as readonly string[]).includes(status);

/** The subscription row fields the hold decision reads. */
export interface PurchaseRow {
  status?: unknown;
  last_event_at?: unknown;
  updated_at?: unknown;
}

/**
 * The timestamp that says when a row was last written: last_event_at (the Stripe event
 * time that was applied), falling back to updated_at. Null when neither is present.
 */
const lastWrittenAt = (row: PurchaseRow): string | null =>
  [row.last_event_at, row.updated_at].find(
    (value): value is string => typeof value === 'string' && value !== ''
  ) ?? null;

/**
 * Whether a subscription row holds a new purchase.
 *
 * - active, trialing and past_due hold, always.
 * - incomplete holds only while its last write is inside INCOMPLETE_HOLD_MS. A row with
 *   no timestamp, or one that does not parse, does NOT hold: nothing says the payment is
 *   still in flight, and holding on a guess would lock out a customer.
 * - Every other status does not hold.
 */
export const holdsPurchase = (row: PurchaseRow, now: number = Date.now()): boolean => {
  if (isLiveStatus(row.status)) return true;
  if (row.status !== 'incomplete') return false;
  const stamp = lastWrittenAt(row);
  if (!stamp) return false;
  const writtenAt = Date.parse(stamp);
  if (Number.isNaN(writtenAt)) return false;
  return now - writtenAt < INCOMPLETE_HOLD_MS;
};

const describe = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export interface CheckoutRequestKey {
  /** Passed to Stripe as the Idempotency-Key of the create call. */
  idempotencyKey: string;
  /** Unix seconds, for the session's expires_at. Constant within one bucket. */
  expiresAt: number;
}

/**
 * The idempotency key and expiry for a checkout request. Both are derived from the
 * current time bucket, so every request in one bucket with the same inputs sends Stripe
 * the same parameters and gets the same session back.
 *
 * The key includes the Stripe customer reference (or 'new'). Without it, a webhook that
 * links the customer between two taps would change the parameters under an unchanged
 * key, and Stripe would refuse the retry until the bucket rolled over.
 */
export const checkoutRequestKey = (
  input: {
    userId: string;
    priceId: string;
    seats: number;
    returnBase: string;
    customerRef: string;
  },
  now: number = Date.now()
): CheckoutRequestKey => {
  const bucketStart = Math.floor(now / CHECKOUT_REQUEST_BUCKET_MS) * CHECKOUT_REQUEST_BUCKET_MS;
  const bucketEnd = bucketStart + CHECKOUT_REQUEST_BUCKET_MS;
  return {
    idempotencyKey:
      `checkout:${input.userId}:${input.priceId}:${input.seats}:` +
      `${input.customerRef}:${input.returnBase}:${bucketStart}`,
    // Measured from the end of the bucket, which is never before the request. The call
    // itself happens within a second or two of `now`, so the session always has at least
    // Stripe's 30-minute minimum left.
    expiresAt: Math.floor((bucketEnd + CHECKOUT_LIFE_MS) / 1000),
  };
};

/** Stripe's answer when the same idempotency key is still in flight, or was used with other parameters. */
export const isIdempotencyConflict = (e: unknown): boolean =>
  (e as { type?: string } | null)?.type === 'StripeIdempotencyError';

export type OpenCheckoutSwap =
  /** The session is recorded. `previous` is the session it displaced, if any. */
  | { recorded: true; previous: string | null }
  /** The table is not there yet (schema §13 not re-applied): nothing can be displaced. */
  | { recorded: false };

const SWAP_ATTEMPTS = 3;

/**
 * Records `sessionId` as the user's open checkout and returns the session it displaced.
 *
 * Throws on a database error other than a missing table. The caller must then refuse
 * the purchase: without the record, this session could not be displaced later.
 */
export async function swapOpenCheckout(
  supabase: SB,
  userId: string,
  sessionId: string
): Promise<OpenCheckoutSwap> {
  for (let attempt = 0; attempt < SWAP_ATTEMPTS; attempt++) {
    const { data, error: readError } = await supabase
      .from('checkout_sessions')
      .select('session_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (readError) {
      if (isMissingTableError(readError)) return { recorded: false };
      throw new Error(`could not read the open checkout: ${readError.message}`);
    }

    const held = (data?.session_id as string | undefined) ?? null;
    if (!held) {
      const { error: insertError } = await supabase
        .from('checkout_sessions')
        .insert({ user_id: userId, session_id: sessionId });
      if (!insertError) return { recorded: true, previous: null };
      if (isMissingTableError(insertError)) return { recorded: false };
      // Another request recorded its session first. Read again and displace that one.
      if (insertError.code === '23505') continue;
      throw new Error(`could not record the open checkout: ${insertError.message}`);
    }

    // The same session again (a repeat inside the bucket): nothing to displace.
    if (held === sessionId) return { recorded: true, previous: held };

    // Compare-and-set: the update matches only if the row still holds `held`.
    const { data: swapped, error: swapError } = await supabase
      .from('checkout_sessions')
      .update({ session_id: sessionId, recorded_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('session_id', held)
      .select('user_id');
    if (swapError) {
      if (isMissingTableError(swapError)) return { recorded: false };
      throw new Error(`could not swap the open checkout: ${swapError.message}`);
    }
    if (swapped && swapped.length > 0) return { recorded: true, previous: held };
    // Lost the race: the row now holds another session. Read it again.
  }
  throw new Error('the open checkout kept changing while it was being recorded');
}

export type DisplacedCheckout = { held: false } | { held: true; status: string };

/**
 * Expires the session a new checkout displaced.
 *
 * Expiry is housekeeping, and a Stripe failure here must not stop a legitimate purchase.
 * So every failure is logged and the purchase proceeds, with one exception. If the
 * displaced session turns out to be COMPLETE and its subscription still holds (the same
 * rule as the guard: a live subscription, or an `incomplete` one inside the window), the
 * customer has already bought this, and a second purchase would double-bill. That is
 * the case the duplicate guard cannot see until the webhook runs, so it is checked here
 * against Stripe, which knows first.
 *
 * Stripe's subscription object carries no last-written time, so an `incomplete` one is
 * judged on our row, with the same window. A row that is missing or unreadable does not
 * hold, as in the guard.
 */
export async function expireDisplacedCheckout(
  stripe: Stripe,
  sessionId: string,
  supabase: SB,
  now: number = Date.now()
): Promise<DisplacedCheckout> {
  try {
    await stripe.checkout.sessions.expire(sessionId);
    return { held: false };
  } catch (e) {
    // Expected when the session is already expired or completed. Ask Stripe which.
    console.warn(
      `[create-checkout] could not expire the earlier session ${sessionId} (${describe(e)}); ` +
        'checking whether it was completed.'
    );
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    });
    if (session.status !== 'complete') return { held: false };
    const subscription = session.subscription;
    if (!subscription || typeof subscription !== 'object') return { held: false };
    if (isLiveStatus(subscription.status)) {
      return { held: true, status: subscription.status };
    }
    if (subscription.status === 'incomplete') {
      const { data: row, error: rowError } = await supabase
        .from('subscriptions')
        .select('id, status, last_event_at, updated_at')
        .eq('id', subscription.id)
        .maybeSingle();
      if (rowError) throw new Error(rowError.message);
      if (row && holdsPurchase(row as PurchaseRow, now)) {
        return { held: true, status: 'incomplete' };
      }
    }
    return { held: false };
  } catch (e) {
    console.error(
      `[create-checkout] could not read the earlier session ${sessionId} (${describe(e)}); ` +
        'proceeding, and the duplicate check will run once the webhook lands.'
    );
    return { held: false };
  }
}

/**
 * Expires a session this request created but must not hand out. Best effort: the
 * session was never returned to the customer, so an expiry that fails leaves nothing
 * payable that anyone holds.
 */
export async function releaseCheckout(stripe: Stripe, sessionId: string): Promise<void> {
  try {
    await stripe.checkout.sessions.expire(sessionId);
  } catch (e) {
    console.error(
      `[create-checkout] could not expire the unused session ${sessionId} (${describe(e)}).`
    );
  }
}
