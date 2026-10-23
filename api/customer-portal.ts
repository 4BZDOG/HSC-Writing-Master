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
 * Body: { returnUrl?, scope?: 'personal' | 'school' }. `personal` (the default)
 * opens the caller's own customer. `school` opens the customer behind the
 * licence the caller's school holds, for a teacher or admin at that school. The
 * school is always read from the caller's own profile, never from the body.
 *
 * A personal request from a student whose live subscription a parent pays for is refused
 * with 409 `managed_by_guardian` (schema §31). The parent is the Stripe customer, and the
 * portal for it is the parent's to open.
 *
 * Test-mode fallback: when Stripe is unconfigured, returns a mock URL.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
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
import { readSchoolLicence } from './_lib/schoolLicence';
import { isLiveStatus } from './_lib/openCheckout';
import { isMissingColumnError } from './_lib/stripeLedger';

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

  // Checked before anything else is read, so a misspelt scope is refused the
  // same way whatever the deployment's Stripe state. Absent means personal, as
  // it always has, so existing callers are unaffected.
  const requestedScope = (req.body as { scope?: unknown } | undefined)?.scope;
  if (
    requestedScope !== undefined &&
    requestedScope !== 'personal' &&
    requestedScope !== 'school'
  ) {
    res.status(400).json({ error: 'The billing scope must be personal or school.' });
    return;
  }
  const scope = requestedScope === 'school' ? 'school' : 'personal';

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

  const stripe = getStripe()!;

  let customerId: string;
  if (scope === 'school') {
    const school = await schoolPortalCustomer(supabase, stripe, auth.userId);
    if (school.ok === false) {
      res.status(school.status).json({ error: school.error });
      return;
    }
    customerId = school.customerId;
  } else {
    // A plan a parent pays for sits on the PARENT's Stripe customer. The student opening
    // "Manage" here would otherwise reach a missing billing account, or a customer of their
    // own that is not the one being charged. Refuse, and say whose it is.
    const managed = await guardianManagedSubscription(supabase, auth.userId);
    if (managed === 'failed') {
      res.status(503).json({ error: 'Could not check your subscription. Please try again.' });
      return;
    }
    if (managed === 'managed') {
      res.status(409).json({
        code: 'managed_by_guardian',
        error: 'Your parent or guardian manages this subscription.',
      });
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
    customerId = profile.stripe_customer_id;
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
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

/**
 * Whether a live subscription this user holds is paid for by someone else (schema §31):
 * `managed` when one is, `own` when none is, and `failed` when the read errors, in which
 * case nothing can be said and the portal is not opened. A database that has not
 * re-applied §31 has no payer column, so it reads as `own`, as it did before the column.
 */
const guardianManagedSubscription = async (
  supabase: SupabaseClient,
  userId: string
): Promise<'managed' | 'own' | 'failed'> => {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('payer_id, status')
    .eq('user_id', userId);
  if (error) {
    if (isMissingColumnError(error)) return 'own';
    console.error('[customer-portal] subscription read failed:', error.message);
    return 'failed';
  }
  const managed = ((data ?? []) as Array<{ payer_id?: unknown; status?: unknown }>).some(
    (row) => isLiveStatus(row.status) && typeof row.payer_id === 'string' && row.payer_id !== userId
  );
  return managed ? 'managed' : 'own';
};

type SchoolPortalCustomer =
  | { ok: true; customerId: string }
  | { ok: false; status: number; error: string };

/**
 * The Stripe customer behind the licence the caller's school holds. The school
 * comes from the caller's own profile, and only a teacher or admin with a school
 * may open it: the same people who may buy a licence (api/request-invoice.ts).
 *
 * Fails closed. A failed read is a 503, never a guess at which customer to open.
 * The subscriptions row is the first answer. It is written by the webhook, which
 * can lag a purchase, so Stripe itself answers when the row is not there yet.
 */
const schoolPortalCustomer = async (
  supabase: SupabaseClient,
  stripe: Stripe,
  userId: string
): Promise<SchoolPortalCustomer> => {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, school_id')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) {
    console.error('[customer-portal] profile read failed:', profileError.message);
    return { ok: false, status: 503, error: 'Could not check your account. Please try again.' };
  }
  if (!profile || !['teacher', 'admin'].includes(profile.role as string)) {
    return {
      ok: false,
      status: 403,
      error: 'Only a teacher or admin can manage a school licence.',
    };
  }
  const schoolId = profile.school_id as string | null;
  if (!schoolId) {
    return {
      ok: false,
      status: 403,
      error:
        'Your account is not attached to a school, so there is no school licence to manage. ' +
        'Ask an admin to add you to your school (Admin → Schools).',
    };
  }

  const school = await readSchoolLicence(supabase, schoolId);
  if (school.ok === false) {
    console.error('[customer-portal] school read failed:', school.error);
    return { ok: false, status: 503, error: 'Could not check your school. Please try again.' };
  }
  const subscriptionId = school.school.stripe_subscription_id;
  if (!subscriptionId) {
    return { ok: false, status: 404, error: 'Your school does not have a licence to manage yet.' };
  }

  const { data: subscription, error: subscriptionError } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('id', subscriptionId)
    .maybeSingle();
  if (subscriptionError) {
    console.error('[customer-portal] subscription read failed:', subscriptionError.message);
    return {
      ok: false,
      status: 503,
      error: 'Could not check your school licence. Please try again.',
    };
  }
  if (subscription?.stripe_customer_id) {
    return { ok: true, customerId: subscription.stripe_customer_id as string };
  }

  // No row yet. Ask Stripe. Only the error's class is logged: a Stripe message
  // can name the subscription or customer id, and those stay out of the log.
  try {
    const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
    const customer = stripeSubscription.customer;
    if (typeof customer === 'string') return { ok: true, customerId: customer };
    if (customer?.id) return { ok: true, customerId: customer.id };
  } catch (e) {
    console.error(
      '[customer-portal] school subscription lookup failed:',
      e instanceof Error ? e.name : 'unknown error'
    );
  }
  return {
    ok: false,
    status: 404,
    error:
      'We could not find the billing account for your school licence. Please try again shortly.',
  };
};
