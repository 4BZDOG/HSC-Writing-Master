# Plan — P1 Follow-ups (post navigator-tactility / scenario-image-carousel)

Status: draft for implementation. Three independent items, each self-contained.
None touch each other's files.

---

## 1. Wire Supabase sync for scenario images

### What exists today (confirmed by reading the code)

- `utils/scenarioImageStorage.ts` — the only read/write path for image bytes,
  entirely local (IndexedDB `scenario_images_store`, keyed by `promptId`).
- `types.ts`'s `ScenarioImageRef` (line 95) already has an optional
  `storagePath?: string`, documented as "present only once synced to Supabase
  Storage (bucket `scenario-images`, object path `${promptId}/${id}`)".
- `supabase/schema.sql` (line ~427) has the three columns
  (`scenario_image_path`, `scenario_image_alt`, `scenario_image_updated_at`)
  and the `scenario-images` bucket row, but the Storage RLS policies are
  still a `-- TODO(security-review):` draft (`Plan-P0Followups.md` item 1) —
  **not applied to any real database**.
- `services/contributionService.ts`'s `promptToRow` (line 73) is a **pure,
  directly unit-tested mapper** (`tests/unit/contributionService.test.ts`) —
  it must stay IO-free.
- `services/curriculumService.ts`'s `mapPrompt`/`assembleCourses` (lines
  148–233) are likewise a pure, unit-tested read-side assembler
  (`tests/unit/curriculumService.test.ts`).
- Nothing in the codebase currently calls `supabase.storage.*` anywhere —
  this is genuinely new ground, same as the RLS policies were.
- `services/supabaseClient.ts` exports the raw `supabase` client — the same
  client the Storage SDK hangs off (`supabase.storage.from(bucket)`).

### Design

**New file: `services/scenarioImageSyncService.ts`** — two fail-soft
functions, both no-ops when `supabase` is null (mirrors every other
Supabase-optional path in this app):

```ts
import { supabase } from './supabaseClient';
import { loadScenarioImage, saveScenarioImage } from '../utils/scenarioImageStorage';
import { ScenarioImageRef } from '../types';

const BUCKET = 'scenario-images';

/**
 * Upload a prompt's locally-cached scenario image to Supabase Storage, if
 * present and not already uploaded. Fails soft: ANY error — no Supabase
 * configured, no local bytes, a network failure, or (today, expected) a
 * permission failure because the bucket's RLS policies are still an
 * unapplied draft (see Plan-P0Followups.md item 1) — resolves to the ref
 * unchanged rather than throwing. A prompt submission must never fail
 * because its image couldn't sync.
 */
export const syncScenarioImageUp = async (
  promptId: string,
  ref: ScenarioImageRef | undefined
): Promise<ScenarioImageRef | undefined> => {
  if (!ref || !supabase) return ref;
  if (ref.storagePath) return ref; // already synced — don't re-upload unchanged bytes
  try {
    const cached = await loadScenarioImage(promptId);
    if (!cached) return ref;
    const { blob, contentType } = dataUrlToBlob(cached.dataUrl);
    const path = `${promptId}/${ref.id}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { contentType, upsert: true });
    if (error) {
      console.warn('[ScenarioImage] Upload failed (non-fatal):', error.message);
      return ref;
    }
    return { ...ref, storagePath: path };
  } catch (err) {
    console.warn('[ScenarioImage] Upload failed (non-fatal):', err);
    return ref;
  }
};

/**
 * Download a Storage-hosted scenario image into the local IDB cache, when a
 * prompt carries a `storagePath` but has no local bytes yet (e.g. viewing a
 * prompt someone else contributed, on a fresh device/browser). Fails soft
 * for the same reasons as the upload path.
 */
export const syncScenarioImageDown = async (
  promptId: string,
  ref: ScenarioImageRef | undefined
): Promise<void> => {
  if (!ref?.storagePath || !supabase) return;
  if (await loadScenarioImage(promptId)) return; // already cached
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(ref.storagePath);
    if (error || !data) {
      console.warn('[ScenarioImage] Download failed (non-fatal):', error?.message);
      return;
    }
    await saveScenarioImage(promptId, await blobToDataUrl(data), ref.alt);
  } catch (err) {
    console.warn('[ScenarioImage] Download failed (non-fatal):', err);
  }
};

