---
name: hsc-feature
description: >
  Add or modify features in the HSC AI Evaluator following project conventions.
  Covers the data model, AI service patterns, UI design system, state management,
  and testing requirements specific to this codebase.
category: development
---

# HSC AI Evaluator — Feature Development Skill

Use this skill when adding new functionality, extending AI features, creating UI components, or modifying the data model in the HSC AI Evaluator (v2.2+).

---

## Instructions

### 1. Understand the Data Hierarchy First

Every feature touches one or more levels of the 5-level curriculum tree:

```
Course (root)
  └── Topic
        └── SubTopic
              └── DotPoint
                    └── Prompt (leaf — the practice question)
                          └── SampleAnswer[]
```

All entities have a string `id` from `generateId()` in `utils/idUtils.ts`. Never manually construct IDs or use `Math.random()`. When adding new entity fields, add them to `types.ts` and update the Zod schemas in `utils/dataManagerUtils.ts`.

**`Prompt` is the atomic unit of the app.** Almost every AI feature reads from or writes to `Prompt` fields.

---

### 2. State Management with use-immer

All top-level course state is managed with `useImmer` in `App.tsx` (repo root, **not** `components/App.tsx`). Mutations must use the Immer draft pattern — never assign directly to props passed down from a parent.

```typescript
// CORRECT — mutate via draft inside updateCourse / setData callbacks
updateData(draft => {
  const prompt = findPromptById(draft.courses, promptId);
  if (prompt) prompt.sampleAnswers = [...(prompt.sampleAnswers ?? []), newAnswer];
});

// WRONG — mutating a prop directly causes silent failures with Immer
prompt.sampleAnswers.push(newAnswer);
```

**Array mutation gotcha**: Immer freezes objects, so sort a copy before use:
```typescript
const sorted = [...(prompt.sampleAnswers ?? [])].sort((a, b) => a.mark - b.mark);
```

---

### 3. Adding an AI Feature

#### Choose the right model role, not a hard-coded model

AI engine selection is a **runtime registry**, not a constant. `services/aiModels.ts` defines the available engines (`gemini-flash` → `gemini-3-flash-preview`, `gemini-pro` → `gemini-3-pro-preview`, `claude-sonnet`, `claude-haiku`) and the default role mapping (`basic` → `gemini-flash`, `reasoning` → `gemini-pro`). `services/aiConfig.ts` resolves a **role** to the currently selected provider+model via `resolveTarget(role)`, honouring the admin's engine choice and any non-persistent batch override (`setBatchModelOverride`).

| Task | Role | Reason |
|---|---|---|
| Marking, rubric generation, sample answers | `reasoning` | Needs thinking budget |
| Keyword extraction, scenario generation, quick suggestions | `basic` | Speed-sensitive |

Never hard-code a model string or bypass `resolveTarget` — that's how the selectable-engine feature and batch overrides stay honoured.

#### All provider calls go through the `/api/gemini` proxy

The client never talks to Gemini/Anthropic directly. `services/aiCore.ts` posts to the server-side `/api/gemini` proxy (`api/gemini.ts`), which injects the provider key, authenticates the caller (Supabase bearer token when configured), and **spends one unit of the caller's daily AI quota** before contacting the provider (returns 429 when exhausted). Keep new AI features on this path — do not add a direct SDK call.

#### The circuit breaker is automatic — there is no `apiGuard(fn)` to wrap a call in

`apiGuard` (`services/aiCore.ts`) is a stateful singleton — `export const apiGuard = new ApiGuard()` — not a higher-order function, so it cannot be called as `apiGuard(async () => {...})`. It does not need to be: `generateContentWithRetry` already checks `apiGuard.isBlocked()` before contacting the provider and records success/failure on every attempt (`aiCore.ts:525-587`), so any feature function that goes through it is covered automatically. Write the feature function directly:

```typescript
import { generateContentWithRetry, safeJsonParse } from './aiCore';
import { resolveTarget } from './aiConfig';

export const myNewFeature = async (input: string): Promise<MyResult> => {
  const response = await generateContentWithRetry({
    ...resolveTarget('basic'), // { provider, model } — see §3 above, not a MODELS constant
    contents: [{ role: 'user', parts: [{ text: input }] }],
    config: { responseMimeType: 'application/json' },
  });
  return safeJsonParse<MyResult>(response.text || '');
};
```

`generateContentWithRetry` takes one request object — there is no `(model, prompt)` two-argument form.

#### `safeJsonParse` recovers JSON from the response text — it does not validate the shape

The Gemini API can return markdown fences around JSON. `safeJsonParse<T>()` in `services/aiCore.ts` strips the fences, balances braces, and parses — it returns `T | null` with no shape checking of its own (see the Gotchas entry below). Use it instead of raw `JSON.parse`, then validate the result's shape separately with a Zod schema in `services/aiSchemas.ts` before it reaches the data model.

#### Cache expensive calls

