# Monetisation review — September 2026

Review date: 2026-09-20. Scope: how paid features are **managed**, **enforced**,
**communicated** and kept **consistent** across roles and groups, plus the UI/UX
of the paywall itself. Follows the August pass recorded in
`monetisation-review-plan.md` / `monetisation-review-verification.md`, which
covered the Stripe integration end of the same surface.

## 1. Verdict

The machinery is in good order and has not rotted: the three gates (role → plan
→ quota) are still cleanly separated, the client and server plan policies are
still pinned together by tests, redaction still happens server-side, and the
evaluation meter still lives in Postgres where a cleared browser cannot reach
it. What had gone stale was everything **above** the machinery — the routes into
it and the sentences about it.

The headline finding is that **no school could buy a School licence**. Not
because the integration was broken; it was correct end to end. The purchase
panel simply sat behind a door that the only two roles allowed to open it can
never reach. That is the shape of most of what follows: correct code, wired to
nothing, or described in words that had drifted away from it.

Fourteen findings, thirteen fixed, one deliberately left. Full suite green:
lint, unit tests, end-to-end tests, both type-checks, a production build, and
the chunk-order, eager-read and dead-code guards.

Findings §1–§12 shipped in #266. §13–§14 came out of writing the end-to-end
coverage that §4 of _Still open_ had called for — which is itself the argument
for having written it.

## 2. Findings

### 1. The School licence was unbuyable — P0, fixed

`SchoolLicencePanel`'s ancestor was a block inside `UpgradeModal`, shown when
`STRIPE_SCHOOL_PRICE_ID` is set **and** the account is a teacher or admin. The
upgrade prompt opens on exactly one trigger: a **locked control** calling
`requestUpgrade()`. But with the shipped policy every feature's minimum plan is
`plus`, and `getUserPlan()` resolves a teacher to `plus` (staff perk) and an
admin to `school` (role). So neither role ever holds a locked control, the
prompt never opens for them, and the seat picker was unreachable.

Every other route in was closed to them too: the plan-comparison CTA is gated on
`currentPlan === 'free'`, the profile's upgrade button on `!isPaid`, and the
daily-limit prompt on a meter that does not apply to staff. An operator could
configure the school price correctly, verify it in Stripe, and watch nobody buy.

**Fixed** by lifting the panel into `components/SchoolLicencePanel.tsx` and
rendering it in the **plan comparison** (Profile → Compare plans) as well as in
the prompt. That is where staff actually arrive. The reachability argument is
now a test (`tests/unit/schoolLicenceRoute.test.tsx`) rather than a comment, so
it fails if the panel is ever put back behind a lock.

Students and parents get the enquiry route from the same component, which also
fixes a smaller gap: the comparison table advertised a School price with no way
to act on it.

### 2. The daily reset was described three ways, and the common one was wrong — P1, fixed

The allowance is metered on a **UTC day** — `consume_evaluation()` keys on
`(now() at time zone 'utc')::date`, the client mirror on
`toISOString().slice(0, 10)`. That is the right way to meter it and the wrong
way to say it, because this app is built for NSW students and midnight UTC is
10am AEST / 11am AEDT.

Three surfaces said three different things:

| Surface                     | Said                      | True for an NSW student?                              |
| --------------------------- | ------------------------- | ----------------------------------------------------- |
| `FreeEvalCounter` tooltip   | "resets at midnight UTC"  | Accurate, and asks a 17-year-old to convert timezones |
| `UpgradeModal` at the limit | "yours reset at midnight" | **No** — reads as their own midnight                  |
| `PlanComparison`            | "resets every day"        | Vague                                                 |

The middle one is the damaging one: it appears at the highest-intent moment in
the product, and a student who ran out at 9pm came back before school to find
the allowance still spent.

**Fixed** with `utils/dailyReset.ts` — the boundary stays UTC, the sentence is
localised ("your next one is at 10:00 am tomorrow"). All four client surfaces
(counter, prompt, comparison, the App toast) read from it, so they cannot drift
apart again.

### 3. "Manage subscription" named a control two screens away — P1, fixed

`api/create-checkout` refuses a second concurrent subscription with a 409 whose
message is _"Use 'Manage subscription' to change your plan or seats."_ That
button lives in the profile modal; the user reading the message is standing in
the upgrade prompt. Worse, `postBilling` collapsed every failure into a string,
so the prompt showed it as a red error toast — which reads as "try again",
the one thing that cannot work.

**Fixed**: `BillingUrlResult` now carries the HTTP status, and on a 409 the
prompt turns its own CTA into **Manage subscription**, opening the billing
portal, with a line explaining that there is nothing to buy. Every other failure
still toasts as a retryable error.

### 4. Twelve hard-coded "Band 6 Plus" strings — P2, fixed

The lock chips and the prompt derived their plan label from the feature key;
the prose beside them did not. A deployment only has to use a lever the app
already ships — `PLAN_FEATURE_OVERRIDES=sampleAnswers:school` — for the chip to
say "School" while the tooltip on the same control says "part of Band 6 Plus",
and for the prompt to sell a plan no caption mentioned. Renaming the plan in
`PLAN_LABELS` had the same problem in reverse.

**Fixed** with `planLabelForFeature(key)`, applied across `Workspace`,
`EvaluationDisplay`, `SampleAnswersAccordion`, `PromptSelector`,
`ReferenceMaterials`, `OutcomeDetailModal` and `UserProfileModal`. The chip
keeps the short form ("Plus"/"School") because it sits inline and has no room;
everything with room now says the full name, and both derive from the same
policy lookup.

