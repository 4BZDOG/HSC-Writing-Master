# Header Redesign Plan

*HSC Writing Master — application header (`App.tsx`, inline, lines 730–899)*
*Written against DesignSpec v2.2.1. British/Australian English throughout.*

## Decisions taken by the maintainer

These settle R4, R5 and R6 below. They are binding on every step; where they
conflict with the prose further down, these win.

1. **`dark:`-first, and document it.** New header code uses light as the base
   with `dark:` carrying the override. The existing `light:` variant stays
   valid and existing components are *not* migrated. Step 4 additionally adds
   a short "which variant to use in new code" rule to DesignSpec §2, so the
   split is documented rather than accidental. (Resolves R6.)
2. **The overflow trigger is role-labelled**: `Admin tools` for system admins,
   `Teaching tools` for moderators. The e2e helper matches both with
   `/(admin|teaching) tools/i`. (Resolves R4.)
3. **Storage `Error` gets a visible warning chip.** The routine status pill is
   still deleted, but `storageStatus === 'Error'` must surface a persistent,
   unmissable chip on the header rail at every width. Data loss is the worst
   failure this app has, and burying it in a tooltip is not acceptable. Folded
   into Step 7. (Resolves R5.)

## Working notes for every remaining step

Accumulated by the agents that ran earlier steps. Each step runs with no memory
of the others, so this is the only channel between them.

- **A parity sweep now guards `utils/headerChrome.ts`.** `tests/unit/appHeaderChrome.test.tsx` iterates *every* string export and requires each unprefixed colour utility to have a `dark:` partner for the same property. Any constant a later step adds must satisfy it or be added to the `exempt` set with a stated reason. `HEADER_MENU_*`, `HEADER_TELEMETRY` and `HEADER_STORAGE_ALERT` as drafted all pass.
- **`MeshOverlay` bakes in `light:opacity-[0.06]`, and `[data-theme="light"] .x` outranks a plain utility.** A call site therefore *cannot* set its own light-theme opacity — `opacity-0` is not zero in light, it is the 0.06 residue. This is a real flaw in the component's API, not a quirk to work around: if a future series consolidates the fourteen remaining copies, fix it there by making the light opacity a prop. Do not fix it in a header commit.
- **Playwright**: `/opt/pw-browsers` holds `chromium-1194` but the installed `@playwright/test` wants `1208`, so `PLAYWRIGHT_BROWSERS_PATH` alone fails. Launch with `executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`.
- **`lint-staged` runs `prettier --write` on `*.md`**, and the `projectDocs/` files predate Prettier. The first commit to touch one reformats it wholesale (bullet markers, emphasis markers, blank lines after headings) and inflates the diff. `DesignSpec.md` has already taken this hit in Step 4; **Step 11 will take it on `changeLog.md`**. It is one-off cosmetic churn — do not fight it, and do not let it disguise the real change.
- **Locally `isCurriculumRemote()` is false**, so only five of the eight admin buttons render when the app is run by hand. Not a regression.

## Step summary

| Step | Summary |
|---|---|
| 1 | Extract the header verbatim into `components/AppHeader.tsx` — zero visual change |
| 2 | Extract `components/MeshOverlay.tsx`; migrate `App.tsx`'s local copy |
| 3 | Add `utils/headerChrome.ts` + `tests/unit/appHeaderChrome.test.tsx`; route `AppHeader` through it (classes unchanged) |
| 4 | Tokenise the bar: glass surface, light/dark pairs, brand gradient demoted to the wordmark tile, mesh, hairline |
| 5 | Collapse the 8 admin/moderator buttons into one non-modal overflow popover |
| 6 | Update the two `supabase-chromium` e2e specs to open the popover first |
| 7 | Retire the API/storage pill; keep an Error-only storage warning chip; drop the `apiStatus` prop |
| 8 | Lock the height: `h-16`, `flex-nowrap` at every width; typography tidy |
| 9 | Add a skip link and a `<main>` landmark |
| 10 | Lift the `header` exclusion in `tests/e2e/support/contrast.ts` |
| 11 | Changelog entry |

---

## 1. Audit

### Finding 1 — bypasses the token system entirely: **CONFIRMED**

`App.tsx:730–899` contains **zero** occurrences of `light:`, `dark:` or `--color-*`. Counted class usage in that range:

- `App.tsx:732` — `bg-gradient-to-r from-indigo-600 to-sky-500 opacity-100`
- `text-white` ×14, `text-white/70` ×1, `text-white/80` ×2
- `bg-white/10` ×12, `bg-white/20` ×12, `border-white/10` ×10, `border-white/20` ×1, `bg-black/20` ×1
- `App.tsx:731` — `shadow-2xl shadow-indigo-900/20`

The Focus-Mode exit pill immediately above it (`App.tsx:708–724`) *does* carry `light:bg-white/70 light:border-slate-300 light:text-slate-700`, so this is not ignorance of the idiom — the header simply never received it.

**Refined, though:** the header is not the only surface using raw white-alpha. `utils/cardChrome.ts` (`CARD_HEADER_ICON`, `CARD_HEADER_BAR`) does the same, and that is *correct* under §2 because those sit on a coloured band gradient. What is unique to the header is that **its gradient itself never responds to the theme and is derived from nothing** — not a token, not `getBandConfig`, not `BAND_HEX`.

**Bonus discovery:** `tailwind.config.js:18–24` binds `primary`, `accent`, `bg-base`, `bg-surface`, `bg-surface-elevated` as Tailwind colours. A regex sweep for `bg-surface`/`text-primary`/`border-accent` as *utility classes* across all `.tsx` returns **zero hits**. Every component instead uses the arbitrary form, e.g. `SyllabusNavBar.tsx:41` — `bg-[rgb(var(--color-bg-surface-elevated))]/50 light:bg-white backdrop-blur-xl`. The Tailwind colour aliases are dead config, and DesignSpec §1's `bg-surface/80` shorthand and hsc-feature §6's `bg-surface-inset rounded-xl` **do not compile**. New header code must use the arbitrary-value form.

### Finding 2 — spends the earned Band 6 colour on chrome: **REFUTED**

Two independent reasons.

**(a) Band 6 is not indigo — it is purple.** `utils/renderUtils.ts:227–234`:

```
BAND_HEX = { …, 5: '#3b82f6' /* blue-500 */, 6: '#a855f7' /* purple-500 */ }
```

and `getBandConfig(6)` (`renderUtils.ts:282–292`) returns `bg-purple-500/10 … text-purple-400 … from-purple-500 to-purple-400`. The editor's Mastery glow comes from `chroma` in `Editor.tsx:288–307`, which reads `getBandHex(hue)`/`getBandConfig(hue)`. **The editor never paints indigo.** The header cannot be competing with a colour the reward does not use. (DesignSpec §2's tier table — "Tier 6 Purple/Indigo `#6366f1`", "Tier 5 Blue/Sky `#0ea5e9`" — is stale relative to `renderUtils.ts`. Flagged as an extra finding below.)

**(b) `from-indigo-600 to-sky-500` is the product's brand mark, not chrome opportunism.** The same gradient appears at `LegalDocumentModal.tsx:49`, `RecalibrateSamplesModal.tsx:263`, and in its `via-indigo-500` variant at `UserAgreementModal.tsx:106` and `QuickStartModal.tsx:77`. A first-run user meets it on the charter gate, then on the quick-start guide — *then* on the header. Abolishing it in the header alone orphans the identity.

**Consequence for the direction:** "make indigo mean Band 6 again" is the wrong goal, because it already doesn't and never did. The right goal is **demote, don't abolish** — see Design decision D2.

### Finding 3 — not glassmorphism: **CONFIRMED**

`App.tsx:732` is a flat `opacity-100` gradient wall. No `backdrop-blur` on the bar (the only `backdrop-blur-xl` in the header is on the wordmark tile at `:737` and `backdrop-blur-md` on the status pill at `:830` — both on top of the opaque wall, so they blur nothing). No mesh, no noise.

