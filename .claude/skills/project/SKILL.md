---
name: project
description: >
  Orientation skill for the HSC AI Evaluator. Read this first when starting
  any task in this repository — covers what the app is, the tech stack,
  where things live, and the commands and conventions that apply to all work.
category: project
---

# HSC AI Evaluator — Project Skill

An AI-powered assessment tool for NSW HSC teachers and students. It turns NESA
syllabus content into exam-style questions with marking rubrics, then marks
student responses like a senior HSC marker using Google Gemini (with an
optional Claude engine via the admin AI Engine selector).

## Stack

- **Frontend**: React 19 + TypeScript + Vite, Tailwind CSS, `use-immer` for state
- **AI**: `@google/genai` via a server-side proxy (`api/gemini.ts`) — API keys are never bundled client-side
- **Storage**: Offline-first IndexedDB (`idb`); optional Supabase for multi-user auth and shared backend
- **Validation**: Zod schemas; **Testing**: Vitest (unit) + Playwright (e2e)

## Where things live

| Path | Purpose |
|---|---|
| `App.tsx` | Top-level state (useImmer) and composition root |
| `components/` | UI — mostly modals, mounted via `AppModals.tsx` |
| `hooks/` | Custom hooks (`useModalManager`, `useGemini`, `useToast`…) |
| `services/` | AI layer (`geminiService`, `aiCore` circuit breaker, `aiCache`), auth, Supabase |
| `api/` | Vercel serverless proxy for AI calls + auth gate |
| `utils/` | Pure helpers — IDs, storage/migrations, Zod schemas, IDB transactions |
| `types.ts` | Shared domain types (Course → Topic → SubTopic → DotPoint → Prompt) |
| `public/courseData/`, `data/` | Syllabus JSON content and manifest (public/ so builds ship it) |
| `projectDocs/` | Design spec, pedagogy rules (GoldStandard), system prompts |
| `supabase/` | Schema, seed, and backend tests |

## Commands

```bash
npm run dev          # start Vite dev server
npm run test:all     # lint + unit tests + type-check (run before pushing)
npm run type-check   # fastest feedback loop
npm run test:e2e     # Playwright e2e
```

Copy `.env.example` to `.env.local` for local setup. Husky + lint-staged run on
commit — fix failures rather than using `--no-verify`.

## House rules

- **British/Australian English everywhere** — UI text, AI prompts, docs
  ("Analyse", "Colour", "Summarise").
- The `Prompt` entity is the atomic unit; band/verb logic (`getBandForMark`,
  the Verb Gate) must never be bypassed or recalculated inline.
- `apiGuard` is a singleton (`services/aiCore.ts`), not a wrapper function — there
  is no `apiGuard(fn)` call form. `generateContentWithRetry` already checks
  `apiGuard.isBlocked()` and records every attempt itself, so a new AI call just
  goes through it directly. `safeJsonParse` only strips markdown fences and
  parses — it does not validate shape; use a Zod schema in `services/aiSchemas.ts`
  for that. See `.claude/skills/hsc-feature.md` §3 for the real pattern.
- New data fields: update `types.ts`, the Zod schemas in
  `utils/dataManagerUtils.ts`, and bump `DATA_VERSION` with a migration.
- Mock `services/geminiService.ts` in all tests — never hit the real API.

For detailed feature-development patterns (modals, AI functions, UI design
system, testing requirements), see `.claude/skills/hsc-feature.md`.
