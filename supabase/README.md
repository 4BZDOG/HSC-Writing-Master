# Supabase Backend — Setup & Rationale

This folder contains the foundation for moving the HSC AI Evaluator from
per-browser IndexedDB storage to a **shared, multi-user database** that grows
over time from both admin and user contributions.

> **Status:** scaffolding only. These files do **not** change the running app
> yet — they stand up the database so the app can be wired to it next.

## What's here

| File         | Purpose                                                                  |
| ------------ | ------------------------------------------------------------------------ |
| `schema.sql` | Postgres schema: tables, enums, Row-Level Security, moderation RPCs.     |
| `seed.mjs`   | Imports `courseData/*.json` (your prototype content) into the database.  |

## The model in one picture

```
Your JSON (courseData/*.json)  ──seed──▶  Supabase Postgres  ◀──read/write──  all users
        (the prototype)                   (the growing source of truth)
                                                   │
                                          IndexedDB stays as a local
                                          cache / offline layer
```

### Moderation gate (how the bank grows without becoming noise)

Every piece of library content (`courses`, `prompts`, `sample_answers`) has a
`status`:

| Status     | Meaning                                            | Who can see it          |
| ---------- | -------------------------------------------------- | ----------------------- |
| `private`  | A user's own draft                                 | The author only         |
| `pending`  | Submitted to the shared library (review queue)     | Author + reviewers      |
| `approved` | Published                                          | Everyone                |
| `rejected` | Reviewed and declined (kept for audit)             | Reviewers               |
| `archived` | Retired                                            | Reviewers               |

New content **starts `private`** (the column default) and a non-reviewer can
only ever move their own content between `private` and `pending`. Reaching
`approved` / `rejected` / `archived` is reviewer-only — enforced two ways in the
database, not just the UI, so the gate can't be bypassed:

- the `enforce_content_status_authority` trigger blocks any non-reviewer session
  from setting a published status (on insert or update), and
- the sanctioned path is the reviewer-gated RPCs: `approve_prompt()` /
  `reject_prompt()` / `approve_sample_answer()` / `reject_sample_answer()`.

Roles (`app_role`): `admin` (you), `teacher` (trusted reviewers), `student`.

### How content flows in from users and AI (the growth loop)

`services/contributionService.ts` is the client write path that drives this:

1. **Draft** — a user (or an AI-generated answer the user keeps) is saved via
   `savePromptContribution()` / `saveSampleAnswerContribution()` as `private`,
   owned by that user. RLS guarantees `created_by = auth.uid()`.
2. **Submit** — `submitToLibrary()` flips the draft to `pending`, putting it in
   the review queue (still only the author + reviewers can see it).
3. **Moderate** — an admin opens the **Review Queue** (header shield icon) and
   approves/rejects each item; under the hood this calls `approvePrompt()` /
   `rejectPrompt()` (and the sample-answer equivalents → the server-side RPCs).
   Approved content becomes visible to everyone through the read path
   (`curriculumService.ts`).

This is how the bank grows over time without becoming noise: anyone can
contribute, but only reviewed content reaches the shared library. AI-authored
answers ride the same rails (`source = 'AI'`); a future enhancement is to run
the app's Quality Check automatically before queueing, so reviewers triage by a
quality score.

> **Wiring status:** the full loop is usable when Supabase is configured. A
> **"Submit to shared library"** action appears on the selected question (any
> signed-in, non-guest user), and admins get a **Review Queue** (the shield
> icon in the header → `components/admin/ReviewQueueModal.tsx`) to approve or
> reject pending contributions. Approved content then flows to everyone via the
> read path. Still to come: a submit action on individual sample answers, and an
> optional AI Quality-Check pre-screen that scores contributions before they
> reach the queue.

### Why role changes can't be self-served

Role lives in `public.profiles.role`, a server-side table — never in
`auth.users.user_metadata` (which end users can edit themselves via the
client SDK). On top of that, a `before update` trigger
(`prevent_role_self_escalation`, see `schema.sql`) blocks any authenticated
end-user session from changing its own `role` column, even though the
`profiles_update_self` policy otherwise lets you update your own row (display
name, preferences, stats). Only an admin — or the SQL editor / a
service-role script, which run outside a user JWT — can change a role.
Admins can also call `select public.set_user_role('<user-id>', 'teacher');`
from the app instead of a raw `update`.

Run `supabase/tests/rls_negative_tests.sql` in the SQL editor after applying
`schema.sql` to verify this (and a few other authorisation boundaries) hold —
see that file for what it checks and why.

