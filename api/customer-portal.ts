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
import {
  getStripe,
  getSupabaseAdmin,
  isStripeConfigured,
  isStripeMisconfigured,
  resolveReturnBase,
  STRIPE_MISCONFIGURED_ERROR,
} from './_lib/stripe';
import { verifyRequestAuth } from './_lib/auth';
import { corsHeadersFor } from './_lib/cors';

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
  // Opt-in CORS for split hosting (static frontend elsewhere, API here). The
  // client posts billing to `${VITE_API_BASE_URL}${path}`, so on a split-host
  // deployment this POST carries Authorization + Content-Type and the browser
  // fires an OPTIONS preflight first — which we must answer here or opening the
  // billing portal is blocked before it runs. No ALLOWED_ORIGIN configured →
  // no CORS headers → same-origin only, byte-identical to before.
  const cors = corsHeadersFor(headerValue(req.headers?.origin), process.env.ALLOWED_ORIGIN);
  if (cors && res.setHeader) {
    for (const [name, value] of Object.entries(cors)) res.setHeader(name, value);
  }
  if (req.method === 'OPTIONS') {
    // Preflight: succeed only when the origin was allowed above.
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

  // Same half-configured state as create-checkout: a mock portal URL sends a
  // paying customer to a page that does not exist. Say what is wrong instead.
  if (isStripeMisconfigured()) {
    console.error('[customer-portal]', STRIPE_MISCONFIGURED_ERROR);
    res.status(503).json({ error: STRIPE_MISCONFIGURED_ERROR });
    return;
  }

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
    // Generic message to the client; the detail (which can name the Stripe
    // account's portal configuration) stays in the server log.
    console.error(
      '[customer-portal]',
      e instanceof Error ? e.message : 'Portal session creation failed.'
    );
    res.status(500).json({ error: 'Could not open the billing portal. Please try again.' });
  }
}
