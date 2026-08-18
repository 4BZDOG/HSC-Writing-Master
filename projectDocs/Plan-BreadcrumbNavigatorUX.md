# Plan — Breadcrumb & Syllabus Navigator UX

Status: draft for implementation. Two parts; Part 1 must land before Part 2's
focus work, because Part 1 changes who owns the crumb array.

---

## 0. Scope correction — there are two breadcrumbs, and the stale one is not the one named in the brief

The brief said the breadcrumb is `components/SyllabusNavBar.tsx` and that it sits
below the command verb hierarchy ribbon. Both halves are wrong, and the
distinction is the whole finding.

DOM order in `App.tsx`:

| Line | Element | Rendered when |
|---|---|---|
| 784–828 | `<SyllabusNavBar>` | `isNavCollapsed` (a question is chosen) |
| 836–931 | `<PromptSelector>` in the `grid-rows-[0fr]/[1fr]` wrapper | always mounted, `inert` when collapsed |
| 951 | `<CommandVerbHierarchy>` (the ribbon) | always |
| 968 | `<Workspace>`, whose **first child** is `<Breadcrumb>` (`Workspace.tsx:585–589`) | `showBreadcrumb={!isNavCollapsed}` |

So `SyllabusNavBar` is **above** the ribbon, and the breadcrumb **below** the
ribbon is `components/Breadcrumb.tsx`. The two are mutually exclusive —
`isNavCollapsed &&` versus `showBreadcrumb={!isNavCollapsed}` — so a user never
sees both, which is exactly why they have drifted apart unnoticed.

Staleness, measured: the repository's recorded history is 203 commits from
2026-07-23 to 2026-08-18. `git log --follow --numstat -- components/Breadcrumb.tsx`
shows the file only ever as `81 0` — an addition, **never a modification**,
across the entire history. `SyllabusNavBar.tsx` was edited as recently as
`800e4d4` (2026-08-18). The user's "has not been revised and updated for a long
time" is literally true, and of `Breadcrumb.tsx`.

---

## Part 1 — The breadcrumb

### 1.1 Findings (each read from source)

**A. Every crumb in the stale breadcrumb is inert.** `Workspace.tsx:503–510`
builds `breadcrumbItems` as four `{ label }` objects with **no `onClick`**.
`Breadcrumb.tsx:54` is `disabled={isLast || !item.onClick}`. Therefore all four
buttons render disabled — dead to the mouse, and announced to a screen reader as
unavailable controls. It renders in the one state (navigator expanded) where the
same four labels are already on screen in the picker directly above it. A
non-interactive restatement of a live control, in a third visual style.

**B. The two breadcrumbs print different labels for the same course.**
`App.tsx:792–797` appends `· Year 11` to the course crumb when the resolved
syllabus year is not the Year 12 default. `Workspace.tsx:504` does not. Same
course, same moment, two names — one of which silently omits which syllabus the
student is in.

**C. A smooth scroll fires on every keystroke.** `Breadcrumb.tsx:17–21`:

```tsx
useEffect(() => {
  if (scrollRef.current) {
    scrollRef.current.scrollTo({ left: scrollRef.current.scrollWidth, behavior: 'smooth' });
  }
}, [items]);
```

`breadcrumbItems` is a fresh array literal on every `Workspace` render
(`Workspace.tsx:503`, not memoised), and `Workspace` re-renders on every
keystroke because `userAnswer` is a prop from `App`. So the effect runs on every
render. Consequences: on a narrow viewport with long course/topic names the list
is pinned to its right-hand end while the student types, hiding the Course crumb;
and it ignores `prefers-reduced-motion`, because the global
`scroll-behavior: auto !important` at `index.css:224` is a CSS declaration and
cannot override an explicit `behavior: 'smooth'` passed in a `scrollTo` options
bag.

**D. Dead branch.** `Breadcrumb.tsx:33–34`'s `default: <FileText/>` case
(index ≥ 4) can never fire — the only caller passes exactly four items.

**E. Accessibility, both files.** `Breadcrumb.tsx:39–41` has
`<nav aria-label="Breadcrumb">` (good) but no `aria-current` anywhere.
`SyllabusNavBar.tsx:53`'s `<ol>` has no `<nav>`, no `aria-label` and no
`aria-current` at all — it is not marked up as a breadcrumb. In both, the
`ChevronRight` separators (`SyllabusNavBar.tsx:59`, `Breadcrumb.tsx:50`) are not
`aria-hidden`, unlike the tier stripe two lines above (`SyllabusNavBar.tsx:48`),
which is.

