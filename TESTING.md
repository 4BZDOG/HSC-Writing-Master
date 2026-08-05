# Testing Guide

This document explains how to run tests in the HSC AI Evaluator project.

## Prerequisites

All dependencies are already installed. If you need to reinstall:

```bash
npm install
```

## Running Tests

### Unit Tests (Vitest)

Run all unit tests:

```bash
npm test
```

Run tests in watch mode (re-run on file changes):

```bash
npm test -- --watch
```

Run tests with UI dashboard:

```bash
npm run test:ui
```

Run tests with coverage report:

```bash
npm run test:coverage
```

### E2E Tests (Playwright)

Run all E2E tests:

```bash
npm run test:e2e
```

Run E2E tests in UI mode (with visual feedback):

```bash
npm run test:e2e:ui
```

Run E2E tests in debug mode (step through execution):

```bash
npm run test:e2e:debug
```

Run specific test file:

```bash
npx playwright test tests/e2e/evaluation-flow.spec.ts
```

### The pre-push gate

```bash
npm run test:all
```

This is **lint + unit tests + type-check** — not E2E, not coverage, and not the
SQL suites below. Run it before pushing; run the others when the change touches
what they cover.

## Test Files

### Unit Tests

Located in `tests/unit/` — over a hundred files, so they are not listed here;
`ls tests/unit` is the index. Names match what they cover
(`safeJsonParse.test.ts`, `proxyAuth.test.ts`, `buildSourcemaps.test.ts`).
`npm run test -- <substring>` runs a subset.

### E2E Tests

Located in `tests/e2e/`, run against a real dev server across several browser
projects (see `playwright.config.ts`; `PW_FAST` narrows them for a PR). Specs
that need a backend intercept Supabase and AI requests with deterministic fakes
rather than hitting anything real — `contribution-loop` runs against a second,
Supabase-configured dev server for that reason.

- `evaluation-flow.spec.ts` — evaluate an answer, improve it, handle errors
- `contribution-loop.spec.ts` — submit → review queue → approve, end to end
- `class-analytics-ranking.spec.ts` — cohort weakness ranked on marks
- `agreement-gate.spec.ts` — the user agreement blocks use until accepted
- `modal-scroll.spec.ts`, `workspace-chrome.spec.ts` — UI regressions

### Database Tests (SQL, against real Postgres)

`npm run test:all` does **not** run these — they need a database, and CI runs
them in their own job (`.github/workflows/build.yml`) against a Postgres
container, applying the compat shim, `schema.sql` and the test grants first.
Both files are also safe to paste into a Supabase SQL Editor: every block runs
in its own transaction and rolls back.

- `supabase/tests/rls_negative_tests.sql` — proves the authorisation boundaries
  hold rather than merely looking right. A privileged action that _succeeds_
  raises and aborts the run, so run it with `psql -v ON_ERROR_STOP=1`.
- `supabase/tests/entitlement_tests.sql` — plan gating and quota enforcement.
- `supabase/tests/ci/03_reapply_guard.sql` — asserts that re-applying
  `schema.sql`, which the docs tell you is safe, does not mutate data.

> **Assert against tables, not only RPCs.** Two separate privacy bugs shipped
> because every test for a scoping change called the scoped _function_. The
> function was scoped; the table policy behind it was not, so one
> `supabase.from(...).select(...)` with the bundled anon key returned
> everything. Any new policy needs a direct-select assertion, negative and
> positive, and it is worth checking a new test **fails** against the old
> policy before trusting it.

## Coverage Reports

After running tests with coverage, view the HTML report:

```bash
npm run test:coverage
open coverage/index.html
```

The thresholds in `vitest.config.ts` are a **regression floor, not a target**:
63% lines / 59% functions / 57% branches / 62% statements, set just below the
measured figure so CI fails when coverage _drops_ rather than failing every run
against an aspiration the project has never met. Ratchet them up as coverage
grows — left too slack, a whole feature can land untested without the gate
noticing.

## Pre-commit Hooks

Before committing, linting and formatting are automatically checked via Husky:

```bash
git commit -m "your message"
# Pre-commit hook runs lint-staged automatically
```

To manually run checks before committing:

```bash
npm run lint
npm run format:check
npm run type-check
```

## Troubleshooting

**Tests fail with "Cannot find module"**

- Ensure `npm install` was run: `npm install`
- Check that TypeScript types are generated: `npm run type-check`

**Playwright tests timeout**

- Ensure dev server is running: `npm run dev`
- Check server is accessible at `http://localhost:3000`
- Increase timeout in `playwright.config.ts` if needed

**Coverage not generating**

- Delete old coverage: `rm -rf coverage`
- Run: `npm run test:coverage -- --run`

**Husky hooks not running**

- Install Husky: `npx husky install`
- Make hook executable: `chmod +x .husky/pre-commit`

## CI/CD Testing

Tests run automatically on:

- Every push to `main`, `develop`, or `claude/*` branches
- Every pull request to `main` or `develop`

See `.github/workflows/build.yml` for the full CI/CD configuration.

## Best Practices

1. **Write tests alongside code** — Tests serve as documentation
2. **Focus on user behavior** — Test what users see/do, not internal implementation
3. **Keep tests isolated** — Each test should be independent
4. **Use descriptive names** — Test names should clearly state what they verify
5. **Avoid hard-coded timeouts** — Use Playwright's intelligent waiting
6. **Mock external APIs** — Never rely on real API calls in tests

## Performance Tips

- Run focused tests while developing: `npm test -- path/to/test.ts`
- Use watch mode to avoid full rebuilds: `npm test -- --watch`
- Run E2E tests in parallel: `npm run test:e2e -- --workers=4`
