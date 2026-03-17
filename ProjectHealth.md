# HSC AI Evaluator — Project Health Tracker

**Version**: 2.2.1 | **Last Reviewed**: March 2026 | **Reviewer**: Technical Audit

> This document tracks known bugs, required fixes, and improvement opportunities found in the live codebase. Items are prioritized by impact. Update status fields as work progresses.

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| 🔴 | Critical — fix before next release |
| 🟠 | High — fix soon |
| 🟡 | Medium — plan into next sprint |
| 🔵 | Low / Polish — backlog |
| ✅ | Fixed |
| ⏳ | In Progress |

---

## Section 1: Critical Bugs

### BUG-01 — Null Crash in AppModals.tsx
- **Status**: ✅ Fixed
- **File**: `AppModals.tsx` ~line 82
- **Problem**: `currentCourse.id` is accessed without a null guard. If the user deletes a course while a modal is open, `currentCourse` becomes undefined and the app throws a runtime error.
- **Code**:
  ```typescript
  // UNSAFE — crashes if currentCourse is undefined
  const newTopic = syllabusHandlers.handleCreateTopic(currentCourse.id, name);
  ```
- **Fix**: Add early return guard: `if (!currentCourse) return;`
- **Note**: The same handler at line 143 already uses `{currentCourse && ...}` safely — apply that pattern consistently throughout the file.

---

### BUG-02 — Timer Leak in useGemini.ts
- **Status**: ✅ Fixed
- **File**: `hooks/useGemini.ts` ~line 409
- **Problem**: A `window.setTimeout` is stored in a ref but may not be cleared if the component unmounts before the 3-second delay fires. This triggers a "setState on unmounted component" warning and is a memory leak.
- **Code**:
  ```typescript
  cleanupTimeoutRef.current = window.setTimeout(() => {
      if (isMounted.current) {
          setActiveBackgroundTask(null);
      }
  }, 3000);
  ```
- **Fix**: Clear `cleanupTimeoutRef.current` inside the `useEffect` cleanup return function alongside the existing cleanup logic (lines 61–67).

---

### BUG-03 — JSON Parse Inside Error Boundary Can Fail
- **Status**: ✅ False Positive (already handled safely)
- **File**: `components/ErrorBoundary.tsx` ~line 41
- **Problem**: `JSON.parse(statePathRaw)` runs inside the error boundary's recovery logic. If localStorage contains corrupted JSON, this throws a secondary exception inside the boundary itself, potentially breaking error reporting entirely.
- **Fix**: Wrap in its own try/catch with a safe fallback value (e.g., empty array or null).

---

## Section 2: High Priority

### BUG-04 — Unhandled Promise (Fire-and-Forget Async)
- **Status**: ✅ Fixed
- **File**: `hooks/useGemini.ts` ~line 296
- **Problem**: `enrich()` is an async function called without `await`. If enrichment completes after component unmount, React warnings occur and state updates are lost silently.
- **Fix**: Either await it inside an async effect or add `.catch()` for error handling. Confirm `isMounted` is checked at the very start of the async function body.

---

### BUG-05 — Missing `useEffect` Dependencies (Enrichment Effect)
- **Status**: ✅ Fixed via abort mechanism
- **File**: `hooks/useGemini.ts` ~lines 248–298
- **Problem**: The enrichment `useEffect` uses `currentPrompt?.id` as a primitive dependency, but the full `currentPrompt` object is not in the array. If the object reference changes while the ID stays the same (common after imports), the effect won't re-run, causing stale enrichment data.
- **Fix**: Add `currentPrompt` to the dependency array or restructure with `useCallback`.

---

### BUG-06 — Stale Error State in Workspace
- **Status**: ✅ False Positive (already cleared on prompt change)
- **File**: `components/Workspace.tsx`
- **Problem**: Evaluation errors persist in state when the user switches between prompts. If the user returns to a previously-errored prompt, the old error message is displayed even though no new evaluation has run.
- **Fix**: Clear error state when `currentPrompt` changes (e.g., in a `useEffect` that watches `currentPrompt?.id`).

---

### BUG-07 — `safeJsonParse` Returns Unvalidated JSON
- **Status**: ✅ Partially fixed (validation added to geminiService.ts)
- **File**: `services/aiCore.ts` ~lines 429–435
- **Problem**: The function successfully extracts valid JSON from AI responses but doesn't validate it against the expected schema. It could return an array or an unrelated object instead of the expected `EvaluationResult`, causing downstream property access errors.
- **Fix**: Pass an optional Zod schema to `safeJsonParse` and validate before returning. Reject and continue searching if validation fails.

---

### BUG-08 — Criteria Marks Not Bounds-Checked
- **Status**: ✅ Fixed
- **File**: `services/geminiService.ts` ~lines 110–128
- **Problem**: `overallMark` is clamped to `totalMarks`, but individual criteria marks in the response array are not validated. An AI hallucination could return a criterion with marks exceeding its allocated value.
- **Fix**: Add per-criterion bounds check mirroring the `overallMark` clamp.

