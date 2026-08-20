# Verb Ribbon Redesign Plan

_HSC Writing Master — the command verb hierarchy ribbon (`components/CommandVerbHierarchy.tsx`, 535 lines)_
_Written against DesignSpec v2.2.1, in the shape of `projectDocs/HeaderRedesignPlan.md`. British/Australian English throughout._

---

## 0a. Decisions taken

Both gating questions are settled. These are binding; where the prose below still frames them as open, these win.

1. **D0 — GRANTED, "render it, shut, below the breadcrumb."** The ribbon renders whenever there is a question and Focus Mode is off, collapsed by default in the folded-navigator state. Steps 10 and 11 are in scope. The full series (Steps 1–12) is dispatched.
2. **D1 — GRANTED, fix the shared token.** Step 7 changes `getBandConfig`'s band-3 `solidText` in `utils/renderUtils.ts` and pins it with the ratio in a comment. It is in scope, it repairs `SyllabusNavBar` and `PromptSelector` at the same time, and R4's concern is answered by the pinning test rather than by narrowing the fix.
3. **D2 — as the plan proposed:** the cognitive-timeline step buttons stay, with corrected labels (Step 8). R5 remains an open design question for later.
4. **R10 — RESOLVED AGAINST THE PLAN, after Step 3 shipped.** Step 3 took `getCommandTermInfo`'s case-insensitive lookup *and* its `EXPLAIN` fallback. The fallback has been reverted; the lookup is now `commandTerms.get(v) ?? commandTerms.get(v.toUpperCase()) ?? null`. Reason: everywhere else that fallback degrades something incidental, but here the content *is* the claim "your verb is X, it caps you at Band N" — an unrecognised verb would render that claim in full and confidently about a verb nobody asked for. Showing nothing is honest and is a state the component already draws. **Step 12's changelog must describe the case fix only, not a fallback.**

## 0. Decisions the maintainer must take before Step 5 is dispatched

The audit turned up one thing large enough that it changes what this redesign is _for_, and two smaller ones that change what individual steps are allowed to do. None can be settled by an implementing agent.

**D0 — The ribbon is unmounted whenever a question is selected. Should it be?**

`App.tsx:482–484`:

```tsx
// Fold the syllabus navigator down to a breadcrumb the moment a question is
// chosen, and re-open it whenever the selection is cleared.
useEffect(() => {
  setIsNavExpanded(!currentPrompt);
}, [currentPrompt?.id]);
```

and `App.tsx:793` gates the ribbon behind `{!isFocusMode && !isNavCollapsed && (`, where `isNavCollapsed = !!currentPrompt && !isNavExpanded` (`App.tsx:676`). So the reference that explains the question's command verb **ceases to exist at the exact moment a command verb exists to explain**. It comes back only if the student presses "Change" to re-open the navigator, and it comes back as a fresh mount with fresh state.

Everything downstream of that is affected:

- The ribbon's own re-open logic (`CommandVerbHierarchy.tsx:38–48`) and its `collapsedByUser` ref exist to remember a deliberate collapse across question changes. They cannot: the component unmounts and remounts, so `collapsedByUser` resets to `false` and `isOpen` resets to `true` every single time. The feature the comment describes is defeated by the mount lifecycle, not by the logic.
- The strip auto-scroll (`:83–106`) is justified in a comment by "the ribbon lives below the syllabus navigator, so it is usually off screen when a question is picked". Picking a question now unmounts it, so that path is nearly unreachable in the shipped app.
- **No e2e test has ever seen this component.** `openFirstQuestion` (`tests/e2e/support/workspace.ts:55–73`) selects a question, which folds the navigator away. That is why `light-theme.spec.ts` is green despite the contrast defects in §1 below — the checker never reaches them.

**Recommendation:** render the ribbon in the collapsed-navigator state as well, shut by default, as one more disclosure beneath the breadcrumb. That is Step 11, and it is written but **must not be dispatched until this is decided**. If the answer is "no, the ribbon is a browsing aid for when you are choosing a question, not a reference for when you are answering one", then say so — and Steps 5–10 are still worth doing, but their value is much smaller and the plan should be trimmed to Steps 1–4 plus 8.

Either way, **every step's manual verification must say: press "Change" / expand the navigator to see the ribbon at all.**

**D1 — May Step 7 change a shared token?** Tier 3's solid fill (`getBandConfig(3).solidBg`) cannot meet AA with its own `solidText` in the light theme (4.04:1, calculated). The correct fix is one line in `utils/renderUtils.ts` plus `tests/unit/bandColors.test.ts`, and it also repairs `SyllabusNavBar.tsx:78` and `PromptSelector.tsx:733`, which have the same pairing. The alternative — a ribbon-local override — leaves the same failure standing on two other surfaces. Step 7 is written for the shared fix and is **gated on this decision**.

**D2 — Do the cognitive-timeline step buttons survive?** They are the third control that selects a tier (after the tier card header and the verb chips), they add six tab stops, and their labels are a fourth, drifted vocabulary. Deleting them is the tidier design; keeping them preserves a deliberate a11y fix made earlier (`commandVerbHierarchy.test.tsx:106–113` pins them as keyboard-reachable buttons). **This plan keeps them** and fixes their labels (Step 8), because undoing someone's accessibility work on aesthetic grounds needs a stronger warrant than I have. Raised as R5.

---

## Working notes for every step

Accumulated during the audit. Each step runs with no memory of the others, so this is the only channel between them.

- **You cannot see this component by launching the app and picking a question** — that unmounts it (D0). Choose a question, then press **Change** on the breadcrumb to expand the navigator; the ribbon is below the syllabus dropdowns.
- **The `light:` variant outranks a plain utility.** `tailwind.config.js:93–95` registers it as `[data-theme="light"] &`, a descendant selector, so a `light:` class in a shared component cannot be overridden by an unprefixed class at a call site. This is why `components/MeshOverlay.tsx`'s baked `light:opacity-[0.06]` is not overridable — see Step 2.
- **The ribbon composes `getBandConfig` strings, which are `light:`-based, and that is correct.** `utils/renderUtils.ts:282–345` is pinned by `tests/unit/bandColors.test.ts` and is shared by a dozen surfaces. The `dark:`-first rule (DesignSpec §2, "Which variant to write in new code") applies to the **new chrome constants this plan adds**, not to the tier config they interpolate. Do not migrate `renderUtils.ts`. The rendered `className` will legitimately contain both idioms.
- **`npm run test:all`** is `lint && vitest --run && type-check && type-check:tests`. Run it before every commit; do not use `--no-verify`.
- **Playwright**: `/opt/pw-browsers` holds `chromium-1194` while the installed `@playwright/test` wants `1208`, so `PLAYWRIGHT_BROWSERS_PATH` alone fails. Launch with `executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`. WebKit is not installed at all.
- **`lint-staged` runs `prettier --write` on `*.md`.** `changeLog.md` has already taken its reformatting hit during the header series; this plan file has not, so the first commit touching it will reflow it. Do not fight it, and do not let it disguise the real change.
- **All contrast figures in this document are calculated from the Tailwind hexes, not measured in a browser.** They are stated to two decimal places because the arithmetic is exact; they are still the weaker of the two claims.

---

## Step summary

| Step | Summary | Gated on |
|---|---|---|
| 1 | Make the shut ribbon unreachable: `inert`, `aria-controls`, grid-rows in place of `max-h-[1600px]` | — |
| 2 | Migrate to the shared `components/MeshOverlay`; delete the local copy | — |
| 3 | Honour `prefers-reduced-motion` in the auto-scroll; look the verb up through `getCommandTermInfo` | — |
| 4 | Add `utils/verbRibbonChrome.ts` + `tests/unit/verbRibbonChrome.test.tsx`; route the ribbon through it, class values unchanged | — |
| 5 | Tokenise: glass header bar, tier colour demoted to the tile and a 2px underline, `dark:`-first pairs throughout | — |
| 6 | Pair every solid fill with `solidText`; give the tier headers a visible focus ring; lift the dimmed cards off the contrast floor | — |
| 7 | Fix tier 3's solid pairing in `getBandConfig` (shared token) | **D1** |
| 8 | Say tier where it means tier; derive the timeline labels from `tierShortLabel`; set the four stat numbers in mono | — |
| 9 | Give the strip an accessible name, an overflow affordance and snapping that does not fight focus | — |
| 10 | Let the e2e contrast suite reach the ribbon | **D0** |
| 11 | Render the ribbon while the navigator is folded | **D0** |
| 12 | Changelog | — |

Steps 1–6, 8 and 9 are independent of every decision and can be dispatched immediately, in order.

---

## 1. Audit

### Finding 1 — the collapsed disclosure has no `inert`: **CONFIRMED, and it is the largest single defect in the component**

`CommandVerbHierarchy.tsx:199–201`:

```tsx
<div
  className={`transition-all duration-700 ease-in-out overflow-hidden ${isOpen ? 'max-h-[1600px] opacity-100' : 'max-h-0 opacity-0'}`}
>
```

No `inert`, no `hidden`, no `id`, no `aria-controls` on the toggle at `:149–157` (which does carry `aria-expanded`). `max-h-0 opacity-0 overflow-hidden` is a visual collapse and nothing else: every control inside stays in the tab order and in the accessibility tree. DesignSpec §3, "Keyboard Reach", names this exact fault and prescribes `inert`.

The scale is worse than the header's ever was. Counting the controls inside that panel:

- 6 tier-card header buttons (`:358`),
- 38 verb chips (`:404`) — 38 entries in `commandTermsList`, distributed 6 / 6 / 6 / 8 / 6 / 6 across tiers 1–6,
- 6 cognitive-timeline step buttons (`:488`).

**50 controls a keyboard user can Tab through while the panel is folded shut**, versus the 12 header tab stops that the previous series called "the single highest-value accessibility item in the whole redesign".

Three components in this codebase already do it correctly, with the house comment written out in full: `ReferenceMaterials.tsx:82–98` (grid-rows + `inert`), `SampleAnswersAccordion.tsx:353–355`, `LiveInsights.tsx:94–100`. `tests/unit/focusTrap.test.tsx:238–261` pins the behaviour for `AccordionSection`. The ribbon is the one disclosure that missed the sweep.

**Missing alongside it:** the toggle has no `aria-controls` and the panel has no `id`, where `ReferenceMaterials.tsx:50–52`, `LiveInsights.tsx:70`, `SampleAnswersAccordion.tsx:695` all use `useId()` and wire the pair.

### Finding 2 — "the last opaque gradient bar in a glass app": **REFUTED as stated; the underlying complaint is real and needs a different repair**

Three independent reasons.

**(a) DesignSpec §2 names this surface by name as correct.** The Light Theme Parity section, rule 2:

> **On a coloured gradient or a modal backdrop** — the editor header, the score placard, **the ribbon header**, `bg-black/80` scrims. These are the same colour in both themes, so `bg-white/20` and `border-white/20` are right as written and must be left alone.

The `bg-white/20 border-white/30` chip at `:185` and the `bg-white/20 border-white/30` icon tile at `:118–120` are therefore not §2 violations. Framing them as such would have an implementing agent "fix" the one thing the spec explicitly protects.

**(b) It is not the last one, or even the biggest one.** `utils/cardChrome.ts:19–20` — `CARD_HEADER_BOX` carries a hard `text-white` and is worn by both workspace cards, each of which paints a full-bleed band gradient behind it (`PromptDisplay.tsx`, `Editor.tsx`). Those are the two largest and most prominent surfaces in the app, they are a deliberate shared vocabulary, and they are not in scope here. `CARD_HEADER_ICON` (`cardChrome.ts:35–36`) is `bg-white/20 … border-white/30` — the identical construction the finding objects to in the ribbon.

**(c) The ribbon's gradient means something; the header's did not.** `App.tsx:732`'s `from-indigo-600 to-sky-500` was derived from nothing. `CommandVerbHierarchy.tsx:113–114` derives its gradient from `getTierScaleConfig(activeTermInfo.tier).gradient` — it _is_ the tier identity, on the exact six-step scale `renderUtils.ts:360–372` exists to provide. Deleting it deletes information.

