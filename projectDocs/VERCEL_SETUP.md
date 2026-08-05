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

### Optional — demo mode (no Supabase)

| Variable                | Value  | Purpose                                                                     |
| ----------------------- | ------ | --------------------------------------------------------------------------- |
| `VITE_ENABLE_DEMO_AUTH` | `true` | Enables demo logins (admin/admin, teacher/teacher, user/user) in production |

> **Warning:** Without Supabase, the AI proxy accepts unauthenticated calls —
> anyone who discovers your deployment URL can use your AI budget. Keep the URL
> private or configure Supabase for anything beyond personal testing.

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

| Problem                                          | Fix                                                                                                         |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Build fails with dependency errors               | Verify the install command is `npm ci --legacy-peer-deps` (check vercel.json)                               |
| "AI Service Unavailable" after deploy            | Check `GEMINI_API_KEY` is set in env vars; **redeploy** after adding it                                     |
| CORS errors when frontend is on a different host | Set `ALLOWED_ORIGIN` env var to the frontend's exact origin                                                 |
| 401 on AI calls                                  | If Supabase is configured, you must be logged in; guest sessions cannot make AI calls (this is intentional) |
| 429 on AI calls                                  | Daily AI quota exhausted — an admin can raise it via the dashboard or `set_user_ai_quota()`                 |
| Env var changes not taking effect                | Env vars are baked in at build time — you must **redeploy** after changing them                             |
| Preview deploys work but production doesn't      | Check that env vars are enabled for the "Production" environment (not just "Preview")                       |

---

## What's next

- **Add Supabase** for real multi-user auth, shared curriculum, and per-user
  quotas — see `projectDocs/SUPABASE_SETUP.md`.
- **Monitor usage** — the admin dashboard shows AI call counts and costs per
  engine once Supabase is connected.
- **Add Sentry** (optional) — set `VITE_SENTRY_DSN` for error tracking.