**F. Copy.** `SyllabusNavBar.tsx:64` — ``title={`Change ${crumb.label}`}``
renders "Change Nature and Practice of Business", which reads as an offer to
rename it. It should name the destination, not the crumb.

**G. Dead guard.** `SyllabusNavBar.tsx:63`'s `disabled={!crumb.onClick}` can
never be true: `App.tsx:786–823` supplies `onClick` for all four crumbs.
Harmless, but it is why nobody noticed that the *other* breadcrumb's identical
guard disables everything.

**H. `hierarchyContext` never memoises.** `WorkspaceRightPanel.tsx:248–256`
memoises on `[breadcrumbItems]`, which changes identity every render (finding C).
The `useMemo` is a no-op today.

**I. Divergent tier clamping (defensive only, no live bug).**
`SyllabusNavBar.tsx:39–40` passes `verbInfo.tier` raw to `getTargetBand` and
`getTierScaleConfig`, while `PromptSelector.tsx:697–700` clamps first
(`Math.max(1, Math.min(6, Math.floor(verbInfo.tier || 4)))`).
`getTierScaleConfig` rounds and `getCommandTermInfo` always returns a real entry
or `fallbackTerm`, and every tier in `data/commandTerms.ts` is an integer 1–6, so
they agree today. `tests/unit/bandColors.test.ts:136` names these two surfaces as
a pair that must not disagree — worth aligning the derivation so it stays true by
construction.

**J. One handler forgets `selectedSubItems`.** `App.tsx:798–804` (the Course
crumb) clears `topicId`…`promptId` but not `selectedSubItems`, unlike every
equivalent cascade in `PromptSelector.tsx` (lines 914, 1066, 1250, 1322). Stale
focus areas survive in the localStorage-persisted `StatePath`. Not currently
user-visible — nothing renders focus pills without a sub-topic — but it is a
divergence in a persisted value that feeds `AppModals.tsx:251`.

### 1.2 What is already fine — do not touch

- **The verb / marks / band chips are accurate.** `SyllabusNavBar.tsx:37–40`
  uses exactly `getCommandTermInfo` → `getTierScaleConfig` → `getTargetBand`, the
  same chain `PromptDisplay` and `PromptSelector` use. No inline band maths
  anywhere in the file.
- **Past-HSC provenance and the scenario diagram do NOT belong in the collapsed
  bar.** `PromptDisplay.tsx:584–601` already renders the `getPastHscLabel` chip
  and `PromptDisplay.tsx:850–853` already renders `ScenarioCarousel`, both in the
  same viewport a few hundred pixels below `SyllabusNavBar`. Adding them to the
  breadcrumb duplicates a chip against itself. Neither is hidden in Focus Mode
  either — Focus Mode drops both the bar and the card together.
- **Attempt history does not belong there.** "You: 4/6" is a *choosing* signal;
  it is already on the question row in the picker (`PromptSelector.tsx:766–780`).
  Once the student is on the question it is noise.
- **`Course.status` draft badge does not belong there.**
  `PromptSelector.tsx:407–411` gates it on `canCreateTree`; the collapsed bar has
  no role prop and adding one to carry a curator-only badge is disproportionate.
- **The year DOES belong there, and is already there** in one of the two bars.
  Part 1 puts it in both.

### 1.3 Design — one breadcrumb, built once, in two densities

Root cause of the drift is that the crumb array is constructed twice, in two
files, by two different rules. Fix the cause.

1. **`types.ts`** — add the shared shape next to `StatePath`:
   ```ts
   export interface SyllabusCrumb {
     label: string;
     /** A qualifier on the label that is not part of its name — the syllabus
      *  year on the course crumb. Rendered as a chip, kept OUT of `label` so
      *  `crumbs.map(c => c.label)` still yields the plain names the PDF export
      *  and the AI hierarchy context consume. */
     badge?: string;
     onClick?: () => void;
   }
   ```
   Type-only, so no module-scope import read (`.claude/skills/hsc-feature.md`
   gotcha) and no `DATA_VERSION` bump — this is not persisted data.

2. **`components/SyllabusNavBar.tsx`** — delete its local `SyllabusCrumb`
   (lines 7–10) and re-export the one from `types.ts` so existing imports keep
   working.

