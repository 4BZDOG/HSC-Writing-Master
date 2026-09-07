# Plan — Deployment Readiness

**Status**: partly done. Items marked ✅ shipped with the deployment-docs review;
the rest are proposals, each with the reasoning for and against, because two of
them are judgement calls rather than fixes.

**Scope**: what stops a deployment of this app going smoothly. Not features, not
performance — only the gap between "the build is green" and "a student can get
an answer marked, and nobody is quietly spending my provider budget."

---

## The problem this addresses

Almost every environment variable in this app is optional, and the app is
deliberately built to keep working when one is missing. That is a good design:
it is what makes mock mode, offline hosting and a keyless GitHub Pages demo
possible, and it is why a half-applied database schema fails open rather than
bricking AI for a whole school mid-lesson.

The cost is that a half-finished configuration does not announce itself. It
builds green, serves a working-looking UI, and is wrong in a way you find out
about from a provider bill, a privacy incident, or a student who cannot sign in.
The documentation was already unusually good about _naming_ each of these traps
in prose. What was missing was anything that **checked**.

---

## Done ✅

### 1. `npm run check:deploy` — a deployment preflight

`scripts/checkDeployment.mjs`, tested in `tests/unit/checkDeployment.test.ts`.

Two modes in one command:

- **Configuration audit** (no arguments). Reads `.env.local` and the process
  environment and reports the combinations that fail quietly: a `VITE_` half
  without its unprefixed twin (plan overrides, the monetisation switch, Stripe
  price ids, free-tier feedback), client-side Supabase without the server-side
  pair, the two Supabase pairs naming different projects, a service-role key in
  the anon slot, a provider key carrying a `VITE_` prefix, a Stripe key with no
  webhook secret, a wildcard in `ALLOWED_ORIGIN`, a malformed
  `DEPLOY_BASE_PATH`, demo accounts alongside real ones, and a plan override the
  policy parser would silently ignore.
- **Live probe** (`-- --url https://…`). Fetches the deployed site: does it
  load, do the assets it references resolve (a broken base path serves fine HTML
  and 404s every script — a blank page with nothing readable in it), is the
  bundled curriculum served, what does an _unauthenticated_ POST to
  `/api/gemini` get back, and does CORS allow the frontend's origin.

It is advisory, not a gate. It reads configuration, not behaviour.

**Design note.** The tests are the load-bearing half. A preflight that fires on
a legitimate configuration is one people learn to skip, so the suite pins the
three real shapes this repo deploys in — Vercel production, the Pages build the
workflow actually produces, and a keyless mock-mode dev setup — as
_must-not-complain_ cases.

### 2. The `cp .env.example .env.local` trap

`.env.example` shipped illustrative values rather than blanks
(`VITE_SUPABASE_URL=https://your-project.supabase.co`), and `README.md` told you
to copy the file. Every placeholder is truthy, and truthy is all
`isSupabaseConfigured` checks — so following the documented first step produced
an app that believed it had a Supabase project and tried to authenticate
against one that does not exist.

Everything except `GEMINI_API_KEY=` is now commented out, with the reasoning at
the top of the file. A copied template now yields a working mock-mode dev setup
and two accurate warnings from `check:deploy`.

### 3. Three npm scripts that could never have run

`backup`, `cleanup:storage` and `check:api-health` pointed at
`scripts/backup.js`, `scripts/cleanup-storage.js` and
`scripts/check-api-health.js`. None of those files has ever existed in this
repository. Removed.

If any of them is genuinely wanted, they are worth writing rather than
resurrecting as names: a Supabase backup script is the one with a real claim,
since `## Rolling back` in `DEPLOYMENT.md` has to tell operators to take a
manual backup before a schema change.

### 4. `engines: { node: ">=20" }`

Every workflow pins Node 20 and `vercel.json` assumes it; nothing declared it,
so a contributor or a self-hosted runner on Node 18 found out from a syntax
error. `npm` warns on a mismatch and Vercel reads the field directly.

### 5. Documentation

- `DEPLOYMENT.md` gained the four things it was missing: links to the
  step-by-step guides it never referenced (`VERCEL_SETUP.md`,
  `SUPABASE_SETUP.md`, `stripesetup.md`, `supabase/README.md`), an ordered
  runbook, an **After you deploy** verification section, and **Updating**,
  **Rolling back** and **Troubleshooting** sections. The environment-variable
  reference now covers Groq, Kimi, `VITE_STATIC_HOSTING`, the account-restriction
  variables, the legal identity variables and `BUILD_SOURCEMAPS`.
- `supabase/README.md` said "**Status:** scaffolding only. These files do **not**
  change the running app yet" — contradicted by the ✅ markers in the same file
  and by the entire `services/` layer. Corrected, along with three `courseData/`
  paths that should read `public/courseData/` (where `seed.mjs` and the build
  both look).
- `projectDocs/VERCEL_SETUP.md` closed by recommending `VITE_SENTRY_DSN` for
  error tracking, which does nothing — see below.

---

## Proposed

### 6. Decide what to do about Sentry — **needs a decision, not a fix**

`@sentry/react` is a dependency. `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT`
and `VITE_SENTRY_RELEASE` are declared in `vite-env.d.ts` and were documented in
three places. **No module imports Sentry and nothing reads a DSN.** Setting one
buys nothing: an unhandled error reaches `components/ErrorBoundary.tsx` and goes
no further than the user's own console — which, for a tool used in classrooms by
people who will not open devtools, means production errors are invisible.

