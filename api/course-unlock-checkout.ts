/**
 * POST /api/course-unlock-checkout
 *
 * Starts a one-off Stripe Checkout (mode `payment`) for a course unlock, and returns the
 * URL to send the browser to. The product rules are in projectDocs/course-unlocks.md.
 *
 * Body: { courseId: string, returnUrl?: string }
 * Returns: { url: string } on success, or { error: string, code?: string }.
 *
 * Refusals, each with a `code`:
 *   - 404 course_unlocks_disabled: COURSE_UNLOCKS_ENABLED is not `true`.
 *   - 409 course_included: the course is already open to the caller by plan, staff role or
 *     the free-courses list, so there is nothing to buy.
 *   - 409 course_already_unlocked: the caller already holds an active unlock.
 *   - 503 account_lookup_failed: a fact the decision needs could not be read. Unlike the
 *     marking path, this fails CLOSED: selling a course the caller already has is worse
 *     than a retry.
 *   - 503 course_unlock_unavailable: no price. Neither the course's catalogue price nor
 *     STRIPE_COURSE_UNLOCK_PRICE_ID is set.
 *
 * The session is keyed to the user (`client_reference_id`) and carries
 * `metadata { kind: 'course_unlock', course_id, supabase_user_id }`. The webhook branches on
 * `kind` first, so a course unlock never reaches the subscription path (stripe-webhook.ts).
 *
 * `returnUrl` is validated by resolveReturnBase, as in create-checkout. Success goes to
 * `#/course-unlocked?course=<id>`, cancel back to the app.
 *
 * Test-mode fallback: with Stripe unconfigured this returns a mock URL, as create-checkout
 * does, so the flow can be exercised without a Stripe account.
 */
import {
  getStripe,
  getSupabaseAdmin,
  isStripeConfigured,
  isStripeMisconfigured,
  resolveReturnBase,
  STRIPE_MISCONFIGURED_ERROR,
} from './_lib/stripe';
import { extractBearerToken, verifyRequestAuth } from './_lib/auth';
import { corsHeadersFor } from './_lib/cors';
import {
  coursePolicy,
  courseUnlocksEnabled,
  decideCourseAccess,
  defaultCourseUnlockPriceId,
  loadCourseFacts,
} from './_lib/courseAccess';

/** A course id as the catalogue writes it: letters, digits, hyphens and underscores. */
const COURSE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;

const LOOKUP_FAILED =
  'We could not check your account just now, so no purchase was started. Please try again in a few minutes.';
const LOOKUP_FAILED_CODE = 'account_lookup_failed';

const COURSE_INCLUDED =
  'This course is already included in your plan, so there is nothing to unlock.';
