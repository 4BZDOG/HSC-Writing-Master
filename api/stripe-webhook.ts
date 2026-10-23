/**
 * POST /api/stripe-webhook
 *
 * Receives Stripe webhook events and keeps the Supabase profile + subscriptions
 * table in sync. This is the single source of truth for plan state.
 *
 * Handled events:
 *   - checkout.session.completed — link Stripe customer to Supabase user
 *   - customer.subscription.created/updated/deleted — sync subscription state
 *   - invoice.payment_failed / invoice.payment_action_required — flag the
 *     profile for grace-period UI (SCA challenge is handled the same way)
 *   - charge.dispute.created / charge.dispute.closed / charge.refunded — record a
 *     billing incident and alert the operator. Nothing is cancelled or refunded,
 *     and no plan changes (api/_lib/disputes.ts, schema §29)
 *
 * Security: events are verified with the STRIPE_WEBHOOK_SECRET signing secret.
 * Only outside any deployment (no VERCEL_ENV, NODE_ENV not production: local
 * dev and Vitest) is the body trusted as-is with no secret set, so the endpoint
 * can be exercised with curl or Stripe CLI `stripe trigger`. On ANY deployment
 * (production, preview or development; see isDeployedRuntime) a missing secret
 * is a hard 500: an unsigned endpoint lets anyone POST a forged subscription
 * event and grant themselves a paid plan. A preview is not exempt, because it
 * can share the production database.
 *
 * Supabase writes use the service-role key (bypasses RLS) since webhook calls
 * have no user session.
 */
import {
  getStripe,
  getSupabaseAdmin,
  isDeployedRuntime,
  isStripeConfigured,
  priceToPlan,
} from './_lib/stripe';
import { claimEvent, markEventProcessed, releaseEvent } from './_lib/stripeLedger';
import { handleChargeRefunded, handleDisputeClosed, handleDisputeCreated } from './_lib/disputes';
import {
  applySubscriptionUpsert,
  eventStamp,
  isStaleEvent,
  linkStripeCustomer,
} from './_lib/subscriptionSync';

interface RequestLike {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  /** Raw body buffer — Vercel provides this for signature verification. */
  rawBody?: string | Buffer;
}
interface ResponseLike {
  status: (code: number) => ResponseLike;
  json: (data: unknown) => void;
  setHeader?: (name: string, value: string) => void;
  end?: () => void;
}

const headerValue = (raw: string | string[] | undefined): string | undefined =>
  Array.isArray(raw) ? raw[0] : raw;

/**
 * With bodyParser disabled, Vercel's Node runtime populates neither req.body
 * nor req.rawBody — the payload must be read from the request stream itself.
 * Checks the pre-parsed fields first so tests and other runtimes keep working.
 */