### 5. Stale deployment documentation — P2, fixed

- `.env.example` listed seven feature keys; there are eight (`outcomeBriefing`
  was missing, so a deployment could not discover it was overridable).
- It claimed "everything is `plus`, except aiContentStudio which is `school`".
  The studio moved to Plus so the teacher staff perk would reach it, making the
  worked example (`aiContentStudio:plus`) a no-op.
- `STRIPE_AUTOMATIC_TAX` existed in `docs/stripesetup.md` but not in
  `.env.example`, unlike every other Stripe variable.
- `docs/stripesetup.md` said the billing portal "works out of the box — no
  additional Stripe configuration needed" and listed plan upgrades among what it
  does. The app now sends users there for plan and seat changes in two places,
  and the portal only permits those once they are switched on in the portal
  configuration.
- Code comments in `services/entitlements.ts` and `UpgradeModal` still reasoned
  about the AI Content Studio as a school-only feature.

### 6. "Free vs Plus" over a three-plan table — P2, fixed

The Quick Start tab was named for two plans while the table below it carried a
School column with its own price. Renamed to "Compare plans", matching the
profile entry that opens it.

### 7. The header's help button inherited the last tab — P2, fixed

`AppModals` keeps `quickStartTab` in state and keys the modal on it, but the
header's help button opens the modal without saying which tab it wants. Press
"Compare plans" once and the help button showed the price table from then on.
The tab now resets to the guide on close.

### 8. The same refusal said two different things — P1, fixed

Running out of markings can be caught twice: by the client's pre-check in
`App.handleEvaluate`, and by the proxy's 402 in `useGemini`. Both opened the
same prompt (good) and then toasted different sentences. The server's is
correct but it cannot name a reset time — it does not know the caller's
timezone — and it spells the plan out as a literal, so a student who hit the
limit on a second device read a vaguer message than the one they got on the
first.

**Fixed**: one `evalLimitMessage()` in `services/entitlements.ts`, called by
both. The server's 402 body is still the fallback if the error ever arrives
without figures; the sync that precedes it has already made the client's
numbers authoritative.

### 9. A school licence could be bought by someone with no school — P1, fixed

`create-checkout` checked the buyer's **role** but not their **school**. Buy 30
seats with `school_id` unset and the webhook stamps the plan onto the purchaser
alone and logs a console warning — N seats' money, one seat's effect, and
nothing in the app says so. Nor is it recoverable by fixing the account: the
`schools` row is never back-filled, so an admin attaching them afterwards does
nothing until the subscription next updates, up to a year later.

