# Demo Accounts & Seeded Data — Implementation Plan

**Status:** Phases 0/2/3/4/5 implemented (PR 1 — the generator, demo accounts and
offline fixtures). Phase 1 (classes + scoped analytics) is **not** implemented
and is deferred to PR 2, per the agreed sequencing. §9 records what
implementation turned up.

**Goal:** demo student, teacher, school and admin accounts backed by realistic
seeded history, so every feature that depends on *ongoing use over time* can be
shown and tested without waiting ten weeks for real data to accumulate.

---

## 1. Why the current demo accounts aren't enough

`services/authService.ts:30` already ships three mock logins (`admin/admin`,
`teacher/teacher`, `user/user`, gated behind `VITE_ENABLE_DEMO_AUTH`). They
authenticate, and that is all they do — every account starts with zero history.

The features worth showing off are precisely the ones that need history:

| Feature | Component / RPC | Reads |
| --- | --- | --- |
| Class Insights (verb + topic weakness ranking) | `components/admin/ClassInsightsModal.tsx` → `get_class_analytics` | `responses` ⨝ `prompts` |
| Student Progress + band-trend sparkline | `components/admin/StudentProgressModal.tsx` → `get_student_progress` | `responses`, `response_events` |
| Student roster picker | `get_response_students` | `responses` |
| Usage Dashboard + per-model cost | `components/admin/UsageDashboard.tsx` → `get_ai_usage_report`, `get_ai_model_usage_report` | `ai_usage`, `ai_model_usage` |
| Review Queue (triage by quality score) | `components/admin/ReviewQueueModal.tsx` | `prompts`/`sample_answers` where `status='pending'` |
| Quota pills / 429 messaging | `get_ai_quota_status`, `consume_ai_quota` | `ai_usage`, `school_ai_usage` |
| Free-tier paywalls & upgrade prompts | `services/entitlements.ts`, `PlanComparison.tsx`, `UpgradeModal.tsx` | `subscriptions`, `evaluation_usage` |
| XP / level / streak | `UserProfileModal.tsx` | `profiles.stats` |

Every one of those tables is currently **unseeded** — `supabase/seed.mjs` only
imports curriculum (courses → topics → dot points → prompts → sample answers).

---

## 2. Decisions taken

Confirmed with the project owner:

| Decision | Choice |
| --- | --- |
| Where demo data lives | **Both**: local IndexedDB fixtures *and* a dedicated demo Supabase project |
| AI behaviour | **Real AI, capped quota** — small daily allowance per demo account |
| Cohort scale | **1 school, 1 class, ~12 students, ~10 weeks** of history |
| Refresh model | **Deterministic seed with relative dates** — reproducible RNG, timestamps computed backwards from run time |
| Class scoping | Add `classes` + `class_members`; scope the analytics RPCs — **PR 2** |
| Course | Enterprise Computing (already in the repo) |
| Plan states | Fabricated `subscriptions` rows, not real Stripe test-mode |
| Delivery | Generator first (PR 1); classes + scoped analytics separately (PR 2) |
| Student naming | Plausible first names, school marked `(Demo)` |
| Credential exposure | Private — demo logins work but are not advertised on the login page |
| Draft text | Version-controlled in the repo, not AI-generated at seed time |
| Manufactured edge states | All four: review queue, quota exhaustion, band spreads, usage telemetry |

One deviation to note: the draft corpus is a typed TypeScript module
(`data/demoDrafts.ts`) rather than a `.json` file. The intent — version-controlled
and reviewable in git rather than generated at seed time — is met either way, and
TS avoids enabling `resolveJsonModule` in `tsconfig.json` just for the fixture.

---

## 3. Two problems to fix on the way

These are pre-existing issues that a demo makes unavoidable.

### 3.1 The analytics RPCs are not scoped to anything

`get_class_analytics`, `get_student_progress` and `get_response_students`
(`supabase/schema.sql:961`, `:1032`, `:1103`) are gated on `is_reviewer()` —
admin **or teacher** — and then aggregate **every row in `responses`**. There is
no school or class filter.