Sharpest evidence: `App.tsx:133–141` defines a local `MeshOverlay` component, and `App.tsx:1075` uses it on the "Ready to Write" empty state — **in the same file, thirty lines below the header, unused by it.** `index.css:423–425` also defines a `.mesh-overlay` class that has zero call sites anywhere.

### Finding 4 — no hierarchy in the action cluster: **PARTLY CONFIRMED (worse than stated)**

The count is 8 admin/moderator buttons, not 7:

| Gate | Buttons | Lines |
|---|---|---|
| `isSystemAdmin` | Data Vault, Syllabus Audit Studio | 754–770 |
| `canModerate && isCurriculumRemote()` | Review Queue, Class Insights, Student Progress | 774–798 |
| `isSystemAdmin` | Internal Database Health, AI Usage Dashboard, Runtime AI Keys | 802–826 |

Every one of the eight carries the identical string `p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all shadow-lg border border-white/10`. Add the status pill (`:830`), help (`:848`), theme (`:855`) and profile (`:884`) and an admin on a Supabase deployment gets **12 tab stops** before any content. The `isSystemAdmin` group is also *split in two* by the moderator group, so Data Vault and Database Health — both storage tools — are four buttons apart.

### Finding 5 — the wordmark is a fifth typographic voice: **REFUTED (one half salvageable)**

`App.tsx:741` is `font-black tracking-tighter leading-none italic uppercase` in the default `font-sans`, i.e. **Inter**. It is not a fourth family, and it is not unusual: `italic uppercase` + `font-black tracking-tighter` is a house display treatment used in 20+ files, including `App.tsx:1078` ("Ready to Write") thirty lines from the empty state the header sits above. §4 names three *families*, not three weights.

The `tracking-[0.4em]` sub-label claim is also overstated: `index.css:490–492` raises `text-[10px]` to `11.5px` centrally, with a comment explaining that ~280 arbitrary micro-label call sites are floored there rather than at each site. `tracking-[0.4em]` itself appears at four other sites (`PromptGeneratorModal.tsx:322`, `ContentAuditModal.tsx:1546`, `ValidationSummary.tsx:64`, `DataManagerModal.tsx:183`).

**What survives:** `App.tsx:744` is the only place in the codebase that *jumps* tracking responsively — `tracking-[0.2em] sm:tracking-[0.4em]`. The sub-label therefore reads as a different label at different widths for no reason. Fix that one thing; leave the voice alone.

### Finding 6 — telemetry rendered in Inter, hidden when space is tightest: **CONFIRMED, and it should be deleted rather than restyled**

`App.tsx:830` — `hidden lg:flex`; `App.tsx:835` and `:842` — `text-[10px] font-black uppercase tracking-wider text-white/80`, i.e. Inter black caps for `API HEALTHY` and `Supabase Active`. §4 assigns marks, token counts and system logs to JetBrains Mono. Confirmed on both counts.

**But restyling it in mono is the wrong repair.** `components/ApiHealthIndicator.tsx` already renders API health as a persistent `role="status"` chip at `fixed bottom-4 left-4 z-[500]`, mounted unconditionally at `App.tsx:1469`, with HEALTHY / DEGRADED / BLOCKED states and error counts — strictly more information than the header dot. `components/ApiStatusIndicator.tsx` covers the blocked case with a live countdown banner. The header pill is a third rendering of the same fact.

It is also the **sole consumer of the `apiStatus` prop**: `apiStatus` is created at `App.tsx:1227`, passed at `:1445`, declared at `:151`/`:159`, and read only at `:833` and `:836`.

### Finding 7 — sticky header changes height by role and viewport: **CONFIRMED**

`App.tsx:731` `min-h-20` (a *minimum*, not a height) + `App.tsx:735` `flex flex-wrap sm:flex-nowrap … py-3 sm:py-0`. Below `sm`, the admin cluster (itself `flex-wrap`, `:751`) drops to a second row and the header grows; the inner `justify-end` cluster at `:749` is `flex-wrap` too. Because the element is `sticky top-0`, a height change reflows everything beneath it.

`utils/layoutConstants.ts:52` hard-codes `VIEWPORT_RESERVE = 180` as "room left for the app header, breadcrumb and the page margins" — a hand-tuned constant that assumes a header height the header does not guarantee.

### Finding 8 — Focus Mode unmounts the header: **CONFIRMED as fact, REFUTED as a defect**

`App.tsx:730` is `{!isFocusMode && (`. But Focus Mode is a deliberately designed distraction-free space, not a workaround:

- `App.tsx:485–487` sets `body.focus-mode`, which `index.css:99–117` uses to fade in a per-theme ambient wash;
- `App.tsx:708–724` renders a bespoke centred exit pill at `fixed top-4 left-1/2 z-[70]` — **exactly where a condensed header would be**;
- `App.tsx:903` compensates with `pt-16 sm:pt-16` only while in Focus Mode.

A condensing header in Focus Mode would collide with the exit pill and reintroduce chrome to the one mode whose purpose is its absence. **Keep the unmount.** The legitimate reading of this finding — "the header is heavy enough that the app has to remove it" — is answered by making it lighter (Steps 4–8), not by making it follow the student into Focus Mode.

### Additional findings (not on the list)

**A9 — no `<main>` landmark and no skip link, anywhere.** A repo-wide search for `<main` across `.tsx` and `.html` returns nothing; so does a search for skip-link markup or `sr-only`. `<header>` is currently the app's only landmark. With 12 header tab stops ahead of the writing surface, a keyboard user Tabs through the entire admin cluster on every page load. This is the single highest-value accessibility item in the whole redesign, and it is not in the brief.

**A10 — `MeshOverlay` is defined fifteen times.** *(Corrected during Step 2 — the original count of four was wrong by a factor of nearly four, found only because the implementing agent checked rather than trusted.)* Beyond `App.tsx:133`, `Editor.tsx:108` (the best version — takes a `color` and adds `light:opacity-[0.06]`), `CommandVerbHierarchy.tsx:12` and `admin/ContentAuditModal.tsx:74`, local copies also live in `ResetPasswordPage.tsx`, `LoadingIndicator.tsx`, `LoginPage.tsx`, `EvaluationResultModal.tsx`, `SampleAnswersAccordion.tsx`, `ManualPromptModal.tsx`, `UserProfileModal.tsx`, `DataManagerModal.tsx`, `PromptDisplay.tsx`, `ManifestImportModal.tsx` and `EvaluationDisplay.tsx`. Plus the dead `.mesh-overlay` class in `index.css:423`.

Step 2 extracts the shared component and migrates `App.tsx` only; **fourteen local copies remain**. Consolidating them is a much larger tidy than this plan implied and belongs in its own series with its own visual-regression pass — each call site passes different defaults, and several sit on coloured gradients where the light-opacity lift would be wrong.

**A11 — the e2e contrast suite deliberately cannot see the header.** `tests/e2e/support/contrast.ts:119` — `if (el.closest('header')) continue;` — documented at `:17–19` as "its gradient is painted by an absolutely-positioned child, so the text above it resolves to the page background and every reading is wrong by construction". That is a true statement about the *current* header only. Tokenising it makes the exclusion removable, which converts the whole redesign into something the suite can defend.

**A12 — DesignSpec §2's tier table contradicts `renderUtils.ts`.** Spec: Tier 5 `#0ea5e9`, Tier 6 `#6366f1`. Code: Band 5 `#3b82f6`, Band 6 `#a855f7`. `bandColors.test.ts` pins the code. The spec should be corrected, but **not in this series** — it is a separate documentation fix with its own reviewers.

**A13 — the Tailwind colour aliases are dead** (see Finding 1). Not worth removing in this series, but new code must not use them.

---

## 2. Design decisions

Standing convention for all new code in this series: **light is the base, `dark:` carries the override.** That is the Tailwind-native form and what `utils/panelStyles.ts` and `components/PdfExportOptions.tsx` already do. The `light:` variant (`tailwind.config.js:93–95`) stays valid and existing code is not migrated; the two coexist because `App.tsx:469–479` maintains both `.dark` and `[data-theme='light']`.

**D1 — The bar becomes a token glass rail.** *(§1 Studio aesthetic, §2 Light Theme Parity, §3 Layering)*

