/**
 * POST /api/create-checkout
 *
 * Creates a Stripe Checkout Session for the authenticated user and returns
 * the URL to redirect them to. The user's Supabase ID is stored as
 * `client_reference_id` so the webhook can link the payment to the profile.
 *
 * Body: { priceId: string, returnUrl?: string }
 * Returns: { url: string } on success, or { error: string }.
 *
 * `returnUrl` is the page Stripe should redirect back to — the client sends
 * its own base URL because the Origin header loses the base path on sub-path
 * hosting (see resolveReturnBase). Validated same-origin server-side.
 *
 * Test-mode fallback: when Stripe is unconfigured the endpoint returns a
 * mock URL pointing to /#/upgrade-test so the client flow can be exercised
 * end-to-end without a real Stripe account.
 */
import { getStripe, getSupabaseAdmin, isStripeConfigured, resolveReturnBase } from './_lib/stripe';
import { verifyRequestAuth } from './_lib/auth';

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

const headerValue = (raw: string | string[] | undefined): string | undefined =>
  Array.isArray(raw) ? raw[0] : raw;

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  const auth = await verifyRequestAuth(headerValue(req.headers?.authorization));
  if (!auth.ok) {
    res.status(auth.status ?? 401).json({ error: auth.error ?? 'Unauthorized.' });
    return;
  }

  const body = req.body as { priceId?: string; returnUrl?: string } | undefined;
  const priceId = body?.priceId;
  if (!priceId || typeof priceId !== 'string') {
    res.status(400).json({ error: 'Missing or invalid priceId.' });
    return;
  }

  if (!auth.userId) {
    res.status(401).json({ error: 'User identity required to create a checkout session.' });
    return;
  }

  const returnBase = resolveReturnBase(
    headerValue(req.headers?.origin),
    headerValue(req.headers?.referer),
    body?.returnUrl
  );

  if (!isStripeConfigured()) {
    // Test-mode: return a fake URL so the client redirect logic can be verified.
    res.status(200).json({
      url: `${returnBase}#/upgrade-test?price=${encodeURIComponent(priceId)}`,
      test: true,
    });
    return;
  }

  const stripe = getStripe()!;

  try {
    // Reuse the user's existing Stripe customer if they've checked out before.
    // Without this every checkout creates a NEW customer, and the billing
    // portal (which looks up the stored customer id) loses sight of older
    // subscriptions.
    let existingCustomerId: string | undefined;
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('stripe_customer_id')
        .eq('id', auth.userId)
        .maybeSingle();
      if (profile?.stripe_customer_id) existingCustomerId = profile.stripe_customer_id;
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${returnBase}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnBase}?checkout=cancelled`,
      client_reference_id: auth.userId ?? undefined,
      ...(existingCustomerId ? { customer: existingCustomerId } : {}),
      // Stamp the Supabase user onto the subscription itself: webhook events
      // (customer.subscription.created) can arrive BEFORE checkout.completed
      // links the customer id to the profile, and without this metadata the
      // subscription handler would find no profile and silently drop the plan.
      subscription_data: { metadata: { supabase_user_id: auth.userId } },
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      tax_id_collection: { enabled: true },
    });

    res.status(200).json({ url: session.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Stripe session creation failed.';
    console.error('[create-checkout]', message);
    res.status(500).json({ error: message });
  }
}
