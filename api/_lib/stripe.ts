/**
 * Shared Stripe helpers for the serverless API layer.
 *
 * Provides a configured Stripe client and Supabase service-role client
 * for the three billing endpoints:
 *   - api/create-checkout.ts   — initiates a Checkout Session
 *   - api/stripe-webhook.ts   — receives Stripe webhook events
 *   - api/customer-portal.ts  — opens the Billing Portal
 *
 * Test-mode fallback: when STRIPE_SECRET_KEY is unset the helpers
 * return null instead of throwing, so each endpoint can return a clear
 * "billing not configured" 501 rather than a 500 crash. This keeps the
 * app fully functional for developers who haven't set up Stripe yet.
 */
import Stripe from 'stripe';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _stripe: Stripe | null = null;

export const getStripe = (): Stripe | null => {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  _stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
  return _stripe;
};

export const isStripeConfigured = (): boolean => !!process.env.STRIPE_SECRET_KEY;

/** The client-side price IDs, which decide whether a checkout button is drawn. */
const clientPriceIdsPresent = (): boolean =>
  Boolean(
    process.env.VITE_STRIPE_PLUS_MONTHLY_PRICE_ID ||
    process.env.VITE_STRIPE_PLUS_YEARLY_PRICE_ID ||
    process.env.VITE_STRIPE_SCHOOL_PRICE_ID
  );

/**
 * Is this deployment HALF configured — the browser offering plans the server
 * cannot sell?
 *
 * The test-mode fallback below is right for a deployment with no Stripe at
 * all: nothing is on sale, the upgrade prompt says "Keep me posted", and the
 * mock URL exists so the redirect path can be exercised without a Stripe
 * account. It is badly wrong for a deployment that has published prices to the
 * client and simply missed `STRIPE_SECRET_KEY`. There, the mock URL is handed
 * to a real user who clicked a real "Upgrade now": the browser navigates to
 * `…#/upgrade-test`, which nothing in the app handles, so the button appears
 * to do nothing at all. No error, no log, no sale — the worst possible failure
 * on the one screen where someone is trying to pay.
 *
 * This is the same asymmetry, and the same reasoning, as `isMisconfigured()`
 * in ./auth.ts: the `VITE_` variables are readable here because a hosting
 * platform puts every project variable in the function's environment — the
 * prefix only tells Vite what to bundle. So the mistake is detectable, and it
 * is always a mistake rather than a configuration anyone chooses.
 *
 * Production only. Locally the mock URL is exactly what a developer wants.
 */
export const isStripeMisconfigured = (): boolean =>
  isProductionRuntime() && !isStripeConfigured() && clientPriceIdsPresent();

/** What to tell the caller, and the operator reading the logs, when it is. */
export const STRIPE_MISCONFIGURED_ERROR =
  'Billing is misconfigured on this deployment: plan prices are published to the app ' +
  '(VITE_STRIPE_*_PRICE_ID) but the server has no STRIPE_SECRET_KEY, so no payment can be ' +
  'taken. Set STRIPE_SECRET_KEY in the hosting project, or clear the VITE_STRIPE_*_PRICE_ID ' +
  'variables to hide the upgrade buttons until it is ready.';

let _supabaseAdmin: SupabaseClient | null = null;

export const getSupabaseAdmin = (): SupabaseClient | null => {
  if (_supabaseAdmin) return _supabaseAdmin;
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  _supabaseAdmin = createClient(url, serviceKey, { auth: { persistSession: false } });
  return _supabaseAdmin;
};

/** The origin a request demonstrably came from, or undefined if unknowable. */
const requestOrigin = (
  originHeader: string | undefined,
  refererHeader: string | undefined
): string | undefined => {
  if (originHeader && originHeader !== 'null') return originHeader;
  if (refererHeader) {
    try {
      return new URL(refererHeader).origin;
    } catch {
      /* unparseable Referer — treat as absent */
    }
  }
  return undefined;
};

/**
 * The absolute base URL (origin + base path, trailing slash) Stripe should
 * send the browser back to after checkout / the billing portal.
 *
 * The client passes its own `returnUrl` because the Origin header loses the
 * base path on sub-path hosting — GitHub Pages serves at /<repo>/, so an
 * origin-built redirect lands on a 404 (the same failure mode fixed for
 * assignment links in utils/assignmentLink.ts). The value is only trusted
 * when it is an http(s) URL on the SAME origin the request came from, so a
 * forged body cannot turn Stripe's redirect into an open redirect.
 *
 * A request with NEITHER an Origin nor a Referer header proves nothing about
 * where it came from, so its `returnUrl` is discarded rather than trusted —
 * browsers always send Origin on a cross-site-capable POST, so only a
 * hand-rolled (i.e. potentially forged) request lands in that branch.
 */
export const resolveReturnBase = (
  originHeader: string | undefined,
  refererHeader: string | undefined,
  returnUrl: unknown
): string => {
  const trustedOrigin = requestOrigin(originHeader, refererHeader);

  if (typeof returnUrl === 'string' && trustedOrigin) {
    try {
      const url = new URL(returnUrl);
      const sameOrigin = url.origin === trustedOrigin;
      if ((url.protocol === 'https:' || url.protocol === 'http:') && sameOrigin) {
        const base = `${url.origin}${url.pathname}`;
        return base.endsWith('/') ? base : `${base}/`;
      }
    } catch {
      /* not a valid URL — fall through to the header-derived origin */
    }
  }

  // No usable returnUrl: rebuild from the headers. The Referer keeps its
  // directory path (it is a real page URL on our own origin).
  if (originHeader && originHeader !== 'null') return `${originHeader}/`;
  if (refererHeader) {
    const base = refererHeader.replace(/[?#].*$/, '').replace(/\/[^/]*$/, '');
    if (base) return `${base}/`;
  }
  return 'http://localhost:3000/';
};

/**
 * The Stripe price IDs this deployment is allowed to sell, keyed by the plan
 * they grant. Unset entries are omitted — a deployment that only sells Plus
 * has no school price.
 */
export const configuredPrices = (): Record<string, 'plus' | 'school'> => {
  const prices: Record<string, 'plus' | 'school'> = {};
  const monthlyPlus = process.env.STRIPE_PLUS_MONTHLY_PRICE_ID;
  const yearlyPlus = process.env.STRIPE_PLUS_YEARLY_PRICE_ID;
  const school = process.env.STRIPE_SCHOOL_PRICE_ID;
  if (monthlyPlus) prices[monthlyPlus] = 'plus';
  if (yearlyPlus) prices[yearlyPlus] = 'plus';
  if (school) prices[school] = 'school';
  return prices;
};

/**
 * Map a Stripe price ID to our internal plan name.
 * Falls back to 'free' for unknown prices.
 */
export const priceToPlan = (priceId: string): 'plus' | 'school' | 'free' =>
  configuredPrices()[priceId] ?? 'free';

/**
 * True when this process is serving real traffic, so unsigned webhooks and
 * other dev-only shortcuts must be refused. Vercel sets VERCEL_ENV; NODE_ENV
 * covers self-hosted runs. Tests and local dev fall through to false.
 */
export const isProductionRuntime = (): boolean =>
  process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
