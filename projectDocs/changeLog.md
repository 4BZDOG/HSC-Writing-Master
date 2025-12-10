# HSC AI Evaluator - Changelog

## [2.2.0] - 2025-05-22 (The "Data Integrity" Update)

### 🚀 Features
*   **Strict Band Calculation:** Rewrote `getBandForMark` to use a non-linear distribution curve based on Cognitive Tiers. This ensures that low-mark questions (e.g., 3/4 marks) are correctly differentiated into Bands 3 and 4, rather than bunching at the top.
*   **Data Migration System:** Implemented an auto-migration that runs on app load (`DATA_VERSION = '2.2.0'`), recalculating the bands for *all* existing sample answers in the database to align with the new strict logic.
*   **Comprehensive Data Specs:** Created `dataSpecifications.md` as a single source of truth for the hierarchical schema and validation rules.

### 🐛 Fixes
*   **Evaluation Display Crash:** Fixed a critical bug where `EvaluationDisplay.tsx` was truncated, causing build failures. Restored full component logic.
*   **Missing Hooks:** Restored `useAnswerMetrics.ts` and `AnswerMetricsDisplay.tsx` which were missing from previous file dumps, causing "Module not found" errors.
*   **Duplicate Modal:** Removed the redundant rendering of `ImprovementReviewModal` in `Workspace.tsx`, fixing the "double modal" glitch. It is now centrally managed by `AppModals.tsx`.
*   **API Guard Export:** Restored the missing `ApiGuard` class export in `geminiService.ts` that was causing syntax errors.

---

## [2.1.5] - 2025-05-20 (The "Glass & Texture" UI Overhaul)

### 🎨 Design & UI
*   **Generative Studio Polish:** Redesigned `SampleAnswerGeneratorModal`, `TopicGeneratorModal`, and `DotPointGeneratorModal` with the new "Glass & Texture" design system.
    *   Added mesh texture overlays to headers.
    *   Implemented "Discovery Cards" for AI suggestions.
    *   Refined gradients and button states for a premium feel.
*   **Loading Indicator V2:** Refactored `LoadingIndicator` to show dual-layer messaging: a macro status (e.g., "Analysing Structure") and a fast-scrolling micro log (e.g., "Tokenizing input...", "Checking NESA glossary...") to make wait times feel engaging.
*   **Prompt Display:** Increased default font size for readability and added a font-size toggle (Small/Normal/Large). Replaced generic icons with a specific `Globe` icon for scenarios.

---

## [2.1.0] - 2025-05-18 (The "Dev Mode" & Testing Update)

### 🚀 Features
*   **Admin Dev Tools:** Added a "Dev Mode" panel in the Workspace (visible only to Admins).
    *   **Mock Eval:** Instantly populates the evaluation dashboard with dummy data to test UI layouts without using API tokens.
    *   **Mock Improve:** Triggers the Improvement Modal with a simulated response to test the comparison view.
*   **Past HSC Metadata:** Added support for flagging questions as `isPastHSC`, including `hscYear` and `hscQuestionNumber`.
*   **Auto-Save Drafts:** Implemented `userDraft` persistence. The Editor now saves work-in-progress text to `localStorage` on blur or `Ctrl+S`, ensuring students don't lose work if they navigate away.

### 🐛 Fixes
*   **Improvement State Propagation:** Fixed a bug where the "Generate Band X Version" result was invisible because `improvedAnswer` state wasn't being passed down from `App.tsx` to `Workspace.tsx`.
*   **Navigation State:** Fixed an issue where the editor would reset when switching between tabs by syncing `userAnswer` with the selected prompt's ID.

---

## [2.0.0] - 2025-05-15 (The "Architecture" Update)

### 🛠️ Technical Architecture
*   **IndexedDB Integration:** Migrated from `localStorage` to `idb` for main data storage. This allows for storing thousands of courses and history logs without hitting the 5MB browser limit.
*   **API Circuit Breaker:** Implemented `ApiGuard` class to monitor error rates. It automatically blocks outgoing requests for 2 minutes if the error threshold (15 errors/min) is breached, preventing API bans.
*   **Usage Monitoring:** Added `ApiMonitor` to track token usage per session.
*   **Zod Validation:** Implemented strict Zod schemas for all data imports to prevent corrupted state from entering the app.

### 🚀 Features
*   **Library System:** Created a persistent "Library" view where users can save/load Courses and Topics.
*   **Import/Export:** Added a full JSON import flow with a visual "Conflict Resolution" tool (Merge vs Skip).

---

## [1.5.0] - 2025-05-10 (The "Evaluator" Update)

### 🚀 Features
*   **AI Evaluation Engine:** The core feature. Uses `gemini-2.5-pro` to mark student answers against the NESA rubric.
*   **Strict Persona:** Prompt engineered the AI to act as a "Ruthless HSC Marker", prioritising evidence over fluff.
*   **Improvement Loop:** Added the ability to "Upgrade" an answer to the next band. The AI now generates a specific "Next Step" exemplar (e.g., Band 4 -> Band 5) rather than jumping straight to Band 6.
*   **Split-View Modal:** Created `ImprovementReviewModal` to show the student's original answer side-by-side with the AI's improved version for direct comparison.

---

## [1.0.0] - 2025-05-01 (Initial Release)

### 🎉 Launch
*   **Syllabus Navigator:** Hierarchical browsing of Course > Topic > Dot Point.
*   **Basic Editor:** Simple text area for writing responses.
*   **Static Data:** Pre-seeded with "HSC Software Engineering" and "HSC Enterprise Computing" course data.
*   **Command Verb Guide:** Interactive modal explaining NESA verbs (Describe, Explain, Evaluate, etc.).

---

### 🛑 Challenges & Pitfalls (Learning Log)

*   **Challenge:** *AI Hallucinations on Bands.*
    *   *Issue:* The AI would sometimes grade a 3/4 mark answer as "Band 4" and a 4/4 mark answer as "Band 4", failing to differentiate.
    *   *Fix:* We moved the Band logic **out** of the AI prompt and into a strict deterministic TypeScript function (`getBandForMark`). We now trust the AI for the *content* but calculating the *grade* is done mathematically based on the cognitive tier cap.

*   **Challenge:** *React Render Loops.*
    *   *Issue:* `UserProfileModal` caused an "Error #310: Too many re-renders" because of a conditional return statement placed *before* a `useMemo` hook.
    *   *Fix:* Audit of all modals to ensure unconditional hook execution at the top level.

*   **Challenge:** *State Synchronization.*
    *   *Issue:* When a user clicked "Improve Answer", the modal wouldn't appear because the state lived in `useGemini` but the modal was in `Workspace`. When `Workspace` re-rendered due to the data update, the modal unmounted.
    *   *Fix:* Lifted the modal state up to `App.tsx` and rendered the modal in `AppModals.tsx` (root level), ensuring it persists regardless of route changes.