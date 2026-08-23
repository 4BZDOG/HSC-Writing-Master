# Syllabus Audit / Import / Delete Improvements — Implementation Plan

## 1. Current-state findings

### 1a. Deletion today

- The only delete path is `confirmDelete` in `hooks/useSyllabusData.ts:659-667`, which calls `deleteSyllabusItem(courses, path, type, id)` in `utils/stateUtils.ts:117-213`. It is a single generic function keyed by `type: 'course'|'topic'|'subTopic'|'dotPoint'|'prompt'` that **splices the whole matched node out of its parent array** via Immer `produce` (e.g. `course.topics.splice(index, 1)` at `utils/stateUtils.ts:153`). There is no "clear children but keep the node" mode anywhere in this function or elsewhere in the repo.
- `confirmDelete` is wired from `components/AppModals.tsx:548` and `App.tsx:410-417`, both going through the shared `ConfirmationModal` (`components/ConfirmationModal.tsx:8-16`, supports `isDestructive`).
- Deletion is **local-only**: `confirmDelete` (`hooks/useSyllabusData.ts:659-667`) never calls `isCurriculumRemote()` or any Supabase write, unlike creates (e.g. `handleCreateSubTopic` at `hooks/useSyllabusData.ts:530-534` posts a `saveSubTopicContribution` when remote). So a new "delete questions, keep structure" function should follow the same local-only pattern — no Supabase call needed.
- `components/admin/ContentAuditModal.tsx` ("Content Audit Studio") has **no delete action at all** today — grepping the file for `delete|remove` (case-insensitive) only matches unrelated `Set.delete()` calls (lines 696, 706, 1153). Its footer action bar (`ContentAuditModal.tsx:1612-1731`) is exclusively AI-generation bulk actions (Questions, Rubrics, Revise Rubrics, Outcomes, Samples, Recalibrate, Screen Quality, Fix All Gaps) — nothing destructive.
- `ContentAuditModal`'s props already include `updateCourses: (updater: (draft: any) => void) => void` (`ContentAuditModal.tsx:113-119`), so it can call a new state-layer delete function directly without new plumbing.
- Node selection in the Studio (`selectedIds`, `toggleSelect` at `ContentAuditModal.tsx:688-702`) already selects a node's whole subtree and there's a `flatMap: Map<id, TreeNode>` for O(1) lookup — this is the natural hook point for "delete questions under selection."

### 1b. Import today (more built than the brief assumes)

There is already a fairly complete JSON structure-import pipeline, split across two independent surfaces:

- **AI-text → structure, with a real preview/consent step**: `components/TopicSyllabusImportModal.tsx` — pastes/URL-fetches syllabus prose, calls `parseSyllabusStructure`, then shows an **editable** preview (`step === 'preview'`, `TopicSyllabusImportModal.tsx:408-511`) where the teacher can remove sub-topics/dot points row-by-row before confirming, and the confirm button explicitly says whether it will create or merge (`removeSubTopic`/`removeDotPoint` at lines 192-200, merge messaging at lines 559-574). This is not JSON import, but it is the UX bar the JSON path should match.
- **Raw JSON file → Topic, with only a validation-stats preview**: `components/TopicImportModal.tsx`. `handleFileDrop` (lines 60-102) parses the file, runs it through `analyzeAndSanitizeImportData` (`utils/dataManagerUtils.ts:724-790`), and — if it's a single `Topic` shape — shows `ValidationSummary` (counts only, no per-node pruning, no "this will merge into X" messaging) before `handleConfirmImport` (lines 104-129) fires `onImport(topic)`.
  - Wired from `components/AppModals.tsx:444-469`: the handler calls `regenerateTopicIds(topic)` (**always mints brand-new ids** for the topic/sub-topics/dot points/prompts/sample answers — `utils/dataManagerUtils.ts:1451-1467`) and then `syllabusHandlers.handleImportTopic(currentCourse.id, placed)`.
  - `handleImportTopic` (`hooks/useSyllabusData.ts:819-847`) looks for an existing topic where `existingTopic.id === topic.id || normalizeText(existingTopic.name) === normalizeText(topic.name)`. Because ids were just regenerated, **the id branch is effectively dead** — matching is really name-only. If it matches, `mergeTopicContents` (`utils/dataManagerUtils.ts:1056-...`) merges in; otherwise the topic is pushed as a new one.
