/**
 * POST /api/sync-checkout
 *
 * Confirms a Checkout purchase when the browser returns from Stripe, so the
 * plan unlocks at once instead of waiting on the webhook. The webhook is still
 * required: it is the only thing that keeps the plan right after the first
 * payment (renewals, cancellations, failed payments, seat changes).
 *
 * Body: { sessionId: string } — the `session_id` Stripe appends to the success URL.
 * Returns:
 *   { status: 'active', plan }  the subscription is live. The plan is written here, or a
 *                               newer webhook event already holds it (the ordering guard
 *                               then keeps that newer state);
 *   { status: 'pending' }       not confirmable yet (unpaid, still incomplete, or a
 *                               price this deployment does not sell). The client
 *                               polls, as it did before this endpoint existed.
 *   403 (generic)               the session is not this account's, or Stripe does not
 *                               know it. Both get the same answer, so a guessed id
 *                               reveals nothing.
 *
 * The client is trusted for one thing: the session id. The owner, the mode, the
 * payment state and the plan are all read from Stripe, and the plan comes from
 * the SUBSCRIPTION's price via priceToPlan, exactly as the webhook derives it.
 * The session's own fields never grant a plan.
 *
 * A guardian purchase (schema §31) is confirmed for the PARENT who made it: the caller is
 * the session's client_reference_id, as always. The plan is applied to the student that the
 * subscription's metadata names, by the same subscription sync the webhook uses.
 *
 * Ordering. The row is stamped with the time captured BEFORE the Stripe call. Stripe
 * answers with the state at some moment during the call, so an event it created while
 * the call was in flight may be missing from the answer. Stamping before the call keeps
 * such an event newer than the stamp, so it still applies when the webhook delivers it.
 * An event created before the call started is already in the answer, and the ordering
 * guard discards it as covered.
 *
 * Repeat calls are harmless: each one re-reads the session and re-applies the same
 * state, which changes nothing that matters. Each call costs one Stripe retrieve, so
 * the client calls once per return.
 *
 * Test-mode fallback: with Stripe unconfigured there is nothing to confirm, so the
 * endpoint answers { status: 'pending', test: true } and the client's poll takes over.
 */
import {
  getStripe,
  getSupabaseAdmin,
  isStripeConfigured,
  isStripeMisconfigured,
  priceToPlan,
  STRIPE_MISCONFIGURED_ERROR,
} from './_lib/stripe';
import { verifyRequestAuth } from './_lib/auth';
import { corsHeadersFor } from './_lib/cors';
import {
  applySubscriptionUpsert,
  lastEventAtOf,
  linkStripeCustomer,
} from './_lib/subscriptionSync';

interface RequestLike {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
}
interface ResponseLike {
  status: (code: number) => ResponseLike;
  json: (data: unknown) => void;
  setHeader?: (name: string, value: string) => void;
  end?: () => void;
}

type SB = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

const headerValue = (raw: string | string[] | undefined): string | undefined =>
  Array.isArray(raw) ? raw[0] : raw;

/** The shape Stripe gives a Checkout Session id: `cs_`, then letters, digits and underscores. */
const CHECKOUT_SESSION_ID = /^cs_[A-Za-z0-9_]{8,200}$/;

/**
 * Subscription statuses that mean the purchase is live. Narrower than the webhook's
 * plan-keeping set on purpose: a first purchase is active or trialing, and anything
 * else is left for the webhook to settle.
 */
const LIVE_SUBSCRIPTION = ['active', 'trialing'];

/** Session payment states that mean the customer has paid, or owes nothing. */
const PAID_SESSION = ['paid', 'no_payment_required'];

const NOT_CONFIRMABLE =
  'We could not confirm a purchase for this account from that checkout session. If you have just paid, wait a minute and refresh; if the plan is still locked, contact us.';

const STRIPE_LOOKUP_FAILED =
  'We could not reach Stripe to confirm your purchase just now, so nothing has changed. Please try again in a minute.';

const APPLY_FAILED =
  'We could not update your account with this purchase just now, so nothing has changed. Please try again in a minute.';

/** Stripe's answer for a session id it does not know. */
const isUnknownSession = (e: unknown): boolean =>
  (e as { code?: string } | null)?.code === 'resource_missing';

/**
 * Puts the row's stamp back after a failed apply. Without this, a failure after the
 * stamp (the profile write, say) would leave the row claiming a state the customer
 * does not have, and the webhook's copy of the same purchase, created earlier, would
 * then be discarded as stale.
 */