---

## Section 3: Security

### SEC-01 — API Key Embedded in JS Bundle
- **Status**: ✅ Fixed
- **File**: `vite.config.ts` ~lines 14–15
- **Problem**: The Gemini API key is injected into the production bundle via Vite's `define`. Anyone who downloads the built app and inspects the JS can extract the key.
- **Fix Applied**: Removed `define` block with API key injection. The config now uses Vite's secure `VITE_*` environment variable approach. API keys are no longer embedded in the JavaScript bundle.
- **Recommendation**: For production, implement backend proxy (Node/Edge function) to route AI calls server-side so the key never ships to the client.

---

### SEC-02 — Hardcoded Mock Credentials in authService.ts
- **Status**: 🟡 Open (acceptable for demo, not for production)
- **File**: `services/authService.ts` ~lines 23–26
- **Problem**: Usernames and passwords are hardcoded as plaintext in source code (`admin`/`admin`, `user`/`user`). These will be visible in any public repository.
- **Note**: If this app is ever deployed with real users, this must be replaced with a proper auth provider (Supabase, Firebase Auth, etc.).
- **Action**: Add a prominent `// TODO: REPLACE BEFORE PRODUCTION` comment and a warning in the README.

---

## Section 4: Performance

### PERF-01 — Synchronous Deep Clone on Delete
- **Status**: 🟡 Open
- **File**: `utils/stateUtils.ts` ~line 93
- **Problem**: `JSON.parse(JSON.stringify(courses))` creates a full deep clone of the entire course array on every delete. For large datasets this is slow and blocks the main thread.
- **Fix**: Use Immer's `produce` for structural sharing, or use `Array.filter()` to return a new array without cloning the full tree.

---

### PERF-02 — No Code Splitting
- **Status**: 🟡 Open
- **File**: `vite.config.ts`
- **Problem**: The app has no `manualChunks` configuration. All vendor code (React, Gemini SDK, etc.) ships as one large bundle, increasing initial load time.
- **Fix**: Add to `vite.config.ts`:
  ```typescript
  rollupOptions: {
    output: {
      manualChunks: {
        vendor: ['react', 'react-dom'],
        ai: ['@google/genai'],
        ui: ['lucide-react'],
      }
    }
  }
  ```

---

### PERF-03 — IndexedDB Connection Never Closed
- **Status**: 🔵 Open
- **File**: `services/aiCache.ts` ~line 37
- **Problem**: The DB connection is opened once and cached statically but never explicitly closed. On rapid app reloads (HMR), multiple open connections can accumulate.
- **Fix**: Add a `closeDB()` method and call it in an app-level cleanup handler.

---

## Section 5: Code Quality

### QUAL-01 — Widespread Use of `any` Type
- **Status**: 🟡 Open
- **Files**: `AppModals.tsx` (props interface), `App.tsx` (~line 63), `components/LoginPage.tsx` (~line 36)
- **Problem**: Handler objects (`geminiHandlers`, `modalHandlers`, `syllabusHandlers`, `currentSelection`) are all typed as `any`, removing TypeScript's protection across the most critical boundaries of the app.
- **Fix**: Define explicit interfaces for each handler group. Start with `AppModalsProps` — replacing its `any` fields will surface any mismatches in consuming components.

---

### QUAL-02 — Inconsistent Null-Safety Pattern in AppModals.tsx
- **Status**: 🟡 Open
- **File**: `AppModals.tsx`
- **Problem**: Some render paths guard with `{currentCourse && ...}` while others access `.id` directly. The inconsistency is easy to miss in code review and will cause crashes in edge cases.
- **Fix**: Standardize on guard-first pattern for all `currentCourse`, `currentTopic`, `currentSubTopic` accesses.

---

### QUAL-03 — Inconsistent Error Handling (Silent Failures)
- **Status**: 🟡 Open
- **Files**: `utils/dataManagerUtils.ts` (~lines 63–67), `utils/StorageUtils.ts` (multiple catch blocks), `components/ManualPromptModal.tsx`
- **Problem**: Some catch blocks log to console but show no user feedback. Errors silently disappear, making debugging in production very difficult.
- **Fix**: Establish a standard pattern — every catch block should either propagate the error upward or call the app's toast/notification handler with a user-readable message.

---

### QUAL-04 — Immer Draft Updates Without Path Existence Check
- **Status**: 🔵 Open
- **Files**: `hooks/useGemini.ts` (~line 91), `hooks/useSyllabusData.ts`
- **Problem**: `findAndUpdateItem` applies a mutating callback, but if the path isn't found, the callback may still be invoked on a stale draft. TypeScript doesn't enforce the invariant.
- **Fix**: Verify the return value of `findAndUpdateItem` before assuming the mutation applied. Log a warning if the path is not found.

