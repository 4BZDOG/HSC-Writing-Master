# Supabase Backend — Setup & Rationale

This folder contains the foundation for moving the HSC AI Evaluator from
per-browser IndexedDB storage to a **shared, multi-user database** that grows
over time from both admin and user contributions.

> **Status:** scaffolding only. These files do **not** change the running app
> yet — they stand up the database so the app can be wired to it next.

## What's here

| File           | Purpose                                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `schema.sql`   | Postgres schema: tables, enums, Row-Level Security, moderation RPCs.                                                                      |
| `seed.mjs`     | Imports `public/courseData/*.json` (your prototype content) into the database.                                                            |
| `demoSeed.mjs` | Creates the demo accounts + a term of seeded cohort history. **Demo project only** — see [Demo accounts](#demo-accounts-and-seeded-data). |

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

| Status     | Meaning                                        | Who can see it     |
| ---------- | ---------------------------------------------- | ------------------ |
| `private`  | A user's own draft                             | The author only    |
| `pending`  | Submitted to the shared library (review queue) | Author + reviewers |
| `approved` | Published                                      | Everyone           |
| `rejected` | Reviewed and declined (kept for audit)         | Reviewers          |
| `archived` | Retired                                        | Reviewers          |

New content **starts `private`** (the column default) and a non-reviewer can
only ever move their own content between `private` and `pending`. Reaching
`approved` / `rejected` / `archived` is reviewer-only — enforced two ways in the
database, not just the UI, so the gate can't be bypassed:

- the `enforce_content_status_authority` trigger blocks any non-reviewer session
  from setting a published status (on insert or update), and
- the same trigger **demotes on edit**: if an author touches their own row
  after it was approved, it drops back to `pending` for re-review — published
  content can never be silently rewritten, and
- the sanctioned path is the reviewer-gated RPCs: `approve_prompt()` /
  `reject_prompt()` / `approve_sample_answer()` / `reject_sample_answer()`.

Roles (`app_role`): `admin` (you), `teacher` (trusted reviewers), `student`.
In the app, teachers get content curation and the review queue but NOT the
system-administration tools (Database Manager, Data Vault, Content Audit
Studio, API monitor) — see `utils/permissions.ts` for the capability mapping.

### How content flows in from users and AI (the growth loop)

`services/contributionService.ts` is the client write path that drives this:

1. **Draft** — a user (or an AI-generated answer the user keeps) is saved via
   `savePromptContribution()` / `saveSampleAnswerContribution()` as `private`,
   owned by that user. RLS guarantees `created_by = auth.uid()`.
2. **Submit** — the "Submit to shared library" button on a question, or the
   Submit button on an individual sample answer, saves it as `pending` (also
   attaching the AI pre-screen score); `submitToLibrary()` can also flip an
   existing draft. Still only the author + reviewers can see pending items.
3. **Moderate** — an admin opens the **Review Queue** (header shield icon) and
   approves/rejects each item; under the hood this calls `approvePrompt()` /
   `rejectPrompt()` (and the sample-answer equivalents → the server-side RPCs).
   Approved content becomes visible to everyone through the read path
   (`curriculumService.ts`).

This is how the bank grows over time without becoming noise: anyone can
contribute, but only reviewed content reaches the shared library. AI-authored
answers ride the same rails (`source = 'AI'`).

**AI pre-screen:** on submit, the app runs its Quality Check over the content
and stores the resulting score (`quality_score` 0–100) + summary
(`quality_notes`) on the row. A low score never blocks submission — the score
rides along and the reviewer decides — but the Review Queue is sorted
**lowest-score-first** and shows a colour-coded badge, so reviewers triage the
riskiest submissions first. If screening is unavailable the item is submitted
unscored.

> ⚠️ **The score is advisory, not a security control.** It is computed in the
> author's browser and written to a row the author owns, so a malicious client
> could forge a high score. Reviewers must judge the content itself; the badge
> only orders the queue. Hardening this would mean moving the screen
> server-side (e.g. an edge function that scores on submission), which is a
> possible future step.

> **Wiring status:** the full loop is usable when Supabase is configured. A
> **"Submit to shared library"** action appears on the selected question (any
> signed-in, non-guest user), and admins get a **Review Queue** (the shield
> icon in the header → `components/admin/ReviewQueueModal.tsx`) to approve or
> reject pending contributions — sorted lowest-quality-first with a colour-coded
> AI score badge (the submit step runs the Quality Check and stores the score).
> Both **questions** (button under the selected question) and individual
> **sample answers** (Submit button on each answer in the accordion) can be
> contributed. Approved content then flows to everyone via the read path.
> The whole loop is exercised in CI by a stubbed Playwright e2e
> (`tests/e2e/contribution-loop.spec.ts`): a second, Supabase-configured dev
> server runs the real UI while every Supabase/AI request is intercepted with
> deterministic fakes — login, deep-link, submit (with the AI score attached),
> queue triage, and approve are all asserted without a live backend.

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

### AI usage quotas (per user and per group)

Schema §11 adds server-enforced daily AI budgets. Every call through the AI
proxy (`api/gemini.ts`) spends one unit of the caller's allowance via the
atomic `consume_ai_quota()` RPC; when it's gone the proxy answers 429 and the
paid provider is never contacted.

- **Group (role) defaults** live in `ai_quota_limits` — seeded to
  admin 1000 / teacher 400 / student 60 per UTC day. Change them with
  `select set_role_ai_quota('student', 80);` (admin-only) or from the app's
  API telemetry widget (admin header → the floating usage pill → Daily AI
  Quotas).
- **Per-user overrides** beat the group default:
  `select set_user_ai_quota('jsmith', 200);` — pass `null` to clear.
- **Usage** is one row per user per day in `ai_usage`; users can read their
  own row, reviewers can read all. The only write path is the
  SECURITY DEFINER consume function, so clients cannot forge counters.
- The proxy **fails open** if §11 hasn't been applied yet (a warning is
  logged) so deploying code ahead of the migration can't brick AI features;
  the auth gate still blocks anonymous spending in that window.
