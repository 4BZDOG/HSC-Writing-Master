# Vercel Setup Guide — HSC AI Evaluator

A step-by-step walkthrough for deploying the HSC AI Evaluator to Vercel for the
first time. No prior Vercel experience required.

---

## What Vercel does for this project

Vercel hosts two things:

1. **The frontend** — the React/Vite app your users open in a browser.
2. **The AI proxy** (`/api/gemini`) — a serverless function that keeps your AI
   provider keys secret and enforces per-user quotas. This file already exists
   in the repo (`api/gemini.ts`); Vercel auto-detects it.

Without Vercel (or a similar host), the AI marking/generation features have
no server to call and will show "AI Service Unavailable".

---

## Prerequisites

- A GitHub account with this repo pushed to it (public or private — both work).
- An AI provider key (at minimum, a **Gemini API key** from
  [aistudio.google.com/app/apikeys](https://aistudio.google.com/app/apikeys)).
- The project builds locally: run `npm run test:all` and confirm it passes.

---

## Step 1 — Create a Vercel account

1. Go to [vercel.com](https://vercel.com) and click **Sign Up**.
2. Choose **Continue with GitHub** — this links your GitHub repos automatically.
3. Accept the prompts to authorise Vercel on your GitHub account.

> **Tip:** The free "Hobby" plan is more than enough for this project.

---

## Step 2 — Import the project

1. From the Vercel dashboard, click **Add New → Project**.
2. Find and select your **HSC-Writing-Master** repository (or whatever you named
   the fork). If you don't see it, click **Adjust GitHub App Permissions** and
   grant access to the repo.
3. Vercel will read `vercel.json` and pre-fill the settings:
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm ci --legacy-peer-deps`

   These should all be correct — **don't change them**.

4. **Don't deploy yet** — skip to Step 3 to add your environment variables
   first (otherwise the first deploy will build without AI keys).

---

## Step 3 — Add environment variables

Still on the import page (or go to **Settings → Environment Variables** if
you've already imported), add these variables:

### Required

| Variable         | Value                         | Notes                        |
| ---------------- | ----------------------------- | ---------------------------- |
| `GEMINI_API_KEY` | Your Google AI Studio API key | Powers the default AI engine |

### Optional — additional AI providers

| Variable             | Value               | When needed                                             |
| -------------------- | ------------------- | ------------------------------------------------------- |
| `ANTHROPIC_API_KEY`  | Your Anthropic key  | Only if you switch to a Claude engine in admin settings |
| `OPENROUTER_API_KEY` | Your OpenRouter key | Only if you use OpenRouter models                       |
| `GROQ_API_KEY`       | Your Groq key       | Only if you use Groq models (free tier available)       |

### Optional — Supabase integration (multi-user mode)

If you've set up Supabase (see `SUPABASE_SETUP.md`), add these too:

| Variable                 | Value                              | Purpose                        |
| ------------------------ | ---------------------------------- | ------------------------------ |
| `VITE_SUPABASE_URL`      | `https://your-project.supabase.co` | Client-side auth               |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/public key      | Client-side auth               |
| `SUPABASE_URL`           | Same URL as above                  | Server-side token verification |
| `SUPABASE_ANON_KEY`      | Same anon key as above             | Server-side token verification |

> **Why four Supabase variables?** The `VITE_` pair is bundled into the
> frontend (the anon key is designed to be public — RLS protects the data).
> The non-`VITE_` pair is read server-side by the AI proxy to verify that
> callers have a valid session before spending your AI budget.

> **All four, or none.** Setting only the `VITE_` pair used to leave the proxy
> open — the app showed real logins and real quotas while `/api/gemini` served
> anyone who found the URL. The proxy now detects that state and returns a 503
> naming the missing variables rather than serving the request, so a
> half-configured deploy fails loudly at launch instead of quietly on the
> invoice. Add all four and AI calls work again immediately.

### Who may sign in (set these before the URL is public)

These decide who can get an account. **A new account is created as a `student`,
and a student carries a 60-call daily AI budget spent against your provider
key** — so a deployment that leaves them unset hands your AI spend to whoever
finds the URL.

| Variable                     | Value                  | Purpose                                                              |
| ---------------------------- | ---------------------- | -------------------------------------------------------------------- |
| `VITE_ALLOWED_EMAIL_DOMAINS` | `education.nsw.gov.au` | Restricts **both** self-registration and SSO to your school's domain |
| `VITE_ENABLE_SIGNUP`         | `false`                | Removes self-registration entirely (accounts provisioned centrally)  |
| `VITE_OAUTH_PROVIDERS`       | `azure`                | Which SSO buttons to draw; `none` hides them all                     |

> **`VITE_ALLOWED_EMAIL_DOMAINS` covers both doors, and that is the point.**
> Restricting sign-up alone restricts nothing: a multi-tenant Entra
> registration — the account type a school needs so its own students can sign
> in — accepts any Microsoft work or school account in the world, and Google
> accepts any Google account. Sub-domains of a listed domain are accepted;
> look-alikes such as `fakeeducation.nsw.gov.au` are not.
>
> On the SSO path this refuses the **session**. The `auth.users` row is created
> by Supabase before the redirect returns, so it cannot prevent the row — the
> authoritative control is a **single-tenant** Entra app registration pinned to
> your tenant. Set both.

> **`VITE_OAUTH_PROVIDERS` must match what you actually enabled** in Supabase
> (Authentication → Providers). A button for a provider Supabase does not have
> configured sends the user away and returns an error. A new Supabase project
> has **none** enabled, so leaving this unset draws three buttons that all fail.

### Optional — billing and the paywall

Skip this whole section and the app still works: with no variables set,
monetisation is **on**, so free accounts get 5 marked evaluations a day and the
paid features render locked — but nothing can be bought, and the upgrade prompt
degrades to "Keep me posted". Everything below is what turns that into a
purchase. See `docs/stripesetup.md` for creating the products themselves.

**Billing needs Supabase configured first.** Both `/api/create-checkout` and
`/api/customer-portal` go through the same auth gate as the AI proxy, and the
webhook writes the plan onto a Supabase profile. Without an identity there is
nothing to attach a subscription to.

| Variable                            | Value                     | Purpose                                                                    |
| ----------------------------------- | ------------------------- | -------------------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`                 | `sk_live_…` / `sk_test_…` | Server-side Stripe client. Unset = every billing endpoint returns a mock   |
| `STRIPE_WEBHOOK_SECRET`             | `whsec_…`                 | Verifies webhook signatures. **Required in production** — see below        |
| `SUPABASE_SERVICE_ROLE_KEY`         | Your service-role key     | Lets the webhook write plans past RLS. **Server-side only, never `VITE_`** |
| `STRIPE_PLUS_MONTHLY_PRICE_ID`      | `price_…`                 | Which prices the server is allowed to sell                                 |
| `STRIPE_PLUS_YEARLY_PRICE_ID`       | `price_…`                 | Which prices the server is allowed to sell                                 |
| `STRIPE_SCHOOL_PRICE_ID`            | `price_…`                 | Per-seat school licence; unset keeps school sales enquiry-only             |
| `VITE_STRIPE_PLUS_MONTHLY_PRICE_ID` | Same `price_…` as above   | Which prices the **client** offers                                         |
| `VITE_STRIPE_PLUS_YEARLY_PRICE_ID`  | Same `price_…` as above   | Which prices the **client** offers                                         |
| `VITE_STRIPE_SCHOOL_PRICE_ID`       | Same `price_…` as above   | Draws the seat picker for teachers and admins                              |

> **Set each price ID as a matching pair, VITE\_ and unprefixed.** They are two
> different lists: the client's decides what to _offer_, the server's decides
> what it will _sell_ (`configuredPrices()`). A `VITE_` price with no server
> twin shows the user a checkout button that answers "Unknown plan. Please
> refresh and try again." A server price with no `VITE_` twin is never offered
> at all. Neither state is announced anywhere else.

> **`STRIPE_WEBHOOK_SECRET` is not optional in production.** An unsigned
> endpoint lets anyone POST a forged `customer.subscription.updated` and grant
> themselves a paid plan, so production refuses unsigned events with a 500
> rather than trusting them. Stripe retries, so events survive until the secret
> is set — but until then, no plan reaches any profile.

> **Half-configured Stripe is silent.** With the `VITE_` price IDs set but no
> `STRIPE_SECRET_KEY`, the endpoint returns a **mock** checkout URL
> (`…#/upgrade-test`) and the browser navigates to a page the app does not
> handle: the Upgrade button appears to do nothing. Check the Stripe key first
> when a checkout "does nothing".

Display prices are separate from what Stripe charges, so a price change needs a
redeploy of these too:

| Variable                          | Default                           | Shown in                        |
| --------------------------------- | --------------------------------- | ------------------------------- |
| `VITE_PLUS_MONTHLY_PRICE_DISPLAY` | `A$7.99`                          | Upgrade prompt, plan comparison |
| `VITE_PLUS_YEARLY_PRICE_DISPLAY`  | `A$59`                            | Upgrade prompt, plan comparison |
| `VITE_PLUS_YEARLY_NOTE`           | `Save 38% — under A$5/month`      | Upgrade prompt                  |
| `VITE_SCHOOL_SEAT_PRICE_DISPLAY`  | `A$4`                             | Seat picker, plan comparison    |
| `VITE_SCHOOL_CONTACT_EMAIL`       | _(unset — shows a toast instead)_ | School licence enquiry link     |

> These are **presentation strings only** — the amount charged always comes
> from the Stripe Price object. Nothing checks that they agree, so change them
> in the same sitting as the price in Stripe.

### Optional — changing what the free tier gets

Each of these has a `VITE_` half read by the browser and an unprefixed half
read by the API. **Set both to the same value.** Setting only the `VITE_` half
unlocks the UI while the server keeps enforcing — a free user sees an unlocked
feedback panel full of "Upgrade to see this feedback."

| Variable                           | Value                | Effect                                                          |
| ---------------------------------- | -------------------- | --------------------------------------------------------------- |
| `VITE_MONETISATION_ENABLED`        | `false`              | Opens every paid feature — pilots and demos. Unset means ON     |
| `MONETISATION_ENABLED`             | `false`              | The server half of the same switch                              |
| `VITE_FREE_TIER_FULL_FEEDBACK`     | `true`               | Gives free accounts the full criterion breakdown                |
| `FREE_TIER_FULL_FEEDBACK`          | `true`               | The server half — stops the proxy stripping it                  |
| `VITE_PLAN_FEATURE_OVERRIDES`      | `sampleAnswers:free` | Moves individual features between plans (`feature:plan` pairs)  |
| `PLAN_FEATURE_OVERRIDES`           | Same value as above  | The server half of the same policy                              |
| `VITE_FREE_TIER_EVAL_LIMIT`        | `5`                  | Displayed daily marking allowance — **display only**, see below |
| `VITE_FREE_TIER_MAX_QUESTION_TIER` | `3`                  | Highest command-term tier a free account may attempt            |
| `VITE_FREE_TIER_MAX_SAMPLE_BAND`   | `3`                  | Highest sample-answer band a free account may read              |

> **`MONETISATION_ENABLED=false` now covers the daily marking limit too.** The
> proxy skips `consume_evaluation()` entirely when nothing is being sold
> (`api/gemini.ts`), so a pilot deployment no longer refuses the 6th evaluation
> of the day. Set the server-side variable, not only its `VITE_` twin — the
> client half opens the UI, the server half is what stops the meter. The AI
> quota (§11) is untouched by either: the provider bill still needs a ceiling.

> **`VITE_FREE_TIER_EVAL_LIMIT` changes the number the UI states, not the
> number enforced.** The limit is `free_evaluation_limit()` in Postgres. Change
> it in the app — the admin **Usage dashboard → Free plan · daily marked
> evaluations** — which takes effect on the next evaluation with no redeploy;
> `select set_plan_setting('free_evaluation_limit', 1000);` does the same thing
> from the SQL editor. The client asks the server for the live figure at
> sign-in, so the two agree without this variable being touched; set it only to
> fix what an unauthenticated visitor is shown before that first sync.

### Optional — demo mode (no Supabase)

| Variable                | Value  | Purpose                                                                     |
| ----------------------- | ------ | --------------------------------------------------------------------------- |
| `VITE_ENABLE_DEMO_AUTH` | `true` | Enables demo logins (admin/admin, teacher/teacher, user/user) in production |

> **Warning:** Without Supabase, the AI proxy accepts unauthenticated calls —
> anyone who discovers your deployment URL can use your AI budget. Keep the URL
> private or configure Supabase for anything beyond personal testing.

### Optional — build behaviour

| Variable           | Value  | Purpose                                                    |
| ------------------ | ------ | ---------------------------------------------------------- |
| `BUILD_SOURCEMAPS` | `true` | Emit source maps from the production build. Off by default |

> Leave it off unless you are uploading maps to an error tracker. Everything in
> `dist/` is published, `.map` files included, at a URL derived from the
> bundle's own filename — so an emitted map serves your complete TypeScript to
> anyone who asks for it. If you do switch it on, delete `dist/assets/*.map`
> after the upload and before the deploy; nothing in the repo does that for you.

### Important safety rules

- **Never** put a provider key in a `VITE_`-prefixed variable — those are
  bundled into public JavaScript.
- **Never** commit keys to the repo. `.env.local` is gitignored — keep it that
  way.
- If a key was ever pasted into a chat, issue, or commit, **rotate it** before
  going live.

---

## Step 4 — Deploy

1. Click **Deploy** (from the import page) or push a commit to `main`.
2. Vercel will install dependencies, build the app, and deploy it. This
   typically takes 1–2 minutes.
3. When it finishes, you'll see a green **Ready** status and a URL like
   `https://your-project.vercel.app`.

---

## Step 5 — Verify the deployment

1. Open your deployment URL in a browser.
2. Log in with a demo account (if `VITE_ENABLE_DEMO_AUTH=true`) or your
   Supabase account.
3. Navigate to a question and run an AI evaluation — confirm you get a marked
   response back.
4. If you see "AI Service Unavailable", double-check that `GEMINI_API_KEY` is
   set in Vercel's environment variables and **redeploy** (env var changes
   require a new deployment to take effect).
5. **Prove the AI proxy is closed** (Supabase deployments only):

   ```bash
   curl -si -X POST https://your-project.vercel.app/api/gemini \
     -H 'content-type: application/json' -d '{}' | head -1
   ```

   Expect `401`. A `503` means only the `VITE_` Supabase pair is set — the
   response body names the two missing variables. A `200` or `400` means no
   Supabase at all, so the endpoint is open to anyone with the URL.

6. **Check the account rules hold.** With `VITE_ALLOWED_EMAIL_DOMAINS` set, try
   creating an account with an address outside it — the form should refuse
   before sending anything. Then request a password reset for a real account
   and confirm the emailed link lands on "Choose a new password" rather than
   signing you straight in. If it signs you in, the `?mode=reset` redirect URL
   is missing from Supabase's allowlist (see `SUPABASE_SETUP.md`).

---

## Step 6 — Set up automatic deployments

Vercel auto-deploys on every push to `main` by default. You have two options
for CI/CD — pick **one**, not both (running both causes double deploys):

### Option A: Vercel's built-in Git integration (simplest)

Already active after import — every push to `main` deploys to production, and
every PR gets a preview deployment. Nothing else to configure.

### Option B: GitHub Actions (already in the repo)

The repo includes `.github/workflows/vercel-deploy.yml`. To use it:

1. Go to [vercel.com/account/tokens](https://vercel.com/account/tokens) and
   create a new token.
2. Run `npx vercel link` locally once — it creates `.vercel/project.json`
   containing `orgId` and `projectId`.
3. Add three **repository secrets** (GitHub repo → Settings → Secrets and
   variables → Actions):

   | Secret              | Value                                   |
   | ------------------- | --------------------------------------- |
   | `VERCEL_TOKEN`      | The token from step 1                   |
   | `VERCEL_ORG_ID`     | `orgId` from `.vercel/project.json`     |
   | `VERCEL_PROJECT_ID` | `projectId` from `.vercel/project.json` |

4. **Disable Vercel's Git integration** to avoid double deploys: Vercel
   dashboard → project → Settings → Git → disconnect the repository.

---

## Custom domain (optional)

1. Vercel dashboard → project → **Settings → Domains**.
2. Click **Add** and type your domain (e.g. `hsc-evaluator.yourdomain.com`).
3. Vercel shows the DNS records to add (usually a CNAME). Add them at your
   domain registrar.
4. Vercel handles HTTPS certificates automatically.

---

## Troubleshooting

| Problem                                             | Fix                                                                                                                                                            |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build fails with dependency errors                  | Verify the install command is `npm ci --legacy-peer-deps` (check vercel.json)                                                                                  |
| "AI Service Unavailable" after deploy               | Check `GEMINI_API_KEY` is set in env vars; **redeploy** after adding it                                                                                        |
| CORS errors when frontend is on a different host    | Set `ALLOWED_ORIGIN` env var to the frontend's exact origin                                                                                                    |
| 401 on AI calls                                     | If Supabase is configured, you must be logged in; guest sessions cannot make AI calls (this is intentional)                                                    |
| 429 on AI calls                                     | Daily AI quota exhausted — an admin can raise it via the dashboard or `set_user_ai_quota()`                                                                    |
| Env var changes not taking effect                   | Env vars are baked in at build time — you must **redeploy** after changing them                                                                                |
| 402 on AI calls                                     | Working as intended: the free tier's daily marking allowance is spent, or the call is a feature the plan does not include                                      |
| "Upgrade now" appears to do nothing                 | `STRIPE_SECRET_KEY` is unset, so checkout returns a mock URL. Set it, or clear the `VITE_STRIPE_*_PRICE_ID` pair to hide the button                            |
| "Unknown plan. Please refresh and try again."       | A `VITE_STRIPE_*_PRICE_ID` has no matching unprefixed `STRIPE_*_PRICE_ID` — the server refuses to sell a price it wasn't given                                 |
| "No plans are available for purchase yet."          | `STRIPE_SECRET_KEY` is set but no `STRIPE_*_PRICE_ID` is                                                                                                       |
| Payment succeeded but the plan stays free           | Check the webhook: `STRIPE_WEBHOOK_SECRET` set, endpoint pointed at `/api/stripe-webhook`, and `SUPABASE_SERVICE_ROLE_KEY` present so it can write the profile |
| "No billing account found. Please subscribe first." | The account holds its plan through a staff perk or a school licence, not a subscription of its own — there is nothing to manage in the portal                  |
| Preview deploys work but production doesn't         | Check that env vars are enabled for the "Production" environment (not just "Preview")                                                                          |

---

## What's next

- **Add Supabase** for real multi-user auth, shared curriculum, and per-user
  quotas — see `projectDocs/SUPABASE_SETUP.md`.
- **Monitor usage** — the admin dashboard shows AI call counts and costs per
  engine once Supabase is connected.
- **Add Sentry** (optional) — set `VITE_SENTRY_DSN` for error tracking.