const COURSE_ALREADY_UNLOCKED = 'You have already unlocked this course.';
const NO_PRICE = 'Course unlocks are not on sale yet. Please try again later.';

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
  // Same CORS preamble as create-checkout: split hosting needs the preflight answered.
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

  const authHeader = headerValue(req.headers?.authorization);
  const auth = await verifyRequestAuth(authHeader);
  if (!auth.ok) {
    res.status(auth.status ?? 401).json({ error: auth.error ?? 'Unauthorized.' });
    return;
  }

  if (!courseUnlocksEnabled()) {
    res.status(404).json({
      code: 'course_unlocks_disabled',
      error: 'Course unlocks are not available on this site.',
    });
    return;
  }

  const body = req.body as { courseId?: unknown; returnUrl?: unknown } | undefined;
  const rawCourse = body?.courseId;
  if (typeof rawCourse !== 'string' || !COURSE_ID.test(rawCourse.trim())) {
    res.status(400).json({ code: 'invalid_course', error: 'Missing or invalid courseId.' });
    return;
  }
  const courseId = rawCourse.trim();

  if (!auth.userId) {
    res.status(401).json({ error: 'User identity required to create a checkout session.' });
    return;
  }

  const returnBase = resolveReturnBase(
    headerValue(req.headers?.origin),
    headerValue(req.headers?.referer),
    body?.returnUrl
  );

  // Published prices with no server key: refuse with the reason, not a mock URL, as
  // create-checkout does (see isStripeMisconfigured in ./_lib/stripe.ts).
  if (isStripeMisconfigured()) {
    console.error('[course-unlock-checkout]', STRIPE_MISCONFIGURED_ERROR);
    res.status(503).json({ error: STRIPE_MISCONFIGURED_ERROR });
    return;
  }

  if (!isStripeConfigured()) {
    // Test-mode: a fake URL so the client flow can be checked without Stripe.
    res.status(200).json({
      url: `${returnBase}#/course-unlock-test?course=${encodeURIComponent(courseId)}`,
      test: true,
    });
    return;
  }

  const token = extractBearerToken(authHeader);
  const supabase = getSupabaseAdmin();
  if (!token || !supabase) {
    res.status(503).json({ code: LOOKUP_FAILED_CODE, error: LOOKUP_FAILED });
    return;
  }

  // The same policy as the marking gate, read through the caller's own token. Here an
  // unknown fact refuses the purchase rather than opening the course.
  const facts = await loadCourseFacts(token, courseId);
  const verdict = decideCourseAccess(courseId, facts, coursePolicy());
  if (verdict.reason === 'lookup_failed') {
    console.error('[course-unlock-checkout] could not read course access; no purchase started.');
    res.status(503).json({ code: LOOKUP_FAILED_CODE, error: LOOKUP_FAILED });
    return;
  }
  if (verdict.open) {
    if (verdict.reason === 'unlocked') {
      res.status(409).json({ code: 'course_already_unlocked', error: COURSE_ALREADY_UNLOCKED });
    } else {
      res.status(409).json({ code: 'course_included', error: COURSE_INCLUDED });
    }
    return;
  }

  // A per-course price from the catalogue replaces the default.
  const catalogueEntry = facts.catalogue.ok ? facts.catalogue.entry : null;
  const priceId = catalogueEntry?.stripePriceId || defaultCourseUnlockPriceId();
  if (!priceId) {
    console.error('[course-unlock-checkout] no course-unlock price is configured.');
    res.status(503).json({ code: 'course_unlock_unavailable', error: NO_PRICE });
    return;
  }

  // Reuse the Stripe customer when the profile has one, else prefill the account email, as
  // create-checkout does. A failed profile read refuses the purchase.
  let existingCustomerId: string | undefined;
  let customerEmail: string | undefined;
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', auth.userId)
    .maybeSingle();
  if (profileError) {
    console.error('[course-unlock-checkout] profile lookup failed:', profileError.message);
    res.status(503).json({ code: LOOKUP_FAILED_CODE, error: LOOKUP_FAILED });
    return;
  }
  if (profile?.stripe_customer_id) {
    existingCustomerId = profile.stripe_customer_id;
  } else {
    try {
      const { data } = await supabase.auth.admin.getUserById(auth.userId);
      customerEmail = data?.user?.email ?? undefined;
    } catch {
      /* prefill only */
    }
  }

  const stripe = getStripe()!;
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${returnBase}#/course-unlocked?course=${encodeURIComponent(courseId)}`,
      cancel_url: `${returnBase}?checkout=cancelled`,
      client_reference_id: auth.userId,
      metadata: {
        kind: 'course_unlock',
        course_id: courseId,
        supabase_user_id: auth.userId,
      },
      ...(existingCustomerId
        ? { customer: existingCustomerId }
        : customerEmail
          ? { customer_email: customerEmail }
          : {}),
    });

    if (!session.url) {
      console.error('[course-unlock-checkout] Stripe returned a session with no URL.');
      res.status(500).json({ error: 'Could not start checkout. Please try again.' });
      return;
    }
    res.status(200).json({ url: session.url });
  } catch (e) {
    // Log the detail, return a generic message: raw Stripe errors quote account internals.
    console.error(
      '[course-unlock-checkout]',
      e instanceof Error ? e.message : 'Stripe session creation failed.'
    );
    res.status(500).json({ error: 'Could not start checkout. Please try again.' });
  }
}
