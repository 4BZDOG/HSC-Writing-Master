# HSC AI Evaluator - Data Specifications (v2.2.1)

## 1. Data Philosophy
The system relies on an **Offline-First**, **Validated-Always** approach. All user curriculum data is stored in the browser's IndexedDB.

## 2. Technical Hierarchy
A 5-level recursive structure enforced by Zod schemas:
`Course (Root) -> Topic -> SubTopic -> DotPoint -> Prompt (Leaf)`

### Migration & Versioning
*   **DATA_VERSION**: Currently `2.2.1`.
*   **Automated Migrations**: On app load, `runMigrations()` checks the stored version and applies necessary patches (e.g., recalculating Band scores, repairing verbs, or formatting rubrics).

## 3. The Discovery System (Manifest)
The app utilizes a `/courseData/manifest.json` file to discover "Standard Library" courses.
*   Allows the UI to suggest "Wollemi" or "Enterprise Computing" modules to new users.
*   Synchronizes local IDB with static JSON assets on demand.

## 4. Field-Level Requirements

### Prompt (The Practice Question)
*   **Verb**: Must be upper-case normalized (e.g., "EVALUATE"). Must exist in the `CommandTermInfo` map.
*   **Marks**: Integer (1-20).
*   **Scenario**: Recommended for Tier 3+. Must be > 15 characters to be considered "Complete" by the Audit Studio.
*   **Marking Criteria**: Stored as raw text but parsed via RegEx into a visual hierarchy. Supports "[Mark] marks: [Descriptor]" formatting.

### Sample Answer
*   **Source**: `AI` (Generated), `USER` (Saved), or `HSC_EXEMPLAR` (Pre-seeded).
*   **Band**: Strictly calculated by `getBandForMark(mark, total, tier)`. The Band is CAPPED by the cognitive tier (e.g., an "Identify" question can never yield a Band 6 result).

## 5. Storage Architecture
*   **main_store**: Active courses and curriculum.
*   **backups_store**: Automated hourly snapshots (Last 7 kept).
*   **library_store**: Saved "Templates" for quick loading.
*   **users_store**: User profiles, XP, and preferences.
*   **cache**: AICache (TTL 30 days) for heavy reasoning tasks.

## 6. Export Schema
Portability is maintained via a standard JSON array of `Course` objects. The importer handles duplicate IDs via a interactive resolution UI.