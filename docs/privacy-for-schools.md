# Band 6 — Privacy & data handling (for schools)

A plain-English answer to the questions a NSW school (and the NSW Department
of Education) will ask before approving Band 6 for classroom use. It reflects
how the software is built; a deployment must be configured as described for
these statements to hold. Not legal advice — schools should review against
their own obligations (NSW *Privacy and Personal Information Protection Act*,
the Department's Information Security and third-party app assessment process).

---

## The one-minute version

- **What we store:** an account (email + display name), the student's practice
  writing, and their AI marking results. Nothing more.
- **What the AI sees:** only the question and the answer text the student
  submits for marking. No name, email, or school is sent to the AI provider.
- **Training:** student writing is **never** used to train any AI model.
- **Where it lives:** a Supabase (PostgreSQL) database in the region the school
  or operator chooses, protected by row-level security so a student can only
  read their own data.
- **Deletion:** an account and all its data can be deleted on request.

---

## What data is collected

| Data | Why | Where stored |
| --- | --- | --- |
| Email address | Login identity | Supabase Auth |
| Display name | Shown in the app UI | `profiles` table |
| Practice answers, marks, feedback, saved samples | The core product — track progress over time | `profiles` table / course data |
| Streak & XP stats | Motivation features | `profiles` table |
| Subscription plan (if paid) | Entitlements | `profiles` table (set by Stripe) |

No analytics/advertising SDKs are bundled. No third-party trackers.

## What the AI provider receives

Marking, sample-answer and feedback generation send **only the question text
and the student's answer text** to the configured AI provider (Google Gemini
by default; an admin may select Anthropic, Groq, or OpenRouter models). The
request carries no student name, email, or school identifier. Providers'
API terms for paid/business use state that API content is **not** used to
train their models; verify the current terms for the provider a deployment
selects.

All AI calls go through the app's own server-side proxy, so the AI provider
key is never exposed to the browser and the school's traffic is attributable
to one controlled endpoint.

## Where data is stored and who can access it

- **Database:** Supabase (managed PostgreSQL). The project region is chosen at
  setup — an Australian region can be selected to keep data onshore.
- **Access control:** Postgres **row-level security** enforces that each
  student can read and write only their own profile and work. Teacher/admin
  roles are granted explicitly.
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
   storage is required.
2. **AI provider terms** — confirm the selected provider's current API terms
   cover no-training-on-content for your usage tier.
3. **Accounts** — decide whether students self-register or the school
   provisions accounts, and who holds the teacher/admin roles.
4. **Consent** — follow the school's normal process for third-party digital
   tools (parent/carer notification where required).

## Contact

For a licence, a pilot, or a completed vendor security questionnaire, contact
the address configured as `VITE_SCHOOL_CONTACT_EMAIL` in the deployment
(shown in the app's upgrade prompt as the school-licence enquiry link).
