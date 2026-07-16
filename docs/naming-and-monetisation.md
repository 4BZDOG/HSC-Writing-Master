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
  summary feedback. The hook. *(exists)*
- **Plus (individual)** — A$7.99/month or A$59/year. Everything unlocked.
  Anchor the yearly price against one hour of private tutoring (~A$60–90 in
  Sydney): "a year of unlimited marking for the price of one tutoring hour".
  *(exists; display pricing now shown in the upgrade modal)*
- **School / faculty licence** — seat-based, invoiced (schools rarely pay by
  card). Stripe Invoicing or a signed PO handled manually at first; the
  `STRIPE_SCHOOL_PRICE_ID` plumbing already exists when ready to automate.
  *(enquiry link now in the upgrade modal via `VITE_SCHOOL_CONTACT_EMAIL`)*

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
  keep that. **The teacher is the channel, not the customer**: a teacher who
  uses it to set practice questions brings 25 students with them.
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
  budget cycles (Term 4 for next-year budgets).

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