## Setup steps

### 1. Create a Supabase project

1. Sign up at [supabase.com](https://supabase.com) and create a project.
2. **Pick an Australian region** (e.g. Sydney) — see the privacy note below.
3. Note your **Project URL** and keys from **Settings → API**.

### 2. Apply the schema

Open **SQL Editor** in the Supabase dashboard, paste the contents of
`schema.sql`, and run it. (Or, with the Supabase CLI: `supabase db push`.)

### 3. Create your admin profile

After you sign up your own account through the app's auth (or via
**Authentication → Users → Add user**), promote it to admin:

```sql
update public.profiles set role = 'admin' where username = '<your-username>';
```

Grab its id for the seed step:

```sql
select id from public.profiles where role = 'admin';
```

### 4. Seed the prototype content

```bash
npm i @supabase/supabase-js          # one-time, if not already installed

export SUPABASE_URL="https://<project>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"   # Settings → API → service_role
export SEED_ADMIN_ID="<uuid from step 3>"               # optional but recommended

node supabase/seed.mjs
```

The script reads `courseData/manifest.json`, imports each `course` file, and
upserts on the original string ids (`legacy_id`) so it's **safe to re-run** —
edit your JSON and re-seed to refresh the built-in content.

> ⚠️ The **service role key bypasses RLS**. Use it only for this server-side
> seed, never in the frontend, and never commit it. Add it to your shell or a
> local `.env` that is git-ignored.

### 5. Growing the example bank over time

The seed pipeline is the curated, version-controlled half of "grow the project
over time" (the contribution loop above is the organic half). To add more
courses and worked samples as reusable examples:

1. Drop a new course JSON file into `courseData/` (same shape as the existing
   files — a `Course[]` array, or a single `Course`).
2. Add an entry to `courseData/manifest.json` (`{ "file": "...", "type":
   "course", "subject": "..." }`).
3. Re-run `node supabase/seed.mjs`. Because it upserts on `legacy_id`, existing
   content is refreshed in place and only the new material is added — re-running
   never duplicates.

Seeded content is owned by the admin and inserted as `approved`, so it shows up
immediately for everyone via the read path. Two natural follow-ups:

- **Promote community content into the seed set:** once a user/AI contribution
  is approved and proven useful, export it back into a `courseData/*.json` file
  so it becomes part of the canonical, version-controlled bank (a small
  `approved → JSON` exporter would automate this).
- Keep curated example courses in git so the example library is reviewable and
  reproducible across environments, independent of any one database.

## Connecting the app (next phase — not done here)

Once the database is seeded, the app changes happen in roughly this order:

1. **Auth:** ✅ `services/authService.ts` uses Supabase Auth when configured,
   falling back to the local mock accounts otherwise.
2. **Read path:** ✅ `services/curriculumService.ts` loads the approved library
   from Supabase and `useSyllabusData` treats it as the source of truth when
   configured, caching to IndexedDB and falling back to that cache (then the
   bundled seeds) on any failure or when the database is empty. Writes still go
   to the local cache only — pushing edits back to Supabase is the next phase
   (write path + moderation, below).
3. **Write path + moderation:** "Submit to library" sets `pending`; an admin
   review queue calls `approve_prompt()` / `reject_prompt()`.
4. **Secure AI:** ✅ Gemini/Claude calls already run through the server-side
   `/api/gemini` proxy so the provider key never reaches the browser. The proxy
   now also **authenticates the caller**: set `SUPABASE_URL` and
   `SUPABASE_ANON_KEY` (the non-`VITE_` server-side names) in the deployment
   env and every AI request must carry a valid Supabase bearer token
   (`api/_lib/auth.ts`). Leave them unset to keep the proxy open for local /
   keyless dev. ⚠️ Once enabled, **guest sessions cannot make AI calls** — they
   have no Supabase token; this is deliberate anonymous-abuse protection.
5. **Responses:** persist student drafts + AI feedback to the `responses` table.

## ⚠️ Privacy & data residency (important)

This design stores **student-written work centrally**. Because this is an
`@education.nsw.gov.au` context, that brings NSW Department of Education privacy
and data-residency obligations into scope. Before real students use it:

- Host the database in an **Australian region**.
- **Anonymise / pseudonymise** student responses where possible.
- Check your school / DoE policy on third-party tools and student data storage.

None of this blocks building and testing the system — but it's a gate before
deploying to an actual class.