3. **`components/Breadcrumb.tsx`** — becomes the single implementation, gaining a
   `size` prop:
   - Props: `{ items: SyllabusCrumb[]; size?: 'default' | 'dense' }`. Delete the
     local `BreadcrumbItem`.
   - `disabled={!item.onClick}` only — drop `isLast ||`. The last crumb is the
     syllabus dot point, which is a legitimate jump target; the *question* is the
     current page and is not in this list.
   - `aria-current={isLast ? 'location' : undefined}` on the last crumb.
     `location` rather than `page`, because the last crumb names the deepest place
     in the path but is not the current page — the question is. Valid
     `aria-current` token.
   - `aria-hidden="true"` on the `ChevronRight` separators.
   - Delete the dead `default: FileText` branch (finding D) — `getLevelIcon`
     becomes a four-entry array, matching `SyllabusNavBar.tsx:24`'s `CRUMB_ICONS`.
   - Render `item.badge`, when present, as a chip after the truncating label:
     `text-[9px] font-black uppercase tracking-widest px-1.5 py-px rounded bg-white/10 dark:bg-white/10`
     — reusing the badge shape already used at `PromptSelector.tsx:409` for
     "Draft". Outside the `truncate` span, so a long course name never eats the
     year.
   - Press feedback: `active:scale-95` on the enabled crumbs, matching the house
     convention already shipped on `SyllabusNavBar.tsx:65` and the ribbon.
   - `size` drives only type scale and padding: `dense` →
     `text-[11px] px-2 py-1 gap-1.5`, icons `w-3 h-3` (today's `SyllabusNavBar`
     values); `default` → today's `Breadcrumb` values (`text-sm px-3 py-1.5`,
     `w-4 h-4`). Truncation unified on the responsive pair
     `max-w-[150px] sm:max-w-[250px]` — today the dense one is a flat
     `max-w-[220px]`, which is too wide at 360px.
   - Fix the scroll effect (finding C):
     ```tsx
     const pathKey = items.map((i) => i.label).join('›');
     useEffect(() => {
       const el = scrollRef.current;
       if (!el) return;
       const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
       el.scrollTo({ left: el.scrollWidth, behavior: reduce ? 'auto' : 'smooth' });
     }, [pathKey]);
     ```
     Keyed on the path's content, not the array's identity, so it fires when the
     path changes and not when the student types. This also brings the "deepest
     crumb visible on a narrow screen" behaviour to `SyllabusNavBar`, which has
     never had it.
   - New code is written `dark:`-first per `projectDocs/DesignSpec.md` §2 ("Which
     variant to write in new code"); existing `light:` classes in the file are
     left alone, as that section instructs.

4. **`components/SyllabusNavBar.tsx`** — replace lines 53–73 (the whole
   hand-rolled `<ol>`) with:
   ```tsx
   <nav aria-label="Syllabus path">
     <Breadcrumb items={crumbs} size="dense" />
   </nav>
   ```
   Delete `CRUMB_ICONS` (line 24) and the now-unused `ChevronRight`, `BookOpen`,
   `Layers`, `Folder`, `Hash` imports. The tier stripe, the verb/marks/band chips,
   and the share/Change buttons are untouched.
   Align the tier derivation with `PromptSelector` (finding I):
   `const safeTier = Math.max(1, Math.min(6, Math.floor(verbInfo.tier || 4)))`,
   then use `safeTier` for both `getTierScaleConfig` and `getTargetBand`.

5. **`App.tsx`** — hoist the inline array (lines 786–823) into a memo above the
   return:
   ```tsx
   const syllabusCrumbs: SyllabusCrumb[] = useMemo(() => {
     const year = resolveSyllabusYear(currentCourse, statePath.syllabusYear);
     return [
       {
         label: currentCourse?.name || 'Course',
         // Named only when it is not the Year 12 default, so the common case
         // stays quiet. A chip rather than a suffix, so `label` stays the
         // course's actual name for the PDF export and the AI hierarchy context.
         badge: year === 'year12' ? undefined : yearShortLabel(year),
         onClick: () => handlePathChange({ topicId: undefined, subTopicId: undefined, dotPointId: undefined, promptId: undefined, selectedSubItems: undefined }),
       },
       { label: currentTopic?.name || 'Topic', onClick: () => handlePathChange({ subTopicId: undefined, dotPointId: undefined, promptId: undefined, selectedSubItems: undefined }) },
       { label: currentSubTopic?.name || 'Sub-Topic', onClick: () => handlePathChange({ dotPointId: undefined, promptId: undefined, selectedSubItems: undefined }) },
       { label: getDotPointLabel(currentDotPoint) || 'Dot Point', onClick: () => handlePathChange({ promptId: undefined }) },
     ];
   }, [currentCourse, currentTopic, currentSubTopic, currentDotPoint, statePath.syllabusYear, handlePathChange]);
   ```
   This also lands finding J (`selectedSubItems`) and finding B (the year now
   reaches both bars). Pass `crumbs={syllabusCrumbs}` to `SyllabusNavBar` and a
   new `crumbs={syllabusCrumbs}` to `Workspace`.

6. **`components/Workspace.tsx`** — add `crumbs: SyllabusCrumb[]` to
   `WorkspaceProps` (near `showBreadcrumb`, line 134) and **delete** the local
   `breadcrumbItems` literal (lines 503–510) along with the now-unused
   `getDotPointLabel` import. Replace the five consumers with `crumbs`:
   - `587` → `<Breadcrumb items={crumbs} />`
   - `635`, `669`, `749` → `breadcrumb={crumbs.map((c) => c.label)}`
   - `693` → `breadcrumbItems={crumbs}` (`SyllabusCrumb[]` is assignable to
     `{ label: string }[]`)

   Because the year rides in `badge` and not `label`, `crumbs.map(c => c.label)`
   returns exactly the strings those four call sites receive today — no change to
   PDF export content or to `WorkspaceRightPanel`'s `hierarchyContext`, which
   feeds AI prompts. And because `syllabusCrumbs` is now referentially stable,
   `WorkspaceRightPanel.tsx:248`'s `useMemo` starts memoising (finding H).

### 1.4 Task list — Part 1

1. `types.ts`: add `SyllabusCrumb`.
2. `components/SyllabusNavBar.tsx`: re-export `SyllabusCrumb` from `types.ts`;
   delete the local interface.
3. `components/Breadcrumb.tsx`: rewrite per §1.3 step 3 (size prop, badge,
   `aria-current`, `aria-hidden` chevrons, `active:scale-95`, dead branch
   removed, scroll effect fixed).
4. `components/SyllabusNavBar.tsx`: swap the hand-rolled `<ol>` for
   `<nav aria-label="Syllabus path"><Breadcrumb size="dense"/></nav>`; drop
   unused imports; clamp the tier; fix the crumb `title` copy (finding F) inside
   `Breadcrumb` —
   `title={item.onClick ? 'Go back to choose a different ' + LEVEL_NAMES[index] : item.label}`
   with `LEVEL_NAMES = ['course','topic','sub-topic','syllabus point']`.
5. `App.tsx`: hoist `syllabusCrumbs` into `useMemo`; add
   `selectedSubItems: undefined` to the first three handlers; pass `crumbs` to
   both `SyllabusNavBar` and `Workspace`.
6. `components/Workspace.tsx`: accept `crumbs`, delete `breadcrumbItems`, rewire
   the five consumers.

---

## Part 2 — Navigator feedback and animation

Judged on top of what already shipped (`Plan-AIModelsImagesNavigator.md` §3 press
feedback and RailNode/Combobox entrance animations; `Plan-P1Followups.md` §2
sub-topic question counts). Nothing below repeats any of it.

### 2.1 Already good — stated so it is not re-litigated

- **`QuestionFilterBar.tsx`** is the best-fed control in the navigator: a live
  "8 of 20 shown" count (74–76), a shut-panel summary of what is being held back
  (196+), and a zero-match explainer with its own reset (187–199). One attribute
  missing — see 2.6.
- **Inline topic creation** (`PromptSelector.tsx:1129–1149`) has a real async
  loading state: `Loader2 animate-spin` + "Parsing…", a disabled submit, and an
  error line. Correct as-is.
- **`useAttemptHistory`** is deliberately silent on every failure mode and
  documents why. Leave it.
- **`prefers-reduced-motion` is honoured** for everything declarative.
  `index.css:217–226` zeroes `animation-duration`, `animation-iteration-count`,
  `transition-duration` and `scroll-behavior` globally, which covers
  `animate-fade-in-up-sm`, `animate-fade-in`, the `active:scale-*` transitions,
  the `grid-rows-[0fr]→[1fr]` navigator collapse and the ribbon. The **only** hole
  is the imperative `scrollTo({behavior:'smooth'})` in `Breadcrumb.tsx:19`, which
  Part 1 fixes.
- **The collapse/expand transition itself** (`App.tsx:838–841`,
  `duration-700 ease-in-out` on `grid-rows`) is right and matches the ribbon. Do
  not add a second animation on top of it.

### 2.2 Focus is dropped to `<body>` in three places

This is the largest real gap, and all three are the same bug: a control is
destroyed or made `inert` by its own click, and nothing catches the focus.

**(a) `components/Combobox.tsx` — selecting an option loses focus.** Escape
already does the right thing (line 328: `buttonRef.current?.focus()`), but the two
paths that actually *commit* a selection do not — Enter (311–319) and the option
click (521–525) both just `setIsOpen(false)`. In a searchable list (≥ 7 options,
so every course list and most question lists) focus was on the search input, which
unmounts; focus falls to `document.body` and the next Tab restarts from the top of
the document. Fix: extract

```ts
const commit = (id: string) => { onChange(id); setIsOpen(false); buttonRef.current?.focus(); };
```

and call it from both. Matches the file's own Escape precedent; no new dependency.

**(b) `components/SyllabusNavBar.tsx` — clicking a crumb or "Change" destroys the
bar.** A crumb click clears `promptId`, `currentPrompt` becomes undefined,
`App.tsx:519–521` sets `isNavExpanded(true)`, and the whole bar unmounts under the
pointer. "Change" (`App.tsx:825`) does the same directly. Fix in `App.tsx`: a
`navigatorRef` on the `PromptSelector` wrapper div, `tabIndex={-1}` on it, and an
effect that on the collapsed → expanded edge calls
`navigatorRef.current?.focus({ preventScroll: true })` then
`scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' })`. The
scroll matters independently of a11y: when the page is scrolled down to the
writing area, pressing "Change" unfolds a ~700px picker *above the fold* and
nothing visible moves.

**(c) `App.tsx:919–928` — "Collapse to breadcrumb" makes itself inert.** The
button lives inside the wrapper that gains `inert` on collapse (`App.tsx:837`), so
clicking it expels focus. Fix: a ref on `SyllabusNavBar`'s "Change" button,
forwarded via a new optional `expandButtonRef` prop, focused on the expanded →
collapsed edge. The control that replaced the one you pressed takes the focus —
the same symmetry `useFocusTrap` provides for modals (`DesignSpec.md` §3, Keyboard
Reach).

### 2.3 A cascade that discards a question selection is silent

Every stage `onChange` in `PromptSelector.tsx` (907–916, 1059–1068, 1244–1252,
1315–1324) clears everything below it. When a question was selected, that also
unmounts the entire `Workspace` and replaces it with the "Ready to Write" card
(`App.tsx:996–1007`) — the single largest state change in the app, with no
explanation. The stage cards do re-expand over 500ms and the `RailNode` ticks
revert, but nothing *says* what happened, and a screen-reader user gets nothing at
all.

Fix, in `PromptSelector.tsx`, small and local:

```tsx
// Named because the change is invisible where it lands: choosing a different
// topic takes the question with it, and the workspace below simply vanishes.
const LEVEL_LABEL = { courseId: 'course', topicId: 'topic', subTopicId: 'sub-topic', dotPointId: 'syllabus point' };
const [clearedNotice, setClearedNotice] = useState<string | null>(null);
const prev = useRef(statePath);
useEffect(() => {
  const before = prev.current;
  prev.current = statePath;
  if (!before.promptId || statePath.promptId) { setClearedNotice(null); return; }
  const changed = (Object.keys(LEVEL_LABEL) as (keyof typeof LEVEL_LABEL)[])
    .find((k) => before[k] !== statePath[k]);
  if (changed) setClearedNotice(`New ${LEVEL_LABEL[changed]} chosen — your question selection was cleared.`);
}, [statePath]);
```

Rendered once, immediately above the Question stage card (before line 1466's
empty-state block):

```tsx
{clearedNotice && (
  <p role="status" className="mb-3 flex items-center gap-1.5 text-xs font-medium text-amber-400 dark:text-amber-400 animate-fade-in-up-sm">
    <RotateCcw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> {clearedNotice}
  </p>
)}
```

`RotateCcw` and `animate-fade-in-up-sm` are both already in use in this file.
`role="status"` is an implicit polite live region — the announcement a
screen-reader user has never had. It clears itself the moment a question is
picked, and never fires on first-time navigation where nothing was discarded.

Deliberately **not** a toast: this happens on ordinary navigation, and `useToast`
renders `aria-live="assertive"` (`Toast.tsx:90`), which would interrupt a student
mid-sentence.

### 2.4 Two of five stages cannot explain being empty

Topic (`PromptSelector.tsx:1035–1045`) and Question (1466–1472) each have an
empty-state `<p>` with a curator/non-curator split. **Sub-Topic (section 3, ~1290)
and Dot Point (section 4) have none.** A topic with no sub-topics, or a sub-topic
with no dot points, presents a picker that opens onto a bare "No options
available." (`Combobox.tsx:536`) with nothing saying whose problem it is.

Fix: two `<p>` blocks copying the Topic stage's shape exactly (same classes, same
icon-then-text layout, same split):

