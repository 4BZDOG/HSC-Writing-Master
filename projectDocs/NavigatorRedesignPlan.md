# Syllabus Navigator Redesign Plan

_HSC Writing Master — the syllabus navigator (`components/PromptSelector.tsx`, 1544 lines) and the surfaces that fold it away._
_Written against DesignSpec v2.2.1, in the shape of `projectDocs/HeaderRedesignPlan.md` and `projectDocs/VerbRibbonRedesignPlan.md`. British/Australian English throughout._

---

## 0a. Decisions taken

All three gating questions are settled. Binding; where the prose below still frames them as open, these win. **Steps 1–11 are all in scope.**

1. **M1 — GRANTED (a): demote, do not abolish.** Step boxes become neutral glass; the level hue survives on the rail node, the icon tile and a 2px leading edge. Third series running to land on this move.
2. **M2 — GRANTED.** This series may change `App.tsx` and `components/SyllabusNavBar.tsx`. Step 9 is in scope in full, including the focus handoff and the announcement across the fold.
3. **M3 — GRANTED.** This series may change the shared `components/Combobox.tsx`. Steps 7 and 8 are in scope, and the Data Vault's import flow is repaired at the same time — verify it by hand once, as Step 7 says.

## 0. Decisions only the maintainer can take

Three. Each changes what a step is allowed to do, and none can be settled by an implementing agent. Both previous series had these and both mattered.

### M1 — Do the five level hues survive, demoted, or go entirely?

The navigator paints Course blue, Topic purple, Sub-Topic teal, Dot Point pink and Question amber (`PromptSelector.tsx:140–195`). Those hues are **not** semantic — a course is not "more" than a topic — and the audit below shows two of them (blue, purple) are the same hues `getTierScaleConfig` uses for tiers 5 and 6, which **are** semantic, on rows rendered *inside* the amber Question step.

Two coherent answers:

- **(a) Demote, do not abolish** — the header plan's D2 and the ribbon plan's D-B, transposed a third time. The step box becomes neutral glass; the level hue survives on the rail node, the step-header icon tile and a 2px leading edge. **This plan is written for (a).**
- **(b) Abolish** — one accent (`--color-accent`) for whichever step is current, with the level carried by its name, its icon and its position on the rail. Tidier, kills the collision outright, and loses a piece of the app's character that DesignSpec §3 half-names ("Syllabus Nodes … indicate path completeness with pulsing glows" — it specifies the node, not five hues).

Decide before **Step 4**. Steps 1–3 are identical either way; Step 4's constants are the whole of the difference and the conversion is mechanical.

### M2 — May this series change `App.tsx` and `components/SyllabusNavBar.tsx`?

The largest single defect found (A1) is not in `PromptSelector.tsx`. Choosing a question flips `isNavCollapsed` (`App.tsx:676`) and unmounts the entire navigator subtree (`App.tsx:792`), which **drops keyboard focus on the floor at the most important moment in the app**, silently. The repair is a focus handoff and an announcement across the fold, and it lives in `App.tsx` and `SyllabusNavBar.tsx`.

