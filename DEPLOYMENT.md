# Hosting & Deployment Guide

The app is a **static Vite build plus one serverless API route**
(`/api/gemini`) that keeps the AI provider keys server-side and enforces
quotas. That split decides where you can host it:

| Host                       | Frontend | AI features                                        | Effort       |
| -------------------------- | -------- | -------------------------------------------------- | ------------ |
| **Vercel** (recommended)   | ✅       | ✅ (serverless proxy runs natively)                | ~5 minutes   |
| **GitHub Pages**           | ✅       | ❌ alone / ✅ when paired with a Vercel API        | ~5 minutes   |
| Netlify / Cloudflare Pages | ✅       | ⚠️ needs the proxy ported to their function format | not provided |

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
   | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Supabase project values   | only for multi-user auth                                        |
   | `VITE_ENABLE_DEMO_AUTH`                        | `true`                    | only if you want demo logins (admin/admin) **without** Supabase |

4. **Deploy.** Every push to `main` redeploys automatically.

Without Supabase the deployment runs in single-user "mock mode"
(IndexedDB, demo accounts). Note that in that mode `/api/gemini` accepts
unauthenticated calls — anyone who finds the URL can spend your AI quota,
so prefer configuring Supabase (or at least keep the URL private) for
anything beyond personal testing.

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