- Sub-Topic, when `subTopicOptions.length === 0`: `<FolderOpen/>` + "No sub-topics
  in this topic yet." + curator: "Use Add to create one, or Add from Syllabus to
  build them from NESA text." / student: "Ask a teacher or admin to add content
  for this topic."
- Dot Point, when `dotPointOptions.length === 0`: `<List/>` + "No syllabus points
  in this sub-topic yet." + curator: "Use Generate to draft them from the
  sub-topic name." / student: "Ask a teacher or admin to add content here."

Both icons are already imported.

### 2.5 The syllabus-loading window shows a false empty state

`hooks/useSyllabusData.ts:214` does a network `fetchRemoteCourses()` before
`setIsReady(true)` (line ~224). Until that resolves, `courses` is `[]`, and
nothing gates the render on it — `isReady` reaches `useNavigation`
(`App.tsx:192`) but never the UI. A returning student on a school connection
therefore sees, for the length of a Supabase round trip: a Course `Combobox`
reading "Select Course…" that opens onto "No options available.", and
`App.tsx:1008`'s zero-courses block offering to create or import a course. The app
tells them their courses do not exist.

Fix (two small edges, both using state `App.tsx` already holds):

1. `App.tsx:861` — pass `isLoading={!isReady}` to `PromptSelector`.
2. `PromptSelector.tsx` — accept `isLoading?: boolean`; when set, pass `disabled`
   to the Course `Combobox` (line 903) and `placeholder="Loading courses…"`, and
   suppress the `canRequestCourse` "Can't find your course?" link (1015–1023),
   which is also a lie during load.
