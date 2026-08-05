# Band 6 — Privacy & data handling (for schools)

A plain-English answer to the questions a NSW school (and the NSW Department
of Education) will ask before approving Band 6 for classroom use. It reflects
how the software is built; a deployment must be configured as described for
these statements to hold. Not legal advice — schools should review against
their own obligations (NSW _Privacy and Personal Information Protection Act_,
the Department's Information Security and third-party app assessment process).

---

## The one-minute version

- **What we store:** an account (email + display name), the student's practice
  writing, their AI marking results, and the usage counters needed to enforce
  quotas and entitlements. The full list is in the table below.
- **What the AI sees:** only the question and the answer text the student
  submits for marking. No name, email, or school is sent to the AI provider.
- **Where it lives:** a Supabase (PostgreSQL) database in the region the school
  or operator chooses, protected by row-level security so a student can only
  read their own data.
- **Where it is processed:** the database can be kept in Sydney, but **the AI
  providers are all offshore** — answer text leaves Australia on every marking
  call. See [Cross-border processing](#cross-border-processing).
- **Training:** on the default provider and every paid API tier, student
  writing is **not** used to train models. One selectable engine — the free
  OpenRouter router — does not carry that guarantee. See
  [Training on student writing](#training-on-student-writing).
- **Deletion:** an account and all its data can be deleted on request.

---

## What data is collected

| Data                                        | Why                                         | Where stored                        |
| ------------------------------------------- | ------------------------------------------- | ----------------------------------- |
| Email address                               | Login identity                              | Supabase Auth                       |
| Display name, username                      | Shown in the app UI                         | `profiles` table                    |
| Practice answers, marks, feedback           | The core product — track progress over time | `responses` table                   |
| Submission history (marks over time)        | Progress graphs and class analytics         | `response_events` table             |
| Saved sample answers, contributed questions | Shared teaching content                     | `sample_answers` / `prompts` tables |
| Streak & XP stats                           | Motivation features                         | `profiles` table                    |
| Subscription plan (if paid)                 | Entitlements                                | `profiles` table (set by Stripe)    |

Note that `username` defaults to the local part of the login email, so for an
`@education.nsw.gov.au` account it is typically the student's name.

No analytics/advertising SDKs are bundled. No third-party trackers.

## What the AI provider receives

Marking, sample-answer and feedback generation send **only the question text
and the student's answer text** to the configured AI provider. The request
carries no student name, email, or school identifier.

All AI calls go through the app's own server-side proxy, so the AI provider
key is never exposed to the browser and the school's traffic is attributable
to one controlled endpoint.

### Cross-border processing

**This is the question a Departmental privacy assessment will ask first, so it
is stated plainly: no AI provider the app can call is hosted in Australia.**
Choosing a Sydney database region keeps _stored_ data onshore; it does not keep
_processing_ onshore. Every marking call sends the student's answer text to an
endpoint outside Australia, in real time, whatever the database region.

The five selectable engines, their endpoints, and the operator's home
jurisdiction:

| Engine                  | Endpoint                            | Operator / jurisdiction                             |
| ----------------------- | ----------------------------------- | --------------------------------------------------- |
| Google Gemini (default) | `generativelanguage.googleapis.com` | Google, United States                               |
| Anthropic Claude        | `api.anthropic.com`                 | Anthropic, United States                            |
| Groq                    | `api.groq.com`                      | Groq, United States                                 |
| OpenRouter              | `openrouter.ai`                     | OpenRouter, United States — **a broker, see below** |
| Kimi K3                 | `api.moonshot.ai`                   | Moonshot AI, China (international endpoint)         |

Two of these need more than a row in a table:

- **OpenRouter is a broker, not a model host.** It forwards each request to
  whichever upstream provider serves the chosen model slug, so the company that
  actually processes the answer text — and the country it sits in — depends on
  the model selected and on OpenRouter's routing at that moment. A school
  cannot enumerate the recipients in advance. Treat OpenRouter as an
  unbounded set of sub-processors unless the deployment pins a specific slug
  and accepts that slug's upstream.
- **Kimi K3 is operated from China**, on both routes to it (directly via
  `api.moonshot.ai`, and via the `moonshotai/kimi-k3` slug through
  OpenRouter). Sending student work to a Chinese-operated service is a
  materially different disclosure from sending it to a US one, and most NSW
  schools will need it approved separately if at all.

**What this means in practice.** A NSW government school assessing this app
should expect to complete a cross-border disclosure under the _Privacy and
Personal Information Protection Act_ (s19 and the Health Privacy Principles'
equivalent), because student answer text is personal information leaving the
jurisdiction. That is a process to follow, not a blocker — it is the same
finding any US-hosted AI marking tool produces. The mitigations already in the
build help the argument: no name, email or school identifier accompanies the
text, and the set of recipients is one endpoint chosen by the operator.

**If offshore processing cannot be approved**, the app is still usable without
it — guest sessions keep everything in the browser, and the non-AI parts of the
product (the question bank, the syllabus browser, saved work) do not call a
provider at all. There is currently no onshore or self-hosted marking engine;
adding one would mean a new provider adapter in `api/_lib/`.

### Training on student writing

For **Gemini, Anthropic, Groq and Kimi on their paid/business API tiers**, the
providers' API terms state that content sent through the API is not used to
train their models. Confirm the current terms for the tier a deployment
actually buys — these terms differ between consumer apps and API access, and
the app only ever uses API access.

**The exception is the free OpenRouter router** (`Free Models Router`, the
zero-cost default for a keyless OpenRouter account). Free models on OpenRouter
are offered on the basis that prompts may be logged and used by the upstream
provider, which is part of why they cost nothing. **Do not select it for real
student work.** It exists for evaluating the app with test content.

## Where data is stored and who can access it

- **Database:** Supabase (managed PostgreSQL). The project region is chosen at
  setup — an Australian region can be selected to keep data onshore.
- **Access control:** Postgres **row-level security** enforces that each
  student can read and write only their own profile and work. Teacher/admin
  roles are granted explicitly by an admin, never self-served.
- **Teachers see their own classes only:** a teacher's access to student work,
  progress and profiles is scoped to the classes they own or co-teach, enforced
  in the database rather than the UI — so it holds for a direct API call, not
  just the app. A teacher with no classes sees nothing. An admin keeps the
  whole-database view. The boundary has negative tests that run in CI against a
  real Postgres (`supabase/tests/rls_negative_tests.sql`).
- **In transit:** HTTPS/TLS everywhere. **At rest:** encrypted by the database
  provider.
- **Payment data:** handled entirely by Stripe (PCI-compliant). Card numbers
  never touch Band 6 servers or the database.

## Retention and deletion

- Data persists while the account is active so students keep their history.
- On a deletion request, the account and its associated rows are removed.
- Guest sessions store data locally in the browser only — nothing leaves the
  device — and clear when the browser data is cleared.

## What a school should confirm at setup

1. **Region** — choose the Supabase project region (e.g. Sydney) if onshore
   storage is required. Note this covers storage only, not AI processing.
2. **Cross-border disclosure** — the AI provider is offshore in every
   configuration (see [Cross-border processing](#cross-border-processing)).
   Complete whatever cross-border assessment the school or Department requires
   before student work is submitted, and record which engine was approved.
3. **AI engine** — pick one deliberately and set it in the admin AI Engine
   selector. Avoid the free OpenRouter router for real student work, and treat
   Kimi K3 as a separate approval (China-operated).
4. **AI provider terms** — confirm the selected provider's current API terms
   cover no-training-on-content for your usage tier.
5. **Accounts** — decide how people get one. There are two working routes:
   - **Single sign-on (recommended).** Enable a provider in Supabase
     (Authentication → Providers) and set `VITE_OAUTH_PROVIDERS` to match. For
     a NSW DoE school that is Microsoft — everyone already holds an
     `@education.nsw.gov.au` Entra account, so signing in provisions the
     profile on first use, there are no passwords for the school to manage or
     reset, and access follows the Department's own account lifecycle.
   - **Email and password.** Users can register themselves and reset their own
     password from the sign-in screen (both send a confirmation email), or an
     admin creates accounts in the Supabase dashboard. Restrict who may
     register with `VITE_ALLOWED_EMAIL_DOMAINS`.

   Either way, decide who holds the teacher/admin roles and who a locked-out
   student contacts.

6. **Consent** — follow the school's normal process for third-party digital
   tools (parent/carer notification where required), including the offshore
   processing disclosure.

## Contact

For a licence, a pilot, or a completed vendor security questionnaire, contact
the address configured as `VITE_SCHOOL_CONTACT_EMAIL` in the deployment
(shown in the app's upgrade prompt as the school-licence enquiry link).