**What survives, and it is worth a step of its own:** the ribbon states the tier colour across a full-width bar while `SyllabusNavBar.tsx:46` already paints a tier stripe and the editor already runs the tier chroma. That is the same "third simultaneous statement" argument that produced the header plan's D3 — and here it also carries a genuine light-theme contrast failure (Finding A3). The right move is the header's D2, transposed: **demote, do not abolish.** See D-B below.

### Finding 3 — 16 `light:` lines against §2's `dark:`-first rule for new code: **CONFIRMED, with a correction to the count**

16 _lines_ carry `light:`; there are **20 occurrences** (`grep -o "light:" | wc -l` → 20). Lines `223, 232, 238, 243, 245, 252, 257, 264, 266, 273, 278, 317, 331, 332, 365, 386`.

Worth stating precisely what is and is not wrong with them. DesignSpec §2 says the `light:` variant "remains valid and existing components are **not** being migrated". So these are not defects _as written_; they are the old idiom, and the rule is that **new** code uses `dark:`-first. Since Steps 5–6 rewrite essentially all of them, they should come out in that rewrite rather than in a migration commit of their own — the same call the header series made.

Two of them _are_ outright defects rather than idiom, and both are caught below: `light:opacity-70` (A2) and the white focus ring that has no `light:` partner at all (A1).

### Finding 4 — an inferior local `MeshOverlay` copy: **CONFIRMED**

`CommandVerbHierarchy.tsx:12–19` defines a local `MeshOverlay` with only an `opacity` prop. It lacks both improvements the shared `components/MeshOverlay.tsx` has:

- no `color` prop, so the strokes are permanently `%23ffffff`;
- no `light:opacity-[0.06]` lift.

It is used **eight times per render** (`:159` header, `:208` detail card, `:350` × 6 tier cards). Since `mix-blend-overlay` with white over a white surface is a no-op, and the tier cards resolve to `light:bg-white` (`:331–332`), **six of those eight instances paint nothing at all in the light theme** and are pure DOM cost.

`components/MeshOverlay.tsx` now exists (extracted during the header series). Note its documented API flaw, recorded in `HeaderRedesignPlan.md:31`: it bakes `light:opacity-[0.06]`, which — because `light:` is a descendant selector — a call site **cannot** override. The header plan's instruction was "if a future series consolidates the fourteen remaining copies, fix it there by making the light opacity a prop". This series consolidates one of them and should **not** take on that API change; Step 2 swaps the import and accepts the documented divergence, exactly as header Step 2 did.

### Finding 5 — `max-h-[1600px]` is a magic number: **CONFIRMED, and the symptom is not the one stated**

`:200`. Silent clipping is the theoretical risk; the measurable, present-tense fault is that **the animation is wrong today**. The panel's real height is roughly 700px (detail card ≈ 200px, strip ≈ 300px, timeline footer ≈ 120px, padding). A 700ms `max-height` transition from `1600px` to `0` spends its first ~55% of the run travelling through height the element does not occupy, so the collapse appears to hang and then snap. The house replacement — `grid-rows-[1fr]` / `grid-rows-[0fr]` — animates to whatever the content actually needs and has no number in it. `ReferenceMaterials.tsx:82–87` writes out the reasoning, naming the identical `max-h-[2000px]` it replaced.

### Finding 6 — tier/band conflation: **CONFIRMED, and the number is provably the same number**

`getTierTargetBand(tier)` (`data/commandTerms.ts:1005–1006`) is `TIER_GROUPS.find(g => g.tier === tier)?.maxBand`. Every group in `TIER_GROUPS` (`commandTerms.ts:34–77`) has `maxBand === tier`, and `tests/unit/bandColors.test.ts:69–74` **pins that as an invariant**:

```ts
it("each tier's maxBand equals its tier number", () => {
  for (const group of TIER_GROUPS) {
    expect(group.maxBand).toBe(group.tier);
```

`utils/renderUtils.ts:353–358` says the same thing in prose. So the detail card at `:229` (`Band {activeTermInfo.tier}`) and at `:261` (`Band Cap {getTierTargetBand(activeTermInfo.tier)}`) render **the same integer, guaranteed, forever**, six inches apart, under two different labels. The tier card header at `:374` renders it a third time as `Band {group.maxBand} ceiling`.

The header sub-label at `:174` — `Reference • {sortedVerbsByGroup.length} Bands` — counts `TIER_GROUPS`, i.e. tiers, and calls them Bands. It is not false (they are 1:1) but it is exactly the conflation the codebase spends `tierShortLabel`'s doc comment (`commandTerms.ts:79–91`) warning about.

`tests/unit/commandVerbHierarchy.test.tsx:26` asserts `/Reference • 6 Bands/i` and will need updating with the copy.

### Additional findings — not on the brief's list

**A0 — the ribbon is unmounted whenever a question is selected.** `App.tsx:482–484` and `:793`. Fully written up as D0 above. It is the most consequential finding in this audit and it changes what the redesign is worth.

**A1 — the tier-card header's focus ring is invisible in the light theme.** `:365` ends `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50`. `focus-visible:outline-none` kills the global `outline: 2px solid rgb(var(--color-accent))` from `index.css:240–249`, and the replacement is white-alpha on a surface that is `${tierConfig.bg}` — `light:bg-amber-100`, `light:bg-green-100` and so on. White on `amber-100` is not a ring; it is nothing. This is DesignSpec §2 rule 2 verbatim ("on a theme surface … the element silently loses its ring"), and the result is that **a keyboard user in the light theme cannot see which tier card has focus.**

**A2 — the dimmed tier cards contain focusable controls at a contrast that fails AA.** `:317`, applied to all five non-active cards whenever a verb is selected:

```
scale-90 opacity-50 light:opacity-70 hover:opacity-100 …
```

The card's subtitle (`:386`) is `text-[rgb(var(--color-text-muted))] light:text-slate-500` on `light:bg-white`. At full opacity `slate-500` on white is **4.76:1** — a pass with almost no margin. At `opacity-70` the composited text is ≈`rgb(147, 158, 174)`, i.e. **2.72:1**. Those cards hold 32 of the component's 38 verb buttons. A control you can Tab to and click must be legible.

This is invisible to `light-theme.spec.ts` only because of A0 — the suite never renders the ribbon. `tests/e2e/support/contrast.ts:136–142` does composite ancestor opacity into the reading, so the moment the ribbon becomes reachable (Step 10/11), this fails.

**A3 — `text-white` on tier 3 fails contrast in both themes, in three places, and the codebase already has the token that fixes it.**

`getBandConfig` returns a `solidText` field for exactly this reason, and it is `text-yellow-900` for tier 3 while every other tier gets `text-white` (`renderUtils.ts:317–320` and neighbours). Two other components already pair them: `SyllabusNavBar.tsx:78` (`${band.solidBg} ${band.solidText}`) and `PromptSelector.tsx:733`. The ribbon hard-codes `text-white` instead, at:

| Site | Class | Tier 3 dark | Tier 3 light |
|---|---|---|---|
| `:117` ribbon header text on `activeConfig.gradient` | `text-white` | white on `#eab308` = **1.92:1** | white on `#f59e0b` = **2.15:1** |
| `:365` tier card header when current | `text-white` | 1.92:1 | 2.15:1 |
| `:414` selected verb chip on `solidBg` | `text-white` | 1.92:1 | 2.15:1 |

Substituting `tierConfig.solidText` gives `#713f12` on `#facc15` = **5.66:1** (dark) and `#713f12` on `#fbbf24` = **5.19:1** (light gradient) — both pass. The one cell it does not fix is the selected chip's flat light fill, `#713f12` on `amber-500 #f59e0b` = **4.04:1**, which is what D1/Step 7 is for.

`tests/e2e/support/contrast.ts:99` returns `unassessable` for any element whose background chain hits a `background-image`, so the two gradient sites would never be caught even once A0 is fixed. The flat chip would be measured but not gated, because `neutralBackground` is false for yellow. **Nothing in the suite can find these; they have to be fixed by reading.**

**A4 — the auto-scroll ignores `prefers-reduced-motion`.** `:101–103` calls `strip.scrollTo({ left: target, behavior: 'smooth' })`. `index.css:217–226` sets `scroll-behavior: auto !important` under reduced motion, but that CSS property does not govern the JavaScript `behavior` option — a reduced-motion user still gets the animated scroll. The house pattern is three lines away in `ImprovementReviewModal.tsx:242–245`:

```ts
const reduceMotion =
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
```

**A5 — the verb lookup bypasses `getCommandTermInfo` and is case-fragile.** `:59–62` calls `commandTerms.get(activeVerb)` directly. `commandTerms.ts:822–831` exists precisely because "verbs reach here from model output and stored prompts in whatever case they were saved with", and its comment records that an exact-case lookup "silently mis-filed every mixed-case verb". The ribbon repeats the bug — except that here the failure is `undefined`, so the detail card, the tier highlight and the progress bar all simply vanish with no error. (`getCommandTermInfo` returns an `EXPLAIN` fallback rather than `undefined`, so a straight substitution changes behaviour for the no-verb case; Step 3 handles that.)

**A6 — `COGNITIVE_STEPS` is a fourth, drifted copy of the tier labels.** `:21–28` hand-writes `Remember, Describe, Explain, Analyse, Argue, Evaluate`. `tierShortLabel` (`commandTerms.ts:92–97`) derives `Remember, Define, Explain, Analyse, Discuss, Evaluate` from `TIER_GROUPS`. Tier 2 and tier 5 disagree. The doc comment on `tierShortLabel` is a written record of two admin components that kept hand-written copies, both of which had drifted and both of which mislabelled a tier with another tier's verb — "the mistake read as self-consistent". This is a third such copy, and the helper written to prevent it is not being used. A fifth vocabulary sits in the footer band labels at `:438–449` (`Basic Recall`, `Explain & Compare`, `Analyse & Apply`, `Evaluate & Create`), and the "Deep Learning Threshold" comment at `:479` calls tier 3 "Apply" — Apply is tier 4.

**A7 — the "measurement ticks" measure nothing.** *(Closed 2026-08-20 by `Plan-CognitiveSpectrum.md`: the ticks are gone, replaced by the five real boundaries at `i/6`.)* `:458–463` — four 1px ticks inside `flex justify-between px-[16%]`, so they land at 16%, 38.7%, 61.3% and 84%. The six timeline steps sit at roughly 0/20/40/60/80/100%, and the five boundaries between six tiers are at 16.7/33.3/50/66.7/83.3%. The ticks align with neither. The comment above them says they exist "for visual measurement". They are decoration, and only the first and last happen to be near anything.

**A8 — the horizontal strip has no name, no overflow affordance, and mandatory snapping.** `:293–296`:

```tsx
<div className="flex overflow-x-auto gap-4 pb-4 pt-2 snap-x snap-mandatory scrollbar-hide" ref={scrollContainerRef}>
```

- `scrollbar-hide` (`index.css:378–386`) removes the only visual signal that there is more to the right, and nothing replaces it — no edge fade, no arrows, no count. Six 260px cards plus gaps is ~1580px, so it overflows at almost every realistic width.
- No `role`, no `aria-label`, no heading. A screen-reader user meets 44 buttons in a flat list with no statement that they are a horizontal ladder.
- `snap-mandatory` on a strip that is _also_ scrolled programmatically (`:101`) and _also_ scrolled by the browser when focus enters an off-screen card is asking for a fight; `snap-proximity` is the conservative choice for a strip that is not a pager.
- WCAG 2.1.1 is satisfied — the strip is operable because its children are focusable — so this is an affordance and comprehension problem rather than a hard failure. It is still the part of the component a student is most likely to miss half of.

**A9 — the four stat numbers are telemetry set in Inter.** `:248`, `:260`, `:269`, `:281` render `markRange`, the band cap, `timeRange` and `syllabusTerms` as `text-lg font-black`, in the default `font-sans`. DesignSpec §4: "**Telemetry**: `JetBrains Mono` — Used for marks, token counts, and system logs." Marks are the first example in that sentence. The same finding was confirmed against the header (its Finding 6).

**A10 — three stat tiles carry their explanation only in a `title`.** `:255`, `:265`, `:275`. The elements are `<div>`s with no `tabindex`, so the tooltip is unreachable by keyboard and absent on touch. "Band Cap" in particular is the one label a student will not know, and its explanation is the least reachable thing in the component.