3. `App.tsx:1008` — change `{courses.length === 0 && (` to
   `{isReady && courses.length === 0 && (`.

No spinner component, no skeleton: the existing disabled-combobox chrome
(`Combobox.tsx:381`, `disabled:opacity-50 disabled:cursor-not-allowed`) already
reads as "not yet", and a skeleton for a five-stage stepper is a lot of new
surface for a sub-second window.

### 2.6 One attribute on the filter count

`components/QuestionFilterBar.tsx:74–76` — the `<span>` holding "8 of 20 shown".
Dragging the sliders changes it silently for a screen-reader user. Add
`role="status"` to that span. Nothing else in the component needs touching.

### 2.7 Explicitly out of scope (documented, not silently dropped)

- **No new keyframes or colours.** Everything above reuses `animate-fade-in`,
  `animate-fade-in-up-sm` and `active:scale-95` from `tailwind.config.js`.
- **No exit animation** for `SyllabusNavBar`, the `RailNode` tick, or the Combobox
  popup. An exit animation needs the element held mounted past its own removal (a
  presence wrapper), which is a new primitive; the entrance animations already
  carry the "an event happened" signal and the stage cards' own `duration-500`
  transition already animates the reverse.
- **No attempted-fraction badge at the Sub-Topic stage** — already deferred in
  `Plan-P1Followups.md` §2 and still costs a `fetchMyAttempts` round trip per
  topic selection.