- **Per-engine cost breakdown** (reporting only): `ai_model_usage` tallies one
  row per user/day/model, incremented **best-effort** by `record_ai_model_usage()`
  after a unit is spent. It is intentionally separate from `consume_ai_quota()`
  — the model a call uses doesn't change the allowance it spends — so a failure
  here never blocks a call or affects a budget. The dashboard reads it via the
  reviewer-gated `get_ai_model_usage_report()` and prices each model from the
  engine registry (`services/aiModels.ts`); it degrades gracefully to the
  call-count cost estimate when the table is empty or the RPC is absent.

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

- **Promote community content into the seed set:** once user/AI contributions
  are approved and proven useful, run the exporter to pull the approved library
  back into `courseData/*.json`, then move the files you want into the canonical,
  version-controlled bank:

  ```bash
  export SUPABASE_URL="https://<project>.supabase.co"
  export SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"   # bypasses RLS
  node supabase/export.mjs                                # writes courseData/exported/
  ```

  It writes one JSON file per approved course (plus a `manifest.fragment.json`)
  in the app's native shape, keyed on the same `legacy_id`s — so re-seeding the
  files you promote is a safe, duplicate-free upsert. `courseData/exported/` is
  git-ignored; move the files you want to keep into `courseData/` and add them
  to `manifest.json`.

- Keep curated example courses in git so the example library is reviewable and
  reproducible across environments, independent of any one database.

## Connecting the app (next phase — not done here)

Once the database is seeded, the app changes happen in roughly this order:

1. **Auth:** ✅ `services/authService.ts` uses Supabase Auth when configured,
   falling back to the local mock accounts otherwise.