**A11 — `transform: scale()` is invisible to the scroll arithmetic.** `:93–96` positions with `activeCard.offsetLeft` and `activeCard.offsetWidth`, neither of which reflects the `scale-110` / `scale-90` applied at `:314`/`:317`. The active card is centred by up to ~13px off. Cosmetic; recorded so nobody rediscovers it as a bug.

**A12 — the ribbon has no unit coverage of its chrome and no e2e coverage at all.** `tests/unit/commandVerbHierarchy.test.tsx` is a good behavioural contract (173 lines, ten cases, including a height lock modelled on `cardHeaderHeightLock.test.tsx`) but asserts nothing about colour, theme or reach. Combined with A0, this component is the least-observed surface in the app.

---

## 2. Design decisions

Standing convention for all new code in this series: **light is the base, `dark:` carries the override**, per DesignSpec §2 "Which variant to write in new code" and as `utils/headerChrome.ts` now does. The `light:` variant stays valid, `getBandConfig`'s strings are not migrated, and both idioms will appear in the rendered `className`. That is expected.

**D-A — A shared class vocabulary in `utils/verbRibbonChrome.ts`, pinned by a parity sweep.** _(§2; house pattern)_

The header series established the shape: constants in `utils/`, each commented with **what it is painted on**, and a unit test that iterates every string export and requires each unprefixed colour utility to have a `dark:` partner for the same property (`tests/unit/appHeaderChrome.test.tsx:191–234`). `utils/cardChrome.ts` and `utils/panelStyles.ts` are the same pattern without the sweep. The ribbon gets `utils/verbRibbonChrome.ts` and `tests/unit/verbRibbonChrome.test.tsx`.

**Scope limit, and it matters:** the file holds only the **theme-neutral chrome**. Tier colour stays as `tierConfig.*` interpolated at the call site — baking six tiers × six slots into constants would be 36 exports duplicating `getBandConfig`. The sweep therefore also asserts the file contains **zero `light:`**, which is a cheap, exact pin on the migration.

**D-B — The tier gradient is demoted to a tile and a 2px underline, not abolished.** _(§1 Studio aesthetic, §3 Layering; the header plan's D2 transposed; overrides the brief's Finding 2)_

The bar becomes glass:

```ts
export const RIBBON_HEADER_BAR =
  'w-full px-0 py-3 sm:py-3.5 min-h-[60px] sm:min-h-[64px] flex items-center justify-between gap-3 ' +
  'relative z-10 overflow-hidden rounded-xl transition-colors duration-500 group/header ' +
  'bg-white/60 hover:bg-white/80 backdrop-blur-xl ' +
  'dark:bg-[rgb(var(--color-bg-surface))]/40 dark:hover:bg-[rgb(var(--color-bg-surface))]/60';
```

The tier colour survives in two places, both of them small enough to be honest:

1. **The icon tile** — `${tierConfig.solidBg} ${tierConfig.solidText} border border-white/20 shadow-md`, which is exactly `ReferenceMaterials.tsx:57`'s open-panel treatment and uses the pairing `getBandConfig` was designed for.
2. **A 2px underline beneath the bar** — `bg-gradient-to-r ${tierConfig.gradient}`, the direct analogue of `HEADER_HAIRLINE`. Edge-lighting rather than a wall.

This satisfies §1's glassmorphism, keeps the tier legible at a glance, removes the tier-3 white-on-yellow failure at the header for free, and does not touch the two surfaces DesignSpec §2 protects.

**Why not `PANEL_SURFACE`:** the ribbon's own comment at `:127–133` records a deliberate decision that it is full-page-width and flush with the column, with hairline dividers rather than a card border, and explains what went wrong the last time that was changed. Wrapping it in `PANEL_SURFACE` would overturn a documented decision for consistency with a panel family it is not in. The existing `dividerClass` (`:124`) is already token-based (`--color-border-secondary`) and stays.

**D-C — `text-white` becomes `tierConfig.solidText` everywhere a solid tier fill is involved.** _(§2, Finding A3)_ Three sites. The house pairing already exists in two other components. This is a token fix, not a colour choice.

**D-D — The focus ring becomes a real ring in both themes.** _(§3, Finding A1)_ The ring is `focus-visible:ring-slate-900/40 dark:focus-visible:ring-white/60`, inset.

> **This decision originally preferred dropping `focus-visible:outline-none` and letting `index.css:240–249`'s global accent outline apply. That cannot work here, and Step 6 established why:** the global outline is drawn 2px *outside* the element, and the tier card is `overflow-hidden`, so the outline is clipped on three sides. The inset ring — the fallback the decision listed second — is the only one of the two that is visible, and it is what shipped.

**D-E — Dimming stops at `opacity-90`, AND the tint darkens.** _(§2, Finding A2)_ A card holding 6–8 focusable buttons may not be dimmed below the point where its text fails AA.

> **The arithmetic in this decision as first written was wrong, and Step 6 caught it by measuring.** "`opacity-90` costs about 5% of contrast (4.76 → ~4.5)" assumes a linear loss. Opacity composites the text *towards its background*, so the fall is much steeper: `slate-500` on the card measures **4.81:1** at rest and **3.91:1** at `opacity-90` — still failing. Even `opacity-95` only reaches 4.34:1. Reducing the opacity alone could never have fixed this. The shipped fix is `opacity-90` **plus** `slate-600` on the idle subtitle (measured **5.83:1**), pinned by a test carrying the numbers. Never estimate a composited contrast ratio; measure it.

**D-F — One number, one label, and the word "tier" where tier is meant.** _(§4, Findings 6 and A6)_

- `Band {tier}` chip → `Tier {tier} · {tierShortLabel(tier)}`.
- `Band Cap {getTierTargetBand(tier)}` stays; it is now the single band statement in the card, and its `title` moves into visible text (A10).
- `Reference • 6 Bands` → `Reference • 6 cognitive tiers`.
- `COGNITIVE_STEPS` deletes its hand-written `label` and derives from `tierShortLabel(tier)`, killing the fourth vocabulary and the tier-2/tier-5 drift.
- The step buttons' `aria-label` `Highlight band {n} — {label}` → `Show tier {n} verbs — {label}`, which is also what the button does.

**D-G — The four stats go mono.** _(§4, Finding A9)_ `font-mono text-lg font-black tabular-nums`. `tabular-nums` because they sit in a fixed-width tray and a two-digit mark range should not shift its neighbours.

**D-H — The strip gets a name and a fade, and keeps its snapping proximate.** _(Finding A8)_ `role="group"` + `aria-label="Cognitive tier ladder, tier 1 to tier 6"` on the scroller; a pair of `pointer-events-none` edge fades on the wrapper at `:292`; `snap-proximity` in place of `snap-mandatory`. Deliberately **not** adding `tabIndex={0}` — that inserts a 51st tab stop in front of the 44 that are already there, and WCAG 2.1.1 is already satisfied by the focusable children.

**D-I — Rejected: splitting the component.** 535 lines across four regions (header, detail card, strip, timeline) is a plausible split, and I considered `VerbTierStrip.tsx` / `CognitiveTimeline.tsx`. Rejected: unlike the header — which was 170 lines inline in a 1500-line `App.tsx`, where extraction bought every later step stable coordinates — this is already its own file with its own test. A split would add three dispatch steps and three review surfaces to buy nothing this plan needs. Revisit if the timeline grows.

### Light-theme parity ledger

Per §2, the question is "what is it painted on?", not "is this class dark-only?".

| Current class | Site | Sits on | Verdict |
|---|---|---|---|
| `bg-white/20 border-white/30` icon tile | `:118–120` | tier gradient (goes; tile becomes `solidBg`) | **Replaced** — D-B |
| `bg-white/20 border-white/30` selected chip | `:185` | tier gradient (goes) | **Pair required** → `${tierConfig.bg} ${tierConfig.text} ${tierConfig.border}` |
| `text-white` header text | `:117` | tier gradient (goes) | **Pair required** → `text-slate-900 dark:text-white` |
| `bg-black/10 dark:bg-white/10` chevron chip | `:191` | the bar | **Already correct** — leave |
| `text-white light:text-slate-900` verb heading | `:223` | detail card `activeConfig.bg` | **Re-express** `dark:`-first |
| `bg-black/10 light:bg-slate-100` stat tray | `:243` | detail card | **Re-express** → `bg-slate-100 dark:bg-black/20` |
| `bg-black/10 light:bg-slate-300` dividers ×4 | `:252, 264, 273` | the tray | **Re-express** → `bg-slate-300 dark:bg-white/10` |
| `text-slate-500 light:text-slate-600` labels ×4 | `:245, 257, 266, 278` | the tray | **Re-express** → `text-slate-600 dark:text-slate-400` |
| `bg-white/[0.03] light:bg-white border-white/5 light:border-slate-300` cards | `:332` | the page | **Re-express** → `bg-white dark:bg-white/[0.03] border-slate-300 dark:border-white/5` |
| `focus-visible:ring-white/50` | `:365` | `tierConfig.bg` (a theme surface) | **Defect** — D-D |
| `opacity-50 light:opacity-70` | `:317` | n/a | **Defect** — D-E |
| `text-white` on `solidBg` / gradients ×3 | `:117, 365, 414` | solid tier fill | **Defect** — D-C (`solidText`) |
| `border-white/10` on the tile | (new, D-B) | solid tier fill | **Leave** — same colour in both themes, per §2 |

---

## 3. Implementation steps

Each step is written for an agent with no memory of this document's other steps and no access to the conversation that produced it. Every step ends type-checking and test-passing and is one commit. Run `npm run test:all` before each commit; do not use `--no-verify`.

**Every line number in this document for `CommandVerbHierarchy.tsx` is stale.** Steps 1–3 added a nesting level (so everything from the detail card down is indented two further spaces and shifted about +20 lines), removed the local `MeshOverlay` (8 lines near the top — `COGNITIVE_STEPS` now sits where the plan says the mesh is), and added ~12 lines to the lookup. **Locate code by searching for it.** For Step 4 in particular: the class strings themselves are unchanged, only the whitespace around them moved.

**Two jsdom facts worth knowing before writing a test here:** this jsdom has no `CSS.escape`, and `useId` emits `«r0»`, which is not a valid bare CSS identifier — resolve `aria-controls` with an attribute selector (`[id="…"]`), never `#id`. And `window.matchMedia` is undefined by default; the component guards with `typeof window.matchMedia === 'function'`, so the default path is "no reduced motion".

**Read first, every step:** to see this component in the running app, choose a question and then press **Change** on the breadcrumb to expand the syllabus navigator. `App.tsx:482–484` folds the navigator away when a question is selected, which unmounts the ribbon. That is a known issue tracked separately; do not fix it in your step unless your step says to.

---

### Step 1 — Make the shut ribbon unreachable

**Why first:** it is the DesignSpec §3 violation, it is 50 controls wide, and it touches no colour, so it cannot collide with any later step.

**Files:** `components/CommandVerbHierarchy.tsx`, `tests/unit/commandVerbHierarchy.test.tsx`.

**Current code.** `components/CommandVerbHierarchy.tsx:149–157` is the toggle button:

```tsx
<button
  onClick={toggleOpen}
  aria-expanded={isOpen}
  aria-label={`${isOpen ? 'Collapse' : 'Expand'} the HSC command verb hierarchy reference`}
  className={` … `}
>
```

and `:199–201` is the panel it controls:

```tsx
<div
  className={`transition-all duration-700 ease-in-out overflow-hidden ${isOpen ? 'max-h-[1600px] opacity-100' : 'max-h-0 opacity-0'}`}
>
  <div className="py-4 space-y-4">
```

The panel closes at `:527`. Everything between — the detail card, the tier strip and the cognitive timeline footer — is inside it. That is 50 focusable controls: 6 tier-card header buttons (`:358`), 38 verb chips (`:404`), 6 timeline step buttons (`:488`). With `max-h-0 opacity-0` all fifty stay in the tab order and in the accessibility tree while the panel is visually shut.

**Target.** Copy the house pattern, which is written out in full at `components/ReferenceMaterials.tsx:82–101` and used identically at `components/LiveInsights.tsx:93–102` and `components/SampleAnswersAccordion.tsx:352–358`:

