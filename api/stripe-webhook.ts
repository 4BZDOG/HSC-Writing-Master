/**
 * POST /api/stripe-webhook
 *
 * Receives Stripe webhook events and keeps the Supabase profile + subscriptions
 * table in sync. This is the single source of truth for plan state.
 *
 * Handled events:
 *   - checkout.session.completed — link Stripe customer to Supabase user
 *   - customer.subscription.created/updated/deleted — sync subscription state
 *   - invoice.payment_failed — flag the profile for grace-period UI
 *
 * Security: events are verified with the STRIPE_WEBHOOK_SECRET signing secret.
 * Outside production (no secret set), the body is trusted as-is so the
 * endpoint can be exercised with curl or Stripe CLI `stripe trigger`. In
 * production a missing secret is a hard 500: an unsigned endpoint lets anyone
 * POST a forged subscription event and grant themselves a paid plan.
 *
 * Supabase writes use the service-role key (bypasses RLS) since webhook calls
 * have no user session.
 */
import {
  getStripe,
  getSupabaseAdmin,
  isProductionRuntime,
  isStripeConfigured,
  priceToPlan,
} from './_lib/stripe';

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
  } else if (isProductionRuntime()) {
    // An unsigned production endpoint would let anyone forge a subscription
    // event and hand themselves a paid plan. Fail closed and stay loud —
    // Stripe retries, so the events survive until the secret is configured.
    console.error(
      '[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set in production — refusing unsigned events.'
    );
    res.status(500).json({ error: 'Webhook signing secret not configured.' });
    return;
  } else {
    // No webhook secret outside production — trust the body (dev/test only).
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
  const obj = (event as { data: { object: Record<string, unknown> } }).data.object;

  try {
    switch (eventType) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(supabase, stripe, obj);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpsert(supabase, obj);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(supabase, obj);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(supabase, obj);
        break;

      default:
        // Unhandled event — acknowledge so Stripe doesn't retry.
        break;
    }

    res.status(200).json({ received: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal webhook handler error.';
    console.error(`[stripe-webhook] Error handling ${eventType}:`, msg);
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
  session: Record<string, unknown>
) {
  const userId = session.client_reference_id as string | undefined;
  const customerId = session.customer as string | undefined;
  if (!userId || !customerId) {
    console.warn(
      '[stripe-webhook] checkout.session.completed missing client_reference_id or customer'
    );
    return;
  }

  const { error } = await supabase
    .from('profiles')
    .update({ stripe_customer_id: customerId })
    .eq('id', userId);

  if (error) {
    console.error('[stripe-webhook] Failed to link customer:', error.message);
    throw error;
  }

  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : ((session.subscription as { id?: string } | null)?.id ?? undefined);
  if (stripe && subscriptionId && session.mode === 'subscription') {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await handleSubscriptionUpsert(supabase, subscription as unknown as Record<string, unknown>);
    } catch (e) {
      console.warn(
        '[stripe-webhook] eager activation failed (subscription events will cover it):',
        e instanceof Error ? e.message : e
      );
    }
  }
}

/**
 * customer.subscription.created / updated — upserts the subscription row
 * and updates the profile's cached plan.
 */
async function handleSubscriptionUpsert(supabase: SB, sub: Record<string, unknown>) {
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
  const plan = priceToPlan(priceId);
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

  // Find the user who owns this customer ID (and their school, for seat
  // licences).
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, school_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  let userId = profile?.id as string | undefined;
  let schoolId = (profile?.school_id as string | undefined) ?? undefined;

  // Webhook ordering isn't guaranteed: customer.subscription.created can land
  // BEFORE checkout.session.completed links the customer id to the profile.
  // create-checkout stamps the Supabase user id onto the subscription's
  // metadata for exactly this case — use it, and backfill the customer link.
  if (!userId) {
    const metadata = sub.metadata as Record<string, string> | undefined;
    const metaUserId = metadata?.supabase_user_id;
    if (metaUserId) {
      userId = metaUserId;
      // profiles.stripe_customer_id is uniquely indexed, so this fails if the
      // id is already claimed by another profile. Log it — the plan write
      // below still succeeds, but the portal lookup would use the older link.
      const { error: linkError } = await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', metaUserId);
      if (linkError) {
        console.error('[stripe-webhook] customer backfill failed:', linkError.message);
      }
      const { data: metaProfile } = await supabase
        .from('profiles')
        .select('school_id')
        .eq('id', metaUserId)
        .maybeSingle();
      schoolId = (metaProfile?.school_id as string | undefined) ?? undefined;
    }
  }

  if (!userId) {
    console.warn('[stripe-webhook] No profile for customer', customerId);
    return;
  }

  // Upsert the subscription row.
  const { error: subError } = await supabase.from('subscriptions').upsert(
    {
      id: subId,
      user_id: userId,
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
  // invoice.payment_failed handler above, which deliberately doesn't
  // downgrade. The plan is only dropped on terminal states (canceled,
  // unpaid, incomplete_expired), which Stripe reaches after retries are
  // exhausted (customer.subscription.deleted also fires for cancellations).
  // The client reads the subscription row's `past_due` status directly
  // (RLS: users read own subscriptions) to show a fix-your-payment banner.
  const keepsPlan = status === 'active' || status === 'trialing' || status === 'past_due';
  const activePlan = keepsPlan ? plan : 'free';
  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      stripe_plan: activePlan,
      plan_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    })
    .eq('id', userId);

  if (profileError) {
    console.error('[stripe-webhook] profile plan update failed:', profileError.message);
    throw profileError;
  }

  // School seat licence: sync the purchaser's school so every member holds
  // the plan (the client resolves membership → plan at sign-in). Best-effort:
  // a purchaser without a school still gets the plan personally, and an admin
  // can attach the school later.
  if (plan === 'school') {
    if (schoolId) {
      const { error: schoolError } = await supabase
        .from('schools')
        .update({
          stripe_subscription_id: subId,
          plan_seats: seats,
          plan_status: status,
          plan_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
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

/**
 * customer.subscription.deleted — marks the subscription inactive and
 * downgrades the profile back to free.
 */
async function handleSubscriptionDeleted(supabase: SB, sub: Record<string, unknown>) {
  const subId = sub.id as string;
  const customerId = sub.customer as string;

  // Mark the subscription row as cancelled.
  const { error: cancelError } = await supabase
    .from('subscriptions')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('id', subId);

  if (cancelError) {
    console.error('[stripe-webhook] subscription cancel update failed:', cancelError.message);
    throw cancelError;
  }

  // End any school licence backed by this subscription — members lose the
  // school plan at their next session refresh.
  await supabase
    .from('schools')
    .update({ plan_status: 'canceled', plan_period_end: null })
    .eq('stripe_subscription_id', subId);

  // Find the user and downgrade their cached plan to free (unless they have
  // another active subscription, which resolve_stripe_plan handles).
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!profile) return;

  // Use the DB function to resolve the correct plan (handles multiple subs).
  const { data: resolvedPlan } = await supabase.rpc('resolve_stripe_plan', {
    p_user_id: profile.id,
  });

  await supabase
    .from('profiles')
    .update({
      stripe_plan: resolvedPlan ?? 'free',
      plan_period_end: null,
    })
    .eq('id', profile.id);
}

/**
 * invoice.payment_failed — we don't immediately downgrade (Stripe retries),
 * but we set the plan to past_due so the UI can show a warning banner.
 */
async function handlePaymentFailed(supabase: SB, invoice: Record<string, unknown>) {
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

  if (subId) {
    await supabase
      .from('subscriptions')
      .update({ status: 'past_due', updated_at: new Date().toISOString() })
      .eq('id', subId);
  }
}

// Vercel raw-body config: disable the default JSON parser so we get the raw
// string for signature verification.
export const config = { api: { bodyParser: false } };