```
bg-white/80 dark:bg-[rgb(var(--color-bg-surface))]/70
backdrop-blur-2xl
border-b border-slate-200 dark:border-white/10
shadow-sm dark:shadow-lg dark:shadow-black/20
```

Content scrolls *under* a translucent surface rather than behind a wall, which is the point of §1's glassmorphism.

**D2 — The brand gradient is demoted, not abolished.** *(§1 philosophy; overrides the brief)*

`from-indigo-600 to-sky-500` moves off the 1600×80px bar and onto the **40×40px wordmark tile**. The brand survives, in proportion. This is the concrete disagreement with the brief's "indigo goes back to meaning Band 6": it never meant Band 6 (Finding 2), and removing it entirely would break continuity with four other surfaces.

**D3 — The hairline is static, not tier-derived.** *(overrides the brief)*

The brief proposes "tier/progress accent reduced to a thin hairline". I recommend against wiring the header to the current question's tier:

- the **editor already is** the tier colour (`Editor.tsx:288–307`), and
- `SyllabusNavBar.tsx:46` already paints a tier gradient stripe down its left edge.

A third simultaneous statement of the same fact, at the top of the viewport, is noise — and it reintroduces a *moving* header, which is what Finding 7 exists to stop. Use instead a fixed 1px hairline that reads as edge-lighting on glass:

```
absolute inset-x-0 bottom-0 h-px pointer-events-none
bg-gradient-to-r from-transparent via-indigo-500/40 dark:via-indigo-400/30 to-transparent
```

**D4 — Mesh at low opacity.** *(§1 Cubic Mesh Textures)* Reuse the extracted `MeshOverlay` at `opacity-[0.03]`.

**Corrected after Step 2 — the light-theme trap is not solved by `light:opacity-[0.06]`.** The shared component draws white strokes through `mix-blend-overlay`. On the dark surface that reads correctly; on Step 4's `bg-white/80` rail, 6% white blended over near-white is *nothing*, and no opacity value fixes it because the colour itself is wrong. The `color` prop is the escape hatch, and Step 4 must use it:

```tsx
{/* Two passes: white texture for the dark rail, a slate one for the light
    rail. Each is hidden in the other theme, because a single element cannot
    change the stroke colour baked into its data URI. */}
<MeshOverlay opacity="opacity-0 dark:opacity-[0.03]" />
<MeshOverlay color="%2364748b" opacity="opacity-[0.04] dark:opacity-0" />
```

Verify by eye in **both** themes before committing Step 4. If the light pass still reads as dirt rather than texture, drop it entirely and accept the mesh as a dark-theme flourish — a texture nobody can see is not worth a second DOM node. Do **not** solve it by raising opacity until something appears.

Note also that `MeshOverlay`'s root is `absolute inset-0 … z-0`. The header is `sticky`, which does establish a positioned ancestor, so `inset-0` resolves correctly against the header itself — but the inner content row must sit above `z-0` or the blend will wash over the text.

**D5 — One overflow popover for all 8 admin/moderator tools.** *(§3 Keyboard Reach)*

Non-modal, following `components/PdfExportOptions.tsx` exactly — §3 names it as *the* non-modal exemplar. `role="dialog"` with `aria-label`, **no `aria-modal`**, **no `useFocusTrap`**, portal to `document.body` at `z-[120]` (above the header's `z-[60]` and the Focus pill's `z-[70]`, below modals at `z-[500]`). Escape via a **capture-phase** `keydown` listener that calls `stopPropagation` (`PdfExportOptions.tsx:145–155` explains why this, and not `useEscapeKey`, is correct for a non-modal layer: registering another bubble-phase listener alongside the stack would fire both). Click-away on `mousedown`. Focus returns to the trigger manually on close — `useFocusTrap` does restore focus, but we must not use it here.

`role="menu"` with roving arrow-key focus was considered and rejected: it adds a keyboard contract with no user benefit over a short list of buttons, and diverges from the house pattern §3 points at.

Grouped as **Library** (Data Vault, Syllabus Audit Studio, Internal Database Health), **Moderation** (Review Queue, Class Insights, Student Progress), **AI** (Usage Dashboard, Runtime AI Keys) — fixing the split-admin-group problem in Finding 4. Item `aria-label`s and `title`s stay **byte-identical** to the current strings, because e2e selectors depend on them (Step 6).

**D6 — Only four controls stay on the rail:** overflow trigger, help, theme, profile. The theme toggle in particular **must not** move into the popover — `light-theme.spec.ts:45` finds it by `getByRole('button', { name: /switch to (light|dark) theme/i })`, and hiding it would break the entire light-theme suite.

**D7 — The status pill is deleted, not restyled.** *(§4 Telemetry, Finding 6)* API health is already covered twice over. Storage mode is genuinely useful but is not per-second telemetry — it moves to the profile control's `title` and the popover footer, rendered `font-mono text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400`. This satisfies §4's mono rule *and* Finding 6's "disappears when space is tightest", because a `title` and a popover row do not have a breakpoint.

**D8 — Fixed height, no wrapping.** *(Finding 7)* `h-16` (64px) at every width; inner row `flex-nowrap` unconditionally. Feasible only after D5 removes the wrap pressure. **Do not scroll-condense** — with `sticky top-0`, animating the height reflows content on every scroll, which is the fault Finding 7 names; the 16px saved is not worth a moving element above a writing surface.

`utils/layoutConstants.ts:52`'s `VIEWPORT_RESERVE = 180` becomes 16px conservative. Leave it: it is hand-tuned, `layoutConstants.test.ts:65–109` pins `cardHeightCap` behaviour, and being conservative is the safe direction.

**D9 — Skip link + `<main>`.** *(§3 Keyboard Reach, Finding A9)* `sr-only focus:not-sr-only` anchor as the first child of the app shell, targeting a new `<main id="main-content">` wrapping the content container at `App.tsx:900–906`.

### Light-theme parity ledger

Per §2, the question is "what is it painted on?", not "is this class dark-only?". Every white-alpha class in the current header, classified:

| Current class | Site | Sits on | Verdict |
|---|---|---|---|
| `bg-white/20`, `border-white/20` | `:737` wordmark tile | brand gradient (retained, D2) | **Leave alone** — same colour in both themes |
| `text-white` on the tile icon | `:738` | brand gradient | **Leave alone** |
| `bg-white/10 hover:bg-white/20 border-white/10` ×8 | `:757`–`:825` admin buttons | *was* gradient, becomes theme surface | **Pair required** → popover item styles |
| `bg-white/10 hover:bg-white/20` | `:852`, `:874` help + theme | becomes theme surface | **Pair required** → `HEADER_ACTION` |
| `bg-white/10 border-white/10` | `:887` profile | becomes theme surface | **Pair required** |
| `bg-black/20 border-white/10` | `:830` status pill | n/a | **Deleted** (D7) |
| `text-white` ×14, `text-white/70`, `text-white/80` | throughout | becomes theme surface | **Pair required** → `text-slate-900 dark:text-white`, `text-slate-500 dark:text-slate-400` |
| `bg-indigo-500` avatar chip | `:890` | brand-solid by intent | **Leave alone** |
| `shadow-indigo-900/20` | `:731` | n/a | **Replace** with `shadow-sm dark:shadow-lg dark:shadow-black/20` |

---

## 3. Implementation steps

Each step below is written for an agent with no memory of this document's other steps. Every step ends type-checking and test-passing. Run `npm run test:all` before each commit; do not use `--no-verify`.

---

### Step 1 — Extract the header verbatim into `components/AppHeader.tsx`

**Why first:** every later step needs stable coordinates. After this, no step needs an `App.tsx` line number.

**Files:** create `components/AppHeader.tsx`; edit `App.tsx`.

