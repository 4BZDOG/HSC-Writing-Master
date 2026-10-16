# Stripe Setup Guide — Band 6

Step-by-step instructions to connect Stripe billing to your Band 6 deployment. By the end you will have a working checkout flow where free users can upgrade to the Plus plan and manage their subscription.

---

> **Billing requires Supabase auth.** A subscription attaches to a signed-in
> user, so both Supabase pairs — `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
> **and** the unprefixed `SUPABASE_URL` / `SUPABASE_ANON_KEY` — must be set
> before any of this works. Without the server-side pair, checkout and the
> billing portal return 401 or 503 and there is nothing to attach a plan to.
> See `projectDocs/SUPABASE_SETUP.md` first.

## Prerequisites

Before you start, make sure you have:

- A **Stripe account** (sign up free at [dashboard.stripe.com](https://dashboard.stripe.com))
- A **Supabase project** with the schema applied (`supabase/schema.sql` — at least §13 and §14)
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

| Variable                       | Value                     | Where to find it                                     |
| ------------------------------ | ------------------------- | ---------------------------------------------------- |
| `STRIPE_SECRET_KEY`            | `sk_test_...`             | Stripe → Developers → API keys                       |
| `STRIPE_WEBHOOK_SECRET`        | `whsec_...`               | Created in Step 4 below — **required in production** |
| `SUPABASE_SERVICE_ROLE_KEY`    | `eyJ...`                  | Supabase → Settings → API → `service_role`           |
| `SUPABASE_URL`                 | `https://xxx.supabase.co` | Supabase → Settings → API                            |
| `SUPABASE_ANON_KEY`            | `eyJ...`                  | Supabase → Settings → API → `anon` / `public`        |
| `STRIPE_PLUS_MONTHLY_PRICE_ID` | `price_...`               | From Step 1                                          |
| `STRIPE_PLUS_YEARLY_PRICE_ID`  | `price_...`               | From Step 1                                          |
| `STRIPE_SCHOOL_PRICE_ID`       | `price_...` _(optional)_  | From Step 1 (school product)                         |
| `STRIPE_AUTOMATIC_TAX`         | `true` _(optional, default off)_ | Set to `true` to compute GST at checkout — requires a Stripe origin address (see Going Live step 6) |
| `BILLING_ALERT_WEBHOOK_URL`    | `https://hooks.slack.com/…` _(optional)_ | An incoming-webhook URL (Slack, Discord or Mattermost). See "Operator alerts" below. Keep it secret; no `VITE_` prefix |

> The price IDs are also the **allowlist**: `/api/create-checkout` refuses any
> price that isn't one of these three, so a tampered client can't check out
> against an unrelated price in your Stripe account. Set at least one, or
> checkout returns 501 "No plans are available for purchase yet."
>
> `STRIPE_WEBHOOK_SECRET` is mandatory on **every deployment**: without it the
> webhook refuses every event with a 500 (Stripe retries, so nothing is lost once
> you set it). That includes Vercel previews (`VERCEL_ENV=preview`) and `vercel dev`
> (`VERCEL_ENV=development`); only a local `npm run dev`, where `VERCEL_ENV` is
> unset, still accepts unsigned requests. To check it, post an unsigned event to a
> preview URL and confirm it answers 500, not 200 (see
> `projectDocs/monetisation-review-2026-09.md` §23). An unsigned endpoint would let
> anyone POST a forged subscription event and grant themselves a paid plan. A
> preview that should receive Stripe events needs its own signing secret
> (`stripe listen` prints one).

### Client-side variables (also set in Vercel, or in `.env.local` for dev)

| Variable                            | Value       | Notes                                        |
| ----------------------------------- | ----------- | -------------------------------------------- |
| `VITE_STRIPE_PLUS_MONTHLY_PRICE_ID` | `price_...` | Same value as `STRIPE_PLUS_MONTHLY_PRICE_ID` |
| `VITE_STRIPE_PLUS_YEARLY_PRICE_ID`  | `price_...` | Same value as `STRIPE_PLUS_YEARLY_PRICE_ID`  |

> The `VITE_` prefix is required for Vite to include these in the browser bundle. They are just price IDs (not secrets) so this is safe.

Optional, admin screens only:

| Variable                     | Value                 | Notes                                                                                                                                  |
| ---------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_AI_COST_PER_CALL_AUD`  | e.g. `0.004`          | Total monthly AI spend divided by total monthly AI calls. Turns on the cost and margin columns of the Billing overview's "Seat economics" panel. Read at build time, so redeploy after setting it |

### For local development

Copy `.env.example` to `.env.local` and fill in the values above. The app works **without** any Stripe keys — the billing endpoints return test-mode mock URLs so you can exercise the full checkout redirect flow without a real Stripe account.

---

## Step 4 — Set up the Stripe Webhook

The webhook is how Stripe tells your app about subscription changes (new checkout, upgrades, cancellations, failed payments).

Checkout return now confirms the first purchase itself: `/api/sync-checkout` asks Stripe about the session the browser came back with, and unlocks the plan straight away, without waiting for the webhook. The webhook is still **required**. It is the only thing that applies renewals, cancellations, failed payments and seat changes after the first payment, so a deployment without its endpoint unlocks purchases and then never learns that a subscription has ended.

### 4a — Create the webhook endpoint in Stripe

1. Go to [Stripe Dashboard → Developers → Webhooks](https://dashboard.stripe.com/webhooks).
2. Click **+ Add endpoint**.
3. Set the **Endpoint URL** to:

   ```
   https://your-app.vercel.app/api/stripe-webhook
   ```

   Replace `your-app.vercel.app` with your actual domain.

4. Under **Events to send**, select these nine:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
   - `invoice.payment_action_required` (3-D Secure: the bank wants the customer
     to confirm. Without this the challenge is silent and the subscription
     lapses with no warning shown.)
   - `charge.dispute.created`, `charge.dispute.closed` and `charge.refunded`
     (a chargeback has a hard evidence deadline; a full refund may end a licence.
     Without these you learn of a dispute only from Stripe's email. See
     "Disputes and refunds" below.)

   These nine are exactly the events the handler acts on. Any other event type
   is acknowledged and ignored, so there is no need to subscribe to more.
   Which of them the plan itself depends on:
   - **Required for the plan to be right:** `checkout.session.completed` (links
     the customer to the profile) and `customer.subscription.created`,
     `customer.subscription.updated` and `customer.subscription.deleted` (grant,
     renew and end the plan and any School licence).
   - **Optional:** `charge.dispute.created`, `charge.dispute.closed` and
     `charge.refunded` only record an incident and alert you; they never change a
     plan.
   - **Optional:** `invoice.payment_failed` and `invoice.payment_action_required`
     only raise the payment-problem banner. The plan keeps working during
     Stripe's retries either way. Without them the plan is still correct, but
     nobody is told a card has failed or needs confirming.

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
   stripe listen --forward-to localhost:3000/api/stripe-webhook
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

**Running the full `supabase/schema.sql` covers this** — it is the source of
truth, it is idempotent, and it is what CI tests. The excerpt below is here only
so you can see what the billing sections add; if the two ever disagree, the
schema file wins.

If you would rather apply just the billing parts, you need §13 (Stripe billing tables, below) **and §14** (the server-side free-tier evaluation counter — the paywall's 5-a-day limit is enforced there, not in the browser). Run this in your Supabase SQL Editor:

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

The abridged snippet above is enough to take payments, but the full `§13`
also creates:

- **`stripe_events`** — the webhook's idempotency ledger. Stripe delivers each
  event _at least_ once, so without this a redelivery is applied twice. Its
  `processed_at` column marks an event as applied. If the function is killed
  part-way through an event, Stripe's next retry takes the event over after two
  minutes; a delivery that arrives while the first attempt is still running is
  answered `409` and retried. Rows from before the column are treated as already
  applied, so re-applying the schema does not replay history. An event that was
  left unfinished when you re-apply is treated the same way. If you know one
  failed, resend it from the Stripe Dashboard's event log.
- **`subscriptions.last_event_at`** — the ordering guard. Stripe does not order
  deliveries; without it a delayed `customer.subscription.updated` can arrive
  after a cancellation and resurrect the plan.

And `§14` creates `evaluation_usage` plus `consume_evaluation()`, which is what
actually enforces the free tier's daily marking limit. Skipping it doesn't break
checkout — the proxy fails open — but every free user gets unlimited marking,
**and unredacted feedback**: the proxy uses the same RPC's verdict to decide
whether to strip paid feedback from a marking result, so without §14 it can't
tell a free user from a paying one and sends everything.

To verify all of it on a throwaway Postgres, `supabase/tests/entitlement_tests.sql`
asserts the boundaries (who is metered, where the counter cuts off, that a user
can't write their own usage row); CI runs it on every push.

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
8. The return confirms the purchase with Stripe (`/api/sync-checkout`) → `profiles.stripe_plan` becomes `'plus'` → all gates unlock. If that confirmation is not possible, the app waits for the webhook instead, as before.

### Verify the webhook worked

Check in Supabase:

```sql
select id, stripe_customer_id, stripe_plan, plan_period_end
from profiles
where id = 'your-user-uuid';
```

You should see `stripe_plan = 'plus'` and a valid `plan_period_end`.

### Read the billing overview (admin)

Admin Tools → Billing → **Billing Overview** shows, without opening Stripe or Supabase: who is paying and on which
plan, which subscriptions need a decision, what renews or ends in the next 7 and 30 days, and the last ten webhook
events. It is read-only; change anything in Stripe or the billing portal.

- It needs schema §13 (`subscriptions`, `stripe_events`) and, for school seats, §12 (`list_schools`). If a table is
  missing, the panel says which section to re-apply.
- The webhook is judged quiet after 45 days with paid subscriptions on the books. Annual-only deployments can
  legitimately be quiet that long, so that item says so and asks you to check Stripe before assuming a fault.
- A renewal is flagged as not recorded four days after its period ended, which is longer than Stripe's own
  webhook retry window. A checkout still incomplete after a day is flagged as stalled.
- The event list records only events the webhook accepted. A delivery it rejected appears in Stripe's
  webhook log instead.
- No money is shown. The app's display prices are presentation strings, not Stripe amounts.

---

## Step 7 — Manage Subscriptions (Billing Portal)

Logged-in paid users can manage their subscription from their **profile modal** (the user avatar → Overview tab → Plan card → "Manage Subscription" button), and from the upgrade prompt when checkout refuses a second subscription. This opens the Stripe Billing Portal where they can:

- Cancel their subscription
- Update payment method
- View invoices
- Change plan or seat count — **only if you enable it**, see below

> Stripe hosts the portal UI, so nothing needs deploying. But **check what your portal configuration actually allows** before going live: the app sends users there for plan and seat changes in two places — `api/create-checkout` refuses a second concurrent subscription with "Use *Manage subscription* to change your plan or seats", and the upgrade prompt turns its own CTA into that portal link when it sees that refusal. If the portal cannot switch plans or update quantities, both messages point at a dead end.
>
**School licences.** Teachers and admins who belong to a school with a licence see **Manage school licence** on the School licence panel. It opens the portal for the customer behind the school's licence, found on the server from the caller's own school, so a colleague or an admin who did not buy the licence can use it. Students, and staff with no school, are refused. **Anyone who can open it can cancel the licence and change seats**, so check the portal settings below before staff use it. If only some staff should cancel, create a second portal configuration with cancellation off; the app does not yet choose between them (open decision, see the 15 October handoff).

> In **Settings → Billing → Customer portal**, confirm that *Customers can switch plans* is on and that every price you sell is listed as a switchable product, and that *Customers can update quantities* is on (this is what lets a school top up seats). Cancellation, payment-method updates and invoice history are the parts that work without configuration.

---

## One open checkout, and billing incidents

**One payable checkout at a time.** Each account has one open Stripe Checkout
Session at any moment. Pressing Upgrade again, in another tab or on another
device, expires the earlier session and gives a new one. A double tap returns
the same session. Before this change, two sessions could both stay payable for
a day, and a customer who paid both was charged twice.

**Sessions expire after 31 to 36 minutes**, not Stripe's default of 24 hours, so a tab
left open overnight cannot complete a purchase. The constants are
`CHECKOUT_LIFE_MS` and `CHECKOUT_REQUEST_BUCKET_MS` in `api/_lib/openCheckout.ts`.
Nothing here is an environment variable.

**A purchase is refused, not just warned about, in one new case.** A personal
subscription whose first payment is still waiting on the customer's bank (Stripe's
`incomplete`, for example a 3-D Secure step) holds that customer's new purchase
for 45 minutes after its last update. That is the window in which the customer
can approve the payment in their bank's prompt. The customer sees "still waiting
for your bank to confirm the payment" and is told to finish or cancel it there,
and to start again if nothing happens within an hour. After 45 minutes the hold
lifts by itself, so a customer who came back later can buy again. The window is
`INCOMPLETE_HOLD_MS` in `api/_lib/openCheckout.ts`. To clear a stuck subscription
at once, cancel it in the Dashboard.

A school licence in that state does not hold the school, because a school row
carries no timestamp. A colleague can start a second licence while the first is
waiting for payment. If both are paid, the `duplicate_school_licence` incident
below records it. The reasoning is in `projectDocs/monetisation-review-2026-09.md`
§36.

**Schema.** Schema §13 adds two tables, `checkout_sessions` (one row per
account, service-role only) and `billing_incidents` (admins can read it). Until
you re-apply the schema, checkout behaves as it did before: nothing is
recorded, no incident is written, and the log says so.

**When a billing incident is open.** The webhook, and the return from Checkout,
write a row to `billing_incidents` in five cases. Nothing is cancelled and
nothing is refunded automatically. The row is for you to act on. Open incidents
show in **Admin → Billing overview**, each with a **Mark resolved** button and an
optional note (schema §29; until you re-apply the schema the button is replaced by
a line saying so).

- `duplicate_subscription`: one account holds two live subscriptions. Stripe
  bills both, and the plan follows the one that runs longest. The listed
  subscription ids are in `subscription_ids`.
- `duplicate_school_licence`: a school's licence was replaced while the one it
  held was still live. Both are billed, and the school row names only the newer.
- `customer_mismatch`: a profile already linked to one Stripe customer completed
  a purchase under another. The plan was applied to the account, but the link was
  not changed, so the billing portal still opens the first customer. The second
  customer's subscriptions cannot be managed from the app until you relink them.
- `dispute`: a cardholder's bank opened a chargeback. See "Disputes and refunds".
- `refund`: a charge was refunded in full. See "Disputes and refunds".

Some of these are not errors. An invoiced licence (purchase order) is stamped with
the id of the teacher who requested it, so a teacher who also holds a personal Plus
subscription will be flagged as `duplicate_subscription`. Check the product before you
cancel anything.

What to do:

1. List the open incidents in the Supabase SQL Editor:
   ```sql
   select id, kind, user_id, school_id, subscription_ids, detail, detected_at
     from public.billing_incidents
    where resolved_at is null
    order by detected_at;
   ```
2. For each subscription id, open it in the Stripe Dashboard
   (Billing → Subscriptions) and decide which one should stay.
3. Cancel or refund only what you have decided on, in the Dashboard. A
   subscription you cancel there reaches the app through the normal webhook.
4. Close the incident, with a note:
   ```sql
   update public.billing_incidents
      set resolved_at = now(), resolution_note = 'Cancelled sub_… and refunded.'
    where id = '<the id from step 1>';
   ```
   If you do not close it, the same finding is not written again, but it stays on
   the list.
5. For `customer_mismatch`, relink the account to the customer that holds the
   subscription, once you have checked which one it is. `stripe_customer_id` is
   unique, so this fails if another profile already holds that customer:
   ```sql
   update public.profiles set stripe_customer_id = 'cus_…' where id = '<user_id>';
   ```

Logs carry the same findings under `[stripe-webhook] BILLING INCIDENT`.

### Disputes and refunds

Enable `charge.dispute.created`, `charge.dispute.closed` and `charge.refunded` on the
webhook endpoint (Step 4a). Nothing is cancelled, refunded or re-planned
automatically; the webhook records an incident and alerts you.

- **A dispute is opened.** An incident of kind `dispute` is recorded with the amount,
  reason, status, the **evidence deadline** and the Stripe dispute and charge ids, and
  an alert says "Respond in Stripe by <date>". Respond in the Dashboard before that
  date. If the database is behind the schema (§29), the alert is still sent.
- **A dispute closes.** Won, or any close other than lost, resolves the incident
  with the status as the note. **Lost** keeps it open and alerts you ("the funds
  were withdrawn"); decide what follows, then mark it resolved.
- **A charge is refunded in full.** An incident of kind `refund` is recorded and says
  access is unchanged. If the refund ends the licence, cancel the subscription in
  the Dashboard. Partial refunds are ignored.
- The table allows one open incident per account (or school) and kind, so a second
  dispute for the same account is added to the open row rather than a new one.

### Operator alerts

Set `BILLING_ALERT_WEBHOOK_URL` (server-side, no `VITE_` prefix) to a Slack, Discord
or Mattermost incoming-webhook URL to be told without opening the admin. Unset, nothing
is sent and nothing else changes. Alerts fire for a new invoice request, a new billing
incident, a dispute and a full refund. Each message names the school (or its id),
seats, PO number or amount and where to act. It never carries a billing email, ABN,
address, note or any person's name or email. The alert waits at most 4 seconds and never
changes what the requester or Stripe receives. Treat the URL like an API key and rotate
it if it leaks. Redeploy after setting it.

### Who can read school licence data

After re-applying the schema (§12, §13 and §28), a signed-in user can read only their
own school's row, and only `id`, `name`, `plan_status`, `plan_period_end` and
`plan_cancel_at_period_end` (the app needs those to give members their School plan).
`stripe_subscription_id`, `plan_seats` and `daily_ai_limit` are readable by nobody through
the REST API, admins included; the admin screens read them through `list_schools()`,
which is now admin-only (teachers are refused). A custom integration that runs
`select *` on `schools` will fail with "permission denied": use `list_schools()` as an
admin, or the service role.

### Seat economics

**Admin → Billing overview → Seat economics** (schema §30, `school_seat_usage()`) shows,
per licensed school, calls per seat per day and the 95th percentile of calls per user per
day, over 30 or 90 days. Set `VITE_AI_COST_PER_CALL_AUD` to see projected cost and margin
per seat against the seat price. It changes no quota or price. How to read it and the
decisions it informs are in `projectDocs/seat-economics.md`.

## Going Live (Production Checklist)

When you're ready to accept real payments:

1. **Switch to live keys**: Replace all `sk_test_` / `pk_test_` values with `sk_live_` / `pk_live_` from Stripe Dashboard (toggle off "Test mode").
2. **Create a live webhook**: Same steps as Step 4a but with your production URL and live mode enabled.
3. **Create live prices**: Products created in test mode don't carry over. Create the same product/prices in live mode and update all Price ID env vars. The app now reads the displayed prices from Stripe (`GET /api/prices`, cached for about 10 minutes, then up to 5 more at the CDN). Make each price a flat recurring AUD price and set its **tax behaviour** (inclusive or exclusive): the UI says "incl. GST" or "+ GST" from that setting and says nothing when it is unspecified. A tiered, metered, inactive or non-AUD price is left out and the screen falls back to `VITE_PLUS_MONTHLY_PRICE_DISPLAY`, `VITE_PLUS_YEARLY_PRICE_DISPLAY` or `VITE_SCHOOL_SEAT_PRICE_DISPLAY`, so keep those in line with Stripe. The "Save 38%" line still comes from `VITE_PLUS_YEARLY_NOTE`; update it by hand.
4. **Update Vercel env vars**: Swap every test value for its live counterpart and redeploy.
5. **Test with a real card**: Make a small real purchase, then cancel/refund it from the Stripe Dashboard.
6. **Enable Stripe Tax** (optional): For Checkout to actually compute and add GST you must do **both** of the following — dashboard configuration alone does nothing for Checkout:
   - **(a)** In Stripe Dashboard → Tax, enable Stripe Tax and set an **origin address** for your region. (Stripe refuses to enable automatic tax on an account with no origin address, so this must be done first.)
   - **(b)** Set the deployment env var `STRIPE_AUTOMATIC_TAX=true` and redeploy. This switches on `automatic_tax` on the Checkout Session — without it Stripe charges the GST-exclusive price and the ABN collected at checkout is never acted upon, so GST is under-collected on every AUD sale.

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
        │ user pays, then Stripe returns the browser to ?checkout=success&session_id=…
        ▼
 POST /api/sync-checkout            (on return; the only client input is the session id)
        │ retrieves the session from Stripe; refuses unless it is this user's, paid, and a subscription
        │ applies the subscription through api/_lib/subscriptionSync.ts (same code as the webhook)
        ▼
 profiles.stripe_plan = 'plus'
        │
        ▼
 POST /api/stripe-webhook           (every later event: renewals, cancellations, failed payments)
        │ checkout.session.completed → links stripe_customer_id to profile
        │ customer.subscription.created → upserts subscription row + sets stripe_plan
        ▼
 profiles.stripe_plan kept in step with Stripe
        │
        ▼
 getUserPlan() returns 'plus' → all gates unlock
```

