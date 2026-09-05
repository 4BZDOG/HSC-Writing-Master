# Agreements, onboarding and plan messaging

Everything a student or teacher reads _about_ the product rather than _in_ it:
the user agreement, the quick-start guide, and the free-vs-paid comparison.

The whole thing is built so that changing the words never means changing a
component. If you find yourself editing JSX to fix a sentence, something has
been wired up wrong — the fix belongs in `data/`.

---

## Where the words live

| File                            | Holds                                                                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `data/agreementVersion.ts`      | `AGREEMENT_VERSION` and `QUICK_START_VERSION`, in a module with **no imports** (see below)                                   |
| `services/planLimits.ts`        | The free/paid limit numbers, also **import-free**. `entitlements.ts` re-exports them                                         |
| `data/legalContent.ts`          | The charter (student + teacher), the Terms of Use, the Privacy Notice, the changelog, and the one-line AI marking disclaimer |
| `data/quickStartContent.ts`     | The quick-start tracks (student / teacher / guest) and the power tips                                                        |
| `utils/planComparison.ts`       | The Free / Plus / School table — **derived**, not written                                                                    |
| `services/agreementService.ts`  | Who has to accept, why, and recording it                                                                                     |
| `services/dataRightsService.ts` | Export my data, delete my account                                                                                            |

Components under `components/` render whatever these files contain. They hold
layout and interaction, no copy of substance.

---

## Editing the agreement

### Fixing a typo or clarifying a sentence

Edit the string. Ship it. No version bump — nobody should be re-prompted
because a comma moved.

### Changing what someone is agreeing to

Four steps, in this order:

1. Edit the relevant `body` / `bullets` / `promises` entry.
2. Bump `AGREEMENT_VERSION` in `data/agreementVersion.ts` (re-exported from
   `legalContent.ts`, so existing imports keep working).
3. Add an `AGREEMENT_CHANGELOG` entry at the **top** of the array, with a
   plain-English summary of what changed. Users see this verbatim.
4. Run `npm run test:all`. `tests/unit/legalContent.test.ts` fails the build if
   you bumped the version without a changelog entry.

Every user is then re-prompted on their next visit and shown your changelog
under a "What changed" heading. No SQL, no migration, no deploy dance.

### Adding a section or a whole document

A section is one object pushed into a document's `sections`. A new document is
one object added to `LEGAL_DOCUMENTS` — the reader builds its tab and its
section rail from the data, so nothing else needs to change.

### Deployment-specific details

Publisher name, contact address and governing law come from env
(`VITE_LEGAL_ENTITY_NAME`, `VITE_LEGAL_CONTACT_EMAIL`,
`VITE_LEGAL_JURISDICTION`) and are substituted into the `{{entity}}`,
`{{contact}}` and `{{jurisdiction}}` tokens by `renderLegalText()`.

A test asserts no token survives rendering, so adding `{{newToken}}` without
teaching `renderLegalText` about it fails the build rather than shipping
literal braces to a student.

---

## Who is asked, and why

`agreementPromptReason(user)` returns one of:

| Reason        | When                                             | What the dialog says               |
| ------------- | ------------------------------------------------ | ---------------------------------- |
| `first`       | Never accepted                                   | The charter, plainly               |
| `updated`     | Accepted an older version                        | "We have updated this" + changelog |
| `roleChanged` | Accepted as a student, now staff (or vice versa) | "Your account has changed"         |
| `none`        | Up to date                                       | Nothing — no dialog                |

The `roleChanged` case matters: the staff charter covers student visibility and
moderation, which the student charter says nothing about. A promoted teacher
has not agreed to it just because they agreed to something else.

Records written before `audience` was tracked carry none, and are honoured
as-is — an old acceptance is not invalidated by a field we added later.

**Guests are never blocked.** They see the same charter as a dismissible
notice. A read-only trial that persists nothing server-side is not the moment
to demand a signature.

**Signed-in users are hard-gated**: `App.tsx` does not render
`AuthenticatedApp` at all until they accept, so there is nothing behind the
dialog to reach around it to. There is always a Sign out button — a gate with
no way past it and no way back is a trap, not a consent flow.

---

## Where acceptance is stored

Three copies, deliberately:

1. `profiles.agreement_version` / `agreement_accepted_at` / `agreement_audience`
   (schema §15) — the durable record.
2. The cached user in localStorage / IndexedDB — what the gate reads on boot.
3. React state — so the dialog closes immediately.

The remote write is a **soft patch**, separate from `authService.updateUser`.
A database that has not run §15 rejects the statement, and the cost of that is
one extra re-prompt — not a failed profile save that also loses the user's
display name, preferences and stats.

Admins can see who has accepted in the AI Usage Dashboard, backed by
`agreement_acceptance_report()` (admin-gated in SQL). The panel hides itself
when the RPC is absent rather than reporting a false zero.

---

## The plan comparison must never be hand-written

`utils/planComparison.ts` derives every row from `services/entitlements.ts`. A
marketing table maintained separately from the gates it describes will
eventually lie — usually in the direction of promising something the user does
not get.