**Current code:** `App.tsx` lines 730–899 hold a `{!isFocusMode && ( <header …> … </header> )}` block inside the `AuthenticatedApp` component (declared at `App.tsx:154`). It closes over: `user`, `onUpdateUser`, `apiStatus`, `storageStatus`, `openModal`, `setIsAuditModalOpen`, `setIsReviewQueueOpen`, `setIsClassInsightsOpen`, `setIsStudentProgressOpen`, `setIsUsageDashboardOpen`, `setIsRuntimeKeyOpen`, and the module-scope imports `isSystemAdmin`, `canModerate`, `isCurriculumRemote`, `authService`, plus lucide icons `Sparkles, Database, Activity, ShieldCheck, BarChart3, LineChart, HardDrive, Gauge, KeyRound, LifeBuoy, Sun, Moon`.

**Target:**

```tsx
// components/AppHeader.tsx
import { StorageStatus } from '../utils/storageUtils';
import { ApiStatus } from '../services/geminiService';
import { User } from '../types';
import { ModalName } from '../hooks/useModalManager';

interface AppHeaderProps {
  user: User;
  onUpdateUser: (user: User) => void;
  apiStatus: ApiStatus;
  storageStatus: StorageStatus;
  openModal: (name: ModalName) => void;
  onOpenAudit: () => void;
  onOpenReviewQueue: () => void;
  onOpenClassInsights: () => void;
  onOpenStudentProgress: () => void;
  onOpenUsageDashboard: () => void;
  onOpenRuntimeKeys: () => void;
}
```

Move the JSX **unchanged**, character for character. In `App.tsx`, replace lines 730–899 with:

```tsx
{!isFocusMode && (
  <AppHeader
    user={user}
    onUpdateUser={onUpdateUser}
    apiStatus={apiStatus}
    storageStatus={storageStatus}
    openModal={openModal}
    onOpenAudit={() => setIsAuditModalOpen(true)}
    onOpenReviewQueue={() => setIsReviewQueueOpen(true)}
    onOpenClassInsights={() => setIsClassInsightsOpen(true)}
    onOpenStudentProgress={() => setIsStudentProgressOpen(true)}
    onOpenUsageDashboard={() => setIsUsageDashboardOpen(true)}
    onOpenRuntimeKeys={() => setIsRuntimeKeyOpen(true)}
  />
)}
```

The `!isFocusMode &&` guard stays in `App.tsx` (Finding 8 — this is deliberate).

**Do not touch:** the Focus-Mode exit pill (`App.tsx:708–724`), the content container and its `pt-16` compensation (`App.tsx:900–906`), any theme-toggle logic beyond relocating it, `AnimatedBackground`, `MeshOverlay`.

**Gotcha:** `hsc-feature.md` — never import from `App.tsx`. `AppHeader.tsx` must import `ApiStatus` from `services/geminiService`, `StorageStatus` from `utils/storageUtils`, `ModalName` from `hooks/useModalManager`. Prune any lucide imports in `App.tsx` that are now unused *only* by the header — check each against the rest of the file (`Sparkles` and `Database` are both used elsewhere).

**Verify:** `npm run type-check`, `npm run test:all`. Visual output must be pixel-identical.

---

### Step 2 — Extract `components/MeshOverlay.tsx`

**Files:** create `components/MeshOverlay.tsx`; edit `App.tsx`.

**Current code:** four near-duplicates exist — `App.tsx:133–141`, `Editor.tsx:108–120`, `CommandVerbHierarchy.tsx:12`, `admin/ContentAuditModal.tsx:74`. The `Editor.tsx` version is the reference: it accepts a `color` prop and adds `light:opacity-[0.06]`, which is what makes the texture visible on a white surface.

**Target:** `components/MeshOverlay.tsx` exporting a default component with the exact signature and body of `Editor.tsx:108–120` (`opacity` defaulting to `'opacity-[0.03]'`, `color` defaulting to `'%23ffffff'`). Delete `App.tsx:133–141` and import the new component; `App.tsx:1075` (`<MeshOverlay opacity="opacity-[0.05]" />`) keeps working because the defaults match.

**Do not touch:** the copies in `Editor.tsx`, `CommandVerbHierarchy.tsx`, `ContentAuditModal.tsx` — those have different call-site defaults and migrating them is a separate tidy with its own visual-regression risk. Do not delete `.mesh-overlay` from `index.css` in this step.

**Verify:** `npm run test:all`.

**Known, accepted divergence (recorded during Step 2):** "the empty state must be unchanged" cannot hold alongside "extract the `Editor.tsx` version", because the two bodies differ. `App.tsx`'s deleted copy had `transition-opacity duration-500` and **no** `light:opacity-[0.06]`; the `Editor.tsx` version has `transition-all duration-700 ease-in-out` and the light lift. So the "Ready to Write" mesh now renders faintly in the light theme where it previously did not, and fades a little slower. This is a deliberate consequence of consolidating on the better version and is left in place — it moves the empty state *towards* light-theme parity, which is the direction §2 wants. Flagged here so the Phase 3 verifier does not report it as an accident.

---

### Step 3 — `utils/headerChrome.ts` + `tests/unit/appHeaderChrome.test.tsx`

**Precedent:** `utils/cardChrome.ts` and `utils/panelStyles.ts` are the house pattern — a shared class vocabulary in `utils/`, pinned by a unit test that asserts on both the exported constants and the rendered `className`. `tests/unit/workspacePanelChrome.test.tsx` and `tests/unit/cardHeaderHeightLock.test.tsx` are the templates.

**Files:** create `utils/headerChrome.ts` and `tests/unit/appHeaderChrome.test.tsx`; edit `components/AppHeader.tsx`.

**This step changes no classes.** Lift the literal strings currently in `AppHeader.tsx` into named exports and consume them, so Step 4's diff is a diff of *values* in one file rather than of JSX. Initial exports (values copied verbatim from the current JSX):

`HEADER_BAR`, `HEADER_INNER`, `HEADER_MARK_TILE`, `HEADER_WORDMARK`, `HEADER_SUBLABEL`, `HEADER_ADMIN_BUTTON`, `HEADER_ACTION`, `HEADER_PROFILE`.

(`HEADER_TELEMETRY` is deliberately **not** in this list. Step 7 deletes the
status pill it would describe and defines the constant fresh; lifting the
doomed value here only to overwrite it there is churn.)

Each gets a comment explaining what it is painted on — that is the §2 question and it is what stops the next reader from doing a blanket find-and-replace.

**New test** (`tests/unit/appHeaderChrome.test.tsx`) — renders `AppHeader` with a mock `user` for each of `admin` / `teacher` / `user` roles and asserts:
1. the theme toggle's accessible name is exactly `Switch to dark theme` / `Switch to light theme` (the string `light-theme.spec.ts:45` depends on);
2. a `user`-role render shows none of the eight admin controls;
3. the constants are actually applied (`expect(el.className).toContain(HEADER_ACTION)`).

Mock `services/geminiService` per the house rule.

**Do not touch:** any class values. `git diff` on the rendered DOM must be empty.

---

### Step 4 — Tokenise the bar

**Files:** `utils/headerChrome.ts`, `components/AppHeader.tsx`, `tests/unit/appHeaderChrome.test.tsx`.

**Current:** after Step 3 the header's class strings live in `utils/headerChrome.ts` and the JSX reads `className={HEADER_BAR}`, not a literal. **Locate everything via the constants file — do not grep the JSX for class strings, they are no longer there.** The one exception is the full-bleed gradient div, which Step 3 deliberately left as a literal in `AppHeader.tsx` because this step deletes it: `<div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-sky-500 opacity-100" />`.

**Target:**