So any teacher account sees aggregates over every student in the database,
including students from other schools. On an `@education.nsw.gov.au` deployment
holding student-written work, that is a privacy defect independent of the demo;
seeding a demo teacher into a shared database would make it concrete.

### 3.2 "Class Insights" has no class behind it

`schools` exists (`schema.sql:1149`) and `profiles.school_id` points at it, but
there is no class/cohort entity. The teacher-facing feature is really
"whole-database insights". A demo of *"here is your Year 12 Software Engineering
class"* needs the entity to exist.

Both are addressed by Phase 1.

---

## 4. Phased implementation

### Phase 0 — Demo Supabase project (infrastructure, no code)

1. Create a second Supabase project in an **Australian region** (`hsc-demo`).
2. Apply `supabase/schema.sql`, then `supabase/seed.mjs` for curriculum.
3. Add a Vercel preview/demo deployment target pointed at it via
   `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
4. Demo project holds **no real student data, ever** — this is the isolation
   boundary that makes §3.1 non-blocking for the demo itself.

*Deliverable:* an empty-but-schema-complete demo backend.

---

### Phase 1 — Class entity + scoped analytics

**Schema** (`supabase/schema.sql`, new §16):

```sql
create table public.classes (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  name        text not null,                       -- "Year 12 Software Engineering"
  course_id   uuid references public.courses(id) on delete set null,
  year        int,
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (school_id, name)
);