2. **Read path:** ✅ `services/curriculumService.ts` loads the published library
   (plus the caller's own pending/private contributions, so submitted work
   never vanishes from its author's tree) from Supabase, paging past the
   PostgREST row cap; `useSyllabusData` treats it as the source of truth when
   configured, caching to IndexedDB and falling back to that cache (then the
   bundled seeds) on any failure or when the database is empty. Structural
   edits (courses/topics/dot points) still go to the local cache only —
   pushing those back to Supabase is the next phase
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
5. **Responses:** ✅ each completed evaluation upserts the student's draft + AI
   feedback (mark/band/evaluation JSON, plus a thumbs rating) to the `responses`
   table — one row per `(student, prompt)` via `uq_responses_user_prompt` — and
   also appends a tiny row to the **append-only `response_events`** history table
   (mark/band/word count, no draft text) that powers the band-trend sparkline.
   Both writes are best-effort and Supabase-mode only (`services/responseService.ts`);
   `responses` writes are confined to the caller's own rows and `response_events`
   is own-insert / no-update-or-delete, with reviewers able to read all for
   analytics. This is the substrate for the longitudinal features (Class
   Insights, Student Progress + trend).

## Classes, and who can see whose work

`get_class_analytics()`, `get_student_progress()` and `get_response_students()`
are reviewer-gated — admin **or teacher**. Until schema §19 that was the only
gate: they then aggregated _every row in `responses`_, so any teacher account
could read cohort aggregates, a roster of usernames, and per-student progress
for every student in the database, including students at other schools. On a
deployment holding NSW student work that is a privacy failure, not a missing
feature.

`schools` (§12) is too coarse to fix it — a school is a billing and quota group,
and one school holds many classes taught by different teachers. §19 adds the
missing entity:

| Table           | Purpose                                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| `classes`       | A class: school, name, year, owning teacher, optional course                                                    |
| `class_members` | Enrolment — `student` rows are the cohort; `co_teacher` rows grant a second staff member the owner's visibility |

**Scope, enforced in the database:**

| Caller  | With a class id                                      | Without                |
| ------- | ---------------------------------------------------- | ---------------------- |
| admin   | that class (any)                                     | the whole database     |
| teacher | that class, if they own or co-teach it — else raises | every class they teach |
| student | raises                                               | raises                 |

> ⚠️ **Behaviour change.** A teacher who owns no classes now sees **nothing**
> from these RPCs rather than everything. That is deliberate: visibility has to
> be granted by enrolment, and failing closed is the only safe default for
> student data. Set classes up before expecting Class Insights to show anything.

### Setting a class up

```sql
-- Admin-only: ownership is what grants sight of student work.
select public.create_class('Riverbank High School', 'Year 12 Enterprise Computing',
                           'demo.teacher', 12);

-- Then the class's own staff manage the roll.
select public.enrol_in_class('<class-id>', 'demo.aisha');
select public.enrol_in_class('<class-id>', 'demo.coteacher', 'co_teacher');
```

`list_my_classes()` backs the class picker in Class Insights, which appears once
a teacher has more than one class.

The boundaries are covered by `supabase/tests/rls_negative_tests.sql` (run in CI
against a real Postgres): teacher A cannot see teacher B's students by roster, by
aggregate, by class id or by username; a class-less teacher sees nothing; a
student cannot enumerate a cohort or create a class; and an admin keeps the
system-wide view.

**The RPCs are not the only way in.** Scoping a function does nothing if the
table it reads is still readable directly — a `supabase.from(...).select(...)`
in a browser console, with the anon key that ships in the bundle, skips every
RPC gate. So §19 also re-scopes three table policies onto `can_view_student()`:
`responses`, `response_events` and `profiles`. `profiles` matters more than it
looks: `username` defaults to the email local part, so an unscoped read hands a
teacher `firstname.lastname` for every account in the database. Each of the
three has both a negative and a positive assertion in the test file, made
against the table rather than through an RPC — the omission that let the first
two ship unscoped.

### Seeing a student, not just a cohort

`get_class_analytics()` answers "where is the class weak" but averages across
students, so two very different students disappear into the same number: one who
reaches the ceiling on recall and collapses on judgement looks identical to one
who is thin everywhere, and their overall bands look identical too.

Schema §20 adds `get_class_cohort()`, which returns the cohort **by student** in
three shapes: one row per (student, verb) for the tier heatmap, one per
(student, week) for the trajectories, and attempts per day for cohort activity.
It reuses `visible_student_ids()`, so it obeys exactly the same class scope as
§19 and cannot expose a student the caller does not teach.

Verbs come back raw rather than folded into cognitive tiers: the verb → tier map
lives in `data/commandTerms.ts` and is the single source of truth for the Verb
Gate, so duplicating it in SQL would let the two drift. The client folds them
(`foldVerbsIntoTiers`), which also means a student's tier profile in Class
Insights and in Student Progress are computed by the same code and cannot
disagree.

The UI is Class Insights → **By student** (`components/admin/CohortBreakdown.tsx`).
Everything there is drawn from the share of available **marks**: a band-based grid
would darken left-to-right for every student regardless of ability, because a
tier's band is capped at the tier number. Attempts on questions with no command
verb set get their own "Untiered" column rather than being dropped, so the six
tier cells and the row total always account for the same attempts — on the
bundled Enterprise Computing bank that is 14 of 82 questions, so it is the normal
case rather than an edge one.

## Demo accounts and seeded data

Most of what makes this product worth showing depends on _accumulated_ use:
Class Insights ranks where a cohort is struggling, Student Progress draws a band
trend, the Usage Dashboard plots a fortnight of spend, the Review Queue needs a
queue. A fresh account shows none of it. `demoSeed.mjs` manufactures that
history — twelve students, ten weeks, ~450 attempts — so all of it is
demonstrable and testable on day one.

### ⚠️ Run it on a separate demo project, never on production

The script creates accounts that share one password and fills the database with
fabricated student writing. It must not run against a database holding real
users. It therefore refuses to start unless you have created a marker table **by
hand** on the demo project:

```sql
create table public.demo_environment (confirmed boolean not null);
insert into public.demo_environment values (true);
```

A guard the script could create for itself would be no guard, which is why this
step is manual. Pasting the wrong service-role key then just aborts.

### Running it

```bash
node supabase/seed.mjs            # curriculum first — the cohort attaches to it

export SUPABASE_URL="https://<demo-project>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
export DEMO_ACCOUNT_PASSWORD="<at least 12 characters>"

npm run demo:seed                 # seed or refresh in place
npm run demo:reseed               # wipe the demo data and rebuild from scratch
```

### What you get

| Account                         | Role    | Plan   | Shows                                                                                     |
| ------------------------------- | ------- | ------ | ----------------------------------------------------------------------------------------- |
| `demo-admin@demo.invalid`       | admin   | school | Database Manager, Data Vault, Content Audit Studio, API monitor, quota admin              |
| `demo-teacher@demo.invalid`     | teacher | school | Class Insights, Student Progress, Review Queue, authoring tools                           |
| `demo-coteacher@demo.invalid`   | teacher | school | A second reviewer, and the author of the pending queue items                              |
| `demo-free@demo.invalid`        | student | free   | The paywalls: locked tier 4–6 questions, blurred high-band samples, summary-only feedback |
| `demo-plus@demo.invalid`        | student | plus   | The unlocked comparison                                                                   |
| `demo-capped@demo.invalid`      | student | free   | Already at its daily cap — the 429 path and quota warnings                                |
| `demo-aisha@…` … `demo-kayla@…` | student | free   | The twelve-student cohort behind the analytics                                            |

Plus: a school (`Riverbank High School (Demo)`) with a 30-seat active licence and
a 400-call pooled daily budget; a class (`Year 12 Enterprise Computing (Demo)`)
owned by the demo teacher with the whole cohort enrolled and the co-teacher added
as staff — required since §19, because the analytics are scoped to the classes a
teacher teaches and an unenrolled cohort would be invisible; ~450 `response_events` and ~365 `responses` over
ten weeks; matching `ai_usage` / `ai_model_usage` history across three engines;
six pending contributions scored 34–91 for the Review Queue.

Every student is one of six deliberate archetypes — improver, plateaued,
verb-blocked, sporadic, strong, at-risk (`utils/demoCohort.ts`) — because
analytics that rank a cohort need a cohort with something to rank.

### Determinism, and why dates are relative

The generator is seeded (`DEMO_SEED`), so the same run produces the same content
every time and the demo cannot drift silently. Timestamps, though, are computed
backwards from the moment you run it, which is what keeps the 30-day analytics
windows populated — a fixed-date seed would quietly empty every chart a month
later. Reseed to re-centre the windows.

Marks and bands are never invented: the generator asks `markForBand()` for a
mark and reads the band back with `getBandForMark()`, so seeded data cannot
contradict the Verb Gate. `tests/unit/demoCohort.test.ts` pins this.

### Known limits

- **Stripe is fabricated.** The `subscriptions` rows are written directly, so
  every paywall and unlocked state is reachable without a Stripe dependency —
  but there is no real Stripe customer behind them, and the customer-portal
  button will fail for demo accounts.
- **Offline gives you less.** The local mock accounts (`admin`/`teacher`/`user`
  with `VITE_ENABLE_DEMO_AUTH`) get seeded profile stats from the same generator
  via `services/demoFixtures.ts`, but offline the app persists only the user
  profile — there is no local `responses` table. Class Insights, Student
  Progress, the Usage Dashboard and the Review Queue read server-side RPCs and
  stay empty without Supabase.
- **The cohort needs a class.** Since §19 the analytics are scoped to the classes
  a teacher teaches, so the seed enrols its cohort into
  `Year 12 Enterprise Computing (Demo)`. Against a database that predates §19 the
  seed says so and carries on, but Class Insights will be empty until the
  migration is applied.

## ⚠️ Privacy & data residency (important)

This design stores **student-written work centrally**. Because this is an
`@education.nsw.gov.au` context, that brings NSW Department of Education privacy
and data-residency obligations into scope. Before real students use it:

- Host the database in an **Australian region**.
- **Anonymise / pseudonymise** student responses where possible.
- Check your school / DoE policy on third-party tools and student data storage.

None of this blocks building and testing the system — but it's a gate before
deploying to an actual class.
