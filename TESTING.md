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

### All Tests

Run unit tests + E2E tests + coverage:

```bash
npm run test:all
```

## Test Files

### Unit Tests

Located in `tests/unit/`:

- `errorHandler.test.ts` — Error categorization and user-friendly messages
- `dataCloneUtils.test.ts` — Performance-optimized cloning utilities
- `safeJsonParse.test.ts` — Robust JSON parsing from AI responses
- `idbTransactions.test.ts` — IndexedDB transaction management

### E2E Tests

Located in `tests/e2e/`:

- `evaluation-flow.spec.ts` — Critical workflows (evaluate answer, improve, error handling)

## Coverage Reports

After running tests with coverage, view the HTML report:

```bash
npm run test:coverage
open coverage/index.html
```

Coverage targets: **70% minimum** across lines, functions, branches, and statements.

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