---

## Troubleshooting

| Symptom                                                     | Cause                                                                                         | Fix                                                                                             |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Upgrade button redirects to `/#/upgrade-test`               | `STRIPE_SECRET_KEY` not set on server                                                         | Set it in Vercel env vars and redeploy                                                          |
| Checkout works but plan doesn't update                      | Webhook not receiving events                                                                  | Check Stripe Dashboard → Webhooks for failed deliveries; verify `STRIPE_WEBHOOK_SECRET` matches |
| Paid, returned to the app, plan still locked                | `/api/sync-checkout` could not confirm the purchase (the server log says why, prefixed `[sync-checkout]`): usually a `STRIPE_*_PRICE_ID` missing on the server, or a server key from the other Stripe mode (test or live) | Fix the price ID or key named in the log. The webhook applies the purchase once its endpoint is registered and reachable |
| Webhook returns 501                                         | `SUPABASE_SERVICE_ROLE_KEY` not set                                                           | Add it to Vercel env vars                                                                       |
| Checkout/portal returns 503                                 | Only the `VITE_SUPABASE_*` pair is set                                                        | Add the unprefixed `SUPABASE_URL` / `SUPABASE_ANON_KEY`; the response body names them           |
| Checkout returns 401 "User identity required"               | No server-side Supabase at all, so there is no signed-in identity to attach a subscription to | Set `SUPABASE_URL` / `SUPABASE_ANON_KEY` — billing cannot work without them                     |
| Webhook returns 400 "Missing stripe-signature"              | Request not coming from Stripe (or secret mismatch)                                           | Verify the signing secret matches the endpoint                                                  |
| Webhook returns 500 "Webhook signing secret not configured" | `STRIPE_WEBHOOK_SECRET` missing in production                                                 | Set it and redeploy — Stripe retries the queued events automatically                            |
| Checkout returns 400 "Unknown plan"                         | Client price ID isn't in the server allowlist                                                 | Make each `VITE_STRIPE_*_PRICE_ID` match its unprefixed server counterpart                      |
| "No billing account found" in portal                        | User hasn't checked out yet                                                                   | The portal requires a prior checkout to create the Stripe customer link                         |
| Customers see "Checkout is unavailable right now, so you have not been charged" | Server answers 503: plan prices are published (`VITE_STRIPE_*`) but `STRIPE_SECRET_KEY` is missing. The UI no longer shows that sentence to customers | Read the function log for "Billing is misconfigured on this deployment", then set `STRIPE_SECRET_KEY` and redeploy |
| Gates still locked after payment                            | Browser has stale user data                                                                   | Refresh the page — `getUserPlan()` reads from the profile on each call                          |
| Admin sees gates                                            | Running an old build                                                                          | Redeploy from `main` — admins bypass every gate in current code                                 |