- **No `PromptSelector` → `Combobox` scroll-to-stage on cascade.** 2.2(b) puts
  focus on the picker root; auto-scrolling to the specific stage that reopened
  needs per-stage refs and competes with the 700ms unfold.

### 2.8 Task list — Part 2

1. `components/Combobox.tsx`: extract `commit(id)`, use it in the Enter case and
   the option `onClick`.
2. `App.tsx`: `navigatorRef` + `tabIndex={-1}` on the `PromptSelector` wrapper;
   focus + `scrollIntoView` on the collapsed → expanded edge, honouring
   `prefers-reduced-motion`.
3. `components/SyllabusNavBar.tsx`: accept an optional `expandButtonRef` and
   attach it to the "Change" button; `App.tsx` focuses it on the expanded →
   collapsed edge.
4. `components/PromptSelector.tsx`: add the `clearedNotice` effect and its
   `role="status"` line above the Question stage.
5. `components/PromptSelector.tsx`: add the Sub-Topic and Dot Point empty states.
6. `components/PromptSelector.tsx` + `App.tsx`: `isLoading` prop; gate the
   zero-courses CTA on `isReady`.
7. `components/QuestionFilterBar.tsx`: `role="status"` on the count span.
8. Manual pass in `npm run dev`: tab through the picker with the mouse untouched
   and confirm focus never lands on `<body>`; change a topic with a question
   selected and confirm the notice appears and clears; throttle the network to
   Slow 3G and confirm no "no courses" flash.

