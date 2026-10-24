/**
 * POST /api/prepare-account-deletion
 *
 * Ends, in Stripe, every subscription the caller holds or pays for, so that deleting the
 * account (the `delete_my_account()` RPC, schema §16) cannot leave a card being charged
 * for an account that no longer exists. The client calls this first and calls the RPC
 * only once it has answered.
 *
 * Why it is needed: deleting the auth user cascades the caller's profile and their
 * subscription rows away, and sets `payer_id` to null on the rows they paid for (schema
 * §31), but nothing in the database reaches Stripe. Left alone:
 *   - a parent who deletes their account keeps being charged for their child's plan, the
 *     child's row now looks self-paid, and the child's portal finds no billing account;
 *   - a child who deletes theirs leaves the parent paying for a deleted account, with no
 *     row on the parent's dashboard to reach the portal from.
 *
 * What is ended, and how:
 *   - Each subscription the caller holds (a row with their user_id) or pays for (a row
 *     with their payer_id, or any subscription on their own Stripe customer) is cancelled
 *     straight away. Stripe's list covers a purchase whose webhook has not landed yet.
 *     A subscription already set to end at period end is cancelled too: once the account
 *     is gone there is nobody left to serve or to bill.
 *   - A SCHOOL licence the caller bought is never cancelled here: a whole school relies on
 *     it, and one teacher deleting their account must not end it. If it would still renew,
 *     nothing at all is cancelled and the request is refused with 409
 *     `school_licence_held`, saying what to do instead. One already set to end is left to
 *     run out.
 *
 * Each cancelled subscription is written back through applySubscriptionUpsert, the same
 * path the webhook uses, so the rows read as cancelled before the RPC checks them and the
 * child of a deleting parent drops to the free plan at once. The write is stamped with
 * Stripe's `canceled_at`, so an older event delivered late cannot bring the plan back.
 *
 * A failure part-way leaves what was cancelled cancelled and answers 502: nothing has been
 * deleted, and a retry only has the rest to do.
 *
 * Test-mode fallback: when Stripe is unconfigured nothing is billed, so there is nothing
 * to end and the answer is a 200.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import {
  getStripe,
  getSupabaseAdmin,
  isStripeConfigured,
  isStripeMisconfigured,
  priceToPlan,
  STRIPE_MISCONFIGURED_ERROR,
} from './_lib/stripe';
import { verifyRequestAuth } from './_lib/auth';
import { corsHeadersFor } from './_lib/cors';
import { isMissingColumnError } from './_lib/stripeLedger';
import { applySubscriptionUpsert } from './_lib/subscriptionSync';

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

/** Statuses Stripe never moves a subscription out of. Nothing is left to cancel. */
const ENDED_STATUSES = new Set(['canceled', 'incomplete_expired']);

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
  // The same opt-in CORS preamble as the other billing endpoints (api/customer-portal.ts).
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

  const auth = await verifyRequestAuth(headerValue(req.headers?.authorization));
  if (!auth.ok) {
    res.status(auth.status ?? 401).json({ error: auth.error ?? 'Unauthorized.' });
    return;
  }

  if (isStripeMisconfigured()) {
    console.error('[prepare-account-deletion]', STRIPE_MISCONFIGURED_ERROR);
    res.status(503).json({ error: STRIPE_MISCONFIGURED_ERROR });
    return;
  }

  // No Stripe, no charges: there is nothing to end before the account goes.
  if (!isStripeConfigured()) {
    res.status(200).json({ cancelled: 0, test: true });
    return;
  }

  if (!auth.userId) {
    res.status(401).json({ error: 'User identity required to end billing.' });
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
  const userId = auth.userId;

  const found = await subscriptionsToEnd(supabase, stripe, userId);
  if (found.ok === false) {
    res.status(503).json({ error: 'Could not check your subscriptions. Please try again.' });
    return;
  }

  // Refused before anything is cancelled, so a teacher who also pays for Plus does not
  // lose it to a deletion that is about to be refused anyway.
  if (found.subscriptions.some((s) => s.school && !s.cancelAtPeriodEnd)) {
    res.status(409).json({
      // BILLING_CODE.schoolLicenceHeld on the client, as create-checkout sends it.
      code: 'school_licence_held',
      error:
        'You bought your school’s licence, so deleting your account would end it for the ' +
        'whole school. Open Manage billing and set the licence to end at the close of its ' +
        'period, or contact us to move it to a colleague, then try again.',
    });
    return;
  }

  let cancelled = 0;
  for (const sub of found.subscriptions) {
    if (sub.school) continue; // already set to end; it runs out for the school on its own
    let record: Record<string, unknown>;
    try {
      record = (await stripe.subscriptions.cancel(sub.id)) as unknown as Record<string, unknown>;
    } catch (e) {
      // Only the class goes in the log: a Stripe message can name the customer.
      console.error(
        '[prepare-account-deletion] could not cancel a subscription:',
        e instanceof Error ? e.name : 'unknown error'
      );
      res.status(502).json({
        cancelled,
        error:
          'We could not cancel your subscription, so your account has not been deleted. ' +
          'Please try again in a moment.',
      });
      return;
    }
    cancelled += 1;
    try {
      const canceledAt = typeof record.canceled_at === 'number' ? record.canceled_at : undefined;
      await applySubscriptionUpsert(supabase, record, canceledAt);
    } catch (e) {
      // Stripe has ended it; only our copy is behind, and the webhook's
      // customer.subscription.deleted will bring the row up to date.
      console.error(
        '[prepare-account-deletion] cancelled, but the row write failed:',
        e instanceof Error ? e.message : 'unknown error'
      );
      res.status(502).json({
        cancelled,
        error:
          'Your subscription has been cancelled, but we could not finish recording it, so ' +
          'your account has not been deleted yet. Please try again in a minute.',
      });
      return;
    }
  }

  res.status(200).json({ cancelled });
}