---

## Test Mode (No Stripe Account Needed)

If you just want to test the UI flow without any Stripe setup:

1. Leave all `STRIPE_*` env vars **unset**.
2. The endpoints return mock URLs (`/#/upgrade-test`, `/#/portal-test`).
3. The checkout redirect flow works end-to-end — you'll see the success/cancel toast.
4. No subscription state changes in the database (the webhook is a no-op without Stripe).

This is useful for front-end development and UI testing.

## What each plan includes

The shipped policy, and what a deployment can change. The reasoning is in
`projectDocs/tier-structure.md`; the comparison a buyer sees is derived from the
same rules (`utils/planComparison.ts`).

| | Free | Band 6 Plus | School |
| --- | --- | --- | --- |
| For | A student trying it out | A student or parent getting better | A head teacher or accounts office covering a cohort |
| Marked answers | 5 a day | No daily limit | No daily limit (every member of the school) |
| Question tiers | 1–3 | All, 1–6 | All, 1–6 |
| Marking feedback | Summary and band | Every criterion | Every criterion |
| Sample answers | Bands 1–3 | All bands | All bands |
| Answer upgrades, exam simulation, outcome briefings, student progress report (PDF) | No | Yes | Yes |
| AI Content Studio | Teacher and admin accounts only | Teacher and admin accounts only | Teacher and admin accounts only |
| Class and school reports (PDF) | No | No | Yes (staff accounts) |
| How it is bought | Nothing to pay | Card, monthly or yearly | Card per seat, or invoice against a purchase order where invoicing is on |