The panel already warned about this in prose ("make sure your school is set up,
and you're in it"). **Fixed** by enforcing it where it can hold — a 400 before
any money moves, naming the step that fixes it (Admin → Schools). Ordered
_after_ the duplicate-subscription guard, because "you already have a
subscription" is the stronger answer when both apply.

### 10. The admin dashboard called an ending licence a renewing one — P1, fixed

Stripe keeps a cancelling subscription at status `active` right up to the
period boundary, so `plan_status` alone cannot tell a renewal date from an end
date. The school licence cell rendered "renews 1 Mar" for a licence that would
lapse on 1 Mar and drop every student in the school back to the free tier. The
user-facing profile card had already been fixed for personal subscriptions
(`cancelAtPeriodEnd`); the institutional one had not, and it is the one where
the surprise is thirty people wide.

**Fixed**: `schools.plan_cancel_at_period_end` (schema §13, `add column if not
exists`), written by the webhook and cleared on deletion, surfaced by
`list_schools()`, and rendered as an amber "ends 1 Mar — cancelled". A database
that has not re-applied the schema returns the field absent, which reads as
today's behaviour rather than breaking.

### 11. AI-quota messages still say "midnight UTC" — left as is, deliberately

`utils/quotaWarnings.ts` and the proxy's 429 body describe the **AI call
budget**, not the paywall. Different meter, different audience: the copy ends
"ask an admin if you need more", and an admin reading a dashboard that says
"Budgets reset at midnight UTC" wants the server's clock, not the browser's.
The server cannot know the caller's timezone anyway. Noted here so the
inconsistency is a decision rather than an oversight.

### 12. Checkout-success polling is sound — checked, no change

`App`'s post-checkout poll calls `refreshSession`, which runs `applySchoolPlan`,
so a **buyer** — personal or school — unlocks without re-login. It is the other
members of a licensed school who wait (see §4).

_Superseded by §31: the return now confirms the purchase with Stripe before it
polls, so the poll is the fallback rather than the only route._

### 13. The profile's three help rows were dead buttons — P0, fixed

Found by the new end-to-end spec, and invisible to every unit test in the
codebase.

`activeModals` is a `Set`, so opening a modal closes nothing. The profile sits
at `z-profile` (2000); the quick-start guide at 940 and the legal reader at 950.
So "Quick Start Guide", "Compare Plans" and "Terms & Privacy" each opened a
modal **underneath** the profile's own opaque panel and its `bg-black/80`
backdrop. The user pressed the row and the screen did not change.

This mattered here because the plan comparison is the only route to the plan
table, which is the only in-app route to a School licence — so §1's fix landed
on a surface nobody could actually open.

Why no test caught it: Playwright's `toBeVisible` and Testing Library's queries
both model _rendered_, not _reachable_. The element was in the tree the whole
time. Only a **click** exposed it, reporting that the profile's own subtree
intercepted the pointer.

**Fixed** by closing the profile when it hands off. That is the right answer
rather than re-tiering the shared z-scale: each row already carries an
external-link icon promising "this takes you elsewhere", and the scale's
ordering has a documented rationale that is not this review's to reshuffle.

### 14. The upgrade prompt opened behind the surface that asked for it — P1, fixed

The same inversion, one layer down. `z-upgrade` is 900, below both the
quick-start modal (940) that hosts the plan comparison and the profile (2000)
whose plan card offers "Upgrade to Band 6 Plus". Both CTAs opened a prompt the
user could not see.

**Fixed** with the same rule: a CTA that hands off dismisses the surface it was
pressed from.

### 32. The paywall said things the plan does not do — P1, fixed (`claude/paywall-ux`)

The payment surfaces disagreed with the plan and with the server in five ways.
Each is fixed on the branch; the full map is `projectDocs/paywall-surface-inventory.md`.

- **"Unlimited" for a paid plan.** The prompt said "removes the limit entirely", the
  comparison said "Unlimited", and the profile said "Unlimited marking", while the
  same screens quoted a 300-call daily AI allowance. Paid evaluations now read
  "No daily limit" and the AI allowance row is labelled as shared.
- **Operator text reached customers.** A misconfigured deployment answers 503 with
  a paragraph naming `STRIPE_SECRET_KEY` and `VITE_STRIPE_*`, and the toast showed
  it verbatim. `utils/billingMessages.ts` now maps every billing failure to a
  sentence that says whether anything was charged or changed. **The operator no
  longer sees that text in the UI; check the function logs for a 503.**
- **A dead CTA that implied a sign-up.** With no Plus price, the prompt's button
  read "Keep me posted", did nothing but toast, and recorded nothing. It is gone;
  the prompt states that Plus is not on sale.
- **Locks that named the wrong plan.** Nine chips passed no feature and so read
  "Plus" whatever the policy said; three tooltips typed out "the AI Content
  Studio". A `PLAN_FEATURE_OVERRIDES` move would have split the chip, the tooltip
  and the prompt. A static test now pins both.
- **Profile and banner states.** A cancelled subscription was chipped "Active", an
  admin was told their access came from "your school's licence", and a past-due
  subscription showed no reason. The portal button flashed for perk holders while
  the lookup was pending.

### 33. The School seat picker was offered under "nothing to buy here" — P1, fixed (`claude/paywall-ux`)

After checkout refused with 409 (a live subscription), the prompt said there was
nothing to buy and then offered a seat picker. The picker is no longer drawn in
that state. The same refusal would have blocked a seat purchase.

## 3. What was checked and found sound

- **Enforcement is where it claims to be.** `api/_lib/planPolicy.ts` is honest
  about which gates are real (`aiContentStudio`, `answerUpgrades`,
  `outcomeBriefing` via `__feature`; `fullFeedback` via redaction) and which are
  UI-only (`advancedQuestions`, `sampleAnswers`, `pdfExport`, `examMode`), with
  a reason for each. All 15 studio call sites still carry their tag.
- **Plan resolution agrees across the three copies.** `getUserPlan()`,
  `caller_plan()` (§17) and `has_unlimited_evaluations()` (§14) apply the same
  order, including the `past_due` grace period.
- **Group entitlements work.** A school licence reaches every member through
  `schools.plan_status`, and `resolve_ai_quota` honours it, so licensed students
  get the 300-call allowance the comparison promises them.
- **Admin management exists and is reachable.** The free-tier allowance is
  editable live from the usage dashboard, and seat counts show against member
  counts with an over-seat warning.
- **The comparison table is derived, not written.** `utils/planComparison.ts`
  builds from the live rules and mirrors the two deployment escape hatches, so
  a pilot deployment sees ticks rather than crosses.
- **Legal copy matches the code.** `data/legalContent.ts` interpolates the real
  free-tier numbers rather than restating them.
- **The billing portal cannot be offered to someone who has none.** The profile
  card distinguishes "no subscription" from "could not tell", and falls back to
  offering the portal on a failed lookup rather than telling a real subscriber
  they have nothing to manage. The new 409 → portal route cannot reach the
  portal's 404 either: a 409 means a subscription row exists, which means the
  same webhook wrote the customer id.
- **The demo seed is honest about its own limits** — it says in a comment that
  its fabricated subscription rows have no Stripe customer behind them, so the
  portal button will fail for demo accounts.

## 4. Closed since the first pass

- **A school member's own profile card read an end date as a renewal date.**
  §10 fixed this where an admin can act on it; the member's card now reads the
  same flag, carried onto the profile by `applySchoolPlan`. `User` plan fields
  are auth-session state rather than curriculum data, so this needed no schema
  bump or migration — the first pass over-estimated it.
- **No end-to-end coverage of the paywall.** `tests/e2e/paywall.spec.ts` now
  walks the free tier's counter, the plan comparison, the upgrade route, and a
  teacher's route to the School licence. Writing it found §13 and §14
  immediately, which is the case for having it.

### 15. The exemplar gate was a CSS class — P1, fixed

The free tier may read exemplars up to Band 3. That rule was
`blur-sm select-none pointer-events-none` on a div whose text was already in
the document. The server sent every Band 6 exemplar to every free account and
the client drew frosted glass over it: one class deleted in the inspector, or
one look at the network tab, bought the library.

**Fixed in `supabase/schema.sql` §25**, where a browser cannot reach it.
`answers_read` now also requires `not sample_answer_withheld(band, created_by)`,
so the row is never returned.

Two things about the shape of the fix are worth recording, because the obvious
version of each is wrong:

- **It withholds the ROW, not the columns.** The first cut was a view that kept
  the row and nulled its three prose columns, which reads better — the client is
  told exactly what is behind the plan. It was also bypassable in one request:
  Supabase grants `authenticated` SELECT on every table and lets RLS gate it, so
  `/rest/v1/sample_answers` returned the prose the view had just hidden. The
  entitlement test that proves this now reads the **table**, not the view that
  is gone, for exactly that reason. Revoking the table's SELECT was not the way
  out either — the review queue and every author's own read go through it.
- **The upsell had to be rebuilt separately.** Dropping the row closes the hole
  and takes the lock with it: a gate the client cannot see is a gate that sells
  nothing. `withheld_sample_answers()` returns everything _about_ the refused
  rows — band, mark, source — and selects no prose column at all, so that path
  cannot become the leak it exists to prevent. `tests/unit/entitlementConstants.test.ts`
  asserts it never starts selecting one.

Three exemptions, all of them corrections rather than courtesies: an **admin**
has to read what they are moderating; the **author** must never be sold their
own writing (a student's marked answer can be saved back as an exemplar); and a
school running this for itself never asked to be metered, so the
`free_sample_band_cap` plan setting doubles as the opt-out — set it to 6 and
nothing is ever withheld.

The workspace shows a real locked card now (band, mark, and the route to Plus)
instead of blurring prose it no longer has. Verified against a local Postgres
running the full CI SQL pipeline: six new entitlement assertions covering the
free reader, the paying reader, the admin, the author, the tuned-off cap and
the review queue.

### 16. A second School licence could be bought for the same school — P1, fixed

The duplicate guard in `api/create-checkout.ts` is per person. Two teachers at
one school each passed it and each bought a licence. Both were charged, and the
webhook wrote whichever event arrived last onto `schools.stripe_subscription_id`,
so one licence was paid for and invisible, and billed for a year.

**Fixed**: a school that already holds a live licence (a subscription id, and a
status of `active`, `trialing` or `past_due`) refuses a second purchase with a 409
and `code: school_licence_held`, before any session exists. A licence set to end at
period end still holds. A cancelled, unpaid or expired one does not. Plus is never
checked. Tests: `tests/unit/schoolLicenceDuplicateGuard.test.ts`.

### 17. A webhook whose handler was killed lost its event for good — P1, fixed

`claimEvent()` inserted the event id before handling it. A Vercel timeout, an OOM
or a deploy swap killed the function after the insert, so the catch block never
ran. Stripe's retry was acknowledged as a duplicate. A cancelled customer kept the
plan; a paying one stayed on free.

**Fixed** with `stripe_events.processed_at` (schema §13) and `api/_lib/stripeLedger.ts`.
A claim counts as done only once the handler returns and stamps it. An unstamped
claim older than two minutes (longer than the 60-second function limit) is taken
over by the next retry, using a compare-and-set, so two retries cannot both win. A
younger one answers 409, so Stripe retries later. Rows written before the column
read as finished. Tests: `tests/unit/stripeWebhookGrace.test.ts` (stamp, lease,
takeover, release, missing column); SQL in `supabase/tests/entitlement_tests.sql` §16.

### 18. A School licence stopped syncing when its purchaser changed school — P1, fixed

`handleSubscriptionUpsert` found the school through the purchaser's _current_
`school_id` (`api/stripe-webhook.ts`, the `plan === 'school'` branches). A teacher
who moved school left the licence unsynced. Renewals and `past_due` or `unpaid`
statuses then never reached the school row, so an unpaid school kept its plan until
the subscription was finally deleted.

**Fixed**: the licence is found by its subscription id on the school row, and the
purchaser's school is the fallback for a first event. Test:
`tests/unit/stripeWebhookOwnership.test.ts`.

### 19. A cancelled subscriber could stay on Plus — P1, fixed

`handleSubscriptionDeleted` looked the user up by customer id with `.single()` and
returned early when no profile matched. Two checkouts racing before either linked
a customer give exactly that. The second subscription's cancellation then left the
profile on `plus` for good. **Fixed**: the user is found through the subscription
row when the customer route fails. Same test file as §18.

### 20. The checkout guards failed open on a database error — P1, fixed

`create-checkout` ignored the `error` from its profile and subscription lookups,
so a database error read as "no existing subscription", and a second purchase
could proceed. **Fixed**: those lookups, and the school licence lookup, now refuse
the purchase with a 503 before any session is created. A licence column the schema
has not added yet is treated as "nothing to check", so a database that has not
re-applied §13 behaves as before. Tests: `tests/unit/schoolLicenceDuplicateGuard.test.ts`.

### 21. Two open Checkout Sessions can both complete — P1, fixed

- **Where**: `api/create-checkout.ts`, `api/_lib/openCheckout.ts`, and the
  `checkout_sessions` table (schema §13).
- **Scenario**: a buyer opens Checkout, does not pay, and opens it again. The first
  session is still open. Both are completed, so there are two live subscriptions on
  one customer. `resolve_stripe_plan` keeps whichever has the latest period end,
  and the other keeps billing, which is the exact outcome the guard exists to prevent. The guard cannot
  see it, because a subscription row exists only after the webhook has run.
- **Severity**: P1 (double charge).
- **Fixed**: each account has one payable session. A new session is recorded in
  `checkout_sessions` before its URL leaves the function, and the one it displaces is
  expired. The record is a compare-and-set on the session id, so two racing requests
  cannot both displace the same session. A double tap returns the same session: the
  create call carries an idempotency key made from the user, the plan, the seats and a
  five-minute bucket, and `expires_at` comes from the same bucket. Sessions now live 31
  to 36 minutes, not 24 hours. If the displaced session was paid and its subscription is still
  held, the new purchase is refused and its session released. A Stripe failure while
  expiring is logged and does not block the purchase, as the brief requires. The
  residual window that leaves is §35.
- **Evidence**: `tests/unit/openCheckout.test.ts` (the bucket, the expiry bounds, the swap
  and its lost race, the refusal rule), `tests/unit/openCheckoutRoute.test.ts` (second
  checkout displaces the first, double tap, paid first session refused and released,
  Stripe failure on expiry does not block, unreadable record refused and released,
  missing table as before); SQL assertions in `supabase/tests/entitlement_tests.sql`.

### 22. A subscription in `incomplete` holds nothing, so a second purchase is allowed — P1, fixed

- **Where**: `api/create-checkout.ts` (both guards, and the displaced-session check),
  `HELD_STATUSES` in `api/_lib/openCheckout.ts`.
- **Scenario**: the first payment needs 3-D Secure. The subscription stays
  `incomplete` for up to about 23 hours, and the buyer, or a colleague for the same
  school, checks out again. Both then complete.
- **Severity**: P1 (double charge). Same mechanism as §21.
- **Decision, from the SDK types** (`node_modules/stripe/esm/resources/Subscriptions.d.ts`,
  the `status` field): for `charge_automatically`, a failed first payment moves the
  subscription to `incomplete`; "once the first invoice is paid, the subscription moves
  into an `active` status"; and "if the first invoice is not paid within 23 hours, the
  subscription transitions to `incomplete_expired`". So `incomplete` can still become a
  paying subscription, and it holds a purchase. The same comment limits `incomplete` to
  `charge_automatically`: an invoiced (`send_invoice`) licence never enters it, so this
  hold does not stop a school's purchase-order licence. The Checkout Session types
  (`Checkout/Sessions.d.ts`) say `status` is `open`, `complete` or `expired`, and that
  `payment_status` is `paid`, `unpaid` or `no_payment_required`. A `complete` session
  is therefore not evidence of payment, which is why `sync-checkout` also requires
  `payment_status` to be paid.
- **Why the one-open rule does not make it moot**: a `complete` session can carry an
  `incomplete` subscription, and the rule expires only sessions that are still open. So
  the displaced-session check reads the subscription as well as the session.
- **Fixed**: `incomplete` is in `HELD_STATUSES` for both guards and the displaced check,
  with its own wording ("still waiting for payment"). It is not in `resolve_stripe_plan`,
  `caller_plan()`, `resolve_ai_quota()` or the webhook's plan write. Those grant access
  only on `active`, `trialing` and `past_due`, so a held purchase grants nothing.
- **Cost, a product call**: a buyer who abandons a 3-D Secure step cannot buy again for
  up to 23 hours. §36 records it.

### 23. Unsigned webhooks are accepted wherever `isProductionRuntime()` is false — P1 (P0 if the preview shares production data), open

- **Where**: `api/stripe-webhook.ts:112-137`. `isProductionRuntime()` (in `api/_lib/stripe.ts`)
  is `VERCEL_ENV === 'production' || NODE_ENV === 'production'`. Without a signing
  secret, anything else trusts the request body.
- **Scenario**: a preview deployment that holds a live `STRIPE_SECRET_KEY` and the
  production Supabase service role, but no `STRIPE_WEBHOOK_SECRET`, accepts a forged
  `customer.subscription.updated` whose `metadata.supabase_user_id` names any user.
  The result is a paid plan for that user.
- **Not verified**: whether `NODE_ENV` is `production` on a preview deployment. Check
  it on a real preview before deciding how severe this is.
- **Suggested fix**: refuse unsigned events whenever `VERCEL_ENV` is set, not only in
  production. `vercel dev` would then need the Stripe CLI secret. This changes preview
  behaviour, so it needs operator sign-off.

### 24. A checkout link overwrites an existing customer link — P2, fixed

- **Where**: `api/_lib/subscriptionSync.ts` (`linkStripeCustomer`, now used by
  `checkout.session.completed` in `api/stripe-webhook.ts`, by the sync-checkout return,
  and by the metadata backfill).
- **Scenario**: a profile already linked to customer C1 completes a checkout for C2.
  Events for C1's subscription then find no profile by customer, and
  `subscription.updated` has only the metadata fallback. §19 covers deletion, not
  updates.
- **Fixed**: the link is written only where the profile holds no customer. A different
  customer is not written over it. The mismatch is written as a `customer_mismatch`
  incident, and the plan is still applied, since the plan is keyed on the user. The
  write is conditional, so two events racing for one profile cannot both win. An
  `already`-linked profile is left alone.
- **Not done, by design**: the portal still opens C1 for that account. Relinking is an
  operator step, recorded in `docs/stripesetup.md` ("When a billing incident is open").
- **Evidence**: `tests/unit/billingIncidents.test.ts`, "linkStripeCustomer" and the
  mismatch case in "applySubscriptionUpsert".

### 25. A seat reduction below the member count is not enforced — P2, open

- **Where**: `api/stripe-webhook.ts` (school sync, `plan_seats: seats`, around line 494).
- **Scenario**: an admin lowers the seats in the billing portal from 40 to 10 while 35
  people are members. All 35 keep the School plan at the price of 10 seats. The
  over-seat warning exists, but only an admin who opens the dashboard sees it.
- **Suggested fix**: refuse decreases below the member count in the portal's
  configuration, or flag the school to admins when the webhook writes a smaller seat count.

### 26. Disputes and refunds are not handled — P2, open

- **Where**: `api/stripe-webhook.ts` (the `default:` branch, around line 196).
- **Scenario**: a card dispute is opened. Stripe does not cancel the subscription, so
  access continues while the merchant loses the disputed amount.
- **Suggested fix**: first, a flag-only `charge.dispute.created` handler that writes a
  reviewer-visible row. Automatic cancellation is a product decision. If the handler is
  added, add the event to `docs/stripesetup.md` as well.

### 27. Checked and found sound (this pass)

- **Grace period**: `past_due` keeps the plan. `unpaid` and `incomplete_expired`
  drop it.
- **Ordering**: `isStaleEvent` covers `subscription.deleted` and `invoice.payment_failed`
  as well as the upserts.
- **Unknown price**: an active subscription on an unlisted price keeps its plan.
- **Pause**: `pause_collection` leaves `status` at `active`, so a paused subscription
  keeps its plan. The portal does not offer pausing today, so this is open only if
  someone enables it.

### 28. A licence reached the buyer, not the school — P1, fixed

`applySchoolPlan` runs inside `refreshSession`, which runs at app load and on
checkout return. The buyer unlocked at once. The other members of the school
stayed locked until they reloaded, and a licence that lapsed left them showing
paid controls that the server would then refuse.

**Fixed** by `usePlanFreshness` (`hooks/usePlanFreshness.ts`), with the decisions
in `utils/planFreshness.ts`. When a signed-in, non-guest person returns to the
tab or the connection comes back, the session is re-read at most once every five
minutes (`PLAN_FRESHNESS_INTERVAL_MS`), and never while a read is in flight. An
unchanged plan is silent: no state update and no toast. A changed plan updates
the plan fields of the copy the app holds (so stats and preferences are left
alone), re-reads the free counter, and is announced once. The wording comes from
the resolved plan, so a teacher whose licence lapses is told the licence ended,
not that they have lost access they still hold.

Not changed: a session refresh rewrites the profile's stats and preferences, as
it did at load, so each throttled check writes once. A refresh that returns no
session is ignored rather than treated as a sign-out, because a background check
should not drop someone to the login screen mid-answer.

### 29. Nothing told a school that it had outgrown its licence — P2, fixed in part

The over-seat warning lived in `UsageDashboard`, which only an admin can open.
`list_schools()` would have answered a teacher, but it returns every school at
once, so it cannot be the teacher's source.

**Fixed** by `my_school_seats()` (schema §13). It takes no school argument and
answers only staff, for the caller's own school. It returns the plan status,
the seat count, the member count and whether the caller bought the licence, and
nothing about the people in it. `components/SeatOverageNotice.tsx` sits beside
the payment alert. When members exceed seats on a live licence it says how many
over, says that the extra people keep School access for now, and offers Manage
subscription to the purchaser only. Other staff are told who bought the licence.

Seats are still not enforced at sign-in. The notice says so, which is accurate;
whether they should be is a product decision, recorded in §5.

### 30. Schools could not pay by purchase order — P1, fixed on the server

A School licence could be bought only by card, and the schools that most need one
pay by purchase order: the head of department raises a PO, the accounts office
pays an invoice weeks later, and nobody in that chain can use a Checkout page.
The licence was unbuyable for the buyer it was built for.

**Fixed on the server** (`claude/school-invoice-server`). A teacher or admin
attached to a school requests a licence to be invoiced (`api/request-invoice.ts`).
A platform admin approves or declines it (`api/issue-invoice.ts`). Approval
creates a `send_invoice` subscription on the school price, finalises and sends
the first invoice, and the existing webhook licenses the school with no change to
it. Requests are kept in `licence_requests` (`supabase/schema.sql` §27), readable
only by the requester and admins, and written only by the service role. The
decision rules live in `api/_lib/schoolLicence.ts`. `SCHOOL_INVOICE_ENABLED=false`
is the kill switch. The operator setup is in `docs/stripesetup.md`, "Invoiced
school licences (purchase orders)".

**The approval queue is built** (`claude/school-invoice-admin`). Pending requests
sit at the top of Needs attention on the admin Billing overview. Approve opens a
confirm step that says what the call will do before it is sent, and the payment
terms are chosen there. An answer that names a Stripe subscription, or no clear
answer at all, withdraws Approve in that window until the request has been read
again: the subscription that exists has to be checked in Stripe first, and a
second approval is not a plain retry. The operator steps are in
`docs/stripesetup.md`, "Deciding a request".

Three choices in the fix are worth keeping, because the obvious version of each
is wrong:

- **Approval refuses rather than guesses.** A school read that fails, a requester
  who has moved school, or a school that already holds a live licence each stop the
  approval before Stripe is called.
- **Seats are refused out of range, not clamped.** A purchase order for three seats
  must not be invoiced for five.
- **A failed send is not tolerated just because the invoice is open.** An open
  invoice may never have been emailed. Only a paid one needs no send.

**What remains open:**

- **The request screen, on the school's side.** The approval screen is built, so an
  admin can now approve and decline from the Billing overview. The school's request
  form and its Pending, Approved and Declined states are a separate change. Until it
  lands, nothing in the app lets a school ask for an invoice.
- **A near-simultaneous second approval.** The live-licence check reads the
  `schools` row, which the webhook writes a moment after the subscription is
  created. Two approvals for one school in that gap are both allowed. Closing it
  needs the approval to check for a just-approved request whose subscription the
  school row does not yet show, or to ask Stripe.
- **Nobody is told a request has arrived. Still open.** The queue now leads the
  Billing overview, so an admin sees a waiting request on opening that page, and a
  request waiting over three working days is flagged. No email or push goes out
  when a request is made. Closing this needs a notification route, which is a
  product decision (an email to the platform admins, or a daily digest).
- **A requester cannot withdraw a request.** The table has a `cancelled` status, but
  no endpoint sets it. A wrong request therefore blocks the school from asking again
  until an admin declines it.
- **Overdue-invoice wording.** The billing banner says "update your payment",
  which is wrong for an unpaid invoice. The overdue wording is not written.
- **ABN on a reused customer.** The ABN is attached only when a customer is created.
  A requester who already has a Stripe customer keeps its tax details as they were.
- **A purchaser-less admin cannot open the portal.** The invoice belongs to the
  requester's Stripe customer, so an admin who bought nothing has no portal to open.
- **Records are not deleted automatically.** The operator deletes them on request
  and sets how long they are kept (see `docs/privacy-for-schools.md`).

### 31. A paying customer could stay locked until the webhook landed — P1, fixed

The return from Checkout polled the profile for about 30 seconds, then told the
customer to "refresh if features stay locked". A refresh cannot help: the plan
was written only by the webhook. A slow delivery, a deploy in flight, a wrong
signing secret, or an endpoint that was never registered left a customer who had
just paid on the upgrade prompt. It is the costliest failure a paywall has, and
the commonest first-deployment mistake.

- **Fixed.** `POST /api/sync-checkout` takes the session id from the return URL and
  asks Stripe about it. It refuses unless the session belongs to the signed-in
  account, is a subscription, is complete and paid, and its subscription is active
  or trialing. The plan comes from the subscription's price, as the webhook derives
  it. The row is written through `api/_lib/subscriptionSync.ts`, which the webhook
  now shares, so the ordering guard is the same code on both paths.
- **Ordering.** The stamp is the time captured before the Stripe call, so a webhook
  event created while that call is in flight still applies. If the apply fails after
  the stamp is written, the stamp is put back, so the webhook's copy of the purchase
  is not discarded as stale.
- **Residual.** A failed restore is logged as `[sync-checkout] could not restore the
  ordering stamp`; in that case the webhook copy of that one purchase can be
  discarded until a later event arrives. The client calls once per return, and each
  call costs one Stripe retrieve.
### 34. Two members of one school can each hold an open licence checkout — P1, open

- **Where**: `api/create-checkout.ts` (the school guard reads the completed licence on
  `schools.stripe_subscription_id`). `checkout_sessions` is keyed on the user, not the
  school.
- **Scenario**: teacher A and teacher B at one school each open a School licence
  checkout. Neither is recorded against the school yet, so both pass the guard, and
  both can complete. Both are charged. The webhook writes whichever arrived last onto
  `schools.stripe_subscription_id`, which is the §16 failure, now in the window before
  either licence is paid.
- **Detected, not prevented**: the apply path writes a `duplicate_school_licence`
  incident when the second licence replaces a live one. That is after both are paid.
- **Suggested fix**: key the open-checkout record on the school as well as the user for
  school prices. A second member's checkout then displaces the first, through the same
  expiry and refusal path. This changes what a teacher sees (a colleague's open checkout
  is expired), so it needs a product decision.

### 35. A transient Stripe failure on expiry leaves the displaced session open — P2, open

- **Where**: `api/_lib/openCheckout.ts`, `expireDisplacedCheckout`.
- **Scenario**: the expiry call fails with a server error, and the follow-up read shows
  the session still open. The purchase proceeds, by the brief's rule that housekeeping
  must not block a purchase. Both sessions are payable for up to 36 minutes. If both
  are paid, the incident catches it after the fact.
- **Suggested fix**: a sweep that expires any recorded session whose displacement
  failed, or a retry on the next checkout. Not built.

### 36. An abandoned 3-D Secure attempt blocks a new purchase for up to 23 hours — product call, open

- **Where**: `HELD_STATUSES` in `api/_lib/openCheckout.ts`; the `PURCHASE_PENDING` wording.
- **Scenario**: a buyer's first payment needs an extra step, and they give up. Their
  `incomplete` subscription holds the account until Stripe expires it, up to 23 hours.
- **Operator option**: cancel the `incomplete` subscription in the Stripe Dashboard, which
  clears the hold at once (`docs/stripesetup.md`, "When a billing incident is open").
  A product decision on whether the wait is acceptable is still needed.

### 37. A teacher with a personal Plus and an invoiced licence is flagged — P3, open

- **Where**: `checkDuplicateSubscriptions` in `api/_lib/billingIncidents.ts`.
- **Scenario**: `api/issue-invoice.ts` stamps an invoiced licence with the requester's
  user id. A teacher who also holds a personal Plus subscription then has two live
  subscriptions, and the detector writes `duplicate_subscription`. The two are different
  products, so this is usually a false positive.
- **Suggested fix**: exclude subscriptions whose `plan` is `school` from the per-user
  count, since the per-school check covers licences. Left as it is for now: a false
  positive costs the operator one look. The exclusion also needs a decision on whether
  a person holding two licences is reported under the person or under the school.

## 5. Still open (not attempted here)

- **Renewals, cancellations, failed payments and seat changes still need the
  webhook.** The return now confirms the first purchase, so a missing endpoint no
  longer locks a buyer out, but it does mean a lapsed subscription goes unnoticed.
  See `docs/stripesetup.md`, Step 4.

- ~~**Open findings from the server-hardening pass (§16 and onwards)**~~: §21 (one open
  checkout per user), §22 (`incomplete` holds a purchase) and §24 (a customer link is
  never overwritten) are **done**, see those sections. What is left from that pass:
  §23 (unsigned preview webhooks) needs the operator to confirm the preview setup;
  §25 and §26 are smaller; and the school in-flight window (§34), the transient expiry
  failure (§35), the 23-hour hold (§36) and the invoiced-licence false positive (§37)
  are new and open.

- ~~**A licence going live mid-session does not reach other members until they
  reload.**~~ — **done**, see §28. Members now re-read their plan when they return
  to the tab, at most every five minutes. The divergence this bullet described
  was safe (the server is authoritative); it is now also short.
- **The School branch of the upgrade prompt is dead code under the shipped
  policy.** Nothing is priced at `school`, so `sellsPlus` is always true. Kept
  because `PLAN_FEATURE_OVERRIDES` can still reach it; worth deleting if that
  lever is ever dropped.
- **Plus and School are feature-identical.** The comparison's only differing row
  is "Who it covers". That is honest, and it is also the whole pitch — worth a
  product decision about whether School should carry something of its own
  (class-scoped analytics is the obvious candidate) rather than a code change.
- **A teacher or admin whose school already holds a licence is still offered
  "Buy N seats".** `SchoolLicencePanel` does not read whether the school is
  licensed, and `stripePlan === 'school'` does not separate a member from a buyer.
  The server now refuses a second licence for the same school (§16 on main), so the
  button leads to a refusal. Seat top-ups need a product decision before the panel changes
  (section 5, gap 1 of `projectDocs/paywall-surface-inventory.md`).
- **Displayed prices are typed into the environment, not read from Stripe.**
  `PLAN_PRICING` comes from `VITE_PLUS_*_PRICE_DISPLAY` and `VITE_SCHOOL_SEAT_PRICE_DISPLAY`.
  If one of them drifts from the Stripe Price, the prompt shows a different amount from the
  one charged. Check each at every price change. Nothing in the UI states whether the
  figures include GST; that needs a decision together with `STRIPE_AUTOMATIC_TAX`.
- **The school-seat checkout return is untested.** The return now confirms the session
  before it polls (§31 on main), but school seats are applied at sign-in, and nothing
  shows that a teacher who buys seats unlocks without signing in again. Needs a
  test-mode school checkout.
- **There is no upgrade route in the header.** The first upgrade a student sees is always
  inside a lock, the counter at zero, the profile or Compare plans.
- ~~**Nothing notices when a school outgrows its licence.**~~ — **done**, see §29.
  Staff are told the first time they open the app in a session, and the admin Billing
  overview lists over-seat schools under "Needs attention". What is still
  open is in the bullets below.
- **`list_schools()` answers teachers for every school.** It is gated on
  `is_reviewer()` (admin or teacher), not on admin alone, so a teacher who calls
  it directly receives every school's name, member count, pooled usage and
  licence state. The dashboard hides the panel from teachers; the function does
  not. Not changed here: it is outside the licence work and the fix is a
  product decision (gate it on `is_admin()`, or leave it and accept that a
  teacher sees the school list). The seat notice does not depend on it.
- **Every signed-in account can read every school's licence columns.**
  `schools_read` is `auth.uid() is not null` and nothing revokes column access,
  so a student can select `stripe_subscription_id`, `plan_seats`, `plan_status`
  and `plan_period_end` for every school through the REST API. The subscription
  id is Stripe's handle for the school's licence. Narrow the policy to the
  caller's own school, or column-grant the licence fields.
- **Non-purchasing staff are told who to ask, not how to act.** The seat notice
  names the purchaser's role but the app cannot say who the purchaser is, and
  only the purchaser can open Manage subscription. Closing it needs either the
  purchaser's name on the licence row or an admin-side seat request.
- **Revenue is not on the admin Billing overview.** The app's display prices
  (`PLAN_PRICING`) are presentation strings, not Stripe amounts, so a total from
  them would be a guess. A monthly-recurring figure needs a price source of truth
  first (the Stripe Price amounts, read server-side, or a price table kept in step
  with them).
- ~~**`sampleAnswers` is the one UI-only gate with a real fix available**~~ —
  **done**, see §15 below. The other three (`advancedQuestions`, `pdfExport`,
  `examMode`) are honestly unfixable at that layer, for the reasons in
  `api/_lib/planPolicy.ts`.
- **`STRIPE_AUTOMATIC_TAX` has still never been exercised against a live
  account.** The August verification could not confirm Stripe's exact failure
  mode with no origin address; the opt-in flag is safe either way, but the
  operator owes a test-mode checkout before flipping it.
- The August pass's out-of-scope list still stands: automatic display-price
  reconciliation, in-app proration, a referral engine, an onshore marking
  engine, class-scoped analytics.
