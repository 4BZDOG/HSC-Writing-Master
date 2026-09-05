# Plan — AI Models, Scenario Image Carousel, Navigator Interactivity

Status: draft for implementation. Three independent workstreams below; each is
self-contained — an implementing agent only needs its own section plus the
"Where things live" table in `.claude/skills/project`.

---

## 1. AI integrations — new models

### Research findings (verified via web search, August 2026)

**"Gemini flash 2.7" does not exist.** No model called `gemini-2.7-flash` (or
any "2.7" Gemini) has ever shipped. The user was almost certainly misremembering
**Gemini 3.7 Flash** (`gemini-3.7-flash`) — the newest Flash model, GA as of
2026-08-13 — or thinking of the existing "Gemini 3 Flash" entry already in the
registry. Treat "2.7" as a transposition/misremembering of "3.7", not a real id.

**Critical, unrelated finding — an existing entry is dead in production:**
`gemini-3-pro-preview` (the `model` string behind the current `gemini-pro`
registry entry) **was shut down by Google on 2026-03-09.** Every call routed to
`gemini-pro` today returns an error. This is not cosmetic — it is the
`DEFAULT_SELECTION.reasoning` target, so every admin who hasn't manually
switched engines is currently getting a broken "reasoning" role. The confirmed
replacement is `gemini-3.1-pro-preview` (currently in preview, no shutdown
date announced as of the source's crawl date). **Fixing this is in scope and
urgent — treat it as a bug fix, not a feature addition.**

By contrast, `gemini-3-flash-preview` (current `gemini-flash` entry) has **no
announced shutdown** — Google is deliberately keeping it alive because Computer
Use has no migration path yet — so it is safe to leave untouched.

Confirmed current Gemini lineup (ai.google.dev / Google Cloud docs, several
independent sources cross-checked):

- `gemini-3.7-flash` — GA 2026-08-13. Pricing (introductory, through
  2026-12-31): $0.75/M input, $3.75/M output tokens.
- `gemini-3.1-pro-preview` — preview, current Pro tier (successor to the dead
  `gemini-3-pro-preview`). Pricing (≤200k context): $2/M input, $12/M output.
- Also referenced but **not independently confirmed to a primary-source page**
  during this research (WebFetch to ai.google.dev/deepmind.google/
  docs.cloud.google.com was blocked by the environment's egress proxy for
  every Google domain — all Gemini findings above come from WebSearch result
  snippets of secondary sources, not a fetched primary page): `gemini-3.6-flash`,
  `gemini-3.5-flash-lite`, `gemini-3.5-flash`. **Do not add these to the
  registry from this plan alone** — an implementing/verification agent should
  either re-attempt a direct fetch of `ai.google.dev/gemini-api/docs/models`
  (proxy status may differ in that session) or treat them as unverified and
  skip them.

Confirmed current Anthropic lineup (fetched directly from
`platform.claude.com/docs/en/about-claude/models/overview`, primary source):

- `claude-sonnet-5` — "the best combination of speed and intelligence",
  adaptive thinking. $2/M input, $10/M output. This is the direct successor to
  the existing `claude-sonnet-4-6` entry.
- `claude-opus-5` — "for complex agentic coding and enterprise work", adaptive
  thinking, moderate latency. $5/M input, $25/M output.
- `claude-haiku-4-5` — **unchanged**, still Anthropic's current fastest tier
  (appears in the _latest_ models table, not the legacy one). No action needed.
- `claude-fable-5` — Anthropic's most capable model ("next-gen intelligence for
  long-running agents"), $10/M input, $50/M output. Not proposed for addition:
  it's positioned for agentic workloads, not classroom marking, and is 3-5x
  the cost of Opus 5 for a task this app doesn't need. Note it here so a human
  can override this judgement call if they disagree.
- `claude-mythos-5` / `claude-mythos-preview` — invite-only (Project Glasswing),
  not generally available. **Do not add** — no self-serve API access exists.
- Legacy models `claude-opus-4-5` through `claude-opus-4-8` and
  `claude-sonnet-4-5`/`4-6` are still listed as available ("Legacy models"
  table) — no forced migration, existing `claude-sonnet-4-6` and
  `claude-haiku-4-5` entries keep working as-is.

### Exact changes to `services/aiModels.ts`

**A. Fix the dead `gemini-pro` entry (lines 57-67) — critical, do this first:**

```ts
{
  id: 'gemini-pro',
  provider: 'gemini',
  model: 'gemini-3.1-pro-preview', // was gemini-3-pro-preview — Google shut
                                    // that down 2026-03-09; every call was
                                    // failing. This is the confirmed live
                                    // successor.
  label: 'Gemini 3.1 Pro',
  description:
    'Higher-order reasoning. Used for marking and exemplar generation. Requires a billing-enabled key (no free-tier quota).',
  roles: ['basic', 'reasoning'],
  keyEnv: 'GEMINI_API_KEY',
  estCostPerCall: 0.016, // $2/M in + $12/M out, blended 2k-in/1k-out estimate
},
```

**B. Add a new Flash entry (do not touch the existing `gemini-flash` entry —
its underlying model is still alive; adding rather than replacing avoids any
risk to the free-tier fallback path, see caveat below):**

```ts
{
  id: 'gemini-flash-3-7',
  provider: 'gemini',
  model: 'gemini-3.7-flash',
  label: 'Gemini 3.7 Flash',
  description:
    'Newest GA Flash model (Aug 2026) — cheaper and faster than Gemini 3 Flash with improved coding/agentic benchmarks. Free-tier availability is unconfirmed; verify manually before relying on it as a free-tier option.',
  roles: ['basic', 'reasoning'],
  keyEnv: 'GEMINI_API_KEY',
  estCostPerCall: 0.0053, // $0.75/M in + $3.75/M out, blended 2k-in/1k-out
},
```

Caveat to preserve: `getGeminiFreeTierFallback()` in `services/aiConfig.ts`
(line ~93) is hard-coded to the `'gemini-flash'` id. Do **not** repoint it at
`gemini-flash-3-7` in this change — free-tier quota behaviour of the new model
is unverified. Leave the fallback exactly as-is.

**C. Add two new Anthropic entries after the existing `claude-haiku` entry
(after line 87):**

```ts
{
  id: 'claude-sonnet-5',
  provider: 'anthropic',
  model: 'claude-sonnet-5',
  label: 'Claude Sonnet 5',
  description:
    'Newest Sonnet tier — best combination of speed and intelligence, adaptive thinking. Requires ANTHROPIC_API_KEY.',
  roles: ['basic', 'reasoning'],
  keyEnv: 'ANTHROPIC_API_KEY',
  estCostPerCall: 0.014, // $2/M in + $10/M out, blended 2k-in/1k-out
},
{
  id: 'claude-opus-5',
  provider: 'anthropic',
  model: 'claude-opus-5',
  label: 'Claude Opus 5',
  description:
    'Top-tier reasoning for complex, high-stakes marking — slower and materially more expensive than Sonnet. Requires ANTHROPIC_API_KEY.',
  roles: ['reasoning'],
  keyEnv: 'ANTHROPIC_API_KEY',
  estCostPerCall: 0.035, // $5/M in + $25/M out, blended 2k-in/1k-out
},
```

(`claude-opus-5` is `reasoning`-only, mirroring how `claude-haiku` is
`basic`-only — the top and bottom tiers are role-restricted, the middle tiers
serve both.)

**D. `DEFAULT_SELECTION` — do not change.** `basic: 'gemini-flash'`,
`reasoning: 'gemini-pro'` stay as-is. The `reasoning` default is fixed in
place by change (A) above — no need to point it at a different id, since
`gemini-pro`'s underlying model string is now the live one.

**E. Pre-existing inconsistency to flag, not fix in this change:** the current
`claude-sonnet` (`claude-sonnet-4-6`) entry has `estCostPerCall: 0.009`, but
Anthropic's published pricing for that model is $3/M in + $15/M out, which
blends to ~$0.021/call by this file's own formula. Out of scope here — note it
for whoever next touches Anthropic pricing.

### Task list

1. Edit `services/aiModels.ts`: apply change (A) to the existing `gemini-pro`
   object in place.
2. Insert the new `gemini-flash-3-7` object (change B) directly after the
   existing `gemini-pro` object.
3. Insert the two new Claude objects (change C) after the existing
   `claude-haiku` object, before the `// --- Groq` comment block.
4. Leave `services/aiConfig.ts` untouched (no default-selection or
   fallback-routing changes).
5. Re-run `npm run type-check` — this file has no other call sites to update;
   the admin selector (`components/admin/AiEngineSelector.tsx`) and
   `modelsForRole`/`getModelById` reads the array directly.

### Tests to run

- `npm test -- tests/unit/aiModelRegistry.test.ts` — enforces unique `id`,
  unique `model` string, correct `keyEnv` per provider, non-empty
  label/roles/estCostPerCall. New entries must satisfy this unmodified.
- `npm test -- tests/unit/aiConfig.test.ts`
- `npm run type-check`
- `npm run test:all` before considering the change done.

---

## 2. Scenario image/diagram carousel

### Architecture decision (why, not just what)

`saveCoursesToDB()` in `utils/storageUtils.ts` (line 276) persists the
**entire `Course[]` tree as one JSON blob** under a single IndexedDB key
(`courses_data` in `main_store`), with a **LocalStorage fallback** if IDB
fails. Every `updateCourses` mutation (via `use-immer`) re-serializes that
whole blob. Embedding a base64 image `dataUrl` directly on `Prompt` would
bloat that blob on every course — bad for autosave latency, bad for the
LocalStorage fallback's ~5-10MB ceiling, bad for Immer draft diffing, bad for
JSON export/import payloads.

**Decision: store the image bytes in their own IndexedDB object store, keep
only a lightweight reference on `Prompt`.** This mirrors nothing existing in
the codebase exactly (no prior image storage exists here — confirmed via
search, no `base64`/`dataUrl`/`FileReader`-for-persistence patterns exist
except transient file-import parsing), but is the natural extension of the
existing `main_store`/`backups_store`/`library_store`/`users_store` split in
`utils/storageUtils.ts`.

### `types.ts` changes

Add a new interface and one optional field on `Prompt` (after `scenario?:
string;`, line 101):

```ts
export interface ScenarioImageRef {
  /** Equal to the owning Prompt's id — one image per scenario, so the prompt
   *  id doubles as the lookup key into the scenario-images IDB store and the
   *  Supabase Storage object path. */
  id: string;
  alt?: string;
  /** Epoch ms — lets a cached carousel image know it's stale. */
  updatedAt: number;
  /** Present only once synced to Supabase Storage (bucket `scenario-images`,
   *  object path `${promptId}/${id}`). Absent in pure-IDB/offline mode. */
  storagePath?: string;
}
```

```ts
// on Prompt, after `scenario?: string;`
scenarioImage?: ScenarioImageRef;
```

### `utils/dataManagerUtils.ts` changes

1. Add a Zod shape and field on `PromptSchema` (near `scenario:
z.string().optional().default('')`, line 533):

```ts
scenarioImage: z
  .object({
    id: z.string(),
    alt: z.string().optional(),
    updatedAt: z.number(),
    storagePath: z.string().optional(),
  })
  .optional(),
```

2. In `mergePromptContent` (line 928), add an explicit merge line near the
   other scalar/object merges (around line 938, next to `scenario:
mergeScalarText(...)`) — do **not** rely on the object spread alone, to
   avoid an imported `undefined` clobbering an existing image:

```ts
scenarioImage: importedPrompt.scenarioImage ?? existingPrompt.scenarioImage,
```

### `utils/storageUtils.ts` changes — new IDB store

1. Bump `DB_VERSION` from `3` to `4` (line 46) and add a new store constant:

```ts
const STORE_SCENARIO_IMAGES = 'scenario_images_store';
```

2. In the `AppDB` schema interface (line 53) add:

```ts
[STORE_SCENARIO_IMAGES]: {
  key: string; // promptId
  value: { promptId: string; dataUrl: string; alt?: string; updatedAt: number };
};
```

3. In `getDB()`'s `upgrade()` callback (line 81), add:

```ts
if (!db.objectStoreNames.contains(STORE_SCENARIO_IMAGES)) {
  db.createObjectStore(STORE_SCENARIO_IMAGES);
}
```

4. Add three exported helpers in a new file `utils/scenarioImageStorage.ts`
   (keep `storageUtils.ts` from growing further):

```ts
export const saveScenarioImage = async (
  promptId: string,
  dataUrl: string,
  alt?: string
): Promise<void> => {
  const db = await getDB();
  await db.put(STORE_SCENARIO_IMAGES, { promptId, dataUrl, alt, updatedAt: Date.now() }, promptId);
};

export const loadScenarioImage = async (
  promptId: string
): Promise<{ dataUrl: string; alt?: string } | null> => {
  const db = await getDB();
  const row = await db.get(STORE_SCENARIO_IMAGES, promptId);
  return row ? { dataUrl: row.dataUrl, alt: row.alt } : null;
};

export const deleteScenarioImage = async (promptId: string): Promise<void> => {
  const db = await getDB();
  await db.delete(STORE_SCENARIO_IMAGES, promptId);
};
```

No `DATA_VERSION` migration case is needed in `runMigrations()` — the new
`Prompt.scenarioImage` field is optional and absence means exactly what it
always meant ("no image"), same pattern as the 2.5.0/2.6.0 comments already
in this file. Still bump `DATA_VERSION` (line 27) from `'2.6.0'` to `'2.7.0'`
with a comment in the same style, for hygiene/traceability. **Note this is a
different version number from `DB_VERSION` (IndexedDB's own object-store
schema version, bumped separately above) — don't conflate the two.**

### Client-side image handling (new file: `utils/scenarioImageCodec.ts`)

Before storing, downscale/compress via an offscreen `<canvas>`: cap the
longest edge to ~1200px and re-encode as JPEG/WebP at ~0.8 quality, so a
phone photo doesn't balloon into several MB sitting in IndexedDB (and
eventually in the LocalStorage fallback budget). Reject/toast (via
`hooks/useToast.ts`) if the pasted/dropped item isn't an image MIME type.