To add a row for a new gated feature:

1. Add the key to `PREMIUM_FEATURES` and `PLAN_FEATURES` in `entitlements.ts`.
2. Give it a short label in `ROW_LABELS` in `planComparison.ts`.

That is all. `tests/unit/planComparison.test.ts` asserts that no cell shows a
tick for a plan that does not unlock the feature, and that every gated feature
has a row.

Features the free tier holds _partially_ (question tiers, feedback depth,
sample-answer bands) list their real limit in `FREE_PARTIAL` and render amber.
Showing a bare cross there would be derived-but-wrong: free genuinely gets
Bands 1–3.

---

## Two rules that exist because breaking them shipped a blank page

`data/legalContent.ts` interpolates the real free-tier limits into the Terms.
Originally it imported them from `services/entitlements.ts` and built the
documents at module scope. Both parts were wrong, and the combination took the
whole app down in production:

`EvaluationDisplay.tsx` imports the marking disclaimer from `legalContent.ts`,
so Rollup pulled the content file into the **`workspace`** chunk — while
`entitlements.ts` stayed in the **entry** chunk. Those two chunks import each
other, so `workspace` executed first and read a `const` the entry chunk had not
initialised yet:

```
Uncaught ReferenceError: Cannot access 'Cs' before initialization
    at legalContent.ts
```

`Cs` was the minified `FREE_TIER_EVAL_LIMIT`. Result: a blank page on GitHub
Pages, and **nothing** in dev, Vitest, the build, or the e2e suite — Vite serves
modules unbundled in dev, so the cycle never forms there.

The two rules now enforced by `tests/unit/legalContent.test.ts`:

1. **`legalContent.ts` must not import from `services/entitlements.ts`.** The
   numbers come from `services/planLimits.ts`, which has no imports of its own.
2. **Nothing may read an imported value at module-init time.** The documents are
   built by `getLegalDocuments()` on first call, so every module has finished
   initialising before a limit is read — whatever the bundler does with chunks.

`utils/planComparison.ts` had the same latent bug (`FREE_PARTIAL` / `PAID_FULL`
were module-level objects interpolating those constants) and is now built on
demand too.

**If you add a module that interpolates a shared constant into a string, do it
inside a function.** Module-level is a landmine that only goes off in
production.

This is a project-wide hazard, not an agreements one — the full write-up,
including the two CI checks that now guard it, is in
[`projectDocs/bundleSafety.md`](./bundleSafety.md).

### The same reasoning applies to the versions

`data/agreementVersion.ts` has no imports either, so the Playwright runner
(plain Node, no `import.meta.env`) can read it. Keep it that way: **do not** add
an import to that file, or to `services/planLimits.ts`.

This matters more than it sounds. `contribution-loop.spec.ts` stubs its
personas as established accounts carrying the current `agreement_version`;
without that the gate correctly holds the app at the front door and a spec about
the contribution loop fails for reasons that have nothing to do with it. Any
future e2e that signs a user in needs the same stub.

---

## The AI marking disclaimer

`AI_MARKING_DISCLAIMER` in `data/legalContent.ts` is one constant used in two
places: under the mark on screen, and in the footer of every page of an
exported PDF.

Keep it that way. The agreement makes the point once at sign-up; this is the
version that travels with the mark itself, which is where it does its work. A
band and a mark out of 20 look exactly like a real result, and an exported
report can end up in a folder beside genuine assessment records.

---

## Data rights

The Privacy Notice promises access, export and erasure, so
`services/dataRightsService.ts` provides them, surfaced under "Your data" in
the profile's Settings tab.

- **Export** builds a JSON document of profile, preferences, progress,
  agreement record and saved responses _including the marking on them_.
  Curriculum content is excluded — it is the app's material, not the user's
  personal data, and bundling it buries the part that is actually about them.
- **Deletion** calls `delete_my_account()` (schema §16), which derives the
  target from `auth.uid()`. There is deliberately no user-id parameter
  anywhere in that path. Deleting the auth user cascades to the profile,
  responses and usage rows.

Contributed library content survives with `created_by` nulled: other schools
depend on it, and it carries no personal data once unlinked. **The Privacy
Notice says exactly this** — if you change the cascade behaviour, change the
notice in the same commit.

If the RPC is missing, the client says so and points the user at the contact
address rather than reporting a success that did not happen.

---

## Quick start

`QUICK_START_VERSION` (in `data/agreementVersion.ts`) controls whether the guide
opens by itself. Bump it and
returning users are greeted once more; leave it and only new accounts see it.
It is always re-openable from the header lifebuoy and the profile.

Steps carry an optional `planNote`, which renders **only for users whose plan
lacks the feature**. A teacher, who holds Plus as a staff perk, is never told
that something they already have is a paid extra.

Adding a step with a new icon means adding the key to the icon union in the
content file and the mapping in `components/agreementIcons.ts`; TypeScript and
a test will both point at anything missed.