```ts
export const HEADER_BAR =
  'sticky top-0 z-[60] min-h-20 flex items-center ' +
  'bg-white/80 dark:bg-[rgb(var(--color-bg-surface))]/70 backdrop-blur-2xl ' +
  'border-b border-slate-200 dark:border-white/10 ' +
  'shadow-sm dark:shadow-lg dark:shadow-black/20';

/** Edge-lighting on the glass. Static by design — the tier colour is already
 *  stated by the editor and by SyllabusNavBar's stripe; a third simultaneous
 *  statement is noise, and a header that changes colour is a moving header. */
export const HEADER_HAIRLINE =
  'absolute inset-x-0 bottom-0 h-px pointer-events-none ' +
  'bg-gradient-to-r from-transparent via-indigo-500/40 dark:via-indigo-400/30 to-transparent';

/** White-alpha ON THE BRAND GRADIENT — same colour in both themes, so per
 *  DesignSpec §2 these are correct as written and take no light partner. */
export const HEADER_MARK_TILE =
  'w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-2xl bg-gradient-to-br from-indigo-600 to-sky-500 ' +
  'border border-white/20 flex items-center justify-center shadow-lg';

export const HEADER_WORDMARK =
  'text-lg sm:text-2xl font-black tracking-tighter leading-none italic uppercase ' +
  'whitespace-nowrap text-slate-900 dark:text-white';

export const HEADER_SUBLABEL =
  'block mt-1 text-[10px] font-black uppercase tracking-[0.2em] whitespace-nowrap ' +
  'text-slate-500 dark:text-slate-400';

export const HEADER_ACTION =
  'w-10 h-10 flex items-center justify-center rounded-xl transition-colors ' +
  'text-slate-500 hover:text-slate-900 hover:bg-slate-100 ' +
  'dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/10';

export const HEADER_PROFILE =
  'flex items-center gap-3 pl-3 pr-1.5 h-11 rounded-2xl transition-colors ' +
  'border border-slate-200 hover:bg-slate-100 ' +
  'dark:border-white/10 dark:hover:bg-white/10';
```

In `AppHeader.tsx`: delete the full-bleed gradient div; render `<MeshOverlay opacity="opacity-[0.03]" />` and `<div className={HEADER_HAIRLINE} aria-hidden="true" />` as the header's first children. Repoint the wordmark tile, wordmark, sub-label, help/theme buttons, profile button and admin buttons at the constants. The avatar chip (`bg-indigo-500 … text-white`) and the tile's `Sparkles` icon (`text-white`) stay as-is — both sit on solid brand colour.