const readRawBody = async (req: RequestLike): Promise<string | undefined> => {
  if (typeof req.rawBody === 'string') return req.rawBody;
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody.toString('utf8');
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');

  const stream = req as unknown as Partial<AsyncIterable<Buffer | string>>;
  if (typeof stream[Symbol.asyncIterator] === 'function') {
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer | string>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    if (chunks.length > 0) return Buffer.concat(chunks).toString('utf8');
  }

  return req.body != null ? JSON.stringify(req.body) : undefined;
};

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  if (!isStripeConfigured()) {
    res.status(501).json({ error: 'Stripe not configured.' });
    return;
  }

  const stripe = getStripe()!;
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    res.status(501).json({ error: 'Supabase service role not configured.' });
    return;
  }

  // ── Verify the event signature ──────────────────────────────────────────
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;

  if (webhookSecret) {
    const sig = headerValue(req.headers?.['stripe-signature']);
    if (!sig) {
      res.status(400).json({ error: 'Missing stripe-signature header.' });
      return;
    }
    const rawBody = await readRawBody(req);
    if (!rawBody) {
      res.status(400).json({ error: 'Empty request body.' });
      return;
    }
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Signature verification failed.';
      console.error('[stripe-webhook] Signature error:', msg);
      res.status(400).json({ error: `Webhook signature verification failed: ${msg}` });
      return;
    }
  } else if (isDeployedRuntime()) {
    // An unsigned deployed endpoint would let anyone forge a subscription event
    // and hand themselves a paid plan. That holds on a preview too, which can
    // share production's database, so this is not limited to production. Fail
    // closed and stay loud — Stripe retries, so the events survive until the
    // secret is configured. (A `vercel dev` run also sets VERCEL_ENV, so it
    // needs the secret too: `stripe listen` prints one.)
    console.error(
      '[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set on a deployment — refusing unsigned events.'
    );
    res.status(500).json({ error: 'Webhook signing secret not configured.' });
    return;
  } else {
    // No webhook secret and no deployment: local dev and tests only — trust the body.
    console.warn('[stripe-webhook] STRIPE_WEBHOOK_SECRET not set — skipping signature check.');
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      event = req.body as { type?: string; data?: { object?: Record<string, unknown> } };
    } else {
      const raw = await readRawBody(req);
      if (!raw) {
        res.status(400).json({ error: 'Empty request body.' });
        return;
      }
      try {
        event = JSON.parse(raw);
      } catch {
        res.status(400).json({ error: 'Invalid JSON body.' });
        return;
      }
    }
  }

  if (!event || typeof event !== 'object' || !('type' in event)) {
    res.status(400).json({ error: 'Invalid event payload.' });
    return;
  }

  if (!('data' in event) || !(event as Record<string, unknown>).data) {
    res.status(400).json({ error: 'Event missing data field.' });
    return;
  }

  const eventType = (event as { type: string }).type;
  const eventId = (event as { id?: string }).id;
  const eventCreated = (event as { created?: number }).created;
  const obj = (event as { data: { object: Record<string, unknown> } }).data.object;

  // Idempotency: Stripe delivers AT LEAST once, so a slow response here gets
  // the same event again. Claim the event id before handling it; a finished
  // event is acknowledged without being applied twice. The claim/lease rules
  // (including how a crash mid-handler is recovered) live in stripeLedger.ts.
  const claim = await claimEvent(supabase, eventId, eventType, eventCreated);
  if (claim === 'duplicate') {
    res.status(200).json({ received: true, duplicate: true });
    return;
  }
  if (claim === 'busy') {
    // Another invocation holds a live claim. Non-2xx makes Stripe redeliver,
    // by which time that claim has finished (a duplicate) or gone stale (taken over).
    res.status(409).json({ error: 'Event is already being processed. Stripe will retry.' });
    return;
  }

  try {
    switch (eventType) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(supabase, stripe, obj, eventCreated);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await applySubscriptionUpsert(supabase, obj, eventCreated);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(supabase, obj, eventCreated);
        break;

      // A failed charge and an unfinished 3-D Secure step land the customer in
      // the same place — access continues, but they must act in the portal
      // before Stripe gives up. Without the second case an SCA challenge is
      // silent: the customer is never told their bank wants a confirmation.
      case 'invoice.payment_failed':
      case 'invoice.payment_action_required':
        await handlePaymentFailed(supabase, obj, eventCreated);
        break;

      // A dispute has an evidence deadline, and a full refund may end a licence. Both
      // are recorded and alerted for a person; neither changes a plan here.
      case 'charge.dispute.created':
        await handleDisputeCreated(supabase, stripe, obj);
        break;

      case 'charge.dispute.closed':
        await handleDisputeClosed(supabase, obj);
        break;

      case 'charge.refunded':
        await handleChargeRefunded(supabase, obj);
        break;

      default:
        // Unhandled event — acknowledge so Stripe doesn't retry.
        break;
    }

    // Stamp only after the handler has returned: a stamp means "applied".
    if (claim === 'claimed' && eventId) await markEventProcessed(supabase, eventId);

    res.status(200).json({ received: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal webhook handler error.';
    console.error(`[stripe-webhook] Error handling ${eventType}:`, msg);
    // Release the claim so Stripe's retry actually reprocesses the event
    // instead of being waved through as a duplicate.
    if (claim === 'claimed' && eventId) await releaseEvent(supabase, eventId);
    res.status(500).json({ error: msg });
  }
}

// ── Event handlers ──────────────────────────────────────────────────────────

type SB = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

/**
 * checkout.session.completed — links the Stripe customer ID to the Supabase
 * profile using the `client_reference_id` (the user's auth.uid), then
 * activates the plan immediately by retrieving the session's subscription and
 * running the normal upsert. This removes the activation's dependence on
 * webhook ordering AND shortens the post-checkout wait: previously the plan
 * only landed when customer.subscription.created/updated happened to arrive
 * and match a profile. Best-effort — if the retrieve fails, the subscription
 * events still activate the plan as before.
 */
async function handleCheckoutCompleted(
  supabase: SB,
  stripe: ReturnType<typeof getStripe>,
  session: Record<string, unknown>,
  eventCreated?: number
) {
  const userId = session.client_reference_id as string | undefined;
  const customerId = session.customer as string | undefined;
  if (!userId || !customerId) {
    console.warn(
      '[stripe-webhook] checkout.session.completed missing client_reference_id or customer'
    );
    return;
  }

  await linkStripeCustomer(supabase, userId, customerId);

  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : ((session.subscription as { id?: string } | null)?.id ?? undefined);
  if (stripe && subscriptionId && session.mode === 'subscription') {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await applySubscriptionUpsert(
        supabase,
        subscription as unknown as Record<string, unknown>,
        eventCreated
      );
    } catch (e) {
      console.warn(
        '[stripe-webhook] eager activation failed (subscription events will cover it):',
        e instanceof Error ? e.message : e
      );
    }
  }
}

