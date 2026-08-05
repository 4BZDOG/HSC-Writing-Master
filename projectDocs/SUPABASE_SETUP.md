# Supabase Setup Guide — HSC AI Evaluator

A step-by-step walkthrough for adding Supabase to the HSC AI Evaluator. This
unlocks multi-user authentication, a shared curriculum library, student
response tracking, AI usage quotas, and the full contribution/moderation loop.

Without Supabase the app runs fine in single-user "mock mode" (IndexedDB,
demo accounts) — so this is only needed when you want real users.

---

## What Supabase does for this project

| Feature            | Without Supabase                               | With Supabase                                                       |
| ------------------ | ---------------------------------------------- | ------------------------------------------------------------------- |
| Authentication     | Demo accounts (admin/admin, teacher/teacher)   | Real accounts with roles — self-registration, SSO, or admin-created |
| Data storage       | Per-browser IndexedDB (private to each device) | Shared Postgres database (everyone sees approved content)           |
| AI proxy auth      | Open — anyone with the URL can call it         | Requires a valid user session                                       |
| AI quotas          | None                                           | Per-role daily limits (admin 1000, teacher 400, student 60)         |
| Content moderation | N/A                                            | Users submit → admins review → approved content published           |
| Student responses  | Local only                                     | Persisted centrally, visible to the teachers who teach that student |

---

## Prerequisites

- The project repo on GitHub.
- A Vercel deployment (or local dev) — see `VERCEL_SETUP.md`.
- About 15–20 minutes.

---