1. `import { useId } from 'react'` (the file already imports from `react`) and add `const panelId = useId();` beside the other hooks near `:31`.
2. Add `aria-controls={panelId}` to the toggle at `:149–157`.
3. Replace the panel wrapper at `:199–201` with a grid-rows disclosure carrying `inert`:

```tsx
<div
  id={panelId}
  inert={!isOpen}
  className={`grid transition-all duration-700 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
>
  <div className="overflow-hidden">
    {/* everything currently between :202 and :526 */}
  </div>
</div>
```

The `overflow-hidden` moves from the animating element onto the new inner wrapper — that is what makes `grid-rows-[0fr]` clip rather than overflow. Keep the existing `<div className="py-4 space-y-4">` at `:202` as-is inside it.

Write a comment above it in the house voice explaining both halves: grid-rows because `max-h-[1600px]` was a guess that made the first half of the collapse animation travel through height the panel does not occupy; `inert` because zero height is not zero reach.

**Do not touch:** any class that sets a colour; the `collapsedByUser` logic at `:38–54`; the auto-scroll effect at `:83–106`; the header button's height-lock classes (`min-h-[60px] sm:min-h-[64px]`, `whitespace-nowrap`, `truncate`) — `tests/unit/commandVerbHierarchy.test.tsx:128–172` pins those and they must not move.

**Gotcha:** `inert` is a real React 19 DOM prop and needs no cast. The existing tests render with the panel open; `inert` on an open panel must be `false`/absent, not `undefined`-vs-`false` inconsistent — write `inert={!isOpen}`.

**Verify:** `npm run test:all`. Add two cases to `tests/unit/commandVerbHierarchy.test.tsx`, modelled on `tests/unit/focusTrap.test.tsx:238–261`:

- collapsing the ribbon puts an `[inert]` attribute on the panel and that panel contains a known verb chip (e.g. the button named `IDENTIFY`); re-expanding removes it;
- the toggle's `aria-controls` equals the panel's `id`.

By hand: expand the navigator, collapse the ribbon, then Tab from the toggle — the next stop must be outside the ribbon entirely, not a verb chip.

---

### Step 2 — Migrate to the shared `MeshOverlay`

**Files:** `components/CommandVerbHierarchy.tsx`.

**Current code.** `components/CommandVerbHierarchy.tsx:12–19` defines a local component:

```tsx
const MeshOverlay = ({ opacity = 'opacity-[0.03]' }: { opacity?: string }) => (
  <div
    className={`absolute inset-0 ${opacity} pointer-events-none mix-blend-overlay z-0 transition-opacity duration-500`}
    style={{ backgroundImage: `url("data:image/svg+xml,…stroke='%23ffffff'…")` }}
  />
);
```

It is used at `:159` (`opacity="opacity-10"`), `:208` (`opacity="opacity-[0.06]"`) and `:350` (six tier cards, `opacity-[0.06]` when current and `opacity-[0.02]` otherwise).

`components/MeshOverlay.tsx` already exists and is strictly better: it takes a `color` prop and adds `light:opacity-[0.06]`.

**Target.** Delete `:12–19` and add `import MeshOverlay from './MeshOverlay';` beside the existing component imports (`./StrategyTip` is imported at `:6`). Leave all four call sites' props exactly as they are.

**Known and accepted divergence — write it into the commit message.** The shared component bakes in `light:opacity-[0.06]`, and because `tailwind.config.js:93–95` registers `light` as `[data-theme="light"] &` (a descendant selector), a call site **cannot** override it. So in the light theme every mesh in this component now renders at 6% rather than at the value passed. In practice this changes almost nothing: the six tier-card meshes sit on `light:bg-white` and `mix-blend-overlay` with white over white is a no-op, and the two remaining ones lighten a mid-tone fill imperceptibly. The shared component's transition also changes from `transition-opacity duration-500` to `transition-all duration-700 ease-in-out`.

This is a documented flaw in `MeshOverlay`'s API, recorded in `projectDocs/HeaderRedesignPlan.md:31`, and the instruction there is explicit: **fix it in a consolidation series that owns all fourteen remaining copies, not in a call-site commit.** Do not add a `lightOpacity` prop here. Do not change `components/MeshOverlay.tsx` at all.

**Do not touch:** the mesh call sites' opacity values; `components/MeshOverlay.tsx`; the thirteen other local copies elsewhere in the codebase; `.mesh-overlay` in `index.css`.

**Verify:** `npm run test:all`. By hand, in both themes: no visible change.

---

### Step 3 — Two behavioural fixes: reduced motion, and a case-safe verb lookup

Both are ~5 lines, both live in the same block of hooks at the top of the file, and neither touches chrome — one commit.

**Files:** `components/CommandVerbHierarchy.tsx`.

**Current code A — the auto-scroll ignores `prefers-reduced-motion`.** `:99–105`:

```ts
// jsdom (and very old browsers) have no Element.scrollTo — fall back to
// the property, which is what scrollTo sets anyway.
if (typeof strip.scrollTo === 'function') {
  strip.scrollTo({ left: target, behavior: 'smooth' });
} else {
  strip.scrollLeft = target;
}
```

`index.css:217–226` sets `scroll-behavior: auto !important` under reduced motion, but that CSS property does not govern the JS `behavior` option, so a reduced-motion user still gets the animation.

**Target A.** Follow `components/ImprovementReviewModal.tsx:242–245`, which is the house pattern:

```ts
const reduceMotion =
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (typeof strip.scrollTo === 'function') {
  strip.scrollTo({ left: target, behavior: reduceMotion ? 'auto' : 'smooth' });
} else {
  strip.scrollLeft = target;
}
```

Keep the existing `scrollTo`-missing fallback and its comment — `tests/unit/commandVerbHierarchy.test.tsx:91–104` depends on `scrollTo` being called.

**Current code B — the verb lookup is case-fragile.** `:56–62`:

```ts
const { sortedVerbsByGroup, activeTermInfo } = useMemo(() => {
  const allVerbs = Array.from(commandTerms.values());
  const current = activeVerb
    ? commandTerms.get(activeVerb)
    : currentVerb
      ? commandTerms.get(currentVerb)
      : null;
```

`data/commandTerms.ts:822–831` exports `getCommandTermInfo`, whose comment records exactly this bug being fixed elsewhere: "verbs reach here from model output and stored prompts in whatever case they were saved with. An exact-case-only lookup silently mis-filed every mixed-case verb". Here the consequence is worse in one way and better in another: `.get()` returns `undefined`, so a mixed-case verb makes the detail card, the tier highlight and the progress bar all silently disappear rather than showing wrong data.

**Target B.** Route the lookup through `getCommandTermInfo`, but **preserve the null case**, because the component relies on `activeTermInfo` being falsy to render its neutral, no-verb-selected state (`:113–120`, `:204`, `:312`, `:466–467`) and `getCommandTermInfo` returns an `EXPLAIN` fallback rather than `undefined`:

```ts
// `commandTerms.get` is exact-case only, and verbs reach the app from model
// output and stored prompts in whatever case they were saved with — see the
// note on getCommandTermInfo. A miss here does not show the wrong verb, it
// shows no verb at all: no detail card, no tier highlight, no progress.
const verb = activeVerb ?? currentVerb;
const current = verb ? getCommandTermInfo(verb) : null;
```

Add `getCommandTermInfo` to the existing import from `../data/commandTerms` at `:3`.

Note the behaviour change this does introduce: an **unrecognised** verb now resolves to the `EXPLAIN` fallback (tier 3) instead of nothing. That is the same call every other consumer of `getCommandTermInfo` makes, and showing the fallback is what the rest of the app does with an unknown verb. See R10 — if the maintainer prefers the null, use `commandTerms.get(v) ?? commandTerms.get(v.toUpperCase() as PromptVerb) ?? null` instead.

**Do not touch:** the `sortedVerbsByGroup` construction at `:64–69`; the `useEffect` dependency arrays; `data/commandTerms.ts`.

**Verify:** `npm run test:all`. Add two cases:

- a lowercase `currentVerb` (`'describe' as PromptVerb`) renders the detail card — assert `screen.getByText('Band Cap')` is present;
- with `window.matchMedia` stubbed to report reduced motion, `scrollTo` is called with `behavior: 'auto'`. Note the existing suite stubs `Element.prototype.scrollTo`; stub `window.matchMedia` per test and restore it, since jsdom does not implement it by default.

---

### Step 4 — `utils/verbRibbonChrome.ts` and its test, with no class values changed

**Precedent:** `utils/headerChrome.ts` + `tests/unit/appHeaderChrome.test.tsx` are the current house pattern; `utils/cardChrome.ts` and `utils/panelStyles.ts` are the same idea without the sweep. This step exists so that Step 5's diff is a diff of _values in one file_ rather than a diff of JSX.

**Files:** create `utils/verbRibbonChrome.ts` and `tests/unit/verbRibbonChrome.test.tsx`; edit `components/CommandVerbHierarchy.tsx`.

**This step changes no rendered class.** `git diff` on the rendered DOM must be empty.

**Current code.** All of the ribbon's chrome is literal template strings in the JSX. Lift these, **byte for byte as they are today**, into named exports:

| Export | Lifted from | Current value (abbreviated — copy the real one) |
|---|---|---|
| `RIBBON_ROOT` | `:134` | `clip-stable relative overflow-hidden transition-all duration-700 ease-out animate-fade-in` |
| `RIBBON_HEADER_BAR` | `:153–157`, the theme-neutral part only | `w-full px-0 py-3 sm:py-3.5 min-h-[60px] sm:min-h-[64px] flex items-center justify-between gap-3 relative z-10 overflow-hidden transition-all duration-500 group/header rounded-xl` |
| `RIBBON_HEADER_TITLE` | `:170` | `text-sm sm:text-base font-black tracking-tight leading-none truncate` |
| `RIBBON_HEADER_SUBLABEL` | `:173` | `block truncate text-[9px] font-black uppercase tracking-[0.2em] opacity-70` |
| `RIBBON_SELECTED_LABEL` | `:182` | `text-[10px] font-black opacity-60 uppercase tracking-widest whitespace-nowrap` |
| `RIBBON_SELECTED_CHIP` | `:185` | `px-2.5 py-0.5 rounded-lg … bg-white/20 border border-white/30 backdrop-blur-md shadow-sm` |
| `RIBBON_CHEVRON_CHIP` | `:191` | `w-7 h-7 rounded-full bg-black/10 dark:bg-white/10 …` |
| `RIBBON_DETAIL_CARD` | `:206` | `clip-stable relative overflow-hidden rounded-2xl p-5 border …` (structure only; the tier `border`/`bg` stay interpolated) |
| `RIBBON_DETAIL_TERM` | `:223` | `text-3xl font-black tracking-tighter text-white light:text-slate-900 uppercase italic leading-none` |
| `RIBBON_DETAIL_DEFINITION` | `:232` | `text-sm font-bold text-[rgb(var(--color-text-secondary))] light:text-slate-700 max-w-xl leading-relaxed opacity-90` |
| `RIBBON_STAT_TRAY` | `:243` | `flex items-center gap-4 bg-black/10 light:bg-slate-100 …` |
| `RIBBON_STAT_LABEL` | `:245` etc. | `text-[9px] text-slate-500 light:text-slate-600 uppercase tracking-widest font-black mb-0.5` |
| `RIBBON_STAT_VALUE` | `:248` etc. | `text-lg font-black` |
| `RIBBON_STAT_DIVIDER` | `:252` etc. | `w-px h-8 bg-black/10 light:bg-slate-300` |
| `RIBBON_STRIP` | `:294` | `flex overflow-x-auto gap-4 pb-4 pt-2 snap-x snap-mandatory scrollbar-hide` |
| `RIBBON_TIER_CARD` | `:328` | `clip-stable flex-shrink-0 w-[260px] min-h-[256px] snap-center …` |
| `RIBBON_TIER_CARD_IDLE` | `:332` | `bg-white/[0.03] light:bg-white border-white/5 light:border-slate-300 light:shadow-sm` |
| `RIBBON_TIER_CARD_DIMMED` | `:317`, the non-tier part | `scale-90 opacity-50 light:opacity-70 hover:opacity-100 hover:scale-95 border-2` |
| `RIBBON_TIER_HEADER` | `:365`, the theme-neutral part | `w-full text-left px-6 py-4 border-b relative flex items-center gap-4 flex-shrink-0 cursor-pointer transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50` |
| `RIBBON_TIER_SUBTITLE` | `:386` | both branches, as two exports if cleaner |
| `RIBBON_VERB_CHIP` | `:411` | `px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all duration-300` |
| `RIBBON_TIMELINE_LABEL` | `:438` | `text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest sm:tracking-[0.2em]` |
| `RIBBON_TIMELINE_TRACK` | `:453` | `relative h-2 bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden mb-4` |
| `RIBBON_TIMELINE_TICK` | `:459` | `w-px h-full bg-slate-400/50 dark:bg-white/20` |
| `RIBBON_TIMELINE_DOT` | `:499` | `w-4 h-4 rounded-full border-2 transition-all duration-500 relative` |

**Scope limit, stated at the top of the new file:** this file holds the ribbon's **theme-neutral chrome only**. Everything tier-coloured stays interpolated from `getTierScaleConfig(tier)` at the call site — baking six tiers × six slots into constants would duplicate `utils/renderUtils.ts`, which is pinned by `tests/unit/bandColors.test.ts` and shared with a dozen other surfaces. Give each constant a comment saying **what it is painted on**; that is the question DesignSpec §2 asks and it is not answerable from the class string.

**New test** (`tests/unit/verbRibbonChrome.test.tsx`). This step's version asserts only that the constants are actually worn — that the JSX has no class string left behind that would silently stop tracking the redesign. Model it on `tests/unit/appHeaderChrome.test.tsx:114–152`:

- render `<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />`;
- assert the toggle's `className` contains `RIBBON_HEADER_BAR`;
- assert the detail card's heading carries `RIBBON_DETAIL_TERM`;
- assert a tier-card header button carries `RIBBON_TIER_HEADER` and a verb chip carries `RIBBON_VERB_CHIP`;
- assert the strip carries `RIBBON_STRIP`.

**Do not add the parity sweep in this step.** The current values would fail it immediately — that is the point of Step 5. Do not "pre-fix" any value here.

**Do not touch:** any class value; `utils/renderUtils.ts`; `utils/headerChrome.ts`; `tests/unit/commandVerbHierarchy.test.tsx`.

**Verify:** `npm run test:all`. By hand, in both themes: pixel-identical.

---

### Step 5 — Tokenise the bar and the surfaces

This is the one visually dramatic step.

**Files:** `utils/verbRibbonChrome.ts`, `components/CommandVerbHierarchy.tsx`, `tests/unit/verbRibbonChrome.test.tsx`.

**Current state.** After Step 4 the ribbon's chrome lives in `utils/verbRibbonChrome.ts` and the JSX reads `className={RIBBON_HEADER_BAR}`, not a literal — **locate everything via the constants file; the class strings are no longer in the JSX.** The exceptions Step 4 deliberately left interpolated in `components/CommandVerbHierarchy.tsx` are the tier-derived pieces, and this step owns three of them:

```tsx
// :113–120
const headerGradientClass = activeConfig
  ? `bg-gradient-to-r ${activeConfig.gradient}`
  : 'bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700';
const headerTextClass = activeConfig ? 'text-white' : 'text-slate-700 dark:text-slate-200';
const headerIconBg = activeConfig
  ? 'bg-white/20 border-white/30'
  : 'bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600';
```

**Target.** New code here is **`dark:`-first**: light is the base, `dark:` carries the override (DesignSpec §2, "Which variant to write in new code"). The tier config strings you interpolate are `light:`-based and **stay that way** — `utils/renderUtils.ts` is shared and pinned; do not migrate it.

1. **The bar becomes glass.** The full-bleed tier gradient goes:

```ts
/** The header bar. Painted on the page background and AnimatedBackground
 *  beneath it. It used to be a full-bleed tier gradient — a wall, in a glass
 *  app, and the reason its text had to be white. The tier still colours the
 *  ribbon; it does it from a 36px tile and a 2px underline instead. */
export const RIBBON_HEADER_BAR =
  'w-full px-0 py-3 sm:py-3.5 min-h-[60px] sm:min-h-[64px] flex items-center justify-between gap-3 ' +
  'relative z-10 overflow-hidden rounded-xl transition-colors duration-500 group/header ' +
  'bg-white/60 hover:bg-white/80 backdrop-blur-xl ' +
  'dark:bg-[rgb(var(--color-bg-surface))]/40 dark:hover:bg-[rgb(var(--color-bg-surface))]/60';

/** Edge-lighting under the bar, and where the tier colour went. Painted on the
 *  bar's own bottom edge; the gradient is interpolated at the call site. */
export const RIBBON_TIER_UNDERLINE = 'absolute inset-x-0 bottom-0 h-0.5 pointer-events-none bg-gradient-to-r';
```

Delete `headerGradientClass`, `headerTextClass` and `headerIconBg` from `:113–120`. The header text becomes `text-slate-900 dark:text-white`; the sub-label becomes `text-slate-500 dark:text-slate-400` (drop the `opacity-70`, which was there to soften white-on-gradient).

2. **The icon tile carries the tier.** Replace `headerIconBg` at `:163` with, when a verb is selected:

```tsx
`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center border border-white/20 shadow-md
 group-hover/header:scale-110 transition-transform ${activeConfig.solidBg} ${activeConfig.solidText}`
```

and, when none is, `bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-300 border-slate-300 dark:border-white/10`. The `border-white/20` on the coloured branch sits on a solid tier fill and is correct without a `dark:` partner — say so in the comment; the parity sweep will need it exempted.

   Use `activeConfig.solidText`, **not** `text-white`. Tier 3's fill is yellow, and white on it is 1.9:1.

3. **The "Selected" chip stops being white-alpha.** `RIBBON_SELECTED_CHIP` at `:185` loses `bg-white/20 border border-white/30 backdrop-blur-md` and becomes structure only; the call site adds `${activeConfig.bg} ${activeConfig.text} border ${activeConfig.border}`. The `Selected:` label becomes `text-slate-500 dark:text-slate-400` and drops `opacity-60`.

4. **The tier underline renders** as the bar's last child: `<div className={`${RIBBON_TIER_UNDERLINE} ${activeConfig.gradient}`} aria-hidden="true" />`, only when `activeConfig` is truthy.

5. **The remaining surfaces go `dark:`-first**, per the ledger in §2 of this document:

```ts
export const RIBBON_DETAIL_TERM =
  'text-3xl font-black tracking-tighter uppercase italic leading-none text-slate-900 dark:text-white';
export const RIBBON_DETAIL_DEFINITION =
  'text-sm font-bold max-w-xl leading-relaxed text-slate-700 dark:text-[rgb(var(--color-text-secondary))]';
export const RIBBON_STAT_TRAY =
  'flex items-center gap-4 px-5 py-3 rounded-2xl backdrop-blur-md self-stretch md:self-auto ' +
  'justify-center shadow-inner flex-wrap ' +
  'bg-slate-100 border border-slate-200 dark:bg-black/20 dark:border-white/10';
export const RIBBON_STAT_LABEL =
  'text-[9px] uppercase tracking-widest font-black mb-0.5 text-slate-600 dark:text-slate-400';
export const RIBBON_STAT_DIVIDER = 'w-px h-8 bg-slate-300 dark:bg-white/10';
export const RIBBON_TIER_CARD_IDLE =
  'bg-white border-slate-300 shadow-sm dark:bg-white/[0.03] dark:border-white/5 dark:shadow-none';
```

and the `StrategyTip` `accentClass` at `:238` becomes `text-slate-500 dark:text-[rgb(var(--color-text-muted))]`.

Also drop `opacity-90` from `RIBBON_DETAIL_DEFINITION` — it was compensating for white-on-gradient and now only costs contrast.

**Do not touch:** `focus-visible:ring-white/50` on `RIBBON_TIER_HEADER`, the `opacity-50 light:opacity-70` in `RIBBON_TIER_CARD_DIMMED`, or the `text-white` at `:365` and `:414` — all three are Step 6, and splitting them out keeps this step's diff readable. Do not touch `utils/renderUtils.ts`, `utils/headerChrome.ts`, `utils/panelStyles.ts` or `utils/cardChrome.ts`. Do not touch the height-lock classes (`min-h-[60px] sm:min-h-[64px]`, `whitespace-nowrap`, `truncate`) — `tests/unit/commandVerbHierarchy.test.tsx:128–172` pins them.

**Extend the test — add the parity sweep.** Copy the mechanism from `tests/unit/appHeaderChrome.test.tsx:191–234` verbatim (it splits each token, strips the variant prefix, classifies the CSS property, and requires a `dark:` partner for the same property on every unprefixed colour utility). Two ribbon-specific additions:

```ts
// The tile's border sits on a solid tier fill: it reads the same in both
// themes and a dark: partner would be the actual mistake.
const exempt = new Set(['RIBBON_TIER_TILE']);

it('is written in the new idiom throughout', () => {
  for (const [name, value] of Object.entries(verbRibbonChrome)) {
    if (typeof value !== 'string') continue;
    expect(value, `${name} still uses the legacy light: variant`).not.toContain('light:');
  }
});
```

Also assert `RIBBON_HEADER_BAR` contains both `bg-white/60` and a `dark:bg-` value and `backdrop-blur-xl`, and that no `header > .absolute.inset-0.bg-gradient-to-r` wall survives in the rendered output.

**Risk.** `backdrop-blur-xl` over `AnimatedBackground` (`fixed inset-0 z-0`) should be fine — the header rail already does it — but the ribbon is _not_ `sticky`, so it does not establish a positioned ancestor of its own the way the header did. Its root already carries `relative` (`:134`), so `inset-0` on the mesh and the underline resolves correctly; check that the mesh's `z-0` still sits under the content row's `z-10`.

**Verify:** `npm run test:all`, then by hand in **both** themes, with a **tier 3** verb selected (EXPLAIN, COMPARE, CONTRAST, DEMONSTRATE, PREDICT or ACCOUNT) — that is the tier that exposes the white-text problem — and also with **no** verb selected, which is a separate visual branch (`activeConfig === null`).

---

### Step 6 — Pair the solid fills with `solidText`, restore the focus ring, and lift the dimmed cards

**Files:** `components/CommandVerbHierarchy.tsx`, `utils/verbRibbonChrome.ts`, `tests/unit/verbRibbonChrome.test.tsx`.

Three defects, all in the tier strip, all found by reading rather than by any test.

**Defect 1 — `text-white` on a yellow fill.** `utils/renderUtils.ts` returns a `solidText` field precisely so a caller never has to guess: it is `text-white print:text-white` for tiers 1, 2, 4, 5 and 6, and `text-yellow-900 print:text-yellow-900` for tier 3 (`renderUtils.ts:317–320`). Two other components already pair them — `components/SyllabusNavBar.tsx:78` (`${band.solidBg} ${band.solidText}`) and `components/PromptSelector.tsx:733`. The ribbon hard-codes `text-white` in two remaining places:

- `components/CommandVerbHierarchy.tsx:365`, the tier card header when it is the current tier: `bg-gradient-to-r ${tierConfig.gradient} border-white/10 text-white`;
- `:414`, the selected verb chip: `${tierConfig.solidBg} text-white shadow-lg scale-105 border-transparent`.

White on `yellow-500` (`#eab308`) is **1.92:1** and on `amber-500` (`#f59e0b`) is **2.15:1**, against a 4.5 floor. `text-yellow-900` (`#713f12`) on `yellow-400` is **5.66:1**, on `amber-400` **5.19:1**, on `yellow-500` **4.52:1**.

**Target:** replace both `text-white` occurrences with `${tierConfig.solidText}`. Also check `:377` — the card header's `<h4>` currently branches `isCurrentTier ? 'text-white' : tierConfig.text`; the `text-white` there is the same bug and takes the same fix.

Note that one cell is still short after this: the selected chip's flat light fill, `text-yellow-900` on `amber-500` = **4.04:1**. That is a defect in the shared token, not in this component, and it is Step 7's business. Leave a comment saying so, naming Step 7, so the next reader does not think this step missed it.

**Defect 2 — an invisible focus ring in the light theme.** `:365` ends:

```
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50
```

`focus-visible:outline-none` suppresses the app-wide focus treatment (`index.css:240–249`, `outline: 2px solid rgb(var(--color-accent)); outline-offset: 2px`), and the white-alpha ring that replaces it sits on `${tierConfig.bg}` — `light:bg-amber-100`, `light:bg-green-100` and so on. White on `amber-100` is nothing. A keyboard user in the light theme cannot see which tier card has focus.

**Target:** delete `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50` entirely and let the global rule apply. It is the app's one consistent focus treatment and there is no reason for this button to opt out. If the accent outline reads badly against the coloured header, the fallback is `focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900/40 dark:focus-visible:ring-white/60` — but try the global rule first.

**Defect 3 — the dimmed cards fall below the contrast floor.** `:317`:

```
scale-90 opacity-50 light:opacity-70 hover:opacity-100 hover:scale-95 border-2
```

applied to all five non-active cards whenever a verb is selected. Those cards hold 32 of the 38 verb buttons. The card subtitle (`:386`) is `slate-500` on white — **4.76:1** at full opacity, **2.72:1** at `opacity-70`. A control a keyboard user can reach and click must be legible.

**Target:** a single `opacity-90` for both themes. That costs about 5% of contrast (4.76 → ~4.5) and the de-emphasis is carried by `scale-90` and the tier border, which are already there. Remove `light:opacity-70` — it was the wrong shape of fix anyway.

**Do not touch:** `utils/renderUtils.ts` (Step 7 owns it, and only if D1 is granted); `components/SyllabusNavBar.tsx`; `components/PromptSelector.tsx`; `components/ReferenceMaterials.tsx:57`, which hard-codes `text-white` beside `bandConfig.solidBg` and has the same latent bug — it is collateral, it is out of scope, and it should be raised separately.

**Verify:** `npm run test:all`. Add to `tests/unit/verbRibbonChrome.test.tsx`:

- render with a tier-3 verb (`'EXPLAIN' as PromptVerb`) and assert no element inside the tier strip has both `text-white` and a `yellow`/`amber` background class — or, more robustly, assert that the rendered markup for the current tier card header contains `text-yellow-900`;
- assert `RIBBON_TIER_CARD_DIMMED` contains `opacity-90` and no `opacity-50`, and no `light:`;
- assert `RIBBON_TIER_HEADER` contains no `focus-visible:outline-none`.

By hand, in the **light** theme: Tab through the tier headers and confirm the focus indicator is visible on every one; select a tier-3 verb and read the card header and the selected chip.

---

### Step 7 — Fix tier 3's solid pairing in `getBandConfig`

> **Gated on maintainer decision D1.** This changes a shared token used by three components. Do not dispatch without it.

**Files:** `utils/renderUtils.ts`, `tests/unit/bandColors.test.ts`.

**Current code.** `utils/renderUtils.ts:317–320`, the tier/band 3 entry:

```ts
solidBg: 'bg-yellow-500 light:bg-amber-500',
…
solidText: 'text-yellow-900 print:text-yellow-900',
```

Every other band pairs a `-600`/`-700` fill with `text-white`. Band 3 is the exception because yellow is too light for white text, so it uses a dark text on a light fill — which is right in principle and lands just short in the light theme:

| Pairing | Ratio | Verdict |
|---|---|---|
| `text-yellow-900` on `bg-yellow-500` (`#713f12` on `#eab308`) | **4.52:1** | passes, no margin |
| `text-yellow-900` on `bg-amber-500` (`#713f12` on `#f59e0b`) | **4.04:1** | **fails** the 4.5 floor |

Three surfaces wear this pairing: `components/SyllabusNavBar.tsx:78`, `components/PromptSelector.tsx:733`, and (after Step 6) `components/CommandVerbHierarchy.tsx:414`.

**Target — two candidate fixes; measure before choosing.**

**(a) Darken the text.** `solidText: 'text-yellow-950 print:text-yellow-900'`. `yellow-950` is `#422006`, giving **6.78:1** on `amber-500` and **7.60:1** on `yellow-500`. Tailwind 3.4.19 is installed and does ship the `-950` ramp (verified in `node_modules/tailwindcss/colors.js`) — **confirm this yourself before relying on it.** Keeps `print:` at `-900`, matching the file's stated policy that printed tints lean on the border and the number.

**(b) Lighten the light fill.** `solidBg: 'bg-yellow-500 light:bg-amber-400'`. `#713f12` on `amber-400` (`#fbbf24`) is **5.19:1**. Also fine, but it makes the light chip paler, which reads as less "solid" beside the other five bands.

**Recommendation: (a).** It changes one value, improves both themes, and does not alter the perceived weight of the chip. Do not try `light:bg-amber-600` — a darker fill under dark text makes it _worse_ (2.72:1).

**Do not touch:** any other band's entry; `BAND_HEX` / `BAND_HEX_DARK` (the canonical hex palette is a separate contract, pinned by `bandColors.test.ts:24–38`); `gradient`, `bg`, `text`, `border`, `iconBg`, `ring` for band 3 — only the one field you choose.

**Verify:** `npm run test:all`. Add a case to `tests/unit/bandColors.test.ts` asserting band 3's `solidText` value, with a comment giving the ratio and saying which fill it is measured against, so the next person who "tidies" it back to `-900` has to argue with a number.

By hand, in **both** themes, look at all three call sites: the band chip in `SyllabusNavBar`, the tier chip in `PromptSelector`'s question list, and the selected verb chip in the ribbon. This is a shared token; a change that looks right in one place and wrong in another is not done.

---

### Step 8 — Say tier where tier is meant, and set the numbers in mono

**Files:** `components/CommandVerbHierarchy.tsx`, `utils/verbRibbonChrome.ts`, `tests/unit/commandVerbHierarchy.test.tsx`, `tests/unit/verbRibbonChrome.test.tsx`.

**Read `projectDocs/commandVerbs.md` before changing any student-facing copy** — it may state a tier/band vocabulary this step would contradict (R9).

**Why these are one commit:** they are the same act — making the detail card say one true thing per label instead of the same number twice in two vocabularies.

**Current code A — the same integer, twice, under two labels.** `data/commandTerms.ts:1005–1006`:

```ts
export const getTierTargetBand = (tier: number): number =>
  TIER_GROUPS.find((g) => g.tier === tier)?.maxBand ?? Math.max(1, Math.min(6, tier));
```

Every `TIER_GROUPS` entry has `maxBand === tier` (`commandTerms.ts:34–77`), and `tests/unit/bandColors.test.ts:69–74` pins that as an invariant. `utils/renderUtils.ts:353–358` says the same in prose. So the detail card's chip at `:229` (`Band {activeTermInfo.tier}`) and its stat at `:261` (`Band Cap {getTierTargetBand(activeTermInfo.tier)}`) are **provably always the same number**, six inches apart, labelled differently. The tier card header at `:374` prints it a third time as `Band {group.maxBand} ceiling`.

**Target A:**

- `:229` chip → `Tier {activeTermInfo.tier} · {tierShortLabel(activeTermInfo.tier)}` (import `tierShortLabel` from `../data/commandTerms`).
- `:261` `Band Cap` stays; it is now the only band statement in the card.
- `:255`'s `title` (`The cognitive demand of X caps a response at Band N`) moves into visible text beneath the stat tray, or becomes a short visible caption — a `title` on a non-focusable `<div>` is unreachable by keyboard and absent on touch, and "Band Cap" is the one label a student will not already know. A single line under the tray reading `A {TERM} question caps a response at Band {n}` is enough.
- `:174` sub-label → `Reference • {sortedVerbsByGroup.length} cognitive tiers`.
- `:374` tier card → keep `Band {group.maxBand} ceiling`; it is the card that is explicitly about the ceiling and it is the one place the word belongs.

**Current code B — a fourth, drifted set of tier labels.** `:21–28`:

```ts
const COGNITIVE_STEPS = [
  { label: 'Remember', tier: 1 }, { label: 'Describe', tier: 2 }, { label: 'Explain', tier: 3 },
  { label: 'Analyse', tier: 4 }, { label: 'Argue', tier: 5 }, { label: 'Evaluate', tier: 6 },
];
```

`tierShortLabel` (`data/commandTerms.ts:92–97`) derives `Remember, Define, Explain, Analyse, Discuss, Evaluate` from `TIER_GROUPS`. Tiers 2 and 5 disagree. That helper's doc comment is a written record of two admin components that kept hand-written copies, both of which had drifted and both of which labelled a tier with **another tier's verb** — "because each wrong label named a tier that also appears in the same table, the mistake read as self-consistent". This is a third such copy.

**Target B:** delete the `label` field and derive it. `COGNITIVE_STEPS` becomes `TIER_GROUPS.map(g => g.tier)` or is dropped entirely in favour of iterating `sortedVerbsByGroup`, with `tierShortLabel(tier)` supplying the label at `:519`. Update the step button's `aria-label` at `:490` from `Highlight band ${step.tier} — ${step.label}` to `Show tier ${tier} verbs — ${tierShortLabel(tier)}` — "highlight" is not what the button does; it selects the tier's first verb (`:492–495`).

While here, fix the stale comment at `:479`: it says the threshold marker sits "between Tier 3 (Apply) and Tier 4 (Analyse)". Tier 3 is `Explain & Compare`; Apply is a tier-4 verb.

**Current code C — telemetry set in Inter.** `:248`, `:260`, `:269`, `:281` render the mark range, the band cap, the time range and the syllabus-term count as `text-lg font-black` in the default `font-sans`. DesignSpec §4: "**Telemetry**: `JetBrains Mono` — Used for marks, token counts, and system logs."

**Target C:** `RIBBON_STAT_VALUE` becomes `font-mono text-lg font-black tabular-nums`. `tabular-nums` because the four stats sit in a fixed-width tray and a two-digit range must not shift its neighbours.

**Do not touch:** `data/commandTerms.ts` (`tierShortLabel` and `getTierTargetBand` are both correct and both pinned); `TIER_GROUPS`; any colour class; the footer's four band-range labels at `:438–449` — they describe spans rather than tiers and renaming them is a copy decision, not a correctness one. Raised as R6.

**Verify:** `npm run test:all`. `tests/unit/commandVerbHierarchy.test.tsx:26` asserts `/Reference • 6 Bands/i` and **will fail** — update it to the new string; that is the intended, single expected failure. Also `:73` finds a tier header by `/Band 1 ceiling Remember & List/i`, which is unchanged by this step and must keep passing.

Add:

- the detail card renders `Tier 4` (or the tier's short label) and `Band Cap`, and the two are no longer the same string;
- the timeline step for tier 5 has an accessible name matching `/tier 5/i` and `/Discuss/i` — the label `tierShortLabel` derives, not the `Argue` that was hand-written;
- `RIBBON_STAT_VALUE` contains `font-mono`.

---

### Step 9 — Give the strip a name, an edge and sane snapping

**Files:** `components/CommandVerbHierarchy.tsx`, `utils/verbRibbonChrome.ts`, `tests/unit/verbRibbonChrome.test.tsx`.

**Current code.** `:292–296`:

```tsx
<div className="relative group/scroll">
  <div
    className="flex overflow-x-auto gap-4 pb-4 pt-2 snap-x snap-mandatory scrollbar-hide"
    ref={scrollContainerRef}
  >
```

Six 260px cards plus 16px gaps is about 1580px, so the strip overflows at nearly every width. `scrollbar-hide` (`index.css:378–386`) removes the scrollbar, and nothing replaces it — no fade, no arrows, no count. The wrapper `div` at `:292` exists (`relative group/scroll`) but holds nothing. The strip has no `role`, no `aria-label` and no heading, so a screen-reader user meets 44 buttons in a flat list with no statement that they are a horizontal ladder.

**Target.**

1. **Name it.** On the scroller: `role="group"` and `aria-label="Cognitive tier ladder, tier 1 to tier 6"`. A `<group>` with a name is what tells a screen-reader user that the tier cards are one structure.

2. **Show the edge.** In the currently-empty wrapper at `:292`, add two `pointer-events-none` fades:

```ts
export const RIBBON_STRIP_FADE_LEFT =
  'absolute left-0 top-0 bottom-4 w-8 z-10 pointer-events-none ' +
  'bg-gradient-to-r from-white to-transparent dark:from-[rgb(var(--color-bg-base))]';
export const RIBBON_STRIP_FADE_RIGHT =
  'absolute right-0 top-0 bottom-4 w-8 z-10 pointer-events-none ' +
  'bg-gradient-to-l from-white to-transparent dark:from-[rgb(var(--color-bg-base))]';
```

Both `aria-hidden="true"`. Keep them unconditional rather than tracking `scrollLeft` — a scroll listener on a strip that is also programmatically scrolled is more machinery than an 8px fade is worth, and a fade at a boundary that happens to be flush costs nothing visually.

3. **Snap proximately.** `snap-mandatory` → `snap-proximity`. Mandatory snapping fights two other things that move this strip: the programmatic `scrollTo` at `:101` and the browser's own scroll-into-view when Tab moves focus into an off-screen card. `snap-proximity` keeps the pleasant settling behaviour without contesting either.

**Deliberately not doing:** adding `tabIndex={0}` to the scroller. WCAG 2.1.1 is already satisfied — the strip is keyboard-operable because its children are focusable — and a 51st tab stop in front of the 44 that are already there is a cost with no benefit. Record this in the comment so the next reader does not add it.

**Do not touch:** the auto-scroll effect at `:83–106` and its comment, which documents a real regression (`scrollIntoView` dragging the whole page); `.scrollbar-hide` in `index.css`, which is shared with `Breadcrumb.tsx:43`, `SyllabusNavBar.tsx:53` and others; the card widths or `min-h-[256px]`.

**Verify:** `npm run test:all`. Add: the strip has `role="group"` with an accessible name matching `/tier ladder/i`; `RIBBON_STRIP` contains `snap-proximity` and no `snap-mandatory`.

By hand at 360px, 768px and 1400px, in both themes: the fade must read as "there is more" and not as a smudge, and it must sit on top of the cards (`z-10`) but under nothing that matters. Tab from the last verb chip of one card into the next card and confirm the strip scrolls sensibly rather than snapping back.

---

### Step 10 — Let the e2e contrast suite reach the ribbon

> **Gated on maintainer decision D0**, and on Step 11 landing first. If the ribbon stays unmounted whenever a question is selected, there is nothing for the suite to reach and this step does not exist.

**Files:** `tests/e2e/light-theme.spec.ts` (or `tests/e2e/support/workspace.ts`).

**Current state.** `tests/e2e/support/contrast.ts` has no ribbon exclusion — it has never needed one, because no e2e test has ever rendered the component. `openFirstQuestion` (`tests/e2e/support/workspace.ts:55–73`) selects a question, and `App.tsx:482–484` folds the navigator away in response, unmounting the ribbon.

**Target.** After Step 11, add a step to `light-theme.spec.ts`'s `beforeEach` (or a small helper beside `openFirstQuestion`) that expands the ribbon before measuring, so its ~120 text nodes enter the audit:

```ts
/** The verb ribbon is shut by default and its content is the largest block of
 *  tier-coloured text in the app — the exact kind of surface every light-theme
 *  defect this project has shipped came from. */
export const openVerbRibbon = async (page: Page): Promise<void> => {
  const toggle = page.getByRole('button', { name: /command verb hierarchy reference/i });
  if (!(await toggle.count())) return;
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
};
```

**Four failures are now known in advance, all measured during Step 6.** Two were predicted by the audit and are already fixed by Steps 6 and 7. **Two more were not in the audit at all**, and both come from an opacity set in the JSX rather than from anything Steps 5–6 touched:

- the **"Band N ceiling"** label (`tierConfig.text` + `opacity-60`) — **2.70–2.97:1**;
- the six **timeline step labels** (`opacity-70`) — **2.65:1**.

In each case the current tier's instance is `unassessable` (it sits on a gradient) and the other five are measurable and will be gated. The fix is the same shape as Step 6's — drop or raise the opacity *and* darken the tint, because opacity alone cannot recover the ratio (see D-E). **Not an exclusion.**

Also on the watchlist: the bar's sub-label and "Selected:" label measure **4.67:1** (`slate-500` on `bg-white/60`) — passing with the least margin in the component, and the first thing to move to `slate-600` if anything tightens.

**A reusable harness already exists** in this session's scratchpad — `ribbonmeasure.mjs` composites ancestor opacity and reports `unassessable` for gradients exactly as `tests/e2e/support/contrast.ts` does. Lift its logic rather than rediscovering it.

**Expect this to fail the first time, and expect the failures to be real.** Two are predicted by the audit and should already have been fixed by Steps 6 and 7 — the dimmed tier cards (`opacity-70` took `slate-500` on white from 4.76:1 to 2.72:1) and the tier-3 solid chip. If a third appears, it belongs to Step 5's palette, not to this step. The likely candidate is `text-slate-500` on `bg-white/60`, which sits near the floor; the fix is `text-slate-600`, exactly as the header series found. **Do not add an exclusion to `contrast.ts`.**

Note what the suite still cannot see, and say so in a comment: anything whose background resolves to a gradient is returned `unassessable` (`contrast.ts:99`), which covers the tier underline and the current tier card's header; and anything on a saturated tier fill is measured but not gated, because `neutralBackground` is false. The tier-coloured text in this component is therefore **still** on the honour system, and the numbers in this plan are calculated rather than measured.

**Verify:** `npx playwright test tests/e2e/light-theme.spec.ts --project=chromium`, with the `executablePath` workaround from the working notes. Both invariants must hold: AA on reading surfaces, and light never meaningfully dimmer than dark (`PARITY_TOLERANCE = 0.5`).

---

### Step 11 — Render the ribbon while the navigator is folded

> **Gated on maintainer decision D0.** This is a behaviour change to the app's information architecture, not a chrome change. Do not dispatch without an explicit decision.

**Files:** `App.tsx`.

**Current code.** `App.tsx:482–484`:

```tsx
// Fold the syllabus navigator down to a breadcrumb the moment a question is
// chosen, and re-open it whenever the selection is cleared.
useEffect(() => {
  setIsNavExpanded(!currentPrompt);
}, [currentPrompt?.id]);
```

`App.tsx:676`: `const isNavCollapsed = !!currentPrompt && !isNavExpanded;`
`App.tsx:793`: `{!isFocusMode && !isNavCollapsed && (` … which contains `<CommandVerbHierarchy currentVerb={currentPrompt?.verb} />` at `:864`.

Net effect: choosing a question destroys the reference that explains that question's command verb. It returns only if the student presses **Change** on the breadcrumb, and it returns as a fresh mount — so `collapsedByUser` (`CommandVerbHierarchy.tsx:41`) and `isOpen` reset every time, and the "a deliberate collapse survives the next question" feature that `:36–48` documents at length cannot work.

**Target.** Move `<CommandVerbHierarchy />` out of the `!isNavCollapsed` branch so it renders whenever there is a question and Focus Mode is off — below the `SyllabusNavBar` in the collapsed state and in its current position in the expanded one. Concretely: render it once, after both branches, gated on `{!isFocusMode && currentPrompt && …}`.

**Two things must come with it or this is a regression:**

1. **It must default to shut in the collapsed-navigator state.** The point of folding the navigator is a calm page above the writing surface; a 700px reference unfolding there undoes that. Add a `defaultOpen` prop (default `true`, so the expanded-navigator behaviour is unchanged) and pass `false` from the collapsed branch — or better, key the initial `isOpen` off it. Every other disclosure in the workspace starts shut (`PanelDisclosure.tsx:6–17` explains why, and why they show a "Read" chip once opened).
2. **The remount must stop.** With the ribbon rendered from a single site it no longer unmounts on selection, so `collapsedByUser` finally does what its comment says. Verify that by hand: collapse the ribbon, change question, confirm it stays collapsed and that the selected verb has followed.

**Consider adopting `useOpenedOnce` / `PanelReadChip`** from `components/PanelDisclosure.tsx`, as `ReferenceMaterials`, `LiveInsights`, `SampleAnswersAccordion`, `Editor` and `WritingMetricsDashboard` all do — a shut panel that has been read says so. Optional; mention it in the commit either way.

**Do not touch:** the Focus Mode gate; `SyllabusNavBar`; the auto-collapse effect itself (`:482–484`) — the navigator folding is a separate, deliberate behaviour and this step is about where the ribbon lives, not about that.

**Verify:** `npm run test:all`, then by hand: select a question and confirm the ribbon is present and shut beneath the breadcrumb; expand it; change question; confirm it is still expanded and now explains the new verb; collapse it; change question; confirm it stays collapsed. Then run `npx playwright test --project=chromium` — this step adds a large block of DOM to every workspace run and `workspace-chrome.spec.ts`, `modal-scroll.spec.ts` and `evaluation-flow.spec.ts` are the regression watch.

---

### Step 12 — Changelog

**Files:** `projectDocs/changeLog.md`.

Add an `## [Unreleased] - <date>` section at the top in the existing prose style — the house voice is a short narrative explaining _why_, not a list of classes.

Cover: fifty controls inside the shut ribbon were reachable by keyboard and are now `inert`; the collapse animation no longer guesses at a height; the tier gradient came off the bar and onto a tile and a hairline, so the ribbon has a light theme; white text on a yellow fill is gone, and `solidText` — the token that existed for it all along — is used instead; the detail card stopped printing the same number twice under two names; the tier labels are derived from `tierShortLabel` rather than hand-written for the third time.

Two things worth recording explicitly, because the next reader will not rediscover them:

- **`getTierTargetBand(tier)` is `tier`, always**, and `bandColors.test.ts` pins it. Any UI that shows both is showing one number twice.
- **This component was unmounted whenever a question was selected** (`App.tsx:482`), which is why no e2e test had ever seen it — and, if Step 11 landed, that it no longer is.

---

## 4. Test plan

### Must keep passing, unchanged

| Test | Why it is at risk |
|---|---|
| `tests/unit/commandVerbHierarchy.test.tsx` — the header height lock (`:128–172`) | Pins `min-h-[60px]`, `whitespace-nowrap` on the chip and the "Selected:" label, `truncate` on the title, and identical geometry for `STATE` and `DIFFERENTIATE`. Steps 5 and 8 both edit that header; the geometry filter at `:155–160` deliberately drops colour tokens, so a colour change is safe and a padding change is not. |
| `tests/unit/commandVerbHierarchy.test.tsx:91–104` — the strip scrolls, not the page | Step 3 edits that exact call. `scrollIntoView` must still never be called; `scrollTo` must still be called. |
| `tests/unit/commandVerbHierarchy.test.tsx:71–79` — the tier header is keyboard-reachable | Finds it by `/Band 1 ceiling Remember & List/i`. Step 8 must leave `Band {n} ceiling` alone. |
| `tests/unit/bandColors.test.ts` | Pins `getBandConfig` and the tier↔band invariant. Only Step 7 may touch it, and only with D1. |
| `tests/unit/focusTrap.test.tsx` | Step 1 adopts the same `inert` pattern it pins for `AccordionSection`; that test must stay green with no edits. |
| `tests/unit/appHeaderChrome.test.tsx`, `cardHeaderHeightLock.test.tsx`, `workspacePanelChrome.test.tsx` | Different surfaces (`headerChrome`, `cardChrome`, `panelStyles`). If a change here moves any of them, the change has strayed. |
| `tests/e2e/light-theme.spec.ts` | Green today only because the ribbon is unmounted. Steps 10 and 11 change that deliberately; until then it must stay green by accident, which means Steps 1–9 must not alter `App.tsx`. |

### Must be updated

- `tests/unit/commandVerbHierarchy.test.tsx:26` — `/Reference • 6 Bands/i`. Step 8.
- **A second one the plan missed** (found during Step 3): the timeline test finds its button by `getByRole('button', { name: /Highlight band 6/i })` and asserts `/Evaluate/i` on the aria-label. Step 8 rewrites that label to `Show tier 6 verbs — Evaluate`, so it breaks too. **Step 8 should expect two failures, not one.**

### New

`tests/unit/verbRibbonChrome.test.tsx`, built up across Steps 4, 5, 6, 8 and 9:

1. **The constants are worn** — the toggle, the detail heading, a tier header, a verb chip and the strip each carry their constant. (Step 4.)
2. **§2 parity sweep** — every exported constant that sets a colour has both a light value and a `dark:` partner for the same property, with `RIBBON_TIER_TILE` the one documented exception (it sits on a solid tier fill). Copy the classifier from `tests/unit/appHeaderChrome.test.tsx:191–234`. (Step 5.)
3. **The new idiom only** — no export contains `light:`. (Step 5.)
4. **The gradient wall is gone** — no full-bleed `absolute inset-0 bg-gradient-to-r` child in the header. (Step 5.)
5. **Solid fills are paired** — a tier-3 render puts `text-yellow-900`, not `text-white`, on the current tier card header and the selected chip. (Step 6.)
6. **Focus is visible** — `RIBBON_TIER_HEADER` contains no `focus-visible:outline-none`. (Step 6.)
7. **Reachable controls are legible** — `RIBBON_TIER_CARD_DIMMED` contains `opacity-90` and no `opacity-50`. (Step 6.)
8. **§4 typography** — `RIBBON_STAT_VALUE` contains `font-mono`. (Step 8.)
9. **The strip is named** — `role="group"` with an accessible name; `snap-proximity`, not `snap-mandatory`. (Step 9.)

added to `tests/unit/commandVerbHierarchy.test.tsx`:

10. **§3 Keyboard Reach** — collapsing puts `[inert]` on the panel, that panel contains a verb chip, and re-expanding lifts it; the toggle's `aria-controls` matches the panel's `id`. (Step 1.)
11. **Case-safe lookup** — a lowercase `currentVerb` still renders the detail card. (Step 3.)
12. **Reduced motion** — with `matchMedia` reporting `reduce`, `scrollTo` is called with `behavior: 'auto'`. (Step 3.)
13. **One number, one label** — the chip says `Tier n`, the stat says `Band Cap`, and the timeline's tier-5 label is the derived `Discuss`, not the hand-written `Argue`. (Step 8.)

Mock `services/geminiService` in every render test (house rule; the current ribbon test does not need to, because the component imports nothing from it — keep it that way).

### Coverage

`vitest.config.ts` pins **63 / 59 / 57 / 62** (lines / functions / branches / statements) as a deliberate regression floor, documented in a comment there. `hsc-feature.md` §7's "70% minimum" is stale — do not quote it, and do not raise the thresholds as part of a ribbon commit.

---

## 5. Risks and open questions

**R1 — D0 is the whole ballgame.** If the ribbon stays unmounted whenever a question is selected, then Steps 5–7 and 9 improve a surface most students will never see, and the honest recommendation shrinks to Steps 1–4 and 8 (the accessibility fixes, the correctness fixes and the terminology fix — all of which are worth doing regardless). Decide D0 before dispatching Step 5, not after.

**R2 — Step 5 is the visually dramatic one and has no automated safety net.** The component has no visual-regression baseline, no e2e coverage (R1), and its two most colour-sensitive elements sit on gradients that `contrast.ts:99` refuses to assess. Verification is eyes, in both themes, with a **tier 3** verb selected and again with **no** verb selected. If a pixel baseline is ever generated for this project, this component should be in it.

**R3 — `backdrop-blur-xl` on a non-sticky element over `AnimatedBackground`.** The header rail does the same thing and is fine, but it is `sticky` and this is not, and `.clip-stable` (`index.css:436–472`) exists in this codebase because Safari's composited-layer handling has bitten it before — the ribbon already carries `clip-stable` on its root and on every tier card, which is a hint that it has been bitten here specifically. **WebKit is not installed in the development container**, so this cannot be checked locally. CI does run Mobile Safari on every pull request (`PW_FAST` trims to `chromium`, `Mobile Safari` and `supabase-chromium`), and the full five-browser matrix on every push to `main`, so the pull request will answer this — watch the E2E check rather than assuming. Fallback: `backdrop-blur-md` with a more opaque surface (`/80` light, `/60` dark).

**R4 — Step 7 is a shared-token change wearing a ribbon commit's clothes.** It fixes three surfaces at once, which is the argument for it, and it is exactly the kind of change that gets reverted six months later by someone tidying `renderUtils.ts` who does not know why band 3 is different. The mitigation is the test case with the ratio in the comment. If D1 is refused, say so in the changelog, because the failure then ships knowingly.

**R5 — The cognitive timeline is redundant and this plan does not resolve it.** *(Answered 2026-08-20 by `Plan-CognitiveSpectrum.md`: **no** — the six step buttons stay, because they are a pinned accessibility fix; the BAR became the read-only statement instead.)* Three controls select a tier (the card header, the verb chip, the timeline dot); the timeline adds six tab stops and, per A7, four "measurement ticks" that align with nothing. Deleting the step buttons is the tidier design and would undo a deliberate accessibility fix (`commandVerbHierarchy.test.tsx:106–113`), so this plan keeps them and only fixes their labels. **Open question for the maintainer:** should the timeline become a read-only progress statement with the strip as the single selection surface?

**R6 — The footer's four band-range labels are a fifth vocabulary** *(Closed 2026-08-20 by `Plan-CognitiveSpectrum.md`: the four labels are deleted; one derived cue line replaces them.)* (`Basic Recall`, `Explain & Compare`, `Analyse & Apply`, `Evaluate & Create`, `:438–449`). They describe spans across the six tiers rather than individual tiers, so `tierShortLabel` cannot derive them and renaming them is a copy decision. Left alone. Someone should decide whether four span labels and six tier labels on the same 200px-tall footer is one vocabulary too many.

**R7a — the ribbon's own detail-card Sparkles tile still hard-codes `text-white`** on `bg-gradient-to-br ${gradient}` — the same bug class as A3, and on tier 3 that is an icon at roughly 1.9:1. It was not among the three sites Step 6 was scoped to and was deliberately left. Add it to the sweep below.

**R7 — `components/ReferenceMaterials.tsx:57` has the same `text-white`-beside-`solidBg` bug** that Step 6 fixes in the ribbon. It is out of scope and it is not fixed here. It should be raised separately, along with a sweep for any other site pairing `solidBg` with a literal `text-white`.

**R8 — DesignSpec §2's tier table still contradicts `renderUtils.ts`.** Spec: Tier 3 `#f59e0b`, Tier 5 `#0ea5e9`, Tier 6 `#6366f1`. Code: `BAND_HEX` = `#eab308`, `#3b82f6`, `#a855f7`. This was flagged as A12 in `HeaderRedesignPlan.md` and deliberately not fixed there either. An agent implementing Step 5 or 7 while reading the spec may reach for the wrong hex. `bandColors.test.ts` pins the code; the spec is the thing that is wrong.

**R9 — Could not determine.** Whether `probe.tmp.mjs` / `probe2.tmp.mjs` at the repo root touch this component's markup; whether any deployment screenshot or teaching material pins the current gradient ribbon; whether `projectDocs/commandVerbs.md` (which I did not read) states anything about the tier/band vocabulary that Step 8 would contradict. **Step 8's implementing agent must read `projectDocs/commandVerbs.md` before changing any student-facing copy.**

**R10 — The `EXPLAIN` fallback introduced in Step 3 is a behaviour change with no strong evidence behind it.** `getCommandTermInfo` returns a tier-3 `EXPLAIN` stub for an unrecognised verb; today the ribbon shows nothing. Showing a plausible-looking wrong verb may be worse than showing nothing in a component whose whole job is to be authoritative about verbs. The step as written follows the rest of the app; if the maintainer would rather keep the null, use `commandTerms.get(v) ?? commandTerms.get(v.toUpperCase() as PromptVerb) ?? null` instead — the case fix without the fallback.

---

### Critical files for implementation

- `/home/user/HSC-Writing-Master/components/CommandVerbHierarchy.tsx`
- `/home/user/HSC-Writing-Master/utils/renderUtils.ts`
- `/home/user/HSC-Writing-Master/data/commandTerms.ts`
- `/home/user/HSC-Writing-Master/tests/unit/commandVerbHierarchy.test.tsx`
- `/home/user/HSC-Writing-Master/App.tsx`

Reference-only, but read before Steps 4–6: `/home/user/HSC-Writing-Master/utils/headerChrome.ts`, `/home/user/HSC-Writing-Master/tests/unit/appHeaderChrome.test.tsx` (the parity sweep to copy), and `/home/user/HSC-Writing-Master/components/ReferenceMaterials.tsx` (the `inert` + grid-rows disclosure to copy in Step 1).


---

## 6. Independent verification — outcome

An agent with no part in the implementation checked the finished branch against
DesignSpec, this plan and the running app.

**Confirmed:** §3 Keyboard Reach (50 focusable controls inside the shut panel,
**0** of them tabbable; Tab from the toggle lands outside the ribbon in both
navigator states); all three §0a decisions; §2 parity, including that the sweep's
widened alpha regex tightens rather than loosens the check; every contrast figure
reproduced independently to 2 dp; and no exclusion, threshold change or skipped
assertion in `tests/e2e/support/contrast.ts` (`git diff` against the base is
empty). 1771 unit tests, `chromium` 18/18, `supabase-chromium` 6/6.

### Open items — carried, not closed

1. **Mobile Safari is unverified locally** (R3). `backdrop-blur-xl` on a
   **non-sticky** element over `AnimatedBackground`, and whether `.clip-stable`
   still holds on the ribbon root and the six tier cards, cannot be checked here
   — WebKit is not installed. CI's `PW_FAST` matrix runs Mobile Safari on every
   pull request; **watch that check rather than assuming.** Fallback if it
   misbehaves: `backdrop-blur-md` with a more opaque surface.
2. **The detail card's Sparkles icon is still `text-white` on the tier
   gradient** (R7a) — on tier 3 roughly 2.15:1, and `contrast.ts` cannot see it
   because it is an icon, not a text node. It is the last instance of the defect
   this series' headline claim is about, sitting 40px from the tile that was
   fixed. Should be taken with R7's sweep.
3. **The strip's de-emphasis is now weak in the dark theme.** Lifting the idle
   cards from `opacity-50` to `opacity-90` was required — a control you can Tab
   to must be readable — but `scale-90` versus `scale-110` is now almost the
   only thing distinguishing the current tier, and in dark it is hard to spot.
   The contrast fix was right; the design intent it displaced was not replaced.
4. **Two `light:` classes survive in the JSX** (`light:bg-white`,
   `light:border-slate-200`). Both predate the series and are correct in effect,
   but 18 of 20 occurrences went and these two did not, so the file is not the
   clean sweep the Step 5 commit implies.
5. **The parity sweep matches by CSS property, not by variant.** A future
   `hover:` colour with no `dark:hover:` partner would pass, excused by any
   `dark:` value for the same property in the same constant. Today's pass is
   honest; the guard is weaker than it looks.
6. **`collapsedByUser` is still effectively unreachable state.** Ending the
   remount was supposed to make "a deliberate collapse survives the next
   question" work. It does not through the shipped UI: the only way to change
   question is "Change", which expands the navigator, flipping `defaultOpen` and
   resetting the flag by design. The behaviour is argued in the code and is
   probably the better one — but Step 11's acceptance criterion and its commit
   message both describe something the app does not do.
7. **The strip's auto-scroll does not re-run on resize**, so a narrow viewport
   can be left showing a tier chosen for a wide one. Pre-existing and out of
   scope; visible at 390px.
8. **Not verified at all:** print output (`print:text-yellow-900` on band 3),
   coverage thresholds (`test:all` runs without `--coverage`), behaviour with a
   real screen reader (the accessibility tree was inspected, no AT was used),
   and Firefox / desktop WebKit / Mobile Chrome.
9. **A7, R5 and R6 are closed** (2026-08-20), by the redesign in
   `projectDocs/Plan-CognitiveSpectrum.md`: the ticks that measured nothing are
   replaced by the five real tier boundaries, the four span labels by one
   derived cue line, and R5 is answered "keep the buttons, make the bar the
   read-only statement". **R9's warning was heeded** — `commandVerbs.md` was
   read before the copy changed, and it moved one word: the cue says "Band Cap",
   the wording that file and the stat tray already use, not "Ceiling". **R8
   stays open**: the spectrum takes its hexes from `BAND_HEX`, not from
   DesignSpec §2's contradicting table.
