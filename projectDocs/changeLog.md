# HSC AI Evaluator - Change Log

## [2.2.1] - 2025-05-23
### 🚀 Features
*   **Gemini 3 Pro Integration**: Upgraded evaluation and generation to `gemini-3-pro-preview`.
*   **Thinking Config**: Enabled reasoning budgets (up to 8k tokens) for complex marking tasks.
*   **Vault Maintenance**: Integrated "Data Vault" into the primary selector for rapid data access.
*   **Syllabus Audit v2**: Enhanced validation logic for "Complete" vs "Incomplete" curriculum points.

### 🎨 Design
*   **Mesh Overlays**: Added cubic SVG textures to all major header surfaces.
*   **Chromatic Progression**: The Editor's theme now dynamically shifts through a quality-based color scale.
*   **Luminous Progress**: Refactored the Analysis Progress Bar with segmented high-density tracking and live micro-logs.

### 🔧 Maintenance
*   **Documentation Audit**: Synchronized all `projectDocs` to reflect the final architectural state.
*   **TypeScript Fixes**: Resolved inheritance issues in `ErrorBoundary` and type assertions in the Library system.
*   **Data Integrity**: Implemented a "Repair Verbs" migration to fix mismatched verbs in imported datasets.

---

## [2.2.0] - 2025-05-22
### 🚀 Features
*   **Strict Band Logic**: Implemented deterministic math for Band calculation based on Cognitive Tiers.
*   **Time Machine**: Added Snapshot preview and restore capabilities to the Database Dashboard.
*   **XP System**: Simulated Leveling/XP system for user engagement.

## [2.1.0] - 2025-05-18
### 🚀 Features
*   **Admin Audit Studio**: First iteration of the bulk-processing dashboard.
*   **Quality Check API**: Added dedicated endpoint for reviewing question/code quality.

## [2.0.0] - 2025-05-15
### 🛠️ Architecture
*   **IndexedDB Migration**: Full data persistence layer using `idb`.
*   **API Guard**: Circuit breaker implementation to handle rate limits and errors.