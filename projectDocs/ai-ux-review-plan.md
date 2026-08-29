# AI UX Review + Implementation Plan (HSC AI Evaluator)

## Summary of current state
The AI surface is mature and mostly consistent. Generation/wait states are unified through `LoadingIndicator` + `AiBusyOverlay` (marking uses the event-driven `EvaluationProgressBar`), all listed AI modals use `useFocusTrap`/`useScrollLock`/`useEscapeKey`, and the service layer (`services/aiCore.ts`) has thorough, well-humanised error classification (quota/402/feature-lock/overload/proxy-unavailable) with a persisted circuit breaker. `useGemini` routes every failure through one `handleApiError` that correctly distinguishes paywalls from faults. British/Australian spelling is respected in visible copy (no American spellings found in user-facing strings).

The gaps are at the edges: one modal swallows its error entirely, per-modal error cards are hand-rolled and not announced to assistive tech, the Toast layer has a built-but-unreachable "warning" variant, and a couple of async surfaces lack live-region semantics.

Reduced-motion is already handled globally (a universal `@media (prefers-reduced-motion: reduce)` block in `index.css` that neutralises `animation-duration`/`animation-iteration-count`/`transition-duration` on `*`), so the heavy spinner/haptic animations do NOT warrant a finding.

## Findings

| ID | File(s) : line | Category | Severity | Description |
|----|----------------|----------|----------|-------------|
| F1 | `components/PromptGeneratorModal.tsx:103,253` | reliability | **high** | `error` state is set on generation failure but never rendered anywhere in the JSX; on failure the busy overlay hides and the modal shows nothing — a fully silent failure. |
| F2 | `components/SampleAnswerGeneratorModal.tsx:639`, `DotPointGeneratorModal.tsx:126`, `QualityCheckModal.tsx:148`, `SampleAnswerRevisionModal.tsx:238` | consistency / a11y | med | Each modal hand-rolls its own error card with divergent titles, icons (`AlertTriangle` vs `AlertCircle`), and affordances. None use `role="alert"`/`aria-live`, so screen readers never announce an AI failure. |
| F3 | `hooks/useToast.ts:36,47`; `components/Toast.tsx:30-37`; `App.tsx:1258` | clarity / consistency | med | `Toast.tsx` implements a full amber `warning` variant, but `useToast`'s type union is `'success'|'error'|'info'` only, so `warning` is unreachable. Quota 80% warnings are surfaced as blue `'info'`, visually indistinguishable from routine info. |
| F7 | `components/RecalibrateSamplesModal.tsx:112-121`; `hooks/useGemini.ts:426-483` | clarity | med | Recalibration runs sequential metered marking (one eval per sample; potentially minutes for many samples) but shows only a static "Recalibrating…" spinner. No per-sample progress. |
| F4 | `hooks/useToast.ts:44-57` | reliability | low | Only one toast is held at a time; a new toast silently overwrites an unseen one. |
| F5 | `components/Toast.tsx:90` | a11y | low | `aria-live="assertive"` is used for every toast type. Non-error toasts should be `polite`. |
| F6 | `components/BackgroundTaskIndicator.tsx:51` | a11y | low | No `role`/`aria-live`, so background import/task completion and error states are never announced. |
| F8 | `components/LoadingIndicator.tsx:188,256` | a11y | low | Nested `aria-live="polite"` — the phase `<ul>` (256) sits inside a container already `aria-live="polite"` (188), which can double-announce. |
| F9 | `hooks/useGemini.ts:460-463,478-480` | reliability | low | In a partial recalibration run, per-sample failures are only `console.error`'d; the user is told nothing unless *every* sample fails. |
| F10 | `components/ApiHealthIndicator.tsx:36`; `components/ApiStatusIndicator.tsx` | clarity | low | Two separate surfaces render the same circuit-breaker state. Small corner dot's only actionable copy is a `title` tooltip, unreachable on touch. |

## Prioritised, sequenced implementation plan

Global conventions for **every** step: British/Australian English in all copy; reuse design-system tokens and glassmorphism classes; mock `services/geminiService.ts` in tests (never hit the real API); run `npm run test:all` (lint + unit + type-check) before finishing.

### Step 1 — Create shared `AiErrorNotice` and fix silent failure in PromptGeneratorModal
- **Files:** `components/AiErrorNotice.tsx` (new); `components/PromptGeneratorModal.tsx`.
- **Change:** Add `AiErrorNotice`: `{ title?: string; message: string; onRetry?: () => void; onDismiss?: () => void }` rendering the existing red card style (`border-red-500/50`, `bg-red-500/10`, `AlertTriangle` icon, default title "Something went wrong"). Root gets `role="alert"` + `aria-live="assertive"`. In `PromptGeneratorModal.tsx`, render `<AiErrorNotice message={error} onRetry={handleGenerate} onDismiss={() => setError(null)} />` in the scrollable body whenever `error && !isLoading`.
- **Acceptance:** A generation failure (mock reject) shows a visible, dismissible, announced error card; modal stays open; no change on success.
- **Closes:** F1 (establishes shared component for F2).

