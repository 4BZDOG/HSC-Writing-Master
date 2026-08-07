# Naming, domains, and monetisation strategy

Working notes for productising the app (currently "Writing Studio" / repo
"HSC-Writing-Master"). Everything here is a suggestion, not a decision.

---

## 1. Name candidates

What the name has to do: make sense to a stressed Year 12 student, sound
credible to an English/Science faculty head, and not box the product into
NSW forever (VCE/QCE/IB are natural expansions).

### Front-runners

| Name | Domain ideas | Why it works | Watch out for |
| --- | --- | --- | --- |
| **Band Six** | bandsix.com.au · bandsix.app · band6.au | The single most-wanted phrase in the HSC. Instantly legible to students, parents and teachers. Strong word-of-mouth ("I use Band Six"). | NSW-specific — VCE students chase "study scores", not bands. Fine if NSW-first is the strategy (it is). |
| **Full Marks** | fullmarks.au · fullmarks.app · getfullmarks.com | Universal exam phrase — works across states, subjects and eventually countries. Teacher-friendly. | Generic enough that SEO takes work; check trademark. |
| **MarkMate** | markmate.com.au · markmate.app | Friendly, Australian, and describes the product (a marker that's on your side). Doubles nicely for the teacher market ("your marking mate"). | Slight toy-like tone for school procurement. |
| **Draftmark** | draftmark.au · draftmark.app | Captures the core loop: draft → mark → improve. Sounds like a serious writing tool. | Less emotionally loaded than Band Six. |

### Also considered

- **The Ruthless Marker** (ruthlessmarker.com.au) — memorable, matches the
  in-app marking persona, great for student TikTok/word-of-mouth. Too edgy as
  the *company* name; excellent as the persona/brand-voice inside the product.
- **Scribe / Inkwell / Quill** variants — crowded space, low signal.
- **HSC Copilot** — reads well but "Copilot" is heavily associated with (and
  defended by) Microsoft. Avoid.

### Recommendation

**Band Six** for a NSW-first launch, with **Full Marks** held as the
umbrella brand if/when expanding beyond NSW ("Full Marks — home of Band Six").
Keep "The Ruthless Marker" as the marking persona; it's already a feature and
it's the most shareable thing in the product.

Practical checks before committing (can't be done from here):
1. Domain availability (.com.au and .au require an ABN / Australian presence).
2. IP Australia trademark search (classes 9, 41, 42).
3. App-store / social handle availability (@bandsixapp etc.).

---

## 2. Pricing shape (current code supports this today)

- **Free** — browse everything, 5 evaluations/day, tiers 1–3 questions,
  summary feedback. The hook. *(exists)* The daily count is enforced in the
  database (`consume_evaluation()`, schema §14), spent by the AI proxy on every
  marking call; the localStorage counter in `entitlements.ts` is only there so
  the UI can show "3 of 5 left" without a round trip.

  "Summary feedback" is enforced on the SERVER (`api/_lib/entitlements.ts`):
  the criterion-by-criterion prose, the improvement path and the rewritten
  answer are stripped from a free-tier marking result before it is sent. The
  UI's blur is presentation only — blurred text still sits in the DOM, so it
  is not a paywall. Marks and bands are never redacted, so the summary and
  every stat built on them keep working.
- **Plus (individual)** — A$7.99/month or A$59/year. Unlimited marking, full
  criterion feedback, sample answers at every band, answer upgrades, exam
  simulation and PDF export — the whole individual toolkit. Anchor the yearly
  price against one hour of private tutoring (~A$60–90 in Sydney): "a year of
  unlimited marking for the price of one tutoring hour".
  *(exists; display pricing now shown in the upgrade modal)*

  Plus **also** carries the AI Content Studio, which is what makes the teacher
  staff perk work: a teacher resolves to Plus (`getUserPlan` step 3) and can
  author without buying anything. The studio sat at `school` until the gating
  audit, and the result was a teacher looking at one question with "Generate
  question" locked and "Generate marking guide" open beside it — the same
  feature answering two ways on one screen, because only four of the dozen
  authoring calls carried the plan gate at all.

  Two things follow, and both matter for copy:

  - The **plan** unlocks the studio, but `canUseAiGeneration` (admin + teacher)
    still decides who sees it. A student who buys Plus will never reach the
    authoring tools, so every surface that lists the studio as a Plus perk says
    "teacher accounts" out loud — `PREMIUM_FEATURES.aiContentStudio.perk` and
    the plan-comparison row note. Do not drop that qualifier.
  - **School no longer differs from Plus by feature**, only by coverage. Pitch
    it as "one licence for everyone", not "plus content authoring" — the
    buyer's staff already had that for nothing. `PLAN_TAGLINES` says so.

  Creating a **course or a topic** is narrower still: admin only
  (`canCreateCurriculum`). A course and its topics are the shared skeleton every
  teacher navigates, so a duplicate or a badly-split topic is a mess nobody but
  an admin can tidy. Teachers keep everything below a topic. The route out for
  them is the course-request flow below — not a plan upgrade, and worth saying
  explicitly if a teacher asks why the button is gone.
- **School / faculty licence** — seat-based. Direct seat purchase now exists in
  the upgrade modal for teacher and admin accounts once
  `STRIPE_SCHOOL_PRICE_ID` / `VITE_STRIPE_SCHOOL_PRICE_ID` are set: a seat
  picker (5–1000, clamped both client- and server-side) checks out with the
  seat count as the Stripe quantity, and the webhook syncs
  `schools.plan_status` / `plan_seats` so every member of the buyer's school
  holds the plan. Students and unauthenticated buyers still get the enquiry
  mailto (`VITE_SCHOOL_CONTACT_EMAIL`), and invoicing/PO remains the right
  answer for public schools that cannot pay by card.

  Seats are the billed quantity; membership is **not** capped per login, so a
  school can quietly outgrow its licence. The admin usage dashboard now shows
  seats against member count with an over-seat warning — that is the true-up
  conversation, and it is meant to happen early rather than at renewal.

### Course demand

Admin-only course creation would otherwise leave a teacher whose course isn't
carried with nowhere to go, and their disappointment invisible. A "Can't find
your course? Request it" link sits under the course picker for everyone who
cannot add one themselves, and inside the picker's own empty state prefilled
with whatever they searched for.

Requests land in `course_requests` (schema §21), normalised so spelling
variants of one course are one row, and counted **per person** so the ordering
is genuine demand rather than persistence. The admin dashboard lists them
busiest first with the number of teachers among the requesters and the most
recent note, and a request can be moved to *planned*, *available* or *declined*.

Read it as the roadmap: a course five teachers are waiting for is a better
build than one nobody asked for, and "twelve people are waiting" is a far
better answer to give a requester than "we'll consider it".

### Changing a price

The displayed price and the charged price come from two different places and
nothing reconciles them. Stripe's Price object decides what is billed;
`VITE_PLUS_MONTHLY_PRICE_DISPLAY`, `VITE_PLUS_YEARLY_PRICE_DISPLAY`,
`VITE_PLUS_YEARLY_NOTE` and `VITE_SCHOOL_SEAT_PRICE_DISPLAY` decide what the
upgrade prompt and the plan comparison say. The split is deliberate — it means
a price change needs a redeploy rather than a release — but it also means the
app will advertise the old number indefinitely if only one side is updated, and
the customer finds out at the Stripe checkout page. So, in one sitting:

1. Create the new Price in Stripe (prices are immutable; you make a new one).
2. Update `STRIPE_*_PRICE_ID` **and** its `VITE_STRIPE_*_PRICE_ID` twin.
3. Update the matching `*_PRICE_DISPLAY` string, and `VITE_PLUS_YEARLY_NOTE` if
   the saving it quotes has changed.
4. Redeploy, then open the upgrade prompt and check the stated price against
   the Stripe checkout page.

Existing subscribers stay on the old Price until they are migrated in Stripe —
usually what you want, and worth saying out loud before anyone assumes a price
rise applied itself retroactively.

---

## 3. Making each segment more likely to buy

### Students (self-serve Plus)

- **Show the band moving.** The single most convincing artefact is the user's
  own trajectory: "your average band went 3.2 → 4.1 this term". Surface it on
  the profile and at the moment an upgrade prompt appears. (Stats plumbing
  exists — `user.stats` tracks bands.)
- **Seasonal urgency.** The HSC calendar does the selling: trial exams
  (July–Aug) and the HSC itself (Oct–Nov). Time-boxed offers ("Trials are in
  6 weeks — yearly is A$59") beat evergreen discounts. `allow_promotion_codes`
  is already enabled in checkout, so promo campaigns need zero code.
- **Let the free tier sting at the right moment.** The daily eval limit
  already exists; the moment it bites mid-study-session is the conversion
  moment. The upgrade modal now shows real prices at that moment.
- **Referrals.** "Give a friend a month, get a month" — Stripe promotion
  codes can carry this until a proper referral system exists.

### Teachers

- Teachers already get Plus as a staff perk (`getUserPlan` role fallback) —
  keep that, and note that it is now what carries the AI Content Studio.
  **The teacher is the channel, not the customer**: a teacher who
  uses it to set practice questions brings 25 students with them.
- A teacher asking for a course you don't carry is a *warm lead wearing a
  complaint*. The course-request list is the only place in the product where
  someone tells you what they would use it for; treat a request from a teacher
  as worth more than one from a student, which is why the demand table counts
  them separately.
- Assignment links (teacher picks a question, students open it directly) and
  printable/exportable class reports are the two features school buyers ask
  about first. PDF export is already a Plus feature; a class-assignment link
  is the highest-value roadmap item for this segment.
- Class Insights / Student Progress dashboards (already built for
  moderator/teacher roles) are the demo: lead school conversations with them.

### Schools

- **Sell to the faculty, not the school.** An English or Science faculty head
  with a small budget is a two-week decision; whole-school procurement is a
  two-term decision. Price a faculty licence (e.g. 5 teachers + their classes).
- **Invoice/PO payment.** Non-negotiable for public schools. Stripe Invoicing
  or manual invoicing at first — the enquiry mailto in the upgrade modal
  starts that conversation.
- **Privacy pack.** NSW DoE schools will ask: where's the data stored, what
  does the AI see, is any student writing used for training. A one-page
  answer (Supabase region, AI provider list, no training on student data)
  removes the biggest blocker before it's raised.
- **Pilot terms.** One faculty, one term, free — convert on the evidence the
  dashboards produce (band uplift, engagement). Time pilots to land before
  budget cycles (Term 4 for next-year budgets). Run a pilot with
  `MONETISATION_ENABLED=false` (and its `VITE_` twin) rather than by editing
  the policy: that switch opens every plan gate honestly, the plan comparison
  reports everything as included, and the upgrade prompt refuses to open. The
  daily evaluation meter is separate — raise it in the admin dashboard.

---

## 4. Loop-closing work shipped alongside this doc

- Fixed: purchased plans now actually reach the client (profile fetch was
  dropping `stripe_plan`).
- Fixed: checkout success now polls until the webhook lands and unlocks live.
- Fixed: repeat checkouts reuse the Stripe customer; webhook survives event
  ordering races via subscription metadata.
- Upgrade modal: real prices, yearly-savings note, cancel-anytime copy,
  school-licence enquiry link.
- Profile plan card shows the renewal date.

## 5. The gating audit

- Fixed: the AI Content Studio was enforced on 4 authoring calls out of 15 and
  locked in 2 UI surfaces out of 5. All 15 now carry `__feature`, every surface
  carries the lock, and `tests/unit/planPolicy.test.ts` pins the list.
- Fixed: members of a licensed school were metered at the free tier's AI budget
  (60 calls) while the plan comparison promised 300. `resolve_ai_quota` read
  `profiles.stripe_plan`, which the webhook only ever writes for the person who
  paid; it now honours a live `schools.plan_status` like every other check.
- Fixed: lock chips said "Plus" whatever plan a feature required, so a
  School-priced gate sent the user to a prompt selling something else.
- Fixed: `consume_evaluation()` granted one marking a day even with the
  allowance set to 0 — the guard only covered the increment, not the first
  insert.
- Fixed: `redactPaidFeedback` only blanked a string `revisedAnswer`, so a
  provider returning the structured form handed a free user the whole rewrite.
- Added: the free-tier evaluation allowance is editable from the admin
  dashboard. It was designed to be tunable without a deploy from the day it
  shipped (`set_plan_setting`), but had no control anywhere in the app.
- Added: school licences show seats against members, with an over-seat warning.
- Added: course creation is admin-only, with the course-request queue as the
  route out for everyone else.
- Fixed: the remaining-markings count lived in the Evaluate button's `title`
  attribute, which a phone cannot surface at all — so most of the people the
  limit applies to met it as a refusal after writing an answer and waiting out
  the marking call. It is now a visible chip (`FreeEvalCounter`) that counts
  down live.
- Fixed: the prompt that refusal opens led with "Full Marking Feedback".
  Marking is metered by count and has no feature key, so the limit borrowed
  `fullFeedback`; `requestUpgrade` now carries a `reason`, and the daily limit
  leads with the limit. This is the highest-intent moment in the product and it
  was answering a question nobody had asked.
- Fixed: a guest was offered a checkout that can only 401. They are offered an
  account instead.

### The shape to keep

Three independent gates decide whether something happens, and confusing them is
where every bug above came from:

| Gate | Decides | Lives in |
|---|---|---|
| **Role** | Whether the control exists at all | `utils/permissions.ts` |
| **Plan** | Whether pressing it works or sells | `services/planPolicy.ts` + `api/_lib/planPolicy.ts` |
| **Quota** | Whether there is budget left today | `supabase/schema.sql` §11–14 |

A control needs the right answer from each, and the two plan-policy copies must
agree (`tests/unit/planPolicy.test.ts`). The client's answer is always advisory:
anything the UI merely blurs is readable in devtools, so a gate that matters is
enforced in the proxy or in Postgres as well.