create table public.class_members (
  class_id  uuid not null references public.classes(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      text not null default 'student',       -- student | co_teacher
  joined_at timestamptz not null default now(),
  primary key (class_id, user_id)
);
```

- RLS: a member reads their own class; the owner and co-teachers read the
  membership; admins read all. No client write path — creation and enrolment go
  through `create_class()` / `enrol_student()` SECURITY DEFINER RPCs, matching
  the existing `create_school()` / `assign_user_school()` pattern
  (`schema.sql:1310`, `:1348`).
- Helper `public.classes_visible_to(uuid)` returning the class ids a caller may
  aggregate over — admin sees all, teacher sees classes they own or co-teach.

**RPC changes** — add an optional `p_class_id uuid default null` parameter to
`get_class_analytics`, `get_student_progress` and `get_response_students`:

- `null` + admin → current behaviour (whole database).
- `null` + teacher → union of the teacher's own classes.
- explicit id → that class, after checking it's in `classes_visible_to()`.

This closes §3.1 without breaking the admin's existing system-wide view.

**Client** — `ClassInsightsModal` and `StudentProgressModal` gain a class
selector (a `Combobox`, reusing `components/Combobox.tsx`) that defaults to the
teacher's only class when there is exactly one.

**Tests:** extend `supabase/tests/rls_negative_tests.sql` — a teacher in school
A must get zero rows for a class in school B, and `get_student_progress` on a
non-member student must raise.

---

### Phase 2 — The cohort generator

New file `supabase/demoSeed.mjs`, run *after* `seed.mjs`. Service-role script,
same env-var contract, plus a guard rail:

```bash
export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
export DEMO_SEED_CONFIRM="hsc-demo"        # must match a marker row; refuses otherwise
node supabase/demoSeed.mjs
```

**Safety:** the script refuses to run unless the target database contains a
`plan_settings` row `demo_environment = 1` (written manually once, only on the
demo project). This makes it structurally impossible to point the generator at
production by pasting the wrong key.

**Determinism:** a small seeded PRNG (mulberry32 with a fixed constant) drives
every random choice, so two runs produce byte-identical content. Only the
timestamps differ, because they are computed as `now() - N days`.

**What it creates:**

| Entity | Detail |
| --- | --- |
| School | "Riverbank High School", `daily_ai_limit` set just above the cohort's typical daily burn so the pooled-budget pill shows ~70% used |
| Class | "Year 12 Software Engineering", owner = demo teacher, linked to the seeded Enterprise Computing / Software Engineering course |
| Profiles | 1 admin, 1 teacher, 1 co-teacher, 12 students |
| Responses | ~10 weeks, ~4 attempts/student/week → ≈480 rows in `responses` (latest per prompt) + ≈600 in `response_events` |
| Usage | `ai_usage`, `ai_model_usage` rows across Gemini and Claude engines, ~70 days |
| Contributions | 6 `pending` prompts + 5 `pending` sample answers with quality scores spread 34–91 |
| Subscriptions | one `plus` row (demo student B), one `school` row with `seats: 30` (demo teacher) |

**Student archetypes** (this is what makes the analytics *mean* something —
`rankByWeakness` in `utils/classAnalytics.ts` sorts by `low_band_rate`, so the
spread has to be deliberate):

| Archetype | n | Shape |
| --- | --- | --- |
| Improver | 3 | Band 2→5 over ten weeks — the sparkline sells the product |
| Plateaued | 3 | Band 4 flat, high volume — "working hard, not improving" |
| Verb-blocked | 2 | Strong on tiers 1–3 (Identify/Describe), collapses on tiers 4–6 (Analyse/Evaluate) — drives the Cognitive Spectrum |
| Sporadic | 2 | Long gaps, erratic bands — exercises `formatLastActive` |
| Strong | 1 | Consistent band 5–6 |
| At risk | 1 | Band 1–2, low volume |

**Evaluation payloads:** each `responses.evaluation` must be a valid
`EvaluationResult` (`types.ts:152`) — `criteria[]` consistent with
`overallMark`, and `overallBand` derived through `getBandForMark`, never
hand-written. The generator imports the real band logic rather than duplicating
it, so seeded data can't drift from the Verb Gate rules. Drafts are short,
plausible, clearly-fictional student writing written once per archetype/band
combination and varied mechanically — **no real student work, ever**.

**Idempotency:** every generated row carries a `legacy_id`/marker prefixed
`demo:`; re-running upserts rather than duplicates, matching `seed.mjs`.

---

### Phase 3 — Demo accounts and quotas

Extend `supabase/demoSeed.mjs` to create auth users via the admin API
(`auth.admin.createUser`, email-confirmed) and stamp roles through
`set_user_role()`:

| Login | Role | Plan | Purpose |
| --- | --- | --- | --- |
| `demo.student@…` | student | free | Paywalls: locked tier 4–6 questions, blurred band 4–6 samples, summary-only feedback, daily eval cap |
| `demo.plus@…` | student | plus | The unlocked "after" — full feedback, all bands |
| `demo.capped@…` | student | free | Seeded at its daily cap, so the 429 path and quota warnings are demonstrable |
| `demo.teacher@…` | teacher | school | Class Insights, Student Progress, Review Queue, authoring tools |
| `demo.admin@…` | admin | school | Database Manager, Data Vault, Content Audit Studio, API monitor, quota admin |

Quotas via the existing admin RPCs — `set_user_ai_quota('demo.student', 10)`
etc. Small enough that a live marking run works in a pitch but abuse is bounded.
`demo.capped` gets its `ai_usage` row pre-filled to the limit.

Credentials stay **private** (§2): they are not printed on the login page. The
demo deployment sets `VITE_ENABLE_DEMO_AUTH=false` — these are real Supabase
accounts, not the mock path.

---

### Phase 4 — Local (offline) fixtures

For the zero-setup path — no Supabase, `npm run dev`, log in as `user` — the
mock accounts in `authService.ts` gain matching local history.

- `data/demoFixtures.ts` — a compact, typed fixture set (responses, stats,
  streaks, XP) generated **by the same generator** in a `--target=fixtures`
  mode, so the two paths never tell different stories.
- On mock login, when the user's IndexedDB has no history, hydrate
  `STORE_USERS` / `STORE_MAIN` from the fixture (via `utils/idbTransactions.ts`).
  Guard: only when `isDemoAuthEnabled()` and only on first login, so a
  developer's own local work is never overwritten.
- Server-only surfaces (Class Insights, Usage Dashboard, Review Queue) cannot be
  faked here and stay disabled with the existing "requires Supabase" empty
  states. That limitation should be stated plainly rather than mocked.

Fixture size matters — it ships in the bundle. Target < 60 KB gzipped, and
lazy-load it via dynamic `import()` so it never lands in the main chunk
(`npm run check:bundle` guards chunk init order).

---

### Phase 5 — Refresh

`npm run demo:reseed` → truncate the `demo:`-marked rows, re-run
`demoSeed.mjs`. Because dates are relative, every run re-centres the 30-day
analytics windows.

Not automated as a cron initially — with private credentials the drift risk is
low. If the demo later goes public (§9), a nightly Vercel cron calling the same
script is the follow-up.

---

## 5. Files touched

| Path | Change |
| --- | --- |
| `supabase/schema.sql` | New §16: `classes`, `class_members`, RLS, `create_class()`, `enrol_student()`, `classes_visible_to()`; class-scoped params on the three analytics RPCs |
| `supabase/demoSeed.mjs` | **New** — the generator (cohort, responses, usage, contributions, auth users) |
| `supabase/demoData/*.json` | **New** — archetype drafts and feedback text, version-controlled and reviewable |
| `supabase/tests/rls_negative_tests.sql` | Cross-class / cross-school negative cases |
| `supabase/README.md` | Demo setup section |
| `data/demoFixtures.ts` | **New** — generated offline fixture |
| `services/authService.ts` | Hydrate fixtures on first mock login |
| `components/admin/ClassInsightsModal.tsx`, `StudentProgressModal.tsx` | Class selector |
| `services/responseService.ts` | Pass `classId` through to the RPCs |
| `package.json` | `demo:seed`, `demo:reseed` scripts |
| `tests/unit/demoSeed.test.ts` | **New** — generator determinism + band/verb integrity |

---

## 6. Verification

1. `npm run test:all` — lint, unit, type-check.
2. New unit test: two generator runs with the same seed produce identical
   content; every generated `EvaluationResult` satisfies the Zod schema in
   `utils/dataManagerUtils.ts`; every `overallBand` matches `getBandForMark`.
3. `supabase/tests/rls_negative_tests.sql` on the demo project — cross-class
   reads return zero rows.
4. Manual pass, per account, against a checklist: every screen listed in §1 must
   show non-empty, plausible data.
5. A Playwright spec in the stubbed-Supabase style of
   `tests/e2e/contribution-loop.spec.ts`: log in as demo teacher → Class
   Insights shows ranked weaknesses → open a struggling student → sparkline
   renders.

---

## 7. Effort

| Phase | Estimate |
| --- | --- |
| 0 — Demo project | 0.5 day (mostly waiting on project creation) |
| 1 — Classes + scoped RPCs | 2 days |
| 2 — Generator | 2–3 days (the archetype writing is the slow part) |
| 3 — Accounts + quotas | 0.5 day |
| 4 — Local fixtures | 1.5 days |
| 5 — Refresh script | 0.5 day |

≈ 7–8 days. Phases 0+2+3 alone (≈3.5 days) give a working demo against the demo
project; Phase 1 is the one that also fixes production privacy, and Phase 4 is
the one that makes `npm run dev` immediately impressive.

---

## 8. Risks

- **Fabricated student work read as real.** Every seeded draft must be obviously
  fictional and every demo profile clearly named "Demo". Nothing in the demo set
  may be derived from real student writing.
- **Service-role script pointed at production.** Mitigated by the
  `demo_environment` marker guard (§Phase 2), but the key handling still
  deserves care — never commit it, never put it in `.env.local` alongside the
  dev URL.
- **Fixture bundle weight.** Guarded by the dynamic-import requirement and
  `npm run check:bundle`.
- **Analytics scoping is a behaviour change.** Admins keep the system-wide view;
  teachers narrow from "everyone" to "their classes". That is the intended fix,
  but it will look like a regression to anyone relying on the old breadth.

---

## 9. What implementation turned up

Three things the plan did not anticipate, found while building PR 1.

### 9.1 `low_band_rate` measures verb tier, not weakness — and this is serious

The Verb Gate makes a question's band ceiling **equal to its verb's cognitive
tier**: `getBandForMark(2, 2, 1)` is 1, `getBandForMark(6, 6, 3)` is 3. Full
marks on an `IDENTIFY` question is band 1. Full marks on `EXPLAIN` is band 3.

`get_class_analytics` (`supabase/schema.sql:961`) defines the struggling signal
as `avg((overall_band <= 3)::int)`. Those two facts together mean **every tier
1–3 verb reports a 100% low-band rate, by construction**, for any student, no
matter how well they answered. Measured on the seeded cohort:

| Tier | Verbs | Attempts | Reported "struggling" |
| --- | --- | --- | --- |
| 1 | Identify, State, Recall | 104 | **100%** |
| 2 | Describe, Outline | 78 | **100%** |
| 3 | Explain | 181 | **100%** |
| 4 | Analyse, Distinguish | 50 | 90% |
| 5 | Assess | 11 | 73% |
| 6 | Evaluate | 23 | 43% |

363 of ~450 attempts are structurally incapable of clearing the threshold. So
Class Insights' weakness ranking — the flagship teacher feature — currently ranks
verbs by tier and calls it struggle. It will tell a teacher their class is 100%
failing Identify while a student who scored full marks on every one sits in that
cohort. `rankByWeakness` in `utils/classAnalytics.ts` then sorts by exactly this
number, so the ordering inherits the defect.

The same cause deflates `profiles.stats.averageBand`: the seeded cohort averages
1.15–2.57 across twelve students, including the strongest, because most of the
question bank cannot award above band 3.

This is a pre-existing product defect, not a seeding artefact — the generator
faithfully applies the app's own rules, which is how it surfaced. **Fix:** measure
attainment against each question's ceiling (`band / getBandForMark(totalMarks,
totalMarks, tier)`) rather than comparing raw bands across tiers, in both
`get_class_analytics` and `get_student_progress`. That is a change to what the
product reports, so it belongs with PR 2's analytics work rather than in a
seeding PR — but it should be prioritised above the class scoping, because a
teacher acting on the current ranking would be acting on noise.

The generator already works this way internally: archetypes declare a
`targetAttainment` fraction of the achievable ceiling, not an absolute band,
because absolute band targets were silently clamped to 1 on a third of the bank
and made every archetype identical on low-tier questions.

### 9.2 `supabase/seed.mjs` could not run

It read `../courseData`, but the syllabus JSON lives in `public/courseData` (moved
there so the Vite build ships it). The path was never updated, so the existing
seed script failed on its first `readFile`. Fixed in this PR — the demo seed
depends on it having run.

### 9.3 Repeat attempts are required, not incidental

The first cut gave each student a unique set of questions, reasoning from
`responses`' unique index on `(user_id, prompt_id)`. That starved the later weeks
once the pool drew down and left the band trends empty. The right model is the one
the schema already describes: students revisit questions, `response_events` records
every attempt, and `responses` holds only the latest per pair (`latestPerPrompt`).
Revisiting a question is also how a student actually improves, so the trend the
sparkline draws depends on it.

## 10. Open questions

Now settled except where noted:

1. **Class scoping** — is the `classes` table in scope, or should the demo lean
   entirely on demo-project isolation and leave the RPCs unscoped? (Dropping it
   saves ~2 days but leaves the production privacy gap open.)
2. **Public demo** — private credentials assumed. A "Try the demo" button on the
   login page would add rate limiting, tighter quotas and a nightly reset.
3. **Course choice** — which seeded course should the demo class study? The
   repo currently ships Enterprise Computing content
   (`HSCEnterpriseComputing09122025.json`).
4. **Stripe** — should the demo `subscriptions` rows be pure fabrication, or
   real Stripe test-mode subscriptions so the customer portal and webhook path
   are demonstrable too?
5. **Guest mode** — should an anonymous guest also see seeded content, or stay
   on the current empty read-only trial?
