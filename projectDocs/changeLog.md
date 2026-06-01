# HSC AI Evaluator - Change Log

## [2.2.2] - 2026-06-01

### 🛡️ Stabilization & Hardening

- **Crash fix**: Guarded the unguarded `currentCourse.id` access in `AppModals` that crashed the app when a course was deleted while a creator modal was open (residual BUG-01 / QUAL-02).
- **State integrity**: `findAndUpdateItem` now returns a success boolean; `useGemini` skips stale cache writes when a prompt was deleted mid-operation (QUAL-04).
- **Type safety**: Replaced `any` handler bundles (`modalHandlers`, `syllabusHandlers`, `geminiHandlers`, `currentSelection`) with types derived from the source hooks via `Pick` (QUAL-01).
- **Performance**: Delete now uses the optimized `cloneCourses` instead of `JSON.parse(JSON.stringify())` (PERF-01); `AICache` closes its IndexedDB connection on HMR dispose (PERF-03).
- **Data integrity**: Programmatic and discovered-doc imports are now validated against Zod schemas before touching state, making batch imports all-or-nothing per item (UX-01, UX-02).
- **Error UX**: Added CORS and timeout error categories (UX-05); safety-blocked AI responses now use a dedicated `SafetyBlockError` with rephrase-and-retry guidance (UX-03); silent local-save failures now surface a toast (QUAL-03).
- **Enrichment UX**: Background enrichment no longer triggers the full-screen blocking overlay — it shows a subtle inline badge instead (UX-04).
- **Cleanup**: Removed the orphaned duplicate `components/App.tsx`; resolved all `react-hooks/exhaustive-deps` findings and promoted the rule to `error`; gated demo credentials behind `VITE_ENABLE_MOCK_AUTH` (SEC-02).
- **Tests**: Added `stateUtils` unit tests; extended `errorHandler` and `dataManagerUtils` coverage (66 unit tests passing).

## [2.2.1] - 2025-05-23

### 🚀 Features

- **Gemini 3 Pro Integration**: Upgraded evaluation and generation to `gemini-3-pro-preview`.
- **Thinking Config**: Enabled reasoning budgets (up to 8k tokens) for complex marking tasks.
- **Vault Maintenance**: Integrated "Data Vault" into the primary selector for rapid data access.
- **Syllabus Audit v2**: Enhanced validation logic for "Complete" vs "Incomplete" curriculum points.

### 🎨 Design

- **Mesh Overlays**: Added cubic SVG textures to all major header surfaces.
- **Chromatic Progression**: The Editor's theme now dynamically shifts through a quality-based color scale.
- **Luminous Progress**: Refactored the Analysis Progress Bar with segmented high-density tracking and live micro-logs.

### 🔧 Maintenance

- **Documentation Audit**: Synchronized all `projectDocs` to reflect the final architectural state.
- **TypeScript Fixes**: Resolved inheritance issues in `ErrorBoundary` and type assertions in the Library system.
- **Data Integrity**: Implemented a "Repair Verbs" migration to fix mismatched verbs in imported datasets.

---

## [2.2.0] - 2025-05-22

### 🚀 Features

- **Strict Band Logic**: Implemented deterministic math for Band calculation based on Cognitive Tiers.
- **Time Machine**: Added Snapshot preview and restore capabilities to the Database Dashboard.
- **XP System**: Simulated Leveling/XP system for user engagement.

## [2.1.0] - 2025-05-18

### 🚀 Features

- **Admin Audit Studio**: First iteration of the bulk-processing dashboard.
- **Quality Check API**: Added dedicated endpoint for reviewing question/code quality.

## [2.0.0] - 2025-05-15

### 🛠️ Architecture

- **IndexedDB Migration**: Full data persistence layer using `idb`.
- **API Guard**: Circuit breaker implementation to handle rate limits and errors.