---

## Tests

**Run**

- `npm run type-check` (fastest loop; `Workspace`'s new required prop and the
  deleted `BreadcrumbItem` are the two things most likely to break).
- `npm run test:all` before considering it done.
- `npm run test:e2e` — `tests/e2e/workspace-chrome.spec.ts` and
  `tests/e2e/evaluation-flow.spec.ts` both traverse this region.
- `npm run check:eager-reads` — cheap, and `types.ts` is being touched.

**Keep green (existing coverage over the changed files)**

`tests/unit/comboboxSearch.test.tsx`, `questionRefinement.test.tsx`,
`promptSelectorPastHscChip.test.tsx`, `personalOrdering.test.tsx`,
`navigationYear.test.tsx`, `syllabusYear.test.tsx`,
`manyExemplarsAndQuestions.test.tsx`, `workspacePanelChrome.test.tsx`,
`workspaceReferenceRail.test.tsx`, `bandColors.test.ts`,
`skipLinkLandmark.test.ts`.

**Add — `tests/unit/syllabusBreadcrumb.test.tsx`**

1. The nav exposes `aria-label` and exactly one element with `aria-current`.
2. A crumb carrying `onClick` renders as an enabled button and fires it; a crumb
   without one is disabled.
3. `badge` renders as its own element and is absent from the crumb's `label` text
   node (guards the PDF/`hierarchyContext` contract).
4. Re-rendering with an equal-but-new `items` array does **not** call `scrollTo` a
   second time (spy `Element.prototype.scrollTo`; the current code fails this).
5. Under `matchMedia('(prefers-reduced-motion: reduce)') → matches`, `scrollTo` is
   called with `behavior: 'auto'`.
6. `size="dense"` and `size="default"` both render the same number of crumbs and
   the same `aria` shape.

**Add — `tests/unit/navigatorFeedback.test.tsx`**

1. In a searchable `Combobox`, committing with Enter and committing by click both
   return focus to the trigger button.
2. Changing the topic while a question is selected renders a `role="status"`
   element naming the clearance; selecting a question again removes it.
3. A topic with no sub-topics renders the sub-topic empty state, with the curator
   and student copy switching on `userRole`.
4. `isLoading` renders the Course combobox disabled with the loading placeholder
   and hides the course-request link.

Mock `services/geminiService.ts` in both (`parseSyllabusStructure` is imported at
`PromptSelector.tsx:74`), and stub
`Element.prototype.scrollIntoView`/`scrollTo` as `comboboxSearch.test.tsx:14–17`
already does.

---

## Files touched

**Part 1:** `types.ts`, `components/Breadcrumb.tsx`,
`components/SyllabusNavBar.tsx`, `components/Workspace.tsx`, `App.tsx`.
**Part 2:** `components/Combobox.tsx`, `components/PromptSelector.tsx`,
`components/QuestionFilterBar.tsx`, `components/SyllabusNavBar.tsx`, `App.tsx`.
**New tests:** `tests/unit/syllabusBreadcrumb.test.tsx`,
`tests/unit/navigatorFeedback.test.tsx`.

---

## Could not verify

- The real-world duration of the `fetchRemoteCourses` window (§2.5) — this
  environment has no Supabase project attached, so the false-empty-state flash is
  reasoned from the code path, not observed.
- The visual claims (truncation at 360px, the breadcrumb pinning right while
  typing) are read from the class strings and effect dependencies; they were not
  rendered in a browser, as this was a read-only pass.
