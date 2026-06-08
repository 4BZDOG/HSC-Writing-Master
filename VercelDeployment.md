# Deploying HSC AI Evaluator to Vercel

This guide walks through deploying the **HSC AI Evaluator** — a React 19 + TypeScript + Vite single-page application — to [Vercel](https://vercel.com).

The app is a **static SPA**: there is no backend server, no database, and all user data is stored client-side in IndexedDB. Vercel serves the built `dist/` folder over its global CDN.

---

## 1. Prerequisites

- A [Vercel account](https://vercel.com/signup) (free Hobby tier is sufficient).
- A Google Gemini API key — get one at [aistudio.google.com/app/apikeys](https://aistudio.google.com/app/apikeys).
- This repository pushed to GitHub (or GitLab / Bitbucket).
- Node.js 18+ locally if you want to test builds before deploying.

---

## 2. Project Build Settings

Vercel auto-detects Vite, but confirm these settings match the project:

| Setting              | Value           |
| -------------------- | --------------- |
| **Framework Preset** | Vite            |
| **Build Command**    | `npm run build` |
| **Output Directory** | `dist`          |
| **Install Command**  | `npm install`   |
| **Node.js Version**  | 22.x (or 20.x)  |

These map directly to the scripts in `package.json` (`"build": "vite build"`) and Vite's default `dist/` output.

---

## 3. Environment Variables

The app reads configuration from `VITE_*` environment variables (see `.env.example`). Only the Gemini key is required.

> **Important:** Vite inlines `VITE_*` variables into the client bundle at build time. They are **public** — visible to anyone who inspects the deployed JavaScript. Use an API key with appropriate restrictions/quotas, and never put server-side secrets in a `VITE_*` variable.

In **Vercel → Project → Settings → Environment Variables**, add:

| Variable                  | Required | Example / Notes                          |
| ------------------------- | -------- | ---------------------------------------- |
| `VITE_GEMINI_API_KEY`     | ✅ Yes   | Your Gemini API key                      |
| `VITE_SENTRY_DSN`         | Optional | Sentry DSN for error tracking            |
| `VITE_SENTRY_ENVIRONMENT` | Optional | `production`                             |
| `VITE_SENTRY_RELEASE`     | Optional | e.g. `2.2.2` (match `package.json`)      |

Set each variable for the **Production**, **Preview**, and **Development** environments as needed. After changing a variable you must **redeploy** for it to take effect (Vite bakes them in at build time).

---

## 4. Deploy via the Vercel Dashboard (recommended)

1. Go to [vercel.com/new](https://vercel.com/new).
2. **Import** this Git repository.
3. Vercel detects the **Vite** preset automatically — confirm the build settings from section 2.
4. Expand **Environment Variables** and add `VITE_GEMINI_API_KEY` (plus any optional Sentry vars).
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
vercel env add VITE_GEMINI_API_KEY

# Deploy a preview build
vercel

# Promote to production
vercel --prod
```

---

## 6. SPA Routing & Caching (`vercel.json`)

This is a client-side SPA. If you add client-side routing later, deep links (e.g. `/some/route`) must fall back to `index.html`. Create a `vercel.json` in the project root:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ]
}
```

- **`rewrites`** ensures any path serves the SPA shell so the app can render the right view.
- **`headers`** caches Vite's content-hashed `assets/*` aggressively (they're immutable per build), while `index.html` stays uncached so new deploys are picked up immediately.

> If you rely purely on the app's internal (non-URL) navigation, the rewrite is harmless but optional.

---

## 7. Verify the Deployment

After the first deploy, confirm:

- [ ] The app loads at the `*.vercel.app` URL.
- [ ] The Gemini-powered features (evaluation, prompt generation) work — a failure here usually means `VITE_GEMINI_API_KEY` is missing or wasn't applied before the build. Redeploy after adding it.
- [ ] No `process.env`/missing-key errors in the browser console.
- [ ] If using Sentry, a test error appears in your Sentry dashboard.

---

## 8. Continuous Deployment

Once the Git integration is connected:

- **Production**: pushes to the default branch deploy to your production domain.
- **Previews**: every branch / pull request gets an isolated preview URL with the same env vars (Preview scope).
- **Rollbacks**: use **Deployments → ⋯ → Promote to Production** on a previous build to roll back instantly.

To run the existing CI checks (lint, tests, type-check) before Vercel builds, keep them in your GitHub Actions workflow (`.github/`); Vercel will still build only after your branch is pushed.

---

## 9. Custom Domain (optional)

1. **Vercel → Project → Settings → Domains → Add**.
2. Enter your domain and follow the DNS instructions (CNAME to `cname.vercel-dns.com`, or A record for apex domains).
3. Vercel provisions and auto-renews TLS certificates.

---

## 10. Troubleshooting

| Symptom                              | Likely Cause / Fix                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| Build fails on `npm run build`       | Run `npm run build` locally; fix TypeScript/lint errors. Check the Node version.   |
| App loads but AI features fail       | `VITE_GEMINI_API_KEY` missing or set after the build — add it, then **redeploy**.  |
| Blank page / 404 on refresh of route | Add the SPA `rewrites` rule in `vercel.json` (section 6).                           |
| Old content after deploy             | Hard refresh; ensure `index.html` isn't being cached by a custom header.           |
| Env var change not reflected         | `VITE_*` vars are build-time — trigger a new deployment.                            |

---

**Related docs:** [`DeploymentPlan.md`](./DeploymentPlan.md) · [`DeploymentOptimization.md`](./DeploymentOptimization.md) · [`README.md`](./README.md)
