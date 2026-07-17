/**
 * POST /api/customer-portal
 *
 * Creates a Stripe Billing Portal session so the user can manage their
 * subscription (upgrade, downgrade, cancel, update payment method). Returns
 * the portal URL.
 *
 * The endpoint looks up the user's `stripe_customer_id` from the Supabase
 * profile. If the user has never checked out, it returns an error.
 *
 * Test-mode fallback: when Stripe is unconfigured, returns a mock URL.
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

  const authHeader = headerValue(req.headers?.authorization);
  const auth = await verifyRequestAuth(authHeader);
  if (!auth.ok) {
    res.status(auth.status ?? 401).json({ error: auth.error ?? 'Unauthorized.' });
    return;
  }

  if (!auth.userId) {
    res.status(401).json({ error: 'User identity required for billing portal.' });
    return;
  }

  // The client sends its own base URL because the Origin header loses the
  // base path on sub-path hosting (see resolveReturnBase in _lib/stripe.ts).
  const returnBase = resolveReturnBase(
    headerValue(req.headers?.origin),
    headerValue(req.headers?.referer),
    (req.body as { returnUrl?: string } | undefined)?.returnUrl
  );

  if (!isStripeConfigured()) {
    res.status(200).json({
      url: `${returnBase}#/portal-test`,
      test: true,
    });
    return;
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    res
      .status(501)
      .json({ error: 'Billing backend not configured (Supabase service role missing).' });
    return;
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', auth.userId)
    .single();

  if (profileError || !profile?.stripe_customer_id) {
    res.status(404).json({ error: 'No billing account found. Please subscribe first.' });
    return;
  }

  const stripe = getStripe()!;

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: returnBase,
    });

    res.status(200).json({ url: session.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Portal session creation failed.';
    console.error('[customer-portal]', message);
    res.status(500).json({ error: message });
  }
}
