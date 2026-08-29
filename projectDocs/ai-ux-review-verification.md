# AI UX Review — Independent Verification Pass

Branch: `claude/ai-features-ui-ux-review-6bbfdg`
Date: 2026-08-29
Scope: verification only — no application code modified.

Commits verified (oldest → newest):
`de8ced8` (Step 1) · `41e6c59` (Step 2) · `a159ab6` (Step 3) · `5e85d7f` + `0e1ad56` (Step 4) · `5b3953c` (Step 5).

---

## A. Implemented changes — VERIFIED / ISSUE FOUND

| Step / Finding | Verdict | Evidence (file:line) |
|---|---|---|
| **Step 1 — `AiErrorNotice` component** (F1) | VERIFIED | `components/AiErrorNotice.tsx:31-33` root has `role="alert"` + `aria-live="assertive"`; red-token card `border-red-500/50 bg-red-500/10` + `light:` variants (`:34`); `AlertTriangle` icon (`:36`); default title "Something went wrong" (`:25`); optional Retry ("Try again", `:48`) / Dismiss (`:57`). Purely presentational, caller owns handlers. |
| **Step 1 — PromptGeneratorModal silent failure fixed** (F1) | VERIFIED | `components/PromptGeneratorModal.tsx:353-359` renders `<AiErrorNotice>` in the scrollable body on `error && !isLoading`, wired `onRetry={handleGenerate}` + `onDismiss={() => setError(null)}`. Error is still set on failure (`:254`). Card renders inside the always-mounted scroll container — reachable, not dead. |
| **Step 2 — adoption across 4 modals** (F2) | VERIFIED | SampleAnswerGeneratorModal `:639-646` (title "Generation failed", Retry+Dismiss); DotPointGeneratorModal `:127-136` (title "Generation failed", `error && !isLoading`, Retry+Dismiss); QualityCheckModal `:148-156` (title "Check failed", Retry → `runCheck`); SampleAnswerRevisionModal `:239-245` (title "Revision failed", Dismiss). All five render the same shared component → identical structure + `role="alert"`. Each keeps a sensible affordance. |
| **Step 3 — reachable `warning` toast level** (F3) | VERIFIED | `hooks/useToast.ts:38,49` union widened to `'success'\|'error'\|'warning'\|'info'`; `components/Toast.tsx:7,30-37` amber variant uses `border-amber-500/30 / amber-500/10 / bg-amber-500 / text-amber-600` design tokens + `AlertTriangle`. |
| **Step 3 — conditional live-region** (F5) | VERIFIED | `components/Toast.tsx:63` `isUrgent = error\|warning`; `:93-94` `role={isUrgent?'alert':'status'}` + `aria-live={isUrgent?'assertive':'polite'}`. |
| **Step 3 — quota 80% → warning** (F3) | VERIFIED | `App.tsx:1258-1259` `showToast(w.message, w.level === 'reached' ? 'error' : 'warning')` — 80%/approaching = amber warning, 100%/reached = error. |
| **Step 4 — `onProgress` + failed-id tracking + partial-failure toast** (F7/F9) | VERIFIED | `hooks/useGemini.ts:426-499`: signature gains `onProgress?(done,total)` (`:430`); `failedIds` tracked (`:444,467`); `onProgress?.(updatedCount + failedIds.length, samples.length)` in `finally` so the bar advances on failures too (`:472`); partial run fires a `'warning'` toast (`:490-493`); all-fail path → `'error'` (`:498`); all-success → `'success'` (`:495`). No metering change (still one `recordEvaluation()` per sample, `:455`). |
| **Step 4 — end-to-end threading** (F7) | VERIFIED — no hop drops the 2nd arg | RecalibrateSamplesModal `:127` `onRecalibrate(selected, (done,total)=>setProgress(...))` → SampleAnswersAccordion `handleRecalibrate(sampleIds, onProgress)` `:659-666` forwards `onProgress` to its `onRecalibrate` prop → prop type carries `onProgress` `:952-955` → Workspace `:555-556` `(ids, onProgress) => geminiHandlers.recalibrateSamples(currentPrompt, ids, onProgress)` → hook `:426-431`. Fully connected. |
| **Step 4 — progressbar aria math** | VERIFIED | `RecalibrateSamplesModal.tsx:268-274` `role="progressbar"` `aria-valuenow={progress.done}` `aria-valuemin={0}` `aria-valuemax={progress.total}` + `aria-label`; width `(done / Math.max(total,1)) * 100%` (`:278`) — no divide-by-zero, values coherent. |
| **Step 5 — BackgroundTaskIndicator live region** (F6) | VERIFIED | `components/BackgroundTaskIndicator.tsx:52-54` root: `role={status==='error'?'alert':'status'}`, `aria-live={error?'assertive':'polite'}`, `aria-atomic="true"`. |
| **Step 5 — LoadingIndicator nested live-region removed** (F8) | VERIFIED | Only one live region remains: container `role="status"`+`aria-live="polite"` at `:187-188`; the phase `<ul>` at `:256` no longer carries `aria-live` (grep confirms only 187/188 match). |

