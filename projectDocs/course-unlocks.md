# Course unlocks: a one-off fee per course, on top of a plan

Status: hooks in place, **off by default**. Nothing changes for anyone until `COURSE_UNLOCKS_ENABLED=true` (server)
and `VITE_COURSE_UNLOCKS_ENABLED=true` (client) are set.

## The model

A plan (Free, Plus, School) still governs **how much** a student can do: evaluations a day, AI quota, premium
features. A course unlock governs **which courses** they can be marked in. The two stack: a Plus subscriber can still
need to unlock Chemistry, unless their plan is one that includes every course.

A student can always browse a locked course (the syllabus, dot points and questions are visible). What a locked course
withholds is **marking**: an evaluation request for it is refused with `402 { code: 'course_locked' }`.

A course is **open** to a caller when any of these holds, checked in this order:

1. Unlocks are switched off (the default).
2. The caller is staff (teacher or admin).
3. The caller's plan is in the included-plans list (default: `school`).
4. The course does not require an unlock (the free-courses list, or `unlock_required = false` in the catalogue).
5. The caller holds an active unlock for it: not revoked, and not past `expires_at` when one is set.

Otherwise it is **locked**.

## Tuning knobs

| Knob | Where | Default | Effect |
| --- | --- | --- | --- |
| `COURSE_UNLOCKS_ENABLED` / `VITE_COURSE_UNLOCKS_ENABLED` | env | `false` | Master switch, on the server and the client. |
| `COURSE_UNLOCK_INCLUDED_PLANS` / `VITE_…` | env, comma list | `school` | Plans that include every course. Set it to `plus,school` to make Plus all-inclusive, or leave it empty so everyone pays. |
| `COURSE_UNLOCK_FREE_COURSES` / `VITE_…` | env, comma list of course ids | empty | Courses that never need an unlock, for example `course-hsc-english-standard`. |
| `course_catalogue.unlock_required` | database, admin | `true` | Per-course override, which needs no redeploy. A course with no catalogue row requires an unlock. |
| `STRIPE_COURSE_UNLOCK_PRICE_ID` | env | none | The default one-off Stripe price. If it is not set, checkout answers 503. |
| `course_catalogue.stripe_price_id` | database, admin | null | A per-course price that replaces the default. |
| `COURSE_UNLOCK_DURATION_DAYS` | env | empty | How long an unlock lasts. Empty means it never expires; `365` means a year. |
| `grant_course_unlock` / `revoke_course_unlock` | admin RPCs | n/a | Hand out or take back an unlock without payment, for example a scholarship or a mistaken purchase. |

The server copy of each knob is the one that enforces. The `VITE_` copies only shape the UI, as with
`api/_lib/planPolicy.ts` and `services/planPolicy.ts`.

## Database (schema §34)

- **`course_catalogue`**
  - **Columns:** `course_id text primary key`, `unlock_required boolean not null default true`,
    `stripe_price_id text`, `active boolean not null default true`, `updated_at timestamptz`.
  - **Access:** RLS on. Any signed-in user can read it; only admins can write.
- **`course_unlocks`**
  - **Columns:**
    - `id uuid primary key`
    - `user_id uuid not null references profiles(id) on delete cascade`
    - `course_id text not null`
    - `source text not null check (source in ('purchase','grant'))`
    - `stripe_checkout_session_id text unique`
    - `stripe_payment_intent_id text`
    - `granted_at timestamptz not null default now()`
    - `expires_at timestamptz`
    - `revoked_at timestamptz`
  - **Index:** `(user_id, course_id)`.
  - **Access:** RLS on. Users read their own rows and admins read all. Nobody writes from the client: rows come only
    from the service role (the webhook) or the admin RPCs.
- **`my_course_unlocks()`:** returns `setof text`, the caller's active course ids (security definer, scoped to
  `auth.uid()`).
- **`grant_course_unlock(p_user uuid, p_course text, p_expires_at timestamptz default null)`** and
  **`revoke_course_unlock(p_user uuid, p_course text)`:** admin-only.

## Server

- **`api/_lib/courseAccess.ts`:** the policy above, as pure functions that read the env lazily, plus
  `resolveCourseAccess(token, courseId)` → `{ open: boolean, reason }`. The lookup fails open, like
  `resolveCallerPlan`: a broken lookup never takes marking down.
- **`POST /api/course-unlock-checkout`** takes `{ courseId, returnUrl? }`.
  - **Who can buy:** auth is required. If unlocks are off, it answers 404 with code `course_unlocks_disabled`.
  - **Refusals (409):** `course_included` when the course is already open by plan, staff role or a free course;
    `course_already_unlocked` when the caller already holds an active unlock.
  - **The session:** a Stripe Checkout Session with mode `payment`, `client_reference_id` set to the user, and
    `metadata { kind: 'course_unlock', course_id, supabase_user_id }`. The price comes from the catalogue, or the
    env default.
  - **Return URLs:** go through `resolveReturnBase`: success to `#/course-unlocked?course=<id>`, cancel back to the
    app.
  - **Without Stripe:** it returns a mock URL, as `create-checkout` does.
- **`stripe-webhook`**
  - **`checkout.session.completed`:** when `metadata.kind === 'course_unlock'` and `payment_status === 'paid'`, it
    inserts into `course_unlocks`. This is idempotent on the session id, and sets `expires_at` from
    `COURSE_UNLOCK_DURATION_DAYS`.
  - **`charge.refunded`:** a full refund of a course-unlock payment sets `revoked_at`. The row is found by its
    payment intent.
  - **Before this change:** every completed checkout was treated as a subscription link. A `course_unlock` session
    must not be treated that way.
- **`api/gemini.ts`:** when unlocks are on and the request carries `__courseId` on an evaluation, a locked course
  answers `402 { code: 'course_locked', courseId, upgradeRequired: true }` before any quota is spent.
  `api/_lib/providers.ts` strips `__courseId`, as it already strips `__feature`.
- **`api/prices.ts`:** adds a `courseUnlock` entry, the default price's amount and currency, when the env price is
  set.

## Client

- **`services/courseAccess.ts`:** mirrors the policy from the `VITE_` env.
  - **Queries:** `courseUnlocksEnabled()`, `isCourseIncluded(courseId, user)`,
    `isCourseLocked(courseId, user, owned: Set<string>)`.
  - **Loading:** `loadOwnedCourseUnlocks()`, which calls the RPC and caches the result. Without Supabase it returns
    an empty set.
  - **Buying:** `startCourseUnlockCheckout(courseId)`.
- **Marking requests** send `__courseId` alongside `__feature`.
- **Course picker:** a locked course shows a small lock and the price ("Unlock · $X") next to its name. It stays
  selectable, so the course can still be browsed.
- **Evaluate on a locked course:** opens `CourseUnlockModal`. It names the course, says what unlocking gives
  ("Marking and feedback for every question in <Course>"), shows the one-off price, and has an **Unlock** button
  that starts checkout. The same modal opens on a server `402 course_locked`.
- **After checkout:** the `#/course-unlocked` return refreshes the owned set and shows a toast.

## Not decided yet (tune later)

- **Bundles,** such as "all Science courses". Add a `bundle` column to the catalogue, and accept a list of course
  ids in checkout.
- **Whether an unlock carries over to the next HSC year.** Use `COURSE_UNLOCK_DURATION_DAYS` for now.
- **Whether a School licence includes only its school's selected courses.** Today the whole plan is included.