// dataUrlToBlob / blobToDataUrl: small private helpers (FileReader +
// atob-based decode), same style already used in utils/scenarioImageCodec.ts.
```

**Upload wiring — `services/contributionService.ts`:**

1. Extend `PromptInsertRow` (line 30) with three nullable fields:
   `scenario_image_path: string | null`, `scenario_image_alt: string | null`,
   `scenario_image_updated_at: string | null`.
2. Extend `promptToRow` (line 73, stays pure) to map them straight off
   whatever `prompt.scenarioImage` it's given:
   ```ts
   scenario_image_path: prompt.scenarioImage?.storagePath ?? null,
   scenario_image_alt: prompt.scenarioImage?.alt ?? null,
   scenario_image_updated_at: prompt.scenarioImage
     ? new Date(prompt.scenarioImage.updatedAt).toISOString()
     : null,
   ```
3. `savePromptContribution` (line 422) does the upload _before_ mapping,
   then returns the resolved ref so the caller can persist it locally (so a
   second submission of the same prompt doesn't re-upload unchanged bytes):

   ```ts
   export const savePromptContribution = async (
     dotPointAppId: string,
     prompt: Prompt,
     status: ContributionStatus = 'private',
     quality?: QualityScreen
   ): Promise<{ id: string; scenarioImage?: ScenarioImageRef }> => {
     const userId = await currentUserId();
     const dotPointId = await resolveRowId('dot_points', dotPointAppId);
     if (!dotPointId) throw new Error('Could not find the dot point to attach this prompt to.');
     const scenarioImage = await syncScenarioImageUp(prompt.id, prompt.scenarioImage);
     const id = await upsertOwned(
       'prompts',
       promptToRow({ ...prompt, scenarioImage }, dotPointId, userId, status, quality)
     );
     return { id, scenarioImage };
   };
   ```

   Return-type change is safe: `App.tsx:214` is the **only** call site
   (`await savePromptContribution(...)`, result currently discarded).

4. `App.tsx`'s `handleSubmitPromptToLibrary` (line 205): capture the
   returned `scenarioImage` and, if it now carries a `storagePath` it didn't
   have before, push it back onto local state via the existing
   `updateCourses`/prompt-update path so the resolved path is persisted
   (same idea as the `newlyAddedIds` bookkeeping already there) — small
   addition, not a new pattern.

**Download wiring — `components/ScenarioCarousel.tsx`:**

Extend the existing `loadScenarioImage` effect (lines 49–65): when the local
lookup comes back empty but `scenarioImage.storagePath` is present, call
`syncScenarioImageDown` then re-read from IDB, before giving up and showing
"Image unavailable.":

```ts
useEffect(() => {
  if (!scenarioImage) {
    setImageDataUrl(null);
    return;
  }
  let cancelled = false;
  setIsLoadingImage(true);
  (async () => {
    let row = await loadScenarioImage(scenarioImage.id);
    if (!row && scenarioImage.storagePath) {
      await syncScenarioImageDown(scenarioImage.id, scenarioImage);
      row = await loadScenarioImage(scenarioImage.id);
    }
    if (!cancelled) {
      setImageDataUrl(row?.dataUrl ?? null);
      setIsLoadingImage(false);
    }
  })();
  return () => {
    cancelled = true;
  };
}, [scenarioImage?.id, scenarioImage?.updatedAt, scenarioImage?.storagePath]);
```

This is deliberately **lazy** (download only when the carousel is actually
rendered for a given prompt), not a bulk hydration pass over the whole
course tree during `fetchRemoteCourses()` — avoids new startup
latency/bandwidth for a feature most prompts won't have, and reuses the
carousel's existing `Loader2`/"Image unavailable." fail states for free.

**Read-path mapping — `services/curriculumService.ts`:**

1. Extend `PromptRow` (line 66) with the three matching nullable fields
   (the existing `select('*')` at line 301 already returns them once the
   schema columns exist — no query change needed).
2. Extend `mapPrompt` (line 148) to build the ref:
   ```ts
   scenarioImage: row.scenario_image_path
     ? {
         id: appId(row),
         alt: row.scenario_image_alt ?? undefined,
         updatedAt: row.scenario_image_updated_at
           ? new Date(row.scenario_image_updated_at).getTime()
           : Date.now(),
         storagePath: row.scenario_image_path,
       }
     : undefined,
   ```

### Task list

1. New file `services/scenarioImageSyncService.ts` (`syncScenarioImageUp`,
   `syncScenarioImageDown`, private `dataUrlToBlob`/`blobToDataUrl`).
2. `services/contributionService.ts`: extend `PromptInsertRow`, `promptToRow`
   (stays pure), `savePromptContribution` (adds the upload step + return
   shape change).
3. `App.tsx`: update `handleSubmitPromptToLibrary` for the new return shape;
   persist the resolved `scenarioImage.storagePath` back to local state.
4. `services/curriculumService.ts`: extend `PromptRow`, `mapPrompt`.
5. `components/ScenarioCarousel.tsx`: extend the load effect with the
   download-and-cache fallback.
6. Do **not** touch `supabase/schema.sql`'s RLS TODO — this code will fail
   permission checks against a live, unreviewed database by design until a
   human approves `Plan-P0Followups.md` item 1; that's expected, not a bug
   to fix here.

### Tests to run / add

- `npm test -- tests/unit/contributionService.test.ts` — extend with a case
  asserting `promptToRow` maps `scenarioImage.storagePath/alt/updatedAt`
  into the three new columns, and defaults them to `null` when absent.
- `npm test -- tests/unit/curriculumService.test.ts` — extend with a case
  asserting a row with `scenario_image_path` set produces a `scenarioImage`
  ref on the mapped `Prompt`.
- New unit test: `tests/unit/scenarioImageSyncService.test.ts` — mock
  `supabase.storage.from(...).upload/download` to cover: no-op when
  unconfigured, no-op when already synced, graceful `console.warn`-and-return
  on an error response (this is the RLS-still-a-draft path — must not throw).
- `npm run type-check`, `npm run test:all`.

---

## 2. Syllabus navigator progress/completion cues

### What's already there (confirmed by reading `components/PromptSelector.tsx`)

The Question-stage `promptOptions` (line 677) **already** does exactly this
kind of thing per-question: `useAttemptHistory(dotPointPromptIds)` (line 659)
feeds an "Attempted" / "You: N/M" chip into each question row (lines
767–780). That part of this ask is done, not deferred — nothing to add there.

The genuinely uncovered spot: `subTopicOptions` (line 504–520), the
Sub-Topic `Combobox`'s options. Course (`courseOptions`, line 398) and Topic
(`topicOptions`, line 482) options both already carry a `CoverageChip`
(dot-points-with-questions percentage, curator-only). Sub-Topic is the one
stage with **no** count at all — just an icon and a name. And unlike the
original navigator-tactility plan's finding (which was about `TreeItem` in
`utils/dataManagerUtils.ts`, a different component's data model entirely),
`SubTopic.dotPoints[].prompts[]` is **already fully present** in the
`courses` prop this component receives — a plain question-count badge needs
zero new data plumbing, no new fetch, no hook.

### Concrete change

**`components/PromptSelector.tsx`**, `subTopicOptions` (line 504–520):

```tsx
const subTopicOptions = useMemo(
  () =>
    selectedTopic?.subTopics?.map((st) => {
      const questionCount = st.dotPoints.reduce((n, dp) => n + (dp.prompts?.length ?? 0), 0);
      return {
        id: st.id,
        label: st.name,
        isNew: newlyAddedIds.has(st.id),
        renderLabel: (
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-md bg-indigo-500/20 text-indigo-500 light:bg-indigo-100 light:text-indigo-700 border border-indigo-500/20 flex-shrink-0">
              <FolderOpen className="w-4 h-4" />
            </div>
            <span className="font-medium flex-1 min-w-0 truncate">{st.name}</span>
            {questionCount > 0 && (
              <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wider text-indigo-500/80 light:text-indigo-700">
                {questionCount} question{questionCount === 1 ? '' : 's'}
              </span>
            )}
          </div>
        ),
      };
    }) || [],
  [selectedTopic, newlyAddedIds]
);
```

Notes on why this shape:

- `FolderOpen` is already imported (used at the existing line 513) — no new
  import.
- Colour: `indigo-500`, matching this exact row's own icon tint (line 512)
  — not a new colour, same convention `CoverageChip` and the dot-point
  "N focus areas" badge (line 544, emerald) already use: badge tint = the
  row's own accent.
- Structure (`flex-1 min-w-0 truncate` + trailing badge) copies the
  Course/Topic option layout verbatim (lines 409–412), so a Sub-Topic row
  now reads consistently with the two stages above it instead of looking
  sparser.
- Zero-count sub-topics show no badge (`questionCount > 0 &&`), same
  "nothing to report is not a 0%" principle `CoverageChip` already uses
  (line 26) — an empty sub-topic isn't flagged as broken, just quiet.
- Deliberately **not** curator-gated (unlike `CoverageChip`) — a student
  benefits from "how much is in here" just as much as a teacher; it's
  descriptive, not a moderation signal.

### Explicitly out of scope for this pass (documented, not silently dropped)

An **attempted-fraction** badge (e.g. "2/3 answered") at the Sub-Topic stage
would need `useAttemptHistory` called with every prompt id across _all_ of
the selected topic's sub-topics (a wider id list than the Question stage's
`dotPointPromptIds`, which is scoped to one dot point) — an extra
`fetchMyAttempts` round trip per topic selection. Worth doing later, but
it's a second, separable change from the free, no-fetch question count
above; keeping this pass to the zero-cost version matches "much smaller
than a TreeItem schema change."

### Task list

1. Edit `components/PromptSelector.tsx`: apply the `subTopicOptions` change.
2. Manually sanity-check in the dev server: select a course/topic with a
   mix of empty and populated sub-topics, confirm counts match, confirm no
   badge on an empty sub-topic, confirm no layout shift/new colours.

### Tests to run

- `npm run type-check`.
- Any existing Vitest coverage of `PromptSelector.tsx` (check `tests/unit/`)
  — keep passing; add a case asserting a sub-topic option's rendered label
  contains the correct question count if a test file already renders this
  component's options.
- `npm run test:all`.

---

## 3. Wire the scenario-image affordance into `ManualPromptModal.tsx`

### Investigation: is there a stable id at draft time?

**Yes.** `services/geminiService.ts`'s `refineManualPrompt` (line 977)
builds the returned `Prompt` with `id: generateId('prompt')` (line 1088) —
this happens the moment "Refine" succeeds, at the _start_ of the modal's
`preview` step, not at final save. `ManualPromptModal.tsx`'s `handleConfirm`
(line 259) spreads `...result` unchanged into `onSave(...)`, so `result.id`
_is_ the prompt's final id. This means `ScenarioImageUploader.tsx`'s
existing immediate-commit design (writes to IDB the moment an image is
pasted, keyed on `promptId`) can be wired in exactly as `PromptDisplay.tsx`
already does it — **no deferred-commit variant needed**, `promptId={result.id}`
is already correct and stable for the whole `preview` step.

The one real wrinkle: unlike `PromptDisplay.tsx` (editing an _already-saved_
prompt, where the id will always resolve to something), this modal can
discard the draft entirely, or re-run "Refine" (which mints a **new** id via
a fresh `generateId('prompt')` call, line 246–250 already overwrites
`editedQuestion`/`editedScenario`/`editedCriteria` wholesale on re-refine —
same "nothing survives a re-refine" pattern already exists for every other
field). Either path leaves the just-committed IDB row an orphan, keyed on an
id no prompt will ever have. This plan adds explicit cleanup for both.

### Concrete changes — `components/ManualPromptModal.tsx`

1. Imports: add `ImagePlus` to the existing `lucide-react` import list
   (line 16–32); add
   `import ScenarioImageUploader from './ScenarioImageUploader';` and
   `import { deleteScenarioImage } from '../utils/scenarioImageStorage';`.

2. New state, alongside the other step-2 state (near line 161):
   `const [isUploadingImage, setIsUploadingImage] = useState(false);`

3. `handleClose` (line 197) — accept a `saved` flag so it can distinguish a
   real discard from the close-after-save it already does at the end of
   `handleConfirm`:

   ```tsx
   const handleClose = (saved = false) => {
     if (isRefining) return;
     if (!saved && result?.scenarioImage) {
       // Committed to IDB the moment it was pasted (ScenarioImageUploader is
       // immediate-commit) — discarding the draft must not leave it behind
       // as an orphan keyed on an id no prompt will ever have.
       void deleteScenarioImage(result.id);
     }
     resetAll();
     onClose();
   };
   ```

   All existing call sites (`guard.requestClose`, `guard.requestCloseFromBackdrop`,
   `useEscapeKey(..., guard.requestClose)`, the `X` button, `confirmDiscard`)
   call it via `useDiscardGuard`'s `close` callback with no args — they all
   correctly default to `saved = false`. Only `handleConfirm` needs updating.

4. `handleConfirm` (line 259): change the trailing call to
   `handleClose(true);` so a successful save does **not** delete the image
   it just told the caller about.

5. `handleRefine` (line 219): before `setResult(refinedPrompt)` (line 246),
   clean up any image committed under the _previous_ `result`'s id (the
   re-refine case):

   ```tsx
   if (result?.scenarioImage) void deleteScenarioImage(result.id);
   ```

   Also reset `setIsUploadingImage(false)` here and in `resetAll` (line 182),
   matching how the other preview-only UI state should not leak across a
   re-refine or a fresh open.

6. `onImageChange` handler — updates `result` directly (single source of
   truth, same way `PromptDisplay.tsx` calls `onUpdatePrompt`):

   ```tsx
   const handleScenarioImageChange = (ref: ScenarioImageRef | undefined) =>
     setResult((prev) => (prev ? { ...prev, scenarioImage: ref } : prev));
   ```

   Because `handleConfirm` already spreads `...result` into `onSave`, this
   is the only plumbing needed — `scenarioImage` rides along automatically,
   no change to `handleConfirm`'s save payload required.

7. JSX — the Scenario column (lines 850–878), mirroring
   `PromptDisplay.tsx`'s header-row toggle button (its lines 775–788) but
   placed beside the "Scenario" label (line 851–856) instead of a hover-only
   header row (this modal has no hover-revealed chrome pattern to match):

   ```tsx
   <div className="space-y-2">
     <div className="flex items-center justify-between">
       <label htmlFor="manual-preview-scenario" className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">
         Scenario
       </label>
       <button
         type="button"
         onClick={() => setIsUploadingImage((v) => !v)}
         aria-expanded={isUploadingImage}
         className={`p-1.5 rounded-lg transition-colors ${
           isUploadingImage
             ? 'text-[rgb(var(--color-accent))] bg-[rgb(var(--color-accent))]/10'
             : 'text-slate-400 light:text-slate-500 hover:text-white light:hover:text-indigo-600 hover:bg-white/10 light:hover:bg-slate-100'
         }`}
         title={result.scenarioImage ? 'Manage Scenario Image' : 'Add Scenario Image'}
       >
         <ImagePlus className="w-3.5 h-3.5" />
       </button>
     </div>

     {isUploadingImage && (
       <ScenarioImageUploader
         promptId={result.id}
         existingImage={result.scenarioImage}
         onImageChange={handleScenarioImageChange}
         showToast={showToast}
       />
     )}

     {includeScenario ? (
       /* existing MathSymbolToolbar + textarea, unchanged */
     ) : (
       /* existing "No scenario" placeholder, unchanged */
     )}
   </div>
   ```

   Placed above the `includeScenario` branch (not inside it) so an image can
   still be attached to a scenario-less question — same independence between
   text and image that `PromptDisplay.tsx`/`ScenarioCarousel.tsx` already
   have.

8. Prop threading: add optional `showToast?: (message: string, type: 'success' | 'error' | 'info') => void;`
   to `ManualPromptModalProps` (line 42) and pass it through in
   `components/AppModals.tsx` (line 255), which already has `showToast` in
   scope (used two lines below at line 263) — `showToast={showToast}`.

### Task list

1. Edit `components/ManualPromptModal.tsx`: apply changes 1–7 above.
2. Edit `components/ManualPromptModal.tsx` props + `components/AppModals.tsx`:
   thread `showToast` through (change 8).
3. Manually sanity-check in the dev server: refine a draft, paste an image
   in preview, save — confirm the image shows up via `ScenarioCarousel` on
   the saved prompt. Separately: paste an image, click "Back to Edit", then
   "Refine" again — confirm the old IDB row is gone (no orphan) and the new
   preview starts with no image. Separately: paste an image, then discard
   the whole modal (Escape → confirm discard) — confirm the IDB row is gone.

### Tests to run

- `npm run type-check`.
- Any existing Vitest coverage of `ManualPromptModal.tsx` (check
  `tests/unit/`) — keep passing; consider a new case asserting
  `deleteScenarioImage` is called on discard-with-image and on re-refine,
  and is **not** called on save-with-image (mock `utils/scenarioImageStorage`).
- `npm run test:all`.

---

## Summary of files touched, by section

**Section 1:** new `services/scenarioImageSyncService.ts`,
`services/contributionService.ts`, `App.tsx`, `services/curriculumService.ts`,
`components/ScenarioCarousel.tsx`.

**Section 2:** `components/PromptSelector.tsx` only.

**Section 3:** `components/ManualPromptModal.tsx`, `components/AppModals.tsx`.

All three sections are independent — any can be applied without the others.
