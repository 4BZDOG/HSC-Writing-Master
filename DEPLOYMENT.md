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

## Which document do you need?

This file is the map: what each hosting option can and cannot do, what every
variable means, and how to tell a working deployment from one that only looks
like it. The click-by-click walkthroughs live elsewhere, and there is no point
duplicating them here.

| You want to…                                       | Read                                                             |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| Get the app onto the internet, screen by screen    | [`projectDocs/VERCEL_SETUP.md`](projectDocs/VERCEL_SETUP.md)     |
| Add real accounts, a shared library, quotas        | [`projectDocs/SUPABASE_SETUP.md`](projectDocs/SUPABASE_SETUP.md) |
| Understand the database itself, seeding, demo data | [`supabase/README.md`](supabase/README.md)                       |
| Charge for it                                      | [`docs/stripesetup.md`](docs/stripesetup.md)                     |
| Know what a school will ask about student data     | [`docs/privacy-for-schools.md`](docs/privacy-for-schools.md)     |
| Know what every environment variable does          | [`.env.example`](.env.example), and the reference below          |

---

## Before you start

**Node 20 or newer.** The workflows, `vercel.json` and every script assume it;
`package.json` pins it in `engines`. Check with `node -v`.

```bash
npm ci --legacy-peer-deps   # what CI and Vercel run — reproduces the lockfile exactly
npm run test:all            # lint, unit tests, type-check
npm run build               # the thing that will actually be deployed
```

**Configure locally before you configure a host.** Copy the template and fill
in one line:

```bash
cp .env.example .env.local
# set GEMINI_API_KEY=… from https://aistudio.google.com/app/apikeys
npm run dev
```

Everything else in `.env.example` is commented out deliberately. The app checks
whether a variable is **set**, not whether it is real, so an uncommented
placeholder is worse than a missing value — a deployment carrying
`VITE_SUPABASE_URL=https://your-project.supabase.co` believes it has a Supabase
project and tries to sign users in against one that does not exist. Uncomment a
line only when you have the real value for it.

**Audit whatever you end up with:**

```bash
npm run check:deploy
```

