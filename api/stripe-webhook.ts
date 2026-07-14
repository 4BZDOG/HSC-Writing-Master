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
 * In test mode (no secret), the body is trusted as-is so the endpoint can be
 * exercised with curl or Stripe CLI `stripe trigger`.
 *
 * Supabase writes use the service-role key (bypasses RLS) since webhook calls
 * have no user session.
 */
import { getStripe, getSupabaseAdmin, isStripeConfigured, priceToPlan } from './_lib/stripe';

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
    const rawBody =
      req.rawBody ?? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
    try {
      event = stripe.webhooks.constructEvent(
        typeof rawBody === 'string' ? rawBody : rawBody.toString(),
        sig,
        webhookSecret
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Signature verification failed.';
      console.error('[stripe-webhook] Signature error:', msg);
      res.status(400).json({ error: `Webhook signature verification failed: ${msg}` });
      return;
    }
  } else {
    // No webhook secret — trust the body (test/dev mode only).
    console.warn('[stripe-webhook] STRIPE_WEBHOOK_SECRET not set — skipping signature check.');
    event = req.body as { type?: string; data?: { object?: Record<string, unknown> } };
  }

  if (!event || typeof event !== 'object' || !('type' in event)) {
    res.status(400).json({ error: 'Invalid event payload.' });
    return;
  }

  const eventType = (event as { type: string }).type;
  const obj = (event as { data: { object: Record<string, unknown> } }).data.object;

  try {
    switch (eventType) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(supabase, obj);
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
 * profile using the `client_reference_id` (the user's auth.uid).
 */
async function handleCheckoutCompleted(supabase: SB, session: Record<string, unknown>) {
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

  const items = sub.items as { data?: Array<{ price?: { id?: string } }> } | undefined;
  const priceId = items?.data?.[0]?.price?.id ?? '';
  const plan = priceToPlan(priceId);

  const periodStart = sub.current_period_start as number | undefined;
  const periodEnd = sub.current_period_end as number | undefined;

  // Find the user who owns this customer ID.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!profile) {
    console.warn('[stripe-webhook] No profile for customer', customerId);
    return;
  }

  const userId = profile.id as string;

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
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  if (subError) {
    console.error('[stripe-webhook] subscription upsert failed:', subError.message);
    throw subError;
  }

  // Update the cached plan on the profile.
  const activePlan = status === 'active' || status === 'trialing' ? plan : 'free';
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
}

/**
 * customer.subscription.deleted — marks the subscription inactive and
 * downgrades the profile back to free.
 */
async function handleSubscriptionDeleted(supabase: SB, sub: Record<string, unknown>) {
  const subId = sub.id as string;
  const customerId = sub.customer as string;

  // Mark the subscription row as canceled.
  await supabase
    .from('subscriptions')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('id', subId);

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

  const subId = invoice.subscription as string | undefined;
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