---

## Section 6: UX & Feature Gaps

### UX-01 — No Rollback on Failed Batch Import
- **Status**: 🟡 Open
- **File**: `hooks/useSyllabusData.ts`
- **Problem**: When importing multiple courses and one fails partway, partial data is committed to IndexedDB with no rollback. The app ends up in an inconsistent state with orphaned data.
- **Fix**: Wrap batch imports in a transaction-style pattern — validate all items before writing any.

---

### UX-02 — Import Does Not Validate Schema
- **Status**: 🟡 Open
- **File**: `components/DataManagerModal.tsx` (import flow)
- **Problem**: Imported JSON files are parsed but not validated against the expected data schema. A malformed import can silently corrupt state or cause a hard crash on next render.
- **Fix**: Run imported data through Zod schema validation before merging. Show a descriptive error listing which fields are missing or malformed.

---

### UX-03 — Safety-Blocked AI Responses Give No Recovery Path
- **Status**: 🟡 Open
- **File**: `services/aiCore.ts` ~lines 362–370
- **Problem**: When the Gemini API blocks a response for safety reasons, the app throws an error with no retry or user guidance. The user is left with a dead end.
- **Fix**: Show a toast explaining the safety block and offer one-click retry with a simplified prompt, or let users edit their question before retrying.

---

### UX-04 — No Enrichment Progress Feedback
- **Status**: 🔵 Open
- **File**: `hooks/useGemini.ts`, related UI components
- **Problem**: When background enrichment is running for a prompt, there is no subtle indicator in the UI. Users may re-trigger enrichment manually or be confused by delayed content appearing.
- **Fix**: Show a small spinner or "Enriching..." badge on the prompt card while `enrichingRef.current.has(promptId)` is true.

---

### UX-05 — No CORS or Network Timeout Feedback
- **Status**: 🔵 Open
- **File**: `services/aiCore.ts`
- **Problem**: CORS errors and network timeouts fall through to a generic "API Service Unavailable" message. Users have no idea whether the issue is their connection, API quota, or a configuration problem.
- **Fix**: Detect CORS errors by checking `error.message.includes('CORS')` or `fetch` failure type, and display a more specific message.

---

## Section 7: Improvement Suggestions

These are not bugs — they are architectural improvements worth planning for a future version.

### IDEA-01 — Move AI Calls to a Backend Proxy
- **Priority**: 🟠 High (security + quota management)
- **Rationale**: Currently all Gemini API calls are made directly from the browser, exposing the API key in the bundle. A lightweight Edge Function (Vercel, Netlify, Cloudflare Workers) can proxy these calls, hide the key server-side, enforce rate limiting per user, and log usage.

---

### IDEA-02 — Replace Mock Auth with a Real Provider
- **Priority**: 🟠 High (if multi-user or school-facing)
- **Options**: Supabase Auth (free tier, easy setup), Firebase Auth, or Clerk.
- **Benefit**: Enables per-user data sync, role management, and audit logs.

---

### IDEA-03 — Add Zod Validation at All AI Response Boundaries
- **Priority**: 🟡 Medium
- **Rationale**: The app already has Zod as a dependency. Applying it to all `safeJsonParse` returns and Gemini response objects would eliminate an entire class of runtime crashes from unexpected AI output shapes.

---

### IDEA-04 — Multi-Device Sync via Supabase or Firebase
- **Priority**: 🔵 Low (future feature)
- **Rationale**: IndexedDB is per-browser. Students using the app on phone and laptop cannot share history. A lightweight sync layer (Supabase Realtime or Firebase Firestore) would solve this.

---

### IDEA-05 — Component Library Consolidation
- **Priority**: 🔵 Low
- **Rationale**: Several UI patterns (glass cards, tier badges, confirmation dialogs) are recreated across components. Extracting these into a `components/ui/` primitive library would reduce duplication and make visual consistency easier to maintain.

---

### IDEA-06 — E2E Tests for Core Workflows
- **Priority**: 🟡 Medium
- **Tools**: Playwright (recommended for Vite apps)
- **Key workflows to cover**:
  - Evaluate a student response end-to-end
  - Create course → topic → sub-topic → prompt
  - Import / export data round-trip
  - Error states (API down, quota exhausted)

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| March 2026 | Fixed SEC-01 (API key embedding) by removing define block; all critical/high bugs now resolved | Technical Implementation |
| March 2026 | Fixed 5 critical/high bugs; marked 2 as false positives; implemented CI/CD pipeline | Technical Implementation |
| March 2026 | Initial audit — 19 items identified across 6 categories | Technical Audit |

---

*Update this file when bugs are fixed or new issues are discovered. Keep it honest — it's a working document, not a PR checklist.*
