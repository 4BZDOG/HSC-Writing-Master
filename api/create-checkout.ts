/**
 * POST /api/create-checkout
 *
 * Creates a Stripe Checkout Session for the authenticated user and returns
 * the URL to redirect them to. The user's Supabase ID is stored as
 * `client_reference_id` so the webhook can link the payment to the profile.
 *
 * Body: { priceId: string }
 * Returns: { url: string } on success, or { error: string }.
 *
 * Test-mode fallback: when Stripe is unconfigured the endpoint returns a
 * mock URL pointing to /#/upgrade-test so the client flow can be exercised
 * end-to-end without a real Stripe account.
 */
import { getStripe, isStripeConfigured } from './_lib/stripe';
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

  const body = req.body as { priceId?: string } | undefined;
  const priceId = body?.priceId;
  if (!priceId || typeof priceId !== 'string') {
    res.status(400).json({ error: 'Missing or invalid priceId.' });
    return;
  }

  if (!isStripeConfigured()) {
    // Test-mode: return a fake URL so the client redirect logic can be verified.
    const origin =
      headerValue(req.headers?.origin) ||
      (headerValue(req.headers?.referer) || '').replace(/\/[^/]*$/, '') ||
      'http://localhost:3000';
    res.status(200).json({
      url: `${origin}/#/upgrade-test?price=${encodeURIComponent(priceId)}`,
      test: true,
    });
    return;
  }

  const stripe = getStripe()!;

  try {
    const origin =
      headerValue(req.headers?.origin) ||
      (headerValue(req.headers?.referer) || '').replace(/\/[^/]*$/, '') ||
      'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?checkout=cancelled`,
      client_reference_id: auth.userId ?? undefined,
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
