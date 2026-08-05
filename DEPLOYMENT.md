# Hosting & Deployment Guide

The app is a **static Vite build plus one serverless API route**
(`/api/gemini`) that keeps the AI provider keys server-side and enforces
quotas. That split decides where you can host it:

| Host                     | Frontend | AI features                                        | Effort       |
| ------------------------ | -------- | -------------------------------------------------- | ------------ |
| **Vercel** (recommended) | ✅       | ✅ (serverless proxy runs natively)                | ~5 minutes   |
| **GitHub Pages**         | ✅       | ❌ alone / ✅ when paired with a Vercel API        | ~5 minutes   |
| Netlify                  | ✅       | ⚠️ needs the proxy ported to their function format | ~5 minutes   |
| Cloudflare Pages         | ✅       | ⚠️ needs the proxy ported to their function format | not provided |

**Never put a provider key in client-side code or a `VITE_`-prefixed
variable** — everything `VITE_*` is bundled into public JavaScript. Keys
belong only in the API host's server-side environment variables.

---

## Option 1 — Vercel (recommended: everything works)

The repo is already Vercel-shaped: `vercel.json` is configured, and
`api/gemini.ts` is auto-detected as a serverless function.

### A. Dashboard import (simplest)

1. Push the repo to GitHub and sign in at [vercel.com](https://vercel.com)
   with that GitHub account.
2. **Add New → Project → Import** the repository. Vercel reads
   `vercel.json`; accept the defaults.
3. Under **Settings → Environment Variables**, add the server-side keys:

   | Name                                           | Value                     | Required                                                        |
   | ---------------------------------------------- | ------------------------- | --------------------------------------------------------------- |
   | `GEMINI_API_KEY`                               | your Google AI Studio key | yes (default engine)                                            |
   | `OPENROUTER_API_KEY`                           | your OpenRouter key       | only for OpenRouter engines                                     |
   | `ANTHROPIC_API_KEY`                            | your Anthropic key        | only for Claude engines                                         |
   | **`SUPABASE_URL`**                             | Supabase project URL      | **yes, once Supabase exists — see the warning below**           |
   | **`SUPABASE_ANON_KEY`**                        | Supabase anon key         | **yes, once Supabase exists — see the warning below**           |
   | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | the same two values       | only for multi-user auth                                        |
   | `VITE_ENABLE_DEMO_AUTH`                        | `true`                    | only if you want demo logins (admin/admin) **without** Supabase |

   Set all of these for **Production and Preview**. Do NOT set
   `VITE_API_BASE_URL` (the proxy is same-origin here) or `DEPLOY_BASE_PATH`
   (that is GitHub Pages only, and would break every asset URL).

4. **Deploy.** Every push to `main` redeploys automatically.

> **The unprefixed pair is not a duplicate of the `VITE_` pair.** They hold
> the same two values but are read by different code, and the server-side
> ones are the only thing `api/_lib/auth.ts` looks at. Omitting them does not
> disable a feature — it **fails open**:
>
> - `/api/gemini` accepts unauthenticated POSTs from anyone on the internet,
>   spending your AI budget.
> - Quotas and the free-tier evaluation meter are not enforced at all.
> - Checkout and the customer portal return `401` — billing is dead, because
>   there is no identity to attach a subscription to.
>
> The `VITE_` pair is compiled into the browser bundle; the unprefixed pair is
> only ever read on the server. Both are needed.

Without Supabase the deployment runs in single-user "mock mode"
(IndexedDB, demo accounts), and in that mode `/api/gemini` is deliberately
open — anyone who finds the URL can spend your AI quota, so keep it private
until Supabase is configured.

### B. GitHub Actions deploy (already in the repo)

`.github/workflows/vercel-deploy.yml` deploys previews for PRs and
production on pushes to `main`. It needs three repository secrets
(Settings → Secrets and variables → Actions):

- `VERCEL_TOKEN` — from [vercel.com/account/tokens](https://vercel.com/account/tokens)
- `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` — run `npx vercel link` locally
  once, then copy both ids from `.vercel/project.json`

Use A **or** B, not both (both watching `main` means double deploys).

---

## Option 2 — GitHub Pages (free static hosting)

**Yes, GitHub Pages can host the app "for now"** — with one caveat: Pages
serves static files only, so it cannot run `/api/gemini`. Out of the box a
Pages build is the full **offline experience**: demo/guest login, the
curriculum library, question navigation, writing with live coaching
metrics, drafts in IndexedDB. AI marking/generation shows "AI Service
Unavailable" until you pair it with an API host (below).

### Enable it

1. Repo **Settings → Pages → Build and deployment → Source: "GitHub
   Actions"** (one-time).
2. Push to `main` (or run the workflow manually from the Actions tab).
   `.github/workflows/deploy-pages.yml` builds with the right sub-path
   (`/<repo>/`), enables the demo accounts, and publishes.
3. The site appears at `https://<owner>.github.io/<repo>/`.

### Add working AI to the Pages site (optional)

**Quick test without an API host:** an admin can open **Runtime AI Keys**
(admin menu) and paste a provider key — with no proxy deployed, calls go
directly from that browser tab to the provider. Testing only: the key sits
in the tab's sessionStorage and the sign-in/daily-quota gates don't apply.
For real use, connect an API host:

Host just the API on Vercel (Option 1) and connect the two origins:

1. On **GitHub**: Settings → Secrets and variables → Actions →
   **Variables** → add `API_BASE_URL` = `https://<your-app>.vercel.app`.
   The Pages workflow bakes it into the build (`VITE_API_BASE_URL`).
2. On **Vercel**: add env var `ALLOWED_ORIGIN` =
   `https://<owner>.github.io` so the proxy answers the browser's CORS
   checks for your Pages origin (comma-separate multiple origins; the
   wildcard `*` is deliberately rejected).
3. Re-run both deployments.

---

## Option 3 — Netlify (optional; frontend only)

`.github/workflows/build.yml` has a Netlify production deploy on pushes to
`main`. It is **off unless you configure it**: without both secrets the job
logs a warning and skips, so a green "Deploy to Production" does not by itself
mean anything was published.

Add under **Settings → Secrets and variables → Actions**:

- `NETLIFY_AUTH_TOKEN` — from Netlify **User settings → Applications →
  Personal access tokens**
- `NETLIFY_SITE_ID` — the target site's **Site ID** (Site configuration →
  General)

This publishes the static frontend only. AI features still need an API host,
because the `/api/gemini` proxy is written for Vercel's serverless format and
would have to be ported to Netlify Functions. Pair it with a Vercel API the
same way as the Pages option above (`VITE_API_BASE_URL` at build time,
`ALLOWED_ORIGIN` on the Vercel side).

---

## What each environment variable does

**Server-side (API host only — never bundled):**

- `GEMINI_API_KEY` / `OPENROUTER_API_KEY` / `ANTHROPIC_API_KEY` — provider
  keys used by the proxy. Free-tier notes: Gemini free keys have **no
  quota for Gemini 3 Pro** — select _Gemini 3 Flash_ for both engine roles
  in the admin AI Engine panel; free OpenRouter accounts should select the
  _Free Models Router_ engine.
- `ALLOWED_ORIGIN` — exact origin(s) allowed to call the proxy
  cross-origin. Unset = same-origin only (default).
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` — lets the proxy verify user tokens
  and enforce per-user daily quotas.

**Build-time (safe to expose; anything `VITE_*` ends up in the bundle):**

- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — enables real multi-user
  auth; unset = offline mock mode.
- `VITE_ENABLE_DEMO_AUTH=true` — allows the demo accounts (admin/admin,
  teacher/teacher, user/user) in production builds. Guest access is always
  available. Leave unset on any deployment where Supabase is configured.
- `VITE_API_BASE_URL` — origin of the AI proxy when it lives on a
  different host than the frontend.
- `DEPLOY_BASE_PATH` — sub-path the site is served under (the Pages
  workflow sets `/<repo>/` automatically; leave unset for root hosting).

---

## Billing, plans and what each plan unlocks

Three plans — **free → plus → school** — and seven gated features. The policy
lives in `services/planPolicy.ts` (what the UI locks) and its server mirror
`api/_lib/planPolicy.ts` (what the API refuses); a unit test pins the two
together. Shipped defaults: every feature needs **plus**, except the AI content
studio, which needs **school**.

### Turning the paywall off entirely

For a pilot or a demo, set both halves of the master switch and redeploy:

```
VITE_MONETISATION_ENABLED=false
MONETISATION_ENABLED=false
```

Every plan gate opens, client and server. The daily evaluation allowance is
metered in Postgres and is raised separately:
`select public.set_plan_setting('free_evaluation_limit', 1000);`

### Changing the policy without a release

Set `PLAN_FEATURE_OVERRIDES` **and** `VITE_PLAN_FEATURE_OVERRIDES` to the same
`feature:plan` list in the Vercel project, then redeploy:

```
VITE_PLAN_FEATURE_OVERRIDES=sampleAnswers:free,aiContentStudio:plus
PLAN_FEATURE_OVERRIDES=sampleAnswers:free,aiContentStudio:plus
```

Features: `pdfExport`, `answerUpgrades`, `aiContentStudio`,
`advancedQuestions`, `fullFeedback`, `sampleAnswers`, `examMode`.
Plans: `free`, `plus`, `school`. Unrecognised entries are ignored and logged,
so a typo falls back to the shipped default rather than opening a gate.

Set only the `VITE_` half and the UI will show locks the server does not
enforce; set only the server half and the UI will offer calls the API refuses.
Set both.

The free tier's reach (`VITE_FREE_TIER_EVAL_LIMIT`,
`VITE_FREE_TIER_MAX_QUESTION_TIER`, `VITE_FREE_TIER_MAX_SAMPLE_BAND`,
`VITE_FREE_TIER_FULL_FEEDBACK`) is set the same way — see `.env.example`.

### The daily evaluation allowance is live, not built in

`free_evaluation_limit()` reads a `plan_settings` row (schema §14), so an admin
can retune the headline number against the running database:

```sql
select public.set_plan_setting('free_evaluation_limit', 8);
```

The client picks the new figure up from the server's next refusal and displays
it; no deploy, no migration.

### Where each gate is actually enforced

| Feature               | UI lock                                                                           | Server enforcement                                                  |
| --------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Full marking feedback | blur + upgrade prompt                                                             | paid detail stripped from the response (`api/_lib/entitlements.ts`) |
| Daily evaluations     | counter + pre-check                                                               | `consume_evaluation()` spends the allowance (schema §14)            |
| Answer upgrades       | locked button                                                                     | 402 from the proxy via `caller_plan()` (schema §17)                 |
| AI content studio     | locked buttons                                                                    | 402 from the proxy via `caller_plan()`                              |
| Advanced questions    | picker disables them, and the workspace refuses one reached by an assignment link | — (question text is bundled content)                                |
| Sample answers        | blurred above the free band ceiling                                               | —                                                                   |
| PDF export, exam mode | locked controls                                                                   | — (entirely client-side features)                                   |

Be clear-eyed about the last three. PDF export and exam mode are pure client
features — nothing is fetched, so there is nothing for a server to withhold.
Advanced question text and sample answers ARE fetched (bundled JSON offline, or
`sample_answers` rows when the curriculum is remote), so a determined user can
read them in the network tab regardless of the blur. What the paywall actually
protects there is the AI work done ON them — marking, upgrades, generation —
and that is enforced. Treat the blurs as commercial nudges, and price the
plans on the AI, not on the text.

### Stripe checklist

- [ ] `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and
      `SUPABASE_SERVICE_ROLE_KEY` set on the API host. **In production a
      missing webhook secret is a hard failure** — an unsigned endpoint lets
      anyone forge a subscription event.
- [ ] Every price you sell is listed in `STRIPE_PLUS_MONTHLY_PRICE_ID`,
      `STRIPE_PLUS_YEARLY_PRICE_ID`, `STRIPE_SCHOOL_PRICE_ID` — **including
      prices you have retired but customers are still subscribed to.** The
      webhook keeps an active subscriber's existing plan if it meets a price it
      does not recognise (and logs loudly), but the list is what decides which
      plan a renewal grants.
- [ ] Point the Stripe webhook endpoint at `/api/stripe-webhook` and subscribe
      to `checkout.session.completed`,
      `customer.subscription.created/updated/deleted`,
      `invoice.payment_failed` and `invoice.payment_action_required`.
- [ ] Run `supabase/schema.sql` — §13 (billing tables), §14 (evaluation
      allowance and plan settings) and §17 (`caller_plan()`) must all be
      applied. The proxy fails **open** on a missing function, so an
      unmigrated database silently serves paid features to free accounts.
- [ ] `stripe trigger customer.subscription.updated` once against the deployed
      endpoint and confirm `profiles.stripe_plan` moves.

---

## Pre-flight checklist

- [ ] `npm run test:all` passes locally.
- [ ] Keys are set **only** on the server side (Vercel env vars), never in
      the repo or `VITE_*` variables. `.env.local` is gitignored — keep it
      that way.
- [ ] If a key was ever pasted into a chat, issue, or commit, **rotate it**
      before going live.
- [ ] Decide the auth story: Supabase for real users, or
      `VITE_ENABLE_DEMO_AUTH=true` for a demo, or guest-only.
- [ ] Visit the deployed URL, log in, import the curriculum library, and
      run one evaluation end-to-end.
- [ ] If you are selling: work through the Stripe checklist above, and confirm
      a free account is refused an answer upgrade by the API (not just by the
      button).
- [ ] **Data residency (irreversible).** The Supabase region is chosen at
      project creation and cannot be changed afterwards — pick an Australian
      one (Sydney, `ap-southeast-2`) for NSW student data. `vercel.json` pins
      the functions to `syd1` for the same reason; without it they default to
      Washington DC, so every marking call would round-trip
      Sydney → US → Sydney. Note that the AI providers themselves are
      US-hosted: answer text crosses the border on every call regardless, and
      a school privacy assessment will ask about that specifically.
- [ ] **Prove the AI proxy is actually closed.** With Supabase configured,
      send an unauthenticated request and confirm it is refused:

      ```bash
      curl -si -X POST https://<your-app>.vercel.app/api/gemini \
        -H 'content-type: application/json' -d '{}' | head -1
      ```

      Expect `401`. A `200` or a `400` means `SUPABASE_URL` /
      `SUPABASE_ANON_KEY` are missing on the server and the endpoint is open
      to the internet — see the warning in the Vercel section above.

- [ ] **Prove the AI proxy is reachable at all.** Log in and run one
      evaluation. If it fails with "AI is not connected on this deployment",
      the build was marked as static hosting — `VITE_STATIC_HOSTING` must be
      unset on Vercel (it is only set by the GitHub Pages workflow).

## Google & Microsoft (SSO) sign-in

The login page shows **Google**, **Microsoft** and **GitHub** buttons whenever
Supabase is configured. The buttons work as soon as the matching provider is
enabled in your Supabase project — no app code or env vars are involved.

### 1. Enable the provider in Supabase

Supabase dashboard → **Authentication → Providers**:

- **Google**: create an OAuth client in [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
  (type "Web application"). Authorised redirect URI:
  `https://<project-ref>.supabase.co/auth/v1/callback`. Paste the client ID and
  secret into the Google provider settings.
- **Microsoft (Azure)**: register an app in
  [Microsoft Entra admin centre](https://entra.microsoft.com) → App
  registrations. Redirect URI (Web):
  `https://<project-ref>.supabase.co/auth/v1/callback`. For NSW DoE / school
  tenants choose the multi-tenant account type ("Accounts in any
  organisational directory") so students can sign in with their school
  Microsoft accounts. Paste the Application (client) ID and a client secret
  into the Azure provider settings.
- **GitHub**: GitHub → Settings → Developer settings → OAuth Apps, callback
  URL as above.

### 2. Allow your app's URL as a redirect target

Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL**: your deployed app URL — _including the base path_ on GitHub
  Pages, e.g. `https://<user>.github.io/<repo>/`.
- **Redirect URLs**: add every URL the app runs at (production, Pages,
  `http://localhost:3000` for development).

The app sends users back to `origin + base path` after sign-in; if that URL
is not in this allowlist, Supabase falls back to the Site URL.

### 3. First sign-in behaviour

A first-time OAuth sign-in auto-creates a `profiles` row (student role) via
the `handle_new_user` trigger. Usernames derive from the email local-part
and are de-duplicated automatically. Promote teachers/admins afterwards with
the admin console or SQL (`update profiles set role = 'teacher' where …`).
