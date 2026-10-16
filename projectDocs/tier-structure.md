# Tier structure

Status: decided on `claude/tiers-and-gating`, October 2026. The owner's brief asked for the
tiers to be structured by audience. This is the one-page account of what each tier is for,
what it gates and why, and what a teacher sees in each situation. The code it describes is
`services/planPolicy.ts` (client), `api/_lib/planPolicy.ts` (server) and `describeAccess()` in
`services/entitlements.ts`.

## The three tiers, by buyer

| Tier            | Buyer                           | Job                                                                                                                                                          | Price today                 |
| --------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| **Free**        | Student                         | "Try it honestly": 5 marked answers a day, summary and band, question tiers 1–3, exemplars to Band 3                                                         | Free                        |
| **Band 6 Plus** | Student or parent               | "Get better, fast": unlimited marking, full feedback, answer upgrades, every exemplar, exam simulation, the student's own progress report, outcome briefings | A$7.99 a month, A$59 a year |
| **School**      | Head teacher or accounts office | "Cover the cohort and run it": Plus for every seat, the class and school reports, seat management, and invoicing against a purchase order                    | A$4 per student per year    |

The shipped prices are display strings (see `docs/stripesetup.md`). They are not read from Stripe.

## Three rules

1. **Gate what costs money, what carries value outside the app, and what is administration.**
   Marking is gated (inference costs money). Exports are gated (they leave the app). Reports for a
   whole cohort are gated (they are what a school hands on, and what leadership asks for). The first
   impression of the write-and-get-marked loop is never gated.
2. **Teachers are the channel.** A teacher holds Plus as a staff perk, so they can author and mark
   without buying. What a licence adds for staff is the cohort reports, which they can pass to the
   head teacher.
3. **Nobody is sold what they already hold, and no student is sold a School licence.** A teacher is
   never offered Plus. A student who hits a School-priced lock is told their school provides it.

## What each plan gates

| Feature                                                              | Plan that unlocks it                     | Notes                                                                                     |
| -------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| Marked answers per day                                               | Plus (metered for Free only)             | Counted in Postgres (`consume_evaluation`).                                               |
| Question tiers 4–6                                                   | Plus                                     | Free sees tiers 1–3.                                                                      |
| Exemplars above Band 3                                               | Plus                                     | Withheld by the database for Free (schema §25).                                           |
| Full marking feedback, answer upgrades                               | Plus                                     | Feedback is redacted server-side for Free.                                                |
| Exam simulation, PDF export of a student's report, outcome briefings | Plus                                     | Outcome briefings are metered by the server.                                              |
| AI Content Studio                                                    | Plus, **and a teacher or admin account** | A role lock. Paying does not give a student the studio.                                   |
| **Class and school reports** (`cohortReports`)                       | **School**                               | The Class report (a teacher's classes) and the School report (an administrator's school). |

**Change for existing teachers.** Until this branch, a teacher's Class and School report PDFs were a
Plus feature, held by every teacher through the staff perk. They are now a School feature. A teacher
with no licence sees the report locked, and a teacher whose school holds a licence keeps it.
`PLAN_FEATURE_OVERRIDES=cohortReports:plus` (and the `VITE_` copy) restores the earlier behaviour.

## What a teacher sees in each situation

`describeAccess('cohortReports', user)` gives one answer per person. The three locked situations:

| Situation                                   | State        | What the prompt says                                                                                                                 | What it offers                                     |
| ------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| **A.** Not attached to a school             | Locked, plan | "School includes Class & School Reports. A school licence covers everyone in the school, so ask an admin to add you to your school." | The copy-a-note kit for the admin. No seat picker. |
| **B.** Attached to a school with no licence | Locked, plan | "School includes Class & School Reports. One licence covers everyone at _school_."                                                   | The seat picker ("Buy 30 seats").                  |
| **C.** Attached, but holds their own Plus   | Locked, plan | As B, plus "Your own Band 6 Plus plan does not include it."                                                                          | The seat picker. Plus is not offered.              |

If the school already holds a licence, the teacher is on the School plan and the report is open. If a
teacher's school licence is held by someone else at the moment they try to buy, the server's 409
(`school_licence_held`) shows its sentence with no purchase button and no portal route, and the
copy-a-note kit appears.

An admin is never locked. A student never sees a School route. A student who presses a School lock
is told to ask a teacher or an administrator.

## Operator levers

- `VITE_MONETISATION_ENABLED=false` (with `MONETISATION_ENABLED=false`) opens every gate.
- `PLAN_FEATURE_OVERRIDES` / `VITE_PLAN_FEATURE_OVERRIDES` moves any feature to another plan. Set both.
- `VITE_STRIPE_SCHOOL_PRICE_ID` switches the School route from an enquiry to a seat purchase.
- `VITE_SCHOOL_INVOICE_ENABLED=false` turns off invoicing against a purchase order. The comparison
  then names card only.

## Known gaps, deliberately left

- Displayed prices are not read from Stripe, and nothing states whether the figures include GST.
- The seat total is not shown in the picker.
- The header has no upgrade route.
- A teacher's copy-a-note kit names the school by the name on their account, which is set at sign-in.