Two honest options:

**(a) Wire it up.** ~30 lines in `index.tsx`, guarded on the DSN so a build
without one is unchanged, plus `Sentry.ErrorBoundary` around the existing
boundary. Consequences worth weighing before doing it, not after:

- **Privacy.** This app holds student writing. Sentry's default
  `beforeSend` will happily ship a stack frame's surrounding state, breadcrumbs
  including input values, and the URL — which carries course/question ids. For
  an `@education.nsw.gov.au` deployment that is a third-party data flow a
  privacy assessment will ask about, so it needs a scrubbing `beforeSend`,
  `sendDefaultPii: false`, and an entry in `docs/privacy-for-schools.md`.
- **Region.** Sentry's default ingest is US. Their EU region exists; there is no
  Australian one.
- **Source maps.** Useful Sentry output needs them, which means
  `BUILD_SOURCEMAPS=true` — and then the deploy publishes `dist/assets/*.map`,
  handing out the full commented TypeScript, because nothing in the repo deletes
  them. See item 7; that has to land first.

**(b) Drop it.** Remove `@sentry/react`, the three `vite-env.d.ts` declarations
and the remaining mentions. Honest, smaller, and loses nothing that exists
today.

**Recommendation: (b) now, (a) as a deliberate project later.** The dependency
is not earning its place, and dead configuration that looks live is worse than
no configuration — an operator who sets a DSN reasonably concludes they have
error tracking. Doing (a) properly is a privacy exercise, not a wiring exercise,
and it should not be smuggled in as a deployment tidy-up.

Interim: `.env.example` and `VERCEL_SETUP.md` now say plainly that it is not
wired up.

### 7. Delete source maps after the build, when they are enabled

`BUILD_SOURCEMAPS=true` writes `dist/assets/*.js.map`, and every deploy path
publishes `dist/` wholesale. `sourcemap: 'hidden'` only drops the
`//# sourceMappingURL` comment; the file is still served at a URL derived from
the bundle name. `tests/unit/buildSourcemaps.test.ts` and the `vite.config.ts`
comment both spell this out, and both end with "nothing in the repo does that
for you yet."

Proposal: a `postbuild` step (or a Vite `closeBundle` hook) that, when
`BUILD_SOURCEMAPS=true`, refuses to leave maps in `dist/` unless an explicit
`KEEP_SOURCEMAPS_IN_DIST=true` is also set. Small, and it turns a documented
footgun into an impossible one. Prerequisite for item 6(a).

### 8. Run `check:deploy` in CI against the preview deployment

`.github/workflows/vercel-deploy.yml` captures the preview URL into
`$PREVIEW_URL` and then does nothing with it. Adding
`npm run check:deploy -- --url "$PREVIEW_URL"` after the deploy step would catch
an open proxy or a broken base path on the pull request that introduced it
rather than in production.

Caveat worth stating: preview deployments legitimately differ from production
(Vercel protects them, and a project may set variables per-environment), so this
should start as a **non-blocking** step that annotates the run. Making it a gate
before knowing its false-positive rate is how a check gets disabled.

### 9. A Supabase backup script

`DEPLOYMENT.md` → **Rolling back** has to tell operators that schema changes do
not roll back and that they should take a backup first — with no tooling to do
it. `supabase/export.mjs` exports approved _curriculum_ only; it does not touch
`responses`, `profiles`, `classes` or billing state, which is exactly the data
whose loss would matter.

This is a real gap for a deployment holding student work, and it is larger than
a deployment tidy-up: it needs a decision about what is backed up, where it is
stored, and under what retention — all of which are privacy questions in an
`@education.nsw.gov.au` context. Flagged rather than designed here.

### 10. Retire or archive the superseded root docs

`DeploymentPlan.md`, `DeploymentOptimization.md` and `VercelDeployment.md` are
each ~200–900 lines carrying prominent "superseded, do not follow" banners.
Someone has already done the careful work of making them safe; the remaining
cost is that the repository root offers five deployment-shaped documents, four
of which are wrong. `PHASE3_COMPLETION.md` and `SESSION_SUMMARY.md` have no
banner and both claim Sentry error tracking ships.

Proposal: move all five to `docs/archive/` and leave `DEPLOYMENT.md`,
`VERCEL_SETUP.md`, `SUPABASE_SETUP.md` and `stripesetup.md` as the live set.
Deliberately not done here — it is a large, purely-organisational diff, and
where historical documents live is the repository owner's call.

---

## Not proposed, and why

- **Porting the proxy to Netlify/Cloudflare function formats.** The docs are
  clear that this is unported, and Vercel is the recommended host. Porting adds
  a second serverless surface to keep in sync with `api/_lib/` — including the
  auth gate and the quota accounting — for a host nobody has asked for.
- **Making `check:deploy` part of `test:all`.** `test:all` runs on every commit
  and in CI, where there is no deployment configuration to audit; it would warn
  on every run and teach people to ignore it. It belongs at the moment you
  deploy, which is where `DEPLOYMENT.md` now puts it.
- **Failing the build when Supabase is unconfigured.** That would break mock
  mode, the Pages demo and `npm run dev` for anyone without a backend — the
  configurations the app is deliberately built to support. The preflight warns;
  it does not decide.