There is no `AICache.getOrFetch`. Check and write around the call yourself with `AICache.get<T>(key)` / `AICache.set(key, data)` from `services/aiCache.ts`, keyed with one of its `generate*Key` helpers (`generateEvaluationKey`, `generatePromptKey`, `generateScenarioKey`, …) rather than a hand-rolled hash — `hooks/useGemini.ts` writes the cache this way after a successful evaluation:

```typescript
void AICache.set(AICache.generateEvaluationKey(prompt.id, answer), result);
```

The TTL is fixed at 30 days inside `AICache`, not a per-call parameter.

---

### 4. Band & Verb Logic

These rules are **enforced everywhere** — never bypass them:

- **Band calculation**: Always use `getBandForMark(mark, totalMarks, cognitiveTier)`. A Band is capped by tier (an "Identify" question can never return Band 6). Do not calculate bands inline.
- **PromptVerb must be uppercase** and must exist in the `PromptVerb` union in `types.ts`. The `commandTerms.ts` data file maps each verb to its tier.
- **The Verb Gate**: If a student's response uses a lower cognitive verb than required, the evaluator caps the band at 50% (Band 3). This logic is in `services/geminiService.ts:evaluateAnswer` and must be mirrored in any custom evaluation path.
- **PEEL structure** is required for 4+ mark questions in sample answers (Point, Evidence, Explanation, Link).

---

### 4b. Roles, Moderation & Quotas (Supabase backend)

The app runs against Supabase when configured and degrades gracefully to IndexedDB/localStorage "mock mode" otherwise. Feature work that touches users, shared content, or AI spend must respect these boundaries:

- **Roles & capabilities**: `UserRole = 'admin' | 'teacher' | 'user' | 'guest'`. Never gate UI on a raw role string — use the helpers in `utils/permissions.ts`: `canCurateContent`, `canModerate` (both admin+teacher), and `isSystemAdmin` (admin only). Teachers get curation + the Review Queue but **not** the system-admin tools (Database Manager, Data Vault, Audit Studio, API monitor, Usage Dashboard). This mirrors the schema's `is_reviewer()` / `is_admin()`.
- **Content lifecycle**: library content (`courses` / `prompts` / `sample_answers`) has a `status`: `private → pending → approved` (plus `rejected` / `archived`). New content starts `private`. Reaching a published status is reviewer-only, enforced by the `enforce_content_status_authority` trigger — the DB is the authority, not the UI.
- **Write path**: always contribute through `services/contributionService.ts` (`savePromptContribution` / `saveSampleAnswerContribution` / `submitToLibrary`), never by writing rows directly. Reviewer approval goes through the gated RPCs (`approve_prompt()` / `reject_prompt()` etc.), surfaced in `components/admin/ReviewQueueModal.tsx`.
- **AI quotas** (schema §11): daily budgets are enforced **server-side** in the proxy. Read/adjust via `services/quotaService.ts` (`fetchMyQuotaStatus`, `fetchRoleQuotas`, `setRoleQuota`, `setUserQuotaOverride`, `fetchUsageReport`) and the admin surfaces (`components/admin/UsageDashboard.tsx`, the API-monitor quota panel). `quotaService` is a display/management convenience layer — it is **not** the enforcement point; never treat a client-side check as the gate.
- **Mock-mode parity**: guard remote-only features with `isCurriculumRemote()` and provide a sensible local fallback/empty state (e.g. the Usage Dashboard shows a "requires Supabase" explainer in mock mode).

---

### 5. Building a Modal Component

Most features are surfaced through modals. Follow the established pattern:

1. Create `components/MyFeatureModal.tsx` — accept `isOpen: boolean`, `onClose: () => void`, plus domain props.
2. Add the modal to `components/AppModals.tsx` so it renders from a single mount point.
3. Wire the trigger into `hooks/useModalManager.ts` — add a state key and open/close helpers.
4. Use the shared `ConfirmationModal` from `components/ConfirmationModal.tsx` for destructive-action confirmations; do not build custom confirm dialogs.

---

### 6. UI Conventions

Apply these Tailwind patterns consistently:

- **Glassmorphism surface**: `bg-surface/80 backdrop-blur-3xl border border-white/10 rounded-2xl`
- **Inlay/input well**: `bg-surface-inset rounded-xl`
- **Cognitive tier colours** (use semantic classes, not raw hex):
  - Tier 1 Recall: `text-red-400 / border-red-500`
  - Tier 2 Describe: `text-orange-400 / border-orange-500`
  - Tier 3 Apply: `text-amber-400 / border-amber-500`
  - Tier 4 Analyse: `text-emerald-400 / border-emerald-500`
  - Tier 5 Discuss: `text-sky-400 / border-sky-500`
  - Tier 6 Evaluate: `text-indigo-400 / border-indigo-500`
- **Haptic buttons**: `hover:scale-105 active:scale-95 transition-transform shadow-lg`
- **Typography**: Interface text → `font-sans (Inter)`; writing/exemplar areas → `font-serif (Newsreader)`; telemetry/marks → `font-mono (JetBrains Mono)`
- **Language**: Strictly British/Australian English — "Analyse", "Programme", "Colour", "Summarise".

