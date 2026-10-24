# Seat economics: what the report measures, and what it cannot tell you

The admin Billing overview has a **Seat economics** panel. It turns the AI usage the app already counts into the evidence for one decision: whether a School seat (A$4 a year, per the display price) can cover the AI calls a member makes, or whether the school allowance should be pooled or lowered. It changes nothing. No quota, limit or price is read for writing and none is set.

The report is built from `public.school_seat_usage()` (schema §30), a read-only admin function, and the arithmetic in `utils/seatEconomics.ts`.

## What it measures

- **Calls, from the quota counter.** Each member's daily calls are the `ai_usage` rows (schema §11): one row per user per UTC day. The window is 30 or 90 days, ending today.
- **Only live licences.** A school is reported when its licence is `active`, `trialing` or `past_due`, the same grace the entitlement check gives. A cancelled or lapsed school is left out.
- **Per school:** paid seats, members, active users (people with at least one call in the window), calls per seat per day, average calls per active user-day, the 95th percentile and the maximum calls in one user-day, the number of user-days at 100 calls or more, and seats unused (seats minus members, never below zero).
- **Totals across all licensed schools,** with the same measures. The 95th percentile and the maximum are taken over the combined user-days, not averaged across schools.

## What it does not measure

- **Money.** The database holds no price per call. The panel multiplies calls by a cost you enter (see below). Without it, the panel shows calls only.
- **Model.** Calls are not split by model. A per-model tally exists (`ai_model_usage`, the UsageDashboard's cost breakdown), but this report does not use it.
- **Membership history.** A call is counted for the school its caller belongs to today, across the whole window. A member who joined last week has earlier calls counted for the school, and one who has since left is dropped. The schema keeps no history of school membership, so this cannot be corrected after the fact. For a decision it is usually close enough, because school membership changes slowly; check it if a school has had heavy churn.
- **Whether the usage is wanted.** A heavy user may be a teacher preparing a whole class or a student who is stuck. The report says how much, not why.
- **Failed or retried calls.** It counts what the quota counted. Whether a failed provider call still used a unit is a question for `consume_ai_quota()`, not this report.

## How to estimate the cost per call

Until a month of real spend is in, use **`VITE_AI_COST_PER_CALL_AUD=0.03`**. That is the blended estimate from
`projectDocs/cost-model.md`: a marking on Gemini 3.1 Pro costs about A$0.07, a light call on Flash about A$0.006, and
a school member's calls are taken as three markings, one upgrade and six light calls in every ten. At that figure the
A$4 seat is a loss on any member who uses it; the cost model proposes A$15. Replace it with the measured figure below
once you have one.

Set `VITE_AI_COST_PER_CALL_AUD` in the build (for example in Vercel's environment variables, then redeploy, because it is a `VITE_` value read at build time). It is the cost of one call in AUD:

1. Take the **total AI spend for one month** from the provider invoice (all the models you pay for, in the same currency or converted at the invoice's rate).
2. Take the **total calls for the same month**. The AI usage dashboard in the admin console shows the calls; sum them for the month, across all users. Make sure the calls are for the same month as the spend. Billing periods rarely line up with calendar months, so use the invoice's period.
3. Divide spend by calls. Set the result as the variable, for example `VITE_AI_COST_PER_CALL_AUD=0.01`.

Two cautions. The average is blended across models, so it will understate the cost of a heavy user on an expensive model and overstate the cost of a light one. And a figure from a quiet month can be far off a busy one, so re-estimate after a change of model or price, and use the same window for spend and calls.

## How to read the verdicts

The panel projects the cost of a seat over a year as **calls per seat per day × 365 × cost per call**, then compares it with the seat price:

| Verdict                 | Rule                                             | Plain meaning                                                    |
| ----------------------- | ------------------------------------------------ | ---------------------------------------------------------------- |
| **Healthy**             | Cost at most half the seat price                 | The average seat covers its AI cost with room to spare.          |
| **Thin margin**         | Cost more than half, and at most the whole price | The average seat still covers its cost, but little is left over. |
| **Loss**                | Cost more than the whole seat price              | The average seat costs more in AI calls than it pays.            |
| **No cost set**         | `VITE_AI_COST_PER_CALL_AUD` unset                | Not judged. Calls are shown only.                                |
| **No price to compare** | The seat price cannot be read                    | Not judged. Check `VITE_SCHOOL_SEAT_PRICE_DISPLAY`.              |

The average can hide the heavy user. The panel also projects a **heavy user** a year: the 95th percentile of calls in one user-day, every day of the year, times the cost per call. A school can read as healthy on average and still have a seat that loses money once the heavy user is on it. Read the average for the school's typical position and the heavy-user column for the worst case.

A school with no seats has no per-seat figure and shows "No cost set" or "No price to compare" rather than a verdict.

Verdicts use the display price, not Stripe's. The display price is typed by hand (`VITE_SCHOOL_SEAT_PRICE_DISPLAY`, see the handoff). If the Stripe price changes and the display does not, the verdicts are wrong without any warning.

## The decisions, and what data would justify each

There are three options. They are not exclusive, and none is recommended here. The data below says what would have to be true, not what to pick.

### 1. A pooled school allowance

Set a daily pool for the school with the existing mechanism (`set_school_ai_quota`, the school's `daily_ai_limit`, schema §12). Members keep their personal limit, and a call must fit under both.

- **Trade-off.** It caps the school's total spend, whatever one member does. But one heavy member can use up the pool for everyone, so the cap has to be shared out in practice, and a school that outgrows it will hit a wall on a school day.
- **Data that would justify it.** The school's combined calls per day sit well under the pool you would set, with the heavy users' peaks absorbed inside it. The user-days at 100 calls or more make up a large share of the school's calls, which means a few members drive the spend and a pool would target them. Check the 30-day and 90-day windows agree; one busy fortnight is not a pattern.

### 2. A lower per-seat cap for the School plan

Licensed members currently get at least the 300-call daily floor (`resolve_ai_quota`, schema §13). Lowering that floor for school members caps the spend per seat.

- **Trade-off.** Each seat's cost becomes predictable, but the paywall copy says "No daily limit" for paid plans (see `projectDocs/monetisation-review-2026-09.md`, finding 32), so the copy and the plan comparison would both have to change, and a member who reaches a lower cap has a reason to complain on a school's first assignment day.
- **Data that would justify it.** Few user-days reach the proposed cap. If the share of user-days at or above it is small, most members never notice it, and the heavy-user column falls to a figure the seat price covers. Look at the maximum calls in one user-day too: a cap set below the maximum but above nearly everyone is a judgement call, not a measurement.

### 3. A higher seat price

Change the seat price (the Stripe price, and `VITE_SCHOOL_SEAT_PRICE_DISPLAY`, which must match it).

- **Trade-off.** It fixes the margin on every seat without touching how the app behaves. But a price rise can lose a school's purchase, and a per-seat price is the number a school's accounts office compares; the report cannot show that response.
- **Data that would justify it.** The school's average cost per seat is close to the price, and the heavy-user cost sits above it on many licences, so a price that covers the heavy user would be the one that holds across the seats. The report can give the cost side of that figure. It cannot show whether schools will still buy at it, so that needs a sales test, not this panel.

## Limits of this report, and what would make it better

- The cost per call is a blended average set by hand. A per-model cost from the usage dashboard (which already estimates cost per model) would be more accurate and is the natural next input.
- Membership is today's. A dated membership record would fix the history.
- The report is a snapshot of counts and does not record a history, so a trend needs a screenshot or a note each month.