Drop `sm:tracking-[0.4em]` from the sub-label (Finding 5's salvageable half).

**Do not touch:** `min-h-20` and `flex-wrap sm:flex-nowrap` — those are Step 8, after Step 5 removes the wrap pressure. Do not touch button structure or any `aria-label`/`title` string.

**Extend the test:** assert `HEADER_BAR` contains both a light and a `dark:` background; assert no export contains a bare `text-white` without a light partner *except* `HEADER_MARK_TILE` (comment the exception).

**Risk:** this is the one visually dramatic step. `backdrop-blur-2xl` on a `sticky` element over `AnimatedBackground` (`fixed inset-0 z-0`) is fine; verify by scrolling in both themes.

---

### Step 5 — Collapse the admin cluster into a non-modal overflow popover

**Files:** create `components/AppHeaderToolsMenu.tsx`; edit `components/AppHeader.tsx`, `utils/headerChrome.ts`, `tests/unit/appHeaderChrome.test.tsx`.

**Current:** `AppHeader.tsx` renders three role-gated groups totalling eight `<button>`s, each with the identical `HEADER_ADMIN_BUTTON` class, gated by `isSystemAdmin(user.role)`, `canModerate(user.role) && isCurriculumRemote()`, and `isSystemAdmin(user.role)` again.

**Target:** one trigger button on the rail, opening a portalled popover.

Trigger: `HEADER_ACTION` styling, lucide `SlidersHorizontal`, `aria-haspopup="dialog"`, `aria-expanded={open}`, `aria-controls`, `aria-label="Admin tools"` (system admin) or `"Teaching tools"` (moderator only). Rendered only when `isSystemAdmin(user.role) || canModerate(user.role)`.

Panel — **copy the mechanics from `components/PdfExportOptions.tsx` lines 88–175**, which is the pattern DesignSpec §3 names as the non-modal exemplar:
- `createPortal` to `document.body`, `className="fixed z-[120] …"`, anchored off the trigger's `getBoundingClientRect()` and clamped to the viewport;
- `role="dialog"` + `aria-label`, **and deliberately no `aria-modal`**;
- **no `useFocusTrap`** — §3: "Non-modal popovers must NOT trap. The page behind them is live and Tab is expected to move on";
- Escape via a **capture-phase** `window` `keydown` listener that calls `e.stopPropagation()` then closes — this is the codebase's own arbitration for a non-modal layer over `useEscapeKey`'s stack (`PdfExportOptions.tsx:139–156` explains why a bubble-phase listener would close this *and* whatever is beneath it);
- click-away on `mousedown`, excluding both the panel and the trigger;
- reposition on `scroll` (capture) and `resize`;
- on close, `triggerRef.current?.focus()` — restoring focus manually, because the trap that normally does it is forbidden here.

Panel styling:

```ts
export const HEADER_MENU_PANEL =
  'fixed z-[120] w-64 p-1.5 rounded-2xl shadow-2xl animate-fade-in text-left ' +
  'bg-white border border-slate-200 ' +
  'dark:bg-[rgb(var(--color-bg-surface-elevated))] dark:border-white/10';

export const HEADER_MENU_ITEM =
  'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold transition-colors ' +
  'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10';

export const HEADER_MENU_GROUP_LABEL =
  'px-3 pt-2 pb-1 text-[10px] font-black uppercase tracking-[0.2em] ' +
  'text-slate-400 dark:text-slate-500';
```

Groups: **Library** (Data Vault, Syllabus Audit Studio, Internal Database Health) · **Moderation** (Review Queue, Class Insights, Student Progress) · **AI** (AI Usage Dashboard, Runtime AI Keys). Same role gates as now; a group renders only if it has at least one visible item.

**Every item keeps its current `title` and `aria-label` byte-for-byte.** These are load-bearing e2e selectors:
- `Data Vault (Import/Export/Reorder)`
- `Syllabus Audit Studio`
- `Review Queue (approve/reject contributions)` ← matched by `button[title^="Review Queue"]`
- `Class Insights (where the cohort is struggling)` ← matched by `/class insights/i`
- `Student Progress (one student across verb groups)` ← matched by `/student progress/i`
- `Internal Database Health`
- `AI Usage Dashboard (monitor & adjust quotas)`
- `Runtime AI Keys (paste a key to test models)`

Selecting an item closes the popover, then invokes the handler.

**Do not touch:** the help, theme and profile buttons — they stay on the rail. The theme toggle in particular must remain directly clickable (`light-theme.spec.ts:45`).

**Also delete `HEADER_ADMIN_BUTTON`** from `utils/headerChrome.ts` when the eight buttons leave the rail, along with the test case asserting it dresses all eight identically. Step 4 gave it a light/dark pair purely so the light theme was not broken in the commits between Step 4 and this one; it has no reason to exist once the popover owns those items.

**This step will break `tests/unit/runtimeKeyOverride.test.ts` — expect it.**
That test source-scans for the button opening the runtime-key modal and
asserts an `isSystemAdmin` guard sits within 2000 characters above it. The
invariant matters: a runtime key lets `aiCore`'s fallbacks bypass auth, quota
and the free-tier meter. Step 1 already repointed the scan from `App.tsx` to
`components/AppHeader.tsx` with the needle `onClick={onOpenRuntimeKeys}`;
moving the button into `AppHeaderToolsMenu.tsx` invalidates it again. Repoint
the scan at the new file and keep the needle accurate. **Do not relax the
assertion, widen the character window, or delete the test** — the guard must
still be a real `isSystemAdmin` check sitting directly above the button in
whatever file now holds it. If the menu's structure puts the guard further
than 2000 characters away, that is a signal the grouping is wrong, not that
the threshold should rise.

**Two notes from Step 3 about the existing test file:**

- `tests/unit/appHeaderChrome.test.tsx` currently mocks `isCurriculumRemote` to a constant `true` at module scope. This step needs *both* branches (a `teacher` with remote off must see nothing), so convert it to a `vi.hoisted` mutable flag rather than stacking a second `vi.mock` on the same module.
- The file's `ADMIN_TOOLS` array is the canonical list of the eight load-bearing labels, in rail order. It is the cheapest place to assert the strings survive the move into the popover byte-identical — use it rather than re-typing them.

**Extend the unit test** with the §3 contract:
- the panel has `role="dialog"` and **no** `aria-modal` attribute;
- Escape closes it and focus returns to the trigger;
- Tab from the last panel item moves *out* of the panel (no trap);
- a `user`-role render shows no trigger at all;
- a `teacher` role with `isCurriculumRemote()` mocked true shows Moderation but not Library/AI.

**Note:** this step knowingly breaks two `supabase-chromium` e2e specs. Step 6 repairs them, and Steps 5 and 6 may be committed together if the orchestrator prefers a green e2e at every commit — the default e2e projects (`chromium`, `firefox`, `webkit`, mobile) `testIgnore` both specs (`playwright.config.ts:68,74,80,87,92`), so `npm run test:all` stays green either way.

---

### Step 6 — Repair the two `supabase-chromium` e2e specs

**Files:** `tests/e2e/contribution-loop.spec.ts`, `tests/e2e/class-analytics-ranking.spec.ts`.

**Current:**
- `contribution-loop.spec.ts:339–342` — `const queueButton = page.locator('button[title^="Review Queue"]'); await expect(queueButton).toBeVisible({timeout: 30_000}); await queueButton.click();` with the comment "Admin header cluster renders once the profile role maps to admin."
- `class-analytics-ranking.spec.ts:272, 302, 322, 350` — `page.getByRole('button', { name: /class insights/i }).click()` and `.../student progress/i`.

**Target:** add a shared helper (in `tests/e2e/support/workspace.ts`, alongside `signIn`/`clearOnboarding`/`openFirstQuestion`):

```ts
/** The admin/teacher tools now live behind one overflow control in the header.
 *  The wait is on the trigger, not the tool: on a Supabase run the header has
 *  no trigger at all until the profile role resolves to admin. */
export const openHeaderTool = async (page: Page, name: RegExp): Promise<void> => {
  const trigger = page.getByRole('button', { name: /(admin|teaching) tools/i });
  await expect(trigger).toBeVisible({ timeout: 30_000 });
  await trigger.click();
  await page.getByRole('button', { name }).click();
};
```

**What Step 5 left this step to inherit** *(recorded by the agent that wrote the popover)*:

- **`contribution-loop.spec.ts:339–342` is not a straight call-site swap.** Its 30-second `toBeVisible` wait is what absorbs the delay while the Supabase profile role resolves to admin. That wait must move onto the *trigger* — hence its place in the helper above. Click the trigger without it and the click races the role resolution, and the trigger will not exist yet.
- **The panel is portalled to `document.body`, outside `<header>`.** Any locator scoped to the header element will miss it.
- **Each item's visible text is now split** — short name, then the parenthetical on a second line. The `title` and `aria-label` remain the full canonical string byte-identical, so `button[title^="Review Queue"]` and `/class insights/i` still match, but **a locator matching on visible text alone will fail**, because the accessible name comes from `aria-label`.
- **Nothing else in the header matches `/(admin|teaching) tools/i`.** Step 5 deliberately omitted a close button so no second element could collide with the helper. If this step adds one, keep its label clear of both words.
- `contribution-loop.spec.ts:344` asserts a `Review Queue` *heading* after the click. The popover contributes no heading — group labels are `<div role="group">` with `aria-labelledby` — and it closes on select, so there is no ambiguity to resolve.
- **A `teacher` with `isCurriculumRemote()` false now sees no trigger at all**, not an empty menu. The plan never said what should happen to a moderator with no moderation tools; Step 5 gated the whole component on `isSystemAdmin(user.role) || (canModerate(user.role) && isCurriculumRemote())`. Since `isCurriculumRemote()` is false in local runs, an admin sees five tools by hand and a teacher sees nothing.

Replace the four call sites, and update the `contribution-loop.spec.ts` comment to say the cluster is now behind the overflow control.

**Do not touch:** `light-theme.spec.ts` — the theme toggle did not move. Do not touch any assertion about what the opened modals contain.

**Verify:** `npx playwright test --project=supabase-chromium`.

---

### Step 7 — Retire the status pill and the `apiStatus` prop

**Files:** `components/AppHeader.tsx`, `components/AppHeaderToolsMenu.tsx`, `App.tsx`, `utils/headerChrome.ts`, `tests/unit/appHeaderChrome.test.tsx`.

**Current:** `AppHeader.tsx` renders a `hidden lg:flex … bg-black/20` pill containing an animated dot + `API {apiStatus.state}` and a `Database` icon + `{storageStatus} Active`, both in `text-[10px] font-black uppercase tracking-wider text-white/80`.

**Rationale, so this is not re-litigated:** `components/ApiHealthIndicator.tsx` already renders API health unconditionally at `fixed bottom-4 left-4 z-[500]` with `role="status"` and three states (`App.tsx:1469`), and `components/ApiStatusIndicator.tsx` covers the blocked case with a countdown. The header pill is a third, less informative rendering, and it is the only reader of `apiStatus` in `AuthenticatedApp`.

**Target:**
1. Delete the pill entirely from `AppHeader.tsx` — **including the interim light/dark pairing and the `interim parity only` comment Step 4 added to it.** That pairing exists solely so the light theme is not broken in the commits between Step 4 and this one; it must not outlive the pill. Also remove the profile display-name span's interim pairing only if the span itself goes, which it does not — that one is permanent.
2. Add a storage-mode footer row to the tools popover, in mono per §4:
   ```ts
   export const HEADER_TELEMETRY =
     'font-mono text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400';
   ```
   rendered as `Storage · {storageStatus}` above a `border-t border-slate-200 dark:border-white/10` divider.
3. Append `— storage: ${storageStatus}` to the profile button's `title`, so the fact is reachable for a non-admin at every width (the `hidden lg:flex` complaint in Finding 6).
3a. **Add an Error-only storage warning chip** (maintainer decision 3). When
   `storageStatus === 'Error'` — and *only* then — render a chip on the rail,
   before the tools trigger, at every width (no `hidden lg:` breakpoint):

   ```ts
   export const HEADER_STORAGE_ALERT =
     'flex items-center gap-2 px-3 h-9 rounded-xl font-mono text-[10px] uppercase ' +
     'tracking-wider border ' +
     'bg-red-100 text-red-700 border-red-200 ' +
     'dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30';
   ```

   Content: lucide `AlertTriangle` (`w-4 h-4`, `aria-hidden`) plus the text
   `Storage error`. The chip carries `role="status"` so assistive technology
   announces it when it appears, and a `title` of
   `Your work may not be saving — open your profile to check storage`. Mono per
   §4 (it is telemetry). Because it renders only in the failure case, it costs
   nothing in the normal header and cannot be missed in the failing one.

   Unit test: `storageStatus="Error"` renders the chip with `role="status"`;
   every other `StorageStatus` value renders no chip at all.
4. Remove `apiStatus` from `AppHeaderProps` and its pass-through in `App.tsx`.
5. Remove the `apiStatus` prop from `AuthenticatedAppProps` (`App.tsx:151`), the destructure (`:159`) and the call site (`:1445`). **Keep `const apiStatus = useApiStatus()` at `App.tsx:1227`** only if something else reads it — check; if nothing does, remove it and the `useApiStatus` import too, but leave `hooks/useApiStatus.ts` alone (`ApiHealthIndicator` and `ApiStatusIndicator` both use it).

**Do not touch:** `ApiHealthIndicator.tsx`, `ApiStatusIndicator.tsx`, `hooks/useApiStatus.ts`, `services/geminiService`'s `apiMonitor`.

**Verify:** `npm run type-check` will catch any missed prop. Extend the unit test to assert the storage row uses `font-mono` and that no header element renders the string `API`.

---

### Step 8 — Lock the height

**Files:** `utils/headerChrome.ts`, `components/AppHeader.tsx`, `tests/unit/appHeaderChrome.test.tsx`.

**This is NOT a one-file change, despite what the constants suggest** *(found during Step 3)*. Step 3 lifted only the class strings the plan named; five stayed as literals in `AppHeader.tsx`'s JSX. Two of them carry `flex-wrap` and are therefore this step's business:

- the right-hand action cluster — `flex flex-wrap items-center justify-end gap-2 sm:gap-4 ml-auto`
- the admin-cluster wrapper — `flex flex-wrap items-center justify-end gap-2 sm:mr-2` (this one disappears entirely with Step 5)

Removing `flex-wrap` from `HEADER_INNER` alone will not stop the header wrapping. Grep `AppHeader.tsx` for `flex-wrap` and clear every occurrence.

**Two stale comments must die with the wrapping** *(also found during Step 3)*: the `{/* Wraps below sm so admin/moderator tool buttons drop onto their own row… */}` comment above the inner row in `AppHeader.tsx`, and the matching sentence in `HEADER_INNER`'s doc comment in `utils/headerChrome.ts`. Both describe behaviour this step deletes; leaving them is worse than never having written them.

**Current:** `HEADER_BAR` contains `min-h-20`; `HEADER_INNER` contains `py-3 sm:py-0 … flex flex-wrap sm:flex-nowrap`.

**Target:** `min-h-20` → `h-16`; `HEADER_INNER` → `h-full … flex flex-nowrap`, dropping `py-3 sm:py-0` (vertical centring now comes from `items-center` on a fixed-height box). The inner action cluster's `flex-wrap` (and the now-deleted admin cluster's) go too — after Step 5 there are exactly four controls on the right at every width, so nothing needs to wrap.