## Step 1 — Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and click **Start your project**.
2. Sign up with GitHub (recommended — keeps everything linked).
3. Click **New project**.
4. Fill in:
   - **Name:** something like `hsc-ai-evaluator`
   - **Database Password:** generate a strong password and **save it somewhere
     safe** (you'll need it if you ever connect directly to Postgres).
   - **Region:** pick **Southeast Asia (Singapore)** or **Oceania (Sydney)** —
     whichever is closest. **For NSW DoE use, choose an Australian region** for
     data residency compliance.
5. Click **Create new project** and wait ~2 minutes for it to provision.

---

## Step 2 — Find your project keys

1. In the Supabase dashboard, go to **Settings → API** (in the left sidebar
   under "Project Settings").
2. You'll see:

   | Key                   | What it is                   | Where you'll use it                             |
   | --------------------- | ---------------------------- | ----------------------------------------------- |
   | **Project URL**       | `https://xxxx.supabase.co`   | Both client and server env vars                 |
   | **anon / public** key | A long `eyJ...` string       | Both client and server env vars                 |
   | **service_role** key  | Another long `eyJ...` string | **Only** for the seed script — never in the app |

3. Keep this page open — you'll copy these values in the next steps.

> **Security note:** The **anon key** is safe to include in frontend code —
> it's designed to be public. Row-Level Security (RLS) policies in the database
> control what each user can actually access. The **service_role key** bypasses
> all RLS — treat it like a database admin password.

---

## Step 3 — Apply the database schema

The schema creates all tables, security policies, functions, and triggers the
app needs.

1. In the Supabase dashboard, go to **SQL Editor** (left sidebar).
2. Click **New query**.
3. Open `supabase/schema.sql` from this repo, copy the **entire** contents, and
   paste it into the SQL Editor.
4. Click **Run** (or press Ctrl/Cmd + Enter).
5. You should see a green "Success" message. If you see errors, check that you
   copied the complete file (it's long — scroll to the bottom).

> **What this creates:**
>
> - `profiles` table — extends Supabase auth with roles, preferences, and stats.
> - Curriculum tables mirroring the app's data model: `courses`, `topics`,
>   `sub_topics`, `dot_points`, `prompts`, `sample_answers`.
> - `responses` + `response_events` — student work and longitudinal tracking.
> - `classes` + `class_members` — who teaches whom. This is what scopes a
>   teacher's visibility; without a class, a teacher sees no student work at
>   all (see "Class-scoped visibility" below).
> - `ai_usage` + `ai_quota_limits` + `ai_model_usage` — usage quotas and
>   per-engine cost breakdown.
> - Row-Level Security policies on every table.
> - Moderation RPCs — `approve_prompt()`, `reject_prompt()`, etc.
> - Auto-profile creation trigger — a profile row is created automatically the
>   first time a user signs in (SSO or a dashboard-created account).

> **Class-scoped visibility.** A teacher account does not get a view of every
> student. Access to student work, progress and profiles is limited to the
> classes they own or co-teach, and a teacher with no classes sees nothing —
> deliberately, so visibility is granted by enrolment rather than assumed from
> a role. Admins keep the whole-database view. This is enforced by the table
> policies themselves, not only by the analytics functions, so it holds for a
> direct PostgREST call as well as through the app. Set classes up
> (`create_class()` / `enrol_in_class()`) before expecting Class Insights to
> show anything — see `supabase/README.md`.

---

## Step 4 — Connect the app to Supabase

### For local development

1. Copy `.env.example` to `.env.local` (if you haven't already):

   ```bash
   cp .env.example .env.local
   ```

2. Edit `.env.local` and fill in the Supabase values:

   ```env
   # Client-side (bundled into the frontend)
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...your-anon-key

   # Server-side (used by the AI proxy for auth + quotas)
   SUPABASE_URL=https://your-project-ref.supabase.co
   SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...your-anon-key
   ```

3. Start the dev server:
   ```bash
   npm run dev
   ```
   The login screen should now show **email/password fields** instead of the
   demo account buttons.

### For Vercel deployment

Add the same four variables in the Vercel dashboard (**Settings → Environment
Variables**):

| Variable                 | Value                                  | Environment                            |
| ------------------------ | -------------------------------------- | -------------------------------------- |
| `VITE_SUPABASE_URL`      | `https://your-project-ref.supabase.co` | All (Production, Preview, Development) |
| `VITE_SUPABASE_ANON_KEY` | Your anon/public key                   | All                                    |
| `SUPABASE_URL`           | `https://your-project-ref.supabase.co` | All                                    |
| `SUPABASE_ANON_KEY`      | Your anon/public key                   | All                                    |

Then **redeploy** (push a commit or trigger a manual deploy from the Vercel
dashboard).

> **Remove `VITE_ENABLE_DEMO_AUTH`** if you set it earlier — with Supabase
> configured, you don't want demo accounts active in production.

---

## Step 5 — Create your admin account

1. Open your deployed app (or `localhost:5173` for local dev) and use
   **Create one** on the login page. If email confirmation is on, follow the
   link Supabase emails you.
   (Prefer not to wait on email? Supabase dashboard → **Authentication** →
   **Users** → **Add user**, ticking **Auto Confirm User**, then sign in.)
2. The `handle_new_user` trigger creates the matching `profiles` row on first
   sign-in.
3. Back in the Supabase dashboard, go to **SQL Editor** and run:

   ```sql
   -- Find your account
   SELECT id, username, role FROM public.profiles;

   -- Promote yourself to admin
   UPDATE public.profiles
   SET role = 'admin'
   WHERE username = 'your-username-here';
   ```

   Replace `your-username-here` with the username shown in the first query
   (it defaults to the part of your email before the `@`).

4. **Log out and log back in** to pick up the new role. You should now see the
   admin controls (AI Engine selector, Database Manager, etc.).

---

## Step 6 — Seed the curriculum content

The seed script imports all course data from `public/courseData/` into your
Supabase database so users have content to work with immediately.

1. Get your admin's profile ID (from Step 5):

   ```sql
   SELECT id FROM public.profiles WHERE role = 'admin';
   ```

   Copy the UUID.

2. In your terminal, set the required environment variables:

   ```bash
   export SUPABASE_URL="https://your-project-ref.supabase.co"
   export SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIs...your-service-role-key"
   export SEED_ADMIN_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
   ```

   > **Where to find the service_role key:** Supabase dashboard → Settings → API
   > → scroll down to "service_role" under "Project API keys".

3. Run the seed script:
   ```bash
   node supabase/seed.mjs
   ```
   It reads the course manifest and upserts all content as `approved` (visible
   to everyone immediately). The script is safe to re-run — it upserts on
   `legacy_id`, so duplicates are impossible.

> **Security reminder:** The service*role key bypasses all Row-Level Security.
> Never put it in the app, in a `VITE*` variable, or in a committed file.

---

## Step 7 — Set up authentication (optional extras)

### How accounts get created

Three routes, and it is worth deciding which one a class will use:

- **Self-registration** — the login page has a **Create one** link. The user
  supplies an email and password, and (if email confirmation is on, which it
  should be) activates the account from a link Supabase emails them.
- **Single sign-on** — a first-time OAuth sign-in creates the account and its
  `profiles` row automatically. Nobody provisions anything, and there are no
  passwords to reset.
- **By hand** — Supabase dashboard → **Authentication** → **Users** → **Add
  user**. Also where you reset a password for someone whose link never arrives.

> **Restrict who may get an account — on both routes.** A new account is
> created as a `student`, and a student carries a 60-call daily AI budget spent
> against your provider key. `VITE_ALLOWED_EMAIL_DOMAINS` governs
> self-registration **and** SSO sign-in; set it to your school's email domain
> (for NSW DoE, `education.nsw.gov.au`). Restricting only one route restricts
> nothing — a multi-tenant Entra registration accepts any Microsoft work or
> school account in the world. `VITE_ENABLE_SIGNUP=false` removes
> self-registration entirely where accounts are provisioned centrally.

> **Password reset is self-service.** "Forgot your password?" on the sign-in
> screen emails a link; the link returns to the app on a dedicated URL and asks
> for a new password. Two settings make it work — see below. An admin can still
> reset a password directly (Authentication → Users → the user) when a link
> never arrives.

#### Two settings the reset flow needs

1. **Redirect URL.** Supabase → **Authentication** → **URL Configuration** →
   **Redirect URLs**: add your app's URL with the reset marker, e.g.
   `https://your-app.vercel.app/?mode=reset` (and
   `http://localhost:3000/?mode=reset` for development). A wildcard such as
   `https://your-app.vercel.app/**` covers it too. **Without this the link
   bounces to the Site URL and the user is signed in without ever being asked
   for a new password.**
2. **Email template.** The default "Reset password" template works as shipped.
   If you customise it, keep `{{ .ConfirmationURL }}` — that is what carries
   the recovery code.

The marker exists because a recovery link and an SSO sign-in come back looking
identical (both a bare `?code=`). Without something to tell them apart the app
would consume the recovery as a sign-in, and the reset would appear to do
nothing at all.

### Disable email confirmation for testing

While testing, you probably don't want to confirm every dashboard-created
account via email:

1. Supabase dashboard → **Authentication** → **Settings** (under
   "Configuration").
2. Under "Email Auth", toggle **off** "Enable email confirmations".
3. Click **Save**.

Turn it back on before real users are added.

### Add OAuth providers (recommended for schools)

Supabase supports Google, Microsoft (Azure/Entra), GitHub, and more:

1. Supabase dashboard → **Authentication** → **Providers**.
2. Enable the provider you want and follow Supabase's instructions to set up
   the OAuth app.
3. Set `VITE_OAUTH_PROVIDERS` to the providers you enabled — e.g.
   `VITE_OAUTH_PROVIDERS=azure` — and redeploy.

Step 3 is not optional bookkeeping. The login page draws a button for every
provider in that list, and a button for a provider Supabase has **not** got
configured sends the user off to an error and back. Leaving the variable unset
draws all three, which is wrong for almost every deployment. `none` hides the
section entirely.

For a NSW DoE school, `azure` is the one that matters: staff and students
already hold `@education.nsw.gov.au` Entra accounts, so SSO both provisions
them and removes the password-reset problem above. See `DEPLOYMENT.md` for the
Entra app registration steps (use the multi-tenant account type).

---

## Step 8 — Verify everything works

Run through this checklist:

- [ ] **Account creation** works — use **Create one** on the login page, follow
      the confirmation email, and confirm a `profiles` row appears. (SSO and
      dashboard-created accounts are the other two routes.)
- [ ] **Role assignment** — your admin account sees admin controls.
- [ ] **Curriculum loads** — the course/topic tree shows seeded content.
- [ ] **AI evaluation** — select a question, write a response, submit for
      marking, and get AI feedback back.
- [ ] **Contribution loop** — as a non-admin user, submit a question to the
      shared library → log in as admin → open the Review Queue (shield icon)
      → approve it → confirm it appears for everyone.
- [ ] **Quota enforcement** — check the admin dashboard's AI usage panel
      shows call counts.

---

## Managing users and roles

### Promote a user to teacher or admin

From the SQL Editor:

```sql
-- By username
SELECT public.set_user_role(
  (SELECT id FROM public.profiles WHERE username = 'jane.smith'),
  'teacher'
);

-- Or directly
UPDATE public.profiles SET role = 'teacher' WHERE username = 'jane.smith';
```

Or from the app: an admin can change roles via the User Management admin panel.

### Adjust AI quotas

```sql
-- Change the default for all students
SELECT public.set_role_ai_quota('student', 100);

-- Give one user a custom limit
SELECT public.set_user_ai_quota('jane.smith', 200);

-- Remove a custom limit (fall back to role default)
SELECT public.set_user_ai_quota('jane.smith', NULL);
```

Or use the admin dashboard → AI usage pill → Daily AI Quotas.

---

## Growing the content library

### From users (organic)

1. Any signed-in user can click **Submit to shared library** on a question or
   sample answer.
2. The submission is pre-screened by AI (quality score 0–100) and enters the
   review queue as `pending`.
3. An admin opens the **Review Queue** (shield icon in the header), sees
   submissions sorted worst-quality-first, and approves or rejects each one.
4. Approved content is immediately visible to all users.

### From the seed pipeline (curated)

1. Add a new course JSON file to `public/courseData/` (same shape as existing
   files).
2. Add an entry to `public/courseData/manifest.json`.
3. Re-run `node supabase/seed.mjs` — it upserts, so re-running is safe.

### Export approved content back to JSON

```bash
export SUPABASE_URL="https://your-project-ref.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
node supabase/export.mjs
```

This writes approved content to `courseData/exported/` (gitignored). Move the
files you want to keep into `public/courseData/` and add them to the manifest.

---

## Privacy and data residency

This is an `@education.nsw.gov.au` context — student data obligations apply:

- **Host in an Australian region** (chosen in Step 1).
- **Anonymise/pseudonymise** student responses where possible.
- Check your school/DoE policy on third-party tools and student data storage
  before deploying to an actual class.
- The `responses` table stores student-written work centrally — teachers and
  admins can read it for analytics, but students can only see their own.

None of this blocks building and testing — but it's a gate before real students
use the system.

---

## Troubleshooting

| Problem                                        | Fix                                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Login screen still shows demo accounts         | Check `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set and **redeploy**                                          |
| "Invalid API key" errors                       | Double-check you're using the **anon** key (not the service*role key) for the `VITE*` and non-`VITE\_` env vars          |
| First sign-in works but no profile row appears | The `on_auth_user_created` trigger should handle this — re-run `schema.sql` to ensure the trigger exists                 |
| Seed script fails with permission errors       | Make sure you're using the **service_role** key (not anon) for `SUPABASE_SERVICE_ROLE_KEY`                               |
| AI calls return 401                            | You must be logged in; guest sessions cannot make AI calls when Supabase is configured (intentional)                     |
| AI calls return 429                            | Daily quota exhausted — raise it with `set_user_ai_quota()` or wait for the UTC day to roll over                         |
| Schema changes after updating the repo         | Re-run `schema.sql` in the SQL Editor — it's designed to be idempotent                                                   |
| Can't see seeded content                       | Check that the seed ran successfully and content has `status = 'approved'`                                               |
| Email confirmation link doesn't arrive         | Check spam; for dev, disable email confirmation (see Step 7)                                                             |
| An SSO button errors on click                  | That provider is not enabled in Supabase (Authentication → Providers). Enable it, or drop it from `VITE_OAUTH_PROVIDERS` |
| A teacher sees no student work                 | Expected until they own or co-teach a class — see "Class-scoped visibility" above                                        |
| RLS tests fail                                 | Run `supabase/tests/rls_negative_tests.sql` in the SQL Editor to diagnose which policies are misconfigured               |

---

## Architecture reference

```
Browser (React/Vite)
  │
  ├─ Auth ──────────────► Supabase Auth (email/password, OAuth — no in-app
  │                       sign-up or password reset; see Step 7)
  │                           │
  │                           ▼
  │                       profiles table (role, preferences, stats)
  │
  ├─ Curriculum ────────► Supabase Postgres (courses → topics → prompts)
  │   read path              with RLS: approved + own drafts visible
  │
  ├─ Contributions ─────► Supabase Postgres
  │   write path             private → pending → approved (moderation gate)
  │
  ├─ AI calls ──────────► /api/gemini (Vercel serverless)
  │                           │
  │                           ├─ Verifies Supabase token (auth.ts)
  │                           ├─ Checks/decrements quota (quota.ts)
  │                           └─ Forwards to Gemini/Claude/OpenRouter/Groq/Kimi
  │                              (all offshore — see docs/privacy-for-schools.md)
  │
  └─ Responses ─────────► Supabase Postgres
      (student work)         responses + response_events (trend data)
```

---

## What's next

- **Run the RLS tests** — paste `supabase/tests/rls_negative_tests.sql` into
  the SQL Editor to verify security policies hold.
- **Set up Sentry** (optional) — add `VITE_SENTRY_DSN` for frontend error
  tracking.
- **Invite teachers** — have them sign up, then promote them to `teacher` role
  so they can moderate the review queue.
