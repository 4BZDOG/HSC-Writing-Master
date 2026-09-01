# Deploying HSC AI Evaluator to Vercel

> [!IMPORTANT]
> **This guide is superseded by [`DEPLOYMENT.md`](./DEPLOYMENT.md). Follow that
> one.** This file predates several things that now matter and is kept only for
> the background reading in sections 2 and 6:
>
> - Its environment-variable table omits the **unprefixed** `SUPABASE_URL` and
>   `SUPABASE_ANON_KEY`. Those are the only variables the server-side auth gate
>   reads. Leaving them out no longer fails open — the proxy now returns a 503
>   naming them — but it does mean no AI call works at all until they are set.
> - It does not mention Stripe, `ALLOWED_ORIGIN`, `VITE_OAUTH_PROVIDERS`, or the
>   Australian region requirement for NSW student data.
>
> Sections 2 and 6 have been brought back in line with the committed
> `vercel.json`; the rest of the file has not.

This guide walks through deploying the **HSC AI Evaluator** — a React 19 + TypeScript + Vite single-page application — to [Vercel](https://vercel.com).

The app is a **React SPA** served as static assets from Vercel's global CDN, plus **five serverless functions** under `api/` — chief among them `api/gemini.ts`, which proxies the AI provider so the API key stays server-side. User data is stored client-side in IndexedDB by default; an **optional Supabase** backend can be enabled for real multi-user auth and a shared library (see section 3).

---

## 1. Prerequisites

- A [Vercel account](https://vercel.com/signup) (free Hobby tier is sufficient).
- A Google Gemini API key — get one at [aistudio.google.com/app/apikeys](https://aistudio.google.com/app/apikeys).
- This repository pushed to GitHub (or GitLab / Bitbucket).
- Node.js 20+ locally if you want to test builds before deploying.

---

## 2. Project Build Settings

Vercel auto-detects Vite, but confirm these settings match the project:

| Setting              | Value                       |
| -------------------- | --------------------------- |
| **Framework Preset** | Vite                        |
| **Build Command**    | `npm run build`             |
| **Output Directory** | `dist`                      |
| **Install Command**  | `npm ci --legacy-peer-deps` |
| **Node.js Version**  | 22.x (or 20.x)              |

These map directly to the scripts in `package.json` (`"build": "vite build"`) and Vite's default `dist/` output.

---

## 3. Environment Variables

The app reads configuration from `VITE_*` environment variables (see `.env.example`). Only the Gemini key is required.

> **Important:** Vite inlines `VITE_*` variables into the client bundle at build time. They are **public** — visible to anyone who inspects the deployed JavaScript. The Gemini key is therefore **not** a `VITE_*` variable: it is read only by the serverless proxy at `/api/gemini` (`api/gemini.ts`), so it never reaches the browser.

In **Vercel → Project → Settings → Environment Variables**, add:

| Variable                  | Required | Example / Notes                                               |
| ------------------------- | -------- | ------------------------------------------------------------- |
| `GEMINI_API_KEY`          | ✅ Yes   | Your Gemini API key — server-side only, read by `/api/gemini` |
| `VITE_SUPABASE_URL`       | Optional | Supabase project URL — enables real auth + shared backend     |
| `VITE_SUPABASE_ANON_KEY`  | Optional | Supabase anon (public) key — pairs with the URL above         |
| `VITE_SENTRY_DSN`         | Optional | Sentry DSN for error tracking                                 |
| `VITE_SENTRY_ENVIRONMENT` | Optional | `production`                                                  |
| `VITE_SENTRY_RELEASE`     | Optional | e.g. `2.3.23` (match `package.json`)                          |

Set each variable for the **Production**, **Preview**, and **Development** environments as needed. After changing a variable you must **redeploy** for it to take effect.

> **Supabase is opt-in.** Leave `VITE_SUPABASE_*` unset and the app runs entirely client-side with local mock auth — nothing breaks. Set **both** to switch login over to Supabase Auth (apply `supabase/schema.sql` first; see `supabase/README.md`). The anon key is designed to be public; Row-Level Security protects the data.

---

## 4. Deploy via the Vercel Dashboard (recommended)

1. Go to [vercel.com/new](https://vercel.com/new).
2. **Import** this Git repository.
3. Vercel detects the **Vite** preset automatically — confirm the build settings from section 2.
4. Expand **Environment Variables** and add `GEMINI_API_KEY` (plus any optional Sentry vars).
5. Click **Deploy**.

Vercel runs `npm install` → `npm run build`, publishes `dist/`, and gives you a `*.vercel.app` URL. Every push to the production branch triggers a new production deploy; every pull request gets its own preview URL.

---

## 5. Deploy via the Vercel CLI

```bash
# Install the CLI
npm i -g vercel

# Log in
vercel login

# Link the local project to a Vercel project (first run only)
vercel link

# Add the API key (you'll be prompted for the value and environments)
vercel env add GEMINI_API_KEY

# Deploy a preview build
vercel

# Promote to production
vercel --prod
```

---

## 6. SPA Routing & Caching (`vercel.json`)

This is a client-side SPA. A [`vercel.json`](./vercel.json) is already committed at the project root with the build settings plus SPA/caching rules:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "installCommand": "npm ci --legacy-peer-deps",
  "regions": ["syd1"],
  "functions": {
    "api/*.ts": {
      "maxDuration": 60
    }
  },
  "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }],
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
    },
    {
      "source": "/index.html",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }]
    }
  ]
}
```

- **`installCommand`** uses `npm ci` (not `npm install`) so the deploy builds the lockfile's exact tree, with `--legacy-peer-deps` for React 19's peer ranges.
- **`regions`** pins the functions to Sydney. Without it they default to Washington DC, so every marking call would round-trip Sydney → US → Sydney against an Australian database. This is a latency and data-path decision, not a preference.
- **`functions`** raises `maxDuration` to 60s — a long marking call exceeds the 10s default. The glob is `api/*.ts`, deliberately not `api/**/*.ts`: the recursive form pulls in `api/_lib/`, which would declare 15 functions against the Hobby plan's 12-function ceiling and fail the deploy.
- **`rewrites`** sends any deep link to the SPA shell **except** `/api/*`, so the serverless functions stay reachable instead of being swallowed by the SPA fallback.
- **`headers`** caches Vite's content-hashed `assets/*` aggressively (immutable per build), while `index.html` is revalidated every load so new deploys are picked up immediately.

> **Serverless functions:** any file directly under `api/` is deployed by Vercel as a serverless function automatically. Here that is five — `gemini.ts` (the AI proxy), `fetch-url.ts`, `create-checkout.ts`, `customer-portal.ts` and `stripe-webhook.ts`. `api/_lib/` is shared code and is ignored as a route because of the leading underscore.

---

## 7. Verify the Deployment

After the first deploy, confirm:

- [ ] The app loads at the `*.vercel.app` URL.
- [ ] The Gemini-powered features (evaluation, prompt generation) work — a failure here usually means `GEMINI_API_KEY` is missing from the Vercel environment. Add it and redeploy. (Check the `/api/gemini` function logs in the Vercel dashboard if calls fail.)
- [ ] No `process.env`/missing-key errors in the browser console.
- [ ] If using Sentry, a test error appears in your Sentry dashboard.

---

## 8. Continuous Deployment

Once the Git integration is connected:

- **Production**: pushes to the default branch deploy to your production domain.
- **Previews**: every branch / pull request gets an isolated preview URL with the same env vars (Preview scope).
- **Rollbacks**: use **Deployments → ⋯ → Promote to Production** on a previous build to roll back instantly.

### Option A — Vercel's native Git integration (simplest)

Connect the repo at [vercel.com/new](https://vercel.com/new) and Vercel handles preview + production deploys automatically. No secrets or workflow needed; configure env vars in the Vercel dashboard.

### Option B — GitHub Actions workflow (committed)

A [`.github/workflows/vercel-deploy.yml`](./.github/workflows/vercel-deploy.yml) workflow is included for teams that prefer driving deploys from CI:

- **Pull requests** → isolated **Preview** deployment.
- **Pushes to `main`** → promoted to **Production**.

It requires three repository secrets (**Settings → Secrets and variables → Actions**):

| Secret              | Where to find it                                               |
| ------------------- | -------------------------------------------------------------- |
| `VERCEL_TOKEN`      | [vercel.com/account/tokens](https://vercel.com/account/tokens) |
| `VERCEL_ORG_ID`     | `.vercel/project.json` after running `vercel link`             |
| `VERCEL_PROJECT_ID` | `.vercel/project.json` after running `vercel link`             |

> Use **either** Option A or B, not both, to avoid duplicate deployments. If you use the Actions workflow, disable the project's automatic Git deployments in Vercel (**Settings → Git**). The existing `build.yml` Netlify deploy job is independent — remove it if Vercel is now your sole host.

---

## 9. Custom Domain (optional)

1. **Vercel → Project → Settings → Domains → Add**.
2. Enter your domain and follow the DNS instructions (CNAME to `cname.vercel-dns.com`, or A record for apex domains).
3. Vercel provisions and auto-renews TLS certificates.

---

## 10. Troubleshooting

| Symptom                              | Likely Cause / Fix                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Build fails on `npm run build`       | Run `npm run build` locally; fix TypeScript/lint errors. Check the Node version.                              |
| App loads but AI features fail       | `GEMINI_API_KEY` missing from the Vercel environment — add it, then **redeploy**. Inspect `/api/gemini` logs. |
| Blank page / 404 on refresh of route | Add the SPA `rewrites` rule in `vercel.json` (section 6).                                                     |
| Old content after deploy             | Hard refresh; ensure `index.html` isn't being cached by a custom header.                                      |
| Env var change not reflected         | `VITE_*` vars are build-time — trigger a new deployment.                                                      |

---

**Related docs:** [`DeploymentPlan.md`](./DeploymentPlan.md) · [`DeploymentOptimization.md`](./DeploymentOptimization.md) · [`README.md`](./README.md)
