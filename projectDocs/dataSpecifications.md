# HSC AI Evaluator - Data Specifications (v2.2.1)

## 1. Data Philosophy

The system relies on an **Offline-First**, **Validated-Always** approach. All user curriculum data is stored in the browser's IndexedDB.

## 2. Technical Hierarchy

A 5-level recursive structure enforced by Zod schemas:
`Course (Root) -> Topic -> SubTopic -> DotPoint -> Prompt (Leaf)`

### Migration & Versioning

- **DATA_VERSION**: Currently `2.49.0` (`utils/storageUtils.ts`).
- **Automated Migrations**: On app load, `runMigrations()` checks the stored version and applies necessary patches (e.g., recalculating Band scores, repairing verbs, or formatting rubrics).

## 3. The Discovery System (Manifest)

The app utilises a `/courseData/manifest.json` file to discover "Standard Library" courses.

- Allows the UI to suggest "Wollemi" or "Enterprise Computing" modules to new users.
- Synchronises local IDB with static JSON assets on demand.

## 4. Field-Level Requirements

### Prompt (The Practice Question)

- **Verb**: Must be upper-case normalized (e.g., "EVALUATE"). Must exist in the `CommandTermInfo` map.
- **Marks**: Integer (1-20).
- **Scenario**: Recommended for Tier 3+. Must be > 15 characters to be considered "Complete" by the Audit Studio.
- **Scenario Image**: Optional `scenarioImage: ScenarioImageRef` (`id`, `alt?`, `updatedAt`, `storagePath?`) — a lightweight reference only. The image bytes themselves live in the `scenario_images_store` IDB object store (see `utils/scenarioImageStorage.ts`), keyed by the owning Prompt's id, never inline on the Prompt/Course JSON blob. `components/ScenarioCarousel.tsx` toggles between the scenario text and this image when both are present.
- **Marking Criteria**: Stored as raw text but parsed via RegEx into a visual hierarchy. Supports "[Mark] marks: [Descriptor]" formatting.

### Sample Answer

- **Source**: `AI` (Generated), `USER` (Saved), or `HSC_EXEMPLAR` (Pre-seeded).
- **Band**: Strictly calculated by `getBandForMark(mark, total, tier)`. The Band is CAPPED by the cognitive tier (e.g., an "Identify" question can never yield a Band 6 result).

## 5. Storage Architecture

- **main_store**: Active courses and curriculum.
- **backups_store**: Automated hourly snapshots (Last 7 kept).
- **library_store**: Saved "Templates" for quick loading.
- **users_store**: User profiles, XP, and preferences.
- **scenario_images_store**: Scenario/diagram image bytes (data URL), keyed by Prompt id — kept out of the `courses_data` blob deliberately (see `Prompt.scenarioImage` above).
- **cache**: AICache (TTL 30 days) for heavy reasoning tasks.

### Draft durability

A draft goes from the keyboard to IndexedDB in three steps, and each step has its own guard.

1. **In memory, at once.** Typing sets the prompt's `userDraft` in the library state. The writing card flushes it one second after typing stops, and again on the way out (`pagehide`, the tab becoming hidden, unmount).
2. **To IndexedDB, in one transaction.** `saveCoursesMerged` (`utils/storageUtils.ts`) writes `courses_data` and `courses_rev` together. `courses_rev` is a counter that every write of the library bumps. When the stored revision is the one this tab last saw, nothing else has written, and the library is written without being read back. Otherwise the stored library is read in the same transaction and merged (`utils/draftMerge.ts`): another tab's draft replaces this tab's only where this tab has not changed that draft since its last read or write (its draft base). `draftElapsedSeconds` takes the larger total, so time is never handed back.
3. **Brought up to date when the tab is seen again.** On window focus, or when the tab becomes visible, `pullForeignDrafts` (`hooks/useSyllabusData.ts`) takes the drafts another tab has written, unless a save is in flight.

**The closing-tab stash.** An IndexedDB write started on the way out is aborted when the page goes, so the words are also written synchronously to localStorage under `hsc.pendingDraft` as `{ promptId, text, elapsed, prev, at }`. `prev` is the draft this tab last knew was stored. On the next load the stash is applied only if the stored draft still equals `prev` and the text differs (`decidePendingDraft`, `utils/pendingDraft.ts`); otherwise it is discarded. It is cleared once a save holds its text. Text over 200,000 characters is not stashed.

| Key                      | Where                                         | Holds                                                                      |
| ------------------------ | --------------------------------------------- | -------------------------------------------------------------------------- |
| `courses_data`           | IndexedDB `hsc-ai-evaluator-db`, `main_store` | The library                                                                |
| `courses_rev`            | same                                          | The library's revision, bumped by every write                              |
| `hsc.pendingDraft`       | localStorage                                  | The closing-tab stash                                                      |
| `hsc.focus.promptHeight` | localStorage                                  | The question card's height in Focus Mode, clamped on read                  |
| `hsc.writingMode`        | sessionStorage                                | `exam` only: a reload mid-sitting stays in Exam; a new tab starts in Coach |

Rules for changing it:

- A personal per-prompt field (the student's words or time, not an edit to the course) must be listed in `PERSONAL_PROMPT_FIELDS` (`utils/shippedCourseStamp.ts`). Otherwise a shipped-course refresh overwrites it. If two tabs must share it, it also belongs in `DraftFields` and the merge in `utils/draftMerge.ts`.
- These changes needed no `DATA_VERSION` bump, because the shape of the library did not change. A library saved before `courses_rev` existed reads its revision as unknown, so its first save takes the merge path.

Known limits:

- Only the two personal fields merge. Everything else (course structure, marking guides, course names) is last save wins across tabs.
- Two tabs typing in the same question is last save wins too: a draft this tab has typed in since its last read or write is kept as it is.
- Storage that refuses writes makes the stash a no-op, and the footer says "Not saved".

## 6. Export Schema

Portability is maintained via a standard JSON array of `Course` objects. The importer handles duplicate IDs via a interactive resolution UI.