### Admin UI — paste/upload affordance (new file:

`components/ScenarioImageUploader.tsx`)

Location: wired into `components/PromptDisplay.tsx`'s "Scenario Section"
button row — the `canCurate && !isEditingScenario` block at lines 729-753,
next to the existing regenerate/edit-pencil buttons. Add an `ImagePlus`
(lucide-react) icon button that toggles a small inline panel (same collapsed/
expanded pattern the component already uses for `isEditingScenario`), with:

- A `tabIndex={0}` paste-target `div` with `onPaste` reading
  `e.clipboardData.items`, finding an `image/*` item, converting via
  `FileReader.readAsDataURL`.
- A hidden `<input type="file" accept="image/*">` (pattern already used in
  `components/dataManager/FileDropzone.tsx` and
  `components/admin/DatabaseDashboard.tsx`) behind an "Upload image" button,
  for users without clipboard image data.
- A thumbnail preview + "Remove image" once `prompt.scenarioImage` is set.

Behaviour: **the image commits immediately on paste/upload** (calls
`saveScenarioImage(prompt.id, dataUrl, alt)` then `onUpdatePrompt({
scenarioImage: { id: prompt.id, alt, updatedAt: Date.now() } })`) — it is not
gated behind the existing "Save Scenario" button, which only governs the text
field. This keeps the two independent, matches the requirement ("once a
question exists, paste an image and it gets stored"), and avoids holding a
multi-hundred-KB data URL in transient component state.

Props needed: `promptId: string`, `existingImage?: ScenarioImageRef`,
`onImageChange: (ref: ScenarioImageRef | undefined) => void` (calls
`onUpdatePrompt` from the parent).

### Display — the carousel (new file: `components/ScenarioCarousel.tsx`)

Replaces the non-editing scenario render block currently at
`components/PromptDisplay.tsx` lines 784-839 _only when_ `prompt.scenarioImage`
is present; when absent, render exactly what's there today (zero visual
change for the overwhelming majority of existing prompts — satisfies "keep
existing entries working").

Design, using **only existing Tailwind/animation conventions** (no new
colours/spacing system):

- Two "slides": Slide 1 = the current text block (the `<Quote>`-decorated
  `renderFormattedText(prompt.scenario, ...)` paragraph, unchanged). Slide 2 =
  the image, lazy-loaded via `loadScenarioImage(prompt.id)` on mount (loading
  spinner reusing the existing `Loader2 animate-spin` pattern already used
  elsewhere in this file).
- A small dot/tab toggle row beneath the card (two dots, or two small labelled
  tabs "Text" / "Image") — active slide uses the same
  `bg-[rgb(var(--color-accent))]` treatment already used for selection state
  elsewhere in this codebase, not a new colour.
- Slide transition: `animate-fade-in` (existing keyframe, 0.5s
  cubic-bezier(0.16,1,0.3,1)) on the active slide's container when it swaps —
  matches how other panels in this app already animate in.
- If only a scenario (no image) or only an image (no text) exists, don't show
  a toggle — just render the one slide (mirrors the current "empty scenario
  shows nothing extra" philosophy at line 369's `showScenarioSection` logic).

Props: `scenarioText?: string`, `scenarioImage?: ScenarioImageRef`,
`keywords?: string[]`, `verb?: PromptVerb`, `fontSize: number` (passed through
so `renderFormattedText` keeps behaving as today).

### `components/ManualPromptModal.tsx` — explicitly out of scope for this pass

This modal (question **creation** flow, `includeScenario`/`editedScenario`
state around lines 154-261) is a secondary candidate for the same
paste-affordance later, but the requirement text ("once a question exists")
points at `PromptDisplay.tsx`'s inline edit, which is where this plan focuses.
Note this explicitly so a future pass doesn't assume it was covered.

### Supabase — schema-level support (this plan does NOT wire full sync)

`supabase/schema.sql` has no `supabase/migrations/` directory — the existing
convention (see lines 410-419) is **idempotent `alter table ... add column if
not exists ...` statements appended directly into `schema.sql`**, not
timestamped migration files. Follow that exact pattern.

1. Add near the existing idempotent block (after line 419):

```sql
-- Scenario image (carousel) support — Storage object reference, not inline
-- bytes. Additive/optional; existing rows are unaffected.
alter table public.prompts add column if not exists scenario_image_path text;
alter table public.prompts add column if not exists scenario_image_alt text;
alter table public.prompts add column if not exists scenario_image_updated_at timestamptz;
```

2. Create the storage bucket idempotently (Supabase Storage buckets are rows
   in `storage.buckets`, reachable via plain SQL, consistent with this file's
   SQL-only convention):

```sql
insert into storage.buckets (id, name, public)
values ('scenario-images', 'scenario-images', false)
on conflict (id) do nothing;
```

3. **Flag, don't guess: Storage RLS policies on `storage.objects` for this
   bucket need a human security review** before going live — they should
   mirror the read/write shape of the existing `prompts_read`/`prompts_insert`
   policies (status-gated: visible if `approved`, writable by
   `created_by`/reviewers — see the `prompts_*` policies around line 559), but
   translating that into `storage.objects` policy predicates (which key off
   the object path, not a joined `content_status` column) is a distinct,
   security-sensitive piece of SQL this plan should not author blind.
4. **Explicitly deferred to a follow-up task, not this plan:** wiring
   `services/contributionService.ts` to actually upload/download the image
   bytes to/from the `scenario-images` bucket when a prompt round-trips
   through Supabase. The IndexedDB path above is fully self-contained and
   ships a working feature in offline/mock mode on its own; Supabase parity
   is additive on top and should be its own reviewed change given the RLS
   sensitivity above.

### Task list

1. `types.ts`: add `ScenarioImageRef` interface + `scenarioImage?:
ScenarioImageRef` on `Prompt`.
2. `utils/dataManagerUtils.ts`: add the Zod shape to `PromptSchema`; add the
   explicit merge line in `mergePromptContent`.
3. `utils/storageUtils.ts`: bump `DB_VERSION` 3→4, add
   `STORE_SCENARIO_IMAGES` to the schema + `upgrade()`; bump `DATA_VERSION`
   '2.6.0'→'2.7.0' with a house-style comment (no `runMigrations` case
   needed).
4. New file `utils/scenarioImageStorage.ts`: `saveScenarioImage`,
   `loadScenarioImage`, `deleteScenarioImage`.
5. New file `utils/scenarioImageCodec.ts`: canvas-based downscale/compress
   helper.
6. New file `components/ScenarioImageUploader.tsx`: paste/upload panel.
7. New file `components/ScenarioCarousel.tsx`: text/image slide renderer.
8. Edit `components/PromptDisplay.tsx`: wire the uploader button into the
   header row (~line 729-753) and swap the non-editing scenario block
   (~line 784-839) to delegate to `ScenarioCarousel` when `prompt.scenarioImage`
   is present.
9. `supabase/schema.sql`: append the three idempotent `alter table` lines and
   the bucket-creation insert. **Do not** write the Storage RLS policies
   without a human review pass — leave a `-- TODO(security-review):` comment
   marking where they go.
10. Update `projectDocs/dataSpecifications.md` if it documents the `Prompt`
    shape (confirm/extend — file exists in this repo).

### Tests to run

- `npm run type-check`
- `npm test -- tests/unit/promptScenarioPlaceholder.test.tsx` (existing —
  must keep passing unmodified for prompts with no `scenarioImage`, proving
  the no-image path is untouched).
- `npm test -- tests/unit/storageMigrations.test.ts` (existing — extend with
  a case asserting a course containing a `scenarioImage` reference survives
  `CoursesArraySchema` validation and round-trips through
  `mergePromptContent`).
- New unit test recommended: `tests/unit/scenarioImageStorage.test.ts`
  covering save/load/delete against the fake-indexeddb test setup this repo
  already uses (check `tests/unit/storageMigrations.test.ts` for the IDB
  mocking pattern already in place before writing a new one).
- New unit test recommended: `tests/unit/scenarioCarousel.test.tsx` (render
  with/without `scenarioImage`, verify toggle behaviour, verify no-image path
  renders identically to today).
- `npm run test:all` before considering the change done.

---

## 3. Syllabus navigator interactivity — `PromptSelector.tsx` / `Combobox.tsx` / `SyllabusNavBar.tsx`

### Scope correction (orchestrator-verified, supersedes the planning agent's finding)

The planning agent read `components/SelectionTree.tsx` (an admin-only
Import/Export checkbox tree) as "the navigator." That is wrong. The app's own
code names the real thing: `components/SyllabusNavBar.tsx`'s doc-comment
literally says _"the syllabus navigator"_ and _"the full syllabus navigator"_
for the expanded picker its "Change" button reopens — which is
`components/PromptSelector.tsx`, a 4-stage vertical stepper (Course → Topic →
Sub-Topic → Question) driven by `hooks/useNavigation.ts`'s `StatePath`, using
`components/Combobox.tsx` for each stage's dropdown. **This is what a
student/teacher actually uses to browse the syllabus.** `SelectionTree.tsx` is
unrelated (admin bulk import/export only) — do not touch it for this feature.

### What's already there (read from source)

- `PromptSelector.tsx`: stage cards already animate width/border/scale on
  selection change (`transition-all duration-500`, `getBoxClasses` ~line 849);
  `RailNode` (~line 218) shows done/current/upcoming with icon + colour but
  the checkmark **pops in instantly** with no reveal motion when a step newly
  completes; the "upcoming" (greyscale) stage card already has
  `hover:grayscale-0 hover:opacity-100` (nice) but the _collapsed selected_
  stage row has no click/press feedback of its own beyond the `Combobox`
  inside it.
- `Combobox.tsx`: the closed trigger button already has the house haptic
  (`active:scale-[0.98]`, line 335) and a glow on open. But **option rows in
  the open list** (`<li>`, line 464-485) only have `transition-colors` — no
  press feedback when clicking a row to select it, unlike the button that
  opened the list.
- `SyllabusNavBar.tsx` (collapsed breadcrumb bar): breadcrumb buttons
  (line 61-69) have `hover:text-...` / `hover:bg-...` but **no active/press
  state** — clicking one to jump back gives zero tactile confirmation. The
  "Change" and share-link buttons already have `active:scale-95` — the
  breadcrumbs are the one inconsistent element.

### Confirmed existing animation vocabulary to reuse (from `tailwind.config.js`

— do not invent new keyframes/colours)

- `animate-fade-in` (0.5s), `animate-fade-in-up-sm` (0.45s, 8px slide+fade).
- House haptic convention already used throughout both files:
  `hover:scale-105 active:scale-95 transition-transform` for buttons;
  `active:scale-[0.98]` for the Combobox trigger.

### Concrete changes

**`components/Combobox.tsx`**

1. Add `active:scale-[0.98] transition-transform` to the option `<li>`
   className (line 473-477), matching the trigger button's own press feedback
   — right now selecting a row feels less responsive than opening the list.
2. Wrap the check/selected-row indicator (if the option is the current value)
   with `animate-fade-in-up-sm` on first render so the "you are here" state
   reads as a confirmation, not a static fact — apply narrowly to avoid
   re-triggering on every re-render (key it off `option.id === value`
   transitioning false→true via a small `useEffect`/local state, not a bare
   className, so it doesn't replay on unrelated parent re-renders).

**`components/PromptSelector.tsx`** 3. `RailNode`: when a step transitions to `isComplete`, wrap the emerald
check-circle in `animate-fade-in-up-sm` instead of appearing instantly
(small, local — keyed on `isComplete` becoming true) so completing a stage
reads as an event, not a flicker. 4. Stage card container (`getContainerClasses`/`getBoxClasses`): already has
`duration-500` transitions on collapse — leave as-is, it's already tactile.
No change needed here; don't over-add motion on top of an already-animated
500ms transition.

**`components/SyllabusNavBar.tsx`** 5. Add `active:scale-95` to the breadcrumb `<button>` className (line 65),
consistent with the "Change" and share buttons in the same component —
this is the one missing press-state in an otherwise-consistent file.

### Explicitly out of scope for this pass (documented, not silently dropped)

**"Progress/completion cues" beyond the existing RailNode dots** — the picker
already has done/current/upcoming rail nodes; adding e.g. a question-count
badge per topic would require new data plumbing (`Topic`/`SubTopic` don't
carry aggregate counts to the picker today) and risks reading as a new visual
element rather than restyled existing information. Skip for this pass.

### Task list

1. Edit `components/Combobox.tsx`: apply changes 1-2.
2. Edit `components/PromptSelector.tsx`: apply change 3 to `RailNode`.
3. Edit `components/SyllabusNavBar.tsx`: apply change 5.
4. Manually sanity-check in the dev server: open the picker, select through
   all 4 stages, confirm the collapsed `SyllabusNavBar` breadcrumbs give
   press feedback, confirm no layout shift or new colours were introduced.
5. Confirm `prefers-reduced-motion` still short-circuits the new animations —
   `index.css` already zero out `animation-duration`/`animation-iteration-count`
   globally under that media query, which covers the `animate-fade-in-up-sm`
   additions; the `active:scale-*` additions are transitions, not keyframe
   animations, and match the existing (already-shipped) house convention used
   elsewhere in these same files, so no extra reduced-motion handling is
   needed for them.

### Tests to run

- `npm run type-check`
- Check for and run any existing Vitest files covering `Combobox.tsx` /
  `PromptSelector.tsx` (search `tests/unit/` — component may have light
  coverage already; keep passing).
- `npm run test:all` before considering the change done.

---

## Summary of files touched, by section

**Section 1:** `services/aiModels.ts` only.

**Section 2:** `types.ts`, `utils/dataManagerUtils.ts`, `utils/storageUtils.ts`,
new `utils/scenarioImageStorage.ts`, new `utils/scenarioImageCodec.ts`, new
`components/ScenarioImageUploader.tsx`, new `components/ScenarioCarousel.tsx`,
`components/PromptDisplay.tsx`, `supabase/schema.sql`.

**Section 3:** `components/Combobox.tsx`, `components/PromptSelector.tsx`,
`components/SyllabusNavBar.tsx`.