---

### 7. Testing Requirements

- **Unit tests** live in `tests/unit/` and use Vitest + Testing Library. Write one for any new pure utility or service function.
- **E2E tests** live in `tests/e2e/` and use Playwright. Add E2E coverage for critical user-facing workflows. Never rely on real Gemini API calls in tests — mock `services/geminiService.ts`.
- **Coverage target**: 70% minimum across lines, functions, branches, statements (`npm run test:coverage`).
- Run the full check suite before committing: `npm run test:all` (lint + unit tests + type-check).

---

### 8. Pre-commit & CI

- Husky runs `lint-staged` on every commit — ESLint + Prettier fix `.ts/.tsx` files automatically.
- If lint fails during commit, fix the errors and commit again. Do not use `--no-verify`.
- CI runs on all `claude/*` branches via `.github/workflows/build.yml`.

---

## Common Patterns

### Add a new field to Prompt

1. Add optional field to `Prompt` interface in `types.ts`.
2. Update Zod schema in `utils/dataManagerUtils.ts` (use `.optional()` for backwards compatibility).
3. Bump `DATA_VERSION` in `utils/storageUtils.ts` and add a migration case in `runMigrations()` if needed for existing data.

### Add a new Gemini generation function

```typescript
// services/geminiService.ts
const aiTarget = (role: 'basic' | 'reasoning') => resolveTarget(role);

export const generateMyThing = async (context: MyContext): Promise<MyResult> => {
  const systemPrompt = `...`; // British/Australian English
  const response = await generateContentWithRetry({
    ...aiTarget('basic'),
    contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
    config: { responseMimeType: 'application/json' },
  });
  return safeJsonParse<MyResult>(response.text || '');
};
```

Then call it from a custom hook in `hooks/` and surface errors with the `useToast` hook.

### Add a new custom hook

```typescript
// hooks/useMyFeature.ts
import { useState, useCallback } from 'react';
import { useToast } from './useToast';

export const useMyFeature = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { showToast } = useToast();

  const run = useCallback(async (input: string) => {
    setIsLoading(true);
    try {
      const result = await generateMyThing(input);
      return result;
    } catch (err) {
      showToast('Generation failed. Please try again.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  return { run, isLoading };
};
```

### Add a new course data field to JSON

1. Update `public/courseData/templateCourseData.json` so the manifest stays valid.
2. Update the manifest at `public/courseData/manifest.json` if the new course file should be discoverable.
3. Validate with the importer in `DataManagerModal` — run the import flow in the browser to confirm no validation errors.

---

## Gotchas

- **Never read an imported value at module scope.** A template literal, object literal or call that dereferences an import at the top level of a module can throw `Cannot access 'X' before initialization` in a production build — Rollup may place the reader and the definer in chunks that import each other, and the reader runs first. Dev, `vite build`, Vitest and the e2e suite are all blind to it; it shows as a blank page on the deployed site. Put the read inside a function. `npm run check:bundle` (real build output) and `npm run check:eager-reads` (sources) guard this in CI — see `projectDocs/bundleSafety.md`.
- **Never import from `App.tsx` directly** — it creates circular dependencies. Shared types go in `types.ts`; shared utilities go in `utils/`.
- **`safeJsonParse` is not a validator** — it only strips fences and parses. Use Zod for actual shape validation on AI output that feeds the data model.
- **IndexedDB is async everywhere** — all `idb` calls in `utils/idbTransactions.ts` return Promises. Forgetting `await` causes silent no-ops with no runtime error.
- **`use-immer` drafts are not JSON-serialisable** — before saving to IDB or sending to an API, call `JSON.parse(JSON.stringify(draft))` or use `structuredClone` to get a plain object.
- **Modal stacking**: Only one modal should be open at a time (managed by `useModalManager`). Nesting modals via local state breaks the close-on-backdrop logic.
- **Band 6 keyword gate**: The Quality Check (`QualityCheckModal`) enforces ≥70% keyword coverage in Band 6 sample answers. If a generated sample fails this, the AI prompt must be adjusted — do not lower the threshold.
- **AI language enforcement**: If Gemini output uses American English ("analyze", "program"), the system prompt in `projectDocs/systemPrompt.md` must explicitly instruct British/Australian spelling for every generation call.

---

## Example Commands

```bash
# Run all checks before pushing
npm run test:all

# Type-check only (fastest feedback loop)
npm run type-check

# Fix lint and formatting in one pass
npm run lint:fix && npm run format

# Run unit tests in watch mode while developing a utility
npm test -- --watch utils/myNewUtil.test.ts

# Run a specific E2E scenario
npx playwright test tests/e2e/evaluation-flow.spec.ts --debug

# Check test coverage for a specific file
npm run test:coverage -- --reporter=text utils/myNewUtil.ts
```