### Convention checks (all changed files, `git diff 4d1f86b..HEAD`)
- **British/Australian spelling in visible copy:** VERIFIED — no American spellings in added user-facing strings ("Recalibration complete", "Try again", "Dismiss", "Recalibrated N, M failed…", etc.). CSS class tokens like `items-center` are not copy.
- **Design-system tokens:** VERIFIED — red card uses `red-500/10 · red-500/50`; amber warning uses `amber-500/*`; no ad-hoc hex in the new UI.
- **No hard-coded model strings:** VERIFIED — diff contains no `gemini-N` / `gpt-` / model-id literals. Recalibration reuses `gemini.evaluateAnswer`.
- **`Prompt`/band logic untouched:** VERIFIED — `data/commandTerms`, `performanceBands`, `renderUtils` band logic not in the changed-file set; recalibration reads band helpers only.

### NEW defects found in the implemented work
**None (blocking or otherwise).** No dead error card, no wrong aria math, no nested live region, no toast-severity mismatch. Two non-blocking observations, both pre-existing and out of scope (not introduced by this effort — do not fix here):
- `components/EvaluationDisplay.tsx:313` declares a local `showToast?` prop typed `'success'|'error'|'info'` (no `'warning'`). Harmless — a narrower prop, never passes warning — but it is a second, un-widened copy of the toast union. Informational only.
- `components/ApiMonitorDisplay.tsx:234-240` surfaces both success and error via one neutral `role="status"` line (no red styling / not assertive on error). Visible, not silent, but not fully aligned to the unified error pattern. Pre-existing, out of scope.

---

## B. "Needs verification" items — CONFIRMED / NOT CONFIRMED

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | Band-rationale clarity | **PARTIAL → candidate future finding CONFIRMED** | Per-criterion rationale IS shown: `EvaluationDisplay.tsx:255-296` renders each criterion's mark + meter + AI feedback (criteria/PEEL mapping), and a Band-goal meter (`:116-170`). BUT the **Verb-Gate cap is never explained to the user** — it lives only in code comments (`:373,395-401`), and the band is clamped (`Math.min(maxBand, …)`) with no on-screen "capped because the verb tier limits this to Band N". `AnswerMetricsDisplay.tsx` only tints chips by band (`:28-45`), no rationale. So the *number* and *criteria* are explained; the *Verb-Gate cap reasoning* is not. Legitimate candidate future finding — NOT implemented, as instructed. |
| 2 | StarterQuestionsModal total-failure path | **CONFIRMED** | On an all-fail run `progress.completed=0`, `progress.failed=N`: on-screen text reads "0 written, N failed" (`StarterQuestionsModal.tsx:254-255`); progressbar advances on failures too (`:242 aria-valuenow={completed+failed}`); a fatal error renders its own red block (`:259-266`); `handleFinish` fires the success toast only when `written > 0` (`:125-128`), so no misleading "wrote 0" toast. Clear all-fail state present. |
| 3 | ScenarioImageUploader + admin surfaces | **CONFIRMED — no silent failures** | ScenarioImageUploader routes success/error/info through `showToast` (`:64-72,113-118`). ApiMonitorDisplay surfaces load/save/override failures via a visible `message` line (`:53,77,104,234-240`). UsageDashboard `load()` failure → `showToast(…, 'error')` (`:287-288`); its *secondary* fetches (`:298-302` model usage, `loadDemand :258-266`, schools) swallow errors **deliberately and with documented rationale** — progressive enhancements that hide a section rather than break the dashboard. RuntimeKeyModal uses `showToast` for validation/save/clear (`:63,78,88`). AiEngineSelector has no async ops (74 lines, no await/fetch) → no error path to handle. Pattern matches; only the minor ApiMonitorDisplay styling note above. |
| 4 | F3 assumption — nothing relied on `warning` being excluded | **CONFIRMED** | Widening the union is purely additive. `Toast.tsx` has no exhaustive `switch`/`never` on type — it falls back via `toastConfig[type] \|\| toastConfig.info` (`:59`). The domain "warning" strings are unrelated types: quality-check issue `severity` enum (`geminiService.ts:924`, `aiSchemas.ts:95`) and writing-analysis `InsightTone` (`writingAnalysis.ts:59,141…`, consumed in `LiveInsights.tsx:17,57`). None reference the toast union. Narrower local `showToast` prop types (EvaluationDisplay, ScenarioImageUploader, StarterQuestionsModal, admin surfaces) simply cannot pass `'warning'` — no breakage, no exhaustiveness dependency. |

---

## C. Test suite

`npm run test:all` (lint → vitest --run → type-check → type-check:tests → check:eager-reads): **PASS.**

- Lint: clean.
- Unit/component: **2030 tests passed across 193 files** (0 failed), ~85s.
- `tsc --noEmit` (app) and `tsc -p tsconfig.test.json` (tests): clean.
- `check:eager-reads`: no unexplained eager reads.
- (Non-fatal Vite dynamic-import warning is pre-existing, unrelated to this work.)

New tests accompanying the effort: `tests/unit/aiErrorNotice.test.tsx`, `modalErrorNotice.test.tsx`, `asyncStatusAria.test.tsx`, `recalibrateSamplesReporting.test.tsx`, `toastAction.test.tsx`.

---

## Summary

All 5 steps / F1–F9 targeted findings are **VERIFIED clean** with no new defects. The recalibration `onProgress` callback is genuinely threaded end-to-end with no dropped hop; the progressbar aria math is correct; all five modals share `AiErrorNotice`; no American spellings introduced. Needs-verification items: 2, 3, 4 **CONFIRMED**; item 1 **PARTIAL** — criteria/band shown but Verb-Gate cap rationale is not surfaced to users (valid candidate future finding, not implemented). Test suite: **PASS (2030/2030)**. Ready to merge.