/** A subscription that is still running in Stripe, with what the decision above reads. */
interface Running {
  id: string;
  school: boolean;
  cancelAtPeriodEnd: boolean;
}

type Found = { ok: true; subscriptions: Running[] } | { ok: false };

/**
 * Every subscription still running in Stripe that the user holds or pays for. The rows
 * name the ones the webhook has written (held or paid for); Stripe's own list for the
 * user's customer adds a purchase the webhook has not written yet. Each row's subscription
 * is read from Stripe, because a row can lag what Stripe holds. Any failed read fails
 * the whole answer: a partial list would let a live subscription outlive the account.
 */
async function subscriptionsToEnd(
  supabase: SupabaseClient,
  stripe: Stripe,
  userId: string
): Promise<Found> {
  const rowIds = new Map<string, { plan?: unknown }>();

  const held = await supabase.from('subscriptions').select('id, plan').eq('user_id', userId);
  if (held.error) {
    console.error('[prepare-account-deletion] subscription read failed:', held.error.message);
    return { ok: false };
  }
  for (const row of (held.data ?? []) as Array<{ id: string; plan?: unknown }>) {
    rowIds.set(row.id, row);
  }

  // A database that has not re-applied §31 has no payer column, and so no guardian rows.
  const paid = await supabase.from('subscriptions').select('id, plan').eq('payer_id', userId);
  if (paid.error && !isMissingColumnError(paid.error)) {
    console.error('[prepare-account-deletion] payer read failed:', paid.error.message);
    return { ok: false };
  }
  for (const row of (paid.data ?? []) as Array<{ id: string; plan?: unknown }>) {
    rowIds.set(row.id, row);
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) {
    console.error('[prepare-account-deletion] profile read failed:', profileError.message);
    return { ok: false };
  }

  const fromStripe = new Map<string, Stripe.Subscription>();
  try {
    const customerId = profile?.stripe_customer_id as string | null | undefined;
    if (customerId) {
      // The default list leaves out cancelled subscriptions, which have nothing to end.
      // One page of 100 is far more than one person holds.
      const listed = await stripe.subscriptions.list({ customer: customerId, limit: 100 });
      for (const sub of listed.data) fromStripe.set(sub.id, sub);
    }
    for (const id of rowIds.keys()) {
      if (fromStripe.has(id)) continue;
      const sub = await retrieveIfPresent(stripe, id);
      if (sub) fromStripe.set(id, sub);
    }
  } catch (e) {
    console.error(
      '[prepare-account-deletion] Stripe read failed:',
      e instanceof Error ? e.name : 'unknown error'
    );
    return { ok: false };
  }

  const running: Running[] = [];
  for (const sub of fromStripe.values()) {
    if (ENDED_STATUSES.has(sub.status)) continue;
    const priceId = sub.items?.data?.[0]?.price?.id ?? '';
    running.push({
      id: sub.id,
      // The price says which plan it is; the row is the answer for a price this
      // deployment no longer lists, as it is for the webhook.
      school: priceToPlan(priceId) === 'school' || rowIds.get(sub.id)?.plan === 'school',
      cancelAtPeriodEnd: sub.cancel_at_period_end === true,
    });
  }
  return { ok: true, subscriptions: running };
}

/**
 * The subscription, or null when Stripe has no such subscription (a row left from another
 * Stripe account or a test fixture). Any other error is thrown.
 */
async function retrieveIfPresent(stripe: Stripe, id: string): Promise<Stripe.Subscription | null> {
  try {
    return await stripe.subscriptions.retrieve(id);
  } catch (e) {
    if ((e as { code?: unknown } | null)?.code === 'resource_missing') return null;
    throw e;
  }
}
