/**
 * POST /api/create-checkout
 *
 * Creates a Stripe Checkout Session for the authenticated user and returns
 * the URL to redirect them to. The user's Supabase ID is stored as
 * `client_reference_id` so the webhook can link the payment to the profile.
 *
 * Body: { priceId: string, returnUrl?: string, seats?: number }
 * Returns: { url: string } on success, or { error: string }.
 *
 * `returnUrl` is the page Stripe should redirect back to — the client sends
 * its own base URL because the Origin header loses the base path on sub-path
 * hosting (see resolveReturnBase). Validated same-origin server-side.
 *
 * `seats` (clamped to SCHOOL_SEAT_LIMITS, 5–1000) is honoured ONLY for the
 * school licence price (STRIPE_SCHOOL_PRICE_ID) — individual Plus prices
 * always check out with quantity 1 regardless of what the client sends.
 * School licences are also refused unless the buyer is a teacher or admin.
 *
 * Test-mode fallback: when Stripe is unconfigured the endpoint returns a
 * mock URL pointing to /#/upgrade-test so the client flow can be exercised
 * end-to-end without a real Stripe account.
 */
import {
  configuredPrices,
  getStripe,
  getSupabaseAdmin,
  isStripeConfigured,
  isStripeMisconfigured,
  resolveReturnBase,
  STRIPE_MISCONFIGURED_ERROR,
} from './_lib/stripe';
import { SCHOOL_SEAT_LIMITS } from './_lib/entitlements';
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
  // fires an OPTIONS preflight first — which we must answer here or the whole
  // checkout is blocked before it runs. No ALLOWED_ORIGIN configured → no CORS
  // headers → same-origin only, byte-identical to before.
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

  const auth = await verifyRequestAuth(headerValue(req.headers?.authorization));
  if (!auth.ok) {
    res.status(auth.status ?? 401).json({ error: auth.error ?? 'Unauthorized.' });
    return;
  }

  const body = req.body as { priceId?: string; returnUrl?: string; seats?: number } | undefined;
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

  // Prices published to the browser but no server key: the caller clicked a
  // real Upgrade button, so answer with the reason rather than a mock URL they
  // will follow into a page that does not exist. The client surfaces this
  // message directly (see postBilling in services/entitlements.ts).
  if (isStripeMisconfigured()) {
    console.error('[create-checkout]', STRIPE_MISCONFIGURED_ERROR);
    res.status(503).json({ error: STRIPE_MISCONFIGURED_ERROR });
    return;
  }

  if (!isStripeConfigured()) {
    // Test-mode: return a fake URL so the client redirect logic can be verified.
    res.status(200).json({
      url: `${returnBase}#/upgrade-test?price=${encodeURIComponent(priceId)}`,
      test: true,
    });
    return;
  }

  // Only prices this deployment actually sells may be checked out. Without
  // this the client could name ANY price in the Stripe account — including
  // ones priceToPlan doesn't recognise, which take the customer's money and
  // grant them nothing (the webhook would resolve the plan to 'free').
  const sellablePrices = configuredPrices();
  const priceCount = Object.keys(sellablePrices).length;
  if (priceCount === 0) {
    console.error('[create-checkout] Stripe is configured but no price IDs are set.');
    res.status(501).json({ error: 'No plans are available for purchase yet.' });
    return;
  }
  if (!sellablePrices[priceId]) {
    res.status(400).json({ error: 'Unknown plan. Please refresh and try again.' });
    return;
  }

  const stripe = getStripe()!;

  try {
    // Reuse the user's existing Stripe customer if they've checked out before.
    // Without this every checkout creates a NEW customer, and the billing
    // portal (which looks up the stored customer id) loses sight of older
    // subscriptions.
    let existingCustomerId: string | undefined;
    let customerEmail: string | undefined;
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('stripe_customer_id, role')
        .eq('id', auth.userId)
        .maybeSingle();
      if (profile?.stripe_customer_id) existingCustomerId = profile.stripe_customer_id;

      // A school licence grants the plan to EVERY member of the buyer's
      // school, so buying one is a staff action. The client only shows the
      // seat picker to teachers/admins; enforce the same rule here rather
      // than trusting that. (Skipped when Supabase is unconfigured — there is
      // no role to check, matching the auth gate's mock-mode parity.)
      if (sellablePrices[priceId] === 'school' && !['teacher', 'admin'].includes(profile?.role)) {
        res.status(403).json({
          error: 'School licences are purchased by a teacher or admin account.',
        });
        return;
      }

      // Refuse a second concurrent subscription. Checkout reuses the Stripe
      // CUSTOMER (above) but Stripe itself is happy to open a second, parallel
      // subscription on that customer — and nothing downstream stops it:
      // resolve_stripe_plan simply picks the newest row, so the older
      // subscription keeps billing silently while the customer is charged
      // twice. A user who is already subscribed can reach this endpoint any
      // number of ways — a teacher re-opening the modal to top up seats, a
      // `cancel_at_period_end` user who still holds the plan, or anyone who
      // clicks Upgrade a second time — so the guard lives here on the server
      // rather than in the UI. `past_due` counts as active: Stripe is still
      // retrying that charge (see the webhook's grace-period rule), so the
      // plan is live and a fresh checkout would double-bill.
      //
      // Plan CHANGES (upgrade/downgrade, add seats) go through the billing
      // portal by design — this is only a duplicate-purchase guard, not an
      // in-app switcher. Applies to both Plus and School because it keys on
      // the user, before the price is inspected.
      const { data: existingSub } = await supabase
        .from('subscriptions')
        .select('id, status')
        .eq('user_id', auth.userId)
        .in('status', ['active', 'trialing', 'past_due'])
        .limit(1)
        .maybeSingle();
      if (existingSub) {
        res.status(409).json({
          error:
            'You already have an active subscription. Use “Manage subscription” to change your plan or seats.',
        });
        return;
      }

      // First checkout for this user: prefill their account email so the new
      // Stripe customer is identifiable and receipts / failed-payment recovery
      // emails reach the right inbox. Best-effort — checkout works without it.
      if (!existingCustomerId) {
        try {
          const { data } = await supabase.auth.admin.getUserById(auth.userId);
          customerEmail = data?.user?.email ?? undefined;
        } catch {
          /* prefill only */
        }
      }
    }

    // Seat quantity applies only to the school licence price; everything else
    // is an individual subscription and always bills one seat. The bounds must
    // match SCHOOL_SEAT_LIMITS in services/entitlements.ts — the seat picker
    // won't go below 5, and a server that quietly accepted 1 would sell a
    // whole-school licence for one seat's money to anyone posting directly.
    const isSchoolPrice = sellablePrices[priceId] === 'school';
    const seats = isSchoolPrice
      ? Math.min(
          SCHOOL_SEAT_LIMITS.max,
          Math.max(
            SCHOOL_SEAT_LIMITS.min,
            Math.trunc(Number(body?.seats ?? SCHOOL_SEAT_LIMITS.min)) || SCHOOL_SEAT_LIMITS.min
          )
        )
      : 1;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: seats }],
      success_url: `${returnBase}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnBase}?checkout=cancelled`,
      client_reference_id: auth.userId ?? undefined,
      ...(existingCustomerId
        ? { customer: existingCustomerId }
        : customerEmail
          ? { customer_email: customerEmail }
          : {}),
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
    // Log the detail, return a generic message: raw Stripe errors quote
    // account/price internals that shouldn't reach an end user's browser.
    console.error(
      '[create-checkout]',
      e instanceof Error ? e.message : 'Stripe session creation failed.'
    );
    res.status(500).json({ error: 'Could not start checkout. Please try again.' });
  }
}
