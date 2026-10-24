# Cost model: what the AI costs, and the levels that make each plan profitable

Status: researched and set in October 2026. The prices and allowances below are now the shipped defaults; the
prices also need setting in Stripe (section 6). Re-run `node scripts/costModel.mjs` after any change of price, model,
exchange rate or measured call size; the tables in section 4 are its output.

## 1. The short answer

- **One marking costs about A$0.07** on the default marking model (Gemini 3.1 Pro): about 3,500 tokens in, and about
  1,000 tokens of feedback plus up to 4,096 tokens of thinking out, billed as output at US$12 per million. That is
  roughly three times the figure the admin dashboard assumed. Everything else a student does is cheap by comparison
  (about A$0.006 a call on Gemini 3 Flash).
- **The old prices were too low for the cost.** Across a realistic population (one subscriber in five heavy), yearly
  Plus at A$59 made about 3%, the School seat at A$4 a year lost money, and monthly Plus at A$7.99 made about 38%.
- **The new prices** are Plus at **A$12.99 a month or A$99 a year** (incl. GST) and School at **A$15 per student a
  year** (+ GST). They make 62%, 42% and 62% across the same population.
- **The free tier was the largest exposure.** At five markings and 60 AI calls a day, one free account could cost
  about A$19 a month, more than any plan brings in. The proxy also forwarded whatever model and size the browser
  asked for, so a free account's 60 calls could have gone to the most expensive model with a near-megabyte prompt.
- **What changed in code** (section 5):
  - a server-side cost guard;
  - a cheaper free-tier marking;
  - new prices;
  - lower allowances (free markings 3 a day, students 30 calls, teachers 200, paid plans 150);
  - a correct model registry;
  - an opt-in switch to mark the free tier on Flash.
- **What needs the owner** (section 6): create the new prices in Stripe, and tell existing subscribers.

## 2. Sources (checked 24 October 2026)