**Prerequisite:** Steps 5 and 7 must be done, or this will clip content on narrow viewports.

**The storage chip collides with the height lock, and resolving it is part of this step** *(measured live during Step 7)*. The chip is `px-3 h-9` and about **147px wide**. At a 360px viewport the header measures 117px without it and **165px with it** — so `h-16` plus `flex-nowrap` will overflow horizontally in exactly the failure case the chip exists to announce.

Maintainer decision 3 says the chip must be visible at every width, and that stands. Satisfy both by dropping the *text*, never the chip:

```
// on HEADER_STORAGE_ALERT — the icon alone carries it below `lg`
'flex items-center gap-2 px-2 lg:px-3 h-9 rounded-xl …'
// and in the JSX, the label span:
<span className="hidden lg:inline">Storage error</span>
```

> **`lg`, not `sm` — corrected after measurement.** This prescription originally said `sm`. That fixes 360px and moves the failure to 640px, where the 147px chip pushed the sub-label 52px into the action buttons (112px for an admin). The shipped code uses `lg` and the live matrix confirms the chip is 34px at both 360 and 640. The `sm` figure survived in this document for several commits while the code was already correct — noted because a plan that disagrees with the code in writing is worse than no plan.

The chip keeps `role="status"` and gains an `aria-label="Storage error — your work may not be saving"` so the announcement is unchanged when the text is hidden. A red `AlertTriangle` in a red chip is still unmissable at 360px; a 147px text chip that breaks the header layout is not an improvement on it.

**Add "storage in `Error`" as a dimension to the hand-verification matrix below.** Checking 360/640/1024/1600 × two themes × three roles while storage is healthy will pass and still ship a broken narrow header.

**Test:** assert `HEADER_BAR` contains `h-16` and **no** `min-h-`; assert `HEADER_INNER` contains `flex-nowrap` and **no** `flex-wrap` — the mirror of how `cardHeaderHeightLock.test.tsx:92–98` pins `CARD_HEADER_META_ROW`.

**Do not touch:** `utils/layoutConstants.ts`. `VIEWPORT_RESERVE = 180` becomes 16px conservative, which is the safe direction, and `layoutConstants.test.ts:65–109` pins `cardHeightCap` behaviour that must not move in a header commit.

**Verify by hand at 360px, 640px, 1024px, 1600px, in both themes, for `user`, `teacher` and `admin` — and again with `storageStatus` forced to `Error`.** The header must be exactly 64px tall in every combination, and must not overflow horizontally in any of them. The `Error` runs are the ones that will catch a mistake; the healthy runs will pass either way.

---

### Step 9 — Skip link and `<main>` landmark

**Files:** `App.tsx`, and a new assertion in `tests/unit/appHeaderChrome.test.tsx` (or a small dedicated test).

**Current:** the app has no `<main>` element anywhere (repo-wide search returns nothing) and no skip link. `<header>` is the only landmark. A keyboard user Tabs through every header control before reaching the writing surface.

**Target:** in `AuthenticatedApp`'s returned fragment, immediately before the `{!isFocusMode && <AppHeader … />}` line:

```tsx
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[200]
             focus:px-4 focus:py-2 focus:rounded-xl focus:text-xs focus:font-black
             focus:uppercase focus:tracking-widest focus:bg-white focus:text-slate-900
             focus:shadow-2xl dark:focus:bg-[rgb(var(--color-bg-surface-elevated))]
             dark:focus:text-white"
>
  Skip to main content
</a>
```

Change the content container currently at `App.tsx:900–906` from `<div className={…}>` to `<main id="main-content" tabIndex={-1} className={…}>` (and its closing tag). `tabIndex={-1}` is required or the anchor scrolls without moving focus.

`z-[200]` sits above the header (`60`) and popovers (`120`), below modals (`500`).

**Do not touch:** the container's existing `className` expression, including the `isFocusMode` ternary and `transition-[padding]` — `App.tsx:901–905` documents why `transition-all` there caused stale composited tiles.

**Note:** `sr-only`/`not-sr-only` are stock Tailwind utilities; no config change needed. `index.css` has no competing `.sr-only` rule.

---

### Step 10 — Let the contrast suite see the header

**Files:** `tests/e2e/support/contrast.ts`.

**Current:** line 119 — `if (el.closest('header')) continue;` — justified in the file header comment at lines 17–19: *"The app header is skipped entirely. Its gradient is painted by an absolutely-positioned child, so the text above it resolves to the page background and every reading is wrong by construction."*

That justification expired at Step 4: the header now paints its own background colour, and `resolveBackground` (lines 84–101) walks the compositing chain correctly through `bg-white/80` and `dark:bg-[rgb(var(--color-bg-surface))]/70`.

**Target:** delete line 119 and rewrite the comment at lines 17–19 to explain that the header is now a token surface held to the same AA floor as the rest of the app.

Two parts remain unassessed, and the comment should name both rather than implying full coverage: the **wordmark tile** (it carries an icon, not text) and the **storage-error chip** (it renders only on a storage failure, so the suite will never encounter it in a normal run). The chip's contrast is fine by calculation — `#b91c1c` on `#fee2e2` ≈ 5.9:1 — but calculated is not measured, and the comment should say so.

**Verify:** `npx playwright test tests/e2e/light-theme.spec.ts --project=chromium`. Both invariants must hold: AA on reading surfaces, and light never meaningfully dimmer than dark (`PARITY_TOLERANCE = 0.5`).

**If it fails:** the failure is real and belongs to Step 4's palette, not to this step. `text-slate-500` on `bg-white/80` is ~4.8:1 (passes at the 4.5 floor with little margin); if a reading lands short, step the sub-label and inactive icons to `text-slate-600`. Do **not** re-add the exclusion.

---

### Step 11 — Changelog

**Files:** `projectDocs/changeLog.md`.

Add a new `## [Unreleased] - <date>` section at the top, following the existing prose style — house voice is a short narrative explaining *why*, not a bullet list of classes. Cover: the header now uses the same token surface as everything else and therefore has a light theme; the brand gradient moved from a 1600px wall to a 40px tile; eight admin buttons became one menu; API status was removed because two other surfaces already show it; the header is a fixed 64px and no longer reflows the page; a skip link and `<main>` landmark now exist.

Worth recording explicitly: **indigo was never the Band 6 colour.** `BAND_HEX[6]` is `#a855f7`. The next person to read DesignSpec §2 will believe otherwise.

---

## 4. Test plan

### Must keep passing (unchanged)