const restoreStamp = async (supabase: SB, subId: string, previous: string | null) => {
  const { error } = await supabase
    .from('subscriptions')
    .update({ last_event_at: previous })
    .eq('id', subId);
  if (error) {
    console.error(
      `[sync-checkout] could not restore the ordering stamp for ${subId}:`,
      error.message
    );
  }
};

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
  // Opt-in CORS for split hosting, exactly as customer-portal: the client posts to
  // `${VITE_API_BASE_URL}/api/sync-checkout`, which preflights with Authorization.
  // No ALLOWED_ORIGIN configured → same-origin only.
  const cors = corsHeadersFor(headerValue(req.headers?.origin), process.env.ALLOWED_ORIGIN);
  if (cors && res.setHeader) {
    for (const [name, value] of Object.entries(cors)) res.setHeader(name, value);
  }
  if (req.method === 'OPTIONS') {
    if (cors && res.end) {
      res.status(204);
      res.end();
    } else {
      res.status(403).json({ error: 'Cross-origin access is not enabled for this origin.' });
    }
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  const auth = await verifyRequestAuth(headerValue(req.headers?.authorization));
  if (!auth.ok) {
    res.status(auth.status ?? 401).json({ error: auth.error ?? 'Unauthorized.' });
    return;
  }
  const userId = auth.userId;
  if (!userId) {
    res.status(401).json({ error: 'User identity required to confirm a purchase.' });
    return;
  }

  // The one thing the client is trusted for. Everything else comes from Stripe.
  const sessionId = (req.body as { sessionId?: unknown } | undefined)?.sessionId;
  if (typeof sessionId !== 'string' || !CHECKOUT_SESSION_ID.test(sessionId)) {
    res.status(400).json({ error: 'Missing or invalid sessionId.' });
    return;
  }

  // Same half-configured state as create-checkout: prices are on sale, but the
  // server cannot check a payment. Say so rather than answer as if nothing was bought.
  if (isStripeMisconfigured()) {
    console.error('[sync-checkout]', STRIPE_MISCONFIGURED_ERROR);
    res.status(503).json({ error: STRIPE_MISCONFIGURED_ERROR });
    return;
  }

  if (!isStripeConfigured()) {
    res.status(200).json({ status: 'pending', test: true });
    return;
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    res
      .status(501)
      .json({ error: 'Billing backend not configured (Supabase service role missing).' });
    return;
  }

  const stripe = getStripe()!;

  // The ordering stamp. Captured before the Stripe call; see the header.
  const checkedAt = Math.floor(Date.now() / 1000);

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['subscription'] });
  } catch (e) {
    if (isUnknownSession(e)) {
      // Usually a key from the other Stripe mode (test against live, or the reverse).
      console.warn(
        '[sync-checkout] Stripe does not know this checkout session. Check the server key is from the same mode (test or live) as the checkout.'
      );
      res.status(403).json({ error: NOT_CONFIRMABLE });
      return;
    }
    console.error(
      '[sync-checkout] session lookup failed:',
      e instanceof Error ? e.message : 'unknown error'
    );
    res.status(502).json({ error: STRIPE_LOOKUP_FAILED });
    return;
  }

  // Owner and mode first: a session that is not this account's, or not a subscription,
  // is refused outright whatever its payment state.
  if (session.client_reference_id !== userId || session.mode !== 'subscription') {
    res.status(403).json({ error: NOT_CONFIRMABLE });
    return;
  }

  if (session.status !== 'complete' || !PAID_SESSION.includes(session.payment_status)) {
    res.status(200).json({ status: 'pending' });
    return;
  }

  const subscription = session.subscription;
  if (
    !subscription ||
    typeof subscription !== 'object' ||
    !LIVE_SUBSCRIPTION.includes(subscription.status)
  ) {
    res.status(200).json({ status: 'pending' });
    return;
  }

  const customerId = typeof session.customer === 'string' ? session.customer : undefined;
  const priceId = subscription.items?.data?.[0]?.price?.id ?? '';
  const plan = priceToPlan(priceId);
  if (!customerId) {
    res.status(200).json({ status: 'pending' });
    return;
  }
  if (plan === 'free') {
    // A price this deployment does not sell. The webhook has a fallback for it (keep the
    // row's plan, or grant Plus on a new row, and log loudly). Here we would rather not
    // guess a plan from a price we cannot name, so the webhook settles it.
    console.error(
      `[sync-checkout] price ${priceId || '(none)'} on subscription ${subscription.id} is not in ` +
        "this deployment's price list — not confirming it here."
    );
    res.status(200).json({ status: 'pending' });
    return;
  }

  try {
    // Read the prior stamp before writing anything, so a failed apply can put it back.
    const previous = await lastEventAtOf(supabase, subscription.id);
    await linkStripeCustomer(supabase, userId, customerId);
    try {
      await applySubscriptionUpsert(
        supabase,
        subscription as unknown as Record<string, unknown>,
        checkedAt
      );
    } catch (e) {
      await restoreStamp(supabase, subscription.id, previous);
      throw e;
    }
  } catch (e) {
    console.error(
      '[sync-checkout] could not apply the purchase:',
      e instanceof Error ? e.message : 'unknown error'
    );
    res.status(502).json({ error: APPLY_FAILED });
    return;
  }

  res.status(200).json({ status: 'active', plan });
}
