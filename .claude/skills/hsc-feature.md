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

All top-level course state is managed with `useImmer` in `components/App.tsx`. Mutations must use the Immer draft pattern — never assign directly to props passed down from a parent.

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

#### Choose the right model

| Task | Model constant | Reason |
|---|---|---|
| Marking, rubric generation, sample answers | `MODELS.REASONING` (`gemini-3-pro-preview`) | Needs thinking budget |
| Keyword extraction, scenario generation, quick suggestions | `MODELS.BASIC` (`gemini-3-flash-preview`) | Speed-sensitive |

The constants live at the top of `services/geminiService.ts`. Never hard-code model strings.

#### Wrap every API call in apiGuard

```typescript
import { apiGuard, generateContentWithRetry } from './aiCore';

export const myNewFeature = async (input: string): Promise<MyResult> => {
  return apiGuard(async () => {
    const response = await generateContentWithRetry(MODELS.BASIC, prompt);
    return safeJsonParse<MyResult>(response.text());
  });
};
```

`apiGuard` is the circuit breaker — it tracks error rates and throws `QuotaExceededError` when the API is unhealthy. Skipping it can cause API lockout.

#### Use `safeJsonParse` for all AI JSON output

The Gemini API can return markdown fences around JSON. `safeJsonParse<T>()` in `services/aiCore.ts` strips them and validates the shape. Always use it instead of `JSON.parse`.

#### Cache expensive calls

Wrap long-running generations in `AICache.getOrFetch(cacheKey, ttl, fn)` from `services/aiCache.ts`. The cache TTL is 30 days by default. Use a deterministic key (e.g., `hash(promptId + verb + marks)`).

---

### 4. Band & Verb Logic

These rules are **enforced everywhere** — never bypass them:

- **Band calculation**: Always use `getBandForMark(mark, totalMarks, cognitiveTier)`. A Band is capped by tier (an "Identify" question can never return Band 6). Do not calculate bands inline.
- **PromptVerb must be uppercase** and must exist in the `PromptVerb` union in `types.ts`. The `commandTerms.ts` data file maps each verb to its tier.
- **The Verb Gate**: If a student's response uses a lower cognitive verb than required, the evaluator caps the band at 50% (Band 3). This logic is in `services/geminiService.ts:evaluateAnswer` and must be mirrored in any custom evaluation path.
- **PEEL structure** is required for 4+ mark questions in sample answers (Point, Evidence, Explanation, Link).

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
export const generateMyThing = async (context: MyContext): Promise<MyResult> => {
  return apiGuard(async () => {
    const systemPrompt = `...`; // British/Australian English
    const response = await generateContentWithRetry(MODELS.BASIC, systemPrompt);
    return safeJsonParse<MyResult>(response.text());
  });
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

1. Update `courseData/templateCourseData.json` so the manifest stays valid.
2. Update the manifest at `courseData/manifest.json` if the new course file should be discoverable.
3. Validate with the importer in `DataManagerModal` — run the import flow in the browser to confirm no validation errors.

---

## Gotchas

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