Things to know:

- A teacher holds Plus through their staff account, so no Plus lock applies to them. The
  Class and school reports are the one thing a teacher needs a licence for.
- A teacher with their own Plus inside a licensed school holds School, because the licence is the
  higher plan. The server does the same (`caller_plan()`, schema §17).
- `PLAN_FEATURE_OVERRIDES=cohortReports:plus` (with `VITE_PLAN_FEATURE_OVERRIDES`) makes the
  reports Plus again, which is what every teacher had before the School tier.
- Students never see a School route. A student who presses a School lock is told their school
  provides it.

## School seat licences (optional)

Sell a whole-school licence directly from the upgrade modal:

1. **Create a per-seat price**: Stripe → Products → "Band 6 School" → add a
   **yearly recurring** price representing ONE student seat (e.g. A$4/year).
2. **Set the env vars** (server _and_ client must agree):
   - `STRIPE_SCHOOL_PRICE_ID=price_…` (server — maps the price to the
     `school` plan and allows seat quantities at checkout)
   - `VITE_STRIPE_SCHOOL_PRICE_ID=price_…` (client — switches the School
     licence panel from an enquiry link to a direct seat purchase for
     teachers/admins. That panel appears in the plan comparison, Profile →
     Compare plans, and in the upgrade prompt. The comparison is the one that
     matters: staff hold a paid plan already, so they never meet a locked
     control and the prompt never opens for them)
   - `VITE_SCHOOL_SEAT_PRICE_DISPLAY=A$4` (display only)