### Step 2 — Adopt `AiErrorNotice` across the remaining AI modals
- **Files:** `SampleAnswerGeneratorModal.tsx`, `DotPointGeneratorModal.tsx`, `QualityCheckModal.tsx`, `SampleAnswerRevisionModal.tsx`.
- **Change:** Replace each bespoke error `<div>` with `<AiErrorNotice />`. Preserve each modal's affordance: QualityCheck keeps Retry (`onRetry={runCheck}`), Revision keeps Dismiss; add `onRetry` to SampleAnswerGenerator/DotPoint pointing at their generate handler. Meaningful titles ("Generation failed", "Check failed", "Revision failed").
- **Acceptance:** All four modals render identical error structure and announce via `role="alert"`; existing Retry/Dismiss unchanged; no light/dark regression.
- **Closes:** F2. Depends on Step 1.

### Step 3 — Add reachable `warning` toast level and quiet non-error announcements
- **Files:** `hooks/useToast.ts`, `components/Toast.tsx`, `App.tsx`.
- **Change:** (a) Widen toast union to `'success'|'error'|'warning'|'info'`. (b) `Toast.tsx`: conditional `aria-live` — `error`/`warning` → `assertive`+`role="alert"`, `success`/`info` → `polite`+`role="status"`. (c) `App.tsx:1258`: map quota 80% threshold to `'warning'` instead of `'info'`.
- **Acceptance:** 80% quota warning renders amber; type-check passes; success announces politely, errors/warnings assertively.
- **Closes:** F3, F5.

### Step 4 — Surface per-sample progress and partial failures in recalibration
- **Files:** `hooks/useGemini.ts`, `components/RecalibrateSamplesModal.tsx`.
- **Change:** Thread an `onProgress?: (done, total) => void` callback through `recalibrateSamples`, track failed ids; on partial run show a specific toast (`Recalibrated {n}, {m} failed — check your connection and retry those.`). In the modal, drive a `{done}/{total}` progress line + bar (reuse `role="progressbar"` from `StarterQuestionsModal.tsx:246`).
- **Acceptance:** Recalibration shows advancing `x of N`; partial failure produces a count toast; all-success and all-fail paths keep current toasts. No metering change.
- **Closes:** F7, F9. UI/reporting only — do NOT alter sequential marking or calibration-prompt logic.

### Step 5 — Small accessibility fixes on async status surfaces
- **Files:** `components/BackgroundTaskIndicator.tsx`, `components/LoadingIndicator.tsx`.
- **Change:** (a) Add `role="status"` + `aria-live="polite"` + `aria-atomic` to `BackgroundTaskIndicator` root (error state may use `role="alert"`). (b) Remove redundant inner `aria-live="polite"` on the phase `<ul>` in `LoadingIndicator.tsx:256`.
- **Acceptance:** Background completion announced once; loading phases no longer double-announce; no visual change.
- **Closes:** F6, F8.

### Step 6 (optional, low) — Toast queue instead of single-slot overwrite
- **Files:** `hooks/useToast.ts` + single Toast mount point.
- **Change:** Convert single `toast` state to a short FIFO queue; render head, advance on dismiss/timeout. Keep timing constants.
- **Acceptance:** Two quick toasts both display in turn; single-toast tests updated.
- **Closes:** F4. Must follow Step 3 (shared file). Lowest priority.

*(F10 deliberately not given a step: consolidating the two circuit-breaker surfaces risks touching layout/z-index of global indicators for little benefit.)*

## Needs verification (could not confirm from code read)
1. **Band-rationale clarity** — whether `EvaluationDisplay`/`EvaluationResultModal`/`AnswerMetricsDisplay` *explain* the assigned band (Verb-Gate cap, PEEL, criteria mapping) vs just show it. If absent, potential new finding.
2. **StarterQuestionsModal total-failure path** — confirm an all-fail run leaves a clear "0 written, N failed" state.
3. **ScenarioImageUploader / admin surfaces** (`AiEngineSelector`, `UsageDashboard`, `ApiMonitorDisplay`, `RuntimeKeyModal`) — only lightly inspected; confirm loading/error handling matches unified pattern.
4. **F3 assumption** — confirm no other caller relies on `warning` being excluded from the `useToast` union (domain "warning" strings in `geminiService.ts`, `aiSchemas.ts`, `writingAnalysis.ts`, `LiveInsights.tsx` are unrelated data).