It reads `.env.local` (and the process environment) and reports the
combinations this app fails quietly on — a `VITE_` half without its unprefixed
twin, a provider key that would be published in the bundle, a Stripe key with
no webhook secret, Supabase configured on one side only. Errors exit non-zero;
warnings are configurations that are right in some deployments and wrong in
most, so read them rather than dismissing them. Run it again with `--url` once
you have deployed — see [After you deploy](#after-you-deploy--verify-it-works).

---

## The order to do it in

Doing these out of order is how deployments end up half configured. Steps 3–5
are optional; **1, 2 and 6 are not.**

1. **Decide the auth story first**, because everything downstream depends on
   it. Real accounts (Supabase) or a private demo (guest/demo accounts)? A
   deployment with no Supabase has an **open** `/api/gemini` — anyone with the
   URL spends your AI budget — so "we'll add auth later" means "we'll keep it
   private until later".
2. **Supabase before the app**, if you are using it. Create the project **in an
   Australian region — this cannot be changed later** — and run
   `supabase/schema.sql` in full before pointing anything at it. Then
   `projectDocs/SUPABASE_SETUP.md`.
3. **Deploy the app** (Option 1 below, or `projectDocs/VERCEL_SETUP.md`), with
   all four Supabase variables set, not two.
4. **Restrict who can get an account** — `VITE_ALLOWED_EMAIL_DOMAINS`, and a
   single-tenant Entra registration if you enable Microsoft sign-in — _before_
   the URL is shared with anyone.
5. **Billing**, if you are selling: `docs/stripesetup.md` and the checklist below.
6. **Verify against the running deployment**, not against the dashboard you
   just filled in. `npm run check:deploy -- --url https://…`, then sign in and
   mark one answer end to end.

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
5. **Verify it.** `npm run check:deploy -- --url https://<your-app>.vercel.app`,
   then work through [After you deploy](#after-you-deploy--verify-it-works).

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
4. Verify it — note the base path in the URL:
   `npm run check:deploy -- --url https://<owner>.github.io/<repo>`.

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

`.env.example` is the exhaustive reference, with the reasoning for each one.
This is the subset that decides how a _deployment_ behaves.

**Server-side (API host only — never bundled):**

- `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY` /
  `GROQ_API_KEY` / `KIMI_API_KEY` — provider keys used by the proxy; only the
  engine you actually select needs one. Free-tier notes: Gemini free keys have
  **no quota for Gemini 3 Pro** — select _Gemini 3 Flash_ for both engine roles
  in the admin AI Engine panel; free OpenRouter accounts should select the
  _Free Models Router_ engine; Groq has a genuinely free tier.
- `ALLOWED_ORIGIN` — exact origin(s) allowed to call the proxy
  cross-origin, comma-separated. Scheme + host, no path, no trailing slash;
  the wildcard `*` is deliberately rejected. Unset = same-origin only (default).
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` — lets the proxy verify user tokens
  and enforce per-user daily quotas. **The anon key, not the service-role key.**
- `SUPABASE_SERVICE_ROLE_KEY` — bypasses Row-Level Security, and is the only
  identity the database accepts for columns no user may write. Needed by the
  Stripe webhook handler, the seed scripts, and `/api/screen-contribution`.
  Never client-side, never in a `VITE_` variable.
- `QUALITY_SCREEN_PROVIDER` / `QUALITY_SCREEN_MODEL` — which model pre-screens
  shared-library contributions. Defaults to Gemini Flash, which is the right
  cost for a short structured judgement on every submission; set both to move
  it to another provider. Without `SUPABASE_SERVICE_ROLE_KEY` the screen is
  simply off and contributions arrive unscored — which puts them at the TOP of
  the reviewer's queue, since nothing has checked them.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_*_PRICE_ID` — billing;
  see the Stripe checklist above.
- `MONETISATION_ENABLED`, `PLAN_FEATURE_OVERRIDES`, `FREE_TIER_FULL_FEEDBACK` —
  the server half of the plan policy. Each needs its `VITE_` twin set to the
  same value.

**Build-time (safe to expose; anything `VITE_*` ends up in the bundle):**

- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — enables real multi-user
  auth; unset = offline mock mode.
- `VITE_ENABLE_DEMO_AUTH=true` — allows the demo accounts (admin/admin,
  teacher/teacher, user/user) in production builds. Guest access is always
  available. Leave unset on any deployment where Supabase is configured.
- `VITE_ALLOWED_EMAIL_DOMAINS` — who may hold an account, by email domain.
  Governs self-registration **and** SSO. Unset means anyone.
- `VITE_ENABLE_SIGNUP=false` — removes the "Create one" link where accounts are
  provisioned centrally.
- `VITE_OAUTH_PROVIDERS` — which SSO buttons to draw (`google`, `azure`,
  `github`, or `none`). Each must also be enabled in Supabase; unset draws all
  three, and a button for a provider Supabase does not have configured fails on
  click.
- `VITE_API_BASE_URL` — origin of the AI proxy when it lives on a
  different host than the frontend.
- `VITE_STATIC_HOSTING=true` — declares "this host has no serverless proxy", so
  the client switches AI features off rather than failing per call. Set **only**
  by the Pages workflow; setting it on a host that does have a proxy disables
  every AI feature.
- `DEPLOY_BASE_PATH` — sub-path the site is served under (the Pages
  workflow sets `/<repo>/` automatically; leave unset for root hosting). Must
  start and end with `/`.
- `VITE_LEGAL_ENTITY_NAME` / `VITE_LEGAL_CONTACT_EMAIL` /
  `VITE_LEGAL_JURISDICTION` — whose name goes on the Terms of Use and Privacy
  Notice. Worth setting before real users agree to them.
- `BUILD_SOURCEMAPS=true` — re-enables production source maps. Off by default
  because every deploy path publishes `dist/` wholesale and the maps embed the
  original TypeScript; if you turn it on, delete `dist/assets/*.map` after
  uploading them and before deploying.

Run `npm run check:deploy` after setting these. It is built around the
observation that most of the damage here comes not from a wrong value but from
a _half_ set of right ones.

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

Everything here happens **before** the URL exists or is shared. The checks that
need a running deployment are in the next section.

- [ ] `npm run test:all` passes locally.
- [ ] `npm run check:deploy` reports no errors, and you have read the warnings
      rather than skimmed them.
- [ ] Keys are set **only** on the server side (Vercel env vars), never in
      the repo or `VITE_*` variables. `.env.local` is gitignored — keep it
      that way.
- [ ] If a key was ever pasted into a chat, issue, or commit, **rotate it**
      before going live.
- [ ] Decide the auth story: Supabase for real users, or
      `VITE_ENABLE_DEMO_AUTH=true` for a demo, or guest-only.
- [ ] **Restrict who can get an account — both ways in.** A new account is a
      `student` with a 60-call daily AI budget charged to your provider key, and
      there are two doors: self-registration and SSO. Set
      `VITE_ALLOWED_EMAIL_DOMAINS` to your school's email domain — it governs
      both — and `VITE_ENABLE_SIGNUP=false` if accounts are provisioned
      centrally. Leave email confirmation ON in Supabase so an address has to be
      real. If you enable Entra, pin the app registration to your tenant
      (single-tenant) as well: the env var refuses the session, but only the
      tenant pin stops the account being created at all.
- [ ] Every variable is set for **both Production and Preview** in the Vercel
      project. A preview deployment that works and a production one that does
      not is almost always this.
- [ ] If you are selling: work through the Stripe checklist above.
- [ ] **Data residency (irreversible).** The Supabase region is chosen at
      project creation and cannot be changed afterwards — pick an Australian
      one (Sydney, `ap-southeast-2`) for NSW student data. `vercel.json` pins
      the functions to `syd1` for the same reason; without it they default to
      Washington DC, so every marking call would round-trip
      Sydney → US → Sydney. Note that the AI providers themselves are all
      offshore: answer text crosses the border on every call regardless of the
      database region, and a school privacy assessment will ask about that
      first. `docs/privacy-for-schools.md` has the per-engine breakdown —
      including that OpenRouter is a broker (the upstream processor depends on
      the slug) and that Kimi K3 is China-operated, not US.

---

## After you deploy — verify it works

A green deploy means the build succeeded. It says nothing about whether the
proxy is closed, the variables reached production, or a student can actually
get an answer marked. These are the checks that do.

### 1. Automated

```bash
npm run check:deploy -- --url https://<your-app>.vercel.app
```

On top of the configuration audit this fetches the deployed site and reports:
whether the page loads, whether the assets it references resolve (a broken
`DEPLOY_BASE_PATH` serves fine HTML and 404s every script — a blank page with
nothing in it to read), whether the bundled curriculum is being served, what an
**unauthenticated** POST to `/api/gemini` gets back, and — for split hosting —
whether CORS actually allows your frontend's origin.

On GitHub Pages, include the base path: `--url https://<owner>.github.io/<repo>`.

### 2. Prove the AI proxy is closed

The single check worth doing by hand, because it is the one that costs money if
it is wrong:

```bash
curl -si -X POST https://<your-app>.vercel.app/api/gemini \
  -H 'content-type: application/json' -d '{}' | head -1
```

| Response      | What it means                                                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `401`         | The gate is on and refusing an unauthenticated caller. This is the answer you want.                                                                                      |
| `503`         | Half configured: the `VITE_SUPABASE_*` pair is set, `SUPABASE_URL` / `SUPABASE_ANON_KEY` are not. The proxy refuses rather than serving openly, and the body names them. |
| `200` / `400` | No Supabase anywhere, so the gate is off by design and **the endpoint is open to the internet**. Fine for a personal demo, nothing else.                                 |
| `404`         | There is no serverless proxy at this origin — a static host (Pages, Netlify). Expected there; a misconfiguration on Vercel.                                              |

### 3. Prove it works for a real user

Nothing above proves a student can use it. Sign in as a normal account — not
your admin one — and:

- [ ] The curriculum library loads and you can navigate to a question.
- [ ] Run **one evaluation end to end** and get a mark and feedback back.
- [ ] The version in the login footer matches the commit you just deployed.
- [ ] With Supabase: a second sign-in on another device sees the same library.
- [ ] With billing: confirm a free account is refused an answer upgrade **by the
      API** (a 402), not merely by a greyed-out button.
- [ ] With SSO or password accounts: request a password reset and confirm the
      emailed link lands on "Choose a new password" rather than signing you
      straight in. If it signs you in, the `?mode=reset` URL is missing from
      Supabase's redirect allowlist.

If the evaluation fails with **"AI is not connected on this deployment"**, the
build was marked as static hosting — `VITE_STATIC_HOSTING` must be unset on
Vercel (only the GitHub Pages workflow sets it).

---

## Updating a running deployment

**Code.** Push to `main`. Vercel rebuilds and promotes automatically; the Pages
workflow republishes. Nothing else is needed.

**Environment variables are baked in at build time.** Changing one in a
dashboard changes nothing until you **redeploy**. This is the single most
common "I set it and it didn't work". Vercel: Deployments → the latest one →
⋯ → Redeploy.

**Database schema.** `supabase/schema.sql` is written to be re-applied whole,
and CI proves it: the RLS job applies it twice and asserts the second pass
mutates nothing. So after pulling a release that adds a section, paste the
entire file into the SQL editor again — do not try to apply just the new part.
Sections the app degrades gracefully without (quotas §11, billing §13,
allowance §14, `caller_plan()` §17) **fail open**, so an unmigrated database
serves paid features to free accounts rather than erroring. Apply the schema
before you trust the paywall.

**Local data format.** Adding or changing a stored field means bumping
`DATA_VERSION` in `utils/storageUtils.ts` with a migration. Users' IndexedDB is
migrated on next load; deploying a new shape without the bump corrupts existing
drafts.

**The user agreement.** Bumping `AGREEMENT_VERSION` in `data/legalContent.ts`
re-prompts every user on next load. Do it when the terms change materially, not
for a typo.

**Curriculum content.** Files in `public/courseData/` plus an entry in its
`manifest.json` ship with the build. With Supabase, re-run
`node supabase/seed.mjs` to push them into the database — it upserts on
`legacy_id`, so re-running refreshes rather than duplicates.

---

## Rolling back

**Vercel** keeps every previous deployment. Deployments → pick the last good
one → ⋯ → **Promote to Production**. It is instant and needs no rebuild, which
makes it the right first move when production breaks: roll back, then diagnose.

**GitHub Pages**: re-run the `Deploy to GitHub Pages` workflow from the last
good commit (Actions → the run → Re-run all jobs), or revert on `main` and push.

**What does not roll back with the code**, and needs undoing by hand:

- Environment variable changes — they live in the hosting project, not the commit.
- `schema.sql` changes — Postgres has no undo here. Take a Supabase backup
  before applying a release that changes the schema.
- Stripe products, prices and webhook endpoints.

A rollback also reverts the `DATA_VERSION` the code expects while users' browsers
still hold the migrated shape. Migrations are written forward-only, so prefer
rolling _forward_ with a fix when a release has already shipped a data migration.

---

## Troubleshooting

| Symptom                                                | Cause                                                                                    | Fix                                                                                                       |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Blank white page, no error on screen                   | Assets 404 — usually `DEPLOY_BASE_PATH` wrong for the host                               | Unset it for root hosting; `/<repo>/` on Pages. `npm run check:deploy -- --url …` names the failing asset |
| Blank page only in production, fine in dev             | Cross-chunk initialisation order ("Cannot access 'X' before initialization")             | `npm run check:bundle` against `dist/`; it is the CI gate for exactly this                                |
| Build fails on install                                 | Install command is not the one the lockfile was made with                                | `npm ci --legacy-peer-deps` (already in `vercel.json`)                                                    |
| Build fails on Node syntax                             | Host is on Node 18 or older                                                              | Node 20+; `engines` in `package.json` declares it                                                         |
| "AI Service Unavailable"                               | No provider key on the API host, or the key was added without redeploying                | Set `GEMINI_API_KEY`, then **redeploy**                                                                   |
| "AI is not connected on this deployment"               | `VITE_STATIC_HOSTING=true` in a build that does have a proxy                             | Unset it everywhere except the Pages workflow                                                             |
| Every AI call returns 503                              | `VITE_SUPABASE_*` set, `SUPABASE_URL` / `SUPABASE_ANON_KEY` not                          | Set the server-side pair to the same values and redeploy                                                  |
| Every AI call returns 401 while signed in              | Guest session, or the two Supabase pairs point at different projects                     | Sign in properly; confirm both pairs name one project                                                     |
| AI calls return 429                                    | The caller's daily quota is spent (admin 1000 / teacher 400 / student 60)                | `select set_user_ai_quota('<username>', 200);` or raise the role default                                  |
| AI calls return 402                                    | Working as intended — free allowance spent, or the feature needs a higher plan           | `select public.set_plan_setting('free_evaluation_limit', 20);`, or adjust `PLAN_FEATURE_OVERRIDES`        |
| CORS error from a Pages/Netlify frontend               | `ALLOWED_ORIGIN` unset or not an exact origin                                            | Set it on the **API** host to the frontend's origin — scheme + host, no path, no trailing slash, no `*`   |
| Free users see full feedback (or paid users see locks) | Only one half of a `VITE_`/unprefixed pair is set                                        | `npm run check:deploy` names the pair; set both                                                           |
| Paid features work for free accounts                   | `schema.sql` §13/§14/§17 not applied — the proxy fails open on a missing function        | Re-apply the whole `schema.sql`                                                                           |
| SSO button bounces back with an error                  | Provider listed in `VITE_OAUTH_PROVIDERS` but not enabled in Supabase                    | Enable it in Authentication → Providers, or drop it from the list                                         |
| Password-reset link signs the user straight in         | The `?mode=reset` URL is missing from Supabase's redirect allowlist                      | Add it (a `…/**` wildcard covers it) in Authentication → URL Configuration                                |
| Payment succeeds, plan stays free                      | Webhook not signed, not pointed at `/api/stripe-webhook`, or no service-role key         | Set `STRIPE_WEBHOOK_SECRET` and `SUPABASE_SERVICE_ROLE_KEY`; check the endpoint                           |
| Class Insights is empty for a teacher                  | Since schema §19 visibility comes from class enrolment, and failing closed is deliberate | Create a class and enrol the cohort (`create_class`, `enrol_in_class`)                                    |
| Preview works, production does not                     | Variables set for Preview only                                                           | Tick **Production** as well, then redeploy                                                                |
| Two deployments fire for every push                    | Vercel's Git integration _and_ `vercel-deploy.yml` are both active                       | Use one. Disconnect the repo in Vercel → Settings → Git, or delete the workflow                           |
| Green "Deploy to Production" but nothing was published | The Netlify job skips cleanly when its secrets are absent                                | Expected unless you use Netlify — read the warning in the job log                                         |

---

## Google & Microsoft (SSO) sign-in

The login page shows **Google**, **Microsoft** and **GitHub** buttons whenever
Supabase is configured, and each works as soon as the matching provider is
enabled in your Supabase project.

Set `VITE_OAUTH_PROVIDERS` to the ones you actually enabled — a button for a
provider Supabase does not have configured redirects the user away and comes
back with an error, and a new Supabase project has none of them enabled. It
takes a comma-separated list (`google`, `azure`, `github`), or `none` to drop
the section entirely and run on email/password alone. Leaving it unset shows
all three.

For a NSW DoE school this is normally `VITE_OAUTH_PROVIDERS=azure`: everyone
already holds an `@education.nsw.gov.au` Entra account, so Microsoft sign-in
provisions them on first use and there are no passwords for the school to
manage or reset. SSO also sidesteps passwords entirely — nothing to forget and nothing to
reset. The app does have its own reset flow (below) for password accounts, but
with Entra the Department already owns the credential.

### 1. Enable the provider in Supabase

Supabase dashboard → **Authentication → Providers**:

- **Google**: create an OAuth client in [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
  (type "Web application"). Authorised redirect URI:
  `https://<project-ref>.supabase.co/auth/v1/callback`. Paste the client ID and
  secret into the Google provider settings.
- **Microsoft (Azure)**: register an app in
  [Microsoft Entra admin centre](https://entra.microsoft.com) → App
  registrations. Redirect URI (Web):
  `https://<project-ref>.supabase.co/auth/v1/callback`. Paste the Application
  (client) ID and a client secret into the Azure provider settings.

  **Choose the account type deliberately.** _Single tenant_ ("Accounts in this
  organisational directory only") is the right answer for a school: only your
  own tenant's accounts can sign in, and the restriction is enforced by
  Microsoft before the request ever reaches you. _Multi-tenant_ accepts **any**
  Microsoft work or school account in the world — every one of which would
  arrive here as a `student` with a daily AI budget on your provider key. If
  you must use multi-tenant, `VITE_ALLOWED_EMAIL_DOMAINS` is what keeps
  everyone else out.

- **GitHub**: GitHub → Settings → Developer settings → OAuth Apps, callback
  URL as above.

### 2. Allow your app's URL as a redirect target

Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL**: your deployed app URL — _including the base path_ on GitHub
  Pages, e.g. `https://<user>.github.io/<repo>/`.
- **Redirect URLs**: add every URL the app runs at (production, Pages,
  `http://localhost:3000` for development), **and the same URLs with
  `?mode=reset`** — that is where a password-reset email returns. A wildcard
  (`https://your-app.vercel.app/**`) covers both. Miss it and the reset link
  lands on the Site URL instead, signing the user in without ever asking for a
  new password.

The app sends users back to `origin + base path` after sign-in; if that URL
is not in this allowlist, Supabase falls back to the Site URL.

### 3. First sign-in behaviour

A first-time OAuth sign-in auto-creates a `profiles` row (student role) via
the `handle_new_user` trigger. Usernames derive from the email local-part
and are de-duplicated automatically. Promote teachers/admins afterwards with
the admin console or SQL (`update profiles set role = 'teacher' where …`).