The brief scopes this series to `PromptSelector.tsx` plus three neighbours. `App.tsx` is not among them. **Step 9 is written and must not be dispatched until this is decided.** If the answer is no, say so — Steps 1–8, 10 and 11 are still worth doing, and Step 9 shrinks to its two ungated halves (a landmark and name on `SyllabusNavBar`'s crumb trail, and `Breadcrumb` honouring reduced motion).

### M3 — May this series change the shared `components/Combobox.tsx`?

Every interactive control in the navigator is a `Combobox`. Two of the five real accessibility defects live there, not in `PromptSelector`: the trigger never returns focus after a selection (`Combobox.tsx:264–272`), and it has no accessible name of its own once something is chosen. The blast radius is small and known — `PromptSelector.tsx:9` and `components/dataManager/ImportFlow.tsx:24` are the only two call sites, plus two unit specs.

Fixing them in a navigator-local wrapper would leave both faults standing in the Data Vault's import flow. **Steps 7 and 8 are gated on this and I recommend granting it**, on the same reasoning that carried the ribbon plan's D1: the shared fix repairs two surfaces, and the alternative repairs one and hides the other.

---

## Working notes for every step

Accumulated during the audit. Each step runs with no memory of the others, so this is the only channel between them.

- **To see this component, do not select a question.** The navigator *is* the first screen after onboarding. Choosing a question folds it to a breadcrumb (`App.tsx:477–483`) and unmounts it; press **Change** on that breadcrumb to get it back. This is deliberate and is not being changed.
- **`npm run test:all`** is `lint && vitest --run && type-check && type-check:tests`. Run it before every commit; do not use `--no-verify`.
- **Placeholders and `title` strings in this component are load-bearing test selectors.** `Select Course...`, `Select Topic...`, `Select Sub-Topic...`, `Select Dot Point...`, `Select Question...` are matched by `tests/e2e/support/workspace.ts:55–68` and by three unit specs; `Add Course`, `Edit Outcomes`, `Import Topic (.json)`, `Import Syllabus (AI) — …`, `Build a new topic from NESA syllabus text or a URL (AI)` and the `into "…"` variant are matched by `tests/unit/syllabusImportEntry.test.tsx:77–121`. **Do not retype any of them.** If a step needs to change one, it must change the spec in the same commit and say so.
- **The `light:` variant outranks a plain utility.** `tailwind.config.js:92–95` registers it as `[data-theme="light"] &`, a descendant selector, so a `light:` class cannot be overridden by an unprefixed class. This is why the migration in Steps 3–5 must replace pairs, never add to them.
- **`getBandConfig`/`getTierScaleConfig` strings are `light:`-based and are not being migrated.** `utils/renderUtils.ts:258–352` is pinned by `tests/unit/bandColors.test.ts` and shared by a dozen surfaces. The `dark:`-first rule (DesignSpec §2, "Which variant to write in new code") applies to the new constants this plan adds. A rendered `className` here will legitimately contain both idioms.
- **Every contrast figure in this document is calculated from the Tailwind hexes with the backdrop stated, not measured in a browser.** Where a figure involves an alpha on the *text* colour, or a wash whose backdrop is uncertain, the step that acts on it must re-measure first. **Never estimate a composited ratio** — the ribbon series learned that the hard way (`VerbRibbonRedesignPlan.md:271`).
- **Playwright**: `/opt/pw-browsers` holds `chromium-1194` while the installed `@playwright/test` wants `1208`, so `PLAYWRIGHT_BROWSERS_PATH` alone fails. Launch with `executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`. WebKit is not installed.
- **jsdom facts** carried from the ribbon series: no `CSS.escape`; `useId` emits `«r0»`, which is not a valid bare CSS identifier, so resolve `aria-controls` with `[id="…"]`, never `#id`; `window.matchMedia` is undefined by default.
- **`lint-staged` runs `prettier --write` on `*.md`** (`package.json:84–86`). This file has not taken its reformatting hit; the first commit to touch it will reflow it. Do not fight it.
- **Reaching the navigator in a browser** *(mapped during Step 1)*: `admin`/`admin` lands on an **agreement gate** (tick the checkbox, "Agree and continue") before onboarding ("Start Writing"), and **the stock install ships no courses** — click "Load Curriculum Library" then "Import 3 items" to get `HSC Biology (Advanced)`, or the navigator has nothing below Course. Combobox options open below the fold, so Playwright needs a tall viewport and `click({ force: true })`. `UserRole` is `'admin' | 'teacher' | 'user' | 'guest'` — there is no `'student'`.
- **A 48-render comparison harness exists** from Step 1 (`scratchpad/zzNavDump.test.tsx` + `compare3.mjs`): 8 path states × 3 roles × both themes, comparing sorted class tokens per element. Copy it into `tests/unit/`, run with `NAV_DUMP_DIR=…`, delete before committing. Step 6 (geometry only) can use it unchanged.
- **Coverage floors are 63 / 59 / 57 / 62** (`vitest.config.ts:29–34`), a deliberate regression floor. `hsc-feature.md` §7's "70% minimum" is stale — do not quote it and do not raise the thresholds in a navigator commit.

---

## Step summary

| Step | Summary | Gated on |
|---|---|---|
| 1 | Extract `components/NavigatorStep.tsx`; give the navigator a landmark, a list structure and a name per step; the rail becomes decorative | — |
| 2 | Announce the cascade — one polite live region that says what was set and what was cleared | — |
| 3 | Add `utils/navigatorChrome.ts` + `tests/unit/navigatorChrome.test.tsx`; route the component through it; delete `Record<string, any>`, the dead `green` entry, the dead `getBoxClasses` branch and both `: any` props. Class values unchanged | — |
| 4 | Tokenise: neutral glass steps, `dark:`-first throughout, the level hue demoted to the node, the icon tile and a 2px leading edge | **M1** |
| 5 | Pair every solid fill with its text; lift the seven measured contrast failures | — |
| 6 | Make the rail agree with the gutter at every width | — |
| 7 | `Combobox`: return focus to the trigger, and name the trigger by its level | **M3** |
| 8 | The question picker's tier headings become real ARIA groups | **M3** |
| 9 | The fold: focus and announcement across navigator ↔ breadcrumb; a landmark on `SyllabusNavBar`; `Breadcrumb` honours reduced motion | **M2** (partly) |
| 10 | Let the e2e contrast suite see the expanded navigator | — |
| 11 | Changelog | — |

Steps 1, 2, 3, 5, 6, 10 and 11 are independent of every decision and can be dispatched immediately, in order.

---

## 1. Audit

### Finding 1 — one `aria-` attribute in 1544 lines: **CONFIRMED as a count, PARTLY REFUTED as a diagnosis**

The count is exact. `grep -n "aria-" components/PromptSelector.tsx` returns a single line:

```
1321:  aria-label="Edit focus areas"
```

`grep -n "role="` returns nothing. There is no `<nav>`, no `<section>`, no `<ol>`, no `<h1>`–`<h6>` anywhere in the file.

**But the diagnosis "no `aria-expanded`, `aria-controls`, `role` … on the app's primary navigation" is not true of what the user actually operates.** Every level of the navigator is a `Combobox`, and `components/Combobox.tsx` is well-instrumented:

- `:379–382` — the trigger carries `aria-haspopup="listbox"`, `aria-expanded={isOpen}`, `aria-controls`, `aria-activedescendant`;
- `:409–413` — the search box is a `role="combobox"` with its own `aria-controls`/`aria-activedescendant` and an `aria-label`;
- `:435–439` — the list is `role="listbox"`;
- `:464–480` — each row is `role="option"` with `aria-selected` and `aria-disabled`;
- `:220–230, 234–285` — arrows, Home/End, Enter and Escape are all handled, and the highlight skips disabled rows.

So the honest statement of the defect is not "the navigator has no ARIA". It is: **the container has none, and five specific things are consequently unsaid.** Establishing what a keyboard and screen-reader user experiences, level by level:

| What the user does | What is announced | Evidence |
|---|---|---|
| Tabs to the first control | "Select Course…, has popup listbox, collapsed, button" | `Combobox.tsx:372–395` |
| Chooses a course by mouse or Enter | Nothing. The list closes. If the list was searchable (≥7 options) focus was on the search input, which has just unmounted, so **focus falls to `document.body`** | `Combobox.tsx:264–272` — `onChange(...)`, `setIsOpen(false)`, and no `buttonRef.current?.focus()`. Only Escape restores it (`:273–283`) |
| Reads the trigger again | "Software Engineering, button". **The word "Course" is gone** — `StepHeader` renders only while the level is unchosen (`PromptSelector.tsx:870`), and `label={null}` is passed at `:874`, so no `<label>` exists. Even when a `label` *is* passed it names only the `<ul>` (`Combobox.tsx:439`), never the button | `PromptSelector.tsx:870, 873–874`; `Combobox.tsx:364–371, 439` |
| A new level appears below | Nothing. The Topic step mounts into the DOM with no announcement and no focus move | `PromptSelector.tsx:984` |
| Changes course, wiping topic → question | Nothing. `onPathChange` clears four ids (`:878–885`) and up to four steps vanish from the DOM. Silence | `:877–886`, `:1012–1020`, `:1197–1204`, `:1270–1276` |
| Opens the question list | 20 options in a flat list. The tier group headings a sighted reader gets — "Suggested next · one step on from Define", "Analyse & Apply · Band 4" — are `<li role="presentation">`, i.e. **removed from the accessibility tree** | `Combobox.tsx:450–459` |
| Chooses a question | The **entire navigator unmounts** (`App.tsx:792`). Focus is dropped. Nothing says a workspace has appeared | `App.tsx:477–483, 676, 792` |
| Looks at the progress rail | Nothing. The rail line and its five nodes are `<div>`s; "Step complete" and "Current step" exist only as `title` attributes on non-interactive elements — unreachable by keyboard, absent on touch | `PromptSelector.tsx:234, 244, 862` |

That last row is the ribbon plan's A10 defect, one component along.

### Finding 2 — `THEMES` is a private palette disconnected from the tier scale: **CONFIRMED as written; the proposed remedy REFUTED**

`PromptSelector.tsx:140` is `const THEMES: Record<string, any>` with six entries (`blue`, `purple`, `teal`, `pink`, `amber`, `green`), each a five-field bag of class strings.

Four things are true and each is worse than the finding says:

**(a) It is the *third* copy of this palette, not the second.** `components/Combobox.tsx:74–149` defines `colorStyles`, keyed by the identical colour names (`blue | purple | indigo | teal | pink | green | amber | default`), with six fields of its own. `PromptSelector` feeds it from the same call sites that feed `THEMES` — `color="blue"` at `:888` and `:910`, `"purple"` at `:1022`, `"teal"` at `:1206`, `"pink"` at `:1278`, `"green"` at `:1291`, `"amber"` at `:1460`. Two hand-maintained tables, keyed by colour name, that must agree and are pinned by nothing. (`colorStyles`' `text` field — `text-blue-100` and friends — is dead: `theme.text` has no reader in `Combobox.tsx`.)

**(b) `THEMES.green` is dead.** `grep -n "colorKey="` returns `blue`, `purple`, `teal`, `pink`, `amber` and nothing else. The `green` entry (`:186–194`) has no reader.

**(c) The steps really are non-semantic — and that is the reason not to swap them.** Course, Topic, Sub-Topic and Dot Point are containers, not cognitive demand. `getBandConfig` encodes demand and `tests/unit/bandColors.test.ts` pins it; painting "Topic" purple *because* purple is Band 6 would assert something false about a syllabus heading. The brief's instinct to think carefully here is right, and the answer is no.

**(d) The collision is already live, inside this file.** `THEMES.blue` is `border-blue-500` / `blue-100` / `blue-700`; `getBandConfig(5)` is `bg-blue-600 light:bg-blue-700`. `THEMES.purple` is `purple-500`; `getBandConfig(6)` is `bg-purple-600`. And the Question step's box is painted amber (`:1423`) while the rows *inside* it are painted red → orange → yellow → green → blue → purple from `getTierScaleConfig` (`:678, 716–745`). So within 200px of each other, blue means "Course" and blue means "Tier 5", and purple means "Topic" and purple means "Tier 6".

**Consequence for the direction.** The remedy is not "make these tiers"; it is the move both previous series converged on. **Demote the level hue and give it somewhere honest to live** (D3), and **replace the untyped colour-keyed bag with a typed level-keyed one** (D2), so that no future reader can mistake `colorKey="blue"` for a claim.

### Finding 3 — 73 `light:` usages: **CONFIRMED exactly**

`grep -o "light:" | wc -l` → **73**, over **47** lines. Distribution: 19 inside `THEMES` (`:142–193`), 3 in the module-scope presentational trio (`:250, 262, 281–290`), 10 in the five `renderLabel` builders (`:394–526`), 4 in the question row (`:728–757`), 3 in `getBoxClasses` (`:852–857`), and the remainder scattered through the JSX.

Worth stating precisely what is and is not wrong with them, because a blanket find-and-replace is the wrong tool (DesignSpec §2). These are **the old idiom, not defects** — §2 says the `light:` variant "remains valid and existing components are **not** being migrated", and the rule is that *new* code is `dark:`-first. Since Steps 3–5 rewrite substantially all of them, they should come out in that rewrite rather than in a migration commit of their own. That is the call both previous series made.

Four of the 47 lines are outright defects rather than idiom, and all four are the *absence* of a `light:` partner rather than its presence — see Finding 5 and A-items.

### Finding 4 — two `: any` types: **CONFIRMED, with a correction — there are three**

- `:140` — `const THEMES: Record<string, any>`
- `:255` — `const StepHeader = ({ icon: Icon, label, colorKey }: any)`
- `:276` — `const ActionButton = ({ onClick, icon, title, label, variant, locked }: any)`

The brief names `:140` and `:255`; `grep -n ": any"` returns `:255` and `:276`, and `:140`'s `any` is inside the `Record`. All three are in a component that composes design tokens, and `ActionButton`'s is the most costly: `variant` is a free string, so a typo (`variant="vault "`, `variant="primary_"`) silently falls through to the default branch with no type error and no test.

### Finding 5 — 11 `text-white`: **CONFIRMED as a count; the `:733` claim needs correcting**

Exactly 11: `:236, 287, 301, 554, 558, 722, 724, 1155, 1312, 1329, 1525`.

**`:733` contains no `text-white`.** It is `${tierConfig.solidBg} ${tierConfig.solidText} ${tierConfig.border}` — and it is indeed correct, and is one of the two sites `bandColors.test.ts:136` names as depending on the band-3 pairing. The defective sibling is eleven lines above it, in the same block: `:719` opens a tile with `${tierConfig.solidBg} ${tierConfig.border}` and then hard-codes `text-white` on the icon inside it at `:722` and `:724`. That is the ribbon plan's A3 and its unclosed R7a, in a third component.

Each of the eleven, judged against DesignSpec §2's question ("what is it painted on?"), with the arithmetic:

| Site | Class | Painted on | Ratio | Verdict |
|---|---|---|---|---|
| `:236` | `Check text-white` | `bg-emerald-500` (rail node, complete) | **2.54:1** | **Defect** — icon, 3:1 floor. → `bg-emerald-600` (3.77:1) |
| `:287` | `text-white` | `from-indigo-500 to-sky-500` gradient | 4.47:1 at the indigo end, 2.77:1 at the sky end | **Watch** — a gradient, so unassessable by the suite; the label is 11px bold. Deepen to `from-indigo-600 to-sky-600` or drop the label from this variant |
| `:301` | `text-white` on `bg-amber-500` | solid amber lock chip | **2.15:1** | **Defect** — icon. → `text-amber-950` (6.97:1) |
| `:554` | `bg-emerald-500 text-white` | solid emerald tile | **2.54:1** | **Defect** — icon. → `text-emerald-950` (5.97:1) |
| `:558` | `text-white` when the focus area is selected | the option row, `bg-emerald-500/10` over the list's `light:bg-white` | **1.10:1** | **The worst defect in the file.** In the light theme a selected focus area's label is white on near-white — invisible. The row's own selected styling (`Combobox.tsx:314`, `light:text-slate-900`) already handles it; this override must simply go |
| `:722` | `Lock text-white/70` | `${tierConfig.solidBg}` | tier 3: below 1.9:1 | **Defect** → `${tierConfig.solidText}` with the `/70` dropped |
| `:724` | `FileQuestion text-white` | `${tierConfig.solidBg}` | tier 3: **1.92:1** dark, **2.15:1** light | **Defect** → `${tierConfig.solidText}` (7.60:1 / 6.79:1) |
| `:1155` | `bg-purple-600 text-white` | solid purple button | 5.38:1 | **Leave** |
| `:1312` | `hover:bg-emerald-500 hover:text-white` | solid emerald on hover | **2.54:1** | **Defect** — icon. → `hover:bg-emerald-600` |
| `:1329` | `hover:bg-red-500 hover:text-white` | solid red on hover | 3.76:1 | **Leave** — icon, clears 3:1 |
| `:1525` | `from-indigo-600 to-indigo-500 text-white` | brand gradient | 6.29:1 / 4.47:1 | **Leave** |

### Additional findings — not on the brief's list

**A1 — Choosing a question unmounts the whole navigator and drops keyboard focus. This is the largest single defect and it is not in `PromptSelector.tsx`.**

`App.tsx:477–483` sets `isNavExpanded` false whenever a prompt id appears; `:676` derives `isNavCollapsed`; `:792` gates the navigator behind `{!isFocusMode && !isNavCollapsed && (`. So the act of choosing a question destroys the subtree that contains the element the user was operating. Focus goes to `document.body`. Nothing is announced. The next Tab starts from the top of the document — past the skip link, past the header — while the writing surface the student just earned sits below.

Pressing **Change** (`SyllabusNavBar.tsx:106–113`) remounts the navigator with the same silence in the other direction.

The bundled library ships three courses (`public/courseData/`), below `SEARCH_THRESHOLD = 7`, so on a stock install the course picker never shows a search box — which means the *only* picker that routinely crosses the threshold is the question picker, which is also the one whose selection unmounts everything. The two focus-loss paths (A2 and A1) coincide exactly where it hurts most.

**A2 — `Combobox` never returns focus to its trigger except on Escape.** `:264–272` (Enter) and `:467–471` (click) both call `onChange` then `setIsOpen(false)` and stop. `:273–283` (Escape) is the only path that calls `buttonRef.current?.focus()`. On a searchable list this loses focus outright, because the element that had it (`:406–419`) unmounts with the dropdown.

**A3 — the `Combobox` trigger has no name of its own.** Its accessible name is its text content: the placeholder while empty, and the selected option's `renderLabel` once chosen. There is no `aria-label`, and the `label` prop names only the `<ul>` (`:439`). `PromptSelector` passes `label={null}` at four of five levels (`:874, 905, 1009, 1194, 1448`) and a conditional string at the fifth (`:1267`). So after a full pass down the tree a screen-reader user has four buttons named "HSC Biology (Advanced)", "Year 12", "Heredity and Genetic Change", "DNA and Polypeptide Synthesis" and nothing that says which is which.

**A4 — the question picker's grouping is sighted-only.** `Combobox.tsx:450–459` renders each group heading as `<li role="presentation">`, which removes it from the accessibility tree. The code comment there (`:444–449`) explains that the grouping is what turns "twenty tinted cards" into "six kinds of question" — the entire benefit is withheld from AT. `PromptSelector.tsx:775–790` writes the headings and explains that this is "how a teacher picks and how a student should climb".

**A5 — `getBoxClasses`' third branch is dead code.** `:849–858` has three branches: selected, active, and neither. All five call sites pass `isActive` as `!isSelected` (`:866, 986, 1180, 1251, 1423`), so `isSelected === false` always implies `isActive === true`. The third branch — `opacity-60 grayscale hover:grayscale-0`, the only `grayscale` in the file — has never rendered.

**A6 — `THEMES.green` is dead** (see Finding 2b).

**A7 — the progress rail is off the left edge of the viewport below `md`.** Arithmetic from the class values:

- outer container `pl-4 md:pl-12` (`:861`) → a step box's left edge sits 16px (or 48px above `md`) inside the container;
- the node wrapper is `absolute -left-10 w-10` (`:867`) → its left edge is at `box − 40px`;
- `RailNode`'s own base is `absolute -left-[0.95rem]` (`:229`), and the wrapper is a positioned ancestor → the node's left edge is at `box − 55.2px`.

The container sits inside `<main className="… p-4 sm:p-6 lg:p-8">` (`App.tsx:735–738`). So the node's viewport x-coordinate is:

| Width | main padding | container `pl` | node x |
|---|---|---|---|
| 360px | 16 | 16 | **−23.2px** |
| 640px | 24 | 16 | **−15.2px** |
| 768px | 24 | 48 | +16.8px |
| 1280px | 32 | 48 | +24.8px |

`index.css:80–81, 91–92` set `overflow-x: clip`, so it is silently clipped rather than scrollable. The vertical rail line (`:862`, `left-[1.35rem]`) is at 37.6px on a phone, where the step boxes begin at 32px — so below `md` the line is drawn *through* the cards rather than beside them, and the nodes are gone. **This is arithmetic, not measurement — Step 6 must confirm it in a browser at 360, 640 and 768 before changing anything.**

**A8 — the final step's node can never read "complete".** `:1425` — `<RailNode isSelected={isPromptSelected} isComplete={false} …>`. Every other level derives `isComplete` from the level below (`:868, 988–992, 1182–1186, 1253–1257`). Choosing a question is the goal of the whole rail and is the one step the rail cannot celebrate.

**A9 — there are two breadcrumbs, one per navigator state, and the more prominent one is the less accessible.** `components/Breadcrumb.tsx` renders inside `Workspace` when `showBreadcrumb={!isNavCollapsed}` (`App.tsx:925`, `Workspace.tsx:583–585`) — i.e. while the navigator is **expanded**. `components/SyllabusNavBar.tsx` renders when it is **collapsed** (`App.tsx:748`). They never co-exist, they use the same four icons for the same four levels, and:

- `Breadcrumb.tsx:39–41` is a `<nav aria-label="Breadcrumb">`;
- `SyllabusNavBar.tsx:53` is a bare `<ol>` with **no landmark and no accessible name**, inside a `<div>`.

So the crumb trail a student lives with for the whole writing session is the unnamed one.

**A10 — `Breadcrumb` smooth-scrolls regardless of `prefers-reduced-motion`.** `:17–21` calls `scrollTo({ … behavior: 'smooth' })`. `index.css:217–225` sets `scroll-behavior: auto !important` under reduced motion, and that CSS property does not govern the JavaScript `behavior` option. This is exactly the ribbon plan's A4, fixed there and unfixed here; the house pattern is `ImprovementReviewModal.tsx:242–245`.

**A11 — the e2e contrast suite has never rendered this component.** Every spec reaches the workspace through `openFirstQuestion` (`tests/e2e/support/workspace.ts:55–73`), which selects a question — which collapses the navigator. `light-theme.spec.ts:62–70` runs `openFirstQuestion` in `beforeEach`, so by the time `measureContrast` runs the navigator is gone. This is the ribbon plan's A0 verbatim, one component along, and it is why every failure in Finding 5 has been sitting in the open on the app's *first screen* for as long as the suite has existed.

**A12 — `components/SelectionTree.tsx` is not part of the syllabus navigator.** Its only importers are `components/dataManager/ExportFlow.tsx:3` and `components/dataManager/ImportFlow.tsx:22`. It is the Data Vault's import/export picker. **The brief's inclusion of it is refuted.** It does have its own issues — six `light:` lines, a tree with no `role="tree"`/`role="treeitem"`, an expand chevron with no `aria-expanded` and no accessible name (`:86–93`), and arrow-key handling on the checkbox rather than the row (`:55–71`) — but they belong to a Data Vault series with its own reviewers, not to this one. Fixing it here would put a change to the import path in a commit about the navigator.

**A13 — no landmark and no heading in the file.** No `<nav>`, `<section>`, `<ol>`, `<ul>`, or `<h1>`–`<h6>`. `<main>` (added by the header series, `App.tsx:731`) is the nearest ancestor with any structure at all.

**A14 — three light-theme colours have no `light:` partner and fail on their own washes.** All three are invisible to the contrast suite twice over: once because of A11, and again because their backgrounds are hue-tinted, so `neutralBackground` (`contrast.ts:157–159`) is false and they would be measured but not gated.

| Site | Class | Backdrop | Light ratio |
|---|---|---|---|
| `:1506` | `text-purple-400` ("Manual") | `bg-purple-500/10` over white | **2.34:1** |
| `:1329` | `text-red-400` ("Reset Focus", icon) | `bg-red-500/10` over white | **2.42:1** |
| `:532` | `text-emerald-500/80` ("N focus areas") | the list's `light:bg-white` | **2.13:1** |

A fourth, `:1139`'s `text-red-400` on the inline panel's `light:bg-slate-50`, measures **2.64:1** and *is* on a neutral background — so it would be gated the moment Step 10 lands.

**A15 — the `special` and `locked` action-button variants fail AA on their labels.** `:281` and `:285` are `text-amber-500 light:text-amber-600` and `text-yellow-400 light:text-amber-600`, on `bg-amber-400/10` and `bg-amber-500/10`. `amber-600` on that wash over white is **3.03:1**, and these are the only variants that carry visible text (`:295–299`) — "Import Syllabus", "From Syllabus", "Add from Syllabus", "Generate". `amber-700` measures 4.78:1. The `danger` variant's `light:text-red-600` (4.23:1) is icon-only and clears the 3:1 non-text floor; leave it, and say so, so nobody "fixes" it.

---

## 2. Design decisions

Standing convention for all new code in this series: **light is the base, `dark:` carries the override**, per DesignSpec §2 "Which variant to write in new code", as `utils/headerChrome.ts` and `utils/verbRibbonChrome.ts` now do. The `light:` variant stays valid elsewhere, `getBandConfig`'s strings are not migrated, and both idioms will appear in the rendered `className`. That is expected.

**D1 — A shared class vocabulary in `utils/navigatorChrome.ts`, pinned by a parity sweep.** *(§2; house pattern)*

The third instance of the shape the header series established: constants in `utils/`, each commented with **what it is painted on**, and a unit test that iterates every string export and requires each unprefixed colour utility to have a `dark:` partner for the same property. Copy the classifier from `tests/unit/verbRibbonChrome.test.tsx:147–190` — it is the newer of the two and reads arbitrary alpha values, which this file needs. The sweep also asserts the file contains **zero `light:`**, which is a cheap exact pin on the migration.

**Scope limit:** the file holds the navigator's own chrome. Tier colour stays interpolated from `getTierScaleConfig(tier)` at the question-row call site.

**D2 — `THEMES` becomes a typed, level-keyed vocabulary.** *(Finding 2, Finding 4)*

```ts
export type NavigatorLevel = 'course' | 'topic' | 'subTopic' | 'dotPoint' | 'question';

export interface NavigatorLevelChrome {
  /** The rail node's ring when this step is the current one. */
  node: string;
  /** The step header's icon tile. */
  icon: string;
  /** The 2px leading edge on the active step. */
  edge: string;
  /** Which `Combobox` palette this level's pickers use. */
  combobox: ComboboxColor;
}

export const NAV_LEVELS: Record<NavigatorLevel, NavigatorLevelChrome> = { … };
```

Three things this buys that `Record<string, any>` did not: the `any` is gone; `THEMES.green` cannot survive the conversion because there is no level called green; and the call sites stop saying `colorKey="blue"` and start saying `level="course"`, so the next reader cannot read a hue as a claim. The `combobox` field puts the two parallel palettes (Finding 2a) into one place, which is as far as this series should go towards merging them — actually merging `Combobox.colorStyles` into `getBandConfig` is a different job with a different blast radius.

**D3 — The level hue is demoted, not abolished.** *(§1, §3 Layering; the header plan's D2 and the ribbon plan's D-B transposed; **gated on M1**)*

The step box becomes neutral glass:

```ts
export const NAV_STEP_BOX_ACTIVE =
  'relative w-full rounded-2xl py-6 px-6 z-20 border transition-all duration-500 ease-out ' +
  'bg-white border-slate-300 shadow-xl shadow-slate-900/5 ' +
  'dark:bg-[rgb(var(--color-bg-surface))] dark:border-white/10 dark:shadow-lg dark:shadow-black/30';

export const NAV_STEP_BOX_DONE =
  'relative w-full rounded-2xl py-3 px-4 z-10 border transition-all duration-500 ease-out ' +
  'bg-white/70 border-slate-200 shadow-sm ' +
  'dark:bg-[rgb(var(--color-bg-surface))]/60 dark:border-white/5 dark:shadow-none';

/** Edge-lighting, and where the level hue went. The gradient arrives from
 *  `NAV_LEVELS[level].edge` at the call site. Rendered on the active step only. */
export const NAV_STEP_EDGE =
  'absolute inset-y-3 left-0 w-0.5 rounded-full pointer-events-none bg-gradient-to-b';
```

The hue survives in three places, all small enough to be honest: the rail node's ring, the step-header icon tile, and that 2px edge. `scale-[1.01]` (`:855`) goes with the rewrite — under `overflow-x: clip` it clips the right edge by half a percent and buys nothing once the active box has its own elevation.

**Why not tier/band identity:** Finding 2c. Course, Topic, Sub-Topic and Dot Point are containers, and `getBandConfig` is pinned as meaning cognitive demand. This is the concrete disagreement with the brief's second finding.

**D4 — Every solid fill pairs with its own text.** *(§2, Finding 5)* Three sites take `tierConfig.solidText` in place of a literal `text-white` (`:722, :724`, and the `/70` on the lock icon); three more take an explicit dark partner on a solid brand fill (`:236` emerald tick, `:301` lock chip, `:554` focus tile); one override is deleted outright (`:558`). This is a token fix, not a colour choice — `bandColors.test.ts:136` already names `PromptSelector`'s question chip as a consumer of the pairing, and the tile 11 lines above it should have been one too.

**D5 — The four light-theme colours with no partner get one.** *(§2, A14, A15)*

| From | To | Light ratio |
|---|---|---|
| `text-purple-400` (`:1506`) | `text-purple-700 dark:text-purple-400` | 2.34 → **6.18:1** |
| `text-red-400` (`:1329`) | `text-red-600 dark:text-red-400` | 2.42 → **4.23:1** (icon, 3:1 floor) |
| `text-emerald-500/80` (`:532`) | `text-emerald-700 dark:text-emerald-400` | 2.13 → **5.48:1** |
| `text-red-400` (`:1139`) | `text-red-600 dark:text-red-400` | 2.64 → **4.62:1** |
| `light:text-amber-600` (`:281, :285`) | `text-amber-700 dark:text-yellow-400` | 3.03 → **4.78:1** |

The `danger` variant's `light:text-red-600` stays: icon-only, 4.23:1, clears its floor. Say so in the constant's comment.

**D6 — The navigator gets a shape a screen reader can read.** *(§3 Keyboard Reach; Finding 1, A13, A14)*

- `<nav aria-label="Syllabus navigator">` wrapping an `<ol>` of five `<li>` steps.
- Each step is a `role="group"` with `aria-labelledby` pointing at a name that is **always in the DOM** — visible while the level is unchosen, `sr-only` once it is. The name states the level and its state: `Course — chosen: HSC Biology (Advanced)`, `Topic — current step`, `Question — not available yet`.
- The rail line and the five nodes become `aria-hidden="true"`, and their two `title`s (`:234, :244`) are deleted. A `title` on a `<div>` is not an accessible name; the fact it carries now lives in the group name.
- Five near-identical step wrappers (container div + rail-node div + `StepHeader` + box div) become one `components/NavigatorStep.tsx`.

**D7 — One polite live region, owned by the navigator.** *(§3; Finding 1)* `role="status" aria-live="polite"` with `aria-atomic="true"`, `sr-only`, updated from an effect keyed on the path. It must state **both halves** — what was set and what was cleared — because the cascade reset is the thing that is currently invisible:

> `Topic set to Heredity and Genetic Change. Sub-topic, syllabus point and question cleared.`

The house precedents are `ApiHealthIndicator.tsx` and `EvaluationProgressBar.tsx:80`. Deliberately **not** `assertive`: this follows the user's own action and must not interrupt.

**D8 — `Combobox` returns focus to its trigger, and the trigger is named by its level.** *(§3; A2, A3; **gated on M3**)*

- `buttonRef.current?.focus()` on every close that follows a selection — the Enter path (`:264–272`) and the click path (`:467–471`). **Not** on click-away (`:198–206`): a click elsewhere is a request to be elsewhere.
- The trigger's accessible name becomes `aria-labelledby={[nameId, valueId].join(' ')}`, so it reads "Course, HSC Biology (Advanced)". The name **must remain a superset of the current one**: `tests/unit/syllabusYear.test.tsx:310` finds the year trigger by `getByRole('button', { name: /Year 1[12]/ })` and `tests/unit/comboboxSearch.test.tsx:35` by `/select/i`, both regex substring matches, so prefixing is safe and replacing is not.

**D9 — The question picker's tier headings become real groups.** *(§3; A4; **gated on M3**)* Each run becomes `<li role="group" aria-label={groupName}>` holding an `aria-hidden` visual heading and its `role="option"` children. ARIA 1.2 permits `group` as a child of `listbox` and `option` as a child of `group`. The option ids, `data-option-index` and `aria-activedescendant` arithmetic are unaffected because they are per-option and index-based.

**D10 — The rail agrees with the gutter at every width.** *(A7)* One source of truth for the gutter, and the node offsets expressed from it:

```ts
/** The navigator's left gutter. The rail line and the rail nodes are BOTH
 *  positioned from this number; when they disagreed the nodes were at a
 *  negative viewport coordinate below `md` and were clipped away by
 *  `overflow-x: clip`. Change one, change all three. */
export const NAV_GUTTER = 'pl-10 md:pl-12';
export const NAV_RAIL_LINE = 'absolute left-5 md:left-6 top-0 bottom-0 w-px …';
export const NAV_NODE_SLOT = 'absolute -left-10 md:-left-12 top-1/2 -translate-y-1/2 w-10 md:w-12 …';
```

with `RailNode` centred in its slot rather than pulled out of it (drop `-left-[0.95rem]`; the slot is already `flex items-center justify-center`). **These numbers must be measured, not trusted** — Step 6 verifies at 360, 640, 768 and 1280 in both themes.

**D11 — The last step can complete.** *(A8)* `isComplete={isPromptSelected}` on the Question node, with the ring reserved for "current". Choosing a question is the rail's whole purpose.

**D12 — The fold announces itself and hands over focus.** *(A1; **gated on M2**)* On collapse, `App.tsx` moves focus to the `SyllabusNavBar` (which gains `tabIndex={-1}` and an id) and the live region says what happened; on expand, focus goes to the navigator's first control. `SyllabusNavBar`'s crumb `<ol>` gains `<nav aria-label="Syllabus path">` to match `Breadcrumb.tsx:39–41` (A9).

**D13 — Rejected: splitting `PromptSelector` into five level components.** Considered and rejected. Unlike the header — 170 lines inline in a 1500-line `App.tsx`, where extraction bought every later step stable coordinates — the five levels here are not symmetrical: each has a different action cluster, two carry inline editors, and a per-level component would need a props bag of a dozen callbacks. What *is* worth extracting is the part that genuinely repeats: the container, the rail node, the header and the group semantics. That is `NavigatorStep.tsx` (Step 1), and it buys the same stable coordinates for the same reason. Revisit a fuller split if the file grows past what `navigatorChrome.ts` can describe.

**D14 — Out of scope, deliberately:** `components/SelectionTree.tsx` (A12 — a different feature), `components/QuestionFilterBar.tsx` and `components/CoverageChip.tsx` (siblings rendered by the navigator, not part of it), `utils/renderUtils.ts` (nothing here needs a shared-token change; band 3 was already fixed by the ribbon series), and merging `Combobox.colorStyles` into `getBandConfig`.

### Light-theme parity ledger

Per §2 the question is "what is it painted on?", not "is this class dark-only?".

| Current class | Site | Sits on | Verdict |
|---|---|---|---|
| `light:bg-white`, `light:border-slate-300` in `THEMES` ×12 | `:142–193` | the page | **Re-express** `dark:`-first → `NAV_LEVELS` (D2) |
| `light:bg-blue-100 light:text-blue-700` etc., icon tiles ×5 | `:394, 429, 478, 500, 526` | the option row's white surface | **Re-express**; ratios already pass |
| `light:bg-white`, `light:bg-slate-50` in `getBoxClasses` | `:852, 855, 857` | the page | **Re-express** → `NAV_STEP_BOX_*` (D3); `:857` deleted (A5) |
| `bg-white/5 light:bg-slate-400` rail line | `:862` | the page | **Re-express** → `NAV_RAIL_LINE` |
| `text-white` on solid brand/tier fills ×5 | `:236, 301, 554, 722, 724` | solid fill | **Defect** — D4 |
| `text-white` on a near-white row | `:558` | `bg-emerald-500/10` over white | **Defect, 1.10:1** — delete (D4) |
| `text-white` on gradients ×3 | `:287, 1155, 1525` | brand gradient | **Leave** — same colour in both themes (§2), except `:287`'s sky end (D4, watch) |
| `text-purple-400`, `text-red-400` ×2, `text-emerald-500/80` | `:1506, 1329, 1139, 532` | hue washes and a slate panel | **Defect** — D5 |
| `light:text-amber-600` ×2 | `:281, 285` | amber wash | **Defect, 3.03:1** — D5 |
| `light:text-red-600` | `:283` | red wash, icon only | **Leave** — 4.23:1 clears the 3:1 floor |
| `light:text-emerald-700` ×2 | `:1311, 1312` | emerald wash | **Leave** — 4.99:1 |
| `light:text-emerald-800` focus pill | `:1381` | `bg-emerald-500/20` | **Leave** — 6.36:1 |
| `light:text-indigo-600` | `:975` | the step box | **Re-express** only |

---

## 3. Implementation steps

Each step is written for an agent with no memory of this document's other steps and no access to the conversation that produced it. Every step ends type-checking and test-passing, and is one commit. Run `npm run test:all` before each commit; do not use `--no-verify`.

**Every line number in this document for `PromptSelector.tsx` is accurate as at the start of Step 1 and stale thereafter.** Step 1 extracts a component and re-indents the five step blocks. From Step 2 onwards, **locate code by searching for it**, not by line number.

**Read first, every step:** the navigator is the app's first screen after onboarding. Choosing a question folds it to a breadcrumb and unmounts it (`App.tsx:477–483, 676, 792`); press **Change** to get it back. That fold is deliberate and only Step 9 may touch it.

---

### Step 1 — Extract `components/NavigatorStep.tsx`, and give the navigator a shape

**Why first:** it is the DesignSpec §3 violation, it touches no colour so it cannot collide with any later step, and it gives every later step stable coordinates.

**Files:** create `components/NavigatorStep.tsx`; edit `components/PromptSelector.tsx`; edit `tests/unit/promptSelectorPastHscChip.test.tsx` (add cases only).

**Current code.** Five near-identical wrappers, at `PromptSelector.tsx:865–870`, `985–994`, `1179–1189`, `1250–1261` and `1422–1428`. Each is:

```tsx
<div className={getContainerClasses(isXSelected, 'z-NN')}>
  <div className={getBoxClasses(isXSelected, !isXSelected, 'hue')}>
    <div className="absolute -left-10 top-1/2 -translate-y-1/2 w-10 flex items-center justify-center">
      <RailNode isSelected={isXSelected} isComplete={isYSelected} colorKey="hue" />
    </div>
    {!isXSelected && <StepHeader icon={Icon} label="Label" colorKey="hue" />}
    …level-specific content…
  </div>
</div>
```

`getContainerClasses` is at `:845–847`, `getBoxClasses` at `:849–858`, `RailNode` at `:218–253`, `StepHeader` at `:255–267`. The outer container is `:861` (`flex flex-col pl-4 md:pl-12 relative animate-fade-in`) and the rail line is `:862`.

**Target.** `components/NavigatorStep.tsx` exports a presentational component:

```tsx
interface NavigatorStepProps {
  /** Which rung of the ladder. Drives the hue, the icon and the name. */
  level: 'course' | 'topic' | 'subTopic' | 'dotPoint' | 'question';
  label: string;              // 'Course', 'Topic', 'Sub-Topic', 'Syllabus Content', 'Question'
  icon: LucideIcon;
  isSelected: boolean;
  isComplete: boolean;
  /** What was chosen, for the step's accessible name. */
  chosenLabel?: string;
  zIndex: string;
  children: React.ReactNode;
}
```

It renders an `<li>` containing a `role="group"` box, the rail-node slot, the header and `children`, and it moves `getContainerClasses`/`getBoxClasses`/`RailNode`/`StepHeader` in with it **verbatim** — same class strings, same `THEMES` lookup. **Move `THEMES` into `NavigatorStep.tsx` and export it**, so `PromptSelector` imports it back. Step 3 relocates it again to `utils/`.

Then, in `PromptSelector.tsx`:

1. Wrap the whole return in `<nav aria-label="Syllabus navigator">` → a list container, and make the five steps its children. The rail line div stays as the first child, unchanged.
2. Each step's accessible name is built from `useId()` per step and rendered into a span that is visible when `!isSelected` (the current `StepHeader` behaviour) and `sr-only` when selected. Wording:
   - unchosen and reachable → `Course — current step`
   - chosen → `Course — chosen: HSC Biology (Advanced)`
   - the question step with no questions → `Question — none available yet`
3. `aria-hidden="true"` on the rail line and on the rail-node slot; delete `title="Step complete"` and `title="Current step"` from `RailNode`.

**Do not touch:** any class string; any `title` on an `ActionButton`; any `Combobox` `placeholder`; `THEMES`' values; the `getBoxClasses` third branch (Step 3 deletes it); `App.tsx`.

**Gotcha:** an `<ol>` whose children are `<li>` and one absolutely-positioned `<div>` is invalid HTML — put the rail line inside the first `<li>`, or make the outer element a `<div role="list">` with `role="listitem"` children. **Prefer the latter**: it keeps the current DOM shape and the current CSS, and `role="list"` survives `list-style: none` (which Safari's accessibility tree otherwise strips).

**Verify:** `npm run type-check`, `npm run test:all`. Visual output must be pixel-identical — compare by eye in both themes before committing. Add to `tests/unit/promptSelectorPastHscChip.test.tsx` (it is the file that already renders the whole component with a mocked `geminiService`):

- `screen.getByRole('navigation', { name: /syllabus navigator/i })` exists;
- five `role="group"` steps, and the chosen ones are named `/Course — chosen: /` etc.;
- `queryByTitle('Step complete')` and `queryByTitle('Current step')` are both null.

---

### Step 2 — Announce the cascade

**Files:** `components/PromptSelector.tsx`; `tests/unit/promptSelectorPastHscChip.test.tsx` (or a new `tests/unit/navigatorAnnouncements.test.tsx`).

**Current behaviour.** Choosing at any level calls `onPathChange` with the new id plus `undefined` for every id below it — search the file for `onPathChange({` and you will find the five cascades. Choosing a course clears four levels; choosing a topic clears three; and so on. Up to four steps disappear from the DOM with no announcement. `App.tsx` owns the path (`handlePathChange`), so `PromptSelector` sees the change arrive as new props.

**Target.** One region, rendered once near the top of the `<nav>`:

```tsx
<p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
  {announcement}
</p>
```

`announcement` comes from a `useRef` of the previous path plus an effect keyed on `[statePath.courseId, statePath.syllabusYear, statePath.topicId, statePath.subTopicId, statePath.dotPointId, statePath.promptId]`. Compare old to new and build one sentence with both halves:

- something set → `Topic set to Heredity and Genetic Change.`
- something cleared below it → ` Sub-topic, syllabus point and question cleared.`
- something cleared with nothing set (a crumb click from the collapsed bar) → `Topic cleared. Choose a topic to continue.`

Use the level names the UI already uses: Course, Year, Topic, Sub-topic, Syllabus point, Question. Do **not** invent new vocabulary — "Syllabus Content" is the visible heading for the dot-point step (`:1260`) but "syllabus point" is what `Combobox`'s label says at `:1267`; prefer the latter in speech.

**Two things to get right:**

- **Announce nothing on mount.** Seed the ref on the first effect run and return. An assignment link (`utils/assignmentLink.ts`) lands a user on a full path; announcing five levels at once on load is noise.
- **`aria-atomic="true"`**, or a partially-changed string is read partially by some AT.

**Do not touch:** `onPathChange`'s payloads; `App.tsx`; anything visual.

**Verify:** new unit cases — rerender with a changed `courseId` and assert the status node's text names both the set and the cleared levels; rerender with an identical path and assert the node is empty; assert the first render announces nothing. `npm run test:all`.

---

### Step 3 — `utils/navigatorChrome.ts` + `tests/unit/navigatorChrome.test.tsx`

**Precedent:** `utils/headerChrome.ts` + `tests/unit/appHeaderChrome.test.tsx`, and `utils/verbRibbonChrome.ts` + `tests/unit/verbRibbonChrome.test.tsx`. **Read `utils/verbRibbonChrome.ts` before starting** — it is the model for the doc comments (every constant records what it is painted on) and `tests/unit/verbRibbonChrome.test.tsx:147–190` holds the parity classifier to copy verbatim.

**Files:** create `utils/navigatorChrome.ts` and `tests/unit/navigatorChrome.test.tsx`; edit `components/NavigatorStep.tsx` and `components/PromptSelector.tsx`.

**This step changes no rendered class.** It does three things:

1. **Lift the literals into named exports** and consume them, so Step 4's diff is a diff of values in one file. Initial exports, values copied verbatim from the current JSX: `NAV_ROOT`, `NAV_GUTTER`, `NAV_RAIL_LINE`, `NAV_NODE_SLOT`, `NAV_NODE_BASE`, `NAV_NODE_COMPLETE`, `NAV_NODE_UPCOMING`, `NAV_STEP_BOX_ACTIVE`, `NAV_STEP_BOX_DONE`, `NAV_STEP_HEADER_LABEL`, `NAV_ACTION_BUTTON`, `NAV_ACTION_VARIANTS`, `NAV_INLINE_PANEL`, `NAV_INLINE_INPUT`, `NAV_FOCUS_PILL`, `NAV_OPTION_TILE`.
2. **Replace `THEMES` with `NAV_LEVELS`** per D2 — a `Record<NavigatorLevel, NavigatorLevelChrome>` with the four fields and the existing class values re-homed. The `green` entry has no level and therefore does not survive; check before deleting that `grep -n 'colorKey=\|level='` really does return only the five (it does today). Call sites change from `colorKey="blue"` to `level="course"`.
3. **Delete three pieces of dead code**, which by definition changes nothing rendered:
   - `getBoxClasses`' third branch — all five call sites pass `isActive` as `!isSelected`, so it is unreachable. Its `opacity-60 grayscale hover:grayscale-0` is the only `grayscale` in the file.
   - the `: any` on `StepHeader` and on `ActionButton`. Give `ActionButton` a real props interface with `variant?: 'default' | 'danger' | 'special' | 'primary' | 'vault'`; expect `type-check` to find at least one call site it disagrees with, and fix the call site, not the type.
   - `THEMES.green`.

**New test** (`tests/unit/navigatorChrome.test.tsx`):

1. **The constants are worn** — the navigator root, a step box, a rail node, an action button and the inline panel each carry their constant (`expect(el.className).toContain(NAV_…)`).
2. **The parity sweep** — copy `verbRibbonChrome.test.tsx:147–190` unchanged. It will **fail** on this step's values, because they are still `light:`-based. Land the sweep with an explicit `exempt` set naming every constant Step 4 will rewrite, and **require Step 4 to empty it**. Do not land it skipped — a skipped test that nobody re-enables is how these guards die.
3. **No level is named after a colour** — `Object.keys(NAV_LEVELS)` is exactly the five level names.

**The sweep recurses into nested objects** *(built this way in Step 3)*. `NAV_LEVELS` and `NAV_ACTION_VARIANTS` are objects, which the ribbon's flat iterator would have skipped entirely — the classifier is copied verbatim but the walk recurses, so exempt entries are dotted: `NAV_LEVELS.course.activeBorder`, `NAV_ACTION_VARIANTS.special`. A **second test fails if an exemption is kept after it is earned back**, so Step 4 cannot empty half the set and leave the rest.

Mock `services/geminiService` in every render test (house rule — `promptSelectorPastHscChip.test.tsx:14–16` shows the shape).

**Do not touch:** any class value.

> **"A `git diff` of the rendered DOM must be empty" is unachievable and was wrong** *(corrected during Step 3)*. Lifting a string into a constant reorders tokens *within* the `class` attribute — `${NAV_STEP_BOX_ACTIVE} ${activeBorder}` puts the hue last where it used to be interleaved. CSS does not read attribute order, so this is cosmetic. The real invariant, and the one to verify, is that the **class *set* per element is unchanged**. Compare sorted tokens, not raw strings.

---

### Step 4 — Tokenise the steps *(gated on M1)*

**Files:** `utils/navigatorChrome.ts`, `components/NavigatorStep.tsx`, `tests/unit/navigatorChrome.test.tsx`.

**Read the decision first.** M1 in §0 chooses between (a) demoting the five level hues and (b) abolishing them. **This step is written for (a).** If (b) was chosen, the only difference is that `NAV_LEVELS[level].node`, `.icon` and `.edge` all resolve to the one accent (`rgb(var(--color-accent))`) and the five entries collapse to a shared constant; everything else below is unchanged.

**Current:** after Step 3 the class strings live in `utils/navigatorChrome.ts` and the JSX reads `className={NAV_STEP_BOX_ACTIVE}`. **Locate everything through the constants file — do not grep the JSX for class strings, they are no longer there.**

**Target** (D3's constants, plus):

```ts
/** The rail node's three states. One semantic everywhere: done = emerald tick,
 *  current = a ring in the level's hue, upcoming = hollow. The previous version
 *  glowed every dot in its level's hue, which read as a random traffic light. */
export const NAV_NODE_COMPLETE =
  'w-[1.15rem] h-[1.15rem] bg-emerald-600 border-2 border-emerald-500/60 ' +
  'shadow-[0_0_10px_rgba(5,150,105,0.45)]';

export const NAV_NODE_UPCOMING =
  'w-4 h-4 border-2 scale-90 opacity-60 ' +
  'bg-slate-200 border-slate-400 dark:bg-[rgb(var(--color-bg-surface))] dark:border-white/20';

export const NAV_STEP_HEADER_LABEL =
  'text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white';
```

and, in `NAV_LEVELS`, each level's `icon` as a `dark:`-first pair — e.g. course:

```ts
icon: 'bg-blue-100 text-blue-700 border-blue-200 ' +
      'dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20',
edge: 'from-blue-500 to-blue-400 dark:from-blue-400 dark:to-blue-500',
node: 'border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)] bg-white dark:bg-[rgb(var(--color-bg-surface))]',
```

In `NavigatorStep.tsx`: render `<div className={`${NAV_STEP_EDGE} ${NAV_LEVELS[level].edge}`} aria-hidden="true" />` as the active box's first child; drop `scale-[1.01]`; repoint the box, node and header at the new constants.

**Do not touch:** the gutter and the node offsets — that is Step 6, and mixing a geometry change into the visually dramatic step makes both un-reviewable. Do not touch `getTierScaleConfig` or anything inside the question row's `renderLabel` — that is Step 5.

**Step 4's constants already exist under the planned names**, so its diff is one file plus `NavigatorStep.tsx`. Two extra names it will need: `NAV_NODE_CURRENT` (`'w-4 h-4 border-2 scale-125'`) and `NAV_STEP_HEADER_TILE` (`'p-1.5 rounded-md'`). `scale-[1.01]` lives inside `NAV_STEP_BOX_ACTIVE`. Dropping `activeBorder`/`activeShadow`/`selectedBorder` from `NavigatorLevelChrome` and adding `edge` is a change to `boxClasses()` in `NavigatorStep.tsx` and nothing else.

**The option-row icon tiles are NOT in `navigatorChrome.ts`** — only their geometry (`NAV_OPTION_TILE`) was lifted, because their hues are per-picker and they disagree with the step hues: the sub-topic *rows* are **indigo** while the sub-topic *step* is teal. The parity ledger's "icon tiles ×5 — Re-express" row is about these, and whichever step takes it will find them in `PromptSelector.tsx`. Same for the focus-area tile (emerald) and the `color="green"` Active Focus combobox — which is why `Combobox.colorStyles.green` is still live even though `THEMES.green` was dead.

**Extend the test:** the parity sweep must now pass with **no exemptions** — empty the `exempt` set Step 3 landed; assert `NAV_STEP_BOX_ACTIVE` contains both a light and a `dark:` background; assert no export contains `light:`.

**Risk:** this is the visually dramatic step and it has no automated safety net until Step 10. **Verify by eye in both themes, at both states of every level** — five steps × chosen/unchosen. `opacity-50` on the upcoming node is being raised to `opacity-60`; if the "not there yet" reading is lost, take the de-emphasis from `scale-90` and the hollow fill rather than from opacity (the ribbon series' D-E).

---

### Step 5 — Pair every solid fill, and lift the seven measured failures

**Files:** `components/PromptSelector.tsx`, `utils/navigatorChrome.ts`, `tests/unit/navigatorChrome.test.tsx`.

> **Three of this step's figures were wrong, and measurement found all three** *(Step 5)*. Recorded so the arithmetic below is read as the estimate it was:
> - the amber label's backdrop is the **wash**, not white, so `amber-700` measures **4.51:1** — one hundredth over the floor. Shipped as `amber-800` (**6.37:1**), and the test asserts `amber-800`.
> - "N focus areas" does not sit on the white list surface; it sits on the dot-point row's own **pink tint**, reading **1.96:1** not 2.13 — and it was *also* failing in the **dark** theme at 3.86:1, which this plan never considered.
> - a site not on the list at all: the **tick beside a selected focus area** is `emerald-400` on that same wash at **1.75:1**. Fixed in the same commit, because leaving it would have meant repairing three quarters of one row.
>
> The rule this vindicates: calculated is not measured, and a backdrop assumed is a backdrop wrong.

**Before changing a value, re-measure the three that sit on a wash.** The figures below are calculated from the Tailwind hexes with the backdrop stated; the three marked ‡ have a backdrop this document inferred. Open the app, set the light theme, and read the computed colours in DevTools before choosing final values. Never estimate a composited ratio.

**The eleven sites, and what each becomes:**

| Search for | Currently | Becomes | Ratio |
|---|---|---|---|
| `<Check className="w-3 h-3 text-white"` in the rail node | `bg-emerald-500` behind it | `bg-emerald-600` (in `NAV_NODE_COMPLETE`) | 2.54 → **3.77:1** |
| `rounded-full bg-amber-500 text-white` (lock chip) | white on amber-500 | `bg-amber-500 text-amber-950` | 2.15 → **6.97:1** |
| `bg-emerald-500 text-white border-emerald-400/30` (focus tile) | white on emerald-500 | `bg-emerald-500 text-emerald-950` | 2.54 → **5.97:1** |
| `${isSelected ? 'text-white' : ''}` (focus area label) | white on `bg-emerald-500/10` over white | **delete the override entirely** — `Combobox.tsx:314` already sets `text-white light:text-slate-900` on the row | 1.10 → row default |
| `<Lock className="w-5 h-5 text-white/70" />` in the question row tile | white/70 on `${tierConfig.solidBg}` | `${tierConfig.solidText}` with no opacity | tier 3: below 1.9 → **7.60:1** dark |
| `<FileQuestion className="w-5 h-5 text-white" />` | white on `${tierConfig.solidBg}` | `${tierConfig.solidText}` | 1.92 / 2.15 → **7.60 / 6.79:1** |
| `text-emerald-500/80` ("N focus areas") ‡ | on the list surface | `text-emerald-700 dark:text-emerald-400` | 2.13 → **5.48:1** |
| `text-purple-400` on the "Manual" button ‡ | on `bg-purple-500/10` | `text-purple-700 dark:text-purple-400` | 2.34 → **6.18:1** |
| `text-red-400` on "Reset Focus" ‡ | on `bg-red-500/10` | `text-red-600 dark:text-red-400` | 2.42 → **4.23:1** (icon) |
| `text-red-400` on `inlineError` | on `light:bg-slate-50` | `text-red-600 dark:text-red-400` | 2.64 → **4.62:1** |
| `light:text-amber-600` in `NAV_ACTION_VARIANTS.special` **and** `.locked` (Step 3 made `locked` a real sixth key; it was a branch) | on the amber wash | `text-amber-700 dark:text-yellow-400` | 3.03 → **4.78:1** |
| `hover:bg-emerald-500 hover:text-white` (focus-area editor) | white on emerald-500 | `hover:bg-emerald-600` | 2.54 → **3.77:1** |

**Do not touch:**

- the `danger` variant's `light:text-red-600` — it is icon-only at 4.23:1, which clears the 3:1 non-text floor. Leave it and add a comment saying so, or the next reader will "fix" it into inconsistency.
- `${tierConfig.solidBg} ${tierConfig.solidText}` on the verb chip — it is already the correct pairing and `tests/unit/bandColors.test.ts:136` names it.
- `utils/renderUtils.ts`. Band 3's `solidText` was already taken to `text-yellow-950` by the verb-ribbon series; nothing here needs a shared-token change.
- the `primary` variant's `from-indigo-500 to-sky-500 text-white`. Its sky end is 2.77:1, but it is a brand gradient and the same colour in both themes (§2). **Record it as a carried open item** rather than fixing it in a navigator commit — the same gradient appears at `LegalDocumentModal.tsx:49` and three other surfaces, and changing it here alone would orphan the identity.

**Extend the test:** render with a tier-3 question and assert the row's icon tile carries `text-yellow-950` and **not** `text-white`; assert the selected focus-area label carries no `text-white`; assert `NAV_ACTION_VARIANTS.special` contains `amber-700` and not `amber-600`.

**Verify:** `npm run test:all`, plus eyes in the light theme with a tier-3 (yellow) question selected — that is the tier every one of these defects is worst on.

---

### Step 6 — Make the rail agree with the gutter at every width

**Files:** `utils/navigatorChrome.ts`, `components/NavigatorStep.tsx`, `components/PromptSelector.tsx`.

> **Measured, and NOT a no-op** *(Step 6)*. At **360px every node spanned −22.2 to −3.8** — entirely off-viewport, with `docScrollWidth === clientWidth === 360`, so silently clipped rather than scrollable. At 640px four pixels of eighteen were visible. 768 and 1280 were fine. The rail line at 37.6px was drawn *through* boxes beginning at 32px. After the fix: nodes at 27.8–46.2 (360px) and 35.8–54.2 (640px), fully visible, line at their centre to within one pixel — the residual is the step box's own border, which `left` counts from. Costs 24px of card width on a phone, which is the right trade for a progress rail that was not on the screen.

**Measure before you change anything.** The claim this step acts on is arithmetic, not observation: the gutter is `pl-4 md:pl-12`, the node slot is `-left-10`, and `RailNode` adds a further `-left-[0.95rem]` inside that slot, which puts the node's left edge at `box − 55.2px` while the box's left edge is only 16px inside the container at mobile widths. With `<main>`'s own `p-4` that computes to **−23.2px at 360px** and **−15.2px at 640px**, clipped away by `index.css`'s `overflow-x: clip`. **Confirm it in a browser at 360, 640, 768 and 1280 before touching a value**, and record what you measured in the commit message. If the nodes are in fact visible at 360px, this step is a no-op and should be closed rather than forced.

**Target** (D10): one gutter constant, with the rail line and the node slot both expressed from it, and `RailNode` centred in its slot instead of pulled out of it:

- `NAV_GUTTER = 'pl-10 md:pl-12'` — 40px at every width, which is exactly the slot's width, so the slot lands flush against the container's left edge;
- `NAV_RAIL_LINE` at `left-5 md:left-6` — the slot's centre;
- `NAV_NODE_SLOT = 'absolute -left-10 md:-left-12 top-1/2 -translate-y-1/2 w-10 md:w-12 flex items-center justify-center'`;
- `RailNode`'s base loses `absolute -left-[0.95rem] top-1/2 -translate-y-1/2` and becomes a plain flex child of the slot.

Each constant carries the comment: *the rail line and the rail nodes are both positioned from `NAV_GUTTER`; when they disagreed the nodes sat at a negative viewport coordinate below `md`. Change one, change all three.*

**Do not touch:** any colour; `App.tsx`'s `<main>` padding; `utils/layoutConstants.ts`.

**Verify by hand at 360, 640, 768 and 1280, in both themes, with the path empty, half-filled and complete.** Every rail node must be fully on screen and vertically centred on its step, and the rail line must sit to the *left* of every step box at every width — below `md` today it is drawn through them. Take a screenshot at 360px for the commit.

---

### Step 7 — `Combobox` returns focus, and names itself *(gated on M3)*

**Files:** `components/Combobox.tsx`, `components/PromptSelector.tsx`, `tests/unit/comboboxSearch.test.tsx`.

**Current code.**

- `Combobox.tsx:264–272`, the Enter branch: `onChange(visibleOptions[highlightedIndex].id); setIsOpen(false);` — and nothing else.
- `Combobox.tsx:467–471`, the click handler on each `<li>`: `onChange(option.id); setIsOpen(false);` — and nothing else.
- `Combobox.tsx:273–283`, the Escape branch, is the **only** path that calls `buttonRef.current?.focus()`.
- `Combobox.tsx:214–216` focuses the search input when a searchable list opens; that input unmounts with the dropdown, so on a ≥7-option list a selection leaves focus on `document.body`.
- `Combobox.tsx:364–371` renders the `label` as a `<label id={labelId}>`; `:439` points the `<ul>`'s `aria-labelledby` at it. **Nothing points the button at it**, and `PromptSelector` passes `label={null}` at four of five levels.

**Target.**

1. Restore focus to the trigger after a selection, on both paths. Not on click-away (`:198–206`) — a click elsewhere is a request to be elsewhere. A shared `const selectOption = (id: string) => { onChange(id); setIsOpen(false); buttonRef.current?.focus(); }` used by both.
2. Add an optional `name?: string` prop — the level's own name, always present even when no visible `label` is drawn. Render it into an `sr-only` span with an id when `label` is absent, reuse the `<label>`'s id when it is present, and set `aria-labelledby={[nameId, valueId].filter(Boolean).join(' ')}` on the trigger, where `valueId` is on the existing `<span>` that draws the selected label or placeholder.
3. In `PromptSelector`, pass `name` at all six call sites: `Course`, `Syllabus year`, `Topic`, `Sub-topic`, `Syllabus point`, `Active focus`, `Question`.

**The accessible name must remain a superset of what it is today.** Two specs match it by regex substring — `tests/unit/syllabusYear.test.tsx:310` uses `/Year 1[12]/` and `tests/unit/comboboxSearch.test.tsx:35` uses `/select/i` — so prefixing is safe and replacing is not. Run both before assuming.

**Do not touch:** the `aria-activedescendant`/`data-option-index` machinery; the `useDeferredValue` filtering (`:189–196`) and the comment explaining it; `SEARCH_THRESHOLD`; the Escape-clears-query-first behaviour (`:273–283`), which is deliberate.

**Extend `tests/unit/comboboxSearch.test.tsx`:**

- selecting with Enter returns focus to the trigger (`document.activeElement`);
- selecting with a click returns focus to the trigger;
- clicking outside does **not** move focus to the trigger;
- with `name="Course"` and a value chosen, the trigger's accessible name contains both `Course` and the chosen label.

**Note:** this also changes `components/dataManager/ImportFlow.tsx:514`'s combobox, which passes `label="Target Course"`. It gains the same focus restore and its trigger becomes named, which it currently is not. That is the point of doing this in the shared component; verify the Data Vault import flow by hand once.

---

### Step 8 — The question picker's tier headings become real groups *(gated on M3)*

**Files:** `components/Combobox.tsx`, `tests/unit/personalOrdering.test.tsx`, `tests/unit/questionRefinement.test.tsx` (check only).

**Current code.** `Combobox.tsx:442–488` maps `visibleOptions` to a `React.Fragment` per option, emitting a heading `<li key={…} role="presentation">` whenever `option.group` differs from the previous option's. `role="presentation"` removes the heading from the accessibility tree, so the six tier groups — the whole point of `PromptSelector`'s grouping, argued at `PromptSelector.tsx:775–790` — are sighted-only.

**Target.** Emit one `<li role="group" aria-label={groupName}>` per run, holding an `aria-hidden="true"` visual heading `<div>` and that run's `role="option"` children. ARIA 1.2 permits `group` inside `listbox` and `option` inside `group`.

Constraints:

- the option `id`s stay `${listboxId}-opt-${index}` on the flat visible index, so `aria-activedescendant` (`:382, :412`) and the `data-option-index` scroll (`:303–308`) are unaffected;
- an ungrouped list (every other picker in the app) must keep exactly today's DOM — no wrapper, no group;
- the heading keeps `sticky top-0` and its current classes, on the inner `<div>`.

**This step breaks one test and you should expect it.** `tests/unit/personalOrdering.test.tsx:203–207` reads the headings with `getAllByRole('presentation')`. Repoint it at `getAllByRole('group')` and read `getAttribute('aria-label')` rather than `textContent` — the label is now the authoritative string and the visual heading is `aria-hidden`. **Do not delete the helper or loosen its assertions**: `:234–236` and `:250–252` assert the exact suggestion wording ("one step on from Define", "more practice at Analyse"), which is the contract that the heading names the *reason*.

`tests/unit/questionRefinement.test.tsx` counts `getAllByRole('option')` — verify it still returns the same count with options nested one level deeper (it will; `getAllByRole` is not depth-limited).

**Verify:** `npm run test:all`, and inspect the accessibility tree in DevTools with a dot point that has ≥7 questions across ≥2 tiers.

---

### Step 9 — The fold: focus, announcement, and the collapsed bar's landmark *(the first half gated on M2)*

**Files:** `App.tsx`, `components/SyllabusNavBar.tsx`, `components/Breadcrumb.tsx`; a new `tests/unit/navigatorFold.test.tsx`.

**If M2 was refused, skip parts 1 and 2 and do parts 3 and 4 only** — they are ungated and each is worth its own line in the changelog.

**Current code.** `App.tsx:477–483` folds the navigator when a prompt id appears; `:676` derives `isNavCollapsed`; `:792` unmounts `PromptSelector`; `:743–789` renders `SyllabusNavBar` in the other state; `:851–862` renders the "Collapse to breadcrumb" button. `SyllabusNavBar.tsx:106–113` is the "Change" button that expands it again.

**Part 1 — hand over focus (M2).** After the collapse commits, move focus to the collapsed bar; after an expand commits, move focus to the navigator's first control.

- Give `SyllabusNavBar`'s root `tabIndex={-1}` and an id, and expose a ref; focus it in a layout effect keyed on the transition into `isNavCollapsed`. `App.tsx:731–734` already documents why `tabIndex={-1}` is what makes a programmatic focus move actually move focus.
- On expand, focus the navigator's `<nav>` (Step 1 gave it one) with `tabIndex={-1}`, not the first `Combobox` — landing *on* the region lets the reader hear its name before its contents.
- Guard both on "the transition just happened", not on the steady state, or every re-render steals focus.

**Part 2 — say what happened (M2).** The same polite live region pattern as Step 2, owned by `App.tsx` (or lifted into a tiny shared component): `Question selected. The syllabus navigator has collapsed to a breadcrumb; your writing space is below.` and, on expand, `Syllabus navigator open.`

**Part 3 — a landmark on the collapsed bar (ungated).** `SyllabusNavBar.tsx:53`'s `<ol>` is a crumb trail with no landmark and no name, while `Breadcrumb.tsx:39–41` — its counterpart in the *other* navigator state — is a `<nav aria-label="Breadcrumb">`. Wrap the `<ol>` in `<nav aria-label="Syllabus path">`.

**Part 4 — reduced motion in `Breadcrumb` (ungated).** `Breadcrumb.tsx:17–21` calls `scrollTo({ left: …, behavior: 'smooth' })`. `index.css:217–225`'s `scroll-behavior: auto !important` does not govern the JavaScript option. Copy the house guard from `ImprovementReviewModal.tsx:242–245`:

```ts
const reduceMotion =
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
```

and pass `behavior: reduceMotion ? 'auto' : 'smooth'`.

**Do not touch:** the fold itself. `App.tsx:477–483` is deliberate and the changelog's most recent entry argues for it at length. This step makes the handover audible and reachable; it does not question the design.

**Verify:** new unit test — assert on `SyllabusNavBar` that its root is focusable and its crumb trail is inside a named `navigation`. In `Breadcrumb`, assert `scrollTo` is called with `behavior: 'auto'` when `matchMedia` reports `reduce` (jsdom has no `matchMedia` by default — define it in the test). Then verify by hand with a keyboard only: choose a question, press Tab once, and confirm you land somewhere sensible rather than at the top of the document.

---

### Step 10 — Let the e2e contrast suite see the expanded navigator

**Files:** `tests/e2e/light-theme.spec.ts`, `tests/e2e/support/workspace.ts`.

**Current:** `light-theme.spec.ts:62–70`'s `beforeEach` runs `signIn`, `clearOnboarding`, `openFirstQuestion`, `openVerbRibbon`. `openFirstQuestion` (`tests/e2e/support/workspace.ts:55–73`) selects a question, which collapses the navigator (`App.tsx:477–483`) and unmounts it. **So the suite has never measured a single colour in this component**, which is why every failure in Finding 5 and A14 has survived on the app's first screen.

This is the same blind spot the verb-ribbon series found and closed (`VerbRibbonRedesignPlan.md` A0); the fix there was to make the component render in both states. Here the fold is correct and must stay, so the fix is to **measure before the fold**.

**Target.** Add a third test to `light-theme.spec.ts` that runs `signIn` + `clearOnboarding` only, walks the picker down to the **dot point** (not the question) so all five steps are on screen with the question list populated, and runs the same two invariants — AA on neutral surfaces, and light never meaningfully dimmer than dark. A small helper in `support/workspace.ts`:

```ts
/** Stop one level short of a question: choosing one folds the navigator away,
 *  which is why nothing in this suite had ever measured it. */
export const openNavigatorToDotPoint = async (page: Page): Promise<void> => { … }
```

**Two things this helper must know, neither obvious** *(found in Step 5)*: the curriculum import **auto-selects a course**, so the Course step is never unchosen after onboarding; and the **first dot point of the first sub-topic has no focus areas** — the "N focus areas" label, the Active Focus picker and the "Reset Focus" button only exist under a dot point whose description carries a trailing "including …" list. In the bundled `HSCBiology` that is **topic index 1, sub-topic index 0**. Without walking there, three of Step 5's repaired sites are invisible to the suite.

**Expect two readings just over the line**, both on brand-coloured (non-neutral, so measured-but-not-gated) backgrounds: the question row's "N Marks" label at **4.15** (tier 2) / **4.27** (tier 3), and the focus sub-label at **4.86**.

Reuse the existing `freezeAnimations` / `measureContrast` / `remeasureTagged` / `describeReadings` imports and the `PARITY_TOLERANCE` and `WIDE` constants.

**Four things Steps 7–9 left this step to inherit:**

- **The fold now hands over focus**, so after `openFirstQuestion` the active element is `#syllabus-nav-bar`, not `<body>`. Any spec asserting a scroll position after a modal closes is now sensitive to focus restoration — see the `preventScroll` note below.
- **`openNavigatorToDotPoint` will not trip the fold**, so `App.tsx`'s live region stays empty and the navigator keeps focus. No interference with `measureContrast`.
- **Two new `sr-only` text nodes are in the DOM** — the cascade region (Step 2) and the fold region (Step 9). Both are `sr-only`, so they have no computed background of their own. **Check whether `contrast.ts` walks them before assuming a clean run**; it may need to skip `.sr-only` or return `unassessable`.
- **The question rows sit one level deeper** (inside `li[role=group] > ul[role=none]`). Any CSS selector using `ul[role=listbox] > li` now matches the *group*, not the option. `getByRole('option')` is unaffected.

**Also open the question list before measuring** — the tinted question rows, their verb chips and their `N focus areas` labels are inside a dropdown that only exists while open, and three of Step 5's defects live there.

**Do not touch:** `tests/e2e/support/contrast.ts`. No exclusion, no threshold change, no skipped assertion. If a reading fails, the failure is real and belongs to Step 4 or Step 5.

**Update the file-header comment in `contrast.ts`** only to record what is now covered and what still is not: the question rows sit on tier washes, so `neutralBackground` is false and they are measured but not gated; the rail nodes and the action-button icons carry no text and are therefore invisible to a text-node walker.

**Verify:** `npx playwright test tests/e2e/light-theme.spec.ts --project=chromium` with the `executablePath` workaround in the working notes.

**If it fails:** read the failure, do not re-scope the test. `text-slate-500` on a white step box is 4.76:1 with almost no margin (the header series ended with 0.2 of margin on exactly this ramp — `HeaderRedesignPlan.md:772–774`); if a reading lands short, step to `text-slate-600` (7.58:1).

---

### Step 11 — Changelog

**Files:** `projectDocs/changeLog.md`.

Add a new `## [Unreleased] - <date>` section at the top in the existing house voice — a short narrative explaining *why*, not a bullet list of classes. Cover:

- the navigator had one `aria-` attribute in 1544 lines, and what that meant in practice: no announcement when choosing a course silently wiped four levels below it, no name on a picker once something was chosen, and focus dropped on the floor at the moment a question was selected;
- the question picker's tier grouping — the thing that turns twenty tinted cards into six kinds of question — was invisible to screen readers, because its headings were `role="presentation"`;
- the five level hues meant nothing and collided with the six tier hues that mean everything, two of them exactly; they are demoted rather than abolished, for the third time in three series;
- the measured contrast failures, with the two worth naming: a selected focus area's label was **white on near-white at 1.10:1** in the light theme, and the question row's icon tile put white on tier 3's yellow at 1.92:1 eleven lines above the chip that has always done it correctly;
- the progress rail was off the left edge of the viewport on every phone;
- **and the reason none of this was caught:** every e2e spec reaches the workspace by selecting a question, and selecting a question unmounts the navigator. The contrast suite has never rendered the app's first screen. That is now a test.

Worth recording explicitly, because the next reader will assume otherwise: **`components/SelectionTree.tsx` is not part of the syllabus navigator.** It is the Data Vault's import/export picker and has its own unaddressed issues.

---

## 4. Test plan

### Must keep passing, unchanged

| Test | Why it is at risk |
|---|---|
| `tests/e2e/support/workspace.ts:55–73` (`openFirstQuestion`) | Locates each level by `button[aria-haspopup="listbox"]` + placeholder text. Every spec in the suite depends on it. **No step may change a placeholder**, and Step 7 must not remove `aria-haspopup` from the trigger. |
| `tests/unit/syllabusImportEntry.test.tsx:77–121` | Finds seven action buttons by `getByTitle` with exact strings. Steps 3–5 rewrite `ActionButton`'s classes and props; the `title` values must survive byte-identical. |
| `tests/unit/syllabusYear.test.tsx:310` | `getByRole('button', { name: /Year 1[12]/ })`. Step 7 changes how that name is composed — it must stay a superset. |
| `tests/unit/questionRefinement.test.tsx` | Counts `getAllByRole('option')` and matches `'8 questions'` / `'3 of 8 shown'` from `QuestionFilterBar`. Step 8 nests options one level deeper; the counts must not move. `QuestionFilterBar` is out of scope entirely. |
| `tests/unit/promptSelectorPastHscChip.test.tsx` | Renders the whole component and reads the HSC chips inside option rows. Steps 1, 4 and 5 all touch that row. |
| `tests/unit/comboboxSearch.test.tsx` | The search box's behaviour, the `Clear search` label, and Escape-clears-query-first. Step 7 must not disturb any of it. |
| `tests/unit/bandColors.test.ts` | Pins `getBandConfig` and names `PromptSelector`'s question chip as a consumer. **No step in this series may touch `utils/renderUtils.ts`.** |
| `tests/unit/appHeaderChrome.test.tsx`, `verbRibbonChrome.test.tsx`, `cardHeaderHeightLock.test.tsx`, `workspacePanelChrome.test.tsx` | Different surfaces. If a change here moves any of them, the change has strayed. |
| `tests/unit/focusTrap.test.tsx`, `escapeStack.test.tsx` | Steps 7 and 9 move focus. Neither may register anything on the escape stack; both must stay green with no edits. |
| `tests/e2e/light-theme.spec.ts` (existing two tests) | Green today partly by never having rendered this component. Step 10 adds a third test; the first two must remain untouched and green. |
| `tests/e2e/evaluation-flow.spec.ts`, `modal-scroll.spec.ts`, `workspace-chrome.spec.ts` | Regression watch for Step 1's DOM restructure and Step 9's focus moves. |

### Must be updated

- `tests/unit/personalOrdering.test.tsx:203–207` — the `headings` helper uses `getAllByRole('presentation')`. Step 8 changes it to `getAllByRole('group')` reading `aria-label`. Keep the exact-wording assertions at `:234–236` and `:250–252`.
- `tests/unit/promptSelectorPastHscChip.test.tsx` — gains Step 1's landmark and group-name cases.
- `tests/unit/comboboxSearch.test.tsx` — gains Step 7's four focus and naming cases.

### New

**`tests/unit/navigatorChrome.test.tsx`**, built up across Steps 3, 4, 5 and 6:

1. **The constants are worn** — the root, a step box, a rail node, an action button and the inline panel each carry theirs. (Step 3.)
2. **No level is named after a colour** — `Object.keys(NAV_LEVELS)` is exactly the five levels. (Step 3.)
3. **§2 parity sweep** — every exported constant that sets a colour has both a light value and a `dark:` partner for the same property. Copy the classifier from `tests/unit/verbRibbonChrome.test.tsx:147–190`. (Step 4 empties the exempt set.)
4. **The new idiom only** — no export contains `light:`. (Step 4.)
5. **Solid fills are paired** — a tier-3 render puts `text-yellow-950`, not `text-white`, on the question row's icon tile; the selected focus-area label carries no `text-white`. (Step 5.)
6. **The four unpartnered colours have partners** — `purple-700`, `red-600`, `emerald-700`, `amber-700`, each with its `dark:` twin. (Step 5.)
7. **One gutter** — `NAV_RAIL_LINE` and `NAV_NODE_SLOT` are both derivable from `NAV_GUTTER`'s two values, and `NAV_NODE_BASE` contains no negative `left`. (Step 6.)

**`tests/unit/navigatorAnnouncements.test.tsx`** (Step 2): the live region names both the set and the cleared levels; is silent on first render; is silent when the path does not change.

**`tests/unit/navigatorFold.test.tsx`** (Step 9): the collapsed bar's crumb trail sits inside a named `navigation`; `Breadcrumb` passes `behavior: 'auto'` under reduced motion.

**`tests/e2e/light-theme.spec.ts`** (Step 10): a third test measuring the expanded navigator with the question list open, in both themes.

Mock `services/geminiService` in every render test that mounts `PromptSelector` — it imports `parseSyllabusStructure` at `:74`, and `promptSelectorPastHscChip.test.tsx:14–16` shows the shape. `Element.prototype.scrollIntoView` must be stubbed (`:19–21`); jsdom has no layout.

### Coverage

`vitest.config.ts:29–34` pins **63 / 59 / 57 / 62** as a deliberate regression floor. Do not quote `hsc-feature.md`'s stale "70% minimum" and do not raise the thresholds as part of a navigator commit. Extracting `NavigatorStep` and adding three test files should move the numbers up on their own.

---

## 5. Risks and open questions

**R1 — Step 4 is the visually dramatic one and, until Step 10, it has no automated net.** The navigator has no visual-regression baseline and has never been contrast-measured (A11). Verification is eyes, in both themes, at all five levels in both states. If a pixel baseline is ever generated for this project, this component and the verb ribbon should both be in it.

**R2 — the placeholders and `title` strings are load-bearing in six places** and a rewrite of `ActionButton`'s props (Step 3) is exactly the kind of change that retypes a string by accident. `Import Syllabus (AI) — build or update a course from NESA syllabus text or a URL` is 88 characters and is matched by a regex on its first two words; `Add Course`, `Edit Outcomes` and `Import Topic (.json)` are matched exactly. Copy, never retype.

**R3 — Step 7 changes a shared component in a navigator series.** `Combobox` also dresses the Data Vault's import flow. The change is small and strictly additive, but it is the kind of thing that gets reverted six months later by someone who does not know why the trigger has an `aria-labelledby`. The mitigation is the four test cases and the comment; if M3 is refused, say so in the changelog, because two real defects then ship knowingly.

**R4 — Step 9 touches `App.tsx`, which the brief did not scope.** Gated on M2 for that reason. Its ungated half (a landmark on `SyllabusNavBar`, reduced motion in `Breadcrumb`) is small and should land regardless.

**R5a — `useFocusTrap` and focus handovers interact, and any future one will hit it** *(found in Step 9)*. Giving the fold a real element to restore focus to turned `modal-scroll.spec.ts` red: `.focus()` scrolls its target into view, undoing 9px of the position `useScrollLock` had just restored. Fixed at the source — the trap's restore now passes `{ preventScroll: true }`, since the page is locked while a dialog is open so the opener cannot have moved, and the hook's job is the keyboard rather than the viewport. **This is an app-wide behaviour change made inside a navigator series** and deserves its own sentence in the changelog.

**R5 — programmatic focus moves are easy to get subtly wrong.** Step 9's guard must fire on the *transition*, not the steady state, or every re-render steals focus from whatever the user is doing — including from the editor, mid-sentence. Test it by typing in the editor and forcing a re-render.

**R6 — Mobile Safari is unverified locally.** WebKit is not installed in the development container. This series introduces no new `backdrop-blur` (Step 4's boxes are opaque), which is the thing that has bitten this project before, but Step 6's geometry change and Step 1's DOM restructure both want a look on a real phone. CI's `PW_FAST` matrix runs Mobile Safari on every pull request — watch that check rather than assuming.

**R7 — `role="list"` versus `<ol>` in Step 1.** Safari's accessibility tree strips list semantics from a list with `list-style: none`, which is why the step recommends `role="list"` explicitly. If the implementing agent chooses a real `<ol>` instead, the absolutely-positioned rail line must move inside the first `<li>` or the markup is invalid. Either is fine; mixing them is not.

**R8 — DesignSpec §2's tier table still contradicts `renderUtils.ts`.** Spec: Tier 3 `#f59e0b`, Tier 5 `#0ea5e9`, Tier 6 `#6366f1`. Code: `BAND_HEX` = `#eab308`, `#3b82f6`, `#a855f7`. Flagged as A12 in `HeaderRedesignPlan.md` and R8 in `VerbRibbonRedesignPlan.md`, and deliberately not fixed in either. An agent implementing Step 4 or 5 while reading the spec may reach for the wrong hex. `bandColors.test.ts` pins the code; the spec is what is wrong. **Third series running.** Someone should fix it.

**R9 — the `primary` action-button gradient's sky end is 2.77:1 against white text**, and it is deliberately not fixed here (Step 5) because it is the product's brand gradient and appears on four other surfaces. It is a real reading, on a real label, and it should be raised as its own item along with the ribbon plan's unclosed R7 (`ReferenceMaterials.tsx:57`) and R7a (the ribbon's own Sparkles tile) — all three are the same defect class and all three are now written down in three different documents.

**R10 — mostly answered.** **Nothing in the shipped library crosses `SEARCH_THRESHOLD = 7`**: the stock `HSCBiology` tops out at 2 prompts per dot point and `HSCSoftwareEngineering` at 6, and "Import 3 items" brings in only Biology and Chemistry. A multi-tier grouped question list **cannot be reached by hand from a stock install** — Step 8 had to import a synthetic topic through the Data Vault to see one. (Data Vault navigation, since it is not obvious: the Import tab is labelled **"SYNC IN"**, the modal's `aria-label` is `"Data vault"` with a lower-case v, and it closes itself after a successful topic import, so locators scoped to `page` rather than the dialog will hit the navigator's comboboxes behind it.) Still open: whether any teaching material or screenshot pins the current five-hue navigator; whether any teaching material, screenshot or onboarding asset pins the current five-hue navigator, which bears on M1; whether `probe.tmp.mjs` / `probe2.tmp.mjs` at the repo root touch this component's markup; and and — **now closed** — `projectDocs/UIComponentImprovements.md` **does not exist**, so that quarter of this risk is dead.

**R11 — two contrast figures in this document rest on an inferred backdrop.** The `emerald-500/80`, `purple-400` and `red-400` readings assume the wash sits directly on white. If the option row or the button carries an intermediate surface, the true figure is different. Step 5 is required to measure all three before choosing values, and to record what it measured. Calculated is not measured, and this document says so rather than pretending otherwise.

---

### Critical files for implementation

- `/home/user/HSC-Writing-Master/components/PromptSelector.tsx`
- `/home/user/HSC-Writing-Master/components/Combobox.tsx`
- `/home/user/HSC-Writing-Master/App.tsx`
- `/home/user/HSC-Writing-Master/components/SyllabusNavBar.tsx`
- `/home/user/HSC-Writing-Master/tests/e2e/support/workspace.ts`

Reference-only, but read before Steps 3–5: `/home/user/HSC-Writing-Master/utils/verbRibbonChrome.ts` and `/home/user/HSC-Writing-Master/tests/unit/verbRibbonChrome.test.tsx` (the vocabulary and the parity sweep to copy), `/home/user/HSC-Writing-Master/utils/renderUtils.ts` (`getBandConfig` / `getTierScaleConfig` / `solidText` — read, do not edit), and `/home/user/HSC-Writing-Master/projectDocs/DesignSpec.md` §2 and §3.
