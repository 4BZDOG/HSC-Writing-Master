# AI UX Follow-up — Verification

Verification of the follow-up work (deferred items F4, F10, the Verb-Gate clarity finding, and the ToastType consistency sweep). Companion to `ai-ux-followup-plan.md`.

## What was checked and how
- Full check suite (`npm run test:all`) on the combined branch: **PASS** — lint clean, **2040 unit tests across 195 files**, `type-check` + `type-check:tests` clean, `check:eager-reads` clean.
- A `/code-review` pass over `origin/main..HEAD` at high effort: **no correctness bugs found**; one low-severity by-design note on the queue eviction comment, addressed by correcting the comment (below).
- Manual trace of the single `useToast()` consumer (`App.tsx`) and the widened prop types.

## Step-by-step result

| Step | Finding | Result | Evidence |
|---|---|---|---|
| A | Verb-Gate cap never explained | VERIFIED | `components/EvaluationDisplay.tsx` renders a plain-language cap card gated on `maxBand < 6`, using `termInfo.tier` + `tierShortLabel` + `maxBand`; tested in `tests/unit/verbGateBandCap.test.tsx` (tier 1/3 show the ceiling, tier 6 shows nothing). Band maths untouched. |
| B | Single-slot toast overwrite (F4) | VERIFIED | `hooks/useToast.ts` now a FIFO queue; head shown, `showToast` appends, `hideToast` advances; `key={toast.id}` at the App mount resets the per-head countdown; queue capped at 4. Tested in `tests/unit/toastAction.test.tsx` (queue order, drain-boundedness, actionable preservation). Sole consumer is `App.tsx`, sole mount confirmed. |
| C | Duplicate circuit-breaker surfaces + API a11y (F10) | VERIFIED | Breaker sets `state:'BLOCKED'` and `isBlocked` together (`services/aiCore.ts:273-274,354-355,400-402`), so the banner always shows when blocked; `ApiHealthIndicator` now returns null for BLOCKED (banner owns it) and carries an `aria-label`; `ApiMonitorDisplay` announces failures assertively and tints them. Tested in `tests/unit/apiHealthIndicator.test.tsx`. |
| D | Inline toast-type unions omit `warning` | VERIFIED | 22 files migrated to the shared `ToastType` exported from `hooks/useToast.ts` (type-only imports, erased at runtime); `grep` confirms no `'success' | 'error' | 'info'` inline unions remain in source; type-check clean. No behavioural change. |

## Code-review note (resolved)
- **Queue eviction in an all-actionable overflow.** When the queue is full and *every* waiting toast is actionable, the oldest waiting actionable is dropped, so the "prefer to preserve offers" wording overstated the guarantee. The behaviour is bounded and by design (the cap must give somewhere, and a burst of 4+ simultaneous offers is not a real flow); the code comment was corrected to describe this accurately rather than change the policy.

## Could not confirm / out of scope
- **Repo-level GitHub auto-merge** cannot be enabled from code — it is a repository Settings toggle. The PR is merged via API.
- No visual/manual browser QA was run (no behavioural test harness for the live toast countdown beyond unit tests); the countdown/pause logic in `Toast.tsx` was unchanged by this work.