| Test | Why it is at risk |
|---|---|
| `tests/e2e/light-theme.spec.ts` | Finds the theme toggle by `/switch to (light\|dark) theme/i`. The label must stay verbatim and the button must stay directly clickable — never inside the popover. |
| `tests/unit/layoutConstants.test.ts` | Pins `cardHeightCap`/`MIN_CARD_HEIGHT`. Step 8 must not touch `VIEWPORT_RESERVE`. |
| `tests/unit/cardHeaderHeightLock.test.tsx` | Concerns the two *workspace card* headers via `utils/cardChrome.ts` — a different surface. It must remain untouched; if a change here affects it, the change has strayed. |
| `tests/unit/workspacePanelChrome.test.tsx` | Same: `PANEL_SURFACE` and `CARD_HEADER_*` are out of scope. |
| `tests/unit/focusTrap.test.tsx`, `tests/unit/escapeStack.test.tsx` | The new popover must not perturb the escape stack. It registers a capture-phase listener, not a `useEscapeKey` entry — these must stay green with no edits. |
| `tests/unit/bandColors.test.ts` | Pins `getBandConfig`. Nothing in this series touches band colour. |
| `tests/e2e/workspace-chrome.spec.ts`, `modal-scroll.spec.ts`, `evaluation-flow.spec.ts`, `agreement-gate.spec.ts` | Regression watch for the height change and the new `<main>` wrapper. |

### Must be updated

- `tests/e2e/contribution-loop.spec.ts` (line 340) and `tests/e2e/class-analytics-ranking.spec.ts` (lines 272, 302, 322, 350) — Step 6. Both are `supabase-chromium`-only (`playwright.config.ts:103–111`), so `npm run test:all` will not catch the breakage; run that project explicitly.

### New

`tests/unit/appHeaderChrome.test.tsx`, built up across Steps 3, 4, 5, 7, 8:

1. **Role gating** — `user` sees no tools trigger; `teacher` + remote sees Moderation only; `admin` sees all three groups.
2. **Label stability** — the theme toggle's accessible name is exactly `Switch to dark theme` / `Switch to light theme`; all eight tool labels match the strings the e2e specs use.
3. **§3 Keyboard Reach** — panel has `role="dialog"` and **no** `aria-modal`; Escape closes and returns focus to the trigger; Tab past the last item leaves the panel.
4. **§2 parity** — every exported constant in `utils/headerChrome.ts` that sets a colour has both a light value and a `dark:` value, with `HEADER_MARK_TILE` the one documented exception (it sits on the brand gradient).
5. **§4 typography** — the storage row carries `font-mono`.
6. **Height invariant** — `HEADER_BAR` contains `h-16` and no `min-h-`; `HEADER_INNER` contains `flex-nowrap` and no `flex-wrap`.
7. **Skip link** — present, targets `#main-content`, and `<main id="main-content">` exists.

Mock `services/geminiService` in every render test (house rule). Mock `services/curriculumService`'s `isCurriculumRemote` to exercise both branches.

### Coverage

**Corrected during Step 3:** the plan's "70% floor" is wrong. `vitest.config.ts` pins **63 / 59 / 57 / 62** (lines / functions / branches / statements) as a deliberate regression floor, documented in a comment there. Do not quote 70%, and do not "helpfully" raise the thresholds as part of a header commit. Extracting ~170 lines of JSX from `App.tsx` into tested components should move the numbers up on their own.

---

## 5. Risks and open questions

**R1 — The e2e contrast suite may fail at Step 10.** `text-slate-500` on `bg-white/80` sits near the 4.5:1 floor. Mitigation: `text-slate-600`. This is why Step 10 is last — the redesign lands first, then the measurement is switched on.

**R2 — `backdrop-blur-2xl` on a sticky header, on mobile Safari.** `html`/`body` carry `overflow-x: clip` (`index.css:80–81, 91–92`) precisely to avoid a nested scroll container, and `.clip-stable` (`index.css:436–472`) exists because Safari's composited-layer handling has bitten this project before. Verify on the `Mobile Safari` Playwright project. Fallback: `backdrop-blur-xl` and a more opaque surface (`/90` light, `/85` dark).

**R3 — Losing the theme toggle's discoverability is unacceptable.** It must never enter the popover. Called out in Steps 5 and 6, and pinned by the new unit test, but worth repeating because it silently kills an entire e2e suite.

**R4 — Which label for the overflow trigger?** The proposal is `Admin tools` for `isSystemAdmin` and `Teaching tools` for moderator-only, with the e2e helper matching `/(admin|teaching) tools/i`. If a single fixed label is preferred, use `Tools` and simplify the helper — but decide before Step 5, because Step 6 encodes it.

**R5 — Should the storage mode be visible at all?** Step 7 buries it in a popover and a `title`. `StorageStatus` includes `'Error'` (`utils/storageUtils.ts:41`), which is a state a user genuinely needs to see. **Open question for the maintainer:** should `storageStatus === 'Error'` surface a persistent header warning chip? Not planned, because a real fix probably belongs with `ApiHealthIndicator`'s bottom-left cluster rather than in the header.

**R6 — `light:` vs `dark:` variants coexisting.** This series adds `dark:`-first code beside existing `light:` usages. Deliberate (see §2 preamble), but a future reader will find both. If the maintainer would rather stay on `light:`, say so before Step 4 — the constants are all in one file and the conversion is mechanical.

**R7 — The DesignSpec §2 tier table is wrong** (Finding A12). Not fixed here. Someone reading the spec while implementing Step 4 may reach for `#6366f1` as "Band 6". Steps 4 and 11 both call it out; a spec correction should be raised separately.

**R8 — Could not determine:** whether any deployment or documentation screenshot pins the current gradient header, and whether `probe.tmp.mjs` / `probe2.tmp.mjs` at the repo root touch header markup. Neither was inspected as part of this plan.

---

## 6. Independent verification — outcome

An agent with no part in the implementation checked the finished branch against
DesignSpec, this plan, and the running app. Confirmed: every maintainer
decision, §3 Keyboard Reach (tested live — a bubble-phase Escape recorder fired
zero times while the popover was open, proving it does not close what is
beneath it), §2 light parity across every remaining white-alpha class, the
`isSystemAdmin` guard on the runtime-key entry point (444 bytes above the
needle, and it is the AI group's own guard rather than the looser
component-level one), and 64px in all 48 role × theme × width × storage cells
with no overflow or overlap anywhere.

Test results at `d7ae304`: 1736 unit tests, `chromium` 18/18, `supabase-chromium`
6/6, no unexplained eager reads.

### Open items — carried, not closed

1. **Mobile Safari is unverified, and this is the largest one.** Plan risk R2 —
   `backdrop-blur-2xl` on a `sticky` header — was never checked on WebKit,
   because WebKit is not installed in the development container (only Chromium
   is). `index.css`'s `overflow-x: clip` and the `.clip-stable` rules exist
   precisely because Safari's compositing has bitten this project before.
   **Run `--project=webkit` and `--project="Mobile Safari"` before merging.**
   The fallback if it misbehaves is `backdrop-blur-xl` with a more opaque
   surface (`/90` light, `/85` dark).
2. **The storage chip's contrast is calculated, never measured** (≈5.9:1 for
   `#b91c1c` on `#fee2e2`). The e2e contrast suite cannot reach it, because it
   only renders when storage has failed.
3. **The dark mesh is barely perceptible either.** The light pass was dropped
   because it moved the rail by one luminance level; verification found the
   *dark* pass moves it by only one or two. It is honest texture rather than
   decoration, but §1's "tactile depth" is doing very little work here, and a
   future pass might reasonably drop it altogether.
4. **The sub-label has ~0.2 of contrast margin** (4.68–4.72:1 against a 4.5
   floor). It passes, and nothing more. Any future change to the light rail's
   opacity or the slate ramp will eat it — `text-slate-600` is the fix.
5. **Not verified against a real Supabase deployment.** `isCurriculumRemote()`
   is false locally, so the Moderation group never rendered and the narrow-width
   matrix was measured with five tools rather than eight. The rail's control
   count is identical either way, so this is expected to hold, but it is
   inference rather than measurement.
6. **Two `text-white` values live in JSX, documented in prose but pinned by no
   test** — the tile's icon and the avatar chip. Both are correct today because
   both sit on solid brand colour; moving the avatar off indigo would not be
   caught by the parity sweep, which only iterates `headerChrome.ts`.
7. **Print styles (§5), high-contrast mode and `prefers-reduced-motion`** were
   untouched by this series and unexamined against the glass rail.
