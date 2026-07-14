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

let _supabaseAdmin: SupabaseClient | null = null;

export const getSupabaseAdmin = (): SupabaseClient | null => {
  if (_supabaseAdmin) return _supabaseAdmin;
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  _supabaseAdmin = createClient(url, serviceKey, { auth: { persistSession: false } });
  return _supabaseAdmin;
};

/**
 * Map a Stripe price ID to our internal plan name.
 * Falls back to 'plus' for any recognised price, 'free' for unknowns.
 */
export const priceToPlan = (priceId: string): 'plus' | 'school' | 'free' => {
  const monthlyPlus = process.env.STRIPE_PLUS_MONTHLY_PRICE_ID;
  const yearlyPlus = process.env.STRIPE_PLUS_YEARLY_PRICE_ID;
  const school = process.env.STRIPE_SCHOOL_PRICE_ID;
  if (priceId === monthlyPlus || priceId === yearlyPlus) return 'plus';
  if (school && priceId === school) return 'school';
  return 'free';
};
