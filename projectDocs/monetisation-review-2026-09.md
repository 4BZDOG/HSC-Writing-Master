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

Eight findings, seven fixed here, one deliberately left. Full suite green:
lint, 2529 unit tests across 256 files, both type-checks, the eager-read and
dead-code guards.

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

### 8. AI-quota messages still say "midnight UTC" — left as is, deliberately

`utils/quotaWarnings.ts` and the proxy's 429 body describe the **AI call
budget**, not the paywall. Different meter, different audience: the copy ends
"ask an admin if you need more", and an admin reading a dashboard that says
"Budgets reset at midnight UTC" wants the server's clock, not the browser's.
The server cannot know the caller's timezone anyway. Noted here so the
inconsistency is a decision rather than an oversight.

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

## 4. Still open (not attempted here)

- **A licence going live mid-session does not reach the client until sign-out.**
  `authService` stamps `stripePlan: 'school'` at sign-in; the server resolves it
  per request. The divergence is safe (the server is authoritative and the more
  generous of the two) but a student whose school buys a licence during a
  lesson keeps seeing locks until they reload.
- **The School branch of the upgrade prompt is dead code under the shipped
  policy.** Nothing is priced at `school`, so `sellsPlus` is always true. Kept
  because `PLAN_FEATURE_OVERRIDES` can still reach it; worth deleting if that
  lever is ever dropped.
- **Plus and School are feature-identical.** The comparison's only differing row
  is "Who it covers". That is honest, and it is also the whole pitch — worth a
  product decision about whether School should carry something of its own
  (class-scoped analytics is the obvious candidate) rather than a code change.
- The August pass's out-of-scope list still stands: automatic display-price
  reconciliation, in-app proration, a referral engine, an onshore marking
  engine, class-scoped analytics.