/**
 * customer.subscription.deleted — marks the subscription inactive and
 * downgrades the profile back to free.
 */
async function handleSubscriptionDeleted(
  supabase: SB,
  sub: Record<string, unknown>,
  eventCreated?: number
) {
  const subId = sub.id as string;
  const customerId = sub.customer as string;

  if (await isStaleEvent(supabase, subId, eventCreated)) {
    console.log(`[stripe-webhook] ignoring out-of-order delete for ${subId}`);
    return;
  }

  // Mark the subscription row as cancelled.
  const { error: cancelError } = await supabase
    .from('subscriptions')
    .update({
      status: 'canceled',
      updated_at: new Date().toISOString(),
      ...eventStamp(eventCreated),
    })
    .eq('id', subId);

  if (cancelError) {
    console.error('[stripe-webhook] subscription cancel update failed:', cancelError.message);
    throw cancelError;
  }

  // End any school licence backed by this subscription — members lose the
  // school plan at their next session refresh.
  await supabase
    .from('schools')
    .update({ plan_status: 'canceled', plan_period_end: null, plan_cancel_at_period_end: false })
    .eq('stripe_subscription_id', subId);

  // Find the user and downgrade their cached plan to free (unless they have
  // another active subscription, which resolve_stripe_plan handles). The customer
  // link is the first route, but it can be missing or overwritten, for example
  // when two checkouts race before either has linked a customer. The subscription
  // row names its user directly, so fall back to it. Giving up here would leave a
  // cancelled subscriber on Plus indefinitely.
  //
  // A guardian purchase (schema §31) is paid by the parent, whose customer this is, but the
  // plan belongs to the student the row names. Going through the customer would lower the
  // parent's plan and leave the student on Plus. So a row that names a payer is resolved
  // from the row first.
  const { data: ownRow } = await supabase
    .from('subscriptions')
    .select('user_id, payer_id')
    .eq('id', subId)
    .maybeSingle();
  let userId = ownRow?.payer_id ? (ownRow.user_id as string) : undefined;

  const { data: byCustomer } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  userId = userId ?? (byCustomer?.id as string | undefined);
  if (!userId) {
    const { data: owned } = await supabase
      .from('subscriptions')
      .select('user_id')
      .eq('id', subId)
      .maybeSingle();
    userId = owned?.user_id as string | undefined;
  }
  if (!userId) return;

  // Use the DB function to resolve the correct plan (handles multiple subs).
  const { data: resolvedPlan } = await supabase.rpc('resolve_stripe_plan', {
    p_user_id: userId,
  });

  await supabase
    .from('profiles')
    .update({
      stripe_plan: resolvedPlan ?? 'free',
      plan_period_end: null,
    })
    .eq('id', userId);
}

/**
 * invoice.payment_failed — we don't immediately downgrade (Stripe retries),
 * but we set the plan to past_due so the UI can show a warning banner.
 *
 * Ordered like every other subscription write. This handler used to skip both
 * halves of the ordering guard, which made the banner it exists to raise easy
 * to lose: a `customer.subscription.updated` that Stripe generated BEFORE the
 * failed charge but delivered after it would find no stamp to compare against,
 * overwrite `past_due` with `active`, and take the "update your card" prompt
 * off the screen. The customer then heard nothing until the retries ran out
 * and the plan was cancelled outright.
 */
async function handlePaymentFailed(
  supabase: SB,
  invoice: Record<string, unknown>,
  eventCreated?: number
) {
  const customerId = invoice.customer as string | undefined;
  if (!customerId) return;

  // Stripe API ≥ 2025-03-31 (basil) removed invoice.subscription; the
  // reference now lives at invoice.parent.subscription_details.subscription
  // (string or expanded object). Check both shapes so the past_due flag is
  // set regardless of the webhook endpoint's configured API version.
  const parent = invoice.parent as
    | { subscription_details?: { subscription?: string | { id?: string } } }
    | undefined;
  const parentSub = parent?.subscription_details?.subscription;
  const subId =
    (typeof invoice.subscription === 'string' ? invoice.subscription : undefined) ??
    (typeof parentSub === 'string' ? parentSub : parentSub?.id);

  if (!subId) return;

  if (await isStaleEvent(supabase, subId, eventCreated)) {
    console.log(`[stripe-webhook] ignoring out-of-order payment failure for ${subId}`);
    return;
  }

  await supabase
    .from('subscriptions')
    .update({
      status: 'past_due',
      updated_at: new Date().toISOString(),
      ...eventStamp(eventCreated),
    })
    .eq('id', subId);
}

// Vercel raw-body config: disable the default JSON parser so we get the raw
// string for signature verification.
export const config = { api: { bodyParser: false } };