- **Course/topic-level bulk import with genuine conflict handling**: `components/dataManager/ImportFlow.tsx` (mounted from `components/DataManagerModal.tsx`'s `import` tab). Supports: course-level auto name-matching (`ImportFlow.tsx:85-100`), a `ConflictResolutionView` (merge/skip per conflicting course id, using `findConflicts` at `utils/dataManagerUtils.ts:705-708`), a `PlacementReconciliationView` for orphaned groups, and a `selectTarget` step for single-topic files. `handleImportCourses` (`hooks/useSyllabusData.ts:798-817`) applies the resolutions.
- **The actual "create-or-update, matched by stable identity" merge machinery already exists**, cascading top-down: `mergeCourseContents` → `mergeTopicContents` → `mergeSubTopicCollections`/`mergeDotPointCollections` (`utils/dataManagerUtils.ts:1019-1054`) → `mergePromptCollections`/`mergePromptContent` (`utils/dataManagerUtils.ts:937-1017`). Matching is **id-first, normalized-text-fallback** (sub-topic by `name`, dot point by `description`, prompt by `question`) — a reasonable stable-identity surrogate given ids get discarded on JSON reimport.
  - **Concrete gap found**: `mergeDotPointCollections` (`utils/dataManagerUtils.ts:1019-1036`) merges only `description` and recurses into `prompts` — it **never merges `importedDP.focusAreas`**, even though `DotPoint.focusAreas` is a real, schema-validated field (`utils/dataManagerUtils.ts:570`, `types.ts:154`). Reimporting an externally-edited JSON that changed focus areas silently drops that edit. This directly undermines the "improve the JSON externally, reimport cleanly" requirement.
- There is **no "export just this topic" one-click action anywhere near the Audit Studio**. Export exists only via `components/dataManager/ExportFlow.tsx` (mounted from `DataManagerModal`'s `export` tab): pick nodes in a `SelectionTree`, `filterDataBySelection` (`utils/dataManagerUtils.ts:663-703`) prunes the course tree down to the selection, and it downloads via `Blob`/`<a download>` (`ExportFlow.tsx:25-64`). Selecting a single Topic node produces exactly a round-trippable "unit" JSON (a `Course[]` with one course containing one topic) — the capability exists but is buried in a different modal a teacher has to know to open, not reachable from the Studio.
- `exportDataAsJSON`/`importDataFromJSON` (`utils/storageUtils.ts:795-813`) are the full-backup path (whole `Course[]`, validated with `CoursesArraySchema`) — not topic-scoped, used for full-data export/restore and round-trip-tested in `tests/unit/storageMigrations.test.ts:324`.

### 1c. Zod schemas / DATA_VERSION

- `DATA_VERSION = '2.8.0'` (`utils/storageUtils.ts:37`); migrations live in `runMigrations` in the same file, gated with `isOlderThan(fromVersion, 'X.Y.Z')` (pattern visible at `utils/storageUtils.ts:781-789`, e.g. the v2.3.0/v2.4.0 cases).
- Schemas: `TopicSchema`/`CourseSchema`/`DotPointSchema`/`CoursesArraySchema` all in `utils/dataManagerUtils.ts` (`DotPointSchema` at line 562, `focusAreas` field at line 570, `CoursesArraySchema` at line 620). **No new fields are introduced by this plan** — the round-trip shape is exactly today's `Topic`/`Course[]` JSON, already accepted by `analyzeAndSanitizeImportData`. So **no schema change and no `DATA_VERSION` bump is required** unless a step below decides to add an export "envelope" (see Ambiguity #3).

### 1d. Content Audit Studio resize/scroll bug — concrete root cause

`ContentAuditModal.tsx:1271-1277` renders the whole studio as `fixed inset-0 z-[200] ... flex flex-col` — a genuine full-viewport (not a capped/centred) dialog, unlike every other admin modal in the app (e.g. `components/admin/DatabaseDashboard.tsx:426` uses `w-full max-w-5xl ... max-h-[90vh] ... overflow-hidden flex flex-col`, i.e. explicitly bounded). The three flex children are:
- Header, `flex-shrink-0` (`ContentAuditModal.tsx:1280`) — contains the hero row (health ring + metrics + close, `1282-1370`) **and** a `flex flex-wrap` "Smart Select Action Bar" of ~9 controls (search, expand/collapse, 7 filter-count chips) at `1372-1512`. This whole block has **no `max-height` and no `overflow-y`** of its own.
- Tree, `flex-1 min-h-0 overflow-auto` (`ContentAuditModal.tsx:1516`) — this part is correctly built to scroll and shrink.
- Footer, `flex-shrink-0`, height jumps between `min-h-[6rem] py-3` and a hard `h-80` while a batch is running (`ContentAuditModal.tsx:1538`), and independently contains its own `flex flex-wrap` row of ~9 controls (engine selector, sync button, 7 action buttons, `1613-1731`) with no `overflow-y` either.

Because header and footer are `flex-shrink-0` with unconstrained natural height, and the outer container is `fixed inset-0` with no `overflow-y-auto` fallback, **on any viewport shorter than (header height + footer height)** — a laptop at reduced browser height, a tiled/half-screen window, browser zoom >100%, or simply more filter chips wrapping to 3-4 lines — the tree region gets squeezed toward 0px via `min-h-0`, and once header+footer alone exceed the viewport height, the excess is not clippable-and-scrollable by anything: it is genuinely unreachable (no scrollbar appears because the fixed-position box doesn't grow and nothing above it scrolls). This matches the reported symptom exactly ("doesn't resize well… content gets cut off; scrolling… unreliable").

### 1e. Tests already in place (to extend, not duplicate)

- `tests/unit/stateUtils.test.ts` — covers `deleteSyllabusItem` for all 5 node types + path-repair-on-delete; add the new bulk-clear function here.
- `tests/unit/contentAuditStudio.test.tsx` (161 lines) — gap badges, per-action target counts, selection toolbar, Escape-while-processing; extend for the new delete action and any layout assertions that are practical in jsdom.
- `tests/unit/dataManagerUtils.test.ts` (177 lines) and `tests/unit/dataImportIntegrity.test.ts` (337 lines) — `mergeTopicContents`/`mergeCourseContents`, `analyzeAndSanitizeImportData`, `regenerateTopicIds`, `buildTree`, `generateValidationReport`; extend for the `focusAreas` merge fix and any new export/import helpers.
- `tests/unit/storageMigrations.test.ts` (349 lines) — has the existing `exportDataAsJSON`/`importDataFromJSON` round-trip test (line 324) as a model.

---

## 2. Implementation steps

### Step 1 — Data-layer "clear questions, keep structure" function + tests

**Files touched:** `utils/stateUtils.ts`, `tests/unit/stateUtils.test.ts`.

**Behaviour to implement:** add an exported function (next to `deleteSyllabusItem`, same Immer-`produce` idiom):

```ts
export const clearQuestionsInScope = (
  courses: Course[],
  scope: { courseId: string; type: 'course' | 'topic' | 'subTopic' | 'dotPoint'; id: string }
): { updatedCourses: Course[]; clearedCount: number }
```

It locates the target node by `courseId` + (`type`,`id`) using the same traversal style as `findAndUpdateItem` (`utils/stateUtils.ts:37-99`), then recursively walks every `DotPoint` reachable under that node and sets `dotPoint.prompts = []` (never touching `Topic`, `SubTopic`, or `DotPoint` objects themselves, and never touching `focusAreas`). Return the count of prompts actually removed so the caller can show "N questions deleted from «X» — structure kept."

- `type: 'course'` clears every dot point in every topic of that course.
- `type: 'dotPoint'` clears just that one dot point's prompts (equivalent to today's "delete all prompts one by one" but O(1) instead of N delete calls).
- If the target node isn't found, return `{ updatedCourses: courses, clearedCount: 0 }` (mirror `deleteSyllabusItem`'s no-op-on-missing behaviour, do not throw).

**Tests to add** in `tests/unit/stateUtils.test.ts` (model on the existing `deleteSyllabusItem` describe block): clearing at `dotPoint`/`subTopic`/`topic`/`course` scope each (a) empties every `prompts` array in scope, (b) leaves topic/subTopic/dotPoint names, ids, and `focusAreas` untouched, (c) leaves siblings outside the scope untouched, (d) returns the correct `clearedCount`, (e) no-ops safely on an unknown id.

**Acceptance criteria:** pure function, no React/UI dependency, 100% behaviour covered by unit tests, no Supabase call (matches `confirmDelete`'s local-only precedent — see §1a).

**Verify:** `npm test -- --watch utils/stateUtils` then `npm run test:all`.

---

### Step 2 — Fix the `focusAreas` merge gap + add a topic-scoped JSON export action

**Files touched:** `utils/dataManagerUtils.ts`, `tests/unit/dataManagerUtils.test.ts`, `components/dataManager/ExportFlow.tsx` (reference only — reuse `filterDataBySelection`), new small export helper (place in `utils/dataManagerUtils.ts` beside `filterDataBySelection`, e.g. `exportTopicToJsonFile`), `components/admin/ContentAuditModal.tsx`, `tests/unit/contentAuditStudio.test.tsx`.

**Behaviour to implement:**
1. **Bug fix** in `mergeDotPointCollections` (`utils/dataManagerUtils.ts:1019-1036`): when an existing dot point is matched, also merge `focusAreas` — imported wins when present and non-empty (same "imported explicit value wins" rule the codebase already uses for `focusAreas` elsewhere, see `hooks/useSyllabusData.ts:577-598` comment about `undefined` vs `[]` semantics), otherwise keep existing.
2. **New export helper** — a thin, directly-callable wrapper around the existing `filterDataBySelection` + Blob-download logic already proven in `ExportFlow.tsx:25-64`, parameterised by a single topic id (and its course id) instead of a whole `selectedIds` set, e.g. `buildTopicExportPayload(courses: Course[], courseId: string, topicId: string): Course[]` (pure, testable — returns the filtered `Course[]`; the actual `Blob`/`<a download>` browser call stays in the UI layer that invokes it, following the existing `ExportFlow.tsx` pattern).
3. **Wire it into the Studio**: add an "Export JSON" button in `ContentAuditModal.tsx`'s per-node row (or a header action enabled when exactly one topic/course is selected) that calls `buildTopicExportPayload` and downloads the result with the same filename convention as `ExportFlow.tsx:28-50`.

**Tests to add:**
- `tests/unit/dataManagerUtils.test.ts`: a `mergeDotPointCollections`/`mergeTopicContents` case asserting an imported `focusAreas: []` (explicit "no focus areas") and a non-empty imported `focusAreas` both win over the existing value, and that an imported dot point with **no** `focusAreas` key leaves the existing value untouched.
- `tests/unit/dataManagerUtils.test.ts` (or a new `tests/unit/topicExport.test.ts`): `buildTopicExportPayload` returns a `Course[]` with exactly one course/one topic, all prompts/sample answers/focusAreas intact, and is a no-op on an unknown topic id.
- `tests/unit/contentAuditStudio.test.tsx`: the Export button is present/enabled only for an appropriate selection and triggers the download helper (mock `URL.createObjectURL`/`<a>` click, matching how other tests in this file mock DOM APIs).

**Acceptance criteria:** exported JSON for a topic, fed straight back through `analyzeAndSanitizeImportData` (Step 3), round-trips with no data loss including `focusAreas`.

**Verify:** unit tests above; `npm run test:all`.

---

### Step 3 — JSON import-with-consent: bring `TopicImportModal`'s preview to parity, wire it from the Studio

**Files touched:** `components/TopicImportModal.tsx`, `components/AppModals.tsx`, `components/admin/ContentAuditModal.tsx`, `tests/unit/dataImportIntegrity.test.ts`, `tests/unit/contentAuditStudio.test.tsx`, possibly a new `tests/unit/topicImportPreview.test.tsx`.

**Behaviour to implement:** the create-or-update merge engine (`mergeTopicContents`/`mergeSubTopicCollections`/`mergeDotPointCollections`/`mergePromptCollections`, §1b) already does "match by stable identity, fall back to text, merge don't duplicate" — this step is about making that visible and adjustable to the user **before** it applies, matching the bar `TopicSyllabusImportModal.tsx:408-511` already sets for AI-parsed imports:

1. In `TopicImportModal.tsx`'s `preview` step, compute (pure, testable — put it in `utils/dataManagerUtils.ts` as e.g. `previewTopicMergePlan(existingTopics: Topic[], importedTopic: Topic)`), returning something like `{ matchedTopic: Topic | null; newSubTopics: number; matchedSubTopics: number; newDotPoints: number; matchedDotPoints: number; newPrompts: number; matchedPrompts: number }` by walking the same id-then-text matching rules the merge functions use (do not run the merge itself — just report what *would* match).
2. Render that plan in the preview step (replacing/augmenting the current stats-only `ValidationSummary`) — e.g. "Will merge into «Photosynthesis» — 2 new sub-topics, 1 matched (3 new dot points inside), 4 questions matched and updated, 6 new questions added." When there's no name match, show "Will create a new topic «X»."
3. Keep the existing per-node pruning UX from `TopicSyllabusImportModal.tsx` (remove a sub-topic/dot point before import) — port the same `removeSubTopic`/`removeDotPoint`-style controls into `TopicImportModal.tsx`'s preview so a teacher can drop anything the external tool got wrong before committing, exactly satisfying "reviewing/adjusting the proposed structure before it's applied."
4. Reachability: add an "Import JSON…" entry point directly in `ContentAuditModal.tsx` (per-topic row action, or a header button that opens `TopicImportModal` pre-scoped to the selected topic's course) — currently `TopicImportModal` is only reachable via a different part of the UI (`AppModals.tsx:444-469` shows it's gated on `currentCourse`, wired from wherever `openModal('topicImport')` is currently called; confirm that call site and either reuse it or add a Studio-local trigger that calls the same `openModal('topicImport')` with the Studio's currently-selected course/topic as context).

**Do not change** `regenerateTopicIds` or the id-then-name matching strategy itself — see Ambiguity #1 for why this is a deliberate scope boundary, not an oversight.

**Tests to add:**
- `tests/unit/dataImportIntegrity.test.ts` or a new file: `previewTopicMergePlan` — matches an existing topic by name, counts new vs matched sub-topics/dot points/prompts correctly (including the prompt-matched-by-normalized-question-text case), and reports "no match" (create-new) when nothing matches.
- `tests/unit/contentAuditStudio.test.tsx`: the Studio's "Import JSON" entry point opens `TopicImportModal` with the right course context.
- A round-trip test: export a topic (Step 2's helper) → mutate a field in the resulting JS object (simulate "improved externally") → run it back through `analyzeAndSanitizeImportData` + `previewTopicMergePlan` + `mergeTopicContents` → assert the topic/sub-topic/dot-point/prompt counts in the result equal the original counts (no duplicates), and the mutated field won.

**Acceptance criteria:** a teacher can export a topic (Step 2), edit the JSON externally, reimport it, see an accurate before-you-commit summary of what will be created vs. matched-and-updated, prune anything wrong, and confirm — ending with the same structure, no duplicate topics/sub-topics/dot points/prompts.

**Verify:** unit tests above; manual check — export a topic from the Studio, edit a prompt's `keywords` and a dot point's `focusAreas` in the downloaded file, reimport, confirm the edits land on the existing nodes (not duplicated).

---

### Step 4 — Audit Studio UI: "Delete Questions, Keep Structure"

**Files touched:** `components/admin/ContentAuditModal.tsx`, `tests/unit/contentAuditStudio.test.tsx`.

**Behaviour to implement:**
1. Add a destructive action — button in the per-node row (`renderNode`, `ContentAuditModal.tsx:1172-1251`, alongside the existing checkbox/expand controls, or a new footer button next to "Fix All Gaps" that operates on `selectedIds`) — "Clear Questions" scoped to whatever node(s) are selected. Compute the target scopes from `selectedIds` the same way the existing `selectionTargets` aggregation does (top-level selected ancestors only, to avoid double-clearing a dot point whose parent topic is also selected).
2. On click, open the shared `ConfirmationModal` (`components/ConfirmationModal.tsx`, `isDestructive`) with a message naming the scope and a live-computed question count, e.g. "Delete all 42 questions under «Cell Biology»? Sub-topics, dot points and the topic itself are kept — you can reimport questions into this exact structure afterward."
3. On confirm, call `clearQuestionsInScope` (Step 1) via `updateCourses`, and `showToast` the returned `clearedCount`.

**Tests to add** in `tests/unit/contentAuditStudio.test.tsx`: the button appears and is disabled with nothing selected; confirming it calls `updateCourses` with a draft that empties `prompts` but leaves node names/ids/`focusAreas` intact; the confirmation copy names the correct scope and count; cancelling leaves data untouched.

**Acceptance criteria:** exactly the requirement — questions gone, Topic/SubTopic/DotPoint/FocusArea structure intact, reimport (Step 3) lands cleanly back into the same nodes.

**Verify:** unit tests; manual check in the running app — clear questions under a topic, confirm the topic/sub-topics/dot points still show in the tree with 0 questions, then reimport the topic's previously-exported JSON (Step 2/3) and confirm the questions return without new duplicate nodes.

---

### Step 5 — Audit Studio resize/scroll CSS fix

**Files touched:** `components/admin/ContentAuditModal.tsx` only.

**Behaviour to implement**, addressing the root cause in §1d directly:
1. Give the header (`ContentAuditModal.tsx:1280`) a `max-h-[45vh] overflow-y-auto` (or similar) so a wrapped filter-chip row can never itself exceed a sane share of the viewport and gains its own scrollbar (`custom-scrollbar`, matching the class already used at `ContentAuditModal.tsx:1516`) instead of pushing content off-screen with no way back.
2. Give the footer's non-processing content (`ContentAuditModal.tsx:1538`) the same treatment — cap its wrapped-button-row height and let it scroll internally, or restructure the row to wrap onto a second visual line inside a bounded, scrollable strip rather than growing `flex-shrink-0` height unbounded. Confirm the existing `h-80` processing-state height still fits comfortably below a `max-h` cap.
3. As a belt-and-braces fallback (matching the bounded-dialog pattern already used everywhere else in the app, e.g. `DatabaseDashboard.tsx:426`), consider adding `overflow-y-auto` to the *outer* `fixed inset-0 ... flex flex-col` container itself, so that even if header+footer content somehow still exceeds viewport height, the whole studio becomes page-scrollable rather than silently clipping. This is the cheapest, lowest-risk fix if the header/footer max-height approach proves fiddly with the existing `transition-all duration-500` height animation on the footer — see Ambiguity #2.
4. Re-check the tree container's `min-w-[700px]` (`ContentAuditModal.tsx:1517`) still behaves sensibly (horizontal scroll is intentional there for deep tree indentation — do not remove it, just confirm it's not contributing to the vertical problem).

No behavioural/logic changes — this step is CSS/className only, so no new unit test coverage is expected beyond a smoke check that the modal still renders and existing `tests/unit/contentAuditStudio.test.tsx` assertions (button presence, click handlers) still pass unchanged (jsdom doesn't lay out real heights, so this step is primarily verified manually).

**Acceptance criteria:** at a small viewport (e.g. resize the browser to ~700px tall, or use dev-tools device toolbar at a short height), every header control, every tree row, and every footer button remains reachable via scrolling — nothing is permanently clipped off-screen.

**Verify:** `npm run test:all` (regression only); manual check — open the Studio at several viewport heights (short laptop window, half-screen tiled window, 125%/150% browser zoom) and confirm no control becomes unreachable.

---

### Step 6 — Wiring, polish, full suite

**Files touched:** whatever loose ends steps 1-5 leave (e.g. `projectDocs/changeLog.md` entry, any prop-typing cleanup in `ContentAuditModal.tsx` if new props were threaded through from `AppModals.tsx`), plus a final pass over all new/changed tests.

**Behaviour to implement:**
1. Confirm the "Import JSON" entry point added in Step 3 and the "Export JSON"/"Clear Questions" actions added in Steps 2/4 are all reachable from the same Studio session without closing/reopening modals unnecessarily (per the house rule that only one modal is open at a time via `useModalManager` — confirm `TopicImportModal` opening from within `ContentAuditModal` follows the existing single-modal-stack convention rather than nesting).
2. Add a short entry to `projectDocs/changeLog.md` describing the three changes (delete-questions-keep-structure, topic export/reimport round-trip, Studio resize fix), matching the existing changelog's style/section format.
3. Run the full check suite and fix anything red.

**Acceptance criteria / verify:** `npm run test:all` passes (lint + unit + type-check) with zero regressions and the coverage floor in `vitest.config.ts` (lines 63/functions 59/branches 57/statements 62) still met or improved; manual end-to-end walkthrough of all three features in the running app (`npm run dev`).

---

## 3. Ambiguities / judgment calls for the implementing engineer

1. **Whether to make topic reimport truly id-stable.** The existing pipeline discards ids on JSON reimport (`regenerateTopicIds`, `utils/dataManagerUtils.ts:1451-1467`) and matches by normalized name/description/question text instead. This plan deliberately keeps that behaviour (fixing only the `focusAreas` gap and the missing preview) rather than switching to "trust the ids in the file," because: (a) the id-then-text fallback is already exercised by real code paths and tests, (b) trusting incoming ids as authoritative would let a malformed/hand-edited file silently overwrite an unrelated existing node that happens to reuse an id, and (c) text-based matching is what already makes the AI-parsed-text import (`TopicSyllabusImportModal`) work today. If the user specifically wants **id-authoritative** reimport (e.g. exported ids are guaranteed unique and external tools are trusted to preserve them), that's a materially different, larger change — worth a follow-up conversation rather than folding it silently into Step 3.
2. **Studio layout fix strategy** (Step 5): capping header/footer height with their own internal scroll vs. making the whole dialog page-scrollable are both valid; the plan recommends trying the internal-scroll approach first (keeps the tree always visible, matching the Studio's "always show the data" design intent) but flags the whole-page-scroll fallback because the footer's existing `transition-all duration-500` height animation (`ContentAuditModal.tsx:1538`) may fight with an added `max-h`/`overflow-y-auto` in ways that need visual iteration a text-only plan can't fully predict.
3. **Export "envelope" format.** This plan keeps topic export as a bare `Course[]` (identical to today's `ExportFlow.tsx` output) rather than wrapping it in a versioned envelope (e.g. `{ formatVersion, exportedAt, data }`). If a future need arises to detect "this JSON was exported by an older app version" during reimport, that would need a new optional envelope shape, a Zod schema for it, and a `DATA_VERSION` bump per the house rule in `.claude/skills/hsc-feature.md` — out of scope here because nothing in the three requirements asks for it and the existing bare-array shape already round-trips.
4. **Scope of "delete questions" — per-node vs. whole-selection.** Step 1's `clearQuestionsInScope` takes one scope at a time; Step 4 loops it over top-level selected ancestors. An alternative would be a single call that takes an array of scopes. Either is fine; the plan picked "one call per top-level selected node" because it matches how `deleteSyllabusItem` is invoked today (one call per delete) and keeps the new function's contract simple to test in isolation — but it's a legitimate implementation choice either way.
5. **Where exactly `openModal('topicImport')` is currently triggered from**, so Step 3's "add an entry point in the Studio" reuses the right wiring rather than duplicating it — this needs a quick grep of `useModalManager`'s consumers at implementation time (not fully traced in this research pass, since it wasn't load-bearing for the plan's correctness).