3. **Re-apply the schema** (`supabase/schema.sql` §13 adds
   `schools.stripe_subscription_id / plan_seats / plan_status /
plan_period_end / plan_cancel_at_period_end` and `subscriptions.seats` — all
`add column if not exists`, safe to re-run). Re-applying also refreshes
`list_schools()`, which is what puts the licence columns in front of an admin;
until you do, the dashboard shows the licence as "unknown" and reads an end
date as a renewal date. The same section adds `my_school_seats()`, which the
over-seat notice for teachers and admins reads. Until it exists the notice stays
hidden and nothing else changes.

How it works: a teacher or admin picks a seat count and checks out; the
webhook stores the seat quantity and stamps the licence onto **their
school** (`profiles.school_id`). Every member of that school then resolves
to the School plan at sign-in for as long as the subscription is active
(`past_due` keeps the plan during Stripe's retry grace period, exactly like
personal subscriptions). Seats are the billed quantity — compare
`plan_seats` with the school's member count in the admin dashboard for
true-ups.

Three things an operator should know about how this behaves:

- **Members beyond the paid seats keep School access.** Nothing counts seats at
  sign-in (`caller_plan()`, `has_unlimited_evaluations()` and
  `resolve_ai_quota()` all check the licence status alone). The seat count is a
  billing fact, not an access gate. Staff are told when the school is over its
  seats, and the purchaser can add seats from Manage subscription.
