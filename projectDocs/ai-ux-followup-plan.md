# AI UX Follow-up Plan (deferred items + worthwhile extras)

Follow-up to PR #182. Implements the three items deferred from the first pass plus the consistency cleanups the verification report surfaced. Same conventions as before: British/Australian English; design-system tokens (no new colours); mock `services/geminiService.ts` in tests; `npm run test:all` green before each commit; band/`Prompt` logic untouched.

## Step A — Explain the Verb-Gate band cap to users (clarity; verification candidate finding)
- **Why:** `getBandForMark` silently clamps the achievable band to the verb's cognitive tier (an "Identify" question can never exceed Band 1, "Explain" Band 3, etc.). `EvaluationDisplay` already renders a "Band N Goal" reflecting this ceiling but never says *why* it is capped — students/teachers can read it as the marker being harsh.
- **File:** `components/EvaluationDisplay.tsx` (it already computes `termInfo` (tier + name), `prompt.verb`, and `maxBand` at ~line 374).
- **Change:** Add a concise, plain-language explainer near the `BandGoalCard` (or the band summary) shown only when the cap is binding (`maxBand < 6`): e.g. *"This is an '{VERB}' question (Tier {n} — {tierName}). Its cognitive demand caps the achievable result at Band {maxBand}; a flawless response still tops out here."* Use existing tier colour tokens; make it legible in light/dark. Ensure it is part of the accessible description (not colour-only). While in this file, widen its local `showToast` prop type (~line 313) to include `'warning'` for consistency.
- **Acceptance:** For a tier <6 verb the evaluation view shows the explanation with the correct tier/name/maxBand; for a tier-6 verb (no binding cap) it does not appear. No change to marks/band maths. Unit test with a low-tier prompt asserts the explainer renders with the right ceiling; a tier-6 prompt asserts it does not.

## Step B — Toast queue instead of single-slot overwrite (F4)
- **Why:** `useToast` holds one toast; a new one silently overwrites an unseen one. The app funnels quota warnings, AI fallback notices and success/error through this slot, so they clobber each other.
- **File:** `hooks/useToast.ts` (+ the mount at `App.tsx:1455` only if the returned shape must change — prefer keeping `{ toast, showToast, hideToast }` API-compatible so the mount is untouched).
- **Change:** Back the hook with a short FIFO queue. `toast` exposes the head; `showToast` enqueues; `hideToast` and the per-toast timeout advance to the next. Preserve `TOAST_DURATION` / `ACTIONABLE_TOAST_DURATION`, ids, and the hover-pause behaviour (timeout still keyed so a dismissed toast doesn't skip the next). Guard against unbounded growth (cap the queue, drop oldest low-priority if needed).
- **Acceptance:** Two toasts fired in quick succession both display in turn; a dismissed/expired toast advances to the next; the mount API is unchanged. Update/extend `tests/unit/` toast tests to cover queueing.

## Step C — Consolidate the duplicate circuit-breaker surfaces + API-status a11y (F10)
- **Why:** In the BLOCKED state, `ApiHealthIndicator` (corner dot) and `ApiStatusIndicator` (banner) both render the same state; the dot's only actionable copy is a `title` tooltip ("See banner for details") that is unreachable on touch and not announced (`role="status"`, no `aria-label`).
- **Files:** `components/ApiHealthIndicator.tsx`, `components/ApiStatusIndicator.tsx`, `components/ApiMonitorDisplay.tsx`.
- **Change:**
  - Verify in `hooks/useApiStatus.ts` whether `state === 'BLOCKED'` coincides with `isBlocked` (banner visible). If they coincide, have the corner dot stop duplicating the blocked state — the banner owns BLOCKED (it is the assertive, detailed, countdown surface) — so the dot renders only HEALTHY/DEGRADED. If they can diverge, keep a minimal accessible blocked dot instead of removing it.
  - Give the dot an `aria-label` mirroring its `title` (so DEGRADED error counts are announced), keeping `title` for pointer users; drop the now-obsolete "See banner" tooltip.
  - `ApiMonitorDisplay.tsx:~234`: the error line uses a neutral `role="status"`; make an actual error state assertive (`role="alert"` / `aria-live="assertive"`) so failures are announced. Do not restyle beyond the a11y attributes.
- **Acceptance:** When blocked, only one primary surface presents it (no duplicate/dead tooltip); the dot announces its state to assistive tech; ApiMonitor errors are announced. No layout/z-index regression of the always-mounted indicators. Add/adjust a unit test for the dot's blocked/degraded rendering.

## Step D — Single source of truth for the toast type (consistency; resolves the F3-adjacent inconsistency)
- **Why:** ~18 components redeclare the toast type inline as `'success' | 'error' | 'info'`, omitting the now-supported `'warning'`. Verification flagged `EvaluationDisplay.tsx:313` specifically. This is drift waiting to bite (a `'warning'` call would fail to type-check at those boundaries).
- **Files:** export a shared `ToastType` (and optionally `ShowToast`) from `hooks/useToast.ts`; replace the inline `'success' | 'error' | 'info'` unions in the components that declare a `showToast`/`ToastFn` prop with the shared type (admin/*, Workspace, PromptDisplay, StarterQuestionsModal, ManualPromptModal, UpgradeModal, OutcomesEditorModal, CourseRequestModal, DataManagerModal, ScenarioImageUploader, dataManager/ExportFlow, AppModals, useSyllabusData, pdf/types `ToastFn`, etc. — but NOT ones already handled in Steps A/B/C, to avoid churn on the same lines).
- **Change:** Type-only refactor. Preserve each prop's optionality (`?`) and param names; only swap the literal union for `ToastType` and add the import. No behavioural change.
- **Acceptance:** `npm run type-check` + `type-check:tests` clean; a single definition of the toast type; no runtime change. If any file legitimately needs a narrower set, leave it and note why.

## Verification & review (clean pass)
- Independent agent verifies A–D against source, checks a11y semantics and that band maths are untouched, runs `npm run test:all`, and runs `/code-review` on the diff. Marks anything unconfirmed.

## Not doable here
- Enabling repo-level GitHub **auto-merge** is a repository Settings toggle (Settings → General → Pull Requests → Allow auto-merge), not a code change — the PR will be merged via API as before.