| Fact                                      | Value                                                                                                                    | Source                                                                                                                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gemini 3.1 Pro (`gemini-3.1-pro-preview`) | US$2.00 in / US$12.00 out per million tokens (≤200k prompt); US$4 / US$18 above                                          | [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)                                                                                                                                      |
| Gemini 3 Flash (`gemini-3-flash-preview`) | US$0.50 / US$3.00; free tier available                                                                                   | same                                                                                                                                                                                                     |
| Gemini 3.8 Flash (`gemini-3.8-flash`)     | US$0.75 / US$3.75 until 31 Dec 2026, then US$1.50 / US$7.50                                                              | same                                                                                                                                                                                                     |
| `gemini-3.7-flash`                        | Does not exist (3.6 and 3.8 Flash do)                                                                                    | [Gemini models](https://ai.google.dev/gemini-api/docs/models)                                                                                                                                            |
| Thinking tokens                           | Billed as output                                                                                                         | Gemini pricing page ("output price including thinking")                                                                                                                                                  |
| Stripe, Australian domestic cards         | 1.65% + A$0.30 from 1 October 2026 (was 1.7%)                                                                            | [Stripe support notice](https://support.stripe.com/questions/updates-to-card-pricing-in-australia-from-october-2026)                                                                                     |
| Exchange rate                             | A$1 ≈ US$0.694 (early October 2026)                                                                                      | [exchange-rates.org](https://www.exchange-rates.org/exchange-rate-history/aud-usd-2026-10-01)                                                                                                            |
| Vercel Pro                                | US$20 a month (with US$20 usage credit)                                                                                  | [Vercel Pro plan](https://vercel.com/docs/plans/pro-plan)                                                                                                                                                |
| Supabase Pro                              | US$25 a month                                                                                                            | [Supabase pricing guide](https://makerkit.dev/blog/md/saas/supabase-pricing) (third party)                                                                                                               |
| Comparable student apps                   | StudyPulse premium from A$20 a month; AusGrader A$100 a year; MarkMate free plan 10 checks a month                       | [MarkMate comparison](https://www.markmate.education/compare), [AusGrader](https://www.ausgrader.com/blog/best-ai-study-tools-australian-students-2026), [StudyPulse](https://studypulse.education/hsc/) |
| School resources                          | Edrolo A$35 to A$85 per student per subject (a 2025 school letter); Atomi quotes schools on request, A$470 a year direct | [Edrolo letter](https://geelonghigh.vic.edu.au/uploads/Booklists/EDROLO-LETTER-TO-PARENTS.pdf), [Atomi pricing](https://www.getatomi.com/au/pricing)                                                     |

## 3. What was measured, and what is assumed

**Measured.** The marking prompt `evaluateAnswer` builds was captured, with the AI call stubbed, for 169 shipped
questions across every course (one in fifteen), each with an answer of the length its command verb expects:

| Marks | Prompt (characters, median)     | Answer (characters) |
| ----- | ------------------------------- | ------------------- |
| 2     | 10,500                          | 200                 |
| 4     | 12,300                          | 1,000               |
| 6     | 13,500                          | 1,300               |
| 8     | 15,700                          | 2,250               |
| 20    | 21,800                          | 2,250               |
| All   | 13,100 (90th percentile 15,900) |                     |

At about 3.8 characters a token, a median marking sends **3,450 tokens** (4,200 at the 90th percentile). Most of it is
the fixed brief; the rubric and the three sample answers a question carries add 1,000 to 2,000 characters. An answer
upgrade (`improveAnswer`) sends a median 5,300 characters, about 1,400 tokens.

**Assumed.** The output is estimated from the response schema: about 650 tokens of feedback, plus about 350 for the
rewritten answer. Thinking is capped at 4,096 tokens by the marking request; the central case assumes 2,500 (range
1,000 to 4,096). An upgrade is 400 tokens out plus about 1,500 of thinking (Gemini 3.1 Pro thinks by default). A
light call on Flash is 1,500 in and 1,100 out. **The providers return exact token counts on every call, but the
app does not store them** (`ai_model_usage` counts calls only), so the output side cannot yet be measured. Section 7
says how to close that.

**Usage profiles.** A month of use for each kind of account, chosen to bracket real behaviour rather than to predict
it. "Every allowance used" is the ceiling a free account can reach, not an expected case.

## 4. The numbers

#### Cost of one call

| Call                                  | Model          | Cost (AUD)                         |
| ------------------------------------- | -------------- | ---------------------------------- |
| Marking, paid plan (with rewrite)     | Gemini 3.1 Pro | A$0.070 (range A$0.045 to A$0.100) |
| Marking, free plan (no rewrite)       | Gemini 3.1 Pro | A$0.064                            |
| Marking, free plan, if moved to Flash | Gemini 3 Flash | A$0.016                            |
| Answer upgrade                        | Gemini 3.1 Pro | A$0.037                            |
| Light call (briefing, keywords)       | Gemini 3 Flash | A$0.006                            |

#### Net revenue a month, after GST and Stripe

| Plan                          | Net a month |
| ----------------------------- | ----------- |
| Plus monthly, A$7.99 (before) | A$6.83      |
| Plus yearly, A$59 (before)    | A$4.36      |
| Plus monthly, A$12.99 (now)   | A$11.29     |
| Plus yearly, A$99 (now)       | A$7.34      |
| School seat, A$4/yr (before)  | A$0.33      |
| School seat, A$15/yr (now)    | A$1.23      |

#### Monthly cost of each usage profile

| Profile                                        | Usage a month                              | Cost a month |
| ---------------------------------------------- | ------------------------------------------ | ------------ |
| Typical active free student                    | 8 markings, 15 light calls                 | A$0.60       |
| Engaged free student                           | 30 markings, 40 light calls                | A$2.17       |
| Free, every allowance used (5 a day, 60 calls) | 150 markings, 1650 light calls             | A$19.29      |
| Free, every allowance used (3 a day, 30 calls) | 90 markings, 810 light calls               | A$10.52      |
| Typical Plus student                           | 30 markings, 8 upgrades, 50 light calls    | A$2.70       |
| Heavy Plus student                             | 120 markings, 30 upgrades, 150 light calls | A$10.44      |
| Typical licensed student                       | 4 markings, 6 light calls                  | A$0.32       |
| Active licensed student                        | 12 markings, 3 upgrades, 20 light calls    | A$1.07       |

#### Margin a month

| Plan                          | Typical      | Heavy           |
| ----------------------------- | ------------ | --------------- |
| Plus monthly, A$7.99 (before) | A$4.13 (60%) | −A$3.61 (-53%)  |
| Plus yearly, A$59 (before)    | A$1.66 (38%) | −A$6.07 (-139%) |
| Plus monthly, A$12.99 (now)   | A$8.59 (76%) | A$0.86 (8%)     |
| Plus yearly, A$99 (now)       | A$4.64 (63%) | −A$3.10 (-42%)  |
| School seat, A$4/yr (before)  | A$0.01 (3%)  | −A$0.75 (-229%) |
| School seat, A$15/yr (now)    | A$0.91 (74%) | A$0.15 (13%)    |

#### Margin across a population (20% heavy users)

| Plan                          | Margin a month |
| ----------------------------- | -------------- |
| Plus monthly, A$7.99 (before) | A$2.58 (38%)   |
| Plus yearly, A$59 (before)    | A$0.12 (3%)    |
| Plus monthly, A$12.99 (now)   | A$7.05 (62%)   |
| Plus yearly, A$99 (now)       | A$3.09 (42%)   |
| School seat, A$4/yr (before)  | −A$0.14 (-43%) |
| School seat, A$15/yr (now)    | A$0.76 (62%)   |

#### What the free tier costs per conversion

- A typical active free student costs A$0.60 a month on Gemini 3.1 Pro, A$0.22 if free marking moved to Gemini 3 Flash.
- Free costs are covered when 7.0% of active free students convert to monthly Plus (2.5% with Flash marking).

#### Break-even

- Plus monthly, A$7.99 (before): 83 markings a month (each with two light calls).
- Plus yearly, A$59 (before): 53 markings a month (each with two light calls).
- Plus monthly, A$12.99 (now): 137 markings a month (each with two light calls).
- Plus yearly, A$99 (now): 89 markings a month (each with two light calls).
- Hosting, A$64.84 a month, is covered by 8 typical Plus subscribers at the monthly price.

Reading them:

- **The old prices did not cover the AI.**
  - Monthly Plus at A$7.99 was profitable on typical use and lost money on heavy use; a heavy student (four
    markings a day) costs about A$10 a month.
  - Yearly Plus at A$59 roughly broke even: it netted A$4.36 a month, and 53 markings a month used all of it.
  - The School seat at A$4 a year lost money on any student who used it. That was a tenth of what comparable school
    resources charge per subject.
- **The new prices cover typical use comfortably.** Monthly Plus and the School seat are profitable even for a heavy
  user. A heavy yearly subscriber still costs more than A$99 brings in, but across a population the yearly plan makes
  42%.
- **The free tier's cost is real.** At the new monthly price, about 7% of active free students must convert to
  pay for the rest. Marking the free tier on Flash would bring that to about 2.5%.
- **Hosting is small.** About A$65 a month, covered by eight typical Plus subscribers.

## 5. What changed in code (this change)

1. **A cost guard on the AI proxy** (`api/_lib/requestGuard.ts`).
   - **Models:** only the app's own models are forwarded (the registry, pinned by a test). A request naming any
     other model, or none, is refused before anything is spent. A caller using their own key is exempt.
   - **Prompt size:** for a student, a prompt over 80,000 characters is refused. That is more than three times the
     largest the app builds.
   - **Output and thinking:** Gemini output is capped at 16,384 tokens and a thinking budget at 4,096. Teachers and
     admins are exempt from the size limits (syllabus imports are large), and their role is looked up only when it
     matters. The worst a student's call can now cost is about A$0.34, against several dollars before.
2. **Free-tier marking no longer asks for the rewrite.** The server already strips it from a free-tier result,
   so it was output paid for and thrown away. This saves about 9% of every free marking, and nothing the student
   sees changes.
3. **Lower allowances where nobody pays:**

   | Allowance              | Was | Now     |
   | ---------------------- | --- | ------- |
   | Free markings a day    | 5   | **3**   |
   | Student AI calls a day | 60  | **30**  |
   | Teacher AI calls a day | 400 | **200** |
   | Paid plans' AI floor   | 300 | **150** |
   - **Paid plans:** 150 calls is still about thirty full marking sessions a day, which no student needs, and it
     halves what one paid account can cost in a day.
   - **Who these cover:** three free markings a day is still up to 90 a month, against about 10 a month free at
     comparable apps. Thirty calls covers three markings and everything around them; only about 9% of shipped
     questions trigger an AI call just by being opened.
   - **Existing databases:** a one-off step in `schema.sql` moves the student and teacher allowances if they are
     still at the old defaults. It is marked in `plan_settings`, so a re-apply never undoes a value an admin sets
     later.
   - **Changing them:** an admin can still change all three without a deploy. The free markings are
     `set_plan_setting('free_evaluation_limit', n)`; the allowances are set from the AI Usage Dashboard.

4. **The model registry is correct.**
   - **Removed model:** `gemini-3.7-flash`, which does not exist, is replaced by `gemini-3.8-flash`. It was also
     the overload fallback, so that fallback would always have failed.
   - **Corrected price:** Gemini 3 Flash's per-call estimate was five times too low.
5. **An opt-in switch to mark the free tier on Flash** (`FREE_TIER_MARKING_MODEL=gemini-3-flash-preview`).
   - **Default:** off.
   - **Saving:** cuts a free marking from about A$0.064 to A$0.016.
   - **Who it affects:** it never touches a paying caller's marking, or any call that is not a marking. See
     section 7 before turning it on.

## 6. Prices: set in code, still to set in Stripe

The app's fallback prices (`PLAN_PRICING` in `services/entitlements.ts`) are now the new ones. But what a customer is
**charged** is the Stripe Price their checkout uses, and the screens show Stripe's amount once `/api/prices` answers.
Until the Stripe prices change, customers keep being charged, and shown, the old amounts.

| Plan                       | Before | Now                   | Margin across the population                               |
| -------------------------- | ------ | --------------------- | ---------------------------------------------------------- |
| Plus, monthly              | A$7.99 | **A$12.99** incl. GST | 62%; still under StudyPulse's A$20                         |
| Plus, yearly               | A$59   | **A$99** incl. GST    | 42%; about AusGrader's A$100; still the cheaper way to pay |
| School, per student a year | A$4    | **A$15** + GST        | 62%; well under per-subject school resources               |

To finish the change:

1. **Create the prices in Stripe.** In the Stripe Dashboard, add three new Prices to the existing products: A$12.99
   monthly and A$99 yearly for Plus with tax behaviour _inclusive_, and A$15 yearly per seat for School with tax
   behaviour _exclusive_.
2. **Point the deployment at them.** Set `STRIPE_PLUS_MONTHLY_PRICE_ID`, `STRIPE_PLUS_YEARLY_PRICE_ID` and
   `STRIPE_SCHOOL_PRICE_ID`, and their `VITE_` copies, to the new IDs, then redeploy. Remove any
   `VITE_*_PRICE_DISPLAY` override that still names an old price.
3. **Existing subscribers.** They stay on their old price until they are moved. Under the Australian Consumer Law,
   give them notice before a renewing price changes.
4. **The paid allowance is already 150.** It applies to existing subscribers too as soon as the schema is
   re-applied, so mention it in the same notice.
5. **Seat economics.** Set `VITE_AI_COST_PER_CALL_AUD=0.03` so the panel can judge. That is a blended estimate:
   three calls in ten marking, one an upgrade, six light.

## 7. Next steps that would sharpen this

- **Store token counts.**
  - **Why:** every provider response carries `usageMetadata`. Recording prompt, output and thinking tokens beside
    each call in `ai_model_usage` would replace the assumed output sizes above with measured ones.
  - **What:** a schema column and a write after the call.
- **Test Flash on the calibration samples before switching the free tier.**
  - **How:** in the Content Audit Studio, run the calibration samples with Gemini 3 Flash selected and compare the
    marks with Gemini 3.1 Pro's.
  - **When to switch:** if Flash agrees within one mark on nine samples in ten, set `FREE_TIER_MARKING_MODEL`. A
    student who upgrades would then be marked by a different model, so say so in the plan comparison if the marks
    differ noticeably.
- **Consider a lower thinking budget for marking.** Thinking is over half the cost of a marking (2,500 of about
  3,500 output tokens). Halving the budget would cut a marking by about a third, but it is a marking-quality
  decision, to test the same way.
- **Watch the January 2027 change.** Gemini 3.8 Flash doubles in price on 1 January 2027. It is only the overload
  fallback here, so the effect is small. Re-check Gemini 3.1 Pro and 3 Flash at the same time.