- **A licence that starts or ends reaches members without a reload.** The app
  re-reads the plan when a signed-in person returns to its tab or the connection
  comes back, at most once every five minutes. Members see one notice when their
  plan changes. Until then a member can still see the old plan.
- **Any teacher or admin in the school can open Manage school licence.** The
  server finds the licence's Stripe customer from the caller's own school, so the
  purchaser is no longer special. Whoever opens it can cancel the licence and
  change seats (see Step 7). The seat-overage notice still tells non-purchasers to
  ask the buyer.

**Class & school reports are a School feature.** The Class report (a teacher's
classes) and the School report (an administrator's school) are gated by the
`cohortReports` key, priced at `school`. A teacher holds Plus as a staff perk, so
without a licence the report is locked for them; the purchaser's school licence
unlocks it for every member of the school. The student's own progress report
stays on Plus (`pdfExport`). Class Insights and the cohort view stay open to all
staff. To keep the reports open to every teacher, set
`VITE_PLAN_FEATURE_OVERRIDES=cohortReports:plus` **and**
`PLAN_FEATURE_OVERRIDES=cohortReports:plus` (see `.env.example`).

**Important**: the buyer must belong to a school (Admin → Schools) _before_
purchasing. `api/create-checkout` now refuses a school-price checkout from an
account with no `school_id` and says so, rather than taking the money for N
seats and licensing one person — the school row is not back-filled when an
admin assigns them later, so the licence would stay attached to nothing until
the subscription next updates.

## Invoiced school licences (purchase orders)

Many schools cannot pay by card. The accounts office raises a purchase order
and pays an invoice later. This flow lets a teacher or admin ask for a licence
to be invoiced, and lets a platform admin approve it.

**The flow.**

1. A teacher or admin attached to a school asks for an invoice: the number of
   seats, the billing name and email, the billing address, and optionally the
   ABN, the purchase order number and a note. `POST /api/request-invoice`
   records the request. It moves no money and needs no Stripe.
2. A platform admin approves or declines it. `POST /api/issue-invoice`
   does this. A decline changes nothing in Stripe.
3. Approval creates the Stripe objects. The customer is the requester's own,
   or a new one linked to their profile. A subscription on the school price is
   created with `collection_method: send_invoice` and 30 days to pay. Stripe
   finalises the first invoice and emails it, with a hosted payment page. The
   existing webhook then licenses the school, exactly as it does for a card
   purchase. No webhook change is involved.

**What the school sees.** Under the School seat picker, on the upgrade prompt
and on the plan comparison, a teacher or admin sees "Invoices and purchase orders
are accepted for school licences" and a disclosure, "Pay by invoice or purchase
order". Students and parents see the same line without the disclosure: a teacher
or admin at the school asks for the invoice. The form asks for the name on the
invoice, the accounts email, an Australian billing address, and optionally the
ABN, the purchase order number and a note. Nothing is charged while the request
is pending. The panel then shows the request's state in place of the form:

- **Pending.** The date it was received, and that the invoice will be emailed to
  the accounts address once it is approved, usually within two working days.
- **Approved.** The invoice, as a link to Stripe's hosted page (https only), and
  that members get School access within five minutes of opening the app. The due
  date is printed on the invoice.
- **Declined.** The administrator's note, and the form again, filled in from the
  declined request, so the school can correct it and ask again.

Two things the school is not told. A colleague's pending request appears only as
a summary ("received on", seats, "waiting for approval") with no billing details,
because that is all the server returns for another person's request. And a
teacher who opens the panel later, after a colleague has asked, sees the form
again, not the summary: a read cannot see another person's request, so the
summary appears only once they send their own. Nothing on any of these screens
offers the billing portal.

**Where the queue is.** Requests wait in the admin Billing overview (Admin Tools →
Billing → Billing Overview), under **Invoice requests** at the top of **Needs
attention**. Deciding them is set out in "Deciding a request" below.

Each school can have one pending request at a time, and an account can raise
three requests in any 24 hours. Approval refuses when the school already holds
a live licence, so the same seats are never invoiced twice.

**Approval activates the licence at once.** Access is granted when the invoice
is issued, not when it is paid, because a purchase order is a commitment. The
member's plan is live as soon as the webhook has applied the subscription,
moments after the admin approves. What ends it if the
invoice is never paid is the subscription's status, so set Stripe's behaviour
for unpaid invoices (below).

**Deciding a request.** The queue is on the Billing overview (admin tools, then
Billing Overview). Pending requests sit at the top of **Needs attention**, under
**Invoice requests**, oldest first. Each card shows the school, the seats, the
billing contact and address, the ABN and the purchase order number, and how long
the request has waited in working days (Monday to Friday, counted in Sydney time;
NSW public holidays are not excluded). A request waiting more than three working
days is marked overdue.

- **Approve** opens a confirm step that says what will happen before anything is
  sent: the subscription and its seats, the invoice and the address it goes to,
  and the payment terms. Choose 14, 30, 45 or 60 days (30 by default), then press
  **Approve and send invoice**. The school's members get access once the
  subscription is recorded, before the invoice is paid. If the person who asked
  already has a Stripe billing customer, its name, email and address are replaced
  with the ones on the request.
- **Decline** takes an optional note, which the person who asked sees. It changes
  nothing in Stripe and sends no invoice.

While a call is in flight the decision buttons, Refresh and the close control are
disabled, and Escape or a press on the backdrop does not close the window, so an
answer cannot be lost. Only one call goes out at a time.

**When the answer is not clean.**

- A refusal shows the server's sentence as it came. Act on what it says: a school
  that already holds a live licence has to be declined, not approved.
- A refusal that names a Stripe subscription (`sub_…`) means Stripe already holds
  one for this request, usually because an earlier approval stopped part-way. Approve
  is then off in that window. Check the subscription in the Stripe Dashboard, then
  press Refresh. The request is read again, and Approve comes back. Approving again
  reuses that subscription and does not create a second one. Decline stays on, and
  the server refuses it while the subscription is still billing.
- If the answer never arrives (the connection drops, or the server times out), the
  window says the result is not known, and both buttons stay off. Press Refresh and
  check the request, and Stripe, before doing anything else.

**Nothing tells you a request has arrived.** No email or push goes to an admin
when a request is made. The queue shows it when you open the Billing overview, so
that is the only signal until a notification route exists. If the purchase-order
table (schema §27) is not in the database yet, the overview says the requests were
not checked, and the rest of the page still loads.

**Stripe Dashboard settings** (the labels move from time to time, so look for
the settings described):

- **Unpaid invoices:** under Billing, choose what happens to a subscription
  whose invoice is not paid. Either cancel it after a number of days, or mark it
  unpaid. Either ends the licence in the app. Without a setting here, an unpaid
  subscription may stay active for as long as its invoice stays open. A
  `past_due` subscription keeps the licence through Stripe's retry window, as a
  card does.
- **Invoice details:** check the business name and ABN on the invoice template
  (Billing → Invoices, or Branding). A tax invoice must show the supplier's ABN,
  and the school's accounts office will ask for it.
- **Payment methods:** enable the methods the accounts office will use on
  invoices (bank transfer is the usual one for Australian schools) under
  Settings → Payment methods. The hosted invoice page offers only those.
- **Customer portal:** if the portal is set to show invoices, a teacher can find
  the invoice there again.

**Creating one by hand.** An operator can make the same subscription in the
Dashboard (Billing → Subscriptions → Create): the school's customer, the school
price with the seat count as quantity, collection method "send invoice", and
metadata `supabase_user_id` set to the id of a teacher or admin who belongs to
that school (copy it from `profiles` in Supabase). The webhook finds the school
through that profile, so the profile must already have `school_id` set. If a
request is still pending for the same school, decline it: approving it would
refuse, because the school then holds a licence.

**Turning it off.** Set `SCHOOL_INVOICE_ENABLED=false` on the API host (or
`VITE_SCHOOL_INVOICE_ENABLED=false`, which the server also reads). Both request
endpoints then answer 404, and no new approval can start. Pending requests stay
in the table and can be declined later. Unset or `true` turns it back on.

The app has its own copy of the switch, and it is read when the site is built,
not when the API runs. A server-only `false` leaves the disclosure on screen, and
a teacher who sends the form is then told the route is not offered on this
deployment. To take the route off the screen as well, set
`VITE_SCHOOL_INVOICE_ENABLED=false` and rebuild and redeploy the site. The app
also needs `VITE_STRIPE_SCHOOL_PRICE_ID` set; without it the route is not drawn,
because an approval has no price to invoice.

**Database.** `supabase/schema.sql` §27 adds the `licence_requests` table. It is
`create … if not exists` throughout, so re-apply the schema to add it. Until you
do, both endpoints answer with a "could not" message and nothing is written.

**One licence per school.** A second school-price purchase is refused before any
payment is taken, with a 409 that names the fix: ask whoever bought the licence
to add seats through **Manage subscription**. A licence still set to end at the
period boundary counts as held, because its buyer can resume it. A cancelled or
unpaid licence does not, so the school can buy again. Plus purchases are never
affected. If the licence columns have not been re-applied yet, the check is
skipped and logged. If the lookup itself fails, the purchase is refused with a
503, nothing is charged, and the buyer can retry.

> Decided (§36): a licence whose first payment is still waiting for 3-D Secure
> (status `incomplete`) does not hold the school. A colleague can buy a second
> licence during that wait. If both are paid, the `duplicate_school_licence`
> incident records it. The buyer's own purchases are held for 45 minutes after the
> last update of their subscription. See `projectDocs/monetisation-review-2026-09.md`
> §22 and §36.
