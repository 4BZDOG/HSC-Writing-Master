# Stripe Setup Guide — Band 6

Step-by-step instructions to connect Stripe billing to your Band 6 deployment. By the end you will have a working checkout flow where free users can upgrade to the Plus plan and manage their subscription.

---

## Prerequisites

Before you start, make sure you have:

- A **Stripe account** (sign up free at [dashboard.stripe.com](https://dashboard.stripe.com))
- A **Supabase project** with the schema applied (`supabase/schema.sql` — at least §13)
- A **Vercel deployment** (or local dev server) running the app
- The `stripe` npm package already installed (it's in `package.json`)

---

## Step 1 — Create your Stripe Product and Prices

1. Go to [Stripe Dashboard → Products](https://dashboard.stripe.com/products).
2. Click **+ Add product**.
3. Fill in:
   - **Name**: `Band 6 Plus`
   - **Description**: `Full access to advanced questions, detailed feedback, sample answers, exam mode and more.`
4. Under **Pricing**, add **two recurring prices**:

   | Label        | Amount     | Billing period |
   | ------------ | ---------- | -------------- |
   | Plus Monthly | Your price | Monthly        |
   | Plus Yearly  | Your price | Yearly         |

5. Save the product.
6. Copy the two **Price IDs** (they look like `price_1Abc123...`). You will need them in Step 3.

> **Optional — School plan**: If you want a separate institutional plan, create a second product with its own price and note the Price ID.

---

## Step 2 — Get your API Keys

1. Go to [Stripe Dashboard → Developers → API keys](https://dashboard.stripe.com/apikeys).
2. Copy your **Secret key** (`sk_test_...` for test mode, `sk_live_...` for production).

> **Start with test mode.** Stripe's test mode is fully functional — use [test card numbers](https://docs.stripe.com/testing#cards) like `4242 4242 4242 4242` to simulate payments without real charges.

---

## Step 3 — Set Environment Variables

You need to set variables in **two places**: server-side (Vercel / your host) and client-side (Vite build).

### Server-side variables (set in Vercel → Settings → Environment Variables)

| Variable                       | Value                     | Where to find it                           |
| ------------------------------ | ------------------------- | ------------------------------------------ |
| `STRIPE_SECRET_KEY`            | `sk_test_...`             | Stripe → Developers → API keys             |
| `STRIPE_WEBHOOK_SECRET`        | `whsec_...`               | Created in Step 4 below — **required in production** |
| `SUPABASE_SERVICE_ROLE_KEY`    | `eyJ...`                  | Supabase → Settings → API → `service_role` |
| `SUPABASE_URL`                 | `https://xxx.supabase.co` | Supabase → Settings → API                  |
| `STRIPE_PLUS_MONTHLY_PRICE_ID` | `price_...`               | From Step 1                                |
| `STRIPE_PLUS_YEARLY_PRICE_ID`  | `price_...`               | From Step 1                                |
| `STRIPE_SCHOOL_PRICE_ID`       | `price_...` _(optional)_  | From Step 1 (school product)               |

> The price IDs are also the **allowlist**: `/api/create-checkout` refuses any
> price that isn't one of these three, so a tampered client can't check out
> against an unrelated price in your Stripe account. Set at least one, or
> checkout returns 501 "No plans are available for purchase yet."
>
> `STRIPE_WEBHOOK_SECRET` is mandatory once `VERCEL_ENV`/`NODE_ENV` is
> `production`: without it the webhook refuses every event with a 500 (Stripe
> retries, so nothing is lost once you set it). An unsigned production
> endpoint would let anyone POST a forged subscription event and grant
> themselves a paid plan.

### Client-side variables (also set in Vercel, or in `.env.local` for dev)

| Variable                            | Value       | Notes                                        |
| ----------------------------------- | ----------- | -------------------------------------------- |
| `VITE_STRIPE_PLUS_MONTHLY_PRICE_ID` | `price_...` | Same value as `STRIPE_PLUS_MONTHLY_PRICE_ID` |
| `VITE_STRIPE_PLUS_YEARLY_PRICE_ID`  | `price_...` | Same value as `STRIPE_PLUS_YEARLY_PRICE_ID`  |

> The `VITE_` prefix is required for Vite to include these in the browser bundle. They are just price IDs (not secrets) so this is safe.

### For local development

Copy `.env.example` to `.env.local` and fill in the values above. The app works **without** any Stripe keys — the billing endpoints return test-mode mock URLs so you can exercise the full checkout redirect flow without a real Stripe account.

---

## Step 4 — Set up the Stripe Webhook

The webhook is how Stripe tells your app about subscription changes (new checkout, upgrades, cancellations, failed payments).

### 4a — Create the webhook endpoint in Stripe

1. Go to [Stripe Dashboard → Developers → Webhooks](https://dashboard.stripe.com/webhooks).
2. Click **+ Add endpoint**.
3. Set the **Endpoint URL** to:

   ```
   https://your-app.vercel.app/api/stripe-webhook
   ```

   Replace `your-app.vercel.app` with your actual domain.

4. Under **Events to send**, select these four:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`

5. Click **Add endpoint**.
6. On the endpoint detail page, click **Reveal** under Signing secret and copy the `whsec_...` value.
7. Add it to your Vercel environment variables as `STRIPE_WEBHOOK_SECRET`.

### 4b — Test locally with Stripe CLI (optional but recommended)

1. Install the [Stripe CLI](https://docs.stripe.com/stripe-cli).
2. Log in:
   ```bash
   stripe login
   ```
3. Forward events to your local dev server:
   ```bash
   stripe listen --forward-to localhost:5173/api/stripe-webhook
   ```
4. The CLI prints a temporary webhook secret (`whsec_...`). Set it in your `.env.local`:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_from_stripe_cli
   ```
5. Trigger a test event:
   ```bash
   stripe trigger checkout.session.completed
   ```
   You should see a `200` response in the CLI output.

---

## Step 5 — Apply the Database Schema

If you haven't already run the full `supabase/schema.sql`, you need at least §13 (Stripe billing tables). Run this in your Supabase SQL Editor:

```sql
-- Extend profiles with Stripe identity and plan cache.
alter table public.profiles
  add column if not exists stripe_customer_id  text,
  add column if not exists stripe_plan         text not null default 'free',
  add column if not exists plan_period_end     timestamptz;

create unique index if not exists profiles_stripe_customer_idx
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;

-- Subscription records (synced by webhook).
create table if not exists public.subscriptions (
  id                    text primary key,
  user_id               uuid not null references public.profiles (id) on delete cascade,
  stripe_customer_id    text not null,
  status                text not null,
  price_id              text not null,
  plan                  text not null default 'plus',
  current_period_start  timestamptz not null,
  current_period_end    timestamptz not null,
  cancel_at_period_end  boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists subscriptions_user_idx
  on public.subscriptions (user_id);

-- RLS
alter table public.subscriptions enable row level security;

do $$ begin
  create policy "Users read own subscriptions"
    on public.subscriptions for select
    using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Admins read all subscriptions"
    on public.subscriptions for select
    using (public.is_admin());
exception when duplicate_object then null; end $$;

-- Resolve active plan from subscriptions.
create or replace function public.resolve_stripe_plan(p_user_id uuid)
returns text language sql stable security definer as $$
  select coalesce(
    (select s.plan from public.subscriptions s
      where s.user_id = p_user_id
        and s.status in ('active', 'trialing')
      order by s.current_period_end desc
      limit 1),
    'free'
  );
$$;
```

---

## Step 6 — Deploy and Test

1. **Redeploy** your Vercel app so it picks up the new environment variables.
2. Open your app and log in as a **free user** (not admin — admins bypass all gates).
3. Try to access a gated feature (e.g. a Tier 4+ question, or exam mode). You should see a lock chip and upgrade prompt.
4. Click **Upgrade to Plus** in the upgrade modal.
5. You should be redirected to Stripe Checkout.
6. Use a [test card](https://docs.stripe.com/testing#cards):
   - **Success**: `4242 4242 4242 4242`, any future expiry, any CVC
   - **Decline**: `4000 0000 0000 0002`
7. After successful payment, you should be redirected back to the app with a success toast.
8. The webhook fires → updates your `profiles.stripe_plan` to `'plus'` → all gates unlock.

### Verify the webhook worked

Check in Supabase:

```sql
select id, stripe_customer_id, stripe_plan, plan_period_end
from profiles
where id = 'your-user-uuid';
```

You should see `stripe_plan = 'plus'` and a valid `plan_period_end`.

---

## Step 7 — Manage Subscriptions (Billing Portal)

Logged-in paid users can manage their subscription from their **profile modal** (the user avatar → Overview tab → Plan card → "Manage Subscription" button). This opens the Stripe Billing Portal where they can:

- Upgrade/downgrade plans
- Cancel their subscription
- Update payment method
- View invoices

> The portal works out of the box — no additional Stripe configuration needed. Stripe hosts the portal UI.

---

## Going Live (Production Checklist)

When you're ready to accept real payments:

1. **Switch to live keys**: Replace all `sk_test_` / `pk_test_` values with `sk_live_` / `pk_live_` from Stripe Dashboard (toggle off "Test mode").
2. **Create a live webhook**: Same steps as Step 4a but with your production URL and live mode enabled.
3. **Create live prices**: Products created in test mode don't carry over. Create the same product/prices in live mode and update all Price ID env vars.
4. **Update Vercel env vars**: Swap every test value for its live counterpart and redeploy.
5. **Test with a real card**: Make a small real purchase, then cancel/refund it from the Stripe Dashboard.
6. **Enable Stripe Tax** (optional): In Stripe Dashboard → Tax, configure automatic tax collection for your region.

---

## How It Works — Architecture Summary

```
User clicks "Upgrade"
        │
        ▼
 UpgradeModal (client)
        │ calls createCheckoutUrl(priceId)
        ▼
 POST /api/create-checkout
        │ creates Stripe Checkout Session
        │ sets client_reference_id = user's Supabase UUID
        ▼
 Stripe Checkout (hosted by Stripe)
        │ user pays
        ▼
 POST /api/stripe-webhook
        │ checkout.session.completed → links stripe_customer_id to profile
        │ customer.subscription.created → upserts subscription row + sets stripe_plan
        ▼
 profiles.stripe_plan = 'plus'
        │
        ▼
 getUserPlan() returns 'plus' → all gates unlock
```

---

## Troubleshooting

| Symptom                                        | Cause                                               | Fix                                                                                             |
| ---------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Upgrade button redirects to `/#/upgrade-test`  | `STRIPE_SECRET_KEY` not set on server               | Set it in Vercel env vars and redeploy                                                          |
| Checkout works but plan doesn't update         | Webhook not receiving events                        | Check Stripe Dashboard → Webhooks for failed deliveries; verify `STRIPE_WEBHOOK_SECRET` matches |
| Webhook returns 501                            | `SUPABASE_SERVICE_ROLE_KEY` not set                 | Add it to Vercel env vars                                                                       |
| Webhook returns 400 "Missing stripe-signature" | Request not coming from Stripe (or secret mismatch) | Verify the signing secret matches the endpoint                                                  |
| Webhook returns 500 "Webhook signing secret not configured" | `STRIPE_WEBHOOK_SECRET` missing in production       | Set it and redeploy — Stripe retries the queued events automatically                            |
| Checkout returns 400 "Unknown plan"            | Client price ID isn't in the server allowlist       | Make each `VITE_STRIPE_*_PRICE_ID` match its unprefixed server counterpart                      |
| "No billing account found" in portal           | User hasn't checked out yet                         | The portal requires a prior checkout to create the Stripe customer link                         |
| Gates still locked after payment               | Browser has stale user data                         | Refresh the page — `getUserPlan()` reads from the profile on each call                          |
| Admin sees gates                               | Admin bypass not deployed                           | Merge PR #47 and redeploy                                                                       |

---

## Test Mode (No Stripe Account Needed)

If you just want to test the UI flow without any Stripe setup:

1. Leave all `STRIPE_*` env vars **unset**.
2. The endpoints return mock URLs (`/#/upgrade-test`, `/#/portal-test`).
3. The checkout redirect flow works end-to-end — you'll see the success/cancel toast.
4. No subscription state changes in the database (the webhook is a no-op without Stripe).

This is useful for front-end development and UI testing.

## School seat licences (optional)

Sell a whole-school licence directly from the upgrade modal:

1. **Create a per-seat price**: Stripe → Products → "Band 6 School" → add a
   **yearly recurring** price representing ONE student seat (e.g. A$4/year).
2. **Set the env vars** (server _and_ client must agree):
   - `STRIPE_SCHOOL_PRICE_ID=price_…` (server — maps the price to the
     `school` plan and allows seat quantities at checkout)
   - `VITE_STRIPE_SCHOOL_PRICE_ID=price_…` (client — switches the upgrade
     modal's school section from an enquiry link to a direct seat purchase
     for teachers/admins)
   - `VITE_SCHOOL_SEAT_PRICE_DISPLAY=A$4` (display only)
3. **Re-apply the schema** (`supabase/schema.sql` §13 adds
   `schools.stripe_subscription_id / plan_seats / plan_status /
plan_period_end` and `subscriptions.seats` — all `add column if not
exists`, safe to re-run).

How it works: a teacher or admin picks a seat count and checks out; the
webhook stores the seat quantity and stamps the licence onto **their
school** (`profiles.school_id`). Every member of that school then resolves
to the School plan at sign-in for as long as the subscription is active
(`past_due` keeps the plan during Stripe's retry grace period, exactly like
personal subscriptions). Seats are the billed quantity — compare
`plan_seats` with the school's member count in the admin dashboard for
true-ups.

**Important**: the buyer must belong to a school (Admin → Schools) _before_
purchasing; otherwise only the buyer's own account holds the plan until an
admin assigns their school.
